import * as baileys from '@whiskeysockets/baileys';
import type { proto } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';

// Baileys v7.x exports
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const makeWASocket = (baileys.default || baileys.makeWASocket) as typeof baileys.makeWASocket;
const { DisconnectReason, useMultiFileAuthState, jidDecode } = baileys;
type WASocket = ReturnType<typeof makeWASocket>;
import { logger } from '../../config/logger.js';
import { env } from '../../config/environment.js';
import { hashingService } from '../encryption/hashing.service.js';
import { whatsappConnectionRepository } from '../../repositories/whatsapp-connection.repository.js';
import type { WhatsAppConnectionStatus } from '../../models/whatsapp-connection.model.js';

/**
 * Baileys message type (simplified for our use case)
 * In Baileys v7+, messages can come from LID (@lid) or PN (@s.whatsapp.net)
 * remoteJidAlt contains the alternative JID (PN if primary is LID, or vice versa)
 */
export interface BaileysMessage {
  key: proto.IMessageKey & {
    remoteJidAlt?: string; // Alternative JID (PN if LID, LID if PN)
    participantAlt?: string; // Alternative participant (for groups)
  };
  message: proto.IMessage | null | undefined;
  messageTimestamp: number | bigint | null | undefined;
  pushName?: string | null;
}

/**
 * WhatsApp Web client service
 * Wraps @whiskeysockets/baileys with session persistence and event handling
 */
class WhatsAppClientService {
  private sock: WASocket | null = null;
  private isInitializing = false;
  private hasCalledReady = false; // Track if ready callback has been called for current connection
  private initializationTimeout: NodeJS.Timeout | null = null;
  private qrCodeCallback: ((qr: string) => void) | null = null;
  private messageCallback: ((message: BaileysMessage) => void) | null = null;
  private readyCallback: (() => void) | null = null;
  private disconnectedCallback: (() => void) | null = null;
  private saveCreds: (() => Promise<void>) | null = null;

  /**
   * Initialize WhatsApp client
   */
  async initialize(): Promise<void> {
    if (this.sock || this.isInitializing) {
      logger.warn('WhatsApp client already initialized or initializing', {
        hasClient: !!this.sock,
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
      const credsPath = `${sessionPath}/creds.json`;

      try {
        await fs.stat(credsPath);
        logger.info(
          { credsPath, exists: true },
          'Existing session credentials found, will attempt to restore'
        );
      } catch {
        logger.info(
          { credsPath, exists: false },
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
        'Creating WhatsApp client with Baileys configuration'
      );

      // Initialize multi-file auth state
      const { state, saveCreds } = await useMultiFileAuthState(env.WHATSAPP_SESSION_PATH);
      this.saveCreds = saveCreds;

      // Create Baileys socket
      this.sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // We'll handle QR code ourselves via WebSocket
        browser: ['WAMR', 'Chrome', '1.0.0'],
        syncFullHistory: false,
        markOnlineOnConnect: true,
        // Disable auto-retry to handle reconnection manually
        retryRequestDelayMs: 2000,
      });

      logger.debug('WhatsApp Baileys socket instance created, setting up event handlers...');
      this.setupEventHandlers();

      // Set a timeout for initialization (60 seconds)
      // If client doesn't connect within this time, assume restoration failed
      this.initializationTimeout = setTimeout(async () => {
        if (this.isInitializing && !this.isReady()) {
          logger.error(
            'WhatsApp initialization timeout - session restoration appears to have failed'
          );
          await this.clearSessionAndRestart();
        }
      }, 60000); // 60 second timeout

      logger.info('WhatsApp Baileys client initialization started, waiting for connection...');
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
   * Setup event handlers for Baileys
   */
  private setupEventHandlers(): void {
    if (!this.sock) return;

    // Connection update event (handles QR, ready, disconnected states)
    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // Handle QR code generation
      if (qr) {
        logger.info('QR code generated');

        // Clear initialization timeout since we got a QR code (client is working)
        if (this.initializationTimeout) {
          clearTimeout(this.initializationTimeout);
          this.initializationTimeout = null;
        }

        try {
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
        } catch (error) {
          logger.error({ error }, 'Error handling QR code event');
        }
      }

      // Handle connection open (ready)
      if (connection === 'open') {
        logger.info('WhatsApp client is ready (connection open)');
        this.isInitializing = false;

        // Clear initialization timeout
        if (this.initializationTimeout) {
          clearTimeout(this.initializationTimeout);
          this.initializationTimeout = null;
        }

        try {
          // Get connected phone number from socket user
          let phoneNumber = 'unknown';

          if (this.sock?.user?.id) {
            // Extract phone number from JID (format: 1234567890:123@s.whatsapp.net)
            const decoded = jidDecode(this.sock.user.id);
            if (decoded?.user) {
              phoneNumber = decoded.user;
            }
          }

          if (phoneNumber === 'unknown') {
            logger.warn('Could not retrieve phone number from socket user, using fallback');
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
          } else {
            logger.debug('Skipping ready callback (already called for this session)');
          }
        } catch (error) {
          logger.error({ error }, 'Error handling connection open event');
        }
      }

      // Handle connection close (disconnected)
      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        logger.warn(
          { statusCode, shouldReconnect, error: lastDisconnect?.error?.message },
          'WhatsApp disconnected'
        );

        try {
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

          // Attempt automatic reconnection after a short delay (unless it was a manual logout)
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
        } catch (error) {
          logger.error({ error }, 'Error handling disconnected event');
        }
      }
    });

    // Credentials update event - save credentials when they change
    this.sock.ev.on('creds.update', async () => {
      logger.debug('Credentials updated, saving...');
      if (this.saveCreds) {
        await this.saveCreds();
        logger.debug('Credentials saved successfully');
      }
    });

    // Message received event
    this.sock.ev.on('messages.upsert', async (event) => {
      try {
        const connections = await whatsappConnectionRepository.findAll();
        const conn = connections[0];
        const processFromSelf = conn?.processFromSelf ?? false;
        const processGroups = conn?.processGroups ?? false;

        for (const message of event.messages) {
          const remoteJid = message.key.remoteJid;
          const fromMe = message.key.fromMe;
          const isGroup = remoteJid?.endsWith('@g.us') ?? false;
          const isBroadcast = remoteJid === 'status@broadcast';

          if (fromMe && !processFromSelf) continue;
          if ((isGroup || isBroadcast) && !processGroups) continue;
          if (!remoteJid) continue;

          logger.debug({ from: remoteJid }, 'Message received');

          if (this.messageCallback) {
            this.messageCallback(message as BaileysMessage);
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
   * Send message to a recipient
   * @param recipient - Can be a full JID (user@lid, user@s.whatsapp.net), phone number (+1234567890), or user ID
   */
  async sendMessage(recipient: string, message: string): Promise<void> {
    if (!this.sock || !this.isReady()) {
      throw new Error('WhatsApp client is not ready');
    }

    try {
      let jid: string;

      // Check if recipient is already a full JID (contains @)
      if (recipient.includes('@')) {
        // Use the JID as-is (preserves @lid or @s.whatsapp.net)
        jid = recipient;
      } else {
        // Recipient is a phone number or user ID - format as @s.whatsapp.net
        const cleanRecipient = recipient.replace(/^\+/, '').replace(/\D/g, '');
        jid = `${cleanRecipient}@s.whatsapp.net`;
      }

      logger.debug(
        {
          originalRecipient: recipient,
          jid,
          messageLength: message.length,
        },
        'Sending message via Baileys'
      );

      const result = await this.sock.sendMessage(jid, { text: message });
      logger.info(
        { recipient: recipient.slice(-4), messageId: result?.key?.id },
        'Message sent successfully'
      );
    } catch (error) {
      logger.error({ error, recipient: recipient.slice(-4) }, 'Failed to send message');
      throw error;
    }
  }

  /**
   * Check if client is ready (authenticated and connected)
   */
  isReady(): boolean {
    return this.sock?.user !== undefined;
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
    // Extract phone number from JID
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
        hasClient: !!this.sock,
        isInitializing: this.isInitializing,
        stackTrace: new Error().stack,
      });

      // Clear initialization timeout
      if (this.initializationTimeout) {
        clearTimeout(this.initializationTimeout);
        this.initializationTimeout = null;
      }

      if (this.sock) {
        logger.info('Disconnecting WhatsApp client...');
        // End the socket connection
        this.sock.end(undefined);
        this.sock = null;
        this.isInitializing = false;
        logger.info('WhatsApp client disconnected');
      } else {
        logger.warn('No WhatsApp client to disconnect (updating status anyway)');
      }

      // DO NOT delete session files here - we want sessions to persist for automatic reconnection
      // Sessions should only be deleted on explicit logout via the logout() method
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

      // End existing socket if any
      if (this.sock) {
        try {
          this.sock.end(undefined);
        } catch (err) {
          logger.warn({ err }, 'Error ending socket during session clear');
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
      logger.info('Reinitializing WhatsApp client for fresh QR code...');
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

      // First disconnect the client
      await this.disconnect();

      // Wait for socket to fully release file locks (2 seconds)
      logger.info('Waiting for socket to release file locks...');
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

          // If resource is busy and we have attempts left, wait and retry
          if (err.code === 'EBUSY' && attempts < maxAttempts) {
            const waitTime = Math.pow(2, attempts) * 500; // 500ms, 1s, 2s, 4s
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
            // Don't throw, just log - the session will be cleaned up on next restart
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
  onMessage(callback: (message: BaileysMessage) => void): void {
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
      // Check if we have a user (authenticated)
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

      // End existing socket if any
      if (this.sock) {
        try {
          logger.info('Ending existing WhatsApp socket...');
          this.sock.end(undefined);
        } catch (err) {
          logger.warn({ err }, 'Error ending socket during session clear');
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
