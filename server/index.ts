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
import { Types } from 'mongoose';
import { apiRateLimiter } from './middleware/rateLimiter';
import { withQueue } from './middleware/requestQueue';
import { apiErrorBoundary } from './middleware/errorBoundary';
import { protect, checkDepartmentAccess } from './middleware/auth';
import { sendSSEError, sendJsonError, normalizeError } from './utils/errorHandler';
import { getWeatherData } from './utils/weatherService';
import { getTimeData } from './utils/timeService';
import { streamGenerateContent, type StreamChatPayload, type StreamPayload } from './aiService';
import { performWebSearch } from './services/googleSearch';
import connectDB from './db/db';
import { register, login } from './controllers/authController';
import Conversation from './models/conversations/Conversation';
import Message from './models/messages/Messages';
import Department from './models/department/Department';

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
 * GET /api/departments
 * Returns list of departments (id, name, icon, description) for register/UI.
 */
app.get('/api/departments', async (req, res) => {
  try {
    const list = await Department.find().select('name icon description').lean();
    res.json({ departments: list.map((d) => ({ id: d._id, name: d.name, icon: d.icon, description: d.description })) });
  } catch (err) {
    console.error('[API] Departments list error:', err);
    sendJsonError(res, 'SERVER_ERROR', 'Failed to list departments.', 500);
  }
});

/**
 * POST /api/auth/register
 * Body: { email, password, departmentName }
 */
app.post('/api/auth/register', register);

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
app.post('/api/auth/login', login);

/**
 * GET /api/conversations?departmentId=... (protected, department access)
 * Returns list of conversations for the user in the given department.
 */
app.get('/api/conversations', protect, checkDepartmentAccess, async (req, res) => {
  const departmentId = req.query?.departmentId ?? req.body?.departmentId;
  if (!departmentId || !req.user) {
    sendJsonError(res, 'BAD_REQUEST', 'departmentId is required.', 400);
    return;
  }
  try {
    const deptId = typeof departmentId === 'string' ? new Types.ObjectId(departmentId) : new Types.ObjectId(String(departmentId));
    const list = await Conversation.find({ userId: new Types.ObjectId(req.user.userId), departmentId: deptId })
      .sort({ pinned: -1, updatedAt: -1 })
      .limit(50)
      .select('_id title updatedAt departmentId pinned')
      .lean();
    res.json({ conversations: list.map((c) => ({ id: (c._id as Types.ObjectId).toString(), title: c.title, updatedAt: c.updatedAt, departmentId: (c.departmentId as Types.ObjectId)?.toString(), pinned: !!c.pinned })) });
  } catch (err) {
    console.error('[API] Conversations list error:', err);
    sendJsonError(res, 'SERVER_ERROR', 'Failed to list conversations.', 500);
  }
});

/**
 * GET /api/conversations/all (protected)
 * Returns all conversations for the user (for Chat History view), with departmentId for grouping.
 */
app.get('/api/conversations/all', protect, async (req, res) => {
  if (!req.user) {
    sendJsonError(res, 'UNAUTHORIZED', 'Authentication required.', 401);
    return;
  }
  try {
    const list = await Conversation.find({ userId: new Types.ObjectId(req.user.userId) })
      .sort({ pinned: -1, updatedAt: -1 })
      .limit(100)
      .select('_id title updatedAt departmentId pinned')
      .lean();
    res.json({ conversations: list.map((c) => ({ id: (c._id as Types.ObjectId).toString(), title: c.title, updatedAt: c.updatedAt, departmentId: c.departmentId?.toString(), pinned: !!c.pinned })) });
  } catch (err) {
    console.error('[API] Conversations list error:', err);
    sendJsonError(res, 'SERVER_ERROR', 'Failed to list conversations.', 500);
  }
});

/**
 * GET /api/conversations/:id/messages (protected)
 * Returns messages for a conversation (must belong to current user).
 */
app.get('/api/conversations/:id/messages', protect, async (req, res) => {
  const conversationId = req.params?.id;
  if (!conversationId || !req.user) {
    sendJsonError(res, 'BAD_REQUEST', 'Conversation id is required.', 400);
    return;
  }
  try {
    if (typeof conversationId !== 'string') {
      sendJsonError(res, 'BAD_REQUEST', 'Invalid conversation id.', 400);
      return;
    }
    if (typeof req.user.userId !== 'string') {
      sendJsonError(res, 'BAD_REQUEST', 'Invalid user id.', 400);
      return;
    }
    const conv = await Conversation.findOne({
      _id: new Types.ObjectId(conversationId),
      userId: new Types.ObjectId(req.user.userId),
    });
    if (!conv) {
      sendJsonError(res, 'NOT_FOUND', 'Conversation not found.', 404);
      return;
    }
    const messages = await Message.find({ conversationId: conv._id })
      .sort({ createdAt: 1 })
      .lean();
    res.json({
      messages: messages.map((m) => ({ role: m.role, text: String(m.text ?? ''), createdAt: m.createdAt })),
    });
  } catch (err) {
    console.error('[API] Conversation messages error:', err);
    sendJsonError(res, 'SERVER_ERROR', 'Failed to load messages.', 500);
  }
});

/**
 * PATCH /api/conversations/:id (protected)
 * Body: { title?: string, pinned?: boolean }
 */
app.patch('/api/conversations/:id', protect, async (req, res) => {
  const rawId = req.params?.id;
  const id = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] : undefined;
  if (!id || !req.user) {
    sendJsonError(res, 'BAD_REQUEST', 'Conversation id is required.', 400);
    return;
  }
  try {
    const conv = await Conversation.findOne({
      _id: new Types.ObjectId(id),
      userId: new Types.ObjectId(req.user.userId),
    });
    if (!conv) {
      sendJsonError(res, 'NOT_FOUND', 'Conversation not found.', 404);
      return;
    }
    const body = req.body as { title?: string; pinned?: boolean };
    const updates: { title?: string; pinned?: boolean; updatedAt?: Date } = { updatedAt: new Date() };
    if (typeof body.title === 'string') {
      const t = body.title.trim().slice(0, 80) || 'New Conversation';
      updates.title = t;
    }
    if (typeof body.pinned === 'boolean') updates.pinned = body.pinned;
    await Conversation.findByIdAndUpdate(conv._id, { $set: updates });
    const updated = await Conversation.findById(conv._id).select('title pinned updatedAt').lean();
    res.json({
      id: (updated!._id as Types.ObjectId).toString(),
      title: updated!.title,
      pinned: !!updated!.pinned,
      updatedAt: updated!.updatedAt,
    });
  } catch (err) {
    console.error('[API] Conversation update error:', err);
    sendJsonError(res, 'SERVER_ERROR', 'Failed to update conversation.', 500);
  }
});

/**
 * DELETE /api/conversations/:id (protected)
 */
app.delete('/api/conversations/:id', protect, async (req, res) => {
  const rawId = req.params?.id;
  const id = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] : undefined;
  if (!id || !req.user) {
    sendJsonError(res, 'BAD_REQUEST', 'Conversation id is required.', 400);
    return;
  }
  try {
    const conv = await Conversation.findOne({
      _id: new Types.ObjectId(id),
      userId: new Types.ObjectId(req.user.userId),
    });
    if (!conv) {
      sendJsonError(res, 'NOT_FOUND', 'Conversation not found.', 404);
      return;
    }
    await Message.deleteMany({ conversationId: conv._id });
    await Conversation.findByIdAndDelete(conv._id);
    res.status(204).end();
  } catch (err) {
    console.error('[API] Conversation delete error:', err);
    sendJsonError(res, 'SERVER_ERROR', 'Failed to delete conversation.', 500);
  }
});

/**
 * POST /api/chat/stream (protected, department access required)
 * Body: { message, departmentId, conversationId?, accessCode?, systemInstruction?, history?, imageBase64?, mimeType? }
 * Flow: create conversation if needed → save user message → stream → save assistant message.
 * Response: SSE same as before (token, meta, done / error).
 */
app.post('/api/chat/stream', protect, checkDepartmentAccess, (req, res) => {
  const body = req.body as StreamChatPayload & { departmentId?: string; conversationId?: string; accessCode?: string };
  const message = body?.message?.trim();
  const departmentId = body?.departmentId;
  const conversationId = body?.conversationId;

  if (!message && !body?.imageBase64) {
    sendJsonError(res, 'BAD_REQUEST', 'Missing message or image.', 400);
    return;
  }
  if (!departmentId) {
    sendJsonError(res, 'BAD_REQUEST', 'departmentId is required.', 400);
    return;
  }
  if (!req.user) {
    sendJsonError(res, 'UNAUTHORIZED', 'Authentication required.', 401);
    return;
  }

  const userId = new Types.ObjectId(req.user.userId);
  const deptId = typeof departmentId === 'string' ? new Types.ObjectId(departmentId) : (departmentId as Types.ObjectId);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  withQueue(async () => {
    let conversationIdToUse: Types.ObjectId;
    try {
      if (conversationId) {
        const existing = await Conversation.findOne({
          _id: new Types.ObjectId(conversationId),
          userId,
          departmentId: deptId,
        });
        if (!existing) {
          sendSSEError(res, 'BAD_REQUEST', 'Conversation not found or access denied.');
          if (!res.writableEnded) res.end();
          return;
        }
        conversationIdToUse = existing._id as Types.ObjectId;
      } else {
        const newConv = await Conversation.create({
          userId,
          departmentId: deptId,
          title: 'New Conversation',
        });
        conversationIdToUse = newConv._id as Types.ObjectId;
      }

      const recentMessages = await Message.find({ conversationId: conversationIdToUse })
        .sort({ createdAt: 1 })
        .limit(40)
        .lean();
      const history: Array<{ role: 'user' | 'model'; text: string }> = recentMessages.map((m) => ({
        role: m.role as 'user' | 'model',
        text: String(m.text ?? ''),
      }));

      const countBefore = await Message.countDocuments({ conversationId: conversationIdToUse });
      await Message.create({
        conversationId: conversationIdToUse,
        role: 'user',
        text: message || (body.imageBase64 ? '[image]' : ''),
      });

      let conversationTitle: string | undefined;
      if (countBefore === 0) {
        conversationTitle = (message || (body.imageBase64 ? 'Image' : 'New Conversation')).slice(0, 80).trim() || 'New Conversation';
        await Conversation.findByIdAndUpdate(conversationIdToUse, { $set: { title: conversationTitle, updatedAt: new Date() } });
      }

      if (!conversationId) {
        res.write(`data: ${JSON.stringify({ type: 'conversation', conversationId: conversationIdToUse.toString(), title: conversationTitle })}\n\n`);
        if (typeof (res as unknown as { flush?: () => void }).flush === 'function') {
          (res as unknown as { flush: () => void }).flush();
        }
      }

      const payload: StreamChatPayload = {
        message: message || '',
        systemInstruction: body.systemInstruction,
        history,
        imageBase64: body.imageBase64,
        mimeType: body.mimeType,
      };

      let accumulatedText = '';
      for await (const chunk of streamGenerateContent(payload)) {
        if (res.writableEnded) break;
        const payloadChunk = chunk as StreamPayload;
        if (payloadChunk && typeof payloadChunk === 'object' && 'type' in payloadChunk && payloadChunk.type === 'token') {
          accumulatedText += (payloadChunk as { text: string }).text;
        }
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        if (typeof (res as unknown as { flush?: () => void }).flush === 'function') {
          (res as unknown as { flush: () => void }).flush();
        }
      }

      await Message.create({
        conversationId: conversationIdToUse,
        role: 'model',
        text: accumulatedText || '(no response)',
      });

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
