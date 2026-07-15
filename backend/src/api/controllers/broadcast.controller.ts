import { Request, Response } from 'express';
import { broadcastService } from '../../services/broadcast/broadcast.service.js';
import { broadcastRepository } from '../../repositories/broadcast.repository.js';
import { contactRepository } from '../../repositories/contact.repository.js';
import type { Broadcast } from '../../models/broadcast.model.js';

/**
 * Aggregated counts for a broadcast.
 * One-time broadcasts use their own counts. Recurring broadcasts send via
 * spawned children, so the parent's own sent/total counts are meaningless
 * (the parent never sends) — sum the children's sent/failed, and use the
 * parent's recipient list length as the true recipient total.
 */
function aggregate(
  b: Broadcast,
  children: Broadcast[]
): {
  sentCount: number;
  totalRecipients: number;
  failedCount: number;
} {
  if (b.scheduleType !== 'recurring' || b.parentId !== null) {
    return {
      sentCount: b.sentCount ?? 0,
      totalRecipients: b.totalRecipients ?? 0,
      failedCount: b.failedCount ?? 0,
    };
  }
  const total = (b.recipientContactIds as number[] | undefined)?.length ?? b.totalRecipients ?? 0;
  let sent = 0;
  let failed = 0;
  for (const c of children) {
    sent += c.sentCount ?? 0;
    failed += c.failedCount ?? 0;
  }
  return { sentCount: sent, totalRecipients: total, failedCount: failed };
}

/** Drop null/undefined/empty values so the JSON export stays compact. */
function stripEmpty(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

export class BroadcastController {
  async list(_req: Request, res: Response): Promise<void> {
    const broadcasts = await broadcastRepository.list();
    const withCounts = await Promise.all(
      broadcasts.map(async (b) => {
        if (b.scheduleType === 'recurring' && b.parentId === null) {
          const children = await broadcastRepository.findChildren(b.id);
          return { ...b, ...aggregate(b, children) };
        }
        return b;
      })
    );
    res.json({ broadcasts: withCounts });
  }

  async get(req: Request, res: Response): Promise<void> {
    const id = Number(req.params.id);
    const broadcast = await broadcastRepository.findById(id);
    if (!broadcast) {
      res.status(404).json({ error: 'Broadcast not found' });
      return;
    }
    const recipients = await broadcastRepository.listRecipients(id);
    let allRecipients = recipients;
    let sentCount = broadcast.sentCount ?? 0;
    let totalRecipients = broadcast.totalRecipients ?? 0;
    let failedCount = broadcast.failedCount ?? 0;
    // Recurring broadcasts send via spawned children; surface their history here.
    if (broadcast.parentId === null) {
      const children = await broadcastRepository.findChildren(id);
      const agg = aggregate(broadcast, children);
      sentCount = agg.sentCount;
      totalRecipients = agg.totalRecipients;
      failedCount = agg.failedCount;
      for (const c of children) {
        const cr = await broadcastRepository.listRecipients(c.id);
        allRecipients = allRecipients.concat(cr);
      }
    }
    res.json({ ...broadcast, sentCount, totalRecipients, failedCount, recipients: allRecipients });
  }

  /** Full export of every broadcast (parents + children) with aggregated counts + recipients. */
  async exportAll(_req: Request, res: Response): Promise<void> {
    const all = await broadcastRepository.list({ includeChildren: true });
    const result = await Promise.all(
      all.map(async (b) => {
        const children = b.parentId === null ? await broadcastRepository.findChildren(b.id) : [];
        const agg = aggregate(b, children);
        const recipients = await broadcastRepository.listRecipients(b.id);
        return stripEmpty({
          ...b,
          sentCount: agg.sentCount,
          totalRecipients: agg.totalRecipients,
          failedCount: agg.failedCount,
          children: children.map((c) => stripEmpty({ ...c })),
          recipients,
        });
      })
    );
    res.json({ broadcasts: result, exportedAt: new Date().toISOString() });
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
