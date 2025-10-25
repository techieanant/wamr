import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { mediaServiceConfigurations } from '../db/schema.js';
import type {
  MediaServiceConfiguration,
  CreateMediaServiceConfiguration,
  UpdateMediaServiceConfiguration,
  ServiceType,
} from '../models/media-service-config.model.js';

export class MediaServiceConfigRepository {
  /**
   * Find service configuration by ID
   */
  async findById(id: number): Promise<MediaServiceConfiguration | undefined> {
    const result = await db
      .select()
      .from(mediaServiceConfigurations)
      .where(eq(mediaServiceConfigurations.id, id))
      .limit(1);

    if (!result[0]) return undefined;

    return this.mapToModel(result[0]);
  }

  /**
   * Find all service configurations
   */
  async findAll(): Promise<MediaServiceConfiguration[]> {
    const result = await db
      .select()
      .from(mediaServiceConfigurations)
      .orderBy(mediaServiceConfigurations.priority);

    return result.map((row) => this.mapToModel(row));
  }

  /**
   * Find enabled services by type
   */
  async findEnabledByType(serviceType: ServiceType): Promise<MediaServiceConfiguration[]> {
    const result = await db
      .select()
      .from(mediaServiceConfigurations)
      .where(
        and(
          eq(mediaServiceConfigurations.serviceType, serviceType),
          eq(mediaServiceConfigurations.enabled, true)
        )
      )
      .orderBy(mediaServiceConfigurations.priority);

    return result.map((row) => this.mapToModel(row));
  }

  /**
   * Find services by type (enabled and disabled)
   */
  async findByType(serviceType: ServiceType): Promise<MediaServiceConfiguration[]> {
    const result = await db
      .select()
      .from(mediaServiceConfigurations)
      .where(eq(mediaServiceConfigurations.serviceType, serviceType))
      .orderBy(mediaServiceConfigurations.priority);

    return result.map((row) => this.mapToModel(row));
  }

  /**
   * Create new service configuration
   */
  async create(data: CreateMediaServiceConfiguration): Promise<MediaServiceConfiguration> {
    // Extract IV from encrypted string (format: iv:authTag:ciphertext)
    const [iv] = data.apiKeyEncrypted.split(':');

    const result = await db
      .insert(mediaServiceConfigurations)
      .values({
        name: data.name,
        serviceType: data.serviceType,
        baseUrl: data.baseUrl,
        apiKeyEncrypted: data.apiKeyEncrypted, // Store full encrypted string
        apiKeyIv: iv, // Store IV separately for reference
        enabled: data.enabled ?? true,
        priority: data.priorityOrder,
        maxResults: data.maxResults ?? 5,
        qualityProfile: data.qualityProfileId?.toString() ?? null,
        rootFolder: data.rootFolderPath ?? null,
      })
      .returning();

    return this.mapToModel(result[0]);
  }

  /**
   * Update service configuration
   */
  async update(
    id: number,
    data: UpdateMediaServiceConfiguration
  ): Promise<MediaServiceConfiguration | undefined> {
    const updateData: Record<string, string | number | boolean | null> = {
      updatedAt: new Date().toISOString(),
    };

    if (data.name !== undefined) {
      updateData.name = data.name;
    }
    if (data.baseUrl !== undefined) {
      updateData.baseUrl = data.baseUrl;
    }
    if (data.apiKeyEncrypted !== undefined) {
      // Extract IV from encrypted string (format: iv:authTag:ciphertext)
      const [iv] = data.apiKeyEncrypted.split(':');
      updateData.apiKeyEncrypted = data.apiKeyEncrypted;
      updateData.apiKeyIv = iv;
    }
    if (data.enabled !== undefined) {
      updateData.enabled = data.enabled;
    }
    if (data.priorityOrder !== undefined) {
      updateData.priority = data.priorityOrder;
    }
    if (data.maxResults !== undefined) {
      updateData.maxResults = data.maxResults;
    }
    if (data.qualityProfileId !== undefined) {
      updateData.qualityProfile = data.qualityProfileId?.toString() ?? null;
    }
    if (data.rootFolderPath !== undefined) {
      updateData.rootFolder = data.rootFolderPath;
    }

    const result = await db
      .update(mediaServiceConfigurations)
      .set(updateData)
      .where(eq(mediaServiceConfigurations.id, id))
      .returning();

    if (!result[0]) return undefined;

    return this.mapToModel(result[0]);
  }

  /**
   * Delete service configuration
   */
  async delete(id: number): Promise<boolean> {
    const result = await db
      .delete(mediaServiceConfigurations)
      .where(eq(mediaServiceConfigurations.id, id))
      .returning();

    return result.length > 0;
  }

  /**
   * Validate unique priority for service type
   * Returns true if priority is available, false if already taken
   */
  async validateUniquePriority(
    serviceType: ServiceType,
    priority: number,
    excludeId?: number
  ): Promise<boolean> {
    const conditions = [
      eq(mediaServiceConfigurations.serviceType, serviceType),
      eq(mediaServiceConfigurations.priority, priority),
    ];

    // Exclude current service when updating
    if (excludeId !== undefined) {
      const result = await db
        .select()
        .from(mediaServiceConfigurations)
        .where(
          and(
            eq(mediaServiceConfigurations.serviceType, serviceType),
            eq(mediaServiceConfigurations.priority, priority)
          )
        );

      // Priority is available if no results or only result is the current service
      return result.length === 0 || (result.length === 1 && result[0].id === excludeId);
    }

    const result = await db
      .select()
      .from(mediaServiceConfigurations)
      .where(and(...conditions))
      .limit(1);

    return result.length === 0;
  }

  /**
   * Map database row to model
   */
  private mapToModel(
    row: typeof mediaServiceConfigurations.$inferSelect
  ): MediaServiceConfiguration {
    return {
      id: row.id,
      name: row.name,
      serviceType: row.serviceType as ServiceType,
      baseUrl: row.baseUrl,
      apiKeyEncrypted: row.apiKeyEncrypted, // Already in full iv:authTag:ciphertext format
      enabled: row.enabled,
      priorityOrder: row.priority,
      maxResults: row.maxResults ?? 5,
      qualityProfileId: row.qualityProfile ? parseInt(row.qualityProfile, 10) : null,
      rootFolderPath: row.rootFolder,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }
}

export const mediaServiceConfigRepository = new MediaServiceConfigRepository();
