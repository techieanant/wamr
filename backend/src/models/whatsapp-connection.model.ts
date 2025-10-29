/**
 * WhatsApp Connection Model
 * Represents WhatsApp Web connection status and metadata
 */

export type WhatsAppConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED';
export type MessageFilterType = 'prefix' | 'keyword' | null;
export type AutoApprovalMode = 'auto_approve' | 'auto_deny' | 'manual';

export interface WhatsAppConnection {
  id: number;
  phoneNumberHash: string;
  status: WhatsAppConnectionStatus;
  lastConnectedAt: Date | null;
  qrCodeGeneratedAt: Date | null;
  filterType: MessageFilterType;
  filterValue: string | null;
  autoApprovalMode: AutoApprovalMode;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * WhatsApp connection creation data
 */
export interface CreateWhatsAppConnection {
  phoneNumberHash: string;
  status: WhatsAppConnectionStatus;
  lastConnectedAt?: Date;
  qrCodeGeneratedAt?: Date;
  autoApprovalMode?: AutoApprovalMode;
}

/**
 * WhatsApp connection update data
 */
export interface UpdateWhatsAppConnection {
  status?: WhatsAppConnectionStatus;
  lastConnectedAt?: Date | null;
  qrCodeGeneratedAt?: Date | null;
  autoApprovalMode?: AutoApprovalMode;
}

/**
 * WhatsApp connection for API responses
 */
export interface WhatsAppConnectionResponse {
  id: number;
  phoneNumberHash: string;
  status: WhatsAppConnectionStatus;
  lastConnectedAt: Date | null;
  filterType: MessageFilterType;
  filterValue: string | null;
  autoApprovalMode: AutoApprovalMode;
  createdAt: Date;
  isConnected: boolean;
}
