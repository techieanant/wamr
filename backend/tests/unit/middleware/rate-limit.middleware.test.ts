import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  createRateLimitMiddleware,
  adminRateLimiter,
  loginRateLimiter,
  createWhatsAppRateLimiter,
} from '../../../src/api/middleware/rate-limit.middleware';
import { Request, Response, NextFunction } from 'express';
import { rateLimiterService } from '../../../src/services/auth/rate-limiter.service';

// Mock dependencies
vi.mock('../../../src/services/auth/rate-limiter.service', () => ({
  rateLimiterService: {
    isAllowed: vi.fn(),
    getRemaining: vi.fn(),
    getResetTime: vi.fn(),
  },
}));

describe('Rate Limit Middleware', () => {
  let mockRequest: Partial<Request & { socket?: { remoteAddress?: string } }>;
  let mockResponse: Partial<Response>;
  let mockNext: Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRequest = {
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' } as any,
    };
    mockResponse = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();
  });

  describe('createRateLimitMiddleware', () => {
    const config = {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 100,
    };

    it('should allow request when under limit', () => {
      (rateLimiterService.isAllowed as Mock).mockReturnValue(true);
      (rateLimiterService.getRemaining as Mock).mockReturnValue(99);
      (rateLimiterService.getResetTime as Mock).mockReturnValue(Date.now() + 15 * 60 * 1000);

      const middleware = createRateLimitMiddleware(config);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(rateLimiterService.isAllowed).toHaveBeenCalledWith('127.0.0.1', 100, 15 * 60 * 1000);
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 100);
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 99);
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(Number));
      expect(mockNext).toHaveBeenCalled();
    });

    it('should block request when over limit', () => {
      (rateLimiterService.isAllowed as Mock).mockReturnValue(false);
      (rateLimiterService.getResetTime as Mock).mockReturnValue(Date.now() + 5 * 60 * 1000); // 5 minutes

      const middleware = createRateLimitMiddleware(config);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 100);
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 0);
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(Number));
      expect(mockResponse.status).toHaveBeenCalledWith(429);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Too many requests, please try again later',
        code: 'RATE_LIMIT_EXCEEDED',
        details: {
          retryAfter: expect.any(Number),
        },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should use custom key generator', () => {
      const customConfig = {
        ...config,
        keyGenerator: (req: Request) => `user:${req.body?.userId || 'anonymous'}`,
      };

      mockRequest.body = { userId: 123 };
      (rateLimiterService.isAllowed as Mock).mockReturnValue(true);
      (rateLimiterService.getRemaining as Mock).mockReturnValue(99);

      const middleware = createRateLimitMiddleware(customConfig);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(rateLimiterService.isAllowed).toHaveBeenCalledWith('user:123', 100, 15 * 60 * 1000);
    });

    it('should use IP when no custom key generator', () => {
      (rateLimiterService.isAllowed as Mock).mockReturnValue(true);
      (rateLimiterService.getRemaining as Mock).mockReturnValue(99);

      const middleware = createRateLimitMiddleware(config);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(rateLimiterService.isAllowed).toHaveBeenCalledWith('127.0.0.1', 100, 15 * 60 * 1000);
    });

    it('should use socket remote address when no IP', () => {
      const requestWithoutIp = {
        socket: { remoteAddress: '127.0.0.1' } as any,
      };
      (rateLimiterService.isAllowed as Mock).mockReturnValue(true);
      (rateLimiterService.getRemaining as Mock).mockReturnValue(99);

      const middleware = createRateLimitMiddleware(config);
      middleware(requestWithoutIp as Request, mockResponse as Response, mockNext);

      expect(rateLimiterService.isAllowed).toHaveBeenCalledWith('127.0.0.1', 100, 15 * 60 * 1000);
    });

    it('should use unknown when no IP or socket address', () => {
      const requestWithoutIpOrSocket = {
        socket: { remoteAddress: undefined } as any,
      };
      (rateLimiterService.isAllowed as Mock).mockReturnValue(true);
      (rateLimiterService.getRemaining as Mock).mockReturnValue(99);

      const middleware = createRateLimitMiddleware(config);
      middleware(
        requestWithoutIpOrSocket as unknown as Request,
        mockResponse as Response,
        mockNext
      );

      expect(rateLimiterService.isAllowed).toHaveBeenCalledWith('unknown', 100, 15 * 60 * 1000);
    });

    it('should handle null reset time', () => {
      (rateLimiterService.isAllowed as Mock).mockReturnValue(true);
      (rateLimiterService.getRemaining as Mock).mockReturnValue(99);
      (rateLimiterService.getResetTime as Mock).mockReturnValue(null);

      const middleware = createRateLimitMiddleware(config);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', 0);
    });

    it('should handle null remaining requests', () => {
      (rateLimiterService.isAllowed as Mock).mockReturnValue(true);
      (rateLimiterService.getRemaining as Mock).mockReturnValue(null);
      (rateLimiterService.getResetTime as Mock).mockReturnValue(Date.now() + 15 * 60 * 1000);

      const middleware = createRateLimitMiddleware(config);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 100);
    });
  });

  describe('adminRateLimiter', () => {
    it('should be a function', () => {
      expect(typeof adminRateLimiter).toBe('function');
    });

    it('should allow admin requests when under limit', () => {
      (rateLimiterService.isAllowed as Mock).mockReturnValue(true);
      (rateLimiterService.getRemaining as Mock).mockReturnValue(99);

      adminRateLimiter(mockRequest as Request, mockResponse as Response, mockNext);

      expect(rateLimiterService.isAllowed).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('loginRateLimiter', () => {
    it('should be a function', () => {
      expect(typeof loginRateLimiter).toBe('function');
    });

    it('should allow login attempts when under limit', () => {
      (rateLimiterService.isAllowed as Mock).mockReturnValue(true);
      (rateLimiterService.getRemaining as Mock).mockReturnValue(4);

      loginRateLimiter(mockRequest as Request, mockResponse as Response, mockNext);

      expect(rateLimiterService.isAllowed).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('createWhatsAppRateLimiter', () => {
    it('should create WhatsApp rate limiter with phone number key', () => {
      mockRequest.body = { phoneNumberHash: 'hash123' };
      (rateLimiterService.isAllowed as Mock).mockReturnValue(true);
      (rateLimiterService.getRemaining as Mock).mockReturnValue(9);

      const whatsappLimiter = createWhatsAppRateLimiter();
      whatsappLimiter(mockRequest as Request, mockResponse as Response, mockNext);

      expect(rateLimiterService.isAllowed).toHaveBeenCalledWith('hash123', 10, 60 * 1000);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should fallback to IP when no phone number hash', () => {
      (rateLimiterService.isAllowed as Mock).mockReturnValue(true);
      (rateLimiterService.getRemaining as Mock).mockReturnValue(9);

      const whatsappLimiter = createWhatsAppRateLimiter();
      whatsappLimiter(mockRequest as Request, mockResponse as Response, mockNext);

      expect(rateLimiterService.isAllowed).toHaveBeenCalledWith('127.0.0.1', 10, 60 * 1000);
    });
  });
});
