import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { setupService } from '@/services/setup.service';
import { createLogger } from '@/lib/logger';

const logger = createLogger('useSetup');

export function useSetup() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['setup', 'status'],
    queryFn: async () => {
      const result = await setupService.getStatus();
      return result ?? { isComplete: false };
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 1,
  });

  const setupMutation = useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      setupService.completeSetup(username, password),
    onSuccess: async () => {
      await queryClient.setQueryData(['setup', 'status'], { isComplete: true });
      await queryClient.invalidateQueries({ queryKey: ['setup', 'status'] });
      logger.info('Setup completed successfully');
    },
  });

  return {
    isSetupComplete: data?.isComplete ?? null,
    isLoading,
    error,
    completeSetup: setupMutation.mutateAsync,
    isSetupLoading: setupMutation.isPending,
    setupError: setupMutation.error,
  };
}
