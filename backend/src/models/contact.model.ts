export interface ContactModel {
  id: number;
  phoneNumberHash: string;
  contactName?: string | null;
  phoneNumberEncrypted?: string | null;
  replyJid?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContact {
  phoneNumberHash: string;
  contactName?: string | null;
  phoneNumberEncrypted?: string | null;
  replyJid?: string | null;
}

export interface UpdateContact {
  contactName?: string | null;
  updatedAt?: string;
}
