import { useEffect, useCallback, useState } from 'react';
import { socketClient, ServerToClientEvents } from '../services/socket.client';

/**
 * Hook to manage Socket.IO connection lifecycle
 * Automatically connects on mount (but does NOT disconnect on unmount to allow shared connection)
 */
export function useSocket(autoConnect = true) {
  const [isConnected, setIsConnected] = useState(socketClient.isConnected());
  const [socketId, setSocketId] = useState(socketClient.getId());

  useEffect(() => {
    if (autoConnect) {
      socketClient.connect();
    }

    // Listen for connection status changes
    const handleConnect = () => {
      setIsConnected(true);
      setSocketId(socketClient.getId());
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      setSocketId(undefined);
    };

    // Subscribe to connection events
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socketClient.on('connect' as any, handleConnect);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socketClient.on('disconnect' as any, handleDisconnect);

    // Set initial state
    setIsConnected(socketClient.isConnected());
    setSocketId(socketClient.getId());

    // Cleanup
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      socketClient.off('connect' as any, handleConnect);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      socketClient.off('disconnect' as any, handleDisconnect);
    };
  }, [autoConnect]);

  /**
   * Subscribe to a socket event
   */
  const on = useCallback(
    <K extends keyof ServerToClientEvents>(event: K, handler: ServerToClientEvents[K]) => {
      socketClient.on(event, handler);

      // Return cleanup function
      return () => socketClient.off(event, handler);
    },
    []
  );

  /**
   * Emit an event to the server
   */
  const emit = useCallback((event: string, ...args: unknown[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socketClient.emit(event as any, ...args);
  }, []);

  return {
    on,
    emit,
    isConnected,
    socketId,
  };
}

/**
 * Hook to subscribe to a specific socket event
 * Automatically handles subscription and cleanup
 */
export function useSocketEvent<K extends keyof ServerToClientEvents>(
  event: K,
  handler: ServerToClientEvents[K]
) {
  useEffect(() => {
    socketClient.on(event, handler);

    return () => {
      socketClient.off(event, handler);
    };
  }, [event, handler]);
}
