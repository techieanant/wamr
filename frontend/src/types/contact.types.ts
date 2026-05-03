export interface ContactQuota {
  maxRequests: number;
  windowType: 'daily' | 'weekly' | 'monthly';
  createdAt: string;
  updatedAt: string;
}

export interface ContactUsage {
  used: number;
  max: number;
}

export interface Contact {
  id: number;
  phoneNumberHash: string;
  phoneNumber?: string | null;
  maskedPhone?: string | null;
  contactName?: string | null;
  quota?: ContactQuota | null;
  usage?: ContactUsage | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactsResponse {
  contacts: Contact[];
}
