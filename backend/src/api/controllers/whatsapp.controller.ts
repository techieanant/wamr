import type { Request, Response, NextFunction } from 'express';
import { whatsappClientService } from '../../services/whatsapp/whatsapp-client.service.js';
import { whatsappConnectionRepository } from '../../repositories/whatsapp-connection.repository.js';
import { logger } from '../../config/logger.js';
import { messageFilterSchema } from '../validators/whatsapp.validators.js';

/**
 * Get WhatsApp connection status
 */
export const getStatus = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Check if client is currently initializing
    if (whatsappClientService.isClientInitializing()) {
      res.json({
        status: 'LOADING',
        isConnected: false,
        phoneNumber: null,
        lastConnectedAt: null,
      });
      return;
    }

    // First check if there's an active connection
    const activeConnection = await whatsappConnectionRepository.getActive();

    if (activeConnection) {
      // Get phone number if client is ready
      const phoneNumber = whatsappClientService.isReady()
        ? whatsappClientService.getPhoneNumber()
        : null;

      res.json({
        status: activeConnection.status,
        isConnected: true,
        phoneNumber,
        lastConnectedAt: activeConnection.lastConnectedAt,
        filterType: activeConnection.filterType,
        filterValue: activeConnection.filterValue,
        autoApprovalMode: activeConnection.autoApprovalMode,
      });
      return;
    }

    // If no active connection, get all connections and use the most recent one
    const connections = await whatsappConnectionRepository.findAll();

    if (connections.length === 0) {
      res.json({
        status: 'DISCONNECTED',
        isConnected: false,
        phoneNumber: null,
        lastConnectedAt: null,
      });
      return;
    }

    // Sort by updatedAt descending and use the most recent
    const sortedConnections = connections.sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    );
    const connection = sortedConnections[0];

    // Get phone number if client is ready and connected
    const phoneNumber =
      connection.status === 'CONNECTED' && whatsappClientService.isReady()
        ? whatsappClientService.getPhoneNumber()
        : null;

    res.json({
      status: connection.status,
      isConnected: connection.status === 'CONNECTED',
      phoneNumber,
      lastConnectedAt: connection.lastConnectedAt,
      filterType: connection.filterType,
      filterValue: connection.filterValue,
      autoApprovalMode: connection.autoApprovalMode,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get WhatsApp status');
    next(error);
  }
};

/**
 * Start WhatsApp connection (initialize client)
 */
export const connect = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const isReady = whatsappClientService.isReady();

    if (isReady) {
      res.json({
        success: true,
        message: 'WhatsApp is already connected',
      });
      return;
    }

    // Update or create connection record with CONNECTING status
    await whatsappConnectionRepository.upsert({
      phoneNumberHash: '',
      status: 'CONNECTING',
    });

    // Initialize client (async, will emit QR code via WebSocket)
    whatsappClientService.initialize().catch((error) => {
      logger.error({ error }, 'Failed to initialize WhatsApp client');
    });

    res.json({
      success: true,
      message: 'WhatsApp connection initiated. Please scan QR code.',
    });
  } catch (error) {
    logger.error({ error }, 'Failed to start WhatsApp connection');
    next(error);
  }
};

/**
 * Disconnect from WhatsApp
 */
export const disconnect = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Use logout() to properly clear session files on manual disconnect
    await whatsappClientService.logout();

    res.json({
      success: true,
      message: 'WhatsApp disconnected successfully',
    });
  } catch (error) {
    logger.error({ error }, 'Failed to disconnect WhatsApp');
    next(error);
  }
};

/**
 * Restart WhatsApp connection
 */
export const restart = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // For restart, use logout to clear old session
    await whatsappClientService.logout();

    // Wait a bit before reinitializing
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Reinitialize
    whatsappClientService.initialize().catch((error) => {
      logger.error({ error }, 'Failed to reinitialize WhatsApp client');
    });

    res.json({
      success: true,
      message: 'WhatsApp connection restarted. Please scan QR code if needed.',
    });
  } catch (error) {
    logger.error({ error }, 'Failed to restart WhatsApp connection');
    next(error);
  }
};

/**
 * Update message filter configuration
 */
export const updateMessageFilter = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Validate request body
    const result = messageFilterSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        success: false,
        message: 'Invalid filter configuration',
        errors: result.error.errors,
      });
      return;
    }

    const { filterType, filterValue } = result.data;

    // Update filter configuration
    const updated = await whatsappConnectionRepository.updateMessageFilter(filterType, filterValue);

    if (!updated) {
      res.status(404).json({
        success: false,
        message: 'No WhatsApp connection found',
      });
      return;
    }

    logger.info({ filterType, filterValue }, 'Message filter updated');

    res.json({
      success: true,
      message: 'Message filter updated successfully',
      filterType: updated.filterType,
      filterValue: updated.filterValue,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to update message filter');
    next(error);
  }
};

/**
 * Update auto-approval mode
 */
export const updateAutoApprovalMode = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { mode } = req.body;

    logger.debug({ body: req.body, mode }, 'Received auto-approval mode update request');

    if (!mode || !['auto_approve', 'auto_deny', 'manual'].includes(mode)) {
      logger.warn({ mode, body: req.body }, 'Invalid auto-approval mode received');
      res.status(400).json({
        success: false,
        message: 'Invalid auto-approval mode. Must be: auto_approve, auto_deny, or manual',
      });
      return;
    }

    // Get the active connection
    const connection = await whatsappConnectionRepository.getActive();

    if (!connection) {
      res.status(404).json({
        success: false,
        message: 'No WhatsApp connection found',
      });
      return;
    }

    // Update auto-approval mode
    await whatsappConnectionRepository.update(connection.id, { autoApprovalMode: mode });

    logger.info({ mode }, 'Auto-approval mode updated');

    res.json({
      success: true,
      message: 'Auto-approval mode updated successfully',
      mode,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to update auto-approval mode');
    next(error);
  }
};
