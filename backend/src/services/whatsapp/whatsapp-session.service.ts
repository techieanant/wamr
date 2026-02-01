import fs from 'fs';
import path from 'path';
import { logger } from '../../config/logger.js';
import { env } from '../../config/environment.js';
import { whatsappClientService } from './whatsapp-client.service.js';
import { whatsappConnectionRepository } from '../../repositories/whatsapp-connection.repository.js';

/**
 * WhatsApp session initialization service
 * Handles session persistence, file permissions, and auto-reconnection
 */
class WhatsAppSessionService {
  private sessionPath: string;

  constructor() {
    this.sessionPath = env.WHATSAPP_SESSION_PATH;
  }

  /**
   * Initialize WhatsApp session on server startup
   * Checks if session exists and attempts auto-reconnection
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing WhatsApp session service...');

      // Create session directory if it doesn't exist
      await this.ensureSessionDirectory();

      // Set secure file permissions (chmod 700)
      await this.setSecurePermissions();

      // Check if session exists
      const hasSession = await this.hasExistingSession();

      if (hasSession) {
        logger.info('Existing WhatsApp session found, attempting auto-reconnect...');

        // Auto-connect with existing session
        await whatsappClientService.initialize();

        logger.info('WhatsApp auto-reconnection initiated');
      } else {
        logger.info('No existing WhatsApp session found. Admin must connect via QR code.');

        // Ensure database status is DISCONNECTED if no session exists
        // This handles cases where status was left as CONNECTING after server restart
        const connections = await whatsappConnectionRepository.findAll();
        if (connections.length > 0) {
          const currentStatus = connections[0].status;
          if (currentStatus === 'CONNECTING' || currentStatus === 'CONNECTED') {
            logger.info(
              { oldStatus: currentStatus },
              'Resetting database status to DISCONNECTED (no session files found)'
            );
            await whatsappConnectionRepository.update(connections[0].id, {
              status: 'DISCONNECTED',
            });

            // Emit WebSocket event to update frontend
            try {
              const { qrCodeEmitterService } = await import('./qr-code-emitter.service.js');
              qrCodeEmitterService.emitConnectionStatus('disconnected');
              logger.info('Emitted disconnected status to frontend');
            } catch (emitError) {
              logger.warn({ error: emitError }, 'Failed to emit disconnect status to frontend');
            }
          }
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to initialize WhatsApp session service');
      // Don't throw - app should continue even if WhatsApp fails to initialize
    }
  }

  /**
   * Ensure session directory exists
   */
  private async ensureSessionDirectory(): Promise<void> {
    try {
      if (!fs.existsSync(this.sessionPath)) {
        fs.mkdirSync(this.sessionPath, { recursive: true });
        logger.info({ path: this.sessionPath }, 'Created WhatsApp session directory');
      }
    } catch (error) {
      logger.error({ error, path: this.sessionPath }, 'Failed to create session directory');
      throw error;
    }
  }

  /**
   * Set secure file permissions on session directory (chmod 700)
   * Only owner can read/write/execute
   */
  private async setSecurePermissions(): Promise<void> {
    try {
      // Skip on Windows (doesn't support chmod)
      if (process.platform === 'win32') {
        logger.debug('Skipping chmod on Windows platform');
        return;
      }

      // Set permissions: rwx------  (700)
      fs.chmodSync(this.sessionPath, 0o700);
      logger.debug(
        { path: this.sessionPath },
        'Set secure permissions (chmod 700) on session directory'
      );
    } catch (error) {
      logger.warn({ error, path: this.sessionPath }, 'Failed to set secure permissions');
      // Don't throw - this is a security best practice but not critical
    }
  }

  /**
   * Check if an existing session exists
   * Baileys stores credentials in creds.json file
   */
  private async hasExistingSession(): Promise<boolean> {
    try {
      if (!fs.existsSync(this.sessionPath)) {
        return false;
      }

      // Check if directory has creds.json (Baileys stores auth in this file)
      const credsPath = path.join(this.sessionPath, 'creds.json');
      
      if (fs.existsSync(credsPath)) {
        logger.debug({ credsPath }, 'Found creds.json file');
        return true;
      }

      return false;
    } catch (error) {
      logger.error({ error }, 'Failed to check for existing session');
      return false;
    }
  }

  /**
   * Clear session data (logout)
   */
  async clearSession(): Promise<void> {
    try {
      if (fs.existsSync(this.sessionPath)) {
        // Remove all files in session directory
        const files = fs.readdirSync(this.sessionPath);
        for (const file of files) {
          const filePath = path.join(this.sessionPath, file);
          fs.rmSync(filePath, { recursive: true, force: true });
        }
        logger.info('Cleared WhatsApp session data');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to clear session data');
      throw error;
    }
  }
}

export const whatsappSessionService = new WhatsAppSessionService();
