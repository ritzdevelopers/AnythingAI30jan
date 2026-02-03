/**
 * Google Custom Search JSON API integration.
 */

export type GoogleSearchResult = {
  title: string;
  link: string;
  snippet: string;
};

type GoogleSearchResponse = {
  items?: Array<{
    title?: string;
    link?: string;
    snippet?: string;
  }>;
  error?: { code?: number; message?: string };
};

const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

export async function performWebSearch(query: string): Promise<GoogleSearchResult[]> {
  const key = 'AIzaSyD-jteMcXh9qsZFVJ0_rEVT9xm294IQLNA';

  if (!key) {
    console.warn('[googleSearch] Missing GOOGLE_SEARCH_API_KEY or GOOGLE_SEARCH_ENGINE_ID');
    return [
      {
        title: 'Search unavailable',
        link: '',
        snippet: 'Missing Google Search API key or CX.',
      },
    ];
  }

  // if (key === process.env.VITE_GEMINI_API_KEY) {
  //   console.warn('[googleSearch] Key matches Gemini key - wrong key!');
  //   return [
  //     {
  //       title: 'Search unavailable',
  //       link: '',
  //       snippet: 'GOOGLE_SEARCH_API_KEY is the Gemini key. Use a Custom Search API key instead.',
  //     },
  //   ];
  // }

  // Here we are performing the Gemini API request instead of Google Search
  // const url = new URL(API_URL);

  // console.log('[googleSearch] Request URL:', url.toString().replace(/key=[^&]+/, 'key=***'));

  try {
    console.log(API_URL);
    
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {  
        'x-goog-api-key': `${key}`,  // Add API key in Authorization header
      },
      body: JSON.stringify({
        
          "contents": [
            {
              "parts": [
                {
                  "text": "what's trending news in delhi, today"
                }
              ],
              "role": "user"
            }
          ],
          "tools": [
            {
              "google_search": {}
            }
          ],
          "generationConfig": {
            "temperature": 1,
            "maxOutputTokens": 8192,
            "topP": 0.95,
            "topK": 40,
            "responseMimeType": "text/plain"
          },
          "safetySettings": [
            {
              "category": "HARM_CATEGORY_HARASSMENT",
              "threshold": "BLOCK_ONLY_HIGH"
            },
            {
              "category": "HARM_CATEGORY_HATE_SPEECH",
              "threshold": "BLOCK_ONLY_HIGH"
            },
            {
              "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
              "threshold": "BLOCK_ONLY_HIGH"
            },
            {
              "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
              "threshold": "BLOCK_ONLY_HIGH"
            }
          ]
         // Using the query passed to the function as the prompt
      }),
    });
    console.log(res);
    
    if (!res.ok) {
      let bodyText = '';
      try {
        bodyText = await res.text();
      } catch {
        // Ignore
      }
      console.warn('[googleSearch] Non-OK response:', res.status, bodyText);
      return [
        {
          title: 'Search unavailable',
          link: '',
          snippet: `Search failed (HTTP ${res.status}). ${bodyText ? `Details: ${bodyText}` : ''}`.trim(),
        },
      ];
    }

    const data = (await res.json()) as GoogleSearchResponse;
    if (data.error?.code === 429) {
      return [
        {
          title: 'Search unavailable',
          link: '',
          snippet: 'Quota exceeded.',
        },
      ];
    }

    const items = data.items || [];
    return items
      .map((item) => ({
        title: item.title || 'Untitled',
        link: item.link || '',
        snippet: item.snippet || '',
      }))
      .filter((item) => item.link); // Filter out items with no link

  } catch (error) {
    console.error('[googleSearch] Error:', error);
    return [
      {
        title: 'Search unavailable',
        link: '',
        snippet: 'An error occurred while making the request.',
      },
    ];
  }
}
