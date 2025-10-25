import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api.client';
import type {
  ServiceConfig,
  CreateServiceRequest,
  UpdateServiceRequest,
  TestConnectionRequest,
  TestConnectionResponse,
  GetMetadataRequest,
  ServiceMetadata,
  ListServicesResponse,
} from '../types/service.types';

/**
 * Query keys for services
 */
const servicesKeys = {
  all: ['services'] as const,
  lists: () => [...servicesKeys.all, 'list'] as const,
  list: () => [...servicesKeys.lists()] as const,
  details: () => [...servicesKeys.all, 'detail'] as const,
  detail: (id: number) => [...servicesKeys.details(), id] as const,
};

/**
 * Fetch all services
 */
async function fetchServices(): Promise<ListServicesResponse> {
  return await apiClient.get<ListServicesResponse>('/api/services');
}

/**
 * Fetch service by ID
 */
async function fetchService(id: number): Promise<ServiceConfig> {
  return await apiClient.get<ServiceConfig>(`/api/services/${id}`);
}

/**
 * Create service
 */
async function createService(data: CreateServiceRequest): Promise<ServiceConfig> {
  return await apiClient.post<ServiceConfig>('/api/services', data);
}

/**
 * Update service
 */
async function updateService(id: number, data: UpdateServiceRequest): Promise<ServiceConfig> {
  return await apiClient.put<ServiceConfig>(`/api/services/${id}`, data);
}

/**
 * Delete service
 */
async function deleteService(id: number): Promise<void> {
  await apiClient.delete(`/api/services/${id}`);
}

/**
 * Test connection
 */
async function testConnection(data: TestConnectionRequest): Promise<TestConnectionResponse> {
  return await apiClient.post<TestConnectionResponse>('/api/services/test-connection', data);
}

/**
 * Get service metadata
 */
async function getMetadata(data: GetMetadataRequest): Promise<ServiceMetadata> {
  return await apiClient.post<ServiceMetadata>('/api/services/metadata', data);
}

/**
 * Hook to fetch all services
 */
export function useServices() {
  return useQuery({
    queryKey: servicesKeys.list(),
    queryFn: fetchServices,
  });
}

/**
 * Hook to fetch service by ID
 */
export function useService(id: number) {
  return useQuery({
    queryKey: servicesKeys.detail(id),
    queryFn: () => fetchService(id),
    enabled: !!id,
  });
}

/**
 * Hook to create service
 */
export function useCreateService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createService,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: servicesKeys.lists() });
    },
  });
}

/**
 * Hook to update service
 */
export function useUpdateService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateServiceRequest }) =>
      updateService(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: servicesKeys.lists() });
      queryClient.invalidateQueries({ queryKey: servicesKeys.detail(variables.id) });
    },
  });
}

/**
 * Hook to delete service
 */
export function useDeleteService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteService,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: servicesKeys.lists() });
    },
  });
}

/**
 * Hook to test connection
 */
export function useTestConnection() {
  return useMutation({
    mutationFn: testConnection,
  });
}

/**
 * Hook to get service metadata
 */
export function useGetMetadata() {
  return useMutation({
    mutationFn: getMetadata,
  });
}
