import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { adminUsers } from '../db/schema.js';
import type { AdminUser, CreateAdminUser, UpdateAdminUser } from '../models/admin-user.model.js';

export class AdminUserRepository {
  /**
   * Find admin user by username
   */
  async findByUsername(username: string): Promise<AdminUser | undefined> {
    const result = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.username, username))
      .limit(1);

    if (!result[0]) return undefined;

    return {
      ...result[0],
      createdAt: new Date(result[0].createdAt),
      lastLoginAt: result[0].lastLoginAt ? new Date(result[0].lastLoginAt) : null,
    };
  }

  /**
   * Find admin user by ID
   */
  async findById(id: number): Promise<AdminUser | undefined> {
    const result = await db.select().from(adminUsers).where(eq(adminUsers.id, id)).limit(1);

    if (!result[0]) return undefined;

    return {
      ...result[0],
      createdAt: new Date(result[0].createdAt),
      lastLoginAt: result[0].lastLoginAt ? new Date(result[0].lastLoginAt) : null,
    };
  }

  /**
   * Find the latest (most recently created) admin user
   */
  async findLatest(): Promise<AdminUser | undefined> {
    const result = await db.select().from(adminUsers).orderBy(adminUsers.id).limit(1);

    if (!result[0]) return undefined;

    return {
      ...result[0],
      createdAt: new Date(result[0].createdAt),
      lastLoginAt: result[0].lastLoginAt ? new Date(result[0].lastLoginAt) : null,
    };
  }

  /**
   * Create new admin user
   */
  async create(data: CreateAdminUser): Promise<AdminUser> {
    const result = await db.insert(adminUsers).values(data).returning();

    return {
      ...result[0],
      createdAt: new Date(result[0].createdAt),
      lastLoginAt: result[0].lastLoginAt ? new Date(result[0].lastLoginAt) : null,
    };
  }

  /**
   * Update admin user
   */
  async update(id: number, data: UpdateAdminUser): Promise<AdminUser | undefined> {
    const updateData: Record<string, string | number | null> = {};

    if (data.lastLoginAt) {
      updateData.lastLoginAt = data.lastLoginAt.toISOString();
    }

    const result = await db
      .update(adminUsers)
      .set(updateData)
      .where(eq(adminUsers.id, id))
      .returning();

    if (!result[0]) return undefined;

    return {
      ...result[0],
      createdAt: new Date(result[0].createdAt),
      lastLoginAt: result[0].lastLoginAt ? new Date(result[0].lastLoginAt) : null,
    };
  }

  /**
   * Check if any admin users exist
   */
  async hasAnyUsers(): Promise<boolean> {
    const result = await db.select({ id: adminUsers.id }).from(adminUsers).limit(1);

    return result.length > 0;
  }

  /**
   * Count total admin users
   */
  async count(): Promise<number> {
    const result = await db.select({ count: adminUsers.id }).from(adminUsers);

    return result.length;
  }

  /**
   * Update admin user password
   */
  async updatePassword(id: number, passwordHash: string): Promise<void> {
    await db.update(adminUsers).set({ passwordHash }).where(eq(adminUsers.id, id));
  }
}

export const adminUserRepository = new AdminUserRepository();
