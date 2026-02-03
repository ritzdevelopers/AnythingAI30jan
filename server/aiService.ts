/**
 * AI Service: Gemini streaming, token counting, exponential backoff.
 * Uses @google/genai generateContentStream and countTokens.
 */

import { GoogleGenAI, FunctionCallingConfigMode } from '@google/genai';
import { logUsage } from './utils/usageLogger';
import { isRateLimitError } from './utils/errorHandler';
import { getWeatherContext } from './utils/weatherService';
import { getTimeContext } from './utils/timeService';
import { googleSearchTool } from './utils/geminiTools';
import { performWebSearch, type GoogleSearchResult } from './services/googleSearch';

const MAX_RETRIES = 4;

function getModel(): string {
  return process.env.GEMINI_MODEL || 'gemini-2.5-flash';
}
const INITIAL_BACKOFF_MS = 1000;

export interface StreamChatPayload {
  message: string;
  systemInstruction?: string;
  history?: Array<{ role: 'user' | 'model'; text: string }>;
  imageBase64?: string;
  mimeType?: string;
}

export interface StreamChunk {
  type: 'token';
  text: string;
}

export interface StreamMeta {
  type: 'meta';
  webResults?: GoogleSearchResult[];
  lastUpdated?: string;
}

export interface StreamEndChunk {
  type: 'done';
  usage?: { inputTokens: number; outputTokens: number };
}

export type StreamPayload = StreamChunk | StreamMeta | StreamEndChunk;

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY (or VITE_GEMINI_API_KEY) is not set.');
  return key;
}

/**
 * Build contents for Gemini: string for single turn (no history, no image), else array of Content.
 */
async function buildContents(payload: StreamChatPayload, webContext?: string): Promise<unknown> {
  const hasHistory = payload.history && payload.history.length > 0;
  const hasImage = !!(payload.imageBase64 && payload.mimeType);
  const weatherContext = await getWeatherContext(payload.message);
  const timeContext = getTimeContext(payload.message);

  if (!hasHistory && !hasImage && !weatherContext && !timeContext && !webContext) {
    return payload.message;
  }

  const contents: unknown[] = [];
  if (hasHistory) {
    for (const turn of payload.history!) {
      contents.push({
        role: turn.role === 'user' ? 'user' : 'model',
        parts: [{ text: turn.text }],
      });
    }
  }

  if (timeContext) {
    contents.push({
      role: 'user',
      parts: [{ text: timeContext }],
    });
  }

  if (weatherContext) {
    contents.push({
      role: 'user',
      parts: [{ text: weatherContext }],
    });
  }

  if (webContext) {
    contents.push({
      role: 'user',
      parts: [{ text: webContext }],
    });
  }

  const lastParts: unknown[] = [{ text: payload.message }];
  if (hasImage) {
    lastParts.push({
      inlineData: {
        mimeType: payload.mimeType!,
        data: payload.imageBase64!,
      },
    });
  }
  contents.push({ role: 'user', parts: lastParts });

  return contents;
}

async function maybeGetWebResults(
  ai: GoogleGenAI,
  model: string,
  message: string
): Promise<{ results: GoogleSearchResult[]; lastUpdated: string } | null> {
  const response = await ai.models.generateContent({
    model,
    contents: message,
    config: {
      tools: [{ functionDeclarations: [googleSearchTool] }],
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingConfigMode.ANY,
          allowedFunctionNames: ['google_search'],
        },
      },
      systemInstruction:
        'Always call google_search for every user query. Use a short, precise search query.',
    },
  });

  const call = response.functionCalls?.[0];
  if (!call || call.name !== 'google_search') {
    return { results: [{ title: 'Search unavailable', link: '', snippet: 'Model did not call google_search.' }], lastUpdated: new Date().toISOString() };
  }
  const query = (call.args?.query as string | undefined)?.trim() || message;

  const results = await performWebSearch(query);
  return { results, lastUpdated: new Date().toISOString() };
}

/**
 * Exponential backoff: wait then retry. Throws after MAX_RETRIES.
 */
async function withBackoff<T>(fn: () => Promise<T>, attempt: number = 0): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isRateLimitError(err) || attempt >= MAX_RETRIES) {
      throw err;
    }
    const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
    await new Promise((r) => setTimeout(r, delay));
    return withBackoff(fn, attempt + 1);
  }
}

/**
 * Count input tokens for the request (for logging). Catches and returns 0 on failure.
 */
async function countInputTokens(ai: GoogleGenAI, model: string, contents: unknown): Promise<number> {
  try {
    const res = await ai.models.countTokens({
      model,
      contents,
    });
    return res.totalTokens ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Stream Gemini response via generateContentStream with SSE-friendly chunks.
 * Yields { type: 'token', text } for each chunk, then { type: 'done', usage? }.
 * Implements exponential backoff on 429 and logs usage.
 */
export async function* streamGenerateContent(
  payload: StreamChatPayload
): AsyncGenerator<StreamPayload, void, unknown> {
  const model = getModel();
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });
  const web = await maybeGetWebResults(ai, model, payload.message);
  const webContext = web
    ? `Realtime web results (Last updated: ${web.lastUpdated}):\n` +
      web.results
        .map((r, i) => `${i + 1}. ${r.title}\n${r.link}\n${r.snippet}`)
        .join('\n\n')
    : undefined;
  const contents = await buildContents(payload, webContext);

  if (web) {
    yield { type: 'meta', webResults: web.results, lastUpdated: web.lastUpdated };
  }

  const updatedSystemInstruction = web
    ? `${payload.systemInstruction || ''}\n\nUse the realtime web results if provided and end the response with "Last updated: ${web.lastUpdated}".`
    : payload.systemInstruction;

  const streamParams = {
    model,
    contents,
    config: {
      ...(updatedSystemInstruction && { systemInstruction: updatedSystemInstruction }),
      maxOutputTokens: 8192,
      temperature: 0.7,
    },
  };

  const startTime = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;

  inputTokens = await countInputTokens(ai, model, contents);

  const stream = await withBackoff(async () => ai.models.generateContentStream(streamParams));

  let fullText = '';
  let lastUsage: { promptTokenCount?: number; candidatesTokenCount?: number } | undefined;

  for await (const chunk of stream) {
    const text = (chunk as { text?: string }).text;
    if (text) {
      fullText += text;
      yield { type: 'token', text };
    }
    const um = (chunk as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }).usageMetadata;
    if (um) lastUsage = um;
  }

  if (lastUsage) {
    outputTokens = lastUsage.candidatesTokenCount ?? 0;
    if (lastUsage.promptTokenCount != null) inputTokens = lastUsage.promptTokenCount;
  } else if (fullText) {
    try {
      const countRes = await ai.models.countTokens({ model, contents: fullText });
      outputTokens = countRes.totalTokens ?? 0;
    } catch {
      outputTokens = 0;
    }
  }

  const durationMs = Date.now() - startTime;
  logUsage({
    timestamp: new Date().toISOString(),
    model,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    durationMs,
  });

  yield {
    type: 'done',
    usage: { inputTokens, outputTokens },
  };
}
