import {
  makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  jidDecode,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import type { proto } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';

type WASocket = ReturnType<typeof makeWASocket>;
import { logger } from '../../config/logger.js';
import { env } from '../../config/environment.js';
import { hashingService } from '../encryption/hashing.service.js';
import { contactRepository } from '../../repositories/contact.repository.js';
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
    senderPn?: string; // Sender phone number JID (present on LID messages)
    participantPn?: string; // Participant phone number JID (present on LID group messages)
  };
  message: proto.IMessage | null | undefined;
  messageTimestamp: number | bigint | null | undefined;
  pushName?: string | null;
}

/**
 * WhatsApp Web client service
 * Wraps @whiskeysockets/baileys with session persistence and event handling
 */
export class WhatsAppClientService {
  private sock: WASocket | null = null;
  private isInitializing = false;
  private hasCalledReady = false; // Track if ready callback has been called for current connection
  private initializationTimeout: NodeJS.Timeout | null = null;
  private markOnlineOnConnect = false; // Updated on initialize() and via setMarkOnlineOnConnect()

  private qrCodeCallback: ((qr: string) => void) | null = null;
  private messageCallback: ((message: BaileysMessage) => void) | null = null;
  private readyCallback: (() => void) | null = null;
  private disconnectedCallback: (() => void) | null = null;
  private saveCreds: (() => Promise<void>) | null = null;

  // Track message IDs that the bot sent programmatically, so we can distinguish
  // bot responses from user-typed messages when both carry fromMe=true.
  private sentMessageIds = new Map<string, number>(); // key.id → timestamp
  private readonly SENT_MSG_TTL_MS = 30_000; // Keep for 30s — ample for the upsert event to arrive

  /**
   * Check if a message key ID was sent by the bot programmatically.
   * Used by MessageHandlerService to skip re-processing bot responses.
   */
  isSentByBot(keyId: string): boolean {
    const now = Date.now();
    // Purge stale entries to prevent unbounded growth
    for (const [k, ts] of this.sentMessageIds) {
      if (now - ts > this.SENT_MSG_TTL_MS) this.sentMessageIds.delete(k);
    }
    return this.sentMessageIds.has(keyId);
  }

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

      // Read persisted connection settings
      const connectionSettings = await whatsappConnectionRepository.getFirst();
      this.markOnlineOnConnect = connectionSettings?.markOnlineOnConnect ?? false;
      const markOnlineOnConnect = this.markOnlineOnConnect;

      // Fetch the latest WA web version — WhatsApp rejects outdated versions with 405
      let waVersion: [number, number, number] = [2, 3000, 1035194821]; // fallback to current known-good
      try {
        const { version } = await fetchLatestBaileysVersion();
        waVersion = version;
        logger.info({ version: waVersion }, 'Using WA version for connection');
      } catch (err) {
        logger.warn({ err }, 'Failed to fetch latest WA version, using fallback');
      }

      // Build browser label: WAMR (DEV) in development, WAMR (PROD) in production
      const browserLabel = env.NODE_ENV === 'development' ? 'WAMR (DEV)' : 'WAMR (PROD)';

      // Create Baileys socket
      this.sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // We'll handle QR code ourselves via WebSocket
        browser: [browserLabel, 'Desktop', ''] as [string, string, string],
        version: waVersion,
        syncFullHistory: false,
        markOnlineOnConnect,
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
          // Capture session state before resetting flags
          const hadEstablishedSession = this.hasCalledReady;

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

          // Status 515 = "restart required" — happens normally after successful QR pairing.
          // Always allow reconnect for 515 regardless of session state.
          const isRestartRequired = statusCode === 515;

          // Attempt automatic reconnection after a short delay (unless it was a manual logout)
          // Only reconnect if we had a real session OR if WhatsApp asked for a restart (515).
          // If we never got past the QR phase and it's NOT a restart request,
          // this is a fresh pairing attempt rejected by WhatsApp — don't spam reconnects.
          if (shouldReconnect && (hadEstablishedSession || isRestartRequired)) {
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
          } else if (!shouldReconnect) {
            logger.info('Logout detected, not attempting automatic reconnection');
            this.isInitializing = false;
            this.sock = null;

            // Clear stale session files so next init generates a fresh QR code
            try {
              const fs = await import('fs/promises');
              const sessionPath = env.WHATSAPP_SESSION_PATH;
              await fs.rm(sessionPath, { recursive: true, force: true });
              logger.info({ sessionPath }, 'Cleared stale session files after logout');
            } catch (err) {
              logger.warn({ err }, 'Failed to clear session files after logout');
            }
          } else {
            // shouldReconnect=true but no established session and not a restart request —
            // QR pairing was rejected by WhatsApp. Stop here; user must click Connect again manually.
            logger.info(
              'QR pairing attempt rejected by WhatsApp (no prior session). Stopping auto-reconnect — user must click Connect again.'
            );
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
        try {
          await this.saveCreds();
          logger.debug('Credentials saved successfully');
        } catch (err: any) {
          // Session directory may have been deleted (e.g. after a conflict/logout).
          // Swallow ENOENT so the unhandled-rejection handler doesn't crash the process.
          if (err?.code === 'ENOENT') {
            logger.warn({ err }, 'Could not save credentials — session directory was removed');
          } else {
            logger.error({ err }, 'Failed to save credentials');
          }
        }
      }
    });

    // Message received event
    this.sock.ev.on('messages.upsert', async (event) => {
      try {
        const conn = await whatsappConnectionRepository.getFirst();
        const processFromSelf = conn?.processFromSelf ?? false;
        const processGroups = conn?.processGroups ?? false;

        for (const message of event.messages) {
          const remoteJid = message.key.remoteJid;
          const fromMe = message.key.fromMe;
          const isGroup = remoteJid?.endsWith('@g.us') ?? false;
          const isBroadcast = remoteJid === 'status@broadcast';

          if (!remoteJid) continue;
          if (isBroadcast) continue;
          if (fromMe && !processFromSelf) continue;
          if (isGroup && !processGroups) continue;

          logger.debug({ from: remoteJid }, 'Message received');

          if (this.messageCallback) {
            this.messageCallback(message as BaileysMessage);
          }
        }
      } catch (error) {
        logger.error({ error }, 'Error handling messages.upsert event');
      }
    });

    // LID → Phone Number mapping update event.
    // Baileys learns LID→PN mappings lazily; when new mappings arrive, backfill
    // any contacts we stored from an @lid JID without a resolved phone number.
    this.sock.ev.on('lid-mapping.update', async () => {
      try {
        const lidOnly = await contactRepository.findLidOnly();
        for (const c of lidOnly) {
          if (!c.replyJid) continue;
          const repo = this.sock?.signalRepository as unknown as
            | {
                lidMapping?: { getPNForLID: (lid: string) => Promise<string | null> };
              }
            | undefined;
          const pn = await repo?.lidMapping?.getPNForLID(c.replyJid);
          if (pn) {
            const fullPn = `+${pn}`;
            const pnHash = hashingService.hashPhoneNumber(fullPn);
            const { conversationService } = await import('../conversation/conversation.service.js');
            await conversationService.mergeLidContact(c.phoneNumberHash, fullPn, pnHash);
            logger.info(
              { lid: c.replyJid, phoneNumberHash: pnHash },
              'Merged LID contact into phone-number identity'
            );
          }
        }
      } catch (err) {
        logger.warn({ err }, 'LID backfill failed');
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
   * Resolve a recipient JID for sending messages.
   * If the recipient is a phone number (no @), formats as @s.whatsapp.net.
   * Otherwise passes through as-is (handles @lid, @s.whatsapp.net, @g.us, etc.)
   */
  private resolveRecipient(recipient: string): string {
    if (recipient.includes('@')) {
      return recipient;
    }

    // Recipient is a phone number - format as @s.whatsapp.net
    const cleanRecipient = recipient.replace(/^\+/, '').replace(/\D/g, '');
    return `${cleanRecipient}@s.whatsapp.net`;
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
      const jid = this.resolveRecipient(recipient);

      logger.debug(
        {
          originalRecipient: recipient,
          jid,
          messageLength: message.length,
        },
        'Sending message via Baileys'
      );

      const result = await this.sock.sendMessage(jid, { text: message });

      // Track message ID so MessageHandlerService can skip re-processing this
      // message when the upsert event fires for it (fromMe=true).
      if (result?.key?.id) {
        this.sentMessageIds.set(result.key.id as string, Date.now());
      }

      logger.info(
        { recipient: recipient.slice(-4), messageId: result?.key?.id },
        'Message sent successfully'
      );

      // If markOnlineOnConnect is disabled, restore unavailable presence after sending.
      // Baileys internally sends 'available' before each outgoing message, which would
      // show the account as online even when the user has opted out.
      if (!this.markOnlineOnConnect) {
        try {
          await this.sock.sendPresenceUpdate('unavailable');
        } catch (presenceError) {
          logger.debug({ presenceError }, 'Failed to restore unavailable presence after send');
        }
      }
    } catch (error) {
      logger.error({ error, recipient: recipient.slice(-4) }, 'Failed to send message');
      throw error;
    }
  }

  /**
   * Send image to a recipient
   * @param recipient - Can be a full JID, phone number, or user ID
   * @param imageBuffer - Image data as Buffer
   * @param caption - Optional caption text
   */
  async sendImage(
    recipient: string,
    imageBuffer: Buffer,
    caption?: string,
    viewOnce = false
  ): Promise<void> {
    if (!this.sock || !this.isReady()) {
      throw new Error('WhatsApp client is not ready');
    }

    try {
      const jid = this.resolveRecipient(recipient);

      logger.debug(
        { originalRecipient: recipient, jid, captionLength: caption?.length, viewOnce },
        'Sending image via Baileys'
      );

      const result = await this.sock.sendMessage(jid, {
        image: imageBuffer,
        caption,
        viewOnce,
      });

      // Track message ID so MessageHandlerService can skip re-processing
      if (result?.key?.id) {
        this.sentMessageIds.set(result.key.id as string, Date.now());
      }

      logger.info(
        { recipient: recipient.slice(-4), messageId: result?.key?.id },
        'Image sent successfully'
      );

      if (!this.markOnlineOnConnect) {
        try {
          await this.sock.sendPresenceUpdate('unavailable');
        } catch (presenceError) {
          logger.debug(
            { presenceError },
            'Failed to restore unavailable presence after image send'
          );
        }
      }
    } catch (error) {
      logger.error({ error, recipient: recipient.slice(-4) }, 'Failed to send image');
      throw error;
    }
  }

  /**
   * Update the cached markOnlineOnConnect setting without restarting the client.
   * Called by the controller when the user changes the setting in the UI.
   * Also immediately pushes the corresponding presence to WhatsApp so the change
   * takes effect without requiring a reconnect.
   */
  setMarkOnlineOnConnect(value: boolean): void {
    this.markOnlineOnConnect = value;
    logger.info({ value }, 'Updated markOnlineOnConnect setting');

    // Immediately push presence to WhatsApp if the socket is live
    if (this.sock && this.isReady()) {
      const presence = value ? 'available' : 'unavailable';
      this.sock
        .sendPresenceUpdate(presence)
        .then(() => {
          logger.info({ presence }, 'Pushed presence update after markOnlineOnConnect change');
        })
        .catch((err) => {
          logger.warn({ err }, 'Failed to push presence update after markOnlineOnConnect change');
        });
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
