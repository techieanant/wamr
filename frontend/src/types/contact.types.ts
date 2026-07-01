export interface ContactQuota {
  maxRequests: number;
  windowType: 'daily' | 'weekly' | 'monthly';
  used?: number;
  resetTime?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ContactUsage {
  used: number;
  max: number;
  windowType?: 'daily' | 'weekly' | 'monthly';
  resetTime?: string;
}

export interface Contact {
  id: number;
  phoneNumberHash: string;
  phoneNumber?: string | null;
  maskedPhone?: string | null;
  contactName?: string | null;
  quota?: ContactQuota | null;
  quotaUsage?: ContactUsage | null;
  usage?: ContactUsage | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactsResponse {
  contacts: Contact[];
}
