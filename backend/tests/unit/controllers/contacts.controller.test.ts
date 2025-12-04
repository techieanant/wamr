import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/repositories/contact.repository.js', () => ({
  contactRepository: {
    findById: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../../src/repositories/request-history.repository.js', () => ({
  requestHistoryRepository: {
    clearContactNameForPhone: vi.fn(),
  },
}));

vi.mock('../../../src/services/websocket/websocket.service.js', () => ({
  webSocketService: {
    emit: vi.fn(),
  },
  SocketEvents: {
    REQUEST_CONTACT_UPDATE: 'request:contact-update',
  },
}));

vi.mock('../../../src/config/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import * as contactsController from '../../../src/api/controllers/contacts.controller.js';
import { contactRepository } from '../../../src/repositories/contact.repository.js';
import { requestHistoryRepository } from '../../../src/repositories/request-history.repository.js';
import { webSocketService } from '../../../src/services/websocket/websocket.service.js';

describe('Contacts Controller - deleteContact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears request_history and emits socket when contact deleted', async () => {
    const req = { params: { id: '4' } } as any;
    const res: any = { json: vi.fn(), status: vi.fn(() => res) };
    const next = vi.fn();

    const contact = { id: 4, phoneNumberHash: 'f91679...' } as any;
    (contactRepository.findById as any).mockResolvedValue(contact);
    (contactRepository.delete as any).mockResolvedValue(true);
    (requestHistoryRepository.clearContactNameForPhone as any).mockResolvedValue(2);

    await contactsController.deleteContact(req, res, next);

    expect(requestHistoryRepository.clearContactNameForPhone).toHaveBeenCalledWith('f91679...');
    expect(webSocketService.emit).toHaveBeenCalledWith(
      'request:contact-update',
      expect.objectContaining({ phoneNumberHash: 'f91679...', contactName: null })
    );
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('returns 404 when contact delete returns false', async () => {
    const req = { params: { id: '99' } } as any;
    const res: any = { status: vi.fn(() => res), json: vi.fn() };
    const next = vi.fn();
    (contactRepository.findById as any).mockResolvedValue(null);
    (contactRepository.delete as any).mockResolvedValue(false);

    await contactsController.deleteContact(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Contact not found' });
  });

  it('does not attempt to clear request_history when contact has no phoneNumberHash and still emits', async () => {
    const req = { params: { id: '5' } } as any;
    const res: any = { json: vi.fn(), status: vi.fn(() => res) };
    const next = vi.fn();
    const contact = { id: 5, phoneNumberHash: null } as any;
    (contactRepository.findById as any).mockResolvedValue(contact);
    (contactRepository.delete as any).mockResolvedValue(true);
    (requestHistoryRepository.clearContactNameForPhone as any).mockResolvedValue(0);

    await contactsController.deleteContact(req, res, next);

    expect(requestHistoryRepository.clearContactNameForPhone).not.toHaveBeenCalled();
    expect(webSocketService.emit).toHaveBeenCalledWith(
      'request:contact-update',
      expect.objectContaining({ phoneNumberHash: null, contactName: null })
    );
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('continues and emits even if clearing request_history throws an error', async () => {
    const req = { params: { id: '6' } } as any;
    const res: any = { json: vi.fn(), status: vi.fn(() => res) };
    const next = vi.fn();
    const contact = { id: 6, phoneNumberHash: 'f91679...' } as any;
    (contactRepository.findById as any).mockResolvedValue(contact);
    (contactRepository.delete as any).mockResolvedValue(true);
    (requestHistoryRepository.clearContactNameForPhone as any).mockRejectedValue(new Error('boom'));

    await contactsController.deleteContact(req, res, next);

    expect(requestHistoryRepository.clearContactNameForPhone).toHaveBeenCalledWith('f91679...');
    expect(webSocketService.emit).toHaveBeenCalledWith(
      'request:contact-update',
      expect.objectContaining({ phoneNumberHash: 'f91679...', contactName: null })
    );
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('returns 400 for invalid contact id param', async () => {
    const req = { params: { id: 'not-a-number' } } as any;
    const res: any = { status: vi.fn(() => res), json: vi.fn() };
    const next = vi.fn();

    await contactsController.deleteContact(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid contact ID' });
  });

  it('calls next when contactRepository.delete throws an unhandled error', async () => {
    const req = { params: { id: '7' } } as any;
    const res: any = { json: vi.fn(), status: vi.fn(() => res) };
    const next = vi.fn();
    (contactRepository.findById as any).mockResolvedValue({ id: 7, phoneNumberHash: '6677' });
    (contactRepository.delete as any).mockRejectedValue(new Error('db error'));

    await contactsController.deleteContact(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
