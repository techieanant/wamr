import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { apiClient } from '../services/api.client';
import { useSocket } from './use-socket';
import type {
  MediaRequest,
  RequestsResponse,
  DeleteRequestResponse,
  UpdateStatusRequest,
  UpdateStatusResponse,
  RequestStatus,
} from '../types/request.types';

/**
 * Get all requests with pagination
 */
async function getRequests(
  page: number = 1,
  limit: number = 50,
  status?: RequestStatus
): Promise<RequestsResponse> {
  const params: Record<string, string | number> = { page, limit };
  if (status) {
    params.status = status;
  }
  return await apiClient.get<RequestsResponse>('/api/requests', params);
}

/**
 * Get request by ID
 */
async function getRequestById(id: number): Promise<MediaRequest> {
  return await apiClient.get<MediaRequest>(`/api/requests/${id}`);
}

/**
 * Delete request
 */
async function deleteRequest(id: number): Promise<DeleteRequestResponse> {
  return await apiClient.delete<DeleteRequestResponse>(`/api/requests/${id}`);
}

/**
 * Update request status
 */
async function updateRequestStatus(
  id: number,
  data: UpdateStatusRequest
): Promise<UpdateStatusResponse> {
  return await apiClient.patch<UpdateStatusResponse>(`/api/requests/${id}/status`, data);
}

/**
 * Approve request
 */
async function approveRequest(id: number): Promise<UpdateStatusResponse> {
  return await apiClient.post<UpdateStatusResponse>(`/api/requests/${id}/approve`);
}

/**
 * Reject request
 */
async function rejectRequest(id: number, reason?: string): Promise<UpdateStatusResponse> {
  return await apiClient.post<UpdateStatusResponse>(`/api/requests/${id}/reject`, { reason });
}

/**
 * Hook for requests management
 */
export function useRequests(page: number = 1, limit: number = 50, status?: RequestStatus) {
  const queryClient = useQueryClient();
  const { on, isConnected: socketConnected } = useSocket();

  // Query for requests list
  const requestsQuery = useQuery({
    queryKey: ['requests', page, limit, status],
    queryFn: () => getRequests(page, limit, status),
  });

  // Mutation to delete request
  const deleteMutation = useMutation({
    mutationFn: deleteRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
  });

  // Mutation to update status
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateStatusRequest }) =>
      updateRequestStatus(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
  });

  // Mutation to approve request
  const approveMutation = useMutation({
    mutationFn: approveRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
  });

  // Mutation to reject request
  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) => rejectRequest(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
  });

  // Listen for real-time request updates via WebSocket
  useEffect(() => {
    if (!socketConnected) return;

    // Listen to 'request:new' events (new requests created)
    const cleanupNew = on('request:new', () => {
      // Invalidate and refetch requests query to show new request immediately
      queryClient.invalidateQueries({
        queryKey: ['requests'],
        refetchType: 'active', // Force refetch for active queries
      });
    });

    // Listen to 'request:status-update' events (request status changed)
    const cleanupStatusUpdate = on(
      'request:status-update',
      (data: {
        requestId: number;
        status: string;
        previousStatus: string;
        errorMessage?: string;
        timestamp: string;
      }) => {
        // Update the specific request in all queries
        queryClient.setQueriesData(
          { queryKey: ['requests'] },
          (oldData: RequestsResponse | undefined): RequestsResponse | undefined => {
            if (!oldData) return oldData;

            return {
              ...oldData,
              requests: oldData.requests.map((request) =>
                request.id === data.requestId
                  ? {
                      ...request,
                      status: data.status as RequestStatus,
                      errorMessage: data.errorMessage,
                    }
                  : request
              ),
            };
          }
        );

        // Also invalidate to ensure consistency
        queryClient.invalidateQueries({ queryKey: ['requests'], refetchType: 'none' });
      }
    );

    return () => {
      cleanupNew();
      cleanupStatusUpdate();
    };
  }, [on, socketConnected, queryClient]);

  return {
    // Requests data
    requests: requestsQuery.data?.requests || [],
    pagination: requestsQuery.data?.pagination,
    isLoading: requestsQuery.isLoading,
    error: requestsQuery.error,

    // Actions
    deleteRequest: deleteMutation.mutate,
    updateStatus: updateStatusMutation.mutate,
    approveRequest: approveMutation.mutate,
    rejectRequest: rejectMutation.mutate,

    // Mutation states
    isDeleting: deleteMutation.isPending,
    isUpdating: updateStatusMutation.isPending,
    isApproving: approveMutation.isPending,
    isRejecting: rejectMutation.isPending,

    // Errors
    deleteError: deleteMutation.error,
    updateError: updateStatusMutation.error,
    approveError: approveMutation.error,
    rejectError: rejectMutation.error,
  };
}

/**
 * Hook for single request
 */
export function useRequest(id: number) {
  const requestQuery = useQuery({
    queryKey: ['request', id],
    queryFn: () => getRequestById(id),
    enabled: !!id,
  });

  return {
    request: requestQuery.data,
    isLoading: requestQuery.isLoading,
    error: requestQuery.error,
  };
}
