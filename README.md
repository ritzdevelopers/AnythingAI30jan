<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1rSwdrVKNHmjmZkJ3LoN-DTjSwMdOqBPR

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. In [.env.local](.env.local) set your Gemini API key:
   - `VITE_GEMINI_API_KEY=your_key` (or `GEMINI_API_KEY=your_key`)
   - Optional: `GEMINI_MODEL=gemini-1.5-flash` (default) or `gemini-2.5-flash`, `gemini-1.5-pro`, etc.
   - Web search (Google Custom Search JSON API):
     - `GOOGLE_SEARCH_API_KEY=your_key`
     - `GOOGLE_SEARCH_ENGINE_ID=your_cx`
3. Run both the API server and the app:
   - **Option A:** `npm run dev:all` (starts both)
   - **Option B:** Terminal 1: `npm run server` | Terminal 2: `npm run dev`
4. Open http://localhost:3000
