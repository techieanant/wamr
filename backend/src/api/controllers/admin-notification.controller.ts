import { Request, Response, NextFunction } from 'express';
import { adminNotificationService } from '../../services/notifications/admin-notification.service.js';
import { contactRepository } from '../../repositories/contact.repository.js';
import { encryptionService } from '../../services/encryption/encryption.service.js';
import { whatsappConnectionRepository } from '../../repositories/whatsapp-connection.repository.js';
import { logger } from '../../config/logger.js';

/**
 * Get admin notification configuration
 */
export async function getAdminNotificationConfig(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const config = await adminNotificationService.getConfig();
    const isConfigured = await adminNotificationService.isConfigured();

    // Check if WhatsApp is connected
    const connection = await whatsappConnectionRepository.getActive();
    const whatsappConnected = connection?.status === 'CONNECTED';

    res.json({
      success: true,
      data: {
        phoneNumber: config.phoneNumber ? `****${config.phoneNumber.slice(-4)}` : null,
        countryCode: config.countryCode,
        enabled: config.enabled,
        isConfigured,
        whatsappConnected,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get admin notification config');
    next(error);
  }
}

/**
 * Set admin notification phone number
 */
export async function setAdminNotificationPhone(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { phoneNumber, countryCode, contactId } = req.body;

    // If contactId is provided, get phone from contact
    if (contactId) {
      const contact = await contactRepository.findById(contactId);

      if (!contact) {
        res.status(404).json({
          success: false,
          message: 'Contact not found',
        });
        return;
      }

      if (!contact.phoneNumberEncrypted) {
        res.status(400).json({
          success: false,
          message: 'Contact does not have a phone number',
        });
        return;
      }

      // Decrypt contact phone number
      const decryptedPhone = encryptionService.decrypt(contact.phoneNumberEncrypted);

      // Try to extract country code (assumes E.164 format starting with +)
      const match = decryptedPhone.match(/^(\+\d{1,4})(\d+)$/);
      if (match) {
        await adminNotificationService.setPhone(match[2], match[1]);
      } else {
        // Default to using the whole number without country code
        await adminNotificationService.setPhone(decryptedPhone.replace(/^\+/, ''), '+');
      }
    } else {
      // Validate input
      if (!phoneNumber || !countryCode) {
        res.status(400).json({
          success: false,
          message: 'Phone number and country code are required',
        });
        return;
      }

      await adminNotificationService.setPhone(phoneNumber, countryCode);
    }

    res.json({
      success: true,
      message: 'Admin notification phone number updated',
    });
  } catch (error) {
    logger.error({ error }, 'Failed to set admin notification phone');
    next(error);
  }
}

/**
 * Enable or disable admin notifications
 */
export async function setAdminNotificationEnabled(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      res.status(400).json({
        success: false,
        message: 'enabled must be a boolean',
      });
      return;
    }

    // Check if phone is configured when enabling
    if (enabled) {
      const config = await adminNotificationService.getConfig();

      if (!config.phoneNumber) {
        res.status(400).json({
          success: false,
          message: 'Please set a phone number before enabling notifications',
        });
        return;
      }

      // Check if WhatsApp is connected
      const connection = await whatsappConnectionRepository.getActive();
      if (!connection || connection.status !== 'CONNECTED') {
        res.status(400).json({
          success: false,
          message: 'WhatsApp must be connected before enabling notifications',
        });
        return;
      }
    }

    await adminNotificationService.setEnabled(enabled);

    res.json({
      success: true,
      message: `Admin notifications ${enabled ? 'enabled' : 'disabled'}`,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to set admin notification enabled status');
    next(error);
  }
}

/**
 * Send test notification to admin
 */
export async function sendTestNotification(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await adminNotificationService.sendTestNotification();

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message,
      });
    }
  } catch (error) {
    logger.error({ error }, 'Failed to send test notification');
    next(error);
  }
}
