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

/**
 * Socket.IO client wrapper
 */
class SocketClient {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  /**
   * Connect to WebSocket server
   */
  connect(): void {
    if (this.socket?.connected) {
      console.warn('Socket already connected');
      return;
    }

    // In development, use empty string to connect to same origin (Vite proxy)
    // In production, use VITE_API_URL
    const socketUrl = import.meta.env.PROD
      ? import.meta.env.VITE_API_URL || 'http://localhost:4000'
      : ''; // Empty string connects to same origin, using Vite proxy

    this.socket = io(socketUrl, {
      withCredentials: true, // Include cookies (JWT)
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: this.maxReconnectAttempts,
    });

    // Connection event handlers
    this.socket.on('connect', () => {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.info('Socket connected:', this.socket?.id);
      }
      this.reconnectAttempts = 0;
    });

    this.socket.on('disconnect', (reason) => {
      if (import.meta.env.DEV) {
        console.warn('Socket disconnected:', reason);
      }
    });

    this.socket.on('connect_error', (error) => {
      this.reconnectAttempts++;
      if (import.meta.env.DEV) {
        console.error('Socket connection error:', error.message);
      }

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        if (import.meta.env.DEV) {
          console.error('Max reconnection attempts reached');
        }
        this.disconnect();
      }
    });

    // Debug: Log ALL incoming events (development only)
    if (import.meta.env.DEV) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.socket.onAny((eventName, ...args: any[]) => {
        // eslint-disable-next-line no-console
        console.log('Socket received event:', eventName, args);
        if (eventName === 'whatsapp:qr') {
          // eslint-disable-next-line no-console
          console.log('whatsapp:qr event data details:', JSON.stringify(args, null, 2));
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
        console.warn('Socket not connected. Call connect() first.');
      }
      return;
    }
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
      console.warn('Socket not connected. Cannot emit event:', event);
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
