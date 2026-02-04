/**
 * Google Custom Search JSON API integration.
 */

export type GoogleSearchResult = {
  title: string;
  link: string;
  snippet: string;
};

type GoogleSearchResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        functionResponse?: {
          name?: string;
          response?: {
            searchResults?: Array<{
              title?: string;
              url?: string;
              snippet?: string;
            }>;
          };
        };
        text?: string;
      }>;
    };
    groundingMetadata?: {
      webSearchQueries?: string[];
      groundingChunks?: Array<{
        web?: {
          uri?: string;
          title?: string;
        };
      }>;
      searchEntryPoint?: {
        renderedContent?: string;
      };
    };
  }>;
  items?: Array<{
    title?: string;
    link?: string;
    snippet?: string;
  }>;
  error?: { code?: number; message?: string };
};

const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

export async function performWebSearch(query: string): Promise<GoogleSearchResult[]> {
  // Log the user's input that's being searched
  console.log('[googleSearch] User input received for search:', query);
  
  // Use environment variable instead of hardcoded key
  const key = process.env.GOOGLE_SEARCH_API_KEY || process.env.VITE_GEMINI_API_KEY;

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
                  "text": query  // ← This is the EXACT text the user typed in AI Assistant chat
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
    
    // Log the response structure for debugging
    console.log('[googleSearch] Response structure:', JSON.stringify(data, null, 2));
    
    if (data.error?.code === 429) {
      return [
        {
          title: 'Search unavailable',
          link: '',
          snippet: 'Quota exceeded.',
        },
      ];
    }

    // Parse Gemini API response with Google Search tool
    // Gemini API returns search results in groundingMetadata AND text content
    if (data.candidates && data.candidates.length > 0) {
      const candidate = data.candidates[0];
      const parts = candidate.content?.parts || [];
      let extractedText = '';
      
      // Extract text content from Gemini's response (contains synthesized information)
      for (const part of parts) {
        if (part.text) {
          extractedText += part.text + '\n\n';
        }
      }
      
      // Check for groundingMetadata (correct format for Google Search tool)
      if (candidate.groundingMetadata?.groundingChunks) {
        const chunks = candidate.groundingMetadata.groundingChunks;
        const searchResults: GoogleSearchResult[] = [];
        
        for (const chunk of chunks) {
          if (chunk.web?.uri) {
            // Try to extract snippet from the text content if available
            const title = chunk.web.title || 'Untitled';
            const link = chunk.web.uri;
            
            // Try to find relevant snippet from extracted text or use title
            const snippet = extractedText 
              ? extractedText.substring(0, 200).replace(/\n/g, ' ').trim()
              : title;
            
            searchResults.push({
              title,
              link,
              snippet: snippet || title,
            });
          }
        }
        
        if (searchResults.length > 0) {
          console.log('[googleSearch] Found search results in groundingMetadata:', searchResults.length);
          console.log('[googleSearch] Extracted text content length:', extractedText.length);
          
          // Store extracted text in first result for AI to use
          if (extractedText && searchResults[0]) {
            searchResults[0].snippet = extractedText.substring(0, 500) + (extractedText.length > 500 ? '...' : '');
          }
          
          return searchResults;
        }
      }
      
      // Fallback: Check functionResponse format
      for (const part of parts) {
        // Check for functionResponse with search results
        if (part.functionResponse?.response?.searchResults) {
          const searchResults = part.functionResponse.response.searchResults;
          console.log('[googleSearch] Found search results in functionResponse:', searchResults.length);
          return searchResults
            .map((result) => ({
              title: result.title || 'Untitled',
              link: result.url || '',
              snippet: result.snippet || extractedText.substring(0, 200) || '',
            }))
            .filter((item) => item.link);
        }
        
        // Check for functionCall format (when tool is called)
        if ((part as any).functionCall?.name === 'google_search') {
          console.log('[googleSearch] Function call detected, but results may be in next response');
        }
      }
    }

    // Check for alternative response structure with search results directly
    if ((data as any).searchResults) {
      const searchResults = (data as any).searchResults;
      console.log('[googleSearch] Found searchResults at root level:', searchResults.length);
      return searchResults
        .map((result: any) => ({
          title: result.title || result.name || 'Untitled',
          link: result.url || result.link || '',
          snippet: result.snippet || result.description || '',
        }))
        .filter((item: any) => item.link);
    }

    // Fallback to items format (Google Custom Search API format)
    const items = data.items || [];
    if (items.length > 0) {
      console.log('[googleSearch] Found items format:', items.length);
      return items
        .map((item) => ({
          title: item.title || 'Untitled',
          link: item.link || '',
          snippet: item.snippet || '',
        }))
        .filter((item) => item.link);
    }

    // If no results found, return empty array
    // This allows the main AI to still respond even without structured search results
    console.warn('[googleSearch] No structured search results found in response. Response may contain search results in text format.');
    return [];

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
