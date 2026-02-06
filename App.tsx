/// <reference types="vite/client" />
import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check, RefreshCw, Loader2, Home, History, Layers, User, Settings, LogOut } from 'lucide-react';
import { motion } from 'framer-motion';
import SearchAnimation, { SearchStep, SearchSource } from './components/SearchAnimation';

// --- SSE stream types (from backend) ---
type StreamChunk = { type: 'token'; text: string };
type StreamMeta = { type: 'meta'; webResults?: WebResult[]; lastUpdated?: string };
type StreamDone = { type: 'done'; usage?: { inputTokens: number; outputTokens: number } };
type StreamConversation = { type: 'conversation'; conversationId: string; title?: string };
type StreamError = { error: true; code: string; message: string };
type StreamEvent = StreamChunk | StreamMeta | StreamDone | StreamConversation | StreamError;

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

// --- Auth & API types ---
const AUTH_TOKEN_KEY = 'anything_ai_token';
const AUTH_USER_KEY = 'anything_ai_user';

interface AuthUser {
  id: string;
  email: string;
  departmentId: string;
  departmentName: string | null;
}

interface ApiDepartment {
  id: string;
  name: string;
  icon?: string;
  description?: string;
}

interface ApiConversation {
  id: string;
  title: string;
  updatedAt: string;
  departmentId?: string;
  pinned?: boolean;
}

interface ApiMessage {
  role: 'user' | 'model';
  text: string;
  createdAt?: string;
}

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
  sourceCount?: number; // Number of sources reviewed
}

interface ChatSession {
  id: string;
  spaceId: string;
  title: string;
  messages: ChatMessage[];
  lastUpdated: number;
}

// --- API base: empty locally (Vite proxy), set to Render URL in production (Vercel) ---
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

// Default spaces shown on landing (before login); seed these via npm run seed:departments
const DEFAULT_SPACES: Space[] = [
  { id: '0', name: 'Ask Anything', icon: '💬', description: 'Ask me anything - I respond perfectly to any query with accurate, helpful answers.' },
  { id: '1', name: 'Gen. AI Team', icon: '🧠', description: 'Expert systems for advanced logic and R&D.' },
  { id: '1-sub', name: 'Create Prompts', icon: '✍️', description: 'Specialized Prompt Engineering space.' },
  { id: '2', name: 'Creative Studio', icon: '🎨', description: 'Visual storytelling and asset generation.' },
  { id: '3', name: 'Personal Research', icon: '📚', description: 'Deep data synthesis and knowledge extraction.' },
  { id: '4', name: 'Contenaissance Branding', icon: '✨', description: 'Real-time viral content strategies.' },
  { id: '5', name: 'Content Writer Team', icon: '📝', description: 'SEO-optimized articles and copywriting.' },
];

// --- Animated title (character-by-character, GPT-style) ---
const AnimatedTitle = ({ text, className = '' }: { text: string; className?: string }) => {
  const chars = text.split('');
  return (
    <span className={`inline-block truncate ${className}`}>
      {chars.map((char, i) => (
        <motion.span
          key={`${i}-${char}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15, delay: i * 0.03 }}
          className="inline-block"
        >
          {char}
        </motion.span>
      ))}
    </span>
  );
};

// --- Utilities ---
const generateId = () => Math.random().toString(36).substr(2, 9);

/**
 * Extract clean domain name from URL, handling Vertex AI Search proxy URLs
 */
const extractDomainFromUrl = (url: string): { domain: string; cleanUrl: string } => {
  let domain = 'source';
  let cleanUrl = url;
  
  try {
    const urlObj = new URL(url);
    
    // Handle Vertex AI Search proxy URLs
    if (urlObj.hostname.includes('vertexaisearch')) {
      const originalUrl = urlObj.searchParams.get('url');
      if (originalUrl) {
        cleanUrl = decodeURIComponent(originalUrl);
        try {
          const originalUrlObj = new URL(cleanUrl);
          domain = originalUrlObj.hostname.replace('www.', '');
        } catch {
          domain = 'source';
        }
      } else {
        domain = 'source';
      }
    } else {
      domain = urlObj.hostname.replace('www.', '');
    }
  } catch {
    // Fallback: try to extract from query params
    const match = url.match(/[?&]url=([^&]+)/);
    if (match) {
      try {
        const decoded = decodeURIComponent(match[1]);
        cleanUrl = decoded;
        domain = new URL(decoded).hostname.replace('www.', '');
      } catch {
        domain = 'source';
      }
    }
  }
  
  return { domain, cleanUrl };
};

const App = () => {
  // Auth state (global)
  const [auth, setAuth] = useState<{
    token: string | null;
    user: AuthUser | null;
    isAuthenticated: boolean;
  }>(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    const userJson = localStorage.getItem(AUTH_USER_KEY);
    const user = userJson ? (JSON.parse(userJson) as AuthUser) : null;
    return { token, user, isAuthenticated: !!token && !!user };
  });

  // Department state: active department, access codes for cross-department
  const [activeDepartmentId, setActiveDepartmentId] = useState<string | null>(null);
  const [accessCodeMap, setAccessCodeMap] = useState<Record<string, string>>({});
  const [departmentAccessError, setDepartmentAccessError] = useState<string | null>(null);

  // Chat state: backend conversation id, conversations list for sidebar
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [conversationsList, setConversationsList] = useState<ApiConversation[]>([]);
  const [conversationsRefreshTrigger, setConversationsRefreshTrigger] = useState(0);
  const [allConversationsList, setAllConversationsList] = useState<ApiConversation[]>([]);
  const [pendingConversationTitle, setPendingConversationTitle] = useState<string | null>(null);
  const [conversationMenuOpen, setConversationMenuOpen] = useState<string | null>(null);
  const [renameModalConv, setRenameModalConv] = useState<ApiConversation | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const conversationMenuRef = useRef<HTMLDivElement | null>(null);

  // Modals
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [accessCodeModalDept, setAccessCodeModalDept] = useState<Space | null>(null);
  const [accessCodeInput, setAccessCodeInput] = useState(['', '', '', '']);
  const [accessCodeChecking, setAccessCodeChecking] = useState(false);

  // Auth form state (for modal)
  const [authIsRegister, setAuthIsRegister] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authDepartmentName, setAuthDepartmentName] = useState('');
  const [authDepartmentsForDropdown, setAuthDepartmentsForDropdown] = useState<ApiDepartment[]>([]);
  const [authLoading, setAuthLoading] = useState(false);
  const [authSuccessLoading, setAuthSuccessLoading] = useState(false); // 2s loader after sign in/register
  const [authError, setAuthError] = useState('');

  // Navigation State
  const [currentView, setCurrentView] = useState<'home' | 'chat' | 'spaces' | 'select-space' | 'history' | 'profile'>('home');
  const [activeSpace, setActiveSpace] = useState<Space | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isSpaceSidebarOpen, setIsSpaceSidebarOpen] = useState(true);

  // Spaces list: from API when authenticated, default spaces on landing when not
  const [departmentsList, setDepartmentsList] = useState<Space[]>([]);
  const spacesList = auth.isAuthenticated ? departmentsList : DEFAULT_SPACES;

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
  const pendingTitleRef = useRef<string | null>(null);

  // Close conversation dropdown when clicking outside
  useEffect(() => {
    if (!conversationMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (conversationMenuRef.current && !conversationMenuRef.current.contains(e.target as Node)) {
        setConversationMenuOpen(null);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [conversationMenuOpen]);

  // Show auth modal after a short delay when not authenticated (so user sees Anything AI page first)
  useEffect(() => {
    if (!auth.isAuthenticated) {
      setAuthSuccessLoading(false);
      const t = setTimeout(() => setAuthModalOpen(true), 1200);
      return () => clearTimeout(t);
    } else {
      setAuthModalOpen(false);
    }
  }, [auth.isAuthenticated]);

  // Fetch departments for register dropdown when auth modal is open
  useEffect(() => {
    if (!authModalOpen) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/departments`);
        if (!res.ok) return;
        const data = await res.json();
        setAuthDepartmentsForDropdown((data.departments as ApiDepartment[]) ?? []);
      } catch {
        // ignore
      }
    })();
  }, [authModalOpen]);

  // Fetch departments when authenticated
  useEffect(() => {
    if (!auth.isAuthenticated || !auth.token) return;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/departments`, { signal: controller.signal });
        if (!res.ok) return;
        const data = await res.json();
        const list = (data.departments as ApiDepartment[]).map((d) => ({
          id: d.id,
          name: d.name,
          icon: d.icon ?? '💬',
          description: d.description ?? '',
        }));
        setDepartmentsList(list);
      } catch {
        // ignore
      }
    })();
    return () => controller.abort();
  }, [auth.isAuthenticated, auth.token]);

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

  // Fetch conversations when entering a department (authenticated)
  useEffect(() => {
    if (!activeSpace || !auth.token) {
      setConversationsList([]);
      setDepartmentAccessError(null);
      return;
    }
    setDepartmentAccessError(null);
    const controller = new AbortController();
    const params = new URLSearchParams({ departmentId: activeSpace.id });
    const code = accessCodeMap[activeSpace.id];
    if (code) params.set('accessCode', code);
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/conversations?${params}`, {
          headers: { Authorization: `Bearer ${auth.token}` },
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 403 && activeSpace) {
            setDepartmentAccessError((data.message as string) || 'Invalid access code.');
            setConversationsList([]);
            setAccessCodeMap((prev) => {
              const next = { ...prev };
              delete next[activeSpace.id];
              return next;
            });
            setAccessCodeModalDept(activeSpace);
            setAccessCodeInput(['', '', '', '']);
          } else {
            setDepartmentAccessError(null);
            setConversationsList([]);
          }
          return;
        }
        setDepartmentAccessError(null);
        setConversationsList((data.conversations as ApiConversation[]) ?? []);
      } catch {
        setConversationsList([]);
      }
    })();
    return () => controller.abort();
  }, [activeSpace?.id, auth.token, accessCodeMap, conversationsRefreshTrigger]);

  // History loading state
  const [historyLoading, setHistoryLoading] = useState(false);

  // Fetch all conversations when opening History view
  useEffect(() => {
    if (currentView !== 'history' || !auth.token) {
      if (currentView !== 'history') setHistoryLoading(false);
      return;
    }
    setHistoryLoading(true);
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/conversations/all`, {
          headers: { Authorization: `Bearer ${auth.token}` },
        });
        if (!res.ok) {
          setAllConversationsList([]);
          return;
        }
        const data = await res.json();
        const list = (data.conversations as ApiConversation[]) ?? [];
        setAllConversationsList(list);
      } catch {
        setAllConversationsList([]);
      } finally {
        setHistoryLoading(false);
      }
    })();
  }, [currentView, auth.token, conversationsRefreshTrigger]);

  const lastModelIndex = useMemo(
    () => [...chatHistory].map((m) => m.role).lastIndexOf('model'),
    [chatHistory]
  );

  // --- Handlers ---
  const handleOpenSpaces = () => setCurrentView('spaces');
  const handleOpenHistory = () => setCurrentView('history');
  const handleStartNewChatFlow = () => setCurrentView('select-space');
  
  const openDepartment = (space: Space) => {
    setActiveSpace(space);
    setActiveConversationId(null);
    setChatHistory([]);
    setSelectedImage(null);
    setInputValue('');
    setCurrentView('chat');
  };

  const handleSpaceSelection = (space: Space) => {
    if (!auth.isAuthenticated) {
      setAuthSuccessLoading(false);
      setAuthModalOpen(true);
      return;
    }
    const userDeptId = auth.user?.departmentId;
    if (userDeptId != null && space.id != null && String(space.id) === String(userDeptId)) {
      openDepartment(space);
      return;
    }
    setDepartmentAccessError(null);
    setAccessCodeModalDept(space);
  };

  const loadConversation = async (convId: string) => {
    if (!auth.token) return;
    setConversationMenuOpen(null);
    try {
      const res = await fetch(`${API_BASE}/api/conversations/${convId}/messages`, {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const messages = (data.messages as ApiMessage[]) ?? [];
      setChatHistory(
        messages.map((m) => ({
          role: m.role,
          text: m.text,
          sources: undefined,
          weather: null,
          time: null,
          webResults: undefined,
          lastUpdated: undefined,
          sourceCount: undefined,
        }))
      );
      setActiveConversationId(convId);
      setSelectedImage(null);
      setInputValue('');
      setCurrentView('chat');
    } catch {
      // ignore
    }
  };

  const handleRenameConversation = (conv: ApiConversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setConversationMenuOpen(null);
    setRenameModalConv(conv);
    setRenameInput(conv.title || 'New Conversation');
  };

  const handleRenameSubmit = async () => {
    if (!renameModalConv || !auth.token) return;
    const title = renameInput.trim().slice(0, 80) || 'New Conversation';
    try {
      const res = await fetch(`${API_BASE}/api/conversations/${renameModalConv.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) return;
      setConversationsList((prev) => prev.map((c) => (c.id === renameModalConv.id ? { ...c, title } : c)));
      setRenameModalConv(null);
      setRenameInput('');
    } catch {
      // ignore
    }
  };

  const handleDeleteConversation = async (conv: ApiConversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setConversationMenuOpen(null);
    if (!window.confirm('Delete this conversation? This cannot be undone.')) return;
    if (!auth.token) return;
    try {
      const res = await fetch(`${API_BASE}/api/conversations/${conv.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${auth.token}` } });
      if (!res.ok) return;
      setConversationsList((prev) => prev.filter((c) => c.id !== conv.id));
      if (activeConversationId === conv.id) {
        setActiveConversationId(null);
        setChatHistory([]);
      }
    } catch {
      // ignore
    }
  };

  const handlePinConversation = async (conv: ApiConversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setConversationMenuOpen(null);
    if (!auth.token) return;
    const nextPinned = !conv.pinned;
    try {
      const res = await fetch(`${API_BASE}/api/conversations/${conv.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ pinned: nextPinned }),
      });
      if (!res.ok) return;
      setConversationsList((prev) => prev.map((c) => (c.id === conv.id ? { ...c, pinned: nextPinned } : c)).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
    } catch {
      // ignore
    }
  };

  const openConversationFromHistory = (conv: ApiConversation) => {
    const deptId = conv.departmentId;
    const space = spacesList.find((s) => s.id === deptId) ?? null;
    if (space) setActiveSpace(space);
    loadConversation(conv.id);
  };

  const createNewSessionInSpace = (space: Space) => {
    setActiveSpace(space);
    setActiveConversationId(null);
    setActiveSessionId(generateId());
    setChatHistory([]);
    setSelectedImage(null);
    setInputValue('');
    setCurrentView('chat');
    setSessions(prev => [{
      id: generateId(),
      spaceId: space.id,
      title: 'New Conversation',
      messages: [],
      lastUpdated: Date.now()
    }, ...prev]);
  };

  const resumeSession = (session: ChatSession) => {
    const space = spacesList.find(s => s.id === session.spaceId) || null;
    setActiveSpace(space);
    setActiveSessionId(session.id);
    setActiveConversationId(null);
    setChatHistory(session.messages);
    setSelectedImage(null);
    setInputValue('');
    setCurrentView('chat');
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // Will be handled by sendPrompt function defined below
      const userMessage = inputValue.trim();
      if (userMessage || selectedImage) {
        // Trigger send via the send button click
        setTimeout(() => {
          const sendBtn = document.querySelector('button[type="button"]:not([disabled])') as HTMLButtonElement;
          if (sendBtn && (inputValue.trim() || selectedImage)) {
            sendBtn.click();
          }
        }, 0);
      }
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

  // Initialize search animation - sources will be added in real-time from backend
  const runSearchAnimation = async (query: string): Promise<void> => {
    setCurrentSearchQuery(query);
    setSearchSteps([]);
    setSearchSources([]);

    // Step 1: Retrieving (Perplexity style)
    const step1: SearchStep = {
      id: '1',
      text: `Retrieving latest information about "${query.slice(0, 40)}${query.length > 40 ? '...' : ''}"`,
      status: 'active',
    };
    setSearchSteps([step1]);
    await new Promise(r => setTimeout(r, 600));

    // Step 2: Searching (Perplexity style with query pills)
    const searchQueries = generateSearchQueries(query);
    // Generate more specific queries for better results
    const enhancedQueries = [
      query,
      ...searchQueries.slice(1),
      `${query} ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
      `${query} latest updates`
    ].slice(0, 4);
    
    const step2: SearchStep = {
      id: '2',
      text: 'Searching',
      status: 'active',
      queries: enhancedQueries,
    };
    setSearchSteps(prev => [
      { ...prev[0], status: 'complete' },
      step2
    ]);
    await new Promise(r => setTimeout(r, 800));
    
    // Step 3: Reviewing sources (will be updated when sources arrive)
    setSearchSteps(prev => [
      prev[0],
      { ...prev[1], status: 'active' },
      { id: '3', text: 'Reviewing sources...', status: 'active' }
    ]);
    
    // Step 4: Synthesizing (will be updated when response starts)
    setSearchSteps(prev => [
      ...prev,
      { id: '4', text: 'Synthesizing answer...', status: 'pending' }
    ]);
  };

  const fetchLiveWeather = async (query: string): Promise<WeatherData | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/weather?query=${encodeURIComponent(query)}`);
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
      const res = await fetch(`${API_BASE}/api/time?query=${encodeURIComponent(query)}`);
      if (!res.ok) return null;
      const body = await res.json();
      if (body?.available && body.data) return body.data as TimeData;
      return null;
    } catch {
      return null;
    }
  };

  // Component for inline source citations (Perplexity style)
  const SourceBadge = ({ domain, isYouTube }: { domain: string; isYouTube?: boolean }) => {
    const cleanDomain = domain.replace('www.', '').split('.')[0];
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 mx-1 rounded-md bg-[#282a2c] border border-white/10 text-[10px] text-[#e3e3e3] font-medium align-middle">
        {isYouTube && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="#FF0000" className="inline">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
        )}
        {cleanDomain}
      </span>
    );
  };

  // Parse text and add inline source citations
  const parseInlineCitations = (text: string, webResults?: WebResult[]): React.ReactNode[] => {
    if (!webResults || webResults.length === 0) {
      return [text];
    }

    // Create a map of domains to results for quick lookup
    const domainMap = new Map<string, WebResult[]>();
    webResults.forEach(result => {
      const { domain } = extractDomainFromUrl(result.link);
      if (!domainMap.has(domain)) {
        domainMap.set(domain, []);
      }
      domainMap.get(domain)!.push(result);
    });

    // Pattern to match citations like [source: domain] or [domain] or just domain mentions
    const citationPattern = /\[source:\s*([^\]]+)\]|\[([^\]]+)\]|(\b(?:ndtv|indianexpress|youtube|economictimes|indiatoday|thefederal|affairscloud|livemint|moneycontrol|hindustantimes|timesofindia)\b)/gi;
    
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = citationPattern.exec(text)) !== null) {
      // Add text before citation
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }

      // Extract domain from citation
      const citedDomain = (match[1] || match[2] || match[3] || '').toLowerCase().trim();
      const foundDomain = Array.from(domainMap.keys()).find(d => 
        d.toLowerCase().includes(citedDomain) || citedDomain.includes(d.toLowerCase().split('.')[0])
      );

      if (foundDomain) {
        const isYouTube = foundDomain.toLowerCase().includes('youtube') || foundDomain.toLowerCase().includes('youtu.be');
        parts.push(<SourceBadge key={`badge-${match.index}`} domain={foundDomain} isYouTube={isYouTube} />);
      } else {
        // If domain not found, just show the text
        parts.push(match[0]);
      }

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts.length > 0 ? parts : [text];
  };

  const MarkdownRenderer = ({ content, webResults }: { content: string; webResults?: WebResult[] }) => {
    // Check if content has inline citations or if we should add them
    const hasInlineCitations = /\[source:|\[.*\]/.test(content);
    
    return (
      <div className="prose prose-invert max-w-none prose-p:leading-relaxed prose-p:my-2 prose-table:my-4 prose-th:bg-[#1e1f20] prose-td:border-white/10 prose-th:border-white/10">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p({ children }: any) {
              // Extract text content from children
              const extractText = (node: any): string => {
                if (typeof node === 'string') return node;
                if (React.isValidElement(node)) {
                  const props = node.props as any;
                  if (props?.children) {
                    return React.Children.toArray(props.children)
                      .map(extractText)
                      .join('');
                  }
                }
                return '';
              };
              
              const textContent = React.Children.toArray(children)
                .map(extractText)
                .join('');
              
              // Parse inline citations if we have webResults
              if (webResults && webResults.length > 0 && textContent) {
                const parsed = parseInlineCitations(textContent, webResults);
                return <p className="mb-3 leading-relaxed inline-flex flex-wrap items-baseline gap-1">{parsed}</p>;
              }
              
              return <p className="mb-3 leading-relaxed">{children}</p>;
            },
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
  };

  const sendPrompt = async (
    userMessage: string,
    options?: { replaceLastModel?: boolean; historyOverride?: { role: 'user' | 'model'; text: string }[] }
  ) => {
    const message = userMessage.trim();
    if (!message && !selectedImage) return;
    if (!activeSpace?.id) return;
    if (!auth.token) return;

    const firstMessageTitle = (message || (selectedImage ? 'Image' : 'New Conversation')).slice(0, 80).trim() || 'New Conversation';
    if (!activeConversationId) {
      pendingTitleRef.current = firstMessageTitle;
      setPendingConversationTitle(firstMessageTitle);
    }

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
      departmentId?: string;
      conversationId?: string | null;
      accessCode?: string;
    } = { message, systemInstruction, history };
    if (currentImage) {
      payload.imageBase64 = currentImage.split(',')[1];
      payload.mimeType = currentImage.split(';')[0].split(':')[1];
    }
    if (activeSpace?.id) payload.departmentId = activeSpace.id;
    if (activeConversationId) payload.conversationId = activeConversationId;
    const code = activeSpace?.id ? accessCodeMap[activeSpace.id] : undefined;
    if (code) payload.accessCode = code;

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
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (auth.token) headers['Authorization'] = `Bearer ${auth.token}`;
      const res = await fetch(`${API_BASE}/api/chat/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      if (!res.ok || !res.body) {
        let errMessage = 'Request failed.';
        if (res.status === 403 && activeSpace) {
          try {
            const body = await res.json().catch(() => null);
            errMessage = (body?.message as string) || 'Invalid access code.';
            setDepartmentAccessError(errMessage);
          } catch {
            setDepartmentAccessError('Invalid access code.');
          }
          setIsThinking(false);
          setChatHistory((prev) => (prev.length > 0 && prev[prev.length - 1]?.role === 'model' ? prev.slice(0, -1) : prev));
          setAccessCodeMap((prev) => {
            const next = { ...prev };
            delete next[activeSpace.id];
            return next;
          });
          setAccessCodeModalDept(activeSpace);
          setAccessCodeInput(['', '', '', '']);
          return;
        }
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
              if (data.type === 'conversation') {
                const conv = data as StreamConversation;
                if (conv.conversationId) {
                  setActiveConversationId(conv.conversationId);
                  const title = conv.title ?? pendingTitleRef.current ?? 'New Conversation';
                  setConversationsList((prev) => {
                    const already = prev.some((c) => c.id === conv.conversationId);
                    if (already) return prev;
                    return [
                      { id: conv.conversationId, title, updatedAt: new Date().toISOString(), departmentId: activeSpace?.id },
                      ...prev,
                    ];
                  });
                }
              }
              if (data.type === 'meta') {
                const meta = data as StreamMeta;
                
                // Convert webResults to SearchSource format and add them one by one with animation
                if (meta.webResults && meta.webResults.length > 0) {
                  // Extract domain from each URL using helper function
                  const sourcesToAdd: SearchSource[] = meta.webResults.map((result, idx) => {
                    const { domain, cleanUrl } = extractDomainFromUrl(result.link);
                    
                    return {
                      id: `source-${idx}-${Date.now()}`,
                      title: result.title,
                      url: cleanUrl, // Use clean URL (original, not proxy)
                      domain: domain,
                    };
                  });
                  
                  // Add sources one by one with animation delay
                  sourcesToAdd.forEach((source, idx) => {
                    setTimeout(() => {
                      setSearchSources(prev => {
                        // Avoid duplicates
                        if (prev.some(s => s.url === source.url)) return prev;
                        return [...prev, source];
                      });
                    }, idx * 100); // 100ms delay between each source
                  });
                  
                  // Update step to show sources found
                  setSearchSteps(prev => {
                    const reviewingStep = prev.find(s => s.id === '3');
                    if (reviewingStep) {
                      return prev.map(s => 
                        s.id === '3' 
                          ? { ...s, text: `Found ${sourcesToAdd.length} sources`, status: 'complete' as const }
                          : s
                      );
                    }
                    return prev;
                  });
                }
                
                setChatHistory((prev) => {
                  const last = prev[prev.length - 1];
                  if (last?.role === 'model') {
                    return [
                      ...prev.slice(0, -1),
                      { 
                        ...last, 
                        webResults: meta.webResults, 
                        lastUpdated: meta.lastUpdated, 
                        sources: undefined,
                        sourceCount: meta.webResults?.length || 0
                      },
                    ];
                  }
                  return prev;
                });
              }
              if (data.type === 'token') {
                fullText += (data as StreamChunk).text;
                
                // Update step to show writing when first token arrives
                if (fullText.length === (data as StreamChunk).text.length) {
                  setSearchSteps(prev => {
                    const writingStep = prev.find(s => s.id === '4');
                    if (writingStep && writingStep.status === 'pending') {
                      return prev.map(s => 
                        s.id === '4' 
                          ? { ...s, status: 'active' as const, text: 'Writing answer...' }
                          : s.id === '3' && s.status === 'active'
                          ? { ...s, status: 'complete' as const, text: `Found ${searchSources.length} sources` }
                          : s
                      );
                    }
                    return prev;
                  });
                }
                
                setChatHistory((prev) => {
                  const last = prev[prev.length - 1];
                  if (last?.role === 'model') return [...prev.slice(0, -1), { ...last, text: fullText }];
                  return prev;
                });
              }
              if (data.type === 'done') {
                setConversationsRefreshTrigger((t) => t + 1);
                setTimeout(() => {
                  setPendingConversationTitle(null);
                  pendingTitleRef.current = null;
                }, 2000);
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
      // Complete all steps when done
      setSearchSteps(prev => prev.map(s => ({ ...s, status: 'complete' as const })));
      // Keep sources visible, they'll be cleared when new search starts
      setTimeout(() => {
        setSearchSteps([]);
        setSearchSources([]);
        setCurrentSearchQuery('');
      }, 2000); // Clear after 2 seconds
    }
  };

  // Handle send text - defined after sendPrompt
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

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      const url = authIsRegister ? `${API_BASE}/api/auth/register` : `${API_BASE}/api/auth/login`;
      const body = authIsRegister
        ? { email: authEmail.trim(), password: authPassword, departmentName: authDepartmentName.trim() }
        : { email: authEmail.trim(), password: authPassword };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAuthError((data.message as string) || 'Request failed');
        setAuthLoading(false);
        return;
      }
      const token = data.token as string;
      const rawUser = data.user as { id?: unknown; email?: string; departmentId?: unknown; departmentName?: string | null };
      if (token && rawUser?.email) {
        const user: AuthUser = {
          id: String(rawUser.id ?? ''),
          email: rawUser.email,
          departmentId: String(rawUser.departmentId ?? ''),
          departmentName: rawUser.departmentName ?? null,
        };
        setAuthLoading(false);
        setAuthSuccessLoading(true);
        await new Promise((r) => setTimeout(r, 2000));
        localStorage.setItem(AUTH_TOKEN_KEY, token);
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
        setAuth({ token, user, isAuthenticated: true });
        setAuthModalOpen(false);
        setAuthSuccessLoading(false);
        setAuthEmail('');
        setAuthPassword('');
        setAuthDepartmentName('');
      }
    } catch {
      setAuthError('Network error');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAccessCodeSubmit = async () => {
    const code = accessCodeInput.join('');
    if (code.length !== 4 || !accessCodeModalDept || !auth.token) return;
    setDepartmentAccessError(null);
    setAccessCodeChecking(true);
    try {
      const params = new URLSearchParams({ departmentId: accessCodeModalDept.id, accessCode: code });
      const res = await fetch(`${API_BASE}/api/conversations?${params}`, {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) {
        setDepartmentAccessError((data.message as string) || 'Invalid access code.');
        return;
      }
      if (!res.ok) {
        setDepartmentAccessError('Something went wrong. Try again.');
        return;
      }
      setAccessCodeMap((prev) => ({ ...prev, [accessCodeModalDept.id]: code }));
      setAccessCodeModalDept(null);
      setAccessCodeInput(['', '', '', '']);
      openDepartment(accessCodeModalDept);
    } finally {
      setAccessCodeChecking(false);
    }
  };

  return (
    <div className="h-screen bg-[#0e0e0e] text-[#e3e3e3] font-['Inter'] flex overflow-hidden">

      {/* Auth Modal: show after delay when not authenticated; blurred background */}
      {authModalOpen && !auth.isAuthenticated && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-xl p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-md"
          >
            {/* Gradient border glow */}
            <div className="absolute -inset-[1px] rounded-[1.25rem] bg-gradient-to-br from-[#4b90ff]/60 via-[#00d9ff]/40 to-[#ff5546]/40 opacity-80 blur-sm" />
            <div className="relative w-full rounded-2xl bg-[#0e0e0e] border border-white/10 shadow-2xl shadow-[#4b90ff]/10 p-8 overflow-hidden">
              {/* Subtle grid / theme accent */}
              <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#ffffff 0.5px, transparent 0.5px)', backgroundSize: '20px 20px' }} />
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#4b90ff]/50 to-transparent" />
              <button
                type="button"
                onClick={() => setAuthModalOpen(false)}
                className="absolute top-4 right-4 p-2 text-[#8e918f] hover:text-white rounded-xl hover:bg-white/5 transition-colors z-10"
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>

              {authSuccessLoading ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-6">
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.3 }}
                    className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#4b90ff] to-[#00d9ff] flex items-center justify-center shadow-[0_0_40px_rgba(75,144,255,0.4)]"
                  >
                    <Loader2 className="w-8 h-8 text-white animate-spin" />
                  </motion.div>
                  <p className="text-lg font-semibold text-white">
                    {authIsRegister ? 'Creating your account...' : 'Signing you in...'}
                  </p>
                  <p className="text-sm text-[#8e918f]">Just a moment</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#4b90ff] to-[#ff5546] flex items-center justify-center text-sm font-bold text-white shadow-lg">
                      AI
                    </div>
                    <h2 className="text-2xl font-bold text-white tracking-tight">
                      {authIsRegister ? 'Create account' : 'Welcome back'}
                    </h2>
                  </div>
                  <form onSubmit={handleAuthSubmit} className="space-y-4 relative">
                    {authError && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5"
                      >
                        {authError}
                      </motion.div>
                    )}
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-[#8e918f] mb-2">Email</label>
                      <input
                        type="email"
                        value={authEmail}
                        onChange={(e) => setAuthEmail(e.target.value)}
                        required
                        className="w-full px-4 py-3 rounded-xl bg-[#1e1f20] border border-white/10 text-white placeholder-[#444746] focus:border-[#4b90ff] focus:ring-1 focus:ring-[#4b90ff]/30 outline-none transition-all"
                        placeholder="you@example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-[#8e918f] mb-2">Password</label>
                      <input
                        type="password"
                        value={authPassword}
                        onChange={(e) => setAuthPassword(e.target.value)}
                        required
                        className="w-full px-4 py-3 rounded-xl bg-[#1e1f20] border border-white/10 text-white placeholder-[#444746] focus:border-[#4b90ff] focus:ring-1 focus:ring-[#4b90ff]/30 outline-none transition-all"
                        placeholder="••••••••"
                      />
                    </div>
                    {authIsRegister && (
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-widest text-[#8e918f] mb-2">Department</label>
                        <select
                          value={authDepartmentName}
                          onChange={(e) => setAuthDepartmentName(e.target.value)}
                          required={authIsRegister}
                          className="w-full px-4 py-3 rounded-xl bg-[#1e1f20] border border-white/10 text-white focus:border-[#4b90ff] focus:ring-1 focus:ring-[#4b90ff]/30 outline-none transition-all"
                        >
                          <option value="">Select department</option>
                          {authDepartmentsForDropdown.map((d) => (
                            <option key={d.id} value={d.name}>{d.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={authLoading}
                      className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#4b90ff] to-[#3a7ad9] text-white font-semibold hover:opacity-95 disabled:opacity-50 transition-all shadow-[0_0_20px_rgba(75,144,255,0.2)]"
                    >
                      {authLoading ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Please wait...
                        </span>
                      ) : authIsRegister ? 'Register' : 'Sign in'}
                    </button>
                  </form>
                  <p className="mt-5 text-center text-sm text-[#8e918f]">
                    {authIsRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
                    <button
                      type="button"
                      onClick={() => { setAuthIsRegister(!authIsRegister); setAuthError(''); }}
                      className="text-[#4b90ff] hover:underline font-medium"
                    >
                      {authIsRegister ? 'Sign in' : 'Register'}
                    </button>
                  </p>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* Access Code Modal (4-digit OTP style) */}
      {accessCodeModalDept && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[#1e1f20] border border-white/10 shadow-2xl p-8">
            <h2 className="text-xl font-bold text-white mb-2 text-center">Access code</h2>
            <p className="text-sm text-[#8e918f] mb-2 text-center">{accessCodeModalDept.name}</p>
            {departmentAccessError && (
              <p className="text-red-400 text-sm text-center mb-4">{departmentAccessError}</p>
            )}
            <div className="flex justify-center gap-2 mb-6">
              {[0, 1, 2, 3].map((i) => (
                <input
                  key={i}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={accessCodeInput[i]}
                  onChange={(e) => {
                    setDepartmentAccessError(null);
                    const v = e.target.value.replace(/\D/g, '').slice(0, 1);
                    setAccessCodeInput((prev) => {
                      const next = [...prev];
                      next[i] = v;
                      if (v && i < 3) (document.querySelector(`input[data-otp="${i + 1}"]`) as HTMLInputElement)?.focus();
                      return next;
                    });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace' && !accessCodeInput[i] && i > 0)
                      (document.querySelector(`input[data-otp="${i - 1}"]`) as HTMLInputElement)?.focus();
                  }}
                  data-otp={i}
                  className="w-14 h-14 rounded-xl bg-[#0e0e0e] border border-white/10 text-white text-center text-xl font-bold focus:border-[#4b90ff] outline-none"
                />
              ))}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setAccessCodeModalDept(null); setAccessCodeInput(['', '', '', '']); setDepartmentAccessError(null); }}
                className="flex-1 py-3 rounded-xl border border-white/10 text-[#8e918f] hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAccessCodeSubmit}
                disabled={accessCodeInput.join('').length !== 4 || accessCodeChecking}
                className="flex-1 py-3 rounded-xl bg-[#4b90ff] text-white font-semibold hover:bg-[#3a7ad9] disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {accessCodeChecking ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Checking...
                  </>
                ) : (
                  'Submit'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename conversation modal */}
      {renameModalConv && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => { setRenameModalConv(null); setRenameInput(''); }}>
          <div className="relative w-full max-w-md rounded-2xl bg-[#1e1f20] border border-white/10 shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-3">Rename conversation</h3>
            <input
              type="text"
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value.slice(0, 80))}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSubmit(); if (e.key === 'Escape') { setRenameModalConv(null); setRenameInput(''); } }}
              placeholder="Conversation title"
              className="w-full px-4 py-3 rounded-xl bg-[#0e0e0e] border border-white/10 text-white placeholder-[#8e918f] focus:border-[#4b90ff] outline-none mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <button type="button" onClick={() => { setRenameModalConv(null); setRenameInput(''); }} className="flex-1 py-3 rounded-xl border border-white/10 text-[#8e918f] hover:bg-white/5 transition-colors">Cancel</button>
              <button type="button" onClick={handleRenameSubmit} className="flex-1 py-3 rounded-xl bg-[#4b90ff] text-white font-semibold hover:bg-[#3a7ad9] transition-colors">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Main app: always visible (Anything AI page first, then login popup on top) */}
      <>
      {/* Primary Sidebar (desktop only) */}
      <aside className="hidden md:flex fixed left-0 top-0 h-screen w-20 bg-[#0e0e0e] border-r border-white/5 flex-col items-center py-6 z-[100]">
        <div className="mb-8 text-[#4b90ff] cursor-pointer hover:scale-110 transition-transform" onClick={() => setCurrentView('home')}>
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#4b90ff] to-[#ff5546] flex items-center justify-center text-[10px] font-bold text-white shadow-[0_0_20px_rgba(75,144,255,0.2)]">AI</div>
        </div>

        <SidebarItem icon={<Home size={18} />} label="Home" onClick={() => setCurrentView('home')} isActive={currentView === 'home'} />
        <SidebarItem icon={<History size={18} />} label="History" onClick={handleOpenHistory} isActive={currentView === 'history'} />
        <SidebarItem icon={<Layers size={18} />} label="Spaces" onClick={handleOpenSpaces} isActive={currentView === 'spaces'} />

        <div className="mt-auto flex flex-col items-center">
          <SidebarItem icon={<User size={18} />} label="Profile" onClick={() => setCurrentView('profile')} isActive={currentView === 'profile'} />
          <button
            onClick={() => {
              localStorage.removeItem(AUTH_TOKEN_KEY);
              localStorage.removeItem(AUTH_USER_KEY);
              setAuth({ token: null, user: null, isAuthenticated: false });
              setAuthSuccessLoading(false);
              setAuthModalOpen(true);
            }}
            className="group relative flex flex-col items-center justify-center w-14 h-14 rounded-2xl transition-all duration-300 mb-4 text-[#8e918f] hover:bg-white/5 hover:text-white"
            aria-label="Log out"
          >
            <LogOut size={18} className="transition-transform duration-300 group-hover:scale-110" />
            <span className="absolute left-full ml-4 px-2 py-1 bg-[#282a2c] text-white text-[10px] font-bold uppercase tracking-widest rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-[100]">Log out</span>
          </button>
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
              {auth.isAuthenticated && conversationsList.length >= 0 ? (
                <>
                  {conversationsList.map((conv) => {
                    const isActive = activeConversationId === conv.id;
                    const showAnimatedTitle = isActive && pendingConversationTitle !== null;
                    const displayTitle = showAnimatedTitle ? pendingConversationTitle : (conv.title || 'New Conversation');
                    const menuOpen = conversationMenuOpen === conv.id;
                    return (
                      <div
                        key={conv.id}
                        ref={(el) => { if (menuOpen && el) conversationMenuRef.current = el; else if (conversationMenuRef.current === el) conversationMenuRef.current = null; }}
                        className={`w-full group rounded-xl transition-all relative flex items-center
                          ${isActive ? 'bg-[#1e1f20]' : 'hover:bg-white/5'}`}
                      >
                        <button
                          onClick={() => loadConversation(conv.id)}
                          className={`flex-1 min-w-0 px-4 py-3 text-left flex items-center justify-between
                            ${isActive ? 'text-white' : 'text-[#8e918f] hover:text-[#e3e3e3]'}`}
                        >
                          <div className="flex flex-col truncate pr-2 min-w-0">
                            <span className="text-sm font-medium truncate block flex items-center gap-1.5">
                              {conv.pinned && <span className="text-[10px] text-[#4b90ff] shrink-0" title="Pinned">📌</span>}
                              {showAnimatedTitle ? (
                                <AnimatedTitle text={displayTitle} className="text-sm font-medium" />
                              ) : (
                                displayTitle
                              )}
                            </span>
                            <span className="text-[10px] opacity-40 mt-0.5">
                              {conv.updatedAt ? new Date(conv.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}
                            </span>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setConversationMenuOpen((prev) => (prev === conv.id ? null : conv.id)); }}
                          className={`p-2 rounded-lg shrink-0 transition-opacity ${menuOpen ? 'opacity-100 text-[#e3e3e3]' : 'opacity-0 group-hover:opacity-100'} text-[#8e918f] hover:text-[#e3e3e3] hover:bg-white/5`}
                          aria-label="Conversation options"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
                        </button>
                        {menuOpen && (
                          <div className="absolute right-2 top-full mt-1 z-50 min-w-[140px] py-1 rounded-lg bg-[#1e1f20] border border-white/10 shadow-xl" onClick={(e) => e.stopPropagation()}>
                            <button type="button" onClick={(e) => handleRenameConversation(conv, e)} className="w-full px-4 py-2.5 text-left text-sm text-[#e3e3e3] hover:bg-white/5 flex items-center gap-2">
                              <span>Rename</span>
                            </button>
                            <button type="button" onClick={(e) => handlePinConversation(conv, e)} className="w-full px-4 py-2.5 text-left text-sm text-[#e3e3e3] hover:bg-white/5 flex items-center gap-2">
                              <span>{conv.pinned ? 'Unpin' : 'Pin'}</span>
                            </button>
                            <button type="button" onClick={(e) => handleDeleteConversation(conv, e)} className="w-full px-4 py-2.5 text-left text-sm text-[#ff5546] hover:bg-white/5 flex items-center gap-2">
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              ) : (
                activeSpaceSessions.map(session => (
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
                ))
              )}
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
                {currentView === 'profile' ? 'Profile' : activeSpace ? activeSpace.name : 'ASK ANYTHING'}
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
                {spacesList.length === 0 ? (
                  <p className="text-[#8e918f]">Loading departments...</p>
                ) : (
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
                )}
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
                            
                            {/* Reviewed Sources Indicator (Perplexity style) */}
                            {msg.role === 'model' && msg.sourceCount && msg.sourceCount > 0 && (
                              <div className="mb-4 pb-3 border-b border-white/10">
                                <a 
                                  href="#sources"
                                  className="inline-flex items-center gap-2 text-xs text-[#8e918f] hover:text-[#4b90ff] transition-colors group"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    const sourcesSection = document.getElementById('sources-section');
                                    sourcesSection?.scrollIntoView({ behavior: 'smooth' });
                                  }}
                                >
                                  <span>Reviewed {msg.sourceCount} {msg.sourceCount === 1 ? 'source' : 'sources'}</span>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-0 group-hover:opacity-100 transition-opacity">
                                    <path d="M5 12h14M12 5l7 7-7 7"/>
                                  </svg>
                                </a>
                              </div>
                            )}
                            
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
                                    // Extract clean domain name from URL
                                    const { domain, cleanUrl } = extractDomainFromUrl(r.link);
                                    
                                    return (
                                      <a
                                        key={`${r.link}-${i}`}
                                        href={cleanUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="group flex items-start gap-3 p-3 rounded-xl border border-white/10 hover:border-[#4b90ff]/40 transition-all bg-[#1e1f20]/50 hover:bg-[#1e1f20]"
                                      >
                                        <div className="w-8 h-8 rounded-lg bg-[#282a2c] flex items-center justify-center overflow-hidden shrink-0">
                                          <img 
                                            src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
                                            alt={domain}
                                            className="w-5 h-5"
                                            onError={(e) => {
                                              (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%234b90ff"><circle cx="12" cy="12" r="10"/></svg>';
                                            }}
                                          />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="text-[10px] font-semibold text-[#4b90ff] mb-1 uppercase tracking-wider truncate">
                                            {domain}
                                          </div>
                                          <div className="text-sm text-white group-hover:text-[#4b90ff] transition-colors line-clamp-2">
                                            {r.title}
                                          </div>
                                          {r.snippet && (
                                            <div className="text-xs text-[#8e918f] mt-1 line-clamp-1">
                                              {r.snippet}
                                            </div>
                                          )}
                                        </div>
                                      </a>
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
                                    // Extract clean domain name from URL
                                    const { domain, cleanUrl } = extractDomainFromUrl(source.link);
                                    
                                    return (
                                      <a
                                        key={`${source.link}-${i}`}
                                        href={cleanUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="group flex items-start gap-3 p-3 bg-[#1e1f20] border border-white/5 rounded-xl hover:border-[#4b90ff]/30 transition-all cursor-pointer min-w-[240px] max-w-[280px]"
                                      >
                                        <div className="w-8 h-8 rounded-lg bg-[#282a2c] flex items-center justify-center overflow-hidden shrink-0">
                                          <img 
                                            src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
                                            alt={domain}
                                            className="w-5 h-5"
                                            onError={(e) => {
                                              (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%234b90ff"><circle cx="12" cy="12" r="10"/></svg>';
                                            }}
                                          />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-[10px] font-semibold text-[#4b90ff] mb-1 uppercase tracking-wider truncate">{domain}</p>
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
                                <MarkdownRenderer content={msg.text} webResults={msg.webResults} />
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
                    
                    {/* Search Animation - Shows visual progress with sources appearing one by one */}
                    {(isThinking || searchSteps.length > 0 || searchSources.length > 0) && (
                      <SearchAnimation
                        isSearching={isThinking || searchSources.length > 0}
                        steps={searchSteps}
                        sources={searchSources}
                        query={currentSearchQuery}
                      />
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

            {currentView === 'history' && (
              <div className="animate-in fade-in slide-in-from-bottom-6 duration-700 mt-8">
                <h2 className="text-4xl font-bold mb-10 text-white tracking-tight">Chat History</h2>

                {!auth.isAuthenticated ? (
                  <div className="text-center py-20">
                    <p className="text-[#8e918f]">Sign in to see your conversations.</p>
                  </div>
                ) : historyLoading ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="w-12 h-12 text-[#4b90ff] animate-spin mb-4" />
                    <p className="text-[#8e918f]">Loading your conversations...</p>
                  </div>
                ) : allConversationsList.length === 0 ? (
                  <div className="text-center py-20">
                    <History size={48} className="mx-auto mb-4 text-[#8e918f]" />
                    <p className="text-[#8e918f] text-lg">No conversations yet</p>
                    <p className="text-[#444746] text-sm mt-2">Start a chat in any space to see it here</p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {spacesList.map(space => {
                      const deptConvs = allConversationsList
                        .filter(c => String(c.departmentId) === String(space.id))
                        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
                      if (deptConvs.length === 0) return null;
                      return (
                        <div key={space.id} className="space-y-4">
                          <div className="flex items-center gap-3 mb-4">
                            <span className="text-2xl">{space.icon}</span>
                            <h3 className="text-2xl font-bold text-white">{space.name}</h3>
                            <span className="text-sm text-[#8e918f]">({deptConvs.length} {deptConvs.length === 1 ? 'chat' : 'chats'})</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {deptConvs.map(conv => (
                              <button
                                key={conv.id}
                                onClick={() => openConversationFromHistory(conv)}
                                className="group p-6 bg-[#1e1f20] border border-white/5 rounded-2xl text-left transition-all hover:border-[#4b90ff]/50 hover:bg-[#282a2c]"
                              >
                                <div className="flex flex-col min-w-0">
                                  <h4 className="text-sm font-semibold text-white group-hover:text-[#4b90ff] transition-colors truncate mb-1">
                                    {conv.title || 'New Conversation'}
                                  </h4>
                                  <p className="text-[10px] text-[#8e918f]">
                                    {conv.updatedAt ? new Date(conv.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: new Date(conv.updatedAt).getTime() < Date.now() - 31536000000 ? 'numeric' : undefined }) : ''}
                                    {conv.updatedAt && ' • '}
                                    {conv.updatedAt ? new Date(conv.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                  </p>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {/* Show conversations whose department is not in spacesList (e.g. deleted department) */}
                    {(() => {
                      const knownDeptIds = new Set(spacesList.map(s => String(s.id)));
                      const otherConvs = allConversationsList
                        .filter(c => !knownDeptIds.has(String(c.departmentId)))
                        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
                      if (otherConvs.length === 0) return null;
                      return (
                        <div className="space-y-4">
                          <div className="flex items-center gap-3 mb-4">
                            <span className="text-2xl">💬</span>
                            <h3 className="text-2xl font-bold text-white">Other</h3>
                            <span className="text-sm text-[#8e918f]">({otherConvs.length})</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {otherConvs.map(conv => (
                              <button
                                key={conv.id}
                                onClick={() => openConversationFromHistory(conv)}
                                className="group p-6 bg-[#1e1f20] border border-white/5 rounded-2xl text-left transition-all hover:border-[#4b90ff]/50 hover:bg-[#282a2c]"
                              >
                                <div className="flex flex-col min-w-0">
                                  <h4 className="text-sm font-semibold text-white group-hover:text-[#4b90ff] transition-colors truncate mb-1">
                                    {conv.title || 'New Conversation'}
                                  </h4>
                                  <p className="text-[10px] text-[#8e918f]">
                                    {conv.updatedAt ? new Date(conv.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}
                                    {conv.updatedAt && ' • '}
                                    {conv.updatedAt ? new Date(conv.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                  </p>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {currentView === 'profile' && (
              <div className="animate-in fade-in duration-500 py-12">
                <h2 className="text-4xl font-bold mb-10 text-white tracking-tight">Profile</h2>
                {auth.isAuthenticated && auth.user ? (
                  <div className="p-8 bg-[#1e1f20] border border-white/5 rounded-[2rem] max-w-lg space-y-6">
                    <div className="flex items-center gap-6">
                      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#4b90ff] to-[#ff5546] flex items-center justify-center text-3xl font-bold text-white shadow-lg">
                        {auth.user.email.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-white">{auth.user.email}</h3>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#8e918f] mt-1">Signed in</p>
                      </div>
                    </div>
                    <div className="border-t border-white/10 pt-6 space-y-4">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[#8e918f]">Email</span>
                        <p className="text-[#e3e3e3] mt-1">{auth.user.email}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[#8e918f]">Department</span>
                        <p className="text-[#e3e3e3] mt-1">{auth.user.departmentName ?? '—'}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        localStorage.removeItem(AUTH_TOKEN_KEY);
                        localStorage.removeItem(AUTH_USER_KEY);
                        setAuth({ token: null, user: null, isAuthenticated: false });
                        setAuthSuccessLoading(false);
                        setAuthModalOpen(true);
                      }}
                      className="mt-4 px-6 py-3 rounded-xl border border-white/10 text-[#8e918f] hover:bg-white/5 hover:text-white transition-colors"
                    >
                      Sign out
                    </button>
                  </div>
                ) : (
                  <div className="p-8 bg-[#1e1f20] border border-white/5 rounded-[2rem] max-w-lg text-center">
                    <p className="text-[#8e918f] mb-4">Sign in to view your profile.</p>
                    <button
                      onClick={() => { setAuthSuccessLoading(false); setAuthModalOpen(true); }}
                      className="px-6 py-3 rounded-xl bg-[#4b90ff] text-white font-semibold hover:bg-[#3a7ad9] transition-colors"
                    >
                      Sign in
                    </button>
                  </div>
                )}
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
          <History size={18} />
          <span className="text-[10px] mt-1">History</span>
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

      </>
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

