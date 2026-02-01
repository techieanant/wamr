import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  WASocket,
  Browsers,
  proto,
  jidDecode,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { logger } from '../../config/logger.js';
import { env } from '../../config/environment.js';
import { hashingService } from '../encryption/hashing.service.js';
import { whatsappConnectionRepository } from '../../repositories/whatsapp-connection.repository.js';
import type { WhatsAppConnectionStatus } from '../../models/whatsapp-connection.model.js';

/**
 * WhatsApp client service using Baileys
 * Manages WhatsApp connection, session persistence, and event handling
 */
class WhatsAppClientService {
  private sock: WASocket | null = null;
  private isInitializing = false;
  private hasCalledReady = false;
  private initializationTimeout: NodeJS.Timeout | null = null;
  private qrCodeCallback: ((qr: string) => void) | null = null;
  private messageCallback: ((message: proto.IWebMessageInfo) => void) | null = null;
  private readyCallback: (() => void) | null = null;
  private disconnectedCallback: (() => void) | null = null;
  private saveCreds: (() => Promise<void>) | null = null;

  /**
   * Initialize WhatsApp client
   */
  async initialize(): Promise<void> {
    if (this.sock || this.isInitializing) {
      logger.warn('WhatsApp client already initialized or initializing', {
        hasSock: !!this.sock,
        isInitializing: this.isInitializing,
      });
      return;
    }

    this.isInitializing = true;
    logger.info('Setting isInitializing=true, starting WhatsApp client initialization...');

    // Emit loading status to UI
    const { webSocketService, SocketEvents } = await import('../websocket/websocket.service.js');
    webSocketService.emit(SocketEvents.STATUS_CHANGE, { status: 'loading' });

    // Check if session files exist before initialization
    try {
      const fs = await import('fs/promises');
      const sessionPath = env.WHATSAPP_SESSION_PATH;

      try {
        const credsPath = `${sessionPath}/creds.json`;
        await fs.stat(credsPath);
        logger.info(
          { credsPath, exists: true },
          'Existing session credentials found, will attempt to restore'
        );
      } catch {
        logger.info(
          { sessionPath, exists: false },
          'No existing session found, will need QR code scan'
        );
      }
    } catch (err) {
      logger.warn({ error: err }, 'Failed to check session directory');
    }

    try {
      logger.debug(
        {
          sessionPath: env.WHATSAPP_SESSION_PATH,
          nodeEnv: process.env.NODE_ENV,
        },
        'Creating WhatsApp socket with Baileys'
      );

      // Load authentication state
      const { state, saveCreds } = await useMultiFileAuthState(env.WHATSAPP_SESSION_PATH);
      this.saveCreds = saveCreds;

      // Create socket
      this.sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // We'll handle QR display ourselves
        browser: Browsers.ubuntu('WAMR'),
        syncFullHistory: false,
        markOnlineOnConnect: true,
        // Baileys doesn't need Puppeteer - it uses WebSockets directly
      });

      logger.debug('WhatsApp Socket instance created, setting up event handlers...');
      this.setupEventHandlers();

      // Set a timeout for initialization (60 seconds)
      this.initializationTimeout = setTimeout(async () => {
        if (this.isInitializing && !this.isReady()) {
          logger.error(
            'WhatsApp initialization timeout - session restoration appears to have failed'
          );
          await this.clearSessionAndRestart();
        }
      }, 60000);

      logger.info('WhatsApp socket initialized, waiting for connection...');
    } catch (error) {
      const errorDetails = {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        type: error instanceof Error ? error.constructor.name : typeof error,
        error: error,
      };
      logger.error(errorDetails, 'Failed to initialize WhatsApp client');
      this.isInitializing = false;
      this.sock = null;
      throw error;
    }
  }

  /**
   * Setup event handlers for Baileys socket
   */
  private setupEventHandlers(): void {
    if (!this.sock) return;

    // Connection updates (QR code, connection status, etc.)
    this.sock.ev.on('connection.update', async (update) => {
      try {
        const { connection, lastDisconnect, qr } = update;

        // Handle QR code
        if (qr) {
          logger.info('QR code generated');

          // Clear initialization timeout since we got a QR code (socket is working)
          if (this.initializationTimeout) {
            clearTimeout(this.initializationTimeout);
            this.initializationTimeout = null;
          }

          // Update connection status
          await this.updateConnectionStatus('CONNECTING');

          // Emit status update via WebSocket
          const { qrCodeEmitterService } = await import('./qr-code-emitter.service.js');
          qrCodeEmitterService.emitConnectionStatus('connecting');

          // Store QR generation timestamp
          const connections = await whatsappConnectionRepository.findAll();
          if (connections.length > 0) {
            await whatsappConnectionRepository.update(connections[0].id, {
              qrCodeGeneratedAt: new Date(),
            });
          }

          // Emit QR code to connected clients via callback
          if (this.qrCodeCallback) {
            this.qrCodeCallback(qr);
          }
        }

        // Handle connection open (ready)
        if (connection === 'open') {
          logger.info('WhatsApp connection opened - client is ready');
          this.isInitializing = false;

          // Clear initialization timeout since we're connected
          if (this.initializationTimeout) {
            clearTimeout(this.initializationTimeout);
            this.initializationTimeout = null;
          }

          // Get connected phone number
          let phoneNumber = 'unknown';
          try {
            const user = this.sock?.user;
            if (user?.id) {
              const decoded = jidDecode(user.id);
              if (decoded?.user) {
                phoneNumber = decoded.user;
              }
            }
          } catch (err) {
            logger.warn({ error: err }, 'Could not decode phone number from user ID');
          }

          const phoneHash = await hashingService.hashPhoneNumber(phoneNumber);

          // Update connection status
          await whatsappConnectionRepository.upsert({
            phoneNumberHash: phoneHash,
            status: 'CONNECTED',
            lastConnectedAt: new Date(),
          });

          logger.info({ phoneHash }, 'WhatsApp connected');

          // Emit status update via WebSocket
          const { qrCodeEmitterService } = await import('./qr-code-emitter.service.js');
          qrCodeEmitterService.emitConnectionStatus('connected', phoneNumber);

          // Notify via callback ONLY ONCE per connection session
          if (this.readyCallback && !this.hasCalledReady) {
            this.hasCalledReady = true;
            logger.debug('Calling ready callback for the first time');
            this.readyCallback();
          }
        }

        // Handle connection close (disconnected)
        if (connection === 'close') {
          const shouldReconnect =
            (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
          const reason = lastDisconnect?.error?.message || 'Unknown reason';

          logger.warn({ reason, shouldReconnect }, 'WhatsApp disconnected');

          // Reset ready flag so callback can be called again on next connection
          this.hasCalledReady = false;

          await this.updateConnectionStatus('DISCONNECTED');

          // Emit status update via WebSocket
          const { qrCodeEmitterService } = await import('./qr-code-emitter.service.js');
          qrCodeEmitterService.emitConnectionStatus('disconnected');

          // Notify via callback
          if (this.disconnectedCallback) {
            this.disconnectedCallback();
          }

          // Attempt automatic reconnection if not logged out
          if (shouldReconnect) {
            logger.info('Scheduling automatic reconnection in 5 seconds...');
            setTimeout(async () => {
              try {
                logger.info('Attempting automatic reconnection...');
                this.isInitializing = false;
                this.sock = null;
                await this.initialize();
                logger.info('Automatic reconnection initiated');
              } catch (reconnectError) {
                logger.error({ error: reconnectError }, 'Failed to reconnect automatically');
              }
            }, 5000);
          } else {
            logger.info('Logout detected, not attempting automatic reconnection');
            this.isInitializing = false;
            this.sock = null;
          }
        }
      } catch (error) {
        logger.error({ error }, 'Error handling connection update');
      }
    });

    // Credentials update - save them automatically
    this.sock.ev.on('creds.update', async () => {
      try {
        if (this.saveCreds) {
          await this.saveCreds();
          logger.debug('Credentials saved');
        }
      } catch (error) {
        logger.error({ error }, 'Error saving credentials');
      }
    });

    // Messages upsert (new messages)
    this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
      try {
        for (const message of messages) {
          // Skip messages from self
          if (message.key.fromMe) continue;

          // Only process notify messages (new messages)
          if (type !== 'notify') continue;

          // Get chat to check if it's a group
          const remoteJid = message.key.remoteJid;
          if (!remoteJid) continue;

          // Skip group messages
          if (remoteJid.endsWith('@g.us')) {
            logger.debug({ remoteJid }, 'Skipping group message');
            continue;
          }

          logger.debug({ from: remoteJid }, 'Message received');

          // Forward to message callback
          if (this.messageCallback) {
            this.messageCallback(message);
          }
        }
      } catch (error) {
        logger.error({ error }, 'Error handling messages.upsert event');
      }
    });
  }

  /**
   * Update connection status in database
   */
  private async updateConnectionStatus(status: WhatsAppConnectionStatus): Promise<void> {
    logger.info({ status }, 'Updating connection status in database');
    const connections = await whatsappConnectionRepository.findAll();

    if (connections.length > 0) {
      logger.info(
        { id: connections[0].id, oldStatus: connections[0].status, newStatus: status },
        'Updating existing connection record'
      );
      const updated = await whatsappConnectionRepository.update(connections[0].id, { status });

      if (updated) {
        logger.info(
          { id: updated.id, status: updated.status, updatedAt: updated.updatedAt },
          'Connection status updated successfully in database'
        );
      } else {
        logger.error(
          { id: connections[0].id },
          'Failed to update connection status - no record returned'
        );
      }
    } else {
      logger.warn('No connection records found to update');
    }
  }

  /**
   * Send message to phone number
   */
  async sendMessage(phoneNumber: string, message: string): Promise<void> {
    if (!this.sock || !this.isReady()) {
      throw new Error('WhatsApp client is not ready');
    }

    try {
      // Format phone number for WhatsApp Baileys (remove non-digits, add @s.whatsapp.net suffix)
      const chatId = `${phoneNumber.replace(/\D/g, '')}@s.whatsapp.net`;

      await this.sock.sendMessage(chatId, { text: message });
      logger.info({ phoneNumber: phoneNumber.slice(-4) }, 'Message sent');
    } catch (error) {
      logger.error({ error }, 'Failed to send message');
      throw error;
    }
  }

  /**
   * Check if client is ready (authenticated and connected)
   */
  isReady(): boolean {
    return this.sock?.user !== undefined && this.sock?.user !== null;
  }

  /**
   * Check if client is currently initializing
   */
  isClientInitializing(): boolean {
    return this.isInitializing;
  }

  /**
   * Get masked phone number of connected account
   */
  getPhoneNumber(): string | null {
    if (!this.sock?.user?.id) {
      return null;
    }
    const decoded = jidDecode(this.sock.user.id);
    return decoded?.user || null;
  }

  /**
   * Get connection status
   */
  async getStatus(): Promise<WhatsAppConnectionStatus> {
    const connection = await whatsappConnectionRepository.getActive();
    return connection?.status || 'DISCONNECTED';
  }

  /**
   * Disconnect from WhatsApp
   */
  async disconnect(): Promise<void> {
    try {
      logger.info('disconnect() called', {
        hasSock: !!this.sock,
        isInitializing: this.isInitializing,
        stackTrace: new Error().stack,
      });

      // Clear initialization timeout
      if (this.initializationTimeout) {
        clearTimeout(this.initializationTimeout);
        this.initializationTimeout = null;
      }

      if (this.sock) {
        logger.info('Disconnecting WhatsApp socket...');
        // Remove all event listeners before closing
        this.sock.ev.removeAllListeners();
        await this.sock.end(undefined);
        this.sock = null;
        this.isInitializing = false;
        logger.info('WhatsApp socket closed');
      } else {
        logger.warn('No WhatsApp socket to disconnect (updating status anyway)');
      }

      // DO NOT delete session files here - we want sessions to persist for automatic reconnection
      logger.info('Session files preserved for automatic reconnection');

      // Always update database status to DISCONNECTED
      await this.updateConnectionStatus('DISCONNECTED');

      // Notify disconnected callback to emit WebSocket event
      if (this.disconnectedCallback) {
        this.disconnectedCallback();
      }

      logger.info('WhatsApp disconnected - status updated to DISCONNECTED');
    } catch (error) {
      logger.error({ error }, 'Error disconnecting WhatsApp client');
      throw error;
    }
  }

  /**
   * Clear failed session and restart with fresh QR code
   * Called when session restoration fails or times out
   */
  private async clearSessionAndRestart(): Promise<void> {
    try {
      logger.info('Clearing failed session and restarting with fresh QR code...');

      // Clear timeout if it exists
      if (this.initializationTimeout) {
        clearTimeout(this.initializationTimeout);
        this.initializationTimeout = null;
      }

      // Close existing socket if any
      if (this.sock) {
        try {
          this.sock.ev.removeAllListeners();
          await this.sock.end(undefined);
        } catch (err) {
          logger.warn({ err }, 'Error closing socket during session clear');
        }
        this.sock = null;
      }

      this.isInitializing = false;

      // Wait for socket to fully close
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Delete session files
      const sessionPath = env.WHATSAPP_SESSION_PATH;
      const fs = await import('fs/promises');

      try {
        await fs.rm(sessionPath, { recursive: true, force: true });
        logger.info({ sessionPath }, 'Deleted failed session directory');
      } catch (err) {
        logger.warn({ err, sessionPath }, 'Failed to delete session directory (may not exist)');
      }

      // Wait a bit more before reinitializing
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Emit disconnected status
      const { qrCodeEmitterService } = await import('./qr-code-emitter.service.js');
      qrCodeEmitterService.emitConnectionStatus('disconnected');

      // Reinitialize to get fresh QR code
      logger.info('Reinitializing WhatsApp socket for fresh QR code...');
      await this.initialize();
    } catch (error) {
      logger.error({ error }, 'Error clearing session and restarting');
      this.isInitializing = false;

      // Emit error status to frontend
      const { qrCodeEmitterService } = await import('./qr-code-emitter.service.js');
      qrCodeEmitterService.emitConnectionStatus('disconnected');
    }
  }

  /**
   * Logout and delete session files (explicit user logout)
   */
  async logout(): Promise<void> {
    try {
      logger.info('logout() called - will disconnect and clear session');

      // First disconnect the socket
      await this.disconnect();

      // Wait for socket to fully release resources
      logger.info('Waiting for socket to release resources...');
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Then delete session files
      const sessionPath = env.WHATSAPP_SESSION_PATH;
      const fs = await import('fs/promises');

      // Try multiple times with exponential backoff if busy
      let attempts = 0;
      const maxAttempts = 5;

      while (attempts < maxAttempts) {
        try {
          await fs.rm(sessionPath, { recursive: true, force: true });
          logger.info('WhatsApp session files deleted after logout');
          break;
        } catch (err: any) {
          attempts++;

          if (err.code === 'EBUSY' && attempts < maxAttempts) {
            const waitTime = Math.pow(2, attempts) * 500;
            logger.info(
              { attempt: attempts, maxAttempts, waitTime },
              'Session directory busy, retrying after delay...'
            );
            await new Promise((resolve) => setTimeout(resolve, waitTime));
          } else if (attempts >= maxAttempts) {
            logger.error(
              { err, attempts },
              'Failed to delete session files after multiple attempts - will try on next restart'
            );
            break;
          } else {
            logger.warn({ err }, 'Failed to delete session files (may not exist)');
            break;
          }
        }
      }
    } catch (error) {
      logger.error({ error }, 'Error during logout');
      throw error;
    }
  }

  /**
   * Register callback for QR code events
   */
  onQRCode(callback: (qr: string) => void): void {
    this.qrCodeCallback = callback;
  }

  /**
   * Register callback for message events
   */
  onMessage(callback: (message: proto.IWebMessageInfo) => void): void {
    this.messageCallback = callback;
  }

  /**
   * Register callback for ready event
   */
  onReady(callback: () => void): void {
    this.readyCallback = callback;
  }

  /**
   * Register callback for disconnected event
   */
  onDisconnected(callback: () => void): void {
    this.disconnectedCallback = callback;
  }

  /**
   * Get socket instance (for advanced usage)
   */
  getClient(): WASocket | null {
    return this.sock;
  }

  /**
   * Check if WhatsApp is currently connected
   */
  isConnected(): boolean {
    if (!this.sock) {
      return false;
    }

    try {
      return !!this.sock.user?.id;
    } catch (error) {
      logger.debug({ error }, 'Error checking WhatsApp connection state');
      return false;
    }
  }

  /**
   * Clear WhatsApp session data and prepare for fresh QR code scan
   * This is useful when the session becomes corrupted or after library updates
   */
  async clearSession(): Promise<void> {
    try {
      logger.info('Clearing WhatsApp session data...');

      // Clear timeout if it exists
      if (this.initializationTimeout) {
        clearTimeout(this.initializationTimeout);
        this.initializationTimeout = null;
      }

      // Close existing socket if any
      if (this.sock) {
        try {
          logger.info('Closing existing WhatsApp socket...');
          this.sock.ev.removeAllListeners();
          await this.sock.end(undefined);
        } catch (err) {
          logger.warn({ err }, 'Error closing socket during session clear');
        }
        this.sock = null;
      }

      this.isInitializing = false;
      this.hasCalledReady = false;

      // Wait for socket to fully close
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Delete session files
      const sessionPath = env.WHATSAPP_SESSION_PATH;
      const fs = await import('fs/promises');

      try {
        await fs.rm(sessionPath, { recursive: true, force: true });
        logger.info({ sessionPath }, 'Deleted WhatsApp session directory');
      } catch (err) {
        logger.warn({ err, sessionPath }, 'Failed to delete session directory (may not exist)');
      }

      // Update database status
      await this.updateConnectionStatus('DISCONNECTED');

      // Emit disconnected status
      const { qrCodeEmitterService } = await import('./qr-code-emitter.service.js');
      qrCodeEmitterService.emitConnectionStatus('disconnected');

      logger.info('WhatsApp session cleared successfully');
    } catch (error) {
      logger.error({ error }, 'Error clearing WhatsApp session');
      throw error;
    }
  }
}

export const whatsappClientService = new WhatsAppClientService();
