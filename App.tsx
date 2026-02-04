/// <reference types="vite/client" />
import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check, RefreshCw, Loader2, Home, Compass, Layers, User, Settings } from 'lucide-react';
import SearchAnimation, { SearchStep, SearchSource } from './components/SearchAnimation';

// --- SSE stream types (from backend) ---
type StreamChunk = { type: 'token'; text: string };
type StreamMeta = { type: 'meta'; webResults?: WebResult[]; lastUpdated?: string };
type StreamDone = { type: 'done'; usage?: { inputTokens: number; outputTokens: number } };
type StreamError = { error: true; code: string; message: string };
type StreamEvent = StreamChunk | StreamMeta | StreamDone | StreamError;

type WeatherData = {
  location: string;
  latitude: number;
  longitude: number;
  timezone: string;
  current: {
    time: string;
    temperatureC: number | null;
    apparentTemperatureC: number | null;
    humidityPercent: number | null;
    precipitationMm: number | null;
    windSpeedKph: number | null;
  };
};

type TimeData = {
  timezone: string;
  iso: string;
  date: string;
  time: string;
};

type WebResult = {
  title: string;
  link: string;
  snippet?: string;
};

// --- Types ---
interface Space {
  id: string;
  name: string;
  icon: string;
  description?: string;
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  image?: string;
  sources?: SearchSource[];
  weather?: WeatherData | null;
  time?: TimeData | null;
  webResults?: WebResult[];
  lastUpdated?: string;
}

interface ChatSession {
  id: string;
  spaceId: string;
  title: string;
  messages: ChatMessage[];
  lastUpdated: number;
}

// --- Utilities ---
const generateId = () => Math.random().toString(36).substr(2, 9);

const App: React.FC = () => {
  // Navigation State
  const [currentView, setCurrentView] = useState<'home' | 'chat' | 'spaces' | 'select-space' | 'history'>('home');
  const [activeSpace, setActiveSpace] = useState<Space | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isSpaceSidebarOpen, setIsSpaceSidebarOpen] = useState(true);
  
  // Spaces List with specialized configurations
  const [spacesList] = useState<Space[]>([
    { id: '0', name: 'Ask Anything', icon: '💬', description: 'Ask me anything - I respond perfectly to any query with accurate, helpful answers.' },
    { id: '1', name: 'Gen. AI Team', icon: '🧠', description: 'Expert systems for advanced logic and R&D.' },
    { id: '1-sub', name: 'Create Prompts', icon: '✍️', description: 'Specialized Prompt Engineering space.' },
    { id: '2', name: 'Creative Studio', icon: '🎨', description: 'Visual storytelling and asset generation.' },
    { id: '3', name: 'Personal Research', icon: '📚', description: 'Deep data synthesis and knowledge extraction.' },
    { id: '4', name: 'Contenaissance Branding', icon: '✨', description: 'Real-time viral content strategies.' },
    { id: '5', name: 'Content Writer Team', icon: '📝', description: 'SEO-optimized articles and copywriting.' }
  ]);

  // Persistent History State
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const saved = localStorage.getItem('contenaissance_sessions');
    return saved ? JSON.parse(saved) : [];
  });

  // Current Chat State
  const [inputValue, setInputValue] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isAutoScroll, setIsAutoScroll] = useState(true);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  
  // Search Animation State
  const [searchSteps, setSearchSteps] = useState<SearchStep[]>([]);
  const [searchSources, setSearchSources] = useState<SearchSource[]>([]);
  const [currentSearchQuery, setCurrentSearchQuery] = useState('');

  // Refs
  const chatEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastUserMessageRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem('contenaissance_sessions', JSON.stringify(sessions));
  }, [sessions]);

  // Scroll to bottom (smart)
  useEffect(() => {
    if (!isAutoScroll) return;
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isThinking, isAutoScroll]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setIsAutoScroll(atBottom);
  };

  const copyToClipboard = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 1500);
    } catch {
      // ignore
    }
  };

  // Update active session in history
  useEffect(() => {
    if (activeSessionId && chatHistory.length > 0) {
      setSessions(prev => {
        const index = prev.findIndex(s => s.id === activeSessionId);
        if (index === -1) return prev;
        
        const updated = [...prev];
        const firstUserMsg = chatHistory.find(m => m.role === 'user')?.text || 'New Chat';
        const title = firstUserMsg.length > 35 ? firstUserMsg.slice(0, 35) + '...' : firstUserMsg;

        updated[index] = {
          ...updated[index],
          messages: chatHistory,
          lastUpdated: Date.now(),
          title: title
        };
        return updated;
      });
    }
  }, [chatHistory, activeSessionId]);

  const activeSpaceSessions = useMemo(() => {
    if (!activeSpace) return [];
    return sessions
      .filter(s => s.spaceId === activeSpace.id)
      .sort((a, b) => b.lastUpdated - a.lastUpdated);
  }, [sessions, activeSpace]);

  const lastModelIndex = useMemo(
    () => [...chatHistory].map((m) => m.role).lastIndexOf('model'),
    [chatHistory]
  );

  // --- Handlers ---
  const handleOpenSpaces = () => setCurrentView('spaces');
  const handleOpenHistory = () => setCurrentView('history');
  const handleStartNewChatFlow = () => setCurrentView('select-space');
  
  const handleSpaceSelection = (space: Space) => {
    setActiveSpace(space);
    const latestForSpace = sessions
      .filter(s => s.spaceId === space.id)
      .sort((a, b) => b.lastUpdated - a.lastUpdated)[0];

    if (latestForSpace) {
      resumeSession(latestForSpace);
    } else {
      createNewSessionInSpace(space);
    }
  };

  const createNewSessionInSpace = (space: Space) => {
    const newSessionId = generateId();
    setActiveSpace(space);
    setActiveSessionId(newSessionId);
    setChatHistory([]);
    setSelectedImage(null);
    setInputValue('');
    
    setSessions(prev => [{
      id: newSessionId,
      spaceId: space.id,
      title: 'New Conversation',
      messages: [],
      lastUpdated: Date.now()
    }, ...prev]);

    setCurrentView('chat');
  };

  const resumeSession = (session: ChatSession) => {
    const space = spacesList.find(s => s.id === session.spaceId) || null;
    setActiveSpace(space);
    setActiveSessionId(session.id);
    setChatHistory(session.messages);
    setSelectedImage(null);
    setInputValue('');
    setCurrentView('chat');
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          setSelectedImage(e.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
    if (e.target) e.target.value = '';
  };

  const removeImage = () => {
    setSelectedImage(null);
  };

  // Generate search queries based on user message
  const generateSearchQueries = (message: string): string[] => {
    const baseQuery = message.slice(0, 60);
    return [
      `${baseQuery}`,
      `${baseQuery} latest 2026`,
      `${baseQuery} detailed information`,
    ].slice(0, 3);
  };

  // Simulate search animation steps
  const runSearchAnimation = async (query: string): Promise<SearchSource[]> => {
    setCurrentSearchQuery(query);
    setSearchSteps([]);
    setSearchSources([]);

    // Step 1: Retrieving
    const step1: SearchStep = {
      id: '1',
      text: `Retrieving information about "${query.slice(0, 40)}${query.length > 40 ? '...' : ''}"`,
      status: 'active',
    };
    setSearchSteps([step1]);
    await new Promise(r => setTimeout(r, 800));

    // Step 2: Searching
    const searchQueries = generateSearchQueries(query);
    const step2: SearchStep = {
      id: '2',
      text: 'Searching',
      status: 'active',
      queries: searchQueries,
    };
    setSearchSteps(prev => [
      { ...prev[0], status: 'complete' },
      step2
    ]);
    await new Promise(r => setTimeout(r, 1200));

    // Generate mock sources based on query
    const mockSources: SearchSource[] = [
      {
        id: '1',
        title: `Latest updates and information on ${query.slice(0, 30)}...`,
        url: 'https://example.com/article1',
        domain: 'timesofindia.indiatimes',
      },
      {
        id: '2', 
        title: `Top insights and analysis for ${query.slice(0, 25)}...`,
        url: 'https://example.com/article2',
        domain: 'economictimes.com',
      },
      {
        id: '3',
        title: `Expert guide: Everything about ${query.slice(0, 20)}...`,
        url: 'https://example.com/article3',
        domain: 'moneycontrol.com',
      },
      {
        id: '4',
        title: `${query.slice(0, 35)} - Complete Overview`,
        url: 'https://example.com/article4',
        domain: 'livemint.com',
      },
      {
        id: '5',
        title: `Breaking: New developments in ${query.slice(0, 25)}...`,
        url: 'https://example.com/article5',
        domain: 'hindustantimes.com',
      },
    ];

    // Step 3: Reviewing sources
    setSearchSteps(prev => [
      prev[0],
      { ...prev[1], status: 'complete' },
      { id: '3', text: `Reviewing ${mockSources.length} sources`, status: 'active' }
    ]);
    
    // Add sources with stagger
    for (let i = 0; i < mockSources.length; i++) {
      await new Promise(r => setTimeout(r, 150));
      setSearchSources(prev => [...prev, mockSources[i]]);
    }
    
    await new Promise(r => setTimeout(r, 600));

    // Step 4: Synthesizing
    setSearchSteps(prev => [
      prev[0],
      prev[1],
      { ...prev[2], status: 'complete' },
      { id: '4', text: 'Synthesizing answer...', status: 'active' }
    ]);
    await new Promise(r => setTimeout(r, 500));

    // Complete all steps
    setSearchSteps(prev => prev.map(s => ({ ...s, status: 'complete' as const })));
    
    return mockSources;
  };

  const fetchLiveWeather = async (query: string): Promise<WeatherData | null> => {
    try {
      const res = await fetch(`/api/weather?query=${encodeURIComponent(query)}`);
      if (!res.ok) return null;
      const body = await res.json();
      if (body?.available && body.data) return body.data as WeatherData;
      return null;
    } catch {
      return null;
    }
  };

  const fetchLiveTime = async (query: string): Promise<TimeData | null> => {
    try {
      const res = await fetch(`/api/time?query=${encodeURIComponent(query)}`);
      if (!res.ok) return null;
      const body = await res.json();
      if (body?.available && body.data) return body.data as TimeData;
      return null;
    } catch {
      return null;
    }
  };

  const MarkdownRenderer = ({ content }: { content: string }) => (
    <div className="prose prose-invert max-w-none prose-p:leading-relaxed prose-p:my-2 prose-table:my-4 prose-th:bg-[#1e1f20] prose-td:border-white/10 prose-th:border-white/10">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ inline, className, children, ...props }: any) {
          const match = /language-(\w+)/.exec(className || '');
          const code = String(children).replace(/\n$/, '');
          if (inline || !match) {
            return (
              <code className="px-1 py-0.5 rounded bg-white/10 text-[#e3e3e3]" {...props}>
                {children}
              </code>
            );
          }
          return (
            <div className="relative group">
              <button
                onClick={() => copyToClipboard(code, -1)}
                className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition text-xs px-2 py-1 rounded bg-white/10 text-white"
              >
                Copy
              </button>
              <SyntaxHighlighter style={oneDark} language={match[1]} PreTag="div">
                {code}
              </SyntaxHighlighter>
            </div>
          );
          },
          table({ children }: any) {
            return <table className="w-full border border-white/10">{children}</table>;
          },
          th({ children }: any) {
            return <th className="border border-white/10 px-3 py-2 text-left">{children}</th>;
          },
          td({ children }: any) {
            return <td className="border border-white/10 px-3 py-2">{children}</td>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );

  const sendPrompt = async (
    userMessage: string,
    options?: { replaceLastModel?: boolean; historyOverride?: { role: 'user' | 'model'; text: string }[] }
  ) => {
    const message = userMessage.trim();
    if (!message) return;
    if (!userMessage && !selectedImage) return;
    
    const currentImage = selectedImage;
    setInputValue('');
    setSelectedImage(null);

    if (!options?.replaceLastModel) {
      setChatHistory(prev => [...prev, { role: 'user', text: message, image: currentImage || undefined }]);
      lastUserMessageRef.current = message;
    }
    setIsThinking(true);
    if (currentView !== 'chat') setCurrentView('chat');

    // Run search animation
    await runSearchAnimation(message);
    const weather = await fetchLiveWeather(message);
    const time = await fetchLiveTime(message);

    const geminiStyle = `
RESPONSE STYLE - Be like Perplexity AI: Direct, accurate, and context-aware:
- Answer directly without unnecessary preambles or disclaimers
- Each question stands alone - don't carry over irrelevant context from previous messages
- Start with the answer immediately, not with apologies or explanations about capabilities
- Be concise for simple questions, detailed for complex ones
- Sound natural and conversational, but professional
- Only mention web search/sources when they're actually used and relevant
- Never apologize for using web search - it's a feature, not a limitation
- If a question is completely new, treat it as independent - don't reference previous conversation unless it's explicitly a follow-up

CRITICAL FORMATTING RULES:
- DO NOT use any markdown symbols in your response
- DO NOT use asterisks (*) or double asterisks (**) for emphasis
- DO NOT use hashtags (#, ##, ###) for headers
- DO NOT use pipes (|) for tables
- DO NOT use backticks for code
- Instead of markdown bullets, use simple dashes (-) or numbers (1. 2. 3.)
- Write in plain, clean text only
- For emphasis, just use CAPS sparingly or rephrase to make importance clear
- Present information in clear paragraphs and simple lists without special characters
`;

    let systemInstruction = `You are Anything AI, a helpful and intelligent assistant. ${geminiStyle}`;
    if (activeSpace?.id === '0') {
      systemInstruction = `You are Anything AI - a knowledgeable assistant that provides accurate, direct answers like Perplexity AI.

CRITICAL RESPONSE RULES:
1. **Extract and Present Information** - When web search results are provided, you MUST extract the actual information and present it. Do NOT give disclaimers or suggest users check sources themselves.
2. **Answer directly** - Get straight to the point. No unnecessary apologies, disclaimers, or preambles.
3. **Context awareness** - Each question is independent. Don't carry over context from previous questions unless it's explicitly a follow-up.
4. **Use search results actively** - When search results are provided, extract key information, facts, and details from them and include in your answer.

RESPONSE STRUCTURE FOR SEARCH RESULTS:
- Extract the actual information from the provided sources
- Structure your response clearly (sections, bullet points, numbered lists)
- Include specific details, facts, and data from the sources
- Cite sources naturally within the content (e.g., "According to [source]...")
- For trending topics: List actual trends with details, not general suggestions
- Be comprehensive - extract all relevant information from the sources

EXAMPLES:
User: "what's trending today" (with search results provided)
You: "Here are today's trending topics:
1. [Topic Name] - [specific details from sources]
2. [Topic Name] - [specific details from sources]
[Continue with actual information extracted from sources]"

User: "who is SRK"
You: "SRK refers to Shah Rukh Khan, a famous Indian actor known as the 'King of Bollywood'..."

NEVER say when search results are provided:
- "I cannot provide specific information"
- "Check these sources yourself"
- "I don't have access to real-time information"
- "I apologize for not having..."
- Any disclaimer that avoids answering the question

${geminiStyle}`;
    } else if (activeSpace?.id === '1-sub') {
      systemInstruction = `You are a Prompt Engineering specialist in Anything AI.

Your job is to transform the user's input into a powerful, detailed prompt they can use with any AI.

When a user describes what they need, create a MASTER PROMPT with this structure:

YOUR OPTIMIZED PROMPT:
[The refined, detailed prompt]

WHY THIS WORKS: [1-2 sentences on key improvements]

SUGGESTED SETTINGS: Temperature, etc. if relevant

${geminiStyle}`;
    } else if (activeSpace?.id === '4') {
      systemInstruction = `You are a Viral Content Strategist in Anything AI.

Your specialty is turning trends into scroll-stopping social posts that generate leads.

When given a topic:
1. Use Google Search to find the latest real-time data/trends
2. Create a punchy, insider-style post (2-3 sentences)
3. End with a compelling CTA

Tone: Insider knowledge, exclusive, high-energy but authentic.

${geminiStyle}`;
    } else if (activeSpace?.id === '5') {
      systemInstruction = `You are a Content Writer specialist in Anything AI.

You craft engaging written content that connects with readers.

Your approach:
- Structure: Clear headings, short paragraphs, easy to scan
- Tone: Adapt to what's needed (professional, witty, persuasive)
- SEO: Naturally weave in relevant keywords
- Impact: Every piece should inform, engage, or inspire action

${geminiStyle}`;
    }

    const history = options?.historyOverride ?? chatHistory.slice(0, -1).map((m) => ({ role: m.role, text: m.text }));
    const payload: {
      message: string;
      systemInstruction: string;
      history?: { role: 'user' | 'model'; text: string }[];
      imageBase64?: string;
      mimeType?: string;
    } = { message, systemInstruction, history };
    if (currentImage) {
      payload.imageBase64 = currentImage.split(',')[1];
      payload.mimeType = currentImage.split(';')[0].split(':')[1];
    }

    setSearchSteps([]);
    if (options?.replaceLastModel) {
      setChatHistory((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'model') {
          return [...prev.slice(0, -1), { ...last, text: '', sources: undefined, weather, time, webResults: undefined, lastUpdated: undefined }];
        }
        return [...prev, { role: 'model', text: '', sources: undefined, weather, time }];
      });
    } else {
      setChatHistory((prev) => [...prev, { role: 'model', text: '', sources: undefined, weather, time }]);
    }

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok || !res.body) {
        let errMessage = 'Request failed.';
        if (res.status === 429) errMessage = 'Too many requests. Please wait a moment.';
        else if (res.status === 502 || res.status === 503) errMessage = 'API server is not running. Start it with: npm run server';
        else {
          try {
            const body = await res.json().catch(() => null);
            if (body?.message) errMessage = body.message;
          } catch {
            // ignore
          }
        }
        throw new Error(errMessage);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      let streamError = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';
        for (const event of events) {
          const dataLine = event.split('\n').find((l) => l.startsWith('data: '));
          if (!dataLine) continue;
          try {
            const data = JSON.parse(dataLine.slice(6)) as StreamEvent;
            if ('error' in data && data.error) {
              setChatHistory((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === 'model') return [...prev.slice(0, -1), { ...last, text: (data as StreamError).message }];
                return prev;
              });
              streamError = true;
              break;
            }
            if ('type' in data) {
              if (data.type === 'meta') {
                const meta = data as StreamMeta;
                setChatHistory((prev) => {
                  const last = prev[prev.length - 1];
                  if (last?.role === 'model') {
                    return [
                      ...prev.slice(0, -1),
                      { ...last, webResults: meta.webResults, lastUpdated: meta.lastUpdated, sources: undefined },
                    ];
                  }
                  return prev;
                });
              }
              if (data.type === 'token') {
                fullText += (data as StreamChunk).text;
                setChatHistory((prev) => {
                  const last = prev[prev.length - 1];
                  if (last?.role === 'model') return [...prev.slice(0, -1), { ...last, text: fullText }];
                  return prev;
                });
              }
            }
          } catch {
            // skip malformed events
          }
        }
        if (streamError) break;
      }
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "I'm having trouble connecting right now. Please try again.";
      const hint = msg.includes('fetch') || msg.includes('Network') ? ' Make sure the API server is running: npm run server' : '';
      setChatHistory((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'model') return [...prev.slice(0, -1), { ...last, text: msg + hint }];
        return [...prev, { role: 'model', text: msg + hint }];
      });
    } finally {
      setIsThinking(false);
      setSearchSteps([]);
      setSearchSources([]);
      setCurrentSearchQuery('');
    }
  };

  const handleSendText = async (customValue?: string) => {
    const userMessage = (customValue || inputValue).trim();
    if (!userMessage && !selectedImage) return;
    await sendPrompt(userMessage);
  };

  const handleRegenerate = async () => {
    const lastUserMessage = lastUserMessageRef.current;
    if (!lastUserMessage) return;
    // Build history excluding the last user + model pair
    const lastUserIndex = [...chatHistory].map((m) => m.role).lastIndexOf('user');
    const historyOverride =
      lastUserIndex >= 0 ? chatHistory.slice(0, lastUserIndex).map((m) => ({ role: m.role, text: m.text })) : [];
    await sendPrompt(lastUserMessage, { replaceLastModel: true, historyOverride });
  };

  const deleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeSessionId === id) {
      const remainingForSpace = activeSpaceSessions.filter(s => s.id !== id);
      if (remainingForSpace.length > 0) {
        resumeSession(remainingForSpace[0]);
      } else {
        setActiveSessionId(null);
        setChatHistory([]);
        setCurrentView('home');
      }
    }
  };

  const SidebarItem = ({ icon, label, onClick, isActive }: { icon: React.ReactNode, label: string, onClick: () => void, isActive?: boolean }) => (
    <button 
      onClick={onClick}
      className={`group relative flex flex-col items-center justify-center w-14 h-14 rounded-2xl transition-all duration-300 mb-4 
        ${isActive ? 'bg-[#1e1f20] text-white shadow-lg' : 'text-[#8e918f] hover:bg-white/5 hover:text-white'}`}
      aria-label={label}
    >
      <div className="text-xl transition-transform duration-300 group-hover:scale-110">{icon}</div>
      <span className="absolute left-full ml-4 px-2 py-1 bg-[#282a2c] text-white text-[10px] font-bold uppercase tracking-widest rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-[100]">
        {label}
      </span>
      {isActive && <div className="absolute left-0 w-1 h-6 bg-[#4b90ff] rounded-r-full shadow-[0_0_10px_#4b90ff]"></div>}
    </button>
  );

  return (
    <div className="h-screen bg-[#0e0e0e] text-[#e3e3e3] font-['Inter'] flex overflow-hidden">

      {/* Primary Sidebar (desktop only) */}
      <aside className="hidden md:flex fixed left-0 top-0 h-screen w-20 bg-[#0e0e0e] border-r border-white/5 flex-col items-center py-6 z-[100]">
        <div className="mb-8 text-[#4b90ff] cursor-pointer hover:scale-110 transition-transform" onClick={() => setCurrentView('home')}>
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#4b90ff] to-[#ff5546] flex items-center justify-center text-[10px] font-bold text-white shadow-[0_0_20px_rgba(75,144,255,0.2)]">AI</div>
        </div>

        <SidebarItem icon={<Home size={18} />} label="Home" onClick={() => setCurrentView('home')} isActive={currentView === 'home'} />
        <SidebarItem icon={<Compass size={18} />} label="Discovery" onClick={handleOpenHistory} isActive={currentView === 'history'} />
        <SidebarItem icon={<Layers size={18} />} label="Spaces" onClick={handleOpenSpaces} isActive={currentView === 'spaces'} />

        <div className="mt-auto flex flex-col items-center">
          <SidebarItem icon={<User size={18} />} label="Profile" onClick={() => setCurrentView('home')} />
          <SidebarItem icon={<Settings size={18} />} label="Settings" onClick={() => setCurrentView('home')} />
        </div>
      </aside>

      {/* Content Wrapper (offset for fixed sidebar) */}
      <div className="flex flex-1 md:ml-20">
        {/* Space Sidebar */}
        {currentView === 'chat' && activeSpace && (
          <aside 
            className={`bg-[#0e0e0e] border-r border-white/5 transition-all duration-300 flex flex-col ${isSpaceSidebarOpen ? 'w-72' : 'w-0 opacity-0 overflow-hidden'}`}
          >
            <div className="p-6 border-b border-white/5 flex flex-col space-y-4 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className="text-xl">{activeSpace.icon}</span>
                  <span className="text-xs font-bold uppercase tracking-widest text-[#8e918f] truncate">{activeSpace.name}</span>
                </div>
                <button onClick={() => createNewSessionInSpace(activeSpace)} className="p-2 hover:bg-white/5 rounded-lg text-[#4b90ff]">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-1">
              <div className="px-3 py-2 text-[10px] font-bold text-[#444746] uppercase tracking-[0.2em]">Recent in Space</div>
              {activeSpaceSessions.map(session => (
                <button
                  key={session.id}
                  onClick={() => resumeSession(session)}
                  className={`w-full group px-4 py-3 rounded-xl text-left transition-all relative flex items-center justify-between
                    ${activeSessionId === session.id ? 'bg-[#1e1f20] text-white' : 'text-[#8e918f] hover:bg-white/5 hover:text-[#e3e3e3]'}`}
                >
                  <div className="flex flex-col truncate pr-4">
                    <span className="text-sm font-medium truncate">{session.title}</span>
                    <span className="text-[10px] opacity-40 mt-0.5">
                      {new Date(session.lastUpdated).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <div onClick={(e) => deleteSession(e, session.id)} className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-opacity">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </div>
                </button>
              ))}
            </div>
          </aside>
        )}

        {/* Main Container */}
        <main className="flex-1 flex flex-col relative overflow-hidden pb-16 md:pb-0">
        
        {/* Top Navigation */}
        <header className="h-16 flex items-center justify-between px-8 border-b border-white/5 bg-[#0e0e0e]/80 backdrop-blur-md z-50">
          <div className="flex items-center space-x-6">
            {currentView === 'chat' && (
              <button 
                onClick={() => setIsSpaceSidebarOpen(!isSpaceSidebarOpen)} 
                className="p-2 text-[#8e918f] hover:text-white transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12h18M3 6h18M3 18h18"/>
                </svg>
              </button>
            )}
            <div className="flex items-center space-x-2">
               <span className="text-sm font-bold uppercase tracking-[0.2em] text-[#8e918f]">
                {activeSpace ? activeSpace.name : 'Anything AI Workspace'}
              </span>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto no-scrollbar p-6 pt-10">
          <div className="max-w-4xl mx-auto w-full">
            
            {currentView === 'home' && (
              <div className="animate-in fade-in duration-700 py-12">
                <h1 className="text-6xl font-bold tracking-tight mb-4 bg-gradient-to-r from-[#4b90ff] via-white to-[#ff5546] bg-clip-text text-transparent">
                  Hey, I'm Anything AI.
                </h1>
                <p className="text-3xl font-medium text-[#444746] mb-12">Choose a specialized space to begin.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {spacesList.map(space => (
                    <button key={space.id} onClick={() => handleSpaceSelection(space)} className="p-8 bg-[#1e1f20] hover:bg-[#282a2c] border border-white/5 rounded-[2rem] text-left transition-all group relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[#4b90ff]/5 to-transparent rounded-full -mr-10 -mt-10 blur-3xl group-hover:opacity-100 opacity-0 transition-opacity"></div>
                      <div className="text-3xl mb-4">{space.icon}</div>
                      <h3 className="text-xl font-bold text-white group-hover:text-[#4b90ff]">{space.name}</h3>
                      <p className="text-[10px] text-[#8e918f] mt-1 font-bold uppercase tracking-widest">{space.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {currentView === 'chat' && (
              <div className="animate-in fade-in duration-500 pb-40">
                {chatHistory.length === 0 && !isThinking ? (
                  <div className="text-center py-24">
                    <div className="text-5xl mb-6 inline-block p-6 rounded-3xl bg-[#1e1f20] border border-white/5 animate-pulse">
                      {activeSpace?.icon}
                    </div>
                    <h2 className="text-3xl font-bold mb-3 tracking-tight">{activeSpace?.name}</h2>
                    <p className="text-[#8e918f] max-w-sm mx-auto">{activeSpace?.description}</p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {chatHistory.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}
                      >
                        <div className={`group max-w-[85%] flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                          <div className="flex items-center space-x-3">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold ${msg.role === 'user' ? 'bg-[#3d3d3d]' : 'bg-gradient-to-tr from-[#4b90ff] to-[#ff5546]'}`}>
                              {msg.role === 'user' ? 'YOU' : 'AI'}
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#8e918f]">{msg.role === 'user' ? 'You' : 'Anything AI'}</span>
                          </div>

                          <div className={`${msg.role === 'user' ? 'bg-[#4b90ff] text-black' : 'bg-[#1e1f20] text-[#e3e3e3]'} rounded-2xl p-4 border border-white/5 shadow-lg w-full relative`}>
                            {msg.image && (
                              <div className="max-w-sm rounded-xl overflow-hidden border border-white/10 mb-2">
                                <img src={msg.image} alt="User Upload" className="w-full h-auto" />
                              </div>
                            )}

                            {msg.role === 'model' && msg.time && (
                              <div className="p-4 rounded-2xl border border-[#4b90ff]/30 bg-[#141516] mb-3">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-[#4b90ff] mb-2">
                                  Live Date & Time
                                </p>
                                <div className="text-sm text-[#e3e3e3] space-y-1">
                                  <div>{msg.time.date}</div>
                                  <div>{msg.time.time}</div>
                                  <div className="text-[#8e918f] text-xs">{msg.time.timezone}</div>
                                </div>
                              </div>
                            )}

                            {msg.role === 'model' && msg.weather && (
                              <div className="p-4 rounded-2xl border border-[#4b90ff]/30 bg-[#141516] mb-3">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-[#4b90ff] mb-2">
                                  Live Weather
                                </p>
                                <div className="text-sm text-[#e3e3e3] space-y-1">
                                  <div>{msg.weather.location}</div>
                                  <div className="text-[#8e918f] text-xs">{msg.weather.current.time} ({msg.weather.timezone})</div>
                                  {msg.weather.current.temperatureC != null && (
                                    <div>Temperature: {msg.weather.current.temperatureC}°C</div>
                                  )}
                                  {msg.weather.current.apparentTemperatureC != null && (
                                    <div>Feels like: {msg.weather.current.apparentTemperatureC}°C</div>
                                  )}
                                  {msg.weather.current.humidityPercent != null && (
                                    <div>Humidity: {msg.weather.current.humidityPercent}%</div>
                                  )}
                                  {msg.weather.current.precipitationMm != null && (
                                    <div>Precipitation: {msg.weather.current.precipitationMm} mm</div>
                                  )}
                                  {msg.weather.current.windSpeedKph != null && (
                                    <div>Wind: {msg.weather.current.windSpeedKph} km/h</div>
                                  )}
                                </div>
                              </div>
                            )}

                            {msg.role === 'model' && msg.webResults && msg.webResults.length > 0 && (
                              <div className="p-4 rounded-2xl border border-[#4b90ff]/30 bg-[#141516] mb-3">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-[#4b90ff] mb-2">
                                  Live Web Results
                                </p>
                                {msg.lastUpdated && (
                                  <p className="text-[10px] text-[#8e918f] mb-2">
                                    Last updated: {msg.lastUpdated}
                                  </p>
                                )}
                                <div className="space-y-2">
                                  {msg.webResults.map((r, i) => {
                                    const content = (
                                      <>
                                        <div className="text-sm text-white">{r.title}</div>
                                        {r.snippet && <div className="text-xs text-[#8e918f] mt-1">{r.snippet}</div>}
                                        {r.link && <div className="text-[10px] text-[#4b90ff] mt-1 truncate">{r.link}</div>}
                                      </>
                                    );
                                    return r.link ? (
                                      <a
                                        key={`${r.link}-${i}`}
                                        href={r.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block p-2 rounded-lg border border-white/10 hover:border-[#4b90ff]/40 transition"
                                      >
                                        {content}
                                      </a>
                                    ) : (
                                      <div
                                        key={`no-link-${i}`}
                                        className="block p-2 rounded-lg border border-white/10"
                                      >
                                        {content}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Source Cards for AI responses */}
                            {msg.role === 'model' && msg.webResults && msg.webResults.length > 0 && (
                              <div className="mb-4">
                                <p className="text-xs font-medium text-[#4b90ff] uppercase tracking-wider mb-3 flex items-center gap-2">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                    <polyline points="14 2 14 8 20 8"/>
                                  </svg>
                                  Sources ({msg.webResults.length})
                                </p>
                                <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                                  {msg.webResults.map((source, i) => {
                                    const domain = source.link ? new URL(source.link).hostname.replace('www.', '') : 'source';
                                    return (
                                    <a
                                      key={`${source.link}-${i}`}
                                      href={source.link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="group flex items-start gap-3 p-3 bg-[#1e1f20] border border-white/5 rounded-xl hover:border-[#4b90ff]/30 transition-all cursor-pointer min-w-[240px] max-w-[280px]"
                                    >
                                      <div className="w-6 h-6 rounded-lg bg-[#282a2c] flex items-center justify-center overflow-hidden shrink-0">
                                        <img 
                                        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
                                          alt="" 
                                          className="w-4 h-4"
                                        />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-[10px] text-[#4b90ff] mb-0.5 truncate">{domain}</p>
                                        <p className="text-xs text-[#8e918f] line-clamp-2 group-hover:text-white transition-colors">
                                          {source.title}
                                        </p>
                                      </div>
                                    </a>
                                  );
                                  })}
                                </div>
                              </div>
                            )}

                            <div className={`${msg.role === 'user' ? 'text-black' : 'text-[#e3e3e3]'}`}>
                              {msg.role === 'model' ? (
                                <MarkdownRenderer content={msg.text} />
                              ) : (
                                <div className="whitespace-pre-wrap text-lg leading-relaxed">{msg.text}</div>
                              )}
                            </div>

                            {msg.role === 'model' && (
                              <div className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition flex gap-2">
                                <button
                                  onClick={() => copyToClipboard(msg.text, idx)}
                                  className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20"
                                >
                                  {copiedIndex === idx ? <Check size={14} /> : <Copy size={14} />}
                                </button>
                              </div>
                            )}
                          </div>

                          {msg.role === 'model' && idx === lastModelIndex && (
                            <button
                              onClick={handleRegenerate}
                              className="text-xs text-[#8e918f] hover:text-white transition flex items-center gap-2"
                            >
                              <RefreshCw size={12} />
                              Regenerate response
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    
                    {/* Search Animation */}
                    {isThinking && searchSteps.length > 0 && (
                      <SearchAnimation
                        isSearching={isThinking}
                        steps={searchSteps}
                        sources={searchSources}
                        query={currentSearchQuery}
                      />
                    )}

                    {/* Typing Indicator */}
                    {isThinking && (
                      <div className="flex items-center gap-2 text-xs text-[#8e918f]">
                        <div className="flex gap-1">
                          <span className="w-2 h-2 bg-[#4b90ff] rounded-full animate-pulse"></span>
                          <span className="w-2 h-2 bg-[#4b90ff] rounded-full animate-pulse [animation-delay:150ms]"></span>
                          <span className="w-2 h-2 bg-[#4b90ff] rounded-full animate-pulse [animation-delay:300ms]"></span>
                        </div>
                        AI is thinking...
                      </div>
                    )}
                    
                    <div ref={chatEndRef} />
                  </div>
                )}
              </div>
            )}

            {currentView === 'spaces' && (
              <div className="animate-in fade-in slide-in-from-bottom-6 duration-700 mt-8">
                <h2 className="text-4xl font-bold mb-10 text-white tracking-tight">Choose Your Space</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {spacesList.map(space => (
                    <button 
                      key={space.id} 
                      onClick={() => handleSpaceSelection(space)}
                      className={`p-10 bg-[#1e1f20] border border-white/5 rounded-[3rem] text-left transition-all duration-300 group hover:border-[#4b90ff]/50 
                        ${activeSpace?.id === space.id ? 'border-[#4b90ff] shadow-[0_0_40px_rgba(75,144,255,0.1)]' : ''}`}
                    >
                      <div className="w-16 h-16 bg-[#0e0e0e] rounded-3xl flex items-center justify-center mb-6 text-3xl group-hover:scale-110 transition-transform">{space.icon}</div>
                      <h3 className="text-2xl font-bold text-white group-hover:text-[#4b90ff] transition-colors">{space.name}</h3>
                      <p className="text-[10px] text-[#8e918f] font-bold uppercase tracking-[0.2em] mt-3">{space.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {currentView === 'select-space' && (
              <div className="animate-in fade-in zoom-in-95 duration-500 flex flex-col items-center justify-center min-h-[60vh] text-center">
                <h2 className="text-4xl font-bold mb-4 text-white">Start a New Chat</h2>
                <p className="text-[#8e918f] mb-12 max-w-sm">Choose a space for your conversation.</p>
                <div className="w-full max-w-md space-y-3">
                  {spacesList.map(space => (
                    <button 
                      key={space.id} 
                      onClick={() => createNewSessionInSpace(space)}
                      className="w-full p-7 bg-[#1e1f20] hover:bg-[#282a2c] border border-white/5 rounded-3xl flex items-center justify-between transition-all group"
                    >
                      <div className="flex items-center space-x-5">
                        <span className="text-2xl">{space.icon}</span>
                        <div className="text-left">
                          <span className="text-lg font-bold text-white/80 group-hover:text-white block">{space.name}</span>
                          <span className="text-[10px] text-[#8e918f] uppercase tracking-widest">{space.description}</span>
                        </div>
                      </div>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-[#4b90ff] opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                      </svg>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Input Bar */}
        {(currentView === 'chat' || currentView === 'home') && (
          <div className="p-8 bg-gradient-to-t from-[#0e0e0e] via-[#0e0e0e] to-transparent z-40">
            <div className="max-w-3xl mx-auto w-full">
              {selectedImage && (
                <div className="mb-4 inline-flex relative group">
                  <div className="absolute -top-2 -right-2 w-6 h-6 bg-[#1e1f20] rounded-full border border-white/10 flex items-center justify-center cursor-pointer hover:bg-red-500/20 hover:text-red-500 transition-colors z-10" onClick={removeImage}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </div>
                  <img src={selectedImage} alt="Preview" className="h-24 w-auto rounded-xl border border-white/10 shadow-lg" />
                </div>
              )}
              
              <div className="relative flex items-center bg-[#1e1f20] rounded-[2rem] border border-white/5 focus-within:border-white/20 transition-all p-2 pr-5 pl-7 shadow-2xl">
                <textarea 
                  rows={1} value={inputValue} onKeyDown={handleKeyPress} onChange={(e) => setInputValue(e.target.value)}
                  placeholder={activeSpace ? `Message ${activeSpace.name}...` : "Choose a space to start..."}
                  disabled={!activeSpace && currentView === 'chat'}
                  className="flex-1 bg-transparent border-none outline-none py-4 text-lg text-white placeholder-[#444746] resize-none overflow-hidden disabled:opacity-50"
                />
                <input 
                  type="file" 
                  ref={fileInputRef}
                  className="hidden" 
                  accept="image/*"
                  onChange={handleFileSelect}
                />
                <div className="flex items-center space-x-4 ml-3">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className={`p-2.5 transition-colors bg-white/5 rounded-xl border border-white/5 ${selectedImage ? 'text-[#4b90ff] border-[#4b90ff]/30 bg-[#4b90ff]/10' : 'text-[#8e918f] hover:text-white'}`}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h7"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L12 18"/></svg>
                  </button>
                  {(inputValue.trim() || selectedImage) && (
                    <button
                      onClick={() => handleSendText()}
                      disabled={isThinking}
                      className={`p-3 rounded-2xl transition-all shadow-[0_0_30px_rgba(255,255,255,0.15)] ${isThinking ? 'bg-white/50 text-black/60 cursor-not-allowed' : 'bg-white text-black hover:scale-105 active:scale-95'}`}
                    >
                      {isThinking ? <Loader2 className="animate-spin" size={20} /> : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-[#0e0e0e] border-t border-white/5 flex items-center justify-around z-[100]">
        <button onClick={() => setCurrentView('home')} className="flex flex-col items-center text-[#8e918f]">
          <Home size={18} />
          <span className="text-[10px] mt-1">Home</span>
        </button>
        <button onClick={handleOpenHistory} className="flex flex-col items-center text-[#8e918f]">
          <Compass size={18} />
          <span className="text-[10px] mt-1">Discovery</span>
        </button>
        <button onClick={handleOpenSpaces} className="flex flex-col items-center text-[#8e918f]">
          <Layers size={18} />
          <span className="text-[10px] mt-1">Spaces</span>
        </button>
        <button onClick={() => setCurrentView('home')} className="flex flex-col items-center text-[#8e918f]">
          <User size={18} />
          <span className="text-[10px] mt-1">Profile</span>
        </button>
        <button onClick={() => setCurrentView('home')} className="flex flex-col items-center text-[#8e918f]">
          <Settings size={18} />
          <span className="text-[10px] mt-1">Settings</span>
        </button>
      </nav>

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .animate-in { animation: fadeIn 0.4s ease-out forwards; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
};

export default App;
