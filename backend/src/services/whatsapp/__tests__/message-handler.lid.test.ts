import { describe, it, expect, vi, beforeEach } from 'vitest';
import { messageHandlerService } from '../message-handler.service.js';

const { mockGetPNForLID, mockSock } = vi.hoisted(() => {
  const mockGetPNForLID = vi.fn();
  const mockSock = {
    signalRepository: { lidMapping: { getPNForLID: mockGetPNForLID } },
  };
  return { mockGetPNForLID, mockSock };
});

vi.mock('../whatsapp-client.service.js', () => ({
  whatsappClientService: {
    getClient: vi.fn(() => mockSock),
    isSentByBot: vi.fn(() => false),
    onMessage: vi.fn(),
  },
}));

vi.mock('../../../config/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('MessageHandlerService.resolvePhoneNumber (LID→PN)', () => {
  beforeEach(() => {
    mockGetPNForLID.mockReset();
  });

  it('returns +pn for a normal @s.whatsapp.net message without touching LID mapping', async () => {
    const msg = { key: { remoteJid: '1234567890@s.whatsapp.net', id: 'm1' } } as any;
    const result = await (messageHandlerService as any).resolvePhoneNumber(msg);
    expect(result).toBe('+1234567890');
    expect(mockGetPNForLID).not.toHaveBeenCalled();
  });

  it('resolves an @lid message via getPNForLID when the mapping is known', async () => {
    // getPNForLID returns a full JID in production, not a bare number
    mockGetPNForLID.mockResolvedValue('1234567890@s.whatsapp.net');
    const msg = { key: { remoteJid: '1234567890:7@lid', id: 'm2' } } as any;
    const result = await (messageHandlerService as any).resolvePhoneNumber(msg);
    expect(result).toBe('+1234567890');
    expect(mockGetPNForLID).toHaveBeenCalledWith('1234567890:7@lid');
  });

  it('returns null for an @lid message when the mapping is not yet known', async () => {
    mockGetPNForLID.mockResolvedValue(null);
    const msg = { key: { remoteJid: '1234567890:7@lid', id: 'm3' } } as any;
    const result = await (messageHandlerService as any).resolvePhoneNumber(msg);
    expect(result).toBeNull();
  });

  it('returns null and swallows errors when getPNForLID throws', async () => {
    mockGetPNForLID.mockRejectedValue(new Error('lid store unavailable'));
    const msg = { key: { remoteJid: '1234567890:7@lid', id: 'm4' } } as any;
    const result = await (messageHandlerService as any).resolvePhoneNumber(msg);
    expect(result).toBeNull();
  });

  it('uses the senderJidOverride (group participant) for the LID lookup', async () => {
    mockGetPNForLID.mockResolvedValue('5551234@s.whatsapp.net');
    const msg = {
      key: { remoteJid: 'g@s.whatsapp.net', participant: '5551234:9@lid', id: 'm5' },
    } as any;
    const result = await (messageHandlerService as any).resolvePhoneNumber(msg, '5551234:9@lid');
    expect(result).toBe('+5551234');
    expect(mockGetPNForLID).toHaveBeenCalledWith('5551234:9@lid');
  });

  it('strips the device suffix when getPNForLID returns a device-suffixed JID', async () => {
    // Baileys' lidMapping returns full device JIDs — "17788796712:0@s.whatsapp.net".
    // Using the raw string as a phone number shifts the last-10-digits hash
    // (":0" rides along) and creates a phantom identity, so the result must be
    // the bare number.
    mockGetPNForLID.mockResolvedValue('17788796712:0@s.whatsapp.net');
    const msg = { key: { remoteJid: '172610457477162@lid', id: 'm6' } } as any;
    const result = await (messageHandlerService as any).resolvePhoneNumber(msg);
    expect(result).toBe('+17788796712');
  });

  it('returns null when getPNForLID returns a JID that cannot be decoded', async () => {
    mockGetPNForLID.mockResolvedValue('not-a-jid');
    const msg = { key: { remoteJid: '172610457477162@lid', id: 'm7' } } as any;
    const result = await (messageHandlerService as any).resolvePhoneNumber(msg);
    expect(result).toBeNull();
  });
});
