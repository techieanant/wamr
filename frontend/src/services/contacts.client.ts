import { apiClient } from './api.client';
import type { Contact } from '../types/contact.types';

export async function getContacts(): Promise<{ contacts: Contact[] }> {
  return apiClient.get('/api/contacts');
}

export async function getContactById(id: number): Promise<Contact> {
  return apiClient.get(`/api/contacts/${id}`);
}

export async function createContact(data: {
  phoneNumberHash?: string;
  phoneNumber?: string;
  contactName?: string;
}): Promise<Contact> {
  return apiClient.post('/api/contacts', data);
}

export async function updateContact(
  id: number,
  data: { contactName?: string; phoneNumber?: string }
): Promise<Contact> {
  return apiClient.patch(`/api/contacts/${id}`, data);
}

export async function deleteContact(id: number): Promise<{ success: boolean }> {
  return apiClient.delete(`/api/contacts/${id}`);
}
