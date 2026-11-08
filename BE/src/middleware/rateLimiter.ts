import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

interface RateLimitRecord {
  timestamps: number[];
}

export function createRateLimiter(options: { windowMs: number; maxAttempts: number; message: string }) {
  const store = new Map<string, RateLimitRecord>();

  // Periodically clean up entries older than 2x windowMs
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of store.entries()) {
      record.timestamps = record.timestamps.filter((ts) => now - ts < options.windowMs);
      if (record.timestamps.length === 0) {
        store.delete(key);
      }
    }
  }, options.windowMs * 2).unref();

  return (req: Request, _res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const record = store.get(ip) || { timestamps: [] };

    // Filter to current window
    record.timestamps = record.timestamps.filter((ts) => now - ts < options.windowMs);

    if (record.timestamps.length >= options.maxAttempts) {
      next(new AppError(429, 'RATE_LIMIT_EXCEEDED', options.message));
      return;
    }

    record.timestamps.push(now);
    store.set(ip, record);
    next();
  };
}

export const authRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxAttempts: 15,     // 15 attempts per minute
  message: 'Too many authentication attempts. Please try again after 1 minute.',
});
