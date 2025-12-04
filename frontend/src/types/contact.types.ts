export interface Contact {
  id: number;
  phoneNumberHash: string;
  phoneNumber?: string | null;
  maskedPhone?: string | null;
  contactName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactsResponse {
  contacts: Contact[];
}
