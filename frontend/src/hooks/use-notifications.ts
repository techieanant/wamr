import { useEffect, useState } from 'react';
import { useSocket } from './use-socket';

export function useNotifications(enabled: boolean) {
  const { on, isConnected } = useSocket();
  const [permissionGranted, setPermissionGranted] = useState(
    typeof Notification !== 'undefined' && Notification.permission === 'granted'
  );

  // Request permission on mount if enabled
  useEffect(() => {
    if (!enabled || typeof Notification === 'undefined') {
      return;
    }

    const requestPermission = async () => {
      if (Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        setPermissionGranted(permission === 'granted');
      } else if (Notification.permission === 'granted') {
        setPermissionGranted(true);
      }
    };

    requestPermission();
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !permissionGranted || !isConnected) {
      return;
    }

    // Handler for new requests
    const cleanupNewRequest = on(
      'request:new',
      (data: { requestId: number; title: string; user: string; status: string }) => {
        new Notification('New Media Request', {
          body: `${data.user} requested: ${data.title}`,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: `request-${data.requestId}`,
        });
      }
    );

    // Handler for request status updates
    const cleanupStatusUpdate = on(
      'request:status-update',
      (data: { requestId: number; status: string; previousStatus: string }) => {
        const statusEmoji: Record<string, string> = {
          APPROVED: '✅',
          REJECTED: '❌',
          FAILED: '⚠️',
          SUBMITTED: '📤',
          PENDING: '⏳',
        };

        new Notification('Request Status Update', {
          body: `${statusEmoji[data.status] || '📝'} Request #${data.requestId}: ${data.previousStatus} → ${data.status}`,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: `status-${data.requestId}`,
        });
      }
    );

    return () => {
      cleanupNewRequest();
      cleanupStatusUpdate();
    };
  }, [enabled, permissionGranted, isConnected, on]);

  return { permissionGranted };
}
