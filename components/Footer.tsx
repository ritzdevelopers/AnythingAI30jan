
import React from 'react';

const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="py-20 px-6 md:px-12 bg-[#0a0a0a]">
      <div className="max-w-[1200px] mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-center space-y-8 md:space-y-0">
          <div className="space-y-4 text-center md:text-left">
            <a href="#" className="inline-flex items-center space-x-2">
              <div className="w-6 h-6 border-2 border-white flex items-center justify-center">
                <span className="text-white text-[10px] font-bold">C</span>
              </div>
              <span className="text-lg font-semibold tracking-tighter uppercase">Contenaissance</span>
            </a>
            <p className="text-white/30 text-sm max-w-xs leading-relaxed">
              Synthesizing cinematic creativity with machine intelligence. 
            </p>
          </div>

          <div className="flex items-center space-x-12">
            <a href="#" className="text-sm font-medium text-white/50 hover:text-white transition-colors">X / Twitter</a>
            <a href="#" className="text-sm font-medium text-white/50 hover:text-white transition-colors">LinkedIn</a>
            <a href="#" className="text-sm font-medium text-white/50 hover:text-white transition-colors">Instagram</a>
          </div>
        </div>

        <div className="mt-20 pt-10 border-t border-white/5 flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0 text-[10px] font-bold uppercase tracking-[0.2em] text-white/20">
          <p>© {currentYear} Contenaissance Agency. All rights reserved.</p>
          <div className="flex space-x-8">
            <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
