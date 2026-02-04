/**
 * Vercel serverless handler: forwards all /api/* requests to the Express app.
 * Env vars (GEMINI_API_KEY, GOOGLE_SEARCH_API_KEY, etc.) must be set in Vercel Project Settings → Environment Variables.
 */
import { app } from '../server/index';

export default app;
