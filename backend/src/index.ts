import express, { Express } from 'express';
import { createServer, Server as HttpServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from './config/environment';
import { logger } from './config/logger';
import { webSocketService } from './services/websocket/websocket.service';
import { errorHandler, notFoundHandler } from './api/middleware/error-handler.middleware';
import { adminRateLimiter } from './api/middleware/rate-limit.middleware';
import { closeDatabaseConnection } from './db';
import authRoutes from './api/routes/auth.routes';
import whatsappRoutes from './api/routes/whatsapp.routes';
import servicesRoutes from './api/routes/services.routes';
import requestsRoutes from './api/routes/requests.routes';
import settingsRoutes from './api/routes/settings.routes';
import systemRoutes from './api/routes/system.routes';
import contactsRoutes from './api/routes/contacts.routes';
import { whatsappClientService } from './services/whatsapp/whatsapp-client.service';
import { qrCodeEmitterService } from './services/whatsapp/qr-code-emitter.service';
import { whatsappSessionService } from './services/whatsapp/whatsapp-session.service';
import { messageHandlerService } from './services/whatsapp/message-handler.service';
import { mediaMonitoringService } from './services/media-monitoring/media-monitoring.service';
import { migrate } from './database/migrate';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Create Express application with middleware
 */
function createApp(): Express {
  const app = express();

  // Trust proxy headers (for Nginx Proxy Manager)
  app.set('trust proxy', true);

  // Security middleware with relaxed CSP for reverse proxy compatibility
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    })
  );

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Cookie parser middleware
  app.use(cookieParser());

  // Health check endpoint (no auth required, no rate limit)
  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // API routes (auth routes have their own rate limiting in controllers)
  app.use('/api/auth', authRoutes);

  // Apply rate limiting to non-auth API routes
  app.use('/api', adminRateLimiter);

  // Register WhatsApp routes
  app.use('/api/whatsapp', whatsappRoutes);

  // Register services routes
  app.use('/api/services', servicesRoutes);

  // Register requests routes
  app.use('/api/requests', requestsRoutes);

  // Register settings routes
  app.use('/api/settings', settingsRoutes);

  // Register contacts routes
  app.use('/api/contacts', contactsRoutes);
  // Register system routes
  app.use('/api/system', systemRoutes);

  // TODO: Register remaining route modules when created
  // app.use('/api/stats', statsRoutes);

  // Serve static frontend files (for combined container)
  const publicPath = path.join(__dirname, '..', 'public');
  app.use(express.static(publicPath));

  // SPA fallback: serve index.html for all non-API routes
  app.get('*', (req, res, next) => {
    // Skip if it's an API route or health check
    if (req.path.startsWith('/api') || req.path === '/health') {
      return next();
    }
    res.sendFile(path.join(publicPath, 'index.html'));
  });

  // 404 handler for API routes only
  app.use('/api/*', notFoundHandler);

  // Global error handler (must be last)
  app.use(errorHandler);

  return app;
}

/**
 * Start server
 */
async function startServer(): Promise<HttpServer> {
  const app = createApp();
  const httpServer = createServer(app);

  // Initialize WebSocket service
  const io = webSocketService.initialize(httpServer);

  // Initialize QR code emitter with Socket.IO
  qrCodeEmitterService.setSocketServer(io);

  // Setup WhatsApp client event handlers
  whatsappClientService.onQRCode((qr) => {
    qrCodeEmitterService.emitQRCode(qr);
  });

  whatsappClientService.onReady(() => {
    // Note: Connection status is already emitted by whatsapp-client.service.ts ready handler
    // No need to emit again here to avoid duplicates

    // Initialize message handler when WhatsApp is ready
    logger.info('WhatsApp client ready, initializing message handler');
    messageHandlerService.initialize();

    // Start media monitoring service
    logger.info('Starting media monitoring service');
    mediaMonitoringService.start();
  });

  whatsappClientService.onDisconnected(() => {
    qrCodeEmitterService.emitConnectionStatus('disconnected');
  });

  // Start HTTP server
  const port = env.PORT;
  httpServer.listen(port, () => {
    logger.info(
      {
        port,
        env: env.NODE_ENV,
      },
      'Server started successfully'
    );
  });

  return httpServer;
}

/**
 * Graceful shutdown handler
 */
function setupGracefulShutdown(httpServer: HttpServer): void {
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal');

    try {
      // Close HTTP server (stops accepting new connections)
      httpServer.close(() => {
        logger.info('HTTP server closed');
      });

      // Stop media monitoring service
      logger.info('Stopping media monitoring service');
      mediaMonitoringService.stop();

      // Close WhatsApp connection
      await whatsappClientService.disconnect();

      // Close WebSocket connections
      webSocketService.close();

      // Close database connection
      closeDatabaseConnection();

      // Exit process
      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error({ error }, 'Error during graceful shutdown');
      process.exit(1);
    }
  };

  // Listen for termination signals
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.fatal({ error }, 'Uncaught exception');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled promise rejection');
    process.exit(1);
  });
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    logger.info(
      {
        logLevel: env.LOG_LEVEL,
        nodeEnv: env.NODE_ENV,
        port: env.PORT,
      },
      'Starting WAMR backend...'
    );

    // Run database migrations before starting the server
    await migrate();

    // Start server
    const httpServer = await startServer();

    // Initialize WhatsApp session (auto-reconnect if session exists)
    await whatsappSessionService.initialize();

    // Note: Message handler is initialized in onReady callback above

    // Setup graceful shutdown
    setupGracefulShutdown(httpServer);
  } catch (error) {
    logger.fatal({ error }, 'Failed to start server');
    process.exit(1);
  }
}

// Start application if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { createApp, startServer };
