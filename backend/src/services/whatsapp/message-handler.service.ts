/**
 * WhatsApp Message Handler Service
 *
 * Processes incoming WhatsApp messages and routes them to the conversation service.
 * Handles message parsing, phone number hashing, and response sending.
 */

import type { BaileysMessage } from './whatsapp-client.service';
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
  private async handleIncomingMessage(message: BaileysMessage): Promise<void> {
    try {
      // Debug: Log raw message key details including alternative JID
      logger.info(
        {
          rawJid: message.key.remoteJid,
          remoteJidAlt: message.key.remoteJidAlt,
          participant: message.key.participant,
          participantAlt: message.key.participantAlt,
          fromMe: message.key.fromMe,
          id: message.key.id,
        },
        '📱 DEBUG: Raw incoming message key'
      );

      // For groups, reply to the group JID; sender identity comes from participant
      const isGroup = message.key.remoteJid?.endsWith('@g.us');
      const senderJid = isGroup ? (message.key.participant ?? message.key.remoteJid) : null;

      // Extract full JID for sending responses (group = reply in group, 1:1 = reply to chat)
      const fullJid = this.extractFullJid(message);

      // Extract phone number - use participant JID for groups so we identify the sender
      const phoneNumber = this.extractPhoneNumber(message, senderJid);
      const userIdentifier = phoneNumber || this.extractUserIdentifier(message, senderJid);

      logger.info(
        {
          fullJid,
          phoneNumber,
          userIdentifier,
          userIdLength: userIdentifier?.length,
        },
        '📱 DEBUG: Extracted JID, phone number and user identifier'
      );

      if (!fullJid || !userIdentifier) {
        logger.warn('Could not extract JID from message', {
          from: message.key.remoteJid,
        });
        return;
      }

      // Extract contact name from message (pushName in Baileys)
      const contactName = message.pushName || null;

      // Extract message body - Baileys stores text in different places
      const messageBody = this.extractMessageBody(message);
      if (!messageBody) {
        logger.debug('Received empty message, ignoring', {
          from: message.key.remoteJid,
        });
        return;
      }

      logger.info('Processing message', {
        userIdentifier: userIdentifier.slice(-4),
        phoneNumber: phoneNumber ? phoneNumber.slice(-4) : 'N/A',
        contactName: contactName || 'Unknown',
        messageLength: messageBody.length,
      });

      // Check if this is an admin reply for approve/decline/delete actions
      // Pass actual phone number for admin check (not LID)
      try {
        // Use phone number if available, otherwise fall back to userIdentifier
        const adminCheckNumber = phoneNumber || userIdentifier;
        const adminReplyResult = await adminNotificationService.processAdminReply(
          adminCheckNumber,
          messageBody
        );

        if (adminReplyResult.handled) {
          // This was an admin command, send the response using full JID
          if (adminReplyResult.response) {
            await this.sendResponse(fullJid, adminReplyResult.response);
          }
          logger.info(
            { userIdentifier: userIdentifier.slice(-4), command: messageBody },
            'Processed admin notification reply'
          );
          return;
        }
      } catch (adminError) {
        logger.error({ error: adminError }, 'Error processing admin reply');
        // Continue with normal message processing
      }

      // Hash phone number for database storage (use actual phone if available for consistent hashing)
      const phoneNumberHash = hashingService.hashPhoneNumber(phoneNumber || userIdentifier);

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
      // Pass:
      // - phoneNumberHash: for session lookup (computed from phone number or LID)
      // - cleanedMessage: the message text
      // - fullJid: for sending responses (preserves @lid or @s.whatsapp.net)
      // - contactName: display name
      // - phoneNumber: actual phone number for storage (if available)
      const response = await conversationService.processMessage(
        phoneNumberHash,
        cleanedMessage,
        fullJid, // Full JID for sending responses
        contactName,
        phoneNumber || undefined // Actual phone number for storage (may be null if LID-only)
      );

      // Send response back to user using full JID
      if (response.message) {
        await this.sendResponse(fullJid, response.message);
      }

      logger.info('Message processed successfully', {
        userIdentifier: userIdentifier.slice(-4),
        contactName: contactName || 'Unknown',
        state: response.state,
      });
    } catch (error) {
      logger.error(
        { err: error, from: message.key.remoteJid },
        'Failed to handle incoming message'
      );

      // Try to send error message to user
      try {
        const fullJid = this.extractFullJid(message);
        if (fullJid) {
          await this.sendResponse(
            fullJid,
            '❌ Sorry, something went wrong. Please try again later.'
          );
        }
      } catch (sendError) {
        logger.error({ err: sendError }, 'Failed to send error message');
      }
    }
  }

  /**
   * Extract message body text from Baileys message
   * Baileys stores text in different places depending on message type
   */
  private extractMessageBody(message: BaileysMessage): string | null {
    if (!message.message) return null;

    // Try to get text from different message types
    const text =
      message.message.conversation ||
      message.message.extendedTextMessage?.text ||
      message.message.imageMessage?.caption ||
      message.message.videoMessage?.caption ||
      message.message.documentMessage?.caption ||
      null;

    return text?.trim() || null;
  }

  /**
   * Extract the full JID from WhatsApp message for sending responses
   * In Baileys v7+, this could be either @s.whatsapp.net (PN) or @lid (LID) format
   * We must use the SAME format when responding
   */
  private extractFullJid(message: BaileysMessage): string | null {
    const remoteJid = message.key.remoteJid;
    if (!remoteJid) {
      return null;
    }
    return remoteJid;
  }

  /**
   * Extract actual phone number from message
   * In Baileys v7+, if message comes from @lid, the actual phone number is in remoteJidAlt (or participantAlt for groups)
   * When senderJid is set (e.g. group participant), use it instead of remoteJid for sender identity
   */
  private extractPhoneNumber(
    message: BaileysMessage,
    senderJidOverride?: string | null
  ): string | null {
    try {
      const remoteJid = senderJidOverride ?? message.key.remoteJid;
      const remoteJidAlt = senderJidOverride
        ? message.key.participantAlt
        : message.key.remoteJidAlt;

      if (remoteJid?.endsWith('@lid') && remoteJidAlt?.endsWith('@s.whatsapp.net')) {
        const decoded = jidDecode(remoteJidAlt);
        if (decoded?.user) {
          logger.debug(
            { lidJid: remoteJid, pnJid: remoteJidAlt, phoneNumber: decoded.user },
            'Extracted phone number from alt JID'
          );
          return `+${decoded.user}`;
        }
      }

      if (remoteJid?.endsWith('@s.whatsapp.net')) {
        const decoded = jidDecode(remoteJid);
        if (decoded?.user) return `+${decoded.user}`;
      }

      return null;
    } catch (error) {
      logger.error('Error extracting phone number', { error, from: message.key.remoteJid });
      return null;
    }
  }

  /**
   * Extract user identifier from WhatsApp message for hashing/session management
   * When senderJidOverride is set (e.g. group participant), use it for sender identity
   */
  private extractUserIdentifier(
    message: BaileysMessage,
    senderJidOverride?: string | null
  ): string | null {
    try {
      const remoteJid = senderJidOverride ?? message.key.remoteJid;
      if (!remoteJid) return null;

      const decoded = jidDecode(remoteJid);
      if (!decoded?.user) {
        const match = remoteJid.match(/^([^@]+)@/);
        return match ? match[1] : null;
      }
      return decoded.user;
    } catch (error) {
      logger.error('Error extracting user identifier', { error, from: message.key.remoteJid });
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
