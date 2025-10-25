import { Request, Response, NextFunction } from 'express';
import { rateLimiterService } from '../../services/auth/rate-limiter.service';
import { ErrorCodes, HttpStatus } from '../../utils/error-codes';
import { env } from '../../config/environment';

/**
 * Rate limit configuration
 */
interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: Request) => string;
}

/**
 * Create rate limit middleware
 * @param config - Rate limit configuration
 * @returns Express middleware
 */
export function createRateLimitMiddleware(config: RateLimitConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Generate key (default to IP address)
    const key = config.keyGenerator
      ? config.keyGenerator(req)
      : req.ip || req.socket.remoteAddress || 'unknown';

    // Check if request is allowed
    const allowed = rateLimiterService.isAllowed(key, config.maxRequests, config.windowMs);

    if (!allowed) {
      // Get time until reset
      const resetTime = rateLimiterService.getResetTime(key);
      const resetInSeconds = resetTime ? Math.ceil(resetTime / 1000) : 0;

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', config.maxRequests);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', resetInSeconds);

      res.status(HttpStatus.TOO_MANY_REQUESTS).json({
        error: 'Too many requests, please try again later',
        code: ErrorCodes.RATE_LIMIT_EXCEEDED,
        details: {
          retryAfter: resetInSeconds,
        },
      });
      return;
    }

    // Set rate limit headers
    const remaining = rateLimiterService.getRemaining(key, config.maxRequests);
    const resetTime = rateLimiterService.getResetTime(key);
    const resetInSeconds = resetTime ? Math.ceil(resetTime / 1000) : 0;

    res.setHeader('X-RateLimit-Limit', config.maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining ?? config.maxRequests);
    res.setHeader('X-RateLimit-Reset', resetInSeconds);

    next();
  };
}

/**
 * Admin API rate limiter (100 requests per 15 minutes)
 */
export const adminRateLimiter = createRateLimitMiddleware({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
});

/**
 * Login rate limiter (5 attempts per 15 minutes)
 */
export const loginRateLimiter = createRateLimitMiddleware({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  maxRequests: env.LOGIN_RATE_LIMIT_MAX,
});

/**
 * WhatsApp message rate limiter (10 messages per minute per phone number)
 */
export function createWhatsAppRateLimiter() {
  return createRateLimitMiddleware({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,
    keyGenerator: (req: Request) => {
      // Use phone number hash from request body
      return req.body?.phoneNumberHash || req.ip || 'unknown';
    },
  });
}
