
import React, { useState, useEffect } from 'react';

const Navbar: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { name: 'Work', href: '#' },
    { name: 'Services', href: '#services' },
    { name: 'About', href: '#' },
    { name: 'Contact', href: '#contact' },
  ];

  return (
    <nav 
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 py-4 md:py-6 ${
        scrolled ? 'bg-[#0a0a0a]/80 backdrop-blur-md border-b border-white/5' : 'bg-transparent'
      }`}
    >
      <div className="max-w-[1200px] mx-auto px-6 md:px-12 flex justify-between items-center">
        <a href="#" className="group flex items-center space-x-2">
          <div className="w-8 h-8 border-2 border-white flex items-center justify-center transition-all duration-300 group-hover:border-[#00d9ff] group-hover:rotate-45">
            <span className="text-white text-xs font-bold -rotate-45 group-hover:text-[#00d9ff]">C</span>
          </div>
          <span className="text-lg font-semibold tracking-tighter uppercase transition-colors group-hover:text-[#00d9ff]">Contenaissance</span>
        </a>

        <div className="hidden md:flex items-center space-x-12">
          {navLinks.map((link) => (
            <a
              key={link.name}
              href={link.href}
              className="relative text-sm font-medium tracking-wide text-white/70 hover:text-white transition-colors py-1 group overflow-hidden"
            >
              {link.name}
              <span className="absolute bottom-0 left-0 w-full h-[1px] bg-[#00d9ff] translate-x-[-101%] group-hover:translate-x-0 transition-transform duration-300"></span>
            </a>
          ))}
          <a
            href="#contact"
            className="px-6 py-2 border border-white/20 text-sm font-medium hover:border-[#00d9ff] hover:text-[#00d9ff] transition-all duration-300 rounded-full"
          >
            Start a Project
          </a>
        </div>

        {/* Mobile toggle - simple implementation for visual purposes */}
        <button className="md:hidden text-white">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
          </svg>
        </button>
      </div>
    </nav>
  );
};

export default Navbar;
