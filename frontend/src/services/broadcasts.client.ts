import { apiClient } from './api.client';
import type {
  Broadcast,
  BroadcastsResponse,
  ComposeBroadcastInput,
} from '../types/broadcast.types';

export async function getBroadcasts(): Promise<BroadcastsResponse> {
  return apiClient.get('/api/broadcasts');
}

export async function getBroadcast(id: number): Promise<Broadcast> {
  return apiClient.get(`/api/broadcasts/${id}`);
}

export async function createBroadcast(data: ComposeBroadcastInput): Promise<Broadcast> {
  return apiClient.post('/api/broadcasts', data);
}

export async function cancelBroadcast(id: number): Promise<Broadcast> {
  return apiClient.post(`/api/broadcasts/${id}/cancel`, {});
}

export async function pauseBroadcast(id: number): Promise<Broadcast> {
  return apiClient.post(`/api/broadcasts/${id}/pause`, {});
}

export async function resumeBroadcast(id: number): Promise<Broadcast> {
  return apiClient.post(`/api/broadcasts/${id}/resume`, {});
}

export async function retryBroadcast(id: number): Promise<Broadcast> {
  return apiClient.post(`/api/broadcasts/${id}/retry`, {});
}

export async function deleteBroadcast(id: number): Promise<{ success: boolean }> {
  return apiClient.delete(`/api/broadcasts/${id}`);
}

export async function getBroadcastContacts(): Promise<{
  contacts: { id: number; contactName: string | null; phoneNumber?: string | null }[];
}> {
  return apiClient.get('/api/broadcasts/contacts');
}
