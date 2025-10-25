import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { authService } from '../auth/auth.service';
import { logger } from '../../config/logger';
import { env } from '../../config/environment';

/**
 * WebSocket event names
 */
export enum SocketEvents {
  // WhatsApp Events
  QR_CODE = 'qr-code',
  QR_REQUIRED = 'qr-required',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  STATUS_CHANGE = 'status-change',

  // Request Notifications
  REQUEST_NEW = 'request:new',
  REQUEST_STATUS_UPDATE = 'request:status-update',

  // System Events
  SYSTEM_ERROR = 'system:error',

  // Client Actions
  WHATSAPP_RESTART = 'whatsapp:restart',
}

/**
 * Socket.IO WebSocket service
 * Handles real-time communication with admin dashboard
 */
export class WebSocketService {
  private io: Server | null = null;
  private authenticatedSockets: Set<string> = new Set();

  /**
   * Initialize Socket.IO server
   * @param httpServer - HTTP server to attach Socket.IO to
   * @returns Socket.IO server instance
   */
  initialize(httpServer: HttpServer): Server {
    this.io = new Server(httpServer, {
      cors: {
        origin: env.CORS_ORIGIN,
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    // Authentication middleware
    this.io.use((socket, next) => {
      this.authenticateSocket(socket, next);
    });

    // Connection handler
    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });

    logger.info('WebSocket service initialized');

    return this.io;
  }

  /**
   * Authenticate socket connection using JWT
   */
  private authenticateSocket(socket: Socket, next: (err?: Error) => void): void {
    try {
      // Get token from handshake auth, query, or cookies
      let token = socket.handshake.auth.token || socket.handshake.query.token;

      // If not in auth/query, try to extract from cookies
      if (!token) {
        const cookies = socket.handshake.headers.cookie;
        if (cookies) {
          const cookieMatch = cookies.match(/wamr-auth-token=([^;]+)/);
          if (cookieMatch) {
            token = cookieMatch[1];
          }
        }
      }

      if (!token || typeof token !== 'string') {
        logger.warn('WebSocket connection attempt without token');
        return next(new Error('Authentication required'));
      }

      // Verify JWT token
      const payload = authService.verifyToken(token);

      if (!payload) {
        logger.warn('WebSocket connection attempt with invalid token');
        return next(new Error('Invalid or expired token'));
      }

      // Attach user to socket
      socket.data.user = {
        userId: payload.userId,
        username: payload.username,
      };

      // Mark socket as authenticated
      this.authenticatedSockets.add(socket.id);

      logger.info({ userId: payload.userId, socketId: socket.id }, 'Socket authenticated');

      next();
    } catch (error) {
      logger.error({ error }, 'Socket authentication error');
      next(new Error('Authentication failed'));
    }
  }

  /**
   * Handle socket connection
   */
  private async handleConnection(socket: Socket): Promise<void> {
    logger.info(
      {
        socketId: socket.id,
        userId: socket.data.user?.userId,
      },
      'Socket connected'
    );

    // Send current WhatsApp connection status to newly connected client
    try {
      const { whatsappClientService } = await import('../whatsapp/whatsapp-client.service.js');
      const { whatsappConnectionRepository } = await import(
        '../../repositories/whatsapp-connection.repository.js'
      );

      // Check actual client connection state first
      const isActuallyConnected = whatsappClientService.isConnected();

      if (isActuallyConnected) {
        // WhatsApp is actually connected
        socket.emit('whatsapp:status', {
          status: 'connected',
          timestamp: new Date().toISOString(),
        });
        logger.info(
          { socketId: socket.id, status: 'connected' },
          'Sent current WhatsApp status (connected) to new client'
        );
      } else {
        // Check database status
        const connections = await whatsappConnectionRepository.findAll();

        if (connections.length > 0) {
          const currentStatus = connections[0].status;
          let socketStatus: 'connected' | 'disconnected' | 'connecting' = 'disconnected';

          if (currentStatus === 'CONNECTING') {
            socketStatus = 'connecting';
          }

          socket.emit('whatsapp:status', {
            status: socketStatus,
            timestamp: new Date().toISOString(),
          });
          logger.info(
            { socketId: socket.id, status: socketStatus },
            'Sent current WhatsApp status to new client'
          );
        } else {
          // No connection record, assume disconnected
          socket.emit('whatsapp:status', {
            status: 'disconnected',
            timestamp: new Date().toISOString(),
          });
          logger.info(
            { socketId: socket.id, status: 'disconnected' },
            'Sent default WhatsApp status (disconnected) to new client'
          );
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to send connection status to new client');
    }

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      this.authenticatedSockets.delete(socket.id);
      logger.info(
        {
          socketId: socket.id,
          userId: socket.data.user?.userId,
          reason,
        },
        'Socket disconnected'
      );
    });

    // Handle client actions
    socket.on(SocketEvents.WHATSAPP_RESTART, () => {
      logger.info({ userId: socket.data.user?.userId }, 'WhatsApp restart requested via WebSocket');
      // Emit to other services to restart WhatsApp
      this.emit(SocketEvents.WHATSAPP_RESTART, {
        userId: socket.data.user?.userId,
      });
    });
  }

  /**
   * Emit event to all authenticated clients
   */
  emit(event: SocketEvents, data: unknown): void {
    if (!this.io) {
      logger.warn('WebSocket not initialized, cannot emit event');
      return;
    }

    this.io.emit(event, data);
    logger.debug({ event, data }, 'WebSocket event emitted to all clients');
  }

  /**
   * Emit event to specific socket
   */
  emitToSocket(socketId: string, event: SocketEvents, data: unknown): void {
    if (!this.io) {
      logger.warn('WebSocket not initialized, cannot emit event');
      return;
    }

    this.io.to(socketId).emit(event, data);
    logger.debug({ event, socketId }, 'WebSocket event emitted to socket');
  }

  /**
   * Emit event to specific user (all their sockets)
   */
  emitToUser(userId: number, event: SocketEvents, data: unknown): void {
    if (!this.io) {
      logger.warn('WebSocket not initialized, cannot emit event');
      return;
    }

    // Find all sockets for this user
    this.io.sockets.sockets.forEach((socket) => {
      if (socket.data.user?.userId === userId) {
        socket.emit(event, data);
      }
    });

    logger.debug({ event, userId }, 'WebSocket event emitted to user');
  }

  /**
   * Get count of authenticated connections
   */
  getConnectionCount(): number {
    return this.authenticatedSockets.size;
  }

  /**
   * Close WebSocket server
   */
  close(): void {
    if (this.io) {
      this.io.close();
      this.authenticatedSockets.clear();
      logger.info('WebSocket service closed');
    }
  }
}

// Singleton instance
export const webSocketService = new WebSocketService();
