import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuotaCheckService } from '../quota-check.service.js';
import { requestQuotaRepository } from '../../../repositories/request-quota.repository.js';
import { settingRepository } from '../../../repositories/setting.repository.js';

vi.mock('../../../repositories/request-quota.repository.js');
vi.mock('../../../repositories/setting.repository.js');

describe('QuotaCheckService', () => {
  let service: QuotaCheckService;

  beforeEach(() => {
    service = new QuotaCheckService();
    vi.clearAllMocks();
  });

  it('should allow request when quotas are disabled', async () => {
    vi.mocked(settingRepository.findByKey).mockResolvedValue({
      id: 1,
      key: 'quotaEnabled',
      value: false,
      createdAt: '',
      updatedAt: '',
    });

    const result = await service.checkQuota('hash123');

    expect(result.allowed).toBe(true);
    expect(result.max).toBe(Infinity);
  });

  it('should allow request when under quota', async () => {
    vi.mocked(settingRepository.findByKey)
      .mockResolvedValueOnce({
        id: 1,
        key: 'quotaEnabled',
        value: true,
        createdAt: '',
        updatedAt: '',
      })
      .mockResolvedValueOnce({
        id: 2,
        key: 'quotaGlobalMaxRequests',
        value: 5,
        createdAt: '',
        updatedAt: '',
      })
      .mockResolvedValueOnce({
        id: 3,
        key: 'quotaGlobalWindowType',
        value: 'daily',
        createdAt: '',
        updatedAt: '',
      });
    vi.mocked(requestQuotaRepository.findByPhoneHash).mockResolvedValue(null);
    vi.mocked(requestQuotaRepository.countRequestsInWindow).mockResolvedValue(2);

    const result = await service.checkQuota('hash123');

    expect(result.allowed).toBe(true);
    expect(result.used).toBe(2);
    expect(result.max).toBe(5);
  });

  it('should reject request when at quota limit', async () => {
    vi.mocked(settingRepository.findByKey)
      .mockResolvedValueOnce({
        id: 1,
        key: 'quotaEnabled',
        value: true,
        createdAt: '',
        updatedAt: '',
      })
      .mockResolvedValueOnce({
        id: 2,
        key: 'quotaGlobalMaxRequests',
        value: 5,
        createdAt: '',
        updatedAt: '',
      })
      .mockResolvedValueOnce({
        id: 3,
        key: 'quotaGlobalWindowType',
        value: 'daily',
        createdAt: '',
        updatedAt: '',
      });
    vi.mocked(requestQuotaRepository.findByPhoneHash).mockResolvedValue(null);
    vi.mocked(requestQuotaRepository.countRequestsInWindow).mockResolvedValue(5);

    const result = await service.checkQuota('hash123');

    expect(result.allowed).toBe(false);
    expect(result.used).toBe(5);
    expect(result.max).toBe(5);
  });

  it('should use per-contact override when available', async () => {
    vi.mocked(settingRepository.findByKey)
      .mockResolvedValueOnce({
        id: 1,
        key: 'quotaEnabled',
        value: true,
        createdAt: '',
        updatedAt: '',
      })
      .mockResolvedValueOnce({
        id: 2,
        key: 'quotaGlobalMaxRequests',
        value: 5,
        createdAt: '',
        updatedAt: '',
      })
      .mockResolvedValueOnce({
        id: 3,
        key: 'quotaGlobalWindowType',
        value: 'daily',
        createdAt: '',
        updatedAt: '',
      });
    vi.mocked(requestQuotaRepository.findByPhoneHash).mockResolvedValue({
      id: 1,
      phoneNumberHash: 'hash123',
      maxRequests: 10,
      windowType: 'weekly',
      createdAt: '',
      updatedAt: '',
    });
    vi.mocked(requestQuotaRepository.countRequestsInWindow).mockResolvedValue(7);

    const result = await service.checkQuota('hash123');

    expect(result.allowed).toBe(true);
    expect(result.max).toBe(10);
    expect(result.windowType).toBe('weekly');
  });

  it('should fail open on database errors', async () => {
    vi.mocked(settingRepository.findByKey).mockRejectedValue(new Error('DB error'));

    const result = await service.checkQuota('hash123');

    expect(result.allowed).toBe(true);
  });
});
