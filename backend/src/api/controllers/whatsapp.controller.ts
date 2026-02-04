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
        processFromSelf: activeConnection.processFromSelf,
        processGroups: activeConnection.processGroups,
        autoApprovalMode: activeConnection.autoApprovalMode,
        exceptionsEnabled: activeConnection.exceptionsEnabled,
        exceptionContacts: activeConnection.exceptionContacts,
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
      processFromSelf: connection.processFromSelf,
      processGroups: connection.processGroups,
      autoApprovalMode: connection.autoApprovalMode,
      exceptionsEnabled: connection.exceptionsEnabled,
      exceptionContacts: connection.exceptionContacts,
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

    const { filterType, filterValue, processFromSelf, processGroups } = result.data;

    // Update filter configuration and message source options
    const updated = await whatsappConnectionRepository.updateMessageFilter(
      filterType,
      filterValue,
      {
        ...(processFromSelf !== undefined && { processFromSelf }),
        ...(processGroups !== undefined && { processGroups }),
      }
    );

    if (!updated) {
      res.status(404).json({
        success: false,
        message: 'No WhatsApp connection found',
      });
      return;
    }

    logger.info(
      { filterType, filterValue, processFromSelf, processGroups },
      'Message filter updated'
    );

    res.json({
      success: true,
      message: 'Message filter updated successfully',
      filterType: updated.filterType,
      filterValue: updated.filterValue,
      processFromSelf: updated.processFromSelf,
      processGroups: updated.processGroups,
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

/**
 * Update exceptions configuration
 */
export const updateExceptions = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { exceptionsEnabled, exceptionContacts } = req.body;

    logger.debug({ body: req.body }, 'Received exceptions update request');

    if (typeof exceptionsEnabled !== 'boolean') {
      res.status(400).json({
        success: false,
        message: 'exceptionsEnabled must be a boolean',
      });
      return;
    }

    if (!Array.isArray(exceptionContacts)) {
      res.status(400).json({
        success: false,
        message: 'exceptionContacts must be an array',
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

    // Update exceptions
    await whatsappConnectionRepository.update(connection.id, {
      exceptionsEnabled,
      exceptionContacts,
    });

    logger.info(
      { exceptionsEnabled, exceptionContactsCount: exceptionContacts.length },
      'Exceptions updated'
    );

    res.json({
      success: true,
      message: 'Exceptions updated successfully',
      exceptionsEnabled,
      exceptionContacts,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to update exceptions');
    next(error);
  }
};

/**
 * Reset WhatsApp session - clears session data and requires fresh QR scan
 */
export const resetSession = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    logger.info('Resetting WhatsApp session...');

    // Clear session using the service method
    await whatsappClientService.clearSession();

    res.json({
      success: true,
      message: 'WhatsApp session cleared. Please scan the QR code to reconnect.',
    });
  } catch (error) {
    logger.error({ error }, 'Failed to reset WhatsApp session');
    next(error);
  }
};
