import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { settings } from '../db/schema.js';
import { SettingModel, CreateSetting, UpdateSetting } from '../models/setting.model.js';
import { logger } from '../config/logger.js';

export class SettingRepository {
  async findByKey(key: string): Promise<SettingModel | null> {
    const rows = await db.select().from(settings).where(eq(settings.key, key));
    if (rows.length === 0) return null;
    return rows[0] as SettingModel;
  }

  async findAll(): Promise<SettingModel[]> {
    const rows = await db.select().from(settings).orderBy(settings.key);
    return rows as SettingModel[];
  }

  async upsert(input: CreateSetting): Promise<SettingModel> {
    const now = new Date().toISOString();
    // Try to find existing row
    const existing = await this.findByKey(input.key);
    if (existing) {
      const setValues: Partial<SettingModel & { updatedAt: string }> = { updatedAt: now };
      if (typeof input.value !== 'undefined') setValues.value = input.value;

      const updated = await db
        .update(settings)
        .set(setValues)
        .where(eq(settings.key, input.key))
        .returning();

      if (updated.length > 0) {
        logger.info({ key: input.key }, 'Updated setting');
        return updated[0] as SettingModel;
      }

      return existing;
    }

    const created = await db
      .insert(settings)
      .values({
        key: input.key,
        value: input.value || null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    logger.info({ key: input.key }, 'Created setting');

    return created[0] as SettingModel;
  }

  async update(key: string, input: UpdateSetting): Promise<SettingModel | null> {
    const now = new Date().toISOString();
    const setValues: Partial<SettingModel & { updatedAt: string }> = { updatedAt: now };
    if (typeof input.value !== 'undefined') setValues.value = input.value;

    const updated = await db
      .update(settings)
      .set(setValues)
      .where(eq(settings.key, key))
      .returning();
    if (updated.length === 0) return null;
    return updated[0] as SettingModel;
  }

  async delete(key: string): Promise<boolean> {
    const result = await db.delete(settings).where(eq(settings.key, key));
    return result.changes > 0;
  }
}

export const settingRepository = new SettingRepository();
