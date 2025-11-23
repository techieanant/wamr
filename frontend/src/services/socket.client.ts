import { io, Socket } from 'socket.io-client';

/**
 * Socket.IO event types
 */
export interface ServerToClientEvents {
  // WhatsApp events
  'whatsapp:qr': (data: { qrCode: string; timestamp: string }) => void;
  'whatsapp:status': (data: {
    status: 'connected' | 'disconnected' | 'connecting' | 'loading';
    phoneNumber?: string;
    timestamp: string;
    progress?: number;
    message?: string;
  }) => void;
  'qr-code': (data: { qrCode: string }) => void; // Legacy compatibility
  'qr-required': () => void;
  connected: (data: { phoneNumber: string }) => void;
  disconnected: () => void;
  'status-change': (data: {
    status: string;
    progress?: number;
    message?: string;
    state?: string;
  }) => void;

  // Request events
  'request:new': (data: { requestId: number; title: string; user: string; status: string }) => void;
  'request:status-update': (data: {
    requestId: number;
    status: string;
    previousStatus: string;
    errorMessage?: string;
    timestamp: string;
  }) => void;

  // System events
  'system:error': (data: { message: string; code?: string }) => void;
}

export interface ClientToServerEvents {
  // WhatsApp actions
  'whatsapp:restart': () => void;
}

import { createLogger } from '@/lib/logger';

const logger = createLogger('socket');

/**
 * Socket.IO Client Service
 *
 * Manages WebSocket connections with retry logic and reconnection handling.
 * Supports authentication via cookies and provides event subscription.
 */
class SocketClient {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  /**
   * Connect to WebSocket server
   */
  connect(): void {
    // Check if already connected
    if (this.socket?.connected) {
      logger.info('Socket already connected with ID:', this.socket.id);
      return;
    }

    // Check if socket exists and is currently connecting
    if (this.socket && !this.socket.connected && !this.socket.disconnected) {
      logger.debug('Socket connection already in progress...');
      return;
    }

    // Disconnect old socket if it exists but is not connected
    if (this.socket && !this.socket.connected) {
      logger.debug('Cleaning up old disconnected socket');
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
      this.reconnectAttempts = 0;
    }

    // Use empty string to connect to same origin
    // In development: Vite proxy handles this
    // In production (combined container): Backend serves frontend, so same origin
    const socketUrl = ''; // Empty string connects to same origin

    logger.info('Connecting to socket server: same-origin');

    this.socket = io(socketUrl, {
      withCredentials: true, // Include cookies (JWT)
      transports: ['polling', 'websocket'], // Try polling first, then upgrade to websocket
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: this.maxReconnectAttempts,
      timeout: 10000, // 10 second connection timeout
    });

    // Connection event handlers
    this.socket.on('connect', () => {
      logger.info('Socket connected successfully! Socket ID:', this.socket?.id);
      this.reconnectAttempts = 0;
    });

    this.socket.on('disconnect', (reason) => {
      logger.warn('Socket disconnected:', reason);
    });

    this.socket.on('connect_error', (error) => {
      this.reconnectAttempts++;
      logger.error(
        `Socket connection error (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}):`,
        error.message
      );

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        logger.error('Max reconnection attempts reached');
        this.disconnect();
      }
    });

    // Debug: Log ALL incoming events (development only)
    if (import.meta.env.DEV) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.socket.onAny((eventName, ...args: any[]) => {
        logger.debug('🔵 Socket received event:', eventName, args);

        // Try manually calling handlers to test
        if (eventName === 'whatsapp:status') {
          logger.warn('⚠️ whatsapp:status event received, checking if handlers will fire...');
          // The socket.on handlers should fire automatically, but let's verify
        }

        if (eventName === 'whatsapp:qr') {
          logger.debug('whatsapp:qr event data details:', JSON.stringify(args, null, 2));
        }
      });
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /**
   * Subscribe to event
   */
  on<K extends keyof ServerToClientEvents>(event: K, handler: ServerToClientEvents[K]): void {
    if (!this.socket) {
      if (import.meta.env.DEV) {
        logger.warn('Socket not connected. Call connect() first.');
      }
      return;
    }
    logger.debug(`📝 Registering handler for event: ${String(event)}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.socket.on(event, handler as any);
  }

  /**
   * Unsubscribe from event
   */
  off<K extends keyof ServerToClientEvents>(event: K, handler?: ServerToClientEvents[K]): void {
    if (!this.socket) {
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.socket.off(event, handler as any);
  }

  /**
   * Emit event to server
   */
  emit<K extends keyof ClientToServerEvents>(
    event: K,
    ...args: Parameters<ClientToServerEvents[K]>
  ): void {
    if (!this.socket?.connected) {
      logger.warn('Socket not connected. Cannot emit event:', event);
      return;
    }
    this.socket.emit(event, ...args);
  }

  /**
   * Check if socket is connected
   */
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  /**
   * Get socket ID
   */
  getId(): string | undefined {
    return this.socket?.id;
  }

  /**
   * Get raw socket instance for direct access (debugging)
   */
  getRawSocket(): Socket<ServerToClientEvents, ClientToServerEvents> | null {
    return this.socket;
  }
}

// Singleton instance
export const socketClient = new SocketClient();
