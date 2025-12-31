import { apiClient } from './api.client';

export interface AdminNotificationConfig {
  phoneNumber: string | null;
  countryCode: string | null;
  enabled: boolean;
  isConfigured: boolean;
  whatsappConnected: boolean;
}

export interface SetPhoneRequest {
  phoneNumber?: string;
  countryCode?: string;
  contactId?: number;
}

/**
 * Get admin notification configuration
 */
export async function getAdminNotificationConfig(): Promise<AdminNotificationConfig> {
  const response = await apiClient.get<{ success: boolean; data: AdminNotificationConfig }>(
    '/api/admin-notifications/config'
  );
  return response.data;
}

/**
 * Set admin notification phone number
 */
export async function setAdminNotificationPhone(data: SetPhoneRequest): Promise<void> {
  await apiClient.put('/api/admin-notifications/phone', data);
}

/**
 * Enable or disable admin notifications
 */
export async function setAdminNotificationEnabled(enabled: boolean): Promise<void> {
  await apiClient.put('/api/admin-notifications/enabled', { enabled });
}

/**
 * Send test notification to admin
 */
export async function sendTestNotification(): Promise<{ success: boolean; message: string }> {
  const response = await apiClient.post<{ success: boolean; message: string }>(
    '/api/admin-notifications/test'
  );
  return response;
}
