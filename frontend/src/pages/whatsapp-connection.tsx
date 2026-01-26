import { useEffect, useState } from 'react';
import { useWhatsApp } from '../hooks/use-whatsapp';
import { useSocket } from '../hooks/use-socket';
import { useToast } from '../hooks/use-toast';
import { Button } from '../components/ui/button';
import { QRCodeDisplay } from '../components/whatsapp/qr-code-display';
import { ConnectionStatus } from '../components/whatsapp/connection-status';
import { MessageFilterForm } from '../components/whatsapp/message-filter-form';
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

  // Auto-connect if disconnected (will trigger QR generation)
  useEffect(() => {
    if (!isLoading && status?.status === 'DISCONNECTED') {
      // Don't auto-connect, let user click the button
    }
  }, [isLoading, status]);

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

  const handleFilterSave = (filterType: MessageFilterType, filterValue: string | null) => {
    updateFilter(
      { filterType, filterValue },
      {
        onSuccess: () => {
          toast({
            title: 'Filter Updated',
            description: filterType
              ? `Message filter set to ${filterType}: "${filterValue}"`
              : 'Message filter removed. All messages will be processed.',
          });
        },
        onError: (error) => {
          toast({
            title: 'Filter Update Failed',
            description: error instanceof Error ? error.message : 'Failed to update message filter',
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

        {!isConnected && !isConnecting_status && !isLoading_status && (
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

      {/* Connection Status */}
      <ConnectionStatus />

      {/* QR Code Display (only show when connecting) */}
      {shouldShowQR && <QRCodeDisplay />}

      {/* Message Filter Configuration (only show when connected) */}
      {isConnected && (
        <MessageFilterForm
          currentFilterType={status?.filterType || null}
          currentFilterValue={status?.filterValue || null}
          onSave={handleFilterSave}
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
          <AlertDialogTrigger asChild>
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
