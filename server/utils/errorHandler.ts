/**
 * Global error handling for AI/API routes.
 * Returns consistent JSON error payloads instead of crashing the stream.
 */

import { Response } from 'express';

export interface ApiErrorBody {
  error: true;
  code: string;
  message: string;
  details?: string;
}

const RATE_LIMIT_CODE = 'RATE_LIMIT_EXCEEDED';
const QUOTA_EXCEEDED_CODE = 'QUOTA_EXCEEDED';
const TIMEOUT_CODE = 'TIMEOUT';
const BAD_REQUEST_CODE = 'BAD_REQUEST';
const SERVER_ERROR_CODE = 'SERVER_ERROR';

export function isRateLimitError(err: unknown): boolean {
  if (err && typeof err === 'object' && 'status' in err) {
    return (err as { status?: number }).status === 429;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('429') || msg.toLowerCase().includes('resource exhausted') || msg.toLowerCase().includes('quota');
}

export function isTimeoutError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('timeout') || msg.includes('ETIMEDOUT') || msg.includes('deadline');
}

/**
 * Send a graceful JSON error response. Use for SSE routes by sending an event first.
 */
export function sendJsonError(res: Response, code: string, message: string, statusCode: number = 500, details?: string): void {
  if (res.headersSent) return;
  res.status(statusCode).json({
    error: true,
    code,
    message,
    ...(details && { details }),
  } as ApiErrorBody);
}

/**
 * Send an SSE error event (for streaming routes). Then the client can close the stream.
 */
export function sendSSEError(res: Response, code: string, message: string, details?: string): void {
  if (res.headersSent) return;
  const payload: ApiErrorBody = { error: true, code, message, ...(details && { details }) };
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

/**
 * Normalize unknown errors from Gemini or network into a consistent shape.
 */
export function normalizeError(err: unknown): { code: string; message: string; statusCode: number } {
  if (isRateLimitError(err)) {
    return { code: QUOTA_EXCEEDED_CODE, message: 'Rate limit exceeded. Please try again in a moment.', statusCode: 429 };
  }
  if (isTimeoutError(err)) {
    return { code: TIMEOUT_CODE, message: 'Request timed out. Please try again.', statusCode: 504 };
  }
  if (err instanceof Error) {
    const msg = err.message || 'An unexpected error occurred';
    return { code: SERVER_ERROR_CODE, message: msg, statusCode: 500 };
  }
  return { code: SERVER_ERROR_CODE, message: 'An unexpected error occurred', statusCode: 500 };
}
