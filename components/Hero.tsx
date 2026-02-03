
import React from 'react';

const Hero: React.FC = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden py-32">
      {/* Background Animated Elements */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#00d9ff]/10 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute top-[20%] right-[10%] w-[400px] h-[400px] bg-white/5 rounded-full blur-[100px]"></div>
        
        {/* Animated Particles/Dots */}
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#ffffff 0.5px, transparent 0.5px)', backgroundSize: '40px 40px' }}></div>
        
        {/* Floating Geometric Shapes (3D Depth) */}
        <div className="absolute top-1/4 left-10 w-24 h-24 border border-white/10 rotate-12 animate-bounce-slow"></div>
        <div className="absolute bottom-1/4 right-20 w-32 h-32 border border-[#00d9ff]/20 -rotate-12 animate-float"></div>
      </div>

      <div className="relative z-10 max-w-[1200px] mx-auto px-6 md:px-12 text-center md:text-left grid lg:grid-cols-2 gap-12 items-center">
        <div className="space-y-8">
          <div className="inline-flex items-center space-x-3 px-4 py-2 bg-white/5 border border-white/10 rounded-full animate-fade-in-up">
            <span className="w-2 h-2 rounded-full bg-[#00d9ff] animate-ping"></span>
            <span className="text-xs font-semibold tracking-widest uppercase text-white/50">Next Gen AI Creative</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight leading-[1.1] animate-fade-in-up delay-100">
            AI-Powered <br /> 
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-[#00d9ff]/80">
              Brand Evolution.
            </span>
          </h1>
          
          <p className="max-w-xl text-lg md:text-xl text-white/60 leading-relaxed font-light animate-fade-in-up delay-200">
            We fuse cinematic artistry with cutting-edge AI technology to build brands that define the future. High-end films, custom dev, and intelligent automation.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-6 animate-fade-in-up delay-300">
            <button className="w-full sm:w-auto px-10 py-4 bg-white text-black font-semibold rounded-full hover:bg-[#00d9ff] hover:shadow-[0_0_30px_rgba(0,217,255,0.3)] transition-all duration-500 transform hover:-translate-y-1">
              Explore Our Work
            </button>
            <button className="w-full sm:w-auto px-10 py-4 border border-white/20 text-white font-semibold rounded-full hover:bg-white/5 transition-all duration-300 group">
              Start Your Journey 
              <span className="inline-block transition-transform group-hover:translate-x-1 ml-2">→</span>
            </button>
          </div>
        </div>

        {/* Hero Visual - Abstract 3D Cube/Tech element */}
        <div className="hidden lg:block relative perspective-[1000px] animate-fade-in delay-500">
          <div className="relative w-[500px] h-[500px] mx-auto">
            {/* Glass Box Effect */}
            <div className="absolute inset-0 border border-white/10 bg-white/5 backdrop-blur-[2px] rounded-2xl transform rotate-y-[-10deg] rotate-x-[5deg] shadow-2xl flex items-center justify-center group overflow-hidden">
               <div className="w-64 h-64 border-[3px] border-[#00d9ff] rounded-xl transform rotate-45 group-hover:scale-110 transition-transform duration-1000"></div>
               <div className="absolute w-64 h-64 border border-white/20 rounded-xl transform -rotate-12 group-hover:rotate-12 transition-transform duration-1000"></div>
               <div className="absolute inset-0 bg-gradient-to-tr from-[#00d9ff]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
            </div>
            {/* Orbiting Elements */}
            <div className="absolute -top-10 -right-10 w-24 h-24 bg-[#0a0a0a] border border-white/10 rounded-xl flex items-center justify-center animate-bounce-slow">
              <span className="text-[#00d9ff] font-bold text-xl">AI</span>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0) rotate(-12deg); }
          50% { transform: translateY(-20px) rotate(-8deg); }
        }
        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0) rotate(12deg); }
          50% { transform: translateY(-15px) rotate(16deg); }
        }
        .animate-float { animation: float 6s ease-in-out infinite; }
        .animate-bounce-slow { animation: bounce-slow 8s ease-in-out infinite; }
        .animate-fade-in-up { animation: fadeInUp 1s ease-out forwards; opacity: 0; }
        .animate-fade-in { animation: fadeIn 1.5s ease-out forwards; opacity: 0; }
        
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .delay-100 { animation-delay: 0.1s; }
        .delay-200 { animation-delay: 0.2s; }
        .delay-300 { animation-delay: 0.3s; }
        .delay-500 { animation-delay: 0.5s; }
      `}</style>
    </section>
  );
};

export default Hero;
