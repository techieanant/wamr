import { useEffect, useRef, useState } from 'react';
import { useWhatsApp } from '../hooks/use-whatsapp';
import { useSocket } from '../hooks/use-socket';
import { useToast } from '../hooks/use-toast';
import { Button } from '../components/ui/button';
import { QRCodeDisplay } from '../components/whatsapp/qr-code-display';
import { ConnectionStatus } from '../components/whatsapp/connection-status';
import { MessageFilterForm } from '../components/whatsapp/message-filter-form';
import { MessageSourcesCard } from '../components/whatsapp/message-sources-card';
import { PhoneNotificationsCard } from '../components/whatsapp/phone-notifications-card';
import { Smartphone, Loader2, RefreshCw, Trash2, AlertTriangle } from 'lucide-react';
import type { MessageFilterType } from '../types/whatsapp.types';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../components/ui/alert-dialog';

export default function WhatsAppConnection() {
  const {
    status,
    connect,
    resetSession,
    updateFilter,
    isConnecting,
    isResettingSession,
    isUpdatingFilter,
    isLoading,
  } = useWhatsApp();
  // Ensure the page subscribes to socket events directly so we don't miss QR/status updates
  const { on, isConnected: socketConnected } = useSocket();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [hasClickedConnect, setHasClickedConnect] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [realtimeConnecting, setRealtimeConnecting] = useState(false);
  const [autoReconnectAttempt, setAutoReconnectAttempt] = useState(0);

  // Refs for auto-reconnect state (avoid stale closure issues)
  const autoReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoReconnectAttemptRef = useRef(0);
  const MAX_AUTO_RECONNECT_ATTEMPTS = 3;

  // On mount, check if already connected via API
  useEffect(() => {
    if (status?.status === 'CONNECTED') {
      setRealtimeConnected(true);
      setHasClickedConnect(false);
    }
  }, [status?.status]);

  // Poll for status when socket connects (to catch any missed events)
  useEffect(() => {
    if (socketConnected) {
      const timer = setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ['whatsapp', 'status'] });
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [socketConnected, queryClient]);

  // Listen for real-time connection status via WebSocket
  useEffect(() => {
    if (!socketConnected) {
      return;
    }

    const cleanup = on('whatsapp:status', (data) => {
      // Handle array-wrapped data from Socket.IO
      const statusData = Array.isArray(data) ? data[0] : data;

      // Status updates handled by TanStack Query now

      if (statusData.status === 'connected') {
        setRealtimeConnected(true);
        setHasClickedConnect(false); // Hide QR immediately
        setRealtimeConnecting(false);

        // Force immediate refetch of full status to get filter settings
        queryClient.refetchQueries({ queryKey: ['whatsapp', 'status'] });

        // Show success toast after a short delay to ensure data is loaded
        setTimeout(() => {
          toast({
            title: 'WhatsApp Connected',
            description: 'Your WhatsApp account has been successfully connected.',
          });
        }, 500);
      } else if (statusData.status === 'loading' && statusData.progress === 100) {
        // When loading reaches 100%, it means connection is about to complete
        // Force refetch to get the latest status
        setTimeout(() => {
          queryClient.refetchQueries({ queryKey: ['whatsapp', 'status'] });
        }, 1000);
      } else if (statusData.status === 'connecting') {
        // Set a separate flag to indicate we're actively connecting and waiting on QR
        setRealtimeConnecting(true);
        setRealtimeConnected(false);
      } else {
        setRealtimeConnected(false);
        setRealtimeConnecting(false);
      }
    });

    return () => {
      cleanup();
    };
  }, [on, socketConnected, queryClient, toast]);

  // Auto-reconnect with exponential backoff when status transitions to DISCONNECTED
  // Only triggers on a live disconnect (not on initial page load if already disconnected).
  const prevStatusRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const currentStatus = status?.status;
    const prevStatus = prevStatusRef.current;

    // Detect a fresh transition to DISCONNECTED (not initial undefined→DISCONNECTED)
    // Only auto-reconnect when we had an established CONNECTED session — not on QR timeout.
    if (
      prevStatus !== undefined && // skip initial mount
      prevStatus === 'CONNECTED' && // must have had a live session
      currentStatus === 'DISCONNECTED'
    ) {
      // Clear any existing timer
      if (autoReconnectTimerRef.current) {
        clearTimeout(autoReconnectTimerRef.current);
        autoReconnectTimerRef.current = null;
      }
      autoReconnectAttemptRef.current = 0;
      setAutoReconnectAttempt(0);

      const attemptReconnect = () => {
        const attempt = autoReconnectAttemptRef.current + 1;

        if (attempt > MAX_AUTO_RECONNECT_ATTEMPTS) {
          toast({
            title: 'Auto-reconnect failed',
            description:
              'Could not reconnect automatically. Please click "Connect WhatsApp" to try again.',
            variant: 'destructive',
          });
          autoReconnectAttemptRef.current = 0;
          setAutoReconnectAttempt(0);
          return;
        }

        autoReconnectAttemptRef.current = attempt;
        setAutoReconnectAttempt(attempt);

        toast({
          title: `Auto-reconnecting... (${attempt}/${MAX_AUTO_RECONNECT_ATTEMPTS})`,
          description: 'WhatsApp disconnected. Attempting to reconnect automatically.',
        });

        connect();

        // Schedule next retry with exponential backoff: 4s, 8s, 16s
        const nextDelay = Math.pow(2, attempt + 1) * 1000;
        autoReconnectTimerRef.current = setTimeout(attemptReconnect, nextDelay);
      };

      // First attempt after 2 seconds
      autoReconnectTimerRef.current = setTimeout(attemptReconnect, 2000);
    }

    prevStatusRef.current = currentStatus;

    // Cancel retry if we reconnected successfully
    if (currentStatus === 'CONNECTED' && autoReconnectTimerRef.current) {
      clearTimeout(autoReconnectTimerRef.current);
      autoReconnectTimerRef.current = null;
      autoReconnectAttemptRef.current = 0;
      setAutoReconnectAttempt(0);
    }

    return () => {
      // Cleanup on unmount
    };
  }, [status?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (autoReconnectTimerRef.current) {
        clearTimeout(autoReconnectTimerRef.current);
      }
    };
  }, []);

  const isConnected = status?.status === 'CONNECTED' || realtimeConnected;
  const isConnecting_status = status?.status === 'CONNECTING';
  const isLoading_status = status?.status === 'LOADING';
  const isDisconnected = status?.status === 'DISCONNECTED';

  // Reset hasClickedConnect when connected
  useEffect(() => {
    if (isConnected) {
      setHasClickedConnect(false);
    }
  }, [isConnected]);

  // Also reset hasClickedConnect when disconnected (to allow reconnecting)
  useEffect(() => {
    if (isDisconnected) {
      setHasClickedConnect(false);
    }
  }, [isDisconnected]);

  // Show QR display if user clicked connect OR if status is CONNECTING, but NEVER if connected
  // Also check if we're actually disconnected to avoid showing QR during state transitions
  const shouldShowQR =
    (hasClickedConnect || isConnecting_status || realtimeConnecting) &&
    !isConnected &&
    status?.status !== 'CONNECTED';

  const handleConnect = () => {
    setHasClickedConnect(true);
    connect();
  };

  const handleFilterSave = (payload: {
    filterType: MessageFilterType;
    filterValue: string | null;
  }) => {
    if (!status) {
      toast({
        title: 'Unable to save filter',
        description: 'Connection status is not yet loaded. Please try again in a moment.',
        variant: 'destructive',
      });
      return;
    }
    updateFilter(
      {
        ...payload,
        processFromSelf: status.processFromSelf,
        processGroups: status.processGroups,
        markOnlineOnConnect: status.markOnlineOnConnect,
      },
      {
        onSuccess: () => {
          toast({
            title: 'Filter saved',
            description: payload.filterType
              ? `Message filter set to ${payload.filterType}: "${payload.filterValue}"`
              : 'Message filter removed. All messages will be processed.',
          });
        },
        onError: (error) => {
          toast({
            title: 'Update failed',
            description: error instanceof Error ? error.message : 'Failed to update message filter',
            variant: 'destructive',
          });
        },
      }
    );
  };

  const handleMessageSourcesSave = (processFromSelf: boolean, processGroups: boolean) => {
    if (!status) {
      toast({
        title: 'Unable to update message sources',
        description: 'Connection status is not yet loaded. Please try again in a moment.',
        variant: 'destructive',
      });
      return;
    }
    updateFilter(
      {
        filterType: status.filterType,
        filterValue: status.filterValue,
        processFromSelf,
        processGroups,
        markOnlineOnConnect: status.markOnlineOnConnect,
      },
      {
        onSuccess: () => {
          const parts = ['1:1 from others'];
          if (processFromSelf) parts.push('from self');
          if (processGroups) parts.push('from groups');
          toast({
            title: 'Message sources updated',
            description: parts.join(', ') + '.',
          });
        },
        onError: (error) => {
          toast({
            title: 'Update failed',
            description:
              error instanceof Error ? error.message : 'Failed to update message sources',
            variant: 'destructive',
          });
        },
      }
    );
  };

  const handlePhoneNotificationsSave = (markOnlineOnConnect: boolean) => {
    if (!status) {
      toast({
        title: 'Unable to update phone notifications',
        description: 'Connection status is not yet loaded. Please try again in a moment.',
        variant: 'destructive',
      });
      return;
    }
    updateFilter(
      {
        filterType: status.filterType,
        filterValue: status.filterValue,
        processFromSelf: status.processFromSelf,
        processGroups: status.processGroups,
        markOnlineOnConnect,
      },
      {
        onSuccess: () => {
          toast({
            title: 'Phone notifications updated',
            description: markOnlineOnConnect
              ? 'Phone will appear online when connected (notifications suppressed).'
              : 'Phone will receive notifications normally when connected.',
          });
        },
        onError: (error) => {
          toast({
            title: 'Update failed',
            description:
              error instanceof Error ? error.message : 'Failed to update phone notifications',
            variant: 'destructive',
          });
        },
      }
    );
  };

  const handleResetSession = () => {
    resetSession(undefined, {
      onSuccess: () => {
        setHasClickedConnect(false);
        setRealtimeConnected(false);
        setRealtimeConnecting(false);
        queryClient.invalidateQueries({ queryKey: ['whatsapp', 'status'] });
        toast({
          title: 'Session Reset',
          description: 'WhatsApp session cleared. Click "Connect WhatsApp" to scan a new QR code.',
        });
      },
      onError: (error) => {
        toast({
          title: 'Reset Failed',
          description: error instanceof Error ? error.message : 'Failed to reset WhatsApp session',
          variant: 'destructive',
        });
      },
    });
  };

  if (isLoading && !shouldShowQR) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Loading WhatsApp status...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold md:text-3xl">
            <Smartphone className="h-6 w-6 md:h-8 md:w-8" />
            WhatsApp Connection
          </h1>
          <p className="mt-2 text-muted-foreground">
            Connect your WhatsApp account to start receiving media requests
          </p>
        </div>

        {!isConnected && !isConnecting_status && (
          <div className="flex gap-2">
            <Button size="lg" onClick={handleConnect} disabled={isConnecting}>
              {isConnecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                'Connect WhatsApp'
              )}
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => queryClient.refetchQueries({ queryKey: ['whatsapp', 'status'] })}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh Status
            </Button>
          </div>
        )}
      </div>

      {/* Auto-reconnect indicator */}
      {autoReconnectAttempt > 0 && !isConnected && (
        <div className="flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          <span>
            Auto-reconnecting... (attempt {autoReconnectAttempt}/{MAX_AUTO_RECONNECT_ATTEMPTS})
          </span>
        </div>
      )}

      {/* Connection Status */}
      <ConnectionStatus />

      {/* QR Code Display (only show when connecting) */}
      {shouldShowQR && <QRCodeDisplay />}

      {/* Message Filter (only show when connected) */}
      {isConnected && (
        <MessageFilterForm
          currentFilterType={status?.filterType || null}
          currentFilterValue={status?.filterValue || null}
          onSave={handleFilterSave}
          isSaving={isUpdatingFilter}
        />
      )}

      {/* Message sources – own section (only show when connected) */}
      {isConnected && (
        <MessageSourcesCard
          processFromSelf={status?.processFromSelf ?? false}
          processGroups={status?.processGroups ?? false}
          onSave={handleMessageSourcesSave}
          isSaving={isUpdatingFilter}
        />
      )}

      {/* Phone notifications – only show when connected */}
      {isConnected && (
        <PhoneNotificationsCard
          markOnlineOnConnect={status?.markOnlineOnConnect ?? false}
          onSave={handlePhoneNotificationsSave}
          isSaving={isUpdatingFilter}
        />
      )}

      {/* Instructions */}
      {isConnected && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-6 dark:border-green-800 dark:bg-green-950">
          <h3 className="mb-2 text-lg font-semibold text-green-900 dark:text-green-100">
            ✓ WhatsApp Connected Successfully
          </h3>
          <p className="text-green-700 dark:text-green-300">
            Your WhatsApp account is now linked. Users can send media requests to your connected
            phone number.
          </p>
        </div>
      )}

      {!isConnected && !isConnecting_status && !isConnecting && !isLoading_status && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-6 dark:border-blue-800 dark:bg-blue-950">
          <h3 className="mb-2 text-lg font-semibold text-blue-900 dark:text-blue-100">
            Getting Started
          </h3>
          <ul className="space-y-2 text-blue-700 dark:text-blue-300">
            <li>• Click "Connect WhatsApp" to generate a QR code</li>
            <li>• Scan the QR code with your WhatsApp mobile app</li>
            <li>• Your session will be saved for automatic reconnection</li>
            <li>• Users will be able to send requests to your linked number</li>
          </ul>
        </div>
      )}

      {/* Troubleshooting Section */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-950">
        <h3 className="mb-2 flex items-center gap-2 text-lg font-semibold text-amber-900 dark:text-amber-100">
          <AlertTriangle className="h-5 w-5" />
          Troubleshooting
        </h3>
        <p className="mb-4 text-amber-700 dark:text-amber-300">
          If you're experiencing connection issues, errors, or the QR code isn't working, you can
          reset your WhatsApp session. This will clear all session data and require you to scan the
          QR code again.
        </p>
        <AlertDialog>
          {/* Type cast needed due to Radix UI version mismatch in lockfile */}
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <AlertDialogTrigger asChild {...({} as any)}>
            <Button
              variant="outline"
              className="border-amber-300 hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900"
              disabled={isResettingSession}
            >
              {isResettingSession ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Resetting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Reset WhatsApp Session
                </>
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset WhatsApp Session?</AlertDialogTitle>
              <AlertDialogDescription>
                This will clear all WhatsApp session data. You will need to scan the QR code again
                to reconnect. This is useful if you're experiencing connection issues or errors.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleResetSession}>Reset Session</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
