/**
 * Simple web search integration (Brave or SerpAPI).
 * Set one of:
 * - BRAVE_SEARCH_API_KEY (preferred)
 * - SERPAPI_API_KEY
 * Optional:
 * - SEARCH_PROVIDER=brave|serpapi
 */

export type WebResult = {
  title: string;
  url: string;
  snippet?: string;
  source?: string;
  content?: string;
};

const TIME_SENSITIVE_KEYWORDS =
  /\b(news|breaking|today|now|current|price|prices|stock|weather|forecast|score|earthquake|traffic|delay|exchange rate|crypto|market|live)\b/i;

export function isTimeSensitiveQuery(message: string): boolean {
  return TIME_SENSITIVE_KEYWORDS.test(message);
}

async function braveSearch(query: string): Promise<WebResult[]> {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return [];
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5&source=web`;
  const res = await fetch(url, {
    headers: {
      'X-Subscription-Token': key,
      Accept: 'application/json',
    },
  });
  if (!res.ok) return [];
  const data = await res.json();
  const results = data?.web?.results || [];
  return results.map((r: { title?: string; url?: string; description?: string; profile?: { name?: string } }) => ({
    title: r.title || 'Untitled',
    url: r.url || '',
    snippet: r.description || '',
    source: r.profile?.name,
  }));
}

async function serpApiSearch(query: string): Promise<WebResult[]> {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) return [];
  const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&api_key=${key}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  const results = data?.organic_results || [];
  return results.map((r: { title?: string; link?: string; snippet?: string }) => ({
    title: r.title || 'Untitled',
    url: r.link || '',
    snippet: r.snippet || '',
  }));
}

export async function searchWeb(query: string): Promise<WebResult[]> {
  const provider = (process.env.SEARCH_PROVIDER || '').toLowerCase();
  if (provider === 'serpapi') return serpApiSearch(query);
  if (provider === 'brave') return braveSearch(query);
  // Auto-detect
  if (process.env.BRAVE_SEARCH_API_KEY) return braveSearch(query);
  if (process.env.SERPAPI_API_KEY) return serpApiSearch(query);
  // Fallback: DuckDuckGo (no API key)
  return ddgSearch(query);
}

async function ddgSearch(query: string): Promise<WebResult[]> {
  const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) return [];
  const html = await res.text();
  const results: WebResult[] = [];
  const regex = /<a rel="nofollow" class="result-link" href="([^"]+)">([^<]+)<\/a>[\s\S]*?<td class="result-snippet">([\s\S]*?)<\/td>/g;
  let match;
  while ((match = regex.exec(html)) && results.length < 5) {
    const url = match[1];
    const title = match[2];
    const snippet = match[3].replace(/<[^>]+>/g, '').trim();
    results.push({ title, url, snippet, source: 'DuckDuckGo' });
  }
  return results;
}

async function fetchPageText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) return '';
  const html = await res.text();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, 1200);
}

export async function enrichResults(results: WebResult[]): Promise<WebResult[]> {
  const snippetOnly = process.env.SEARCH_SNIPPET_ONLY === 'true';
  if (snippetOnly) return results;
  const enriched = [...results];
  for (let i = 0; i < Math.min(2, enriched.length); i += 1) {
    try {
      const content = await fetchPageText(enriched[i].url);
      if (content) enriched[i].content = content;
    } catch {
      // ignore
    }
  }
  return enriched;
}

export function formatWebContext(results: WebResult[], lastUpdatedIso: string): string {
  const lines = results.map((r, i) => {
    const source = r.source ? ` (${r.source})` : '';
    const snippet = r.snippet ? ` - ${r.snippet}` : '';
    const content = r.content ? `\nExcerpt: ${r.content}` : '';
    return `${i + 1}. ${r.title}${source}\n${r.url}${snippet}${content}`;
  });
  return `Realtime web results (Last updated: ${lastUpdatedIso}):\n${lines.join('\n\n')}`;
}
