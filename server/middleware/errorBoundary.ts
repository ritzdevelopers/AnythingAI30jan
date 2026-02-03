/**
 * Global error boundary for AI/API routes.
 * Catches errors and returns a graceful JSON response instead of crashing.
 */

import { Request, Response, NextFunction } from 'express';
import { sendJsonError, normalizeError } from '../utils/errorHandler';

export function apiErrorBoundary(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const { code, message, statusCode } = normalizeError(err);
  sendJsonError(res, code, message, statusCode);
}
