import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  getContacts,
  createContact,
  updateContact,
  deleteContact,
} from '../services/contacts.client';
import { useSocket } from './use-socket';
import type { Contact, ContactsResponse } from '../types/contact.types';
import type { RequestsResponse } from '../types/request.types';

export function useContacts() {
  const queryClient = useQueryClient();
  const { on, isConnected: socketConnected } = useSocket();

  const contactsQuery = useQuery<ContactsResponse>({
    queryKey: ['contacts'],
    queryFn: () => getContacts(),
  });

  const createMutation = useMutation<
    Contact,
    Error,
    { phoneNumberHash?: string; phoneNumber?: string; contactName?: string }
  >({
    mutationFn: (vars: { phoneNumberHash?: string; phoneNumber?: string; contactName?: string }) =>
      createContact(vars),
    onSuccess: (data: Contact) => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      // Ensure the contact exists in the cached contacts list (append if missing)
      queryClient.setQueriesData<ContactsResponse>({ queryKey: ['contacts'] }, (old) => {
        if (!old) return old;
        const found = old.contacts.some((c) => c.id === data.id);
        if (found)
          return { ...old, contacts: old.contacts.map((c) => (c.id === data.id ? data : c)) };
        return { ...old, contacts: [data, ...old.contacts] };
      });
      // Update requests cache: set contactName for matching phoneNumberHash
      const phoneHash = data?.phoneNumberHash;
      const name = data?.contactName;
      // No previous contact to capture for creation
      if (phoneHash || data?.phoneNumber) {
        const phoneNumber = data?.phoneNumber;
        queryClient.setQueriesData<RequestsResponse>({ queryKey: ['requests'] }, (old) => {
          if (!old) return old;
          return {
            ...old,
            requests: old.requests.map((r) => {
              const matchesHash = phoneHash && r.phoneNumberHash === phoneHash;
              const matchesRaw = phoneNumber && r.requesterPhone === phoneNumber;
              // No old Hash to clear during create
              return matchesHash || matchesRaw ? { ...r, contactName: name } : r;
            }),
          };
        });
        queryClient.invalidateQueries({ queryKey: ['requests'] });
      }
    },
  });

  const updateMutation = useMutation<
    Contact,
    Error,
    { id: number; data: { contactName?: string; phoneNumber?: string } }
  >({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: { contactName?: string; phoneNumber?: string };
    }) => updateContact(id, data),
    onSuccess: (
      data: Contact,
      variables: { id: number; data: { contactName?: string; phoneNumber?: string } }
    ) => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      // Capture previous contact BEFORE updating cache
      const prevContact = (
        queryClient.getQueryData(['contacts']) as ContactsResponse | undefined
      )?.contacts?.find((c) => c.id === variables.id);
      // Update or append updated contact
      queryClient.setQueriesData<ContactsResponse>({ queryKey: ['contacts'] }, (old) => {
        if (!old) return old;
        const found = old.contacts.some((c) => c.id === data.id);
        if (found)
          return { ...old, contacts: old.contacts.map((c) => (c.id === data.id ? data : c)) };
        return { ...old, contacts: [data, ...old.contacts] };
      });
      const phoneHash = data?.phoneNumberHash;
      const name = data?.contactName;
      if (phoneHash || data?.phoneNumber) {
        const phoneNumber = data?.phoneNumber;
        queryClient.setQueriesData<RequestsResponse>({ queryKey: ['requests'] }, (old) => {
          if (!old) return old;
          return {
            ...old,
            requests: old.requests.map((r) => {
              const matchesHash = phoneHash && r.phoneNumberHash === phoneHash;
              const matchesRaw = phoneNumber && r.requesterPhone === phoneNumber;
              // If previous existed and hash changed, clear old hash entries
              if (
                prevContact &&
                prevContact.phoneNumberHash &&
                prevContact.phoneNumberHash !== phoneHash &&
                r.phoneNumberHash === prevContact.phoneNumberHash
              ) {
                return { ...r, contactName: null };
              }
              return matchesHash || matchesRaw ? { ...r, contactName: name } : r;
            }),
          };
        });
        queryClient.invalidateQueries({ queryKey: ['requests'] });
      }
    },
  });

  const deleteMutation = useMutation<{ success: boolean }, Error, number>({
    mutationFn: (id: number) => deleteContact(id),
    onSuccess: (_data: { success: boolean }, id: number) => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      // Remove deleted contact from cache
      queryClient.setQueriesData<ContactsResponse>({ queryKey: ['contacts'] }, (old) => {
        if (!old) return old;
        return { ...old, contacts: old.contacts.filter((c) => c.id !== id) };
      });
      // Find removed contact in cache to get phoneHash
      const contactsCache = queryClient.getQueryData<ContactsResponse>(['contacts']);
      const contact = contactsCache?.contacts?.find((c) => c.id === id);
      const phoneHash = contact?.phoneNumberHash;
      if (phoneHash) {
        queryClient.setQueriesData<RequestsResponse>({ queryKey: ['requests'] }, (old) => {
          if (!old) return old;
          return {
            ...old,
            requests: old.requests.map((r) =>
              r.phoneNumberHash === phoneHash ? { ...r, contactName: null } : r
            ),
          };
        });
        queryClient.invalidateQueries({ queryKey: ['requests'], refetchType: 'active' });
      }
    },
  });

  // Listen for contact update events to refresh contact list and update cached requests
  useEffect(() => {
    if (!socketConnected) return undefined;

    const cleanup = on('request:contact-update', (data: unknown) => {
      const contactData = (Array.isArray(data) ? data[0] : data) as {
        phoneNumberHash?: string;
        contactName?: string | null;
        timestamp: string;
      };

      // Update contacts list cache quickly
      queryClient.setQueriesData<ContactsResponse>({ queryKey: ['contacts'] }, (old) => {
        if (!old) return old;
        const contacts = old.contacts.map((c) =>
          contactData.phoneNumberHash && c.phoneNumberHash === contactData.phoneNumberHash
            ? { ...c, contactName: contactData.contactName }
            : c
        );
        // If contactName was added and not present in list, refetch to include it.
        return { ...old, contacts };
      });

      // Invalidate to ensure UI consistency with backend
      queryClient.invalidateQueries({ queryKey: ['contacts'], refetchType: 'none' });
      // Also ensure requests list is updated, since contactName affects request UI
      // First try updating cached queries to avoid full refetch; if no cache present, mark as stale.
      queryClient.setQueriesData<RequestsResponse>({ queryKey: ['requests'] }, (old) => {
        if (!old) return old;
        return {
          ...old,
          requests: old.requests.map((request) =>
            request.phoneNumberHash === contactData.phoneNumberHash
              ? { ...request, contactName: contactData.contactName }
              : request
          ),
        };
      });
      queryClient.invalidateQueries({ queryKey: ['requests'], refetchType: 'active' });
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, [on, socketConnected, queryClient]);

  return {
    contacts: contactsQuery.data?.contacts || [],
    isLoading: contactsQuery.isLoading,
    createContact: createMutation.mutate,
    updateContact: updateMutation.mutate,
    deleteContact: deleteMutation.mutate,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
