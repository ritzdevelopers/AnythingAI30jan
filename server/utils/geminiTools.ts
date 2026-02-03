/**
 * Gemini tool declarations for function calling.
 */

import { Type } from '@google/genai';

export const googleSearchTool = {
  name: 'google_search',
  description: 'Search the web for realtime information.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: 'Search query' },
    },
    required: ['query'],
  },
};
