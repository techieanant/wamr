import { useEffect, useCallback, useState } from 'react';
import { socketClient, ServerToClientEvents } from '../services/socket.client';

/**
 * Hook to manage Socket.IO connection lifecycle
 * Automatically connects on mount (but does NOT disconnect on unmount to allow shared connection)
 */
export function useSocket(autoConnect = true) {
  const [isConnected, setIsConnected] = useState(false);
  const [socketId, setSocketId] = useState<string | undefined>(undefined);

  useEffect(() => {
    // Listen for connection status changes BEFORE connecting
    const handleConnect = () => {
      setIsConnected(true);
      setSocketId(socketClient.getId());
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      setSocketId(undefined);
    };

    // Subscribe to connection events on the raw socket
    const socket = socketClient.getRawSocket();
    if (socket) {
      socket.on('connect', handleConnect);
      socket.on('disconnect', handleDisconnect);
    }

    // Connect after setting up handlers
    if (autoConnect && !socketClient.isConnected()) {
      socketClient.connect();

      // Set up handlers on the new socket after connection
      const newSocket = socketClient.getRawSocket();
      if (newSocket) {
        newSocket.on('connect', handleConnect);
        newSocket.on('disconnect', handleDisconnect);
      }
    }

    // Set initial state
    setIsConnected(socketClient.isConnected());
    setSocketId(socketClient.getId());

    // Cleanup
    return () => {
      const socket = socketClient.getRawSocket();
      if (socket) {
        socket.off('connect', handleConnect);
        socket.off('disconnect', handleDisconnect);
      }
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
