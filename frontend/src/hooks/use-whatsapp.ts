import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { createLogger } from '@/lib/logger';

const logger = createLogger('whatsapp');
import { apiClient } from '../services/api.client';
import { useSocket } from './use-socket';
import type {
  WhatsAppConnection,
  WhatsAppActionResponse,
  MessageFilterConfig,
  WhatsAppStatusEvent,
} from '../types/whatsapp.types';

/**
 * Get WhatsApp connection status (initial load only)
 */
async function getWhatsAppStatus(): Promise<WhatsAppConnection> {
  return await apiClient.get<WhatsAppConnection>('/api/whatsapp/status');
}

/**
 * Connect to WhatsApp (initiate connection)
 */
async function connectWhatsApp(): Promise<WhatsAppActionResponse> {
  return await apiClient.post<WhatsAppActionResponse>('/api/whatsapp/connect');
}

/**
 * Disconnect from WhatsApp
 */
async function disconnectWhatsApp(): Promise<WhatsAppActionResponse> {
  return await apiClient.post<WhatsAppActionResponse>('/api/whatsapp/disconnect');
}

/**
 * Restart WhatsApp connection
 */
async function restartWhatsApp(): Promise<WhatsAppActionResponse> {
  return await apiClient.post<WhatsAppActionResponse>('/api/whatsapp/restart');
}

/**
 * Update message filter configuration
 */
async function updateMessageFilter(
  config: MessageFilterConfig
): Promise<WhatsAppActionResponse & MessageFilterConfig> {
  return await apiClient.put<WhatsAppActionResponse & MessageFilterConfig>(
    '/api/whatsapp/filter',
    config
  );
}

/**
 * Hook for WhatsApp status management with WebSocket real-time updates
 */
export function useWhatsApp() {
  const queryClient = useQueryClient();
  const { on, isConnected: socketConnected } = useSocket();

  // Query for WhatsApp status (initial load only, no polling)
  const statusQuery = useQuery({
    queryKey: ['whatsapp', 'status'],
    queryFn: getWhatsAppStatus,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  });

  // Mutation to connect
  const connectMutation = useMutation({
    mutationFn: connectWhatsApp,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'status'] });
    },
  });

  // Mutation to disconnect
  const disconnectMutation = useMutation({
    mutationFn: disconnectWhatsApp,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'status'] });
      queryClient.refetchQueries({ queryKey: ['whatsapp', 'status'] });
    },
  });

  // Mutation to restart
  const restartMutation = useMutation({
    mutationFn: restartWhatsApp,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'status'] });
    },
  });

  // Mutation to update message filter
  const updateFilterMutation = useMutation({
    mutationFn: updateMessageFilter,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'status'] });
    },
  });

  // Listen for real-time status updates via WebSocket
  useEffect(() => {
    if (!socketConnected) return;

    // Listen to 'whatsapp:status' events (connection state changes with phone number)
    const cleanupStatus = on('whatsapp:status', (data: WhatsAppStatusEvent) => {
      queryClient.setQueryData(
        ['whatsapp', 'status'],
        (old: WhatsAppConnection | undefined): WhatsAppConnection => {
          const status = data.status.toUpperCase() as WhatsAppConnection['status'];
          const isConnected = data.status === 'connected';

          if (old) {
            return {
              ...old,
              isConnected,
              status,
              phoneNumber: data.phoneNumber || old.phoneNumber || null,
            };
          }

          return {
            isConnected,
            status,
            phoneNumber: data.phoneNumber || null,
            lastConnectedAt: null,
            filterType: null,
            filterValue: null,
            autoApprovalMode: 'auto_approve',
          };
        }
      );

      // When connection completes, refetch full status to get filter settings
      if (data.status === 'connected') {
        queryClient.refetchQueries({ queryKey: ['whatsapp', 'status'] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['whatsapp', 'status'], refetchType: 'none' });
      }
    });

    // Listen to 'status-change' events (loading progress updates)
    const cleanupStatusChange = on('status-change', (data) => {
      if (!data.status) return;

      queryClient.setQueryData(
        ['whatsapp', 'status'],
        (old: WhatsAppConnection | undefined): WhatsAppConnection => {
          const status = data.status.toUpperCase() as WhatsAppConnection['status'];
          const isConnected = data.status === 'connected';

          if (old) {
            return { ...old, isConnected, status };
          }

          return {
            isConnected,
            status,
            phoneNumber: null,
            lastConnectedAt: null,
            filterType: null,
            filterValue: null,
            autoApprovalMode: 'auto_approve',
          };
        }
      );

      // When loading reaches 100%, wait a bit then refetch to get final connected status
      if (data.status === 'loading' && data.progress === 100) {
        logger.debug('Loading reached 100%, scheduling status refetch...');
        setTimeout(() => {
          queryClient.refetchQueries({ queryKey: ['whatsapp', 'status'] });
        }, 2000); // Wait 2 seconds for WhatsApp to fully connect
      } else {
        queryClient.invalidateQueries({ queryKey: ['whatsapp', 'status'], refetchType: 'none' });
      }
    });

    return () => {
      cleanupStatus();
      cleanupStatusChange();
    };
  }, [on, socketConnected, queryClient]);

  return {
    // Status
    status: statusQuery.data,
    isLoading: statusQuery.isLoading,
    error: statusQuery.error,

    // Actions
    connect: connectMutation.mutate,
    disconnect: disconnectMutation.mutate,
    restart: restartMutation.mutate,
    updateFilter: updateFilterMutation.mutate,

    // Mutation states
    isConnecting: connectMutation.isPending,
    isDisconnecting: disconnectMutation.isPending,
    isRestarting: restartMutation.isPending,
    isUpdatingFilter: updateFilterMutation.isPending,

    // Action results
    connectError: connectMutation.error,
    disconnectError: disconnectMutation.error,
    restartError: restartMutation.error,
    updateFilterError: updateFilterMutation.error,
  };
}
