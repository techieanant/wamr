import { describe, it, expect } from 'vitest';
import { filterRequests } from '../../../frontend/src/utils/request-filter';
import type { MediaRequest } from '../../../frontend/src/types/request.types';

const baseRequest = (overrides: Partial<MediaRequest> = {}): MediaRequest => ({
  id: 1,
  phoneNumberHash: 'hash',
  requesterPhone: '+123',
  mediaType: 'movie',
  title: 'Inception',
  status: 'PENDING',
  createdAt: new Date('2025-11-30T12:00:00Z').toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe('filterRequests', () => {
  it('includes pending requests with createdAt within the range', () => {
    const requests: MediaRequest[] = [
      baseRequest({ submittedAt: undefined, createdAt: '2025-11-30T12:00:00Z' }), // this should be included
    ];

    const dateRange = { from: new Date('2025-11-25'), to: new Date('2025-12-01') };

    const result = filterRequests(requests, { search: '', mediaType: 'all', dateRange });
    expect(result.length).toBe(1);
    expect(result[0].createdAt).toBe('2025-11-30T12:00:00Z');
  });

  it('excludes requests outside the range', () => {
    const requests: MediaRequest[] = [
      baseRequest({ submittedAt: undefined, createdAt: '2025-11-15T12:00:00Z' }),
    ];

    const dateRange = { from: new Date('2025-11-25'), to: new Date('2025-12-01') };

    const result = filterRequests(requests, { search: '', mediaType: 'all', dateRange });
    expect(result.length).toBe(0);
  });

  it('is inclusive of the to date', () => {
    const requests: MediaRequest[] = [baseRequest({ submittedAt: '2025-12-01T23:59:59Z' })];

    const dateRange = { from: new Date('2025-11-25'), to: new Date('2025-12-01') };

    const result = filterRequests(requests, { search: '', mediaType: 'all', dateRange });
    expect(result.length).toBe(1);
  });
});
