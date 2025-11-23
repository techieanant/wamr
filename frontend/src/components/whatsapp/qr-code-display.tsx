import { useEffect, useState } from 'react';
import { socketClient } from '../../services/socket.client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Loader2 } from 'lucide-react';

export function QRCodeDisplay() {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isConnected, setIsConnected] = useState(socketClient.isConnected());

  useEffect(() => {
    // Update connection status
    const checkConnection = setInterval(() => {
      setIsConnected(socketClient.isConnected());
    }, 1000);

    // Get raw socket and listen directly
    const rawSocket = socketClient.getRawSocket();

    if (!rawSocket) {
      return () => clearInterval(checkConnection);
    }

    // Listen for QR code events using specific event listener
    // Note: Socket.IO sometimes wraps single parameters in an array
    const handleQRCode = (
      data: { qrCode?: string; timestamp?: string } | { qrCode?: string; timestamp?: string }[]
    ) => {
      // Handle both array and direct object formats
      const qrData = Array.isArray(data) ? data[0] : data;

      if (qrData && qrData.qrCode) {
        setQrCode(qrData.qrCode);
        setLastUpdate(new Date(qrData.timestamp || Date.now()));
      }
    };

    // Listen for the specific event
    rawSocket.on('whatsapp:qr', handleQRCode);

    return () => {
      clearInterval(checkConnection);
      rawSocket.off('whatsapp:qr', handleQRCode);
      // Reset QR code state on unmount
      setQrCode(null);
    };
  }, []);

  if (!isConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>WhatsApp QR Code</CardTitle>
          <CardDescription>Connecting to server...</CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-[300px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!qrCode) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>WhatsApp QR Code</CardTitle>
          <CardDescription>Waiting for QR code...</CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-[300px] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Initializing WhatsApp connection...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>WhatsApp QR Code</CardTitle>
        <CardDescription>
          Scan this QR code with your WhatsApp mobile app to connect
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center space-y-4">
        <div className="rounded-lg border-2 border-border bg-white p-4">
          <img src={qrCode} alt="WhatsApp QR Code" className="h-64 w-64" />
        </div>

        {lastUpdate && (
          <p className="text-xs text-muted-foreground">
            QR code generated at {lastUpdate.toLocaleTimeString()}
          </p>
        )}

        <div className="max-w-md space-y-2 text-center text-sm">
          <p className="font-medium">How to scan:</p>
          <ol className="space-y-1 text-left text-muted-foreground">
            <li>1. Open WhatsApp on your phone</li>
            <li>2. Tap Menu (⋮) or Settings</li>
            <li>3. Tap "Linked Devices"</li>
            <li>4. Tap "Link a Device"</li>
            <li>5. Point your phone at this screen to scan the QR code</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
