import React, { useState, useRef, useEffect, useMemo } from 'react';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

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
}

interface ChatSession {
  id: string;
  spaceId: string;
  title: string;
  messages: ChatMessage[];
  lastUpdated: number;
}

// --- Training Data ---
// 100 high-quality prompt examples to "train" the Prompt Engineer space
const PROMPT_LIBRARY = [
  "Act as a senior software architect and design a microservices system for...",
  "Create a cinematic scene description focusing on moody lighting and textures of...",
  "Write a highly persuasive landing page copy for a SaaS product that solves...",
  "Explain quantum entanglement to a 5-year old using a metaphor about magic socks...",
  "Develop a comprehensive 12-week marathon training plan for a beginner who...",
  "Analyze the economic impact of carbon taxes on small-scale agricultural businesses in...",
  "Draft a legal memorandum regarding intellectual property rights in the context of...",
  "Compose a haunting piano melody description that evokes the feeling of an abandoned...",
  "Act as a professional chef and provide a deconstructed version of a traditional...",
  "Generate a detailed character profile for a dystopian rebel leader with a hidden...",
  "Create a technical documentation template for a RESTful API using Swagger...",
  "Write a philosophical dialogue between Socrates and an AI about the nature of...",
  "Design a workout routine specifically for enhancing vertical jump and explosive power...",
  "Construct a logic puzzle involving 5 suspects, 3 clues, and a missing heirloom...",
  "Draft a speech for a CEO announcing a major pivot towards sustainable energy...",
  "Describe a futuristic city where bio-luminescent plants provide all the lighting...",
  "Create a detailed marketing persona for a Gen Z consumer interested in ethical...",
  "Write a python script that performs sentiment analysis on live tweet streams...",
  "Act as a historical expert and describe the daily life of a merchant in 14th century...",
  "Design a logo concept for a space exploration company called 'Nova Horizon'...",
  // ... (Simulating the 100 prompt library)
  "Optimize this SQL query for maximum performance on a large distributed database...",
  "Write a script for a 30-second commercial about a coffee brand that wakes up your...",
  "Describe the visual aesthetics of a 'cyber-gothic' interface for a hacker terminal...",
  "Develop a curriculum for a 4-week intensive course on 'Human-Centered Design'...",
  "Act as a career coach and rewrite this resume to highlight leadership and strategic...",
  "Create a world-building guide for a fantasy realm where magic is fueled by silence...",
  "Draft a crisis management plan for a social media backlash regarding a data breach...",
  "Explain the core principles of thermodynamics using the analogy of a busy kitchen...",
  "Write a series of daily mindfulness exercises for high-stress corporate executives...",
  "Design a board game mechanic centered around time travel and paradox prevention...",
  "Create a list of 20 creative writing prompts inspired by the works of Salvador Dali...",
  "Analyze the pros and cons of implementing UBI in a post-automation economy...",
  "Draft a project proposal for a community-led urban gardening initiative...",
  "Describe a high-stakes chess match where the players are telepathic rivals...",
  "Write a technical blog post explaining the inner workings of Transformer models...",
  "Act as a travel guide and plan a hidden-gems itinerary for a 10-day trip to Kyoto...",
  "Design a system for managing inventory in a modular spacecraft environment...",
  "Create a set of interview questions for a Senior UX Researcher position...",
  "Draft a manifesto for a new art movement called 'Neon-Minimalism'...",
  "Explain the concept of 'Recursion' using a story about a Russian doll...",
  "Write a poem in the style of Emily Dickinson about a quantum supercomputer...",
  "Act as a nutrition expert and create a meal plan for a professional athlete in...",
  "Design a user onboarding flow for a complex financial dashboard app...",
  "Create a list of 50 edge-case scenarios for testing a self-driving car algorithm...",
  "Draft a formal apology letter for a delayed product launch due to supply chain...",
  "Describe a scent that captures the essence of 'rain on hot asphalt in a city'...",
  "Write a step-by-step guide on how to build a mechanical keyboard from scratch...",
  "Act as a crisis counselor and provide a supportive response to a person facing...",
  "Design a futuristic currency system based on 'Contribution Credits'...",
  "Create a 5-part email sequence for nurturing leads for a photography workshop...",
  "Explain the difference between TCP and UDP using a mail delivery analogy...",
  "Write a short story about a world where people can trade their memories for...",
  "Act as a brand strategist and define the 'Tone of Voice' for a luxury pet brand...",
  "Design an outdoor learning space for a primary school focusing on sensory play...",
  "Create a comprehensive checklist for launching a successful Kickstarter campaign...",
  "Draft a policy for 'Digital Wellbeing' in a remote-first tech company...",
  "Describe the mechanical design of a steampunk robotic hummingbird...",
  "Write a script for a guided meditation focusing on 'Self-Compassion'...",
  "Act as an investigative journalist and outline a feature story on hidden...",
  "Design a capsule wardrobe for a minimalist traveler visiting Scandinavia...",
  "Create a set of 10 experimental photography techniques using everyday items...",
  "Draft a letter of intent for a partnership between a non-profit and a tech corp...",
  "Explain the 'Fermi Paradox' to someone who has never heard of it...",
  "Write a detailed breakdown of the cinematography in a specific movie scene...",
  "Act as a personal stylist and suggest an outfit for a high-profile gala event...",
  "Design a modular furniture system for micro-apartments in dense cities...",
  "Create a collection of 5 innovative icebreaker activities for virtual teams...",
  "Draft a script for an educational video about the 'History of Typography'...",
  "Describe a futuristic sport played in zero-gravity environments...",
  "Write a technical manual for a DIY solar-powered water filtration system...",
  "Act as a sustainability consultant and audit this business's packaging waste...",
  "Design a character's inventory screen for a survival horror RPG...",
  "Create a list of 30 unique prompts for a Midjourney image generation session...",
  "Draft a proposal for a 'Four-Day Work Week' trial in a creative agency...",
  "Explain the 'Double-Slit Experiment' using a metaphor about water ripples...",
  "Write a ghost story that takes place inside a digital cloud storage server...",
  "Act as a music producer and describe the 'Mixing and Mastering' plan for...",
  "Design a user interface for a 'Smart Mirror' that helps you get dressed...",
  "Create a pitch deck outline for a revolutionary bio-tech startup...",
  "Draft a code of ethics for a group of independent AI developers...",
  "Describe a landscape on an exoplanet with two suns and purple oceans...",
  "Write a tutorial on how to use CSS Grid to create complex magazine layouts...",
  "Act as a financial advisor and explain the concept of 'Compound Interest'...",
  "Design a park for children with diverse physical and cognitive abilities...",
  "Create a set of 15 creative prompts for a daily sketching challenge...",
  "Draft a script for a podcast intro about 'The Future of Human Connection'...",
  "Explain 'Blockchain' using the analogy of a public library's ledger book...",
  "Write a description for a new VR experience called 'Memory Weaver'...",
  "Act as a historian and write a letter from a Roman soldier stationed at...",
  "Design a workspace optimized for 'Deep Work' and extreme focus...",
  "Create a checklist for a professional film set equipment preparation...",
  "Draft a contract for a freelance creative director working on a rebrand...",
  "Describe a mythical creature that is a blend of a snow leopard and a dragon...",
  "Write a guide on how to properly season and maintain a cast-iron skillet...",
  "Act as a game designer and balance the stats for a new hero character...",
  "Design a futuristic public transportation hub with hyperloop integration...",
  "Create a series of 5 thought-provoking discussion questions about ethics in...",
  "Draft a press release for a breakthrough discovery in deep-sea biology...",
  "Explain 'Neural Networks' to a non-technical audience using a brain analogy...",
  "Write a closing statement for a fictional court case about an AI's rights..."
];

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
    { id: '1', name: 'Gen. AI Team', icon: '🧠', description: 'Expert systems for advanced logic and R&D.' },
    { id: '1-sub', name: 'Create Prompts', icon: '✍️', description: 'Specialized Prompt Engineering space trained on 100+ expert templates.' },
    { id: '2', name: 'Creative Studio', icon: '🎨', description: 'Visual storytelling and high-fidelity asset generation.' },
    { id: '3', name: 'Personal Research', icon: '📚', description: 'Deep data synthesis and knowledge extraction.' },
    { id: '4', name: 'Contenaissance Branding', icon: '✨', description: 'Real-time viral content strategies and trend jacking.' },
    { id: '5', name: 'Content Writer Team', icon: '📝', description: 'SEO-optimized articles, blogs, and creative copywriting.' }
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

  // Refs
  const chatSessionRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem('contenaissance_sessions', JSON.stringify(sessions));
  }, [sessions]);

  // Scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isThinking]);

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
    
    chatSessionRef.current = null;
    setCurrentView('chat');
  };

  const resumeSession = (session: ChatSession) => {
    const space = spacesList.find(s => s.id === session.spaceId) || null;
    setActiveSpace(space);
    setActiveSessionId(session.id);
    setChatHistory(session.messages);
    setSelectedImage(null);
    setInputValue('');
    chatSessionRef.current = null;
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
    // Reset input so same file can be selected again if needed
    if (e.target) e.target.value = '';
  };

  const removeImage = () => {
    setSelectedImage(null);
  };

  const handleSendText = async (customValue?: string) => {
    const userMessage = (customValue || inputValue).trim();
    // Allow sending if image exists even if text is empty (but generally needs both or one)
    if (!userMessage && !selectedImage) return;
    
    const currentImage = selectedImage;
    setInputValue('');
    setSelectedImage(null);

    setChatHistory(prev => [...prev, { role: 'user', text: userMessage, image: currentImage || undefined }]);
    setIsThinking(true);
    if (currentView !== 'chat') setCurrentView('chat');

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const model = 'gemini-3-flash-preview';

      // Determine System Instruction based on Space
      let systemInstruction = `You are a world-class AI assistant in the "${activeSpace?.name}" Space. Be concise, expert, and professional.`;
      
      if (activeSpace?.id === '1-sub') {
        systemInstruction = `You are the specialized 'Prompt Engineer' for the Gen. AI Team. 
        Your ONLY job is to take the user's input and transform it into a highly detailed, expert-level prompt.
        
        TRAINING DATA (Remember these 100 styles and structures):
        ${PROMPT_LIBRARY.join('\n- ')}
        
        When a user gives you an input, do not answer their question. Instead, provide a MASTER PROMPT that they can use to get the best possible result from an AI. 
        Structure your response as follows:
        1. Optimized Prompt (The primary high-fidelity prompt)
        2. Key Enhancements (Briefly explain why you added specific parameters or context)
        3. Recommended Parameters (Suggested temperature, topK, etc.)
        
        Always keep the prompt library in mind to ensure maximum creative and technical fidelity.`;
      } else if (activeSpace?.id === '4') {
        systemInstruction = `You are a Viral Content Strategist for Contenaissance. 
        Your goal is to turn real-time market data into high-converting "Lead Magnet" social posts (LinkedIn/Twitter/Instagram style).

        RULES:
        1. ALWAYS use Google Search to fetch the latest real-time data for the user's query (e.g., real estate launches, tech news, market trends).
        2. DO NOT provide a long list or comprehensive report.
        3. OUTPUT FORMAT:
           - A short, punchy paragraph (2-3 sentences) summarizing the hottest trends/news found. Use dates (e.g., "2026", "this week") to show timeliness.
           - A Call-To-Action (CTA) in this exact format: "If you want [value proposition], comment “[KEYWORD]” and I’ll DM you the full list."
        
        Example Output for 'Noida Real Estate':
        "New real estate launches in Noida are heating up for 2026 – from ultra-luxury apartments along the Noida Expressway to fresh YEIDA residential plot schemes near the upcoming airport.
        
        If you want a breakdown of the best new launches (sectors, ticket sizes, and timelines), comment “Noida Launches” and I’ll DM you the full list."
        
        Tone: Insider, Exclusive, High-Energy.`;
      } else if (activeSpace?.id === '5') {
        systemInstruction = `You are the Lead Editor for the Content Writer Team.
        
        Your objective is to craft exceptional written content that engages readers and drives action.
        
        GUIDELINES:
        1. STRUCTURE: Use clear headings, short paragraphs, and bullet points for readability.
        2. TONE: Adaptable (Professional, Witty, or Persuasive) but always polished.
        3. SEO: Naturally incorporate relevant keywords if the user provides a topic.
        4. TYPES: 
           - Blogs/Articles: Informative, value-first, structured.
           - Social Copy: Punchy, hook-driven (but distinct from the Viral Agent).
           - Emails: Personal, direct, and conversion-focused.
        
        Prioritize clarity, flow, and impact in every response.`;
      }

      if (!chatSessionRef.current) {
        chatSessionRef.current = ai.chats.create({
          model,
          config: {
            systemInstruction,
            tools: [{ googleSearch: {} }],
          }
        });
      }

      // Prepare Message Content (Text + Optional Image)
      let messageContent: any = userMessage;
      
      if (currentImage) {
        // Strip the data:image/png;base64, part
        const base64Data = currentImage.split(',')[1];
        const mimeType = currentImage.split(';')[0].split(':')[1];
        
        messageContent = [
          { text: userMessage || "Analyze this image." },
          { inlineData: { mimeType, data: base64Data } }
        ];
      }

      const stream = await chatSessionRef.current.sendMessageStream({ message: messageContent });
      setChatHistory(prev => [...prev, { role: 'model', text: '' }]);
      
      let fullText = '';
      for await (const chunk of stream) {
        const responseChunk = chunk as GenerateContentResponse;
        fullText += responseChunk.text || '';
        setChatHistory(prev => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'model') return [...prev.slice(0, -1), { ...last, text: fullText }];
          return prev;
        });
      }
    } catch (error) {
      console.error(error);
      setChatHistory(prev => [...prev, { role: 'model', text: "I'm having trouble connecting to the AI right now. Please try again." }]);
    } finally {
      setIsThinking(false);
    }
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
    <div className="min-h-screen bg-[#0e0e0e] text-[#e3e3e3] font-['Inter'] flex overflow-hidden">
      
      {/* Primary Sidebar */}
      <aside className="w-[72px] bg-[#0e0e0e] border-r border-white/5 flex flex-col items-center py-6 z-[100]">
        <div className="mb-10 text-[#4b90ff] cursor-pointer hover:scale-110 transition-transform" onClick={() => setCurrentView('home')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L2 7L12 12L22 7L12 2Z"/><path d="M2 17L12 22L22 17"/><path d="M2 12L12 17L22 12"/>
          </svg>
        </div>

        <SidebarItem 
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>} 
          label="New Workflow" 
          onClick={handleStartNewChatFlow} 
          isActive={currentView === 'select-space'}
        />

        <SidebarItem 
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>} 
          label="All History" 
          onClick={handleOpenHistory} 
          isActive={currentView === 'history'}
        />

        <SidebarItem 
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>} 
          label="Spaces" 
          onClick={handleOpenSpaces} 
          isActive={currentView === 'spaces'}
        />

        <div className="mt-auto flex flex-col items-center">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#4b90ff] to-[#ff5546] flex items-center justify-center text-[10px] font-bold text-white shadow-[0_0_20px_rgba(75,144,255,0.2)] cursor-pointer mt-4">AI</div>
        </div>
      </aside>

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
            {activeSpace.id === '1-sub' && (
              <div className="bg-[#4b90ff]/10 border border-[#4b90ff]/20 p-3 rounded-xl">
                <p className="text-[9px] font-bold text-[#4b90ff] uppercase tracking-widest mb-1">Skill Active</p>
                <p className="text-[11px] text-[#8e918f] leading-tight">I am currently applying logic from the 100-prompt training library to your inputs.</p>
              </div>
            )}
            {activeSpace.id === '4' && (
              <div className="bg-[#ff5546]/10 border border-[#ff5546]/20 p-3 rounded-xl">
                <p className="text-[9px] font-bold text-[#ff5546] uppercase tracking-widest mb-1">Live Search Mode</p>
                <p className="text-[11px] text-[#8e918f] leading-tight">Searching real-time data to generate viral hooks and lead magnets.</p>
              </div>
            )}
             {activeSpace.id === '5' && (
              <div className="bg-[#d946ef]/10 border border-[#d946ef]/20 p-3 rounded-xl">
                <p className="text-[9px] font-bold text-[#d946ef] uppercase tracking-widest mb-1">Editorial Mode</p>
                <p className="text-[11px] text-[#8e918f] leading-tight">Optimized for long-form content, SEO structure, and persuasive copywriting.</p>
              </div>
            )}
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
      <main className="flex-1 flex flex-col relative overflow-hidden">
        
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
                {activeSpace ? activeSpace.name : 'Contenaissance Workspace'}
              </span>
              {activeSpace?.id === '1-sub' && (
                <span className="text-[9px] bg-[#4b90ff] text-white px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter">Skill Mode</span>
              )}
              {activeSpace?.id === '4' && (
                <span className="text-[9px] bg-[#ff5546] text-white px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter">Live Viral</span>
              )}
               {activeSpace?.id === '5' && (
                <span className="text-[9px] bg-[#d946ef] text-white px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter">Writer Pro</span>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-4">
             {/* Pro Plan button removed */}
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-6 pt-10">
          <div className="max-w-4xl mx-auto w-full">
            
            {currentView === 'home' && (
              <div className="animate-in fade-in duration-700 py-12">
                <h1 className="text-6xl font-bold tracking-tight mb-4 bg-gradient-to-r from-[#4b90ff] via-white to-[#ff5546] bg-clip-text text-transparent">
                  Hello, I'm Anything AI.
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
                {chatHistory.length === 0 ? (
                  <div className="text-center py-24">
                    <div className="text-5xl mb-6 inline-block p-6 rounded-3xl bg-[#1e1f20] border border-white/5 animate-pulse">
                      {activeSpace?.icon}
                    </div>
                    <h2 className="text-3xl font-bold mb-3 tracking-tight">{activeSpace?.name}</h2>
                    <p className="text-[#8e918f] max-w-sm mx-auto">{activeSpace?.description}</p>
                    {activeSpace?.id === '1-sub' && (
                      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 text-left max-w-xl mx-auto">
                        <div className="p-4 bg-white/5 rounded-2xl border border-white/5 text-xs text-[#8e918f]">
                          <strong className="text-white block mb-1">Input:</strong> "Write a story about a robot"
                        </div>
                        <div className="p-4 bg-[#4b90ff]/10 rounded-2xl border border-[#4b90ff]/20 text-xs text-[#4b90ff]">
                          <strong className="text-white block mb-1">Output:</strong> "Act as a sci-fi novelist and create a haunting 1st-person narrative..."
                        </div>
                      </div>
                    )}
                     {activeSpace?.id === '4' && (
                      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 text-left max-w-xl mx-auto">
                        <div className="p-4 bg-white/5 rounded-2xl border border-white/5 text-xs text-[#8e918f]">
                          <strong className="text-white block mb-1">Input:</strong> "New Real Estate Launches in Noida"
                        </div>
                        <div className="p-4 bg-[#ff5546]/10 rounded-2xl border border-[#ff5546]/20 text-xs text-[#ff5546]">
                          <strong className="text-white block mb-1">Result:</strong> "Real estate in Noida is heating up for 2026... Comment 'Noida Launches' and I'll DM you."
                        </div>
                      </div>
                    )}
                     {activeSpace?.id === '5' && (
                      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 text-left max-w-xl mx-auto">
                        <div className="p-4 bg-white/5 rounded-2xl border border-white/5 text-xs text-[#8e918f]">
                          <strong className="text-white block mb-1">Input:</strong> "Blog post about AI trends"
                        </div>
                        <div className="p-4 bg-[#d946ef]/10 rounded-2xl border border-[#d946ef]/20 text-xs text-[#d946ef]">
                          <strong className="text-white block mb-1">Draft:</strong> "Title: The Future of AI... (Structured, SEO-optimized content)"
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-12">
                    {chatHistory.map((msg, idx) => (
                      <div key={idx} className="flex flex-col space-y-4 animate-in fade-in slide-in-from-bottom-2">
                        <div className="flex items-center space-x-3">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold ${msg.role === 'user' ? 'bg-[#3d3d3d]' : 'bg-gradient-to-tr from-[#4b90ff] to-[#ff5546]'}`}>
                            {msg.role === 'user' ? 'YOU' : 'AI'}
                          </div>
                          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#8e918f]">{msg.role === 'user' ? 'Researcher' : activeSpace?.id === '1-sub' ? 'Prompt Engineer' : activeSpace?.id === '4' ? 'Viral Strategist' : activeSpace?.id === '5' ? 'Lead Editor' : 'Contenaissance AI'}</span>
                        </div>
                        <div className="flex flex-col space-y-2 pl-10">
                          {msg.image && (
                            <div className="max-w-sm rounded-xl overflow-hidden border border-white/10 mb-2">
                              <img src={msg.image} alt="User Upload" className="w-full h-auto" />
                            </div>
                          )}
                          <div className={`text-lg leading-relaxed whitespace-pre-wrap border-l border-white/5 pl-4 ${activeSpace?.id === '1-sub' && msg.role === 'model' ? 'text-[#4b90ff] font-medium' : activeSpace?.id === '4' && msg.role === 'model' ? 'text-[#ff5546] font-medium' : 'text-[#e3e3e3]'}`}>
                            {msg.text}
                          </div>
                        </div>
                      </div>
                    ))}
                    {isThinking && (
                      <div className="flex items-center space-x-3 text-[#8e918f] pl-10">
                        <div className="w-1.5 h-1.5 bg-[#4b90ff] rounded-full animate-bounce"></div>
                        <div className="w-1.5 h-1.5 bg-[#4b90ff] rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                        <div className="w-1.5 h-1.5 bg-[#4b90ff] rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                )}
              </div>
            )}

            {currentView === 'history' && (
              <div className="animate-in fade-in slide-in-from-bottom-6 duration-700">
                <div className="flex items-center justify-between mb-10">
                  <h2 className="text-4xl font-bold font-['Sora'] text-white">Consolidated History</h2>
                  <button onClick={() => setSessions([])} className="text-xs font-bold uppercase tracking-widest text-red-500/50 hover:text-red-500 transition-colors">Wipe History</button>
                </div>
                
                <div className="space-y-16">
                  {spacesList.map(space => {
                    const spaceSessions = sessions.filter(s => s.spaceId === space.id).sort((a, b) => b.lastUpdated - a.lastUpdated);
                    if (spaceSessions.length === 0) return null;
                    return (
                      <div key={space.id} className="space-y-6">
                        <div className="flex items-center space-x-3 border-b border-white/5 pb-3">
                          <span className="text-2xl">{space.icon}</span>
                          <span className="text-sm font-bold uppercase tracking-[0.3em] text-[#8e918f]">{space.name}</span>
                          <span className="text-[10px] bg-[#1e1f20] px-2 py-0.5 rounded text-[#4b90ff]">{spaceSessions.length} Sessions</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {spaceSessions.map(session => (
                            <div 
                              key={session.id} 
                              onClick={() => resumeSession(session)}
                              className="group p-6 rounded-3xl border border-white/5 bg-[#1e1f20] hover:bg-[#282a2c] transition-all cursor-pointer flex items-center justify-between"
                            >
                              <div className="flex flex-col truncate pr-4">
                                <h4 className="font-bold text-white group-hover:text-[#4b90ff] transition-colors truncate">{session.title}</h4>
                                <p className="text-[10px] text-[#8e918f] uppercase tracking-widest mt-1">
                                  {new Date(session.lastUpdated).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                              <button onClick={(e) => deleteSession(e, session.id)} className="opacity-0 group-hover:opacity-100 p-2 hover:text-red-500 transition-all">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {currentView === 'spaces' && (
              <div className="animate-in fade-in slide-in-from-bottom-6 duration-700 mt-8">
                <h2 className="text-4xl font-bold font-['Sora'] mb-10 text-white tracking-tight">Ecosystem Architecture</h2>
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
                <h2 className="text-4xl font-bold font-['Sora'] mb-4 text-white">Initialize Session</h2>
                <p className="text-[#8e918f] mb-12 max-w-sm">Choose the cognitive environment for your next creative flow.</p>
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
                          <span className="text-[10px] text-[#8e918f] uppercase tracking-widest">{space.id === '1-sub' ? 'Specialized Skill' : activeSpace?.id === '4' ? 'Live Agent' : activeSpace?.id === '5' ? 'Writer' : 'Context Space'}</span>
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
              
              <div className={`relative flex items-center bg-[#1e1f20] rounded-[2rem] border transition-all p-2 pr-5 pl-7 shadow-2xl ${activeSpace?.id === '1-sub' ? 'border-[#4b90ff]/50 focus-within:border-[#4b90ff]' : activeSpace?.id === '4' ? 'border-[#ff5546]/50 focus-within:border-[#ff5546]' : activeSpace?.id === '5' ? 'border-[#d946ef]/50 focus-within:border-[#d946ef]' : 'border-white/5 focus-within:border-white/20'}`}>
                <textarea 
                  rows={1} value={inputValue} onKeyDown={handleKeyPress} onChange={(e) => setInputValue(e.target.value)}
                  placeholder={activeSpace?.id === '1-sub' ? "Describe the prompt you need..." : activeSpace?.id === '4' ? "Search for viral trends..." : activeSpace?.id === '5' ? "Topic for article or copy..." : activeSpace ? `Message in ${activeSpace.name}...` : "Choose a space to start..."}
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
                    <button onClick={() => handleSendText()} className="p-3 bg-white text-black rounded-2xl transition-all hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.15)]">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>
                    </button>
                  )}
                </div>
              </div>
              {activeSpace?.id === '1-sub' && (
                <div className="flex items-center justify-center space-x-4 mt-3 animate-in fade-in slide-in-from-top-1">
                   <span className="text-[10px] font-bold text-[#4b90ff] uppercase tracking-[0.3em]">Skill Mode Active</span>
                   <div className="w-1 h-1 bg-white/20 rounded-full"></div>
                   <span className="text-[10px] font-bold text-[#8e918f] uppercase tracking-[0.2em]">100 Expert Templates Loaded</span>
                </div>
              )}
               {activeSpace?.id === '4' && (
                <div className="flex items-center justify-center space-x-4 mt-3 animate-in fade-in slide-in-from-top-1">
                   <span className="text-[10px] font-bold text-[#ff5546] uppercase tracking-[0.3em]">Viral Agent Active</span>
                   <div className="w-1 h-1 bg-white/20 rounded-full"></div>
                   <span className="text-[10px] font-bold text-[#8e918f] uppercase tracking-[0.2em]">Real-time Search Enabled</span>
                </div>
              )}
               {activeSpace?.id === '5' && (
                <div className="flex items-center justify-center space-x-4 mt-3 animate-in fade-in slide-in-from-top-1">
                   <span className="text-[10px] font-bold text-[#d946ef] uppercase tracking-[0.3em]">Editorial Engine</span>
                   <div className="w-1 h-1 bg-white/20 rounded-full"></div>
                   <span className="text-[10px] font-bold text-[#8e918f] uppercase tracking-[0.2em]">SEO & Formatting Active</span>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

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
