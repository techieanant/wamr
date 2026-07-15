import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../hooks/use-toast';
import { useSocket } from '../hooks/use-socket';
import {
  getBroadcasts,
  getBroadcast,
  createBroadcast,
  cancelBroadcast,
  pauseBroadcast,
  resumeBroadcast,
  retryBroadcast,
  deleteBroadcast,
  getBroadcastContacts,
} from '../services/broadcasts.client';
import type { BroadcastsResponse, Broadcast } from '../types/broadcast.types';

export function useBroadcasts() {
  const queryClient = useQueryClient();

  const broadcastsQuery = useQuery<BroadcastsResponse>({
    queryKey: ['broadcasts'],
    queryFn: () => getBroadcasts(),
    refetchInterval: 5000, // fallback refresh if socket is unavailable
  });

  const { toast } = useToast();
  const { on: onSocket } = useSocket();

  // Live updates: backend emits 'broadcast:updated' on every send completion
  // (covers one-time sends and recurring children, whose parent stays 'active').
  useEffect(() => {
    return onSocket('broadcast:updated', (data) => {
      queryClient.invalidateQueries({ queryKey: ['broadcasts'] });
      const id = data.parentId ?? data.id;
      const failed = data.failedCount ?? 0;
      toast({
        title: `Broadcast #${id} sent`,
        description:
          failed > 0
            ? `Delivered ${data.sentCount ?? 0}/${data.totalRecipients ?? 0} (${failed} failed)`
            : `Delivered ${data.sentCount ?? 0}/${data.totalRecipients ?? 0}`,
      });
    });
  }, [onSocket, queryClient, toast]);

  const createMutation = useMutation<Broadcast, Error, Parameters<typeof createBroadcast>[0]>({
    mutationFn: (vars) => createBroadcast(vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['broadcasts'] });
    },
  });

  const cancelMutation = useMutation<Broadcast, Error, number>({
    mutationFn: (id) => cancelBroadcast(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['broadcasts'] });
    },
  });

  const pauseMutation = useMutation<Broadcast, Error, number>({
    mutationFn: (id) => pauseBroadcast(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['broadcasts'] });
    },
  });

  const resumeMutation = useMutation<Broadcast, Error, number>({
    mutationFn: (id) => resumeBroadcast(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['broadcasts'] });
    },
  });

  const retryMutation = useMutation<Broadcast, Error, number>({
    mutationFn: (id) => retryBroadcast(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['broadcasts'] });
    },
  });

  const deleteMutation = useMutation<{ success: boolean }, Error, number>({
    mutationFn: (id) => deleteBroadcast(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['broadcasts'] });
    },
  });

  return {
    broadcasts: broadcastsQuery.data?.broadcasts || [],
    isLoading: broadcastsQuery.isLoading,
    createBroadcast: createMutation.mutate,
    cancelBroadcast: cancelMutation.mutate,
    pauseBroadcast: pauseMutation.mutate,
    resumeBroadcast: resumeMutation.mutate,
    retryBroadcast: retryMutation.mutate,
    deleteBroadcast: deleteMutation.mutate,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

export function useBroadcast(id: number) {
  return useQuery<Broadcast>({
    queryKey: ['broadcast', id],
    queryFn: () => getBroadcast(id),
    enabled: !!id,
  });
}

export function useBroadcastContacts() {
  return useQuery({
    queryKey: ['broadcast-contacts'],
    queryFn: () => getBroadcastContacts(),
  });
}
