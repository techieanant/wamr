import QRCode from 'qrcode';
import type { Server } from 'socket.io';
import { logger } from '../../config/logger.js';

/**
 * QR code emitter service
 * Handles QR code generation and WebSocket emission for WhatsApp authentication
 */
class QRCodeEmitterService {
  private io: Server | null = null;
  private lastQRCode: { qrCode: string; timestamp: string } | null = null;

  /**
   * Set Socket.IO server instance
   */
  setSocketServer(io: Server): void {
    this.io = io;
    logger.info('QR code emitter service initialized with Socket.IO');
  }

  /**
   * Emit QR code to connected admin clients
   */
  async emitQRCode(qrString: string): Promise<void> {
    if (!this.io) {
      logger.warn('Socket.IO not initialized, cannot emit QR code');
      return;
    }

    try {
      // Generate QR code as data URL
      const qrDataUrl = await QRCode.toDataURL(qrString, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });

      // Save last QR so new clients can request it
      this.lastQRCode = {
        qrCode: qrDataUrl,
        timestamp: new Date().toISOString(),
      };

      // Emit to all connected admin clients
      this.io.emit('whatsapp:qr', {
        qrCode: qrDataUrl,
        timestamp: new Date().toISOString(),
      });

      logger.info('QR code emitted to connected clients');
    } catch (error) {
      logger.error({ error }, 'Failed to generate or emit QR code');
    }
  }

  /**
   * Get last known QR code (if any)
   */
  getLastQRCode(): { qrCode: string; timestamp: string } | null {
    return this.lastQRCode;
  }

  /**
   * Emit connection status update
   */
  emitConnectionStatus(
    status: 'connected' | 'disconnected' | 'connecting',
    phoneNumber?: string
  ): void {
    if (!this.io) {
      logger.warn('Socket.IO not initialized, cannot emit connection status');
      return;
    }

    this.io.emit('whatsapp:status', {
      status,
      phoneNumber,
      timestamp: new Date().toISOString(),
    });

    logger.info({ status }, 'Connection status emitted');
  }
}

export const qrCodeEmitterService = new QRCodeEmitterService();
