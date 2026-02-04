/**
 * AI Service: Gemini streaming, token counting, exponential backoff.
 * Uses @google/genai generateContentStream and countTokens.
 */

import { GoogleGenAI } from '@google/genai';
import { logUsage } from './utils/usageLogger';
import { isRateLimitError } from './utils/errorHandler';
import { getWeatherContext } from './utils/weatherService';
import { getTimeContext } from './utils/timeService';
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
 * Detect if current message is a follow-up or a new question
 */
function isFollowUpQuestion(currentMessage: string, history: Array<{ role: 'user' | 'model'; text: string }>): boolean {
  if (!history || history.length === 0) return false;
  
  const lowerMessage = currentMessage.toLowerCase().trim();
  const followUpIndicators = [
    'what about', 'and', 'also', 'tell me more', 'explain', 'how about',
    'what if', 'can you', 'could you', 'please', 'yes', 'no', 'ok',
    'thanks', 'thank you', 'that', 'this', 'it', 'they', 'he', 'she'
  ];
  
  // Check if message starts with follow-up indicators
  const startsWithFollowUp = followUpIndicators.some(indicator => 
    lowerMessage.startsWith(indicator)
  );
  
  // Check if message is very short (likely a follow-up)
  const isShortFollowUp = lowerMessage.length < 20 && (
    lowerMessage.includes('?') || 
    followUpIndicators.some(ind => lowerMessage.includes(ind))
  );
  
  return startsWithFollowUp || isShortFollowUp;
}

/**
 * Build contents for Gemini: string for single turn (no history, no image), else array of Content.
 */
async function buildContents(payload: StreamChatPayload, webContext?: string): Promise<unknown> {
  const hasHistory = payload.history && payload.history.length > 0;
  const hasImage = !!(payload.imageBase64 && payload.mimeType);
  const weatherContext = await getWeatherContext(payload.message);
  const timeContext = getTimeContext(payload.message);
  
  // Check if this is a new question vs follow-up
  const isFollowUp = hasHistory ? isFollowUpQuestion(payload.message, payload.history!) : false;

  if (!hasHistory && !hasImage && !weatherContext && !timeContext && !webContext) {
    return payload.message;
  }

  const contents: unknown[] = [];
  // Only include history if it's a follow-up question or explicitly needed
  // For completely new questions, don't include previous context to avoid confusion
  if (hasHistory && (isFollowUp || payload.history!.length <= 2)) {
    // Limit history to last 2-3 exchanges to avoid carrying over too much context
    const recentHistory = payload.history!.slice(-4); // Last 2 user-model pairs
    for (const turn of recentHistory) {
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

/**
 * Generate multiple search query variations to get more comprehensive results
 * Similar to how Perplexity AI makes multiple searches
 */
function generateSearchQueryVariations(query: string): string[] {
  const queries: string[] = [query]; // Original query
  
  // Add variations for better coverage
  const lowerQuery = query.toLowerCase();
  
  // For trending queries, add time-specific variations
  if (lowerQuery.includes('trending') || lowerQuery.includes('latest') || lowerQuery.includes('today')) {
    queries.push(`${query} February 2026`);
    queries.push(`${query} current events`);
    queries.push(`${query} news`);
  }
  
  // For general queries, add context variations
  if (!lowerQuery.includes('trending') && !lowerQuery.includes('latest')) {
    queries.push(`${query} 2026`);
    queries.push(`${query} recent`);
  }
  
  // Limit to 3-4 queries to avoid too many API calls
  return queries.slice(0, 4);
}

async function maybeGetWebResults(
  ai: GoogleGenAI,
  model: string,
  message: string
): Promise<{ results: GoogleSearchResult[]; lastUpdated: string } | null> {
  const query = message.trim();
  
  if (!query) {
    return null;
  }

  try {
    // Generate multiple query variations for comprehensive results (like Perplexity)
    const queryVariations = generateSearchQueryVariations(query);
    
    console.log('[aiService] Generated search query variations:', queryVariations);
    
    // Execute searches with small delays to avoid rate limits
    // Perplexity AI uses this strategy to get comprehensive results
    const allResults: GoogleSearchResult[][] = [];
    for (let i = 0; i < queryVariations.length; i++) {
      const results = await performWebSearch(queryVariations[i]);
      allResults.push(results);
      // Small delay between searches to avoid rate limiting (except for last one)
      if (i < queryVariations.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay
      }
    }
    
    // Aggregate and deduplicate results
    const aggregatedResults: GoogleSearchResult[] = [];
    const seenUrls = new Set<string>();
    
    for (const results of allResults) {
      for (const result of results) {
        // Normalize URL to avoid duplicates (remove trailing slashes, query params, etc.)
        const normalizedUrl = result.link
          .replace(/\/$/, '') // Remove trailing slash
          .split('?')[0] // Remove query parameters
          .toLowerCase();
        
        if (!seenUrls.has(normalizedUrl) && result.link) {
          seenUrls.add(normalizedUrl);
          aggregatedResults.push(result);
        }
      }
    }
    
    // Sort by relevance (prioritize results with titles and snippets)
    aggregatedResults.sort((a, b) => {
      const aScore = (a.title ? 1 : 0) + (a.snippet ? 1 : 0);
      const bScore = (b.title ? 1 : 0) + (b.snippet ? 1 : 0);
      return bScore - aScore;
    });
    
    // Limit to top 15-20 results (similar to Perplexity)
    const finalResults = aggregatedResults.slice(0, 20);
    
    console.log('[aiService] Aggregated search results:', finalResults.length, 'from', queryVariations.length, 'queries');
    
    return { results: finalResults, lastUpdated: new Date().toISOString() };
  } catch (error) {
    console.error('[aiService] Web search error:', error);
    return null;
  }
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
  
  // Format web context more naturally - only include if results exist
  const webContext = web && web.results.length > 0
    ? `IMPORTANT: Web search results have been retrieved for the user's query. You MUST extract and present the actual information from these sources in your response. Do NOT give disclaimers or suggest the user check the sources themselves - YOU must provide the answer using this information.

Web search results for: "${payload.message}"\n\n` +
      web.results
        .map((r, i) => `${i + 1}. ${r.title}\n   ${r.link}\n   ${r.snippet || ''}`)
        .join('\n\n') +
      `\n\nCRITICAL INSTRUCTIONS:
- Extract the key information from the above search results
- Present this information directly in your answer
- Structure your response with clear sections if there are multiple topics
- Include specific details, facts, and data from the sources
- Cite sources naturally within your response (e.g., "According to [source]...")
- DO NOT say "I cannot provide" or "check these sources" - YOU must provide the answer
- For trending topics, list the actual trends with details from the sources
- Be comprehensive and informative, like Perplexity AI`
    : undefined;
  const contents = await buildContents(payload, webContext);

  if (web) {
    yield { type: 'meta', webResults: web.results, lastUpdated: web.lastUpdated };
  }

  // Detect if this is a new question (not a follow-up)
  const isNewQuestion = !payload.history || payload.history.length === 0 || 
    !isFollowUpQuestion(payload.message, payload.history || []);
  
  // Only add web search instruction if web results are available
  // Make it clear this is a new question if applicable
  let updatedSystemInstruction = payload.systemInstruction || '';
  
  if (web && web.results.length > 0) {
    const webInstruction = isNewQuestion
      ? `\n\nCRITICAL: Web search results have been provided. You MUST:
1. Extract and present the actual information from the search results
2. Answer the question directly using the information from the sources
3. Structure your response clearly (use sections, bullet points, etc.)
4. Include specific details, facts, and data from the sources
5. Cite sources naturally (e.g., "According to [source name]...")
6. DO NOT give disclaimers like "I cannot provide" or "check these sources"
7. DO NOT apologize or say you don't have access - you have the search results
8. For "trending" queries, list the actual trending topics with details
9. Be comprehensive and informative - extract all relevant information
10. Only mention "Last updated" if truly time-sensitive (breaking news)

Example for "what's trending today":
- Extract the actual trending topics from the sources
- List them with details: "1. [Topic] - [details from sources]"
- Include specific information, not just general suggestions
- Cite sources naturally within the content`
      : `\n\nWeb search results are available. Extract and present the actual information from these sources. Do not give disclaimers - provide the answer using the search results.`;
    
    updatedSystemInstruction = `${updatedSystemInstruction}${webInstruction}`;
  } else if (isNewQuestion) {
    // For new questions without web results, emphasize independence
    updatedSystemInstruction = `${updatedSystemInstruction}\n\nThis is a NEW question. Answer it directly and independently. Don't reference previous conversation unless explicitly relevant.`;
  }

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
