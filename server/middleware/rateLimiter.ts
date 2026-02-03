/**
 * Rate limiting middleware to prevent abuse.
 * Uses express-rate-limit.
 */

import rateLimit from 'express-rate-limit';

const REQUESTS_PER_WINDOW = Number(process.env.RATE_LIMIT_MAX) || 30;
const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000; // 1 minute

export const apiRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: REQUESTS_PER_WINDOW,
  message: {
    error: true,
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
