import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface SearchStep {
  id: string;
  text: string;
  status: 'pending' | 'active' | 'complete';
  queries?: string[];
}

export interface SearchSource {
  id: string;
  title: string;
  url: string;
  domain: string;
  favicon?: string;
}

interface SearchAnimationProps {
  isSearching: boolean;
  steps: SearchStep[];
  sources: SearchSource[];
  query: string;
}

const PulsingDot: React.FC<{ color?: string }> = ({ color = '#4b90ff' }) => (
  <motion.div
    className="w-2 h-2 rounded-full"
    style={{ backgroundColor: color }}
    animate={{
      scale: [1, 1.3, 1],
      opacity: [1, 0.7, 1],
    }}
    transition={{
      duration: 1.5,
      repeat: Infinity,
      ease: "easeInOut",
    }}
  />
);

const SearchQueryPill: React.FC<{ query: string; index: number }> = ({ query, index }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.8, y: 10 }}
    animate={{ opacity: 1, scale: 1, y: 0 }}
    transition={{ delay: index * 0.1, duration: 0.3 }}
    className="inline-flex items-center gap-2 px-4 py-2 bg-[#1e1f20] border border-white/10 rounded-full text-sm text-[#8e918f]"
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#4b90ff]">
      <circle cx="11" cy="11" r="8"/>
      <path d="m21 21-4.35-4.35"/>
    </svg>
    <span className="truncate max-w-[280px]">{query}</span>
  </motion.div>
);

const StepIndicator: React.FC<{ step: SearchStep; index: number }> = ({ step, index }) => {
  const getStatusColor = () => {
    switch (step.status) {
      case 'active': return '#4b90ff';
      case 'complete': return '#22c55e';
      default: return '#444746';
    }
  };

  const getStatusIcon = () => {
    if (step.status === 'complete') {
      return (
        <motion.svg 
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3"
        >
          <path d="M20 6L9 17l-5-5"/>
        </motion.svg>
      );
    }
    if (step.status === 'active') {
      return <PulsingDot color="#4b90ff" />;
    }
    return <div className="w-2 h-2 rounded-full bg-[#444746]" />;
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.15, duration: 0.4 }}
      className="flex items-start gap-3"
    >
      <div className="mt-1.5 flex items-center justify-center w-4 h-4">
        {getStatusIcon()}
      </div>
      <div className="flex-1">
        <motion.p 
          className="text-[#e3e3e3] text-sm"
          animate={{ 
            color: step.status === 'active' ? '#e3e3e3' : step.status === 'complete' ? '#8e918f' : '#444746'
          }}
        >
          {step.text}
        </motion.p>
        
        {/* Search Queries Pills */}
        {step.queries && step.queries.length > 0 && step.status !== 'pending' && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="flex flex-wrap gap-2 mt-3"
          >
            {step.queries.map((query, qIndex) => (
              <SearchQueryPill key={qIndex} query={query} index={qIndex} />
            ))}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

const SourceCard: React.FC<{ source: SearchSource; index: number }> = ({ source, index }) => {
  const getFaviconUrl = (domain: string) => {
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  };

  // Check if it's YouTube
  const isYouTube = source.domain.toLowerCase().includes('youtube') || source.domain.toLowerCase().includes('youtu.be');

  return (
    <motion.a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, scale: 0.8, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ 
        delay: index * 0.08, 
        duration: 0.4,
        type: "spring",
        stiffness: 200,
        damping: 20
      }}
      whileHover={{ scale: 1.02, y: -2 }}
      className="group flex items-start gap-3 p-3 bg-[#1e1f20] border border-white/5 rounded-xl hover:border-[#4b90ff]/30 hover:shadow-[0_0_20px_rgba(75,144,255,0.1)] transition-all cursor-pointer min-w-[260px] max-w-[300px]"
    >
      <div className="w-7 h-7 rounded-lg bg-[#282a2c] flex items-center justify-center overflow-hidden shrink-0">
        {isYouTube ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#FF0000">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
        ) : (
          <img 
            src={source.favicon || getFaviconUrl(source.domain)} 
            alt="" 
            className="w-5 h-5"
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%234b90ff"><circle cx="12" cy="12" r="10"/></svg>';
            }}
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-[#4b90ff] mb-0.5 truncate font-medium">{source.domain}</p>
        <p className="text-xs text-[#e3e3e3] line-clamp-2 group-hover:text-white transition-colors leading-relaxed">
          {source.title}
        </p>
      </div>
    </motion.a>
  );
};

export const SourceGrid: React.FC<{ sources: SearchSource[]; isVisible: boolean }> = ({ sources, isVisible }) => {
  if (!isVisible || sources.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mt-4"
    >
      <motion.p 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-xs font-medium text-[#22c55e] uppercase tracking-wider mb-3 flex items-center gap-2"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        Reviewing sources ({sources.length})
      </motion.p>
      
      <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
        <AnimatePresence>
          {sources.map((source, index) => (
            <SourceCard key={source.id} source={source} index={index} />
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

const SearchAnimation: React.FC<SearchAnimationProps> = ({ 
  isSearching, 
  steps, 
  sources,
  query 
}) => {
  if (!isSearching && steps.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="bg-[#161617] border border-white/5 rounded-3xl p-6 mb-6"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <motion.div
          animate={{ rotate: isSearching ? 360 : 0 }}
          transition={{ duration: 2, repeat: isSearching ? Infinity : 0, ease: "linear" }}
          className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#4b90ff] to-[#ff5546] flex items-center justify-center"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
          </svg>
        </motion.div>
        <div>
          <h3 className="text-lg font-semibold text-white">
            {sources.length > 0 ? 'Researching & Writing' : 'Thinking'}
          </h3>
          {query && (
            <p className="text-sm text-[#8e918f] mt-0.5">
              {sources.length > 0 
                ? `Found ${sources.length} sources • Writing answer...`
                : `Researching: ${query.length > 50 ? query.slice(0, 50) + '...' : query}`
              }
            </p>
          )}
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-4 mb-4">
        <AnimatePresence>
          {steps.map((step, index) => (
            <StepIndicator key={step.id} step={step} index={index} />
          ))}
        </AnimatePresence>
      </div>

      {/* Sources */}
      <SourceGrid sources={sources} isVisible={sources.length > 0} />
    </motion.div>
  );
};

export default SearchAnimation;
