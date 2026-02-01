/**
 * WhatsApp Message Handler Service
 *
 * Processes incoming WhatsApp messages and routes them to the conversation service.
 * Handles message parsing, phone number hashing, and response sending.
 */

import type { proto } from '@whiskeysockets/baileys';
import { jidDecode } from '@whiskeysockets/baileys';
import { logger } from '../../config/logger';
import { hashingService } from '../encryption/hashing.service';
import { conversationService } from '../conversation/conversation.service';
import { whatsappClientService } from './whatsapp-client.service';
import { whatsappConnectionRepository } from '../../repositories/whatsapp-connection.repository';
import { conversationSessionRepository } from '../../repositories/conversation-session.repository';
import { adminNotificationService } from '../notifications/admin-notification.service';

/**
 * Service for handling incoming WhatsApp messages
 */
class MessageHandlerService {
  /**
   * Initialize message handler
   * Registers message callback with WhatsApp client
   */
  initialize(): void {
    logger.info('Initializing WhatsApp message handler');

    whatsappClientService.onMessage((message) => {
      this.handleIncomingMessage(message).catch((error) => {
        logger.error('Error handling incoming message', { error });
      });
    });

    logger.info('WhatsApp message handler initialized');
  }

  /**
   * Check if message should be processed based on filter configuration
   * Returns { shouldProcess, cleanedMessage }
   */
  private async shouldProcessMessage(
    message: string,
    phoneNumberHash: string
  ): Promise<{ shouldProcess: boolean; cleanedMessage: string }> {
    try {
      // Check if user has an active session in interactive state
      // If so, bypass filter to allow selection responses
      const session = await conversationSessionRepository.findByPhoneHash(phoneNumberHash);
      if (
        session &&
        [
          'AWAITING_SELECTION',
          'AWAITING_SEASON_SELECTION',
          'AWAITING_CONFIRMATION',
          'PROCESSING',
        ].includes(session.state)
      ) {
        logger.debug('Bypassing filter for interactive session', {
          state: session.state,
          phoneHash: phoneNumberHash.slice(-4),
        });
        return { shouldProcess: true, cleanedMessage: message };
      }

      // Get current connection and filter config
      const connections = await whatsappConnectionRepository.findAll();

      if (connections.length === 0 || !connections[0].filterType) {
        // No filter configured, process all messages
        return { shouldProcess: true, cleanedMessage: message };
      }

      const { filterType, filterValue } = connections[0];

      if (!filterValue) {
        // No filter value set, process all messages
        return { shouldProcess: true, cleanedMessage: message };
      }

      if (filterType === 'prefix') {
        // Check if message starts with prefix (case-sensitive)
        if (!message.startsWith(filterValue)) {
          logger.debug('Message filtered: missing prefix', {
            prefix: filterValue,
            messageStart: message.substring(0, 10),
          });
          return { shouldProcess: false, cleanedMessage: message };
        }

        // Strip prefix from message
        const cleaned = message.slice(filterValue.length).trim();
        logger.debug('Message prefix stripped', {
          prefix: filterValue,
          original: message.substring(0, 20),
          cleaned: cleaned.substring(0, 20),
        });
        return { shouldProcess: true, cleanedMessage: cleaned };
      }

      if (filterType === 'keyword') {
        // Check if message contains keyword (case-insensitive)
        const lowerMessage = message.toLowerCase();
        const lowerKeyword = filterValue.toLowerCase();
        const hasKeyword = lowerMessage.includes(lowerKeyword);

        if (!hasKeyword) {
          logger.debug('Message filtered: missing keyword', {
            keyword: filterValue,
          });
          return { shouldProcess: false, cleanedMessage: message };
        }

        // Remove keyword from message (case-insensitive)
        const keywordIndex = lowerMessage.indexOf(lowerKeyword);
        const cleaned = (
          message.substring(0, keywordIndex) + message.substring(keywordIndex + filterValue.length)
        ).trim();

        logger.debug('Message keyword removed', {
          keyword: filterValue,
          original: message.substring(0, 20),
          cleaned: cleaned.substring(0, 20),
        });

        return { shouldProcess: true, cleanedMessage: cleaned };
      }

      // Unknown filter type, process message
      return { shouldProcess: true, cleanedMessage: message };
    } catch (error) {
      logger.error({ err: error }, 'Error checking message filter');
      // On error, allow message through
      return { shouldProcess: true, cleanedMessage: message };
    }
  }

  /**
   * Handle incoming WhatsApp message
   */
  private async handleIncomingMessage(message: proto.IWebMessageInfo): Promise<void> {
    try {
      // Extract phone number from message
      const phoneNumber = this.extractPhoneNumber(message);
      if (!phoneNumber) {
        logger.warn('Could not extract phone number from message', {
          from: message.key.remoteJid,
        });
        return;
      }

      // Extract contact name from message (pushName)
      const contactName = message.pushName || null;

      // Extract message body
      const messageBody = this.extractMessageText(message);
      if (!messageBody) {
        logger.debug('Received empty message, ignoring', {
          from: message.key.remoteJid,
        });
        return;
      }

      logger.info('Processing message', {
        phoneNumber: phoneNumber.slice(-4),
        contactName: contactName || 'Unknown',
        messageLength: messageBody.length,
      });

      // Check if this is an admin reply for approve/decline/delete actions
      try {
        const adminReplyResult = await adminNotificationService.processAdminReply(
          phoneNumber,
          messageBody
        );

        if (adminReplyResult.handled) {
          // This was an admin command, send the response
          if (adminReplyResult.response) {
            await this.sendResponse(phoneNumber, adminReplyResult.response);
          }
          logger.info(
            { phoneNumber: phoneNumber.slice(-4), command: messageBody },
            'Processed admin notification reply'
          );
          return;
        }
      } catch (adminError) {
        logger.error({ error: adminError }, 'Error processing admin reply');
        // Continue with normal message processing
      }

      // Hash phone number for database storage
      const phoneNumberHash = hashingService.hashPhoneNumber(phoneNumber);

      // Check if message should be processed based on filter configuration
      const { shouldProcess, cleanedMessage } = await this.shouldProcessMessage(
        messageBody,
        phoneNumberHash
      );

      if (!shouldProcess) {
        // Silently ignore filtered messages
        return;
      }

      // Process message through conversation service (use cleaned message)
      const response = await conversationService.processMessage(
        phoneNumberHash,
        cleanedMessage,
        phoneNumber,
        contactName
      );

      // Send response back to user
      if (response.message) {
        await this.sendResponse(phoneNumber, response.message);
      }

      logger.info('Message processed successfully', {
        phoneNumber: phoneNumber.slice(-4),
        contactName: contactName || 'Unknown',
        state: response.state,
      });
    } catch (error) {
      logger.error({ err: error, from: message.key.remoteJid }, 'Failed to handle incoming message');

      // Try to send error message to user
      try {
        const phoneNumber = this.extractPhoneNumber(message);
        if (phoneNumber) {
          await this.sendResponse(
            phoneNumber,
            '❌ Sorry, something went wrong. Please try again later.'
          );
        }
      } catch (sendError) {
        logger.error({ err: sendError }, 'Failed to send error message');
      }
    }
  }

  /**
   * Extract text content from Baileys message
   */
  private extractMessageText(message: proto.IWebMessageInfo): string | null {
    try {
      // Try conversation (simple text message)
      if (message.message?.conversation) {
        return message.message.conversation.trim();
      }

      // Try extendedTextMessage (text with formatting, replies, etc.)
      if (message.message?.extendedTextMessage?.text) {
        return message.message.extendedTextMessage.text.trim();
      }

      // Try imageMessage caption
      if (message.message?.imageMessage?.caption) {
        return message.message.imageMessage.caption.trim();
      }

      // Try videoMessage caption
      if (message.message?.videoMessage?.caption) {
        return message.message.videoMessage.caption.trim();
      }

      return null;
    } catch (error) {
      logger.error('Error extracting message text', { error });
      return null;
    }
  }

  /**
   * Extract phone number from Baileys message
   * Returns phone number in E.164 format (e.g., +1234567890)
   */
  private extractPhoneNumber(message: proto.IWebMessageInfo): string | null {
    try {
      // Message.key.remoteJid format: "1234567890@s.whatsapp.net"
      const remoteJid = message.key.remoteJid;
      if (!remoteJid) {
        return null;
      }

      // Use jidDecode to extract phone number
      const decoded = jidDecode(remoteJid);
      if (!decoded?.user) {
        return null;
      }

      const phoneNumber = decoded.user;

      // Add + prefix if not present (E.164 format)
      return phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
    } catch (error) {
      logger.error('Error extracting phone number', { error, jid: message.key.remoteJid });
      return null;
    }
  }

  /**
   * Send response message to user
   */
  private async sendResponse(phoneNumber: string, message: string): Promise<void> {
    try {
      await whatsappClientService.sendMessage(phoneNumber, message);

      logger.debug('Response sent', {
        phoneNumber: phoneNumber.slice(-4),
        messageLength: message.length,
      });
    } catch (error) {
      logger.error('Failed to send response', {
        error,
        phoneNumber: phoneNumber.slice(-4),
      });
      throw error;
    }
  }

  /**
   * Check if message handler is ready
   */
  isReady(): boolean {
    return whatsappClientService.isReady();
  }
}

// Export singleton instance
export const messageHandlerService = new MessageHandlerService();
