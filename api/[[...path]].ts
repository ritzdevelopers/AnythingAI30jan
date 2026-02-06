/**
 * Vercel serverless handler: forwards all /api/* requests to the Express app.
 * Vercel may pass the path without the /api prefix (e.g. /auth/register), so we normalize req.url so Express routes match.
 */
import { app } from '../server/index';

function handler(req: { url?: string }, res: unknown): void {
  const url = req.url ?? '';
  if (url && !url.startsWith('/api')) {
    req.url = '/api' + (url.startsWith('/') ? url : '/' + url);
  }
  app(req as any, res as any);
}

export default handler;
