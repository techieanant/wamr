/**
 * WhatsApp Message Handler Service
 *
 * Processes incoming WhatsApp messages and routes them to the conversation service.
 * Handles message parsing, phone number hashing, and response sending.
 */

import type { Message } from 'whatsapp-web.js';
import { logger } from '../../config/logger';
import { hashingService } from '../encryption/hashing.service';
import { conversationService } from '../conversation/conversation.service';
import { whatsappClientService } from './whatsapp-client.service';
import { whatsappConnectionRepository } from '../../repositories/whatsapp-connection.repository';
import { conversationSessionRepository } from '../../repositories/conversation-session.repository';

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
  private async handleIncomingMessage(message: Message): Promise<void> {
    try {
      // Extract phone number from message
      const phoneNumber = this.extractPhoneNumber(message);
      if (!phoneNumber) {
        logger.warn('Could not extract phone number from message', {
          from: message.from,
        });
        return;
      }

      // Extract message body
      const messageBody = message.body?.trim();
      if (!messageBody) {
        logger.debug('Received empty message, ignoring', {
          from: message.from,
        });
        return;
      }

      logger.info('Processing message', {
        phoneNumber: phoneNumber.slice(-4),
        messageLength: messageBody.length,
      });

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
        phoneNumber
      );

      // Send response back to user
      if (response.message) {
        await this.sendResponse(phoneNumber, response.message);
      }

      logger.info('Message processed successfully', {
        phoneNumber: phoneNumber.slice(-4),
        state: response.state,
      });
    } catch (error) {
      logger.error({ err: error, from: message.from }, 'Failed to handle incoming message');

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
   * Extract phone number from WhatsApp message
   * Returns phone number in E.164 format (e.g., +1234567890)
   */
  private extractPhoneNumber(message: Message): string | null {
    try {
      // Message.from format: "1234567890@c.us"
      const from = message.from;
      if (!from) {
        return null;
      }

      // Extract phone number part (before @c.us)
      const phoneNumber = from.split('@')[0];
      if (!phoneNumber) {
        return null;
      }

      // Add + prefix if not present (E.164 format)
      return phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
    } catch (error) {
      logger.error('Error extracting phone number', { error, from: message.from });
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
