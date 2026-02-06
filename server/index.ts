/**
 * Express server: SSE chat route, rate limiting, queue, error handling.
 * Load env first so GEMINI_MODEL and API key are available when aiService runs.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(root, '.env') });
dotenv.config({ path: path.join(root, '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import express from 'express';
import cors from 'cors';
import { apiRateLimiter } from './middleware/rateLimiter';
import { withQueue } from './middleware/requestQueue';
import { apiErrorBoundary } from './middleware/errorBoundary';
import { sendSSEError, sendJsonError, normalizeError } from './utils/errorHandler';
import { getWeatherData } from './utils/weatherService';
import { getTimeData } from './utils/timeService';
import { streamGenerateContent, type StreamChatPayload } from './aiService';
import { performWebSearch } from './services/googleSearch';
import connectDB from './db/db';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// CORS: allow Vercel frontend and local dev (fixes "blocked by CORS policy" when frontend on Vercel calls Render backend)
const allowedOrigins = [
  'https://anything-ai-30january.vercel.app',
  /^https:\/\/.*\.vercel\.app$/,  // preview deployments
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // same-origin or server-to-server
      if (allowedOrigins.some((o) => (typeof o === 'string' ? o === origin : o.test(origin)))) return cb(null, true);
      return cb(null, false);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json({ limit: '1mb' }));

// Rate limit all /api routes
app.use('/api', apiRateLimiter);

/**
 * GET /api/weather?query=...
 * Returns live weather data if query contains a location.
 */
app.get('/api/weather', async (req, res) => {
  const query = String(req.query.query || '').trim();
  if (!query) {
    sendJsonError(res, 'BAD_REQUEST', 'Missing query.', 400);
    return;
  }
  try {
    const data = await getWeatherData(query);
    if (!data) {
      res.json({ available: false });
      return;
    }
    res.json({ available: true, data });
  } catch (err) {
    console.error('[API] Weather lookup error:', err);
    sendJsonError(res, 'SERVER_ERROR', 'Weather lookup failed.', 500);
  }
});

/**
 * GET /api/time?query=...
 * Returns live date/time data for time-related queries.
 */
app.get('/api/time', async (req, res) => {
  const query = String(req.query.query || '').trim();
  if (!query) {
    sendJsonError(res, 'BAD_REQUEST', 'Missing query.', 400);
    return;
  }
  try {
    const data = getTimeData(query);
    if (!data) {
      res.json({ available: false });
      return;
    }
    res.json({ available: true, data });
  } catch (err) {
    console.error('[API] Time lookup error:', err);
    sendJsonError(res, 'SERVER_ERROR', 'Time lookup failed.', 500);
  }
});

/**
 * GET /api/search-test?query=...
 * Simple endpoint to verify Google Custom Search works.
 */
app.get('/api/search-test', async (req, res) => {
  const query = String(req.query.query || '').trim();
  if (!query) {
    sendJsonError(res, 'BAD_REQUEST', 'Missing query.', 400);
    return;
  }
  try {
    const results = await performWebSearch(query);
    res.json({ results });
  } catch (err) {
    console.error('[API] Search test error:', err);
    sendJsonError(res, 'SERVER_ERROR', 'Search test failed.', 500);
  }
});

/**
 * POST /api/chat/stream
 * Body: { message, systemInstruction?, history?, imageBase64?, mimeType? }
 * Response: Server-Sent Events stream.
 * Events: data: {"type":"token","text":"..."} then data: {"type":"done","usage":{...}}
 * On error: data: {"error":true,"code":"...","message":"..."}
 */
app.post('/api/chat/stream', (req, res) => {
  const payload = req.body as StreamChatPayload;
  const message = payload?.message?.trim();

  if (!message && !payload?.imageBase64) {
    sendJsonError(res, 'BAD_REQUEST', 'Missing message or image.', 400);
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  withQueue(async () => {
    try {
      for await (const chunk of streamGenerateContent(payload)) {
        if (res.writableEnded) break;
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        if (typeof (res as unknown as { flush?: () => void }).flush === 'function') {
          (res as unknown as { flush: () => void }).flush();
        }
      }
      if (!res.writableEnded) res.end();
    } catch (err) {
      console.error('[API] Gemini stream error:', err);
      const { code, message: msg } = normalizeError(err);
      sendSSEError(res, code, msg);
      if (!res.writableEnded) res.end();
    }
  }).catch((err) => {
    console.error('[API] Queue/request error:', err);
    const { code, message: msg } = normalizeError(err);
    sendSSEError(res, code, msg);
    if (!res.writableEnded) res.end();
  });
});

app.use(apiErrorBoundary);

// Only start listening when running locally (not on Vercel serverless)
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    connectDB();
  });
}

export { app };
