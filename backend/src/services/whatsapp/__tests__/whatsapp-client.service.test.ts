import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhatsAppClientService } from '../whatsapp-client.service.js';

describe('WhatsAppClientService.sendImage', () => {
  let service: WhatsAppClientService;

  beforeEach(() => {
    service = new WhatsAppClientService();
  });

  it('should send an image message with caption', async () => {
    const mockSendMessage = vi.fn().mockResolvedValue({ key: { id: 'msg123' } });
    const mockSock = {
      user: { id: '123@s.whatsapp.net' },
      sendMessage: mockSendMessage,
      sendPresenceUpdate: vi.fn().mockResolvedValue(undefined),
    };

    // @ts-expect-error — accessing private field for testing
    service['sock'] = mockSock;

    const buffer = Buffer.from('fake-image-data');
    await service.sendImage('1234567890', buffer, 'Test caption');

    expect(mockSendMessage).toHaveBeenCalledWith('1234567890@s.whatsapp.net', {
      image: buffer,
      caption: 'Test caption',
    });
  });

  it('should throw when client is not ready', async () => {
    const buffer = Buffer.from('fake-image-data');
    await expect(service.sendImage('1234567890', buffer)).rejects.toThrow(
      'WhatsApp client is not ready'
    );
  });
});
