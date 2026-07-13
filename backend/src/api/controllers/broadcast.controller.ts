import { Request, Response } from 'express';
import { broadcastService } from '../../services/broadcast/broadcast.service.js';
import { broadcastRepository } from '../../repositories/broadcast.repository.js';
import { contactRepository } from '../../repositories/contact.repository.js';

export class BroadcastController {
  async list(_req: Request, res: Response): Promise<void> {
    const broadcasts = await broadcastRepository.list();
    res.json(broadcasts);
  }

  async get(req: Request, res: Response): Promise<void> {
    const id = Number(req.params.id);
    const broadcast = await broadcastRepository.findById(id);
    if (!broadcast) {
      res.status(404).json({ error: 'Broadcast not found' });
      return;
    }
    const recipients = await broadcastRepository.listRecipients(id);
    res.json({ ...broadcast, recipients });
  }

  async create(req: Request, res: Response): Promise<void> {
    const input = req.body;
    const broadcast = await broadcastService.compose(input);
    res.status(201).json(broadcast);
  }

  async cancel(req: Request, res: Response): Promise<void> {
    const id = Number(req.params.id);
    const broadcast = await broadcastService.cancel(id);
    if (!broadcast) {
      res.status(404).json({ error: 'Broadcast not found' });
      return;
    }
    res.json(broadcast);
  }

  async pause(req: Request, res: Response): Promise<void> {
    const id = Number(req.params.id);
    const broadcast = await broadcastService.pause(id);
    if (!broadcast) {
      res.status(404).json({ error: 'Broadcast not found' });
      return;
    }
    res.json(broadcast);
  }

  async resume(req: Request, res: Response): Promise<void> {
    const id = Number(req.params.id);
    const broadcast = await broadcastService.resume(id);
    if (!broadcast) {
      res.status(404).json({ error: 'Broadcast not found' });
      return;
    }
    res.json(broadcast);
  }

  async retryFailed(req: Request, res: Response): Promise<void> {
    const id = Number(req.params.id);
    const broadcast = await broadcastService.retryFailed(id);
    if (!broadcast) {
      res.status(404).json({ error: 'Broadcast not found' });
      return;
    }
    res.json(broadcast);
  }

  async delete(req: Request, res: Response): Promise<void> {
    const id = Number(req.params.id);
    await broadcastRepository.delete(id);
    res.status(204).end();
  }

  async contacts(_req: Request, res: Response): Promise<void> {
    const contacts = await contactRepository.findAll();
    // Expose only what the UI needs; phoneNumber here is the encrypted blob used
    // purely as a presence flag (LID-only contacts have no decryptable phone).
    res.json({
      contacts: contacts.map((c) => ({
        id: c.id,
        contactName: c.contactName,
        phoneNumber: c.phoneNumberEncrypted ?? null,
      })),
    });
  }
}

export const broadcastController = new BroadcastController();
