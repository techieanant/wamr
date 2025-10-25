import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import type { Message } from 'whatsapp-web.js';
import { logger } from '../../config/logger.js';
import { env } from '../../config/environment.js';
import { hashingService } from '../encryption/hashing.service.js';
import { whatsappConnectionRepository } from '../../repositories/whatsapp-connection.repository.js';
import type { WhatsAppConnectionStatus } from '../../models/whatsapp-connection.model.js';

/**
 * WhatsApp Web client service
 * Wraps whatsapp-web.js with session persistence and event handling
 */
class WhatsAppClientService {
  private client: InstanceType<typeof Client> | null = null;
  private isInitializing = false;
  private qrCodeCallback: ((qr: string) => void) | null = null;
  private messageCallback: ((message: Message) => void) | null = null;
  private readyCallback: (() => void) | null = null;
  private disconnectedCallback: (() => void) | null = null;

  /**
   * Initialize WhatsApp client
   */
  async initialize(): Promise<void> {
    if (this.client || this.isInitializing) {
      logger.warn('WhatsApp client already initialized or initializing', {
        hasClient: !!this.client,
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
      const sessionClientPath = `${sessionPath}/session-wamr-admin`;

      try {
        await fs.stat(sessionClientPath);
        logger.info(
          { sessionClientPath, exists: true },
          'Existing session directory found, will attempt to restore'
        );
      } catch {
        logger.info(
          { sessionClientPath, exists: false },
          'No existing session found, will need QR code scan'
        );
      }
    } catch (err) {
      logger.warn({ error: err }, 'Failed to check session directory');
    }

    try {
      this.client = new Client({
        authStrategy: new LocalAuth({
          dataPath: env.WHATSAPP_SESSION_PATH,
          clientId: 'wamr-admin', // Add explicit client ID for session persistence
        }),
        puppeteer: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
          ],
        },
      });

      this.setupEventHandlers();

      await this.client.initialize();
      logger.info('WhatsApp client.initialize() completed, waiting for ready event...');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize WhatsApp client');
      this.isInitializing = false;
      this.client = null;
      throw error;
    }
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    if (!this.client) return;

    // Loading screen event (track initialization progress)
    this.client.on('loading_screen', async (percent: number, message: string) => {
      logger.info(`WhatsApp client loading: ${percent}% - ${message}`);

      // Emit loading progress to UI
      const { webSocketService, SocketEvents } = await import('../websocket/websocket.service.js');
      webSocketService.emit(SocketEvents.STATUS_CHANGE, {
        status: 'loading',
        progress: percent,
        message,
      });
    });

    // Change state event (track connection state changes)
    this.client.on('change_state', async (state: string) => {
      logger.info(`WhatsApp client state changed: ${state}`);

      // Emit state change to UI
      const { webSocketService, SocketEvents } = await import('../websocket/websocket.service.js');
      webSocketService.emit(SocketEvents.STATUS_CHANGE, {
        status: 'loading',
        state,
      });
    });

    // QR Code generation
    this.client.on('qr', async (qr: string) => {
      logger.info('QR code generated');

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
    });

    // Ready event (authenticated and connected)
    this.client.on('ready', async () => {
      logger.info('WhatsApp client is ready');
      this.isInitializing = false; // Reset flag on successful connection

      try {
        // Get connected phone number
        const info = this.client!.info;
        const phoneNumber = info?.wid?.user || 'unknown';
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

        // Notify via callback
        if (this.readyCallback) {
          this.readyCallback();
        }
      } catch (error) {
        logger.error({ error }, 'Error handling ready event');
      }
    });

    // Authenticated event
    this.client.on('authenticated', () => {
      logger.info('WhatsApp authenticated - session will be saved');
    });

    // Remote session saved - indicates session was successfully persisted
    this.client.on('remote_session_saved', () => {
      logger.info('WhatsApp remote session saved successfully');
    });

    // Authentication failure
    this.client.on('auth_failure', (error: Error) => {
      logger.error({ error }, 'WhatsApp authentication failed');
      this.updateConnectionStatus('DISCONNECTED').catch((err) => {
        logger.error({ error: err }, 'Failed to update connection status');
      });
    });

    // Disconnected event
    this.client.on('disconnected', async (reason: string) => {
      logger.warn({ reason }, 'WhatsApp disconnected');

      try {
        await this.updateConnectionStatus('DISCONNECTED');

        // Emit status update via WebSocket
        const { qrCodeEmitterService } = await import('./qr-code-emitter.service.js');
        qrCodeEmitterService.emitConnectionStatus('disconnected');

        // Notify via callback
        if (this.disconnectedCallback) {
          this.disconnectedCallback();
        }

        // Attempt automatic reconnection after a short delay (unless it was a manual logout)
        if (reason !== 'LOGOUT') {
          logger.info('Scheduling automatic reconnection in 5 seconds...');
          setTimeout(async () => {
            try {
              logger.info('Attempting automatic reconnection...');
              this.isInitializing = false; // Reset the flag
              this.client = null; // Clear the client reference
              await this.initialize(); // Reinitialize the client
              logger.info('Automatic reconnection initiated');
            } catch (reconnectError) {
              logger.error({ error: reconnectError }, 'Failed to reconnect automatically');
            }
          }, 5000);
        } else {
          logger.info('Logout detected, not attempting automatic reconnection');
          this.isInitializing = false;
          this.client = null;
        }
      } catch (error) {
        logger.error({ error }, 'Error handling disconnected event');
      }
    });

    // Message received
    this.client.on('message', async (message: Message) => {
      try {
        // Only process messages from users (not from groups or status)
        const chat = await message.getChat();
        if (!chat.isGroup) {
          logger.debug({ from: message.from }, 'Message received');

          // Forward to message callback
          if (this.messageCallback) {
            this.messageCallback(message);
          }
        }
      } catch (error) {
        logger.error({ error }, 'Error handling message event');
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
    if (!this.client || !this.isReady()) {
      throw new Error('WhatsApp client is not ready');
    }

    try {
      // Format phone number for WhatsApp (remove non-digits, add @c.us suffix)
      const chatId = `${phoneNumber.replace(/\D/g, '')}@c.us`;

      await this.client.sendMessage(chatId, message);
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
    return this.client?.info !== undefined;
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
    if (!this.client?.info?.wid?.user) {
      return null;
    }
    return this.client.info.wid.user;
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
        hasClient: !!this.client,
        isInitializing: this.isInitializing,
        stackTrace: new Error().stack,
      });

      if (this.client) {
        logger.info('Disconnecting WhatsApp client...');
        await this.client.destroy();
        this.client = null;
        this.isInitializing = false;
        logger.info('WhatsApp client destroyed');
      } else {
        logger.warn('No WhatsApp client to disconnect (updating status anyway)');
      }

      // Kill any zombie Chromium processes
      try {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);

        await execAsync('pkill -f "puppeteer-core/.local-chromium" || true');
        logger.info('Killed any zombie Chromium processes');
      } catch (err) {
        logger.warn({ err }, 'Failed to kill Chromium processes (may not exist)');
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
   * Logout and delete session files (explicit user logout)
   */
  async logout(): Promise<void> {
    try {
      logger.info('logout() called - will disconnect and clear session');

      // First disconnect the client
      await this.disconnect();

      // Then delete session files
      const sessionPath = env.WHATSAPP_SESSION_PATH;
      const fs = await import('fs/promises');
      try {
        await fs.rm(sessionPath, { recursive: true, force: true });
        logger.info('WhatsApp session files deleted after logout');
      } catch (err) {
        logger.warn({ err }, 'Failed to delete session files (may not exist)');
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
  onMessage(callback: (message: Message) => void): void {
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
   * Get client instance (for advanced usage)
   */
  getClient(): InstanceType<typeof Client> | null {
    return this.client;
  }

  /**
   * Check if WhatsApp is currently connected
   */
  isConnected(): boolean {
    if (!this.client) {
      return false;
    }

    try {
      // whatsapp-web.js Client has a getState() method that returns the connection state
      // @ts-ignore - getState() exists but may not be in types
      const state = this.client.info?.wid?._serialized;
      return !!state; // If we have a serialized WID, we're connected
    } catch (error) {
      logger.debug({ error }, 'Error checking WhatsApp connection state');
      return false;
    }
  }
}

export const whatsappClientService = new WhatsAppClientService();
