import { apiClient } from './api.client';
import { createLogger } from '@/lib/logger';

const logger = createLogger('setupService');

export interface SetupStatus {
  isComplete: boolean;
}

export interface SetupRequest {
  username: string;
  password: string;
}

export interface SetupResponse {
  success: boolean;
  data: {
    message: string;
    backupCodes: string[];
  };
}

export interface BackupCodeResetRequest {
  code: string;
  newPassword: string;
}

export const setupService = {
  async getStatus(): Promise<SetupStatus> {
    logger.debug('Fetching setup status...');
    const response = await apiClient.get<{
      success: boolean;
      data: SetupStatus;
    }>('/api/setup/status');
    logger.debug('Setup status response:', response);
    return response.data;
  },

  async completeSetup(username: string, password: string): Promise<SetupResponse> {
    logger.debug('Calling completeSetup with username:', username);
    const response = await apiClient.post<{
      success: boolean;
      data: {
        message: string;
        backupCodes: string[];
      };
    }>('/api/setup', {
      username,
      password,
    });
    logger.debug('CompleteSetup response:', response);
    return response;
  },

  async resetPasswordWithBackupCode(
    code: string,
    newPassword: string
  ): Promise<{ success: boolean; data: { message: string } }> {
    const response = await apiClient.post<{
      success: boolean;
      data: { message: string };
    }>('/api/setup/reset-password', {
      code,
      newPassword,
    });
    return response;
  },

  async getBackupCodesCount(): Promise<{ remainingCodes: number }> {
    const response = await apiClient.get<{
      success: boolean;
      data: { remainingCodes: number };
    }>('/api/setup/backup-codes/count');
    return response.data;
  },

  async regenerateBackupCodes(currentPassword: string): Promise<{
    success: boolean;
    data: { message: string; backupCodes: string[] };
  }> {
    const response = await apiClient.post<{
      success: boolean;
      data: { message: string; backupCodes: string[] };
    }>('/api/setup/backup-codes/regenerate', { currentPassword });
    return response;
  },
};
