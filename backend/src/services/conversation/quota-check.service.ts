/**
 * Quota Check Service
 * Encapsulates per-user request quota logic
 */
import { requestQuotaRepository } from '../../repositories/request-quota.repository.js';
import { settingRepository } from '../../repositories/setting.repository.js';
import { logger } from '../../config/logger.js';
import { QuotaCheckResult, QuotaWindowType } from '../../models/request-quota.model.js';

export class QuotaCheckService {
  /**
   * Check if a user is within their request quota
   * Returns result object with allowed flag and usage info
   */
  async checkQuota(phoneNumberHash: string): Promise<QuotaCheckResult> {
    try {
      // Check if quotas are enabled globally
      const enabledSetting = await settingRepository.findByKey('quotaEnabled');
      const quotasEnabled = enabledSetting?.value === true;

      if (!quotasEnabled) {
        return {
          allowed: true,
          used: 0,
          max: Infinity,
          windowType: 'daily',
          resetTime: '',
        };
      }

      // Get global defaults
      const maxRequestsSetting = await settingRepository.findByKey('quotaGlobalMaxRequests');
      const windowTypeSetting = await settingRepository.findByKey('quotaGlobalWindowType');
      const countFailedSetting = await settingRepository.findByKey('quotaCountFailedRequests');

      const globalMax = (maxRequestsSetting?.value as number) ?? 5;
      const globalWindow = (windowTypeSetting?.value as QuotaWindowType) || 'daily';
      const countFailed = countFailedSetting?.value === true;

      // Check for per-contact override
      const override = await requestQuotaRepository.findByPhoneHash(phoneNumberHash);
      const maxRequests = override?.maxRequests ?? globalMax;
      const windowType = override?.windowType ?? globalWindow;

      // Count requests in current window
      const used = await requestQuotaRepository.countRequestsInWindow(
        phoneNumberHash,
        windowType,
        countFailed
      );

      const allowed = used < maxRequests;
      const resetTime = this.formatResetTime(windowType);

      return { allowed, used, max: maxRequests, windowType, resetTime };
    } catch (error) {
      logger.error({ error, phoneNumberHash }, 'Error checking quota, failing open');
      // Fail open — allow the request if we can't check the quota
      return {
        allowed: true,
        used: 0,
        max: Infinity,
        windowType: 'daily',
        resetTime: '',
      };
    }
  }

  /**
   * Format a human-readable reset time description
   */
  private formatResetTime(windowType: QuotaWindowType): string {
    const now = new Date();
    switch (windowType) {
      case 'daily': {
        const tomorrow = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
        );
        const hoursUntil = Math.ceil((tomorrow.getTime() - now.getTime()) / (1000 * 60 * 60));
        return `in ${hoursUntil} hour${hoursUntil !== 1 ? 's' : ''}`;
      }
      case 'weekly': {
        const dayOfWeek = now.getUTCDay();
        const daysUntilSunday = 7 - dayOfWeek;
        return `in ${daysUntilSunday} day${daysUntilSunday !== 1 ? 's' : ''}`;
      }
      case 'monthly': {
        const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
        const daysUntil = Math.ceil((nextMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return `in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`;
      }
    }
  }
}

export const quotaCheckService = new QuotaCheckService();
