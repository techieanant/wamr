import { broadcastRepository } from '../../repositories/broadcast.repository.js';
import { broadcastService } from './broadcast.service.js';
import { env } from '../../config/environment.js';
import { logger } from '../../config/logger.js';

export class BroadcastSchedulerService {
  private timer: NodeJS.Timeout | null = null;
  private inProgress = new Set<number>();

  start(): void {
    const interval = env.BROADCAST_TICKER_INTERVAL_MS;
    // Run once immediately to catch up missed/pending jobs on boot.
    this.tick().catch((e) => logger.error({ error: e }, 'Broadcast ticker initial run failed'));
    this.timer = setInterval(() => {
      this.tick().catch((e) => logger.error({ error: e }, 'Broadcast ticker failed'));
    }, interval);
    logger.info({ interval }, 'Broadcast scheduler started');
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    const nowIso = new Date().toISOString();

    // Resume interrupted sends
    const resumable = await broadcastRepository.findResumable();
    for (const b of resumable) {
      if (this.inProgress.has(b.id)) continue;
      this.inProgress.add(b.id);
      broadcastService
        .runSend(b.id)
        .catch((e) => logger.error({ error: e, id: b.id }, 'Resume send failed'))
        .finally(() => this.inProgress.delete(b.id));
    }

    const due = await broadcastRepository.findDue(nowIso);
    for (const b of due) {
      if (this.inProgress.has(b.id)) continue;
      this.inProgress.add(b.id);
      (async () => {
        try {
          if (b.scheduleType === 'recurring' && b.status === 'active') {
            const child = await broadcastService.spawnRecurringChild(b);
            await broadcastService.runSend(child.id);
          } else {
            await broadcastService.runSend(b.id);
          }
        } catch (e) {
          logger.error({ error: e, id: b.id }, 'Broadcast tick failed');
        } finally {
          this.inProgress.delete(b.id);
        }
      })();
    }
  }
}

export const broadcastSchedulerService = new BroadcastSchedulerService();
