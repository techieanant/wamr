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
  private hasCalledReady = false; // Track if ready callback has been called for current connection
  private initializationTimeout: NodeJS.Timeout | null = null;
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
      logger.debug(
        {
          sessionPath: env.WHATSAPP_SESSION_PATH,
          clientId: 'wamr-admin',
          nodeEnv: process.env.NODE_ENV,
        },
        'Creating WhatsApp client with configuration'
      );

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
          // Use Chrome from Puppeteer's cache - required for Docker with pre-installed Chrome
          executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        },
      });

      logger.debug('WhatsApp Client instance created, setting up event handlers...');
      this.setupEventHandlers();

      // Set a timeout for initialization (60 seconds)
      // If client doesn't emit 'ready' or 'qr' within this time, assume restoration failed
      this.initializationTimeout = setTimeout(async () => {
        if (this.isInitializing && !this.isReady()) {
          logger.error(
            'WhatsApp initialization timeout - session restoration appears to have failed'
          );
          await this.clearSessionAndRestart();
        }
      }, 60000); // 60 second timeout

      logger.debug('Calling client.initialize()...');
      await this.client.initialize();
      logger.info('WhatsApp client.initialize() completed, waiting for ready event...');
    } catch (error) {
      const errorDetails = {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        type: error instanceof Error ? error.constructor.name : typeof error,
        error: error,
      };
      logger.error(errorDetails, 'Failed to initialize WhatsApp client');
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
      try {
        logger.info(`WhatsApp client loading: ${percent}% - ${message}`);

        // Emit loading progress to UI
        const { webSocketService, SocketEvents } = await import(
          '../websocket/websocket.service.js'
        );
        webSocketService.emit(SocketEvents.STATUS_CHANGE, {
          status: 'loading',
          progress: percent,
          message,
        });
      } catch (error) {
        logger.error({ error }, 'Error handling loading_screen event');
      }
    });

    // Change state event (track connection state changes)
    this.client.on('change_state', async (state: string) => {
      try {
        logger.info(`WhatsApp client state changed: ${state}`);

        // Emit state change to UI
        const { webSocketService, SocketEvents } = await import(
          '../websocket/websocket.service.js'
        );
        webSocketService.emit(SocketEvents.STATUS_CHANGE, {
          status: 'loading',
          state,
        });
      } catch (error) {
        logger.error({ error }, 'Error handling change_state event');
      }
    });

    // QR Code generation
    this.client.on('qr', async (qr: string) => {
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
    });

    // Ready event (authenticated and connected)
    this.client.on('ready', async () => {
      logger.info('WhatsApp client is ready');
      this.isInitializing = false; // Reset flag on successful connection

      // Clear initialization timeout since we're ready
      if (this.initializationTimeout) {
        clearTimeout(this.initializationTimeout);
        this.initializationTimeout = null;
      }

      try {
        // Get connected phone number - client.info may be null in newer versions
        // Wait a moment for client.info to be populated
        let phoneNumber = 'unknown';
        let attempts = 0;
        while (attempts < 5 && phoneNumber === 'unknown') {
          const info = this.client?.info;
          if (info?.wid?.user) {
            phoneNumber = info.wid.user;
            break;
          }
          attempts++;
          if (attempts < 5) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }

        if (phoneNumber === 'unknown') {
          logger.warn('Could not retrieve phone number from client.info, using fallback');
        }

        const phoneHash = await hashingService.hashPhoneNumber(phoneNumber);

        // Update connection status
        await whatsappConnectionRepository.upsert({
          phoneNumberHash: phoneHash,
          status: 'CONNECTED',
          lastConnectedAt: new Date(),
        });

        logger.info({ phoneHash }, 'WhatsApp connected');

        // Emit status update via WebSocket (can happen multiple times, that's OK)
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

    // Error event - catch internal client errors to prevent unhandled rejections
    this.client.on('error', (error: Error) => {
      logger.error({ error }, 'WhatsApp client error');
      // Don't crash the app - just log the error
      // The disconnected event handler will handle reconnection if needed
    });

    // Authentication failure
    this.client.on('auth_failure', async (error: Error) => {
      logger.error({ error }, 'WhatsApp authentication failed - will clear session and retry');
      this.isInitializing = false;

      try {
        await this.updateConnectionStatus('DISCONNECTED');

        // Clear the failed session and try fresh
        await this.clearSessionAndRestart();
      } catch (err) {
        logger.error({ error: err }, 'Failed to handle auth failure');
      }
    });

    // Disconnected event
    this.client.on('disconnected', async (reason: string) => {
      logger.warn({ reason }, 'WhatsApp disconnected');

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

      // Clear initialization timeout
      if (this.initializationTimeout) {
        clearTimeout(this.initializationTimeout);
        this.initializationTimeout = null;
      }

      if (this.client) {
        logger.info('Disconnecting WhatsApp client...');
        // Remove all event listeners before destroying to prevent memory leaks and duplicate events
        this.client.removeAllListeners();
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

      // Destroy existing client if any
      if (this.client) {
        try {
          // Remove all event listeners before destroying
          this.client.removeAllListeners();
          await this.client.destroy();
        } catch (err) {
          logger.warn({ err }, 'Error destroying client during session clear');
        }
        this.client = null;
      }

      this.isInitializing = false;

      // Kill any zombie Chromium processes
      try {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        await execAsync('pkill -f "puppeteer-core/.local-chromium" || true');
        logger.info('Killed zombie Chromium processes');
      } catch (err) {
        logger.warn({ err }, 'Failed to kill Chromium processes');
      }

      // Wait for processes to fully terminate
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

      // Wait for Chromium to fully release file locks (2 seconds)
      logger.info('Waiting for Chromium to release file locks...');
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

      // Destroy existing client if any
      if (this.client) {
        try {
          logger.info('Destroying existing WhatsApp client...');
          this.client.removeAllListeners();
          await this.client.destroy();
        } catch (err) {
          logger.warn({ err }, 'Error destroying client during session clear');
        }
        this.client = null;
      }

      this.isInitializing = false;
      this.hasCalledReady = false;

      // Kill any zombie Chromium processes
      try {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        await execAsync('pkill -f "puppeteer-core/.local-chromium" || true');
        await execAsync('pkill -f ".local-chromium" || true');
        logger.info('Killed zombie Chromium processes');
      } catch (err) {
        logger.warn({ err }, 'Failed to kill Chromium processes');
      }

      // Wait for processes to fully terminate
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

      // Also try to delete cache directory
      try {
        const cachePath = './.wwebjs_cache';
        await fs.rm(cachePath, { recursive: true, force: true });
        logger.info({ cachePath }, 'Deleted WhatsApp cache directory');
      } catch (err) {
        logger.debug({ err }, 'Cache directory did not exist or could not be deleted');
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
