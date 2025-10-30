import { useEffect, useState } from 'react';
import { useSocket } from '../../hooks/use-socket';
import { useWhatsApp } from '../../hooks/use-whatsapp';
import type { WhatsAppStatusEvent } from '../../types/whatsapp.types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { CheckCircle2, XCircle, Loader2, RefreshCw, Power } from 'lucide-react';
import { createLogger } from '@/lib/logger';

const logger = createLogger('whatsapp-connection');

export function ConnectionStatus() {
  const { on, isConnected: socketConnected } = useSocket(false); // Don't auto-connect (App.tsx handles it)
  const { status, disconnect, restart, isDisconnecting, isRestarting } = useWhatsApp();
  const [realtimeStatus, setRealtimeStatus] = useState<
    'connected' | 'disconnected' | 'connecting' | 'loading' | null
  >(null);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [loadingProgress, setLoadingProgress] = useState<number | undefined>();
  const [loadingMessage, setLoadingMessage] = useState<string | undefined>();

  // Listen for real-time status updates via WebSocket
  useEffect(() => {
    if (!socketConnected) return;

    // Handle whatsapp:status events
    const cleanupStatus = on('whatsapp:status', (data: WhatsAppStatusEvent) => {
      logger.debug('Received whatsapp:status:', data);

      setRealtimeStatus(data.status);
      if (data.phoneNumber) {
        setPhoneNumber(data.phoneNumber);
      }
      if (data.progress !== undefined) {
        setLoadingProgress(data.progress);
      }
      if (data.message) {
        setLoadingMessage(data.message);
      }

      // Clear loading indicators when connected or disconnected
      if (data.status === 'connected' || data.status === 'disconnected') {
        setLoadingProgress(undefined);
        setLoadingMessage(undefined);
      }
    });

    // Handle status-change events (includes loading progress)
    const cleanupStatusChange = on('status-change', (data) => {
      logger.debug('Received status-change:', data);

      const statusValue = data.status as 'connected' | 'disconnected' | 'connecting' | 'loading';
      setRealtimeStatus(statusValue);

      if (data.progress !== undefined) {
        setLoadingProgress(data.progress);

        // When loading reaches 100%, automatically transition to connected after a short delay
        if (data.progress === 100) {
          logger.debug('Loading reached 100%, will transition to connected shortly');
        }
      }
      if (data.message) {
        setLoadingMessage(data.message);
      }

      // Clear loading indicators when connected or disconnected
      if (statusValue === 'connected' || statusValue === 'disconnected') {
        setLoadingProgress(undefined);
        setLoadingMessage(undefined);
      }
    });

    return () => {
      cleanupStatus();
      cleanupStatusChange();
    };
  }, [on, socketConnected]);

  // Reset realtime status when polling status changes
  useEffect(() => {
    if (status?.status) {
      // Normalize status to lowercase for comparison with WebSocket events
      const normalizedStatus = status.status.toLowerCase() as
        | 'connected'
        | 'disconnected'
        | 'connecting'
        | 'loading';
      setRealtimeStatus(normalizedStatus);
    }
  }, [status?.status]);

  // Use realtime status if available, otherwise fall back to polled status
  const currentStatus = realtimeStatus || status?.status || 'DISCONNECTED';
  const displayPhone = phoneNumber || status?.phoneNumber;

  const getStatusBadge = () => {
    switch (currentStatus) {
      case 'CONNECTED':
      case 'connected':
        return (
          <Badge className="bg-green-500 hover:bg-green-600">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Connected
          </Badge>
        );
      case 'LOADING':
      case 'loading':
        return (
          <Badge className="bg-blue-500 hover:bg-blue-600">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Loading{loadingProgress ? ` ${Math.round(loadingProgress)}%` : ''}
          </Badge>
        );
      case 'CONNECTING':
      case 'connecting':
        return (
          <Badge className="bg-yellow-500 hover:bg-yellow-600">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Connecting
          </Badge>
        );
      case 'DISCONNECTED':
      case 'disconnected':
      default:
        return (
          <Badge variant="secondary">
            <XCircle className="mr-1 h-3 w-3" />
            Disconnected
          </Badge>
        );
    }
  };

  const isConnected = currentStatus === 'CONNECTED' || currentStatus === 'connected';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Connection Status</CardTitle>
            <CardDescription>WhatsApp Web connection state</CardDescription>
          </div>
          {getStatusBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {(currentStatus === 'loading' || currentStatus === 'LOADING') && loadingMessage && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Initializing WhatsApp Client
            </p>
            <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">{loadingMessage}</p>
          </div>
        )}

        {isConnected && displayPhone && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
            <p className="text-sm font-medium text-green-900 dark:text-green-100">
              Connected Phone Number
            </p>
            <p className="mt-1 font-mono text-lg text-green-700 dark:text-green-300">
              {displayPhone}
            </p>
          </div>
        )}

        {isConnected && status?.lastConnectedAt && (
          <div className="text-sm text-muted-foreground">
            <p>Connected since: {new Date(status.lastConnectedAt).toLocaleString()}</p>
          </div>
        )}

        {isConnected && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => restart()} disabled={isRestarting}>
              {isRestarting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Restarting...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Restart
                </>
              )}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => disconnect()}
              disabled={isDisconnecting}
            >
              {isDisconnecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Disconnecting...
                </>
              ) : (
                <>
                  <Power className="mr-2 h-4 w-4" />
                  Disconnect
                </>
              )}
            </Button>
          </div>
        )}

        {!isConnected && (
          <p className="text-sm text-muted-foreground">
            Not connected to WhatsApp. Click "Connect" to generate a QR code.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
