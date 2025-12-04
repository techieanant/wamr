import { describe, it, expect } from 'vitest';
import type { ServiceConfig } from '../../src/types/service.types';

describe('Service Config Banner Logic', () => {
  const createMockService = (overrides: Partial<ServiceConfig> = {}): ServiceConfig => ({
    id: 1,
    name: 'Test Service',
    serviceType: 'radarr',
    baseUrl: 'http://test.com',
    enabled: true,
    priorityOrder: 1,
    maxResults: 5,
    qualityProfileId: 1,
    rootFolderPath: '/test',
    hasApiKey: true,
    createdAt: '2023-01-01T00:00:00.000Z',
    updatedAt: '2023-01-01T00:00:00.000Z',
    ...overrides,
  });

  const getServicesWithoutApiKey = (services: ServiceConfig[]) => {
    return services.filter((service) => service.enabled && !service.hasApiKey);
  };

  it('should identify services without API keys that are enabled', () => {
    const services: ServiceConfig[] = [
      createMockService({ name: 'Service 1', enabled: true, hasApiKey: false }),
      createMockService({ name: 'Service 2', enabled: true, hasApiKey: true }),
      createMockService({ name: 'Service 3', enabled: false, hasApiKey: false }),
    ];

    const servicesWithoutApiKey = getServicesWithoutApiKey(services);

    expect(servicesWithoutApiKey).toHaveLength(1);
    expect(servicesWithoutApiKey[0].name).toBe('Service 1');
  });

  it('should return empty array when all enabled services have API keys', () => {
    const services: ServiceConfig[] = [
      createMockService({ name: 'Service 1', enabled: true, hasApiKey: true }),
      createMockService({ name: 'Service 2', enabled: true, hasApiKey: true }),
      createMockService({ name: 'Service 3', enabled: false, hasApiKey: false }),
    ];

    const servicesWithoutApiKey = getServicesWithoutApiKey(services);

    expect(servicesWithoutApiKey).toHaveLength(0);
  });

  it('should return empty array when no services are enabled', () => {
    const services: ServiceConfig[] = [
      createMockService({ name: 'Service 1', enabled: false, hasApiKey: false }),
      createMockService({ name: 'Service 2', enabled: false, hasApiKey: true }),
    ];

    const servicesWithoutApiKey = getServicesWithoutApiKey(services);

    expect(servicesWithoutApiKey).toHaveLength(0);
  });

  it('should return multiple services when multiple enabled services lack API keys', () => {
    const services: ServiceConfig[] = [
      createMockService({ name: 'Service 1', enabled: true, hasApiKey: false }),
      createMockService({ name: 'Service 2', enabled: true, hasApiKey: false }),
      createMockService({ name: 'Service 3', enabled: true, hasApiKey: true }),
    ];

    const servicesWithoutApiKey = getServicesWithoutApiKey(services);

    expect(servicesWithoutApiKey).toHaveLength(2);
    expect(servicesWithoutApiKey.map(s => s.name)).toEqual(['Service 1', 'Service 2']);
  });
});