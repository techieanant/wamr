import { useEffect, useState } from 'react';
import { useWhatsApp } from '../hooks/use-whatsapp';
import { useSocket } from '../hooks/use-socket';
import { useToast } from '../hooks/use-toast';
import { Button } from '../components/ui/button';
import { QRCodeDisplay } from '../components/whatsapp/qr-code-display';
import { ConnectionStatus } from '../components/whatsapp/connection-status';
import { MessageFilterForm } from '../components/whatsapp/message-filter-form';
import { Smartphone, Loader2 } from 'lucide-react';
import type { MessageFilterType } from '../types/whatsapp.types';
import { useQueryClient } from '@tanstack/react-query';

export default function WhatsAppConnection() {
  const { status, connect, updateFilter, isConnecting, isUpdatingFilter, isLoading } =
    useWhatsApp();
  const { on, isConnected: socketConnected } = useSocket(false); // Don't auto-connect (App.tsx handles it)
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [hasClickedConnect, setHasClickedConnect] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);

  // Listen for real-time connection status via WebSocket
  useEffect(() => {
    if (!socketConnected) {
      return;
    }

    const cleanup = on('whatsapp:status', (data) => {
      // Status updates handled by TanStack Query now

      if (data.status === 'connected') {
        setRealtimeConnected(true);
        setHasClickedConnect(false); // Hide QR immediately

        // Force immediate refetch of full status to get filter settings
        queryClient.refetchQueries({ queryKey: ['whatsapp', 'status'] });

        // Show success toast after a short delay to ensure data is loaded
        setTimeout(() => {
          toast({
            title: 'WhatsApp Connected',
            description: 'Your WhatsApp account has been successfully connected.',
          });
        }, 500);
      } else if (data.status === 'loading' && data.progress === 100) {
        // When loading reaches 100%, it means connection is about to complete
        // Force refetch to get the latest status
        setTimeout(() => {
          queryClient.refetchQueries({ queryKey: ['whatsapp', 'status'] });
        }, 1000);
      } else {
        setRealtimeConnected(false);
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
    (hasClickedConnect || isConnecting_status) && !isConnected && status?.status !== 'CONNECTED';

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

  if (isLoading) {
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
    </div>
  );
}
