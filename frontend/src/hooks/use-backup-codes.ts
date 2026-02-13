import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { setupService } from '@/services/setup.service';
import { createLogger } from '@/lib/logger';

const logger = createLogger('useBackupCodes');

export function useBackupCodesCount() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['backupCodes', 'count'],
    queryFn: async () => {
      const result = await setupService.getBackupCodesCount();
      return result.remainingCodes;
    },
    staleTime: 60000,
    gcTime: 300000,
  });

  return {
    remainingCodes: data ?? 0,
    isLoading,
    error,
    refetch,
  };
}

export function useBackupCodes() {
  const queryClient = useQueryClient();

  const regenerateMutation = useMutation({
    mutationFn: (currentPassword: string) => setupService.regenerateBackupCodes(currentPassword),
    onSuccess: (response) => {
      if (response.success) {
        queryClient.invalidateQueries({ queryKey: ['backupCodes', 'count'] });
        logger.info('Backup codes regenerated');
      }
    },
  });

  return {
    regenerateBackupCodes: regenerateMutation.mutateAsync,
    isRegenerating: regenerateMutation.isPending,
    regenerateError: regenerateMutation.error,
  };
}
