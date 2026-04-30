/**
 * WhatsApp connection status
 */
export type WhatsAppStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'LOADING';

/**
 * Message filter type
 */
export type MessageFilterType = 'prefix' | 'keyword' | null;

/**
 * Auto-approval mode
 */
export type AutoApprovalMode = 'auto_approve' | 'auto_deny' | 'manual';

/**
 * WhatsApp connection information
 */
export interface WhatsAppConnection {
  status: WhatsAppStatus;
  isConnected: boolean;
  phoneNumber: string | null;
  lastConnectedAt: string | null;
  filterType: MessageFilterType;
  filterValue: string | null;
  processFromSelf: boolean;
  processGroups: boolean;
  markOnlineOnConnect: boolean;
  autoApprovalMode: AutoApprovalMode;
  exceptionsEnabled: boolean;
  exceptionContacts: string[];
}

/**
 * Message filter and source options
 */
export interface MessageFilterConfig {
  filterType: MessageFilterType;
  filterValue: string | null;
  processFromSelf?: boolean;
  processGroups?: boolean;
  markOnlineOnConnect?: boolean;
}

/**
 * WhatsApp QR code event data
 */
export interface WhatsAppQREvent {
  qrCode: string; // Data URL
  timestamp: string;
}

/**
 * WhatsApp status event data
 */
export interface WhatsAppStatusEvent {
  status: 'connected' | 'disconnected' | 'connecting' | 'loading';
  phoneNumber?: string;
  timestamp: string;
  progress?: number;
  message?: string;
}

/**
 * WhatsApp action response
 */
export interface WhatsAppActionResponse {
  success: boolean;
  message: string;
}
