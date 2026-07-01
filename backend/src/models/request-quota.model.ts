/**
 * Request Quota Model
 * Types for per-user request limit configuration
 */

export type QuotaWindowType = 'daily' | 'weekly' | 'monthly';

export interface RequestQuotaModel {
  id: number;
  phoneNumberHash: string;
  maxRequests: number;
  windowType: QuotaWindowType;
  currentRequests: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRequestQuota {
  phoneNumberHash: string;
  maxRequests: number;
  windowType: QuotaWindowType;
}

export interface UpdateRequestQuota {
  maxRequests?: number;
  windowType?: QuotaWindowType;
}

export interface QuotaCheckResult {
  allowed: boolean;
  used: number;
  max: number;
  windowType: QuotaWindowType;
  resetTime: string;
}
