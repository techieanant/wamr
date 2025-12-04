import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { AdminUserRepository } from '../../repositories/admin-user.repository';
import { WhatsAppConnectionRepository } from '../../repositories/whatsapp-connection.repository';
import { MediaServiceConfigRepository } from '../../repositories/media-service-config.repository';
import { RequestHistoryRepository } from '../../repositories/request-history.repository';
import { ContactRepository } from '../../repositories/contact.repository';
import { SettingRepository } from '../../repositories/setting.repository';
import { SettingValue } from '../../models/setting.model';
import { logger } from '../../config/logger';
import bcrypt from 'bcrypt';
import { db } from '../../db';
import { adminUsers } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const adminUserRepo = new AdminUserRepository();
const whatsappRepo = new WhatsAppConnectionRepository();
const serviceConfigRepo = new MediaServiceConfigRepository();
const requestHistoryRepo = new RequestHistoryRepository();
const contactRepo = new ContactRepository();
const settingRepo = new SettingRepository();

// Get application version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, '../../../package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
const APP_VERSION = packageJson.version;

/**
 * Export schema version
 */
const EXPORT_SCHEMA_VERSION = APP_VERSION;

/**
 * Get all settings
 */
export async function getSettings(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
      return;
    }

    const settings = await settingRepo.findAll();
    const settingsMap = settings.reduce(
      (acc, setting) => {
        acc[setting.key] = setting.value;
        return acc;
      },
      {} as Record<string, any>
    );

    res.status(200).json({
      success: true,
      data: settingsMap,
    });
  } catch (error) {
    logger.error({ error }, 'Error getting settings');
    next(error);
  }
}

/**
 * Update a setting
 */
export async function updateSetting(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
      return;
    }

    const { key } = req.params;
    const { value } = req.body;

    const setting = await settingRepo.upsert({ key, value: value as SettingValue });

    res.status(200).json({
      success: true,
      data: setting,
    });
  } catch (error) {
    logger.error({ error }, 'Error updating setting');
    next(error);
  }
}

/**
 * Change admin password
 */
export async function changePassword(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
      return;
    }

    if (!currentPassword || !newPassword) {
      res.status(400).json({
        success: false,
        message: 'Current password and new password are required',
      });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long',
      });
      return;
    }

    // Get user
    const user = await adminUserRepo.findById(userId);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValidPassword) {
      res.status(401).json({
        success: false,
        message: 'Current password is incorrect',
      });
      return;
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update password directly using db
    await db.update(adminUsers).set({ passwordHash }).where(eq(adminUsers.id, userId));

    logger.info({ userId }, 'Admin password changed successfully');

    res.status(200).json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    logger.error({ error }, 'Error changing password');
    next(error);
  }
}

/**
 * Export all data
 */
export async function exportData(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
      return;
    }

    // Get all data
    const allConnections = await whatsappRepo.findAll();
    const whatsappConnection = allConnections[0]; // Get the first/latest connection
    const services = await serviceConfigRepo.findAll();
    const requests = await requestHistoryRepo.findAll();
    const contacts = await contactRepo.findAll();
    const settings = await settingRepo.findAll();

    // Prepare export data (exclude sensitive fields)
    const exportData = {
      version: EXPORT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      data: {
        whatsappConnection: whatsappConnection
          ? {
              phoneNumberHash: whatsappConnection.phoneNumberHash,
              status: whatsappConnection.status,
              lastConnectedAt: whatsappConnection.lastConnectedAt,
              filterType: whatsappConnection.filterType,
              filterValue: whatsappConnection.filterValue,
              autoApprovalMode: whatsappConnection.autoApprovalMode,
              exceptionsEnabled: whatsappConnection.exceptionsEnabled,
              exceptionContacts: whatsappConnection.exceptionContacts,
              // Don't export session data for security
            }
          : null,
        services: services.map((service) => ({
          name: service.name,
          serviceType: service.serviceType,
          baseUrl: service.baseUrl,
          enabled: service.enabled,
          priorityOrder: service.priorityOrder,
          maxResults: service.maxResults,
          qualityProfileId: service.qualityProfileId,
          rootFolderPath: service.rootFolderPath,
          // Don't export API keys for security
        })),
        contacts: contacts.map((contact) => ({
          phoneNumberHash: contact.phoneNumberHash,
          phoneNumberEncrypted: contact.phoneNumberEncrypted,
          contactName: contact.contactName,
          createdAt: contact.createdAt,
          updatedAt: contact.updatedAt,
        })),
        requests: requests.map((request) => ({
          phoneNumberHash: request.phoneNumberHash,
          phoneNumberEncrypted: request.phoneNumberEncrypted,
          contactName: request.contactName,
          mediaType: request.mediaType,
          title: request.title,
          year: request.year,
          tmdbId: request.tmdbId,
          tvdbId: request.tvdbId,
          serviceType: request.serviceType,
          serviceConfigId: request.serviceConfigId,
          selectedSeasons: request.selectedSeasons,
          notifiedSeasons: request.notifiedSeasons,
          notifiedEpisodes: request.notifiedEpisodes,
          totalSeasons: request.totalSeasons,
          status: request.status,
          conversationLog: request.conversationLog,
          submittedAt: request.submittedAt,
          errorMessage: request.errorMessage,
          adminNotes: request.adminNotes,
          createdAt: request.createdAt,
          updatedAt: request.updatedAt,
        })),
        settings: settings.reduce(
          (acc, setting) => {
            acc[setting.key] = setting.value;
            return acc;
          },
          {} as Record<string, any>
        ),
      },
    };

    logger.info({ userId }, 'Data exported successfully');

    res.status(200).json({
      success: true,
      data: exportData,
    });
  } catch (error) {
    logger.error({ error }, 'Error exporting data');
    next(error);
  }
}

/**
 * Import data
 */
export async function importData(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
      return;
    }

    const importData = req.body;

    // Validate import data structure
    if (!importData || !importData.version || !importData.data) {
      res.status(400).json({
        success: false,
        message: 'Invalid import data format',
      });
      return;
    }

    // Check version compatibility (for now, only support exact version)
    if (importData.version !== EXPORT_SCHEMA_VERSION) {
      res.status(400).json({
        success: false,
        message: `Unsupported schema version: ${importData.version}. Expected: ${EXPORT_SCHEMA_VERSION}`,
      });
      return;
    }

    let imported = {
      services: 0,
      contacts: 0,
      requests: 0,
      settings: 0,
    };

    // Import services (update existing ones)
    if (importData.data.services && Array.isArray(importData.data.services)) {
      for (const service of importData.data.services) {
        // Find existing service by name
        const allServices = await serviceConfigRepo.findAll();
        const existingService = allServices.find(
          (s) => s.name === service.name && s.serviceType === service.serviceType
        );

        if (existingService) {
          // Update existing service settings (except API key)
          await serviceConfigRepo.update(existingService.id, {
            baseUrl: service.baseUrl,
            enabled: service.enabled,
            priorityOrder: service.priorityOrder,
            maxResults: service.maxResults,
            qualityProfileId: service.qualityProfileId
              ? parseInt(service.qualityProfileId, 10)
              : null,
            rootFolderPath: service.rootFolderPath,
          });
          imported.services++;
        }
      }
    }

    // Import contacts
    if (importData.data.contacts && Array.isArray(importData.data.contacts)) {
      for (const contact of importData.data.contacts) {
        // Upsert contact
        await contactRepo.upsert({
          phoneNumberHash: contact.phoneNumberHash,
          phoneNumberEncrypted: contact.phoneNumberEncrypted,
          contactName: contact.contactName,
        });
        imported.contacts++;
      }
    }

    // Import requests (if they don't exist)
    if (importData.data.requests && Array.isArray(importData.data.requests)) {
      for (const request of importData.data.requests) {
        // Check if request already exists
        const allRequests = await requestHistoryRepo.findAll();
        const existingRequest = allRequests.find(
          (r) => r.phoneNumberHash === request.phoneNumberHash && r.title === request.title
        );

        if (!existingRequest) {
          await requestHistoryRepo.create({
            phoneNumberHash: request.phoneNumberHash,
            phoneNumberEncrypted: request.phoneNumberEncrypted,
            contactName: request.contactName,
            mediaType: request.mediaType,
            title: request.title,
            year: request.year,
            tmdbId: request.tmdbId,
            tvdbId: request.tvdbId,
            serviceType: request.serviceType,
            serviceConfigId: request.serviceConfigId,
            selectedSeasons: request.selectedSeasons,
            notifiedSeasons: request.notifiedSeasons,
            notifiedEpisodes: request.notifiedEpisodes,
            totalSeasons: request.totalSeasons,
            status: request.status,
            conversationLog: request.conversationLog,
            submittedAt: request.submittedAt,
            errorMessage: request.errorMessage,
            adminNotes: request.adminNotes,
          });
          imported.requests++;
        }
      }
    }

    // Import settings
    if (importData.data.settings && typeof importData.data.settings === 'object') {
      for (const [key, value] of Object.entries(importData.data.settings)) {
        await settingRepo.upsert({ key, value: value as SettingValue });
        imported.settings++;
      }
    }

    logger.info({ userId, imported }, 'Data imported successfully');

    res.status(200).json({
      success: true,
      message: 'Data imported successfully',
      imported,
      notes: {
        services:
          'Services must be reconfigured with API keys. Only settings were updated for existing services.',
        whatsappConnection: 'WhatsApp connection must be re-established manually.',
        contacts: 'Contacts have been restored.',
        settings: 'Application settings have been restored.',
      },
    });
  } catch (error) {
    logger.error({ error }, 'Error importing data');
    next(error);
  }
}
