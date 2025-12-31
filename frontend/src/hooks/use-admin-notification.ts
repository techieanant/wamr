import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAdminNotificationConfig,
  setAdminNotificationPhone,
  setAdminNotificationEnabled,
  sendTestNotification,
  type AdminNotificationConfig,
  type SetPhoneRequest,
} from '../services/admin-notification.client';

export function useAdminNotification() {
  const queryClient = useQueryClient();

  const configQuery = useQuery<AdminNotificationConfig>({
    queryKey: ['admin-notification', 'config'],
    queryFn: getAdminNotificationConfig,
  });

  const setPhoneMutation = useMutation({
    mutationFn: (data: SetPhoneRequest) => setAdminNotificationPhone(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-notification', 'config'] });
    },
  });

  const setEnabledMutation = useMutation({
    mutationFn: (enabled: boolean) => setAdminNotificationEnabled(enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-notification', 'config'] });
    },
  });

  const testNotificationMutation = useMutation({
    mutationFn: sendTestNotification,
  });

  return {
    config: configQuery.data,
    isLoading: configQuery.isLoading,
    isError: configQuery.isError,
    error: configQuery.error,
    setPhone: setPhoneMutation.mutate,
    setPhoneAsync: setPhoneMutation.mutateAsync,
    isSettingPhone: setPhoneMutation.isPending,
    setEnabled: setEnabledMutation.mutate,
    setEnabledAsync: setEnabledMutation.mutateAsync,
    isSettingEnabled: setEnabledMutation.isPending,
    sendTestNotification: testNotificationMutation.mutate,
    sendTestNotificationAsync: testNotificationMutation.mutateAsync,
    isSendingTest: testNotificationMutation.isPending,
  };
}
