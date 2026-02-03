
import React from 'react';

const services = [
  {
    title: 'AI Brand Films',
    description: 'Cinematic storytelling powered by artificial intelligence. We create hyper-realistic visuals and narratives that traditional filming can\'t reach.',
    icon: (
      <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    ),
    accent: 'bg-[#00d9ff]/10',
    borderColor: 'group-hover:border-[#00d9ff]/50'
  },
  {
    title: 'AI Development',
    description: 'Custom AI solutions tailored to your business needs. From LLM integrations to proprietary visual models that scale with your vision.',
    icon: (
      <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
    accent: 'bg-white/5',
    borderColor: 'group-hover:border-white/50'
  },
  {
    title: 'AI Automation',
    description: 'Streamline operations with intelligent automation. We build the infrastructure that lets your brand run itself at maximum efficiency.',
    icon: (
      <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    accent: 'bg-white/5',
    borderColor: 'group-hover:border-[#00d9ff]/50'
  }
];

const Services: React.FC = () => {
  return (
    <section id="services" className="py-32 px-6 md:px-12 bg-[#0a0a0a]">
      <div className="max-w-[1200px] mx-auto">
        <div className="mb-24 text-center space-y-4">
          <h4 className="text-[#00d9ff] text-sm font-bold tracking-[0.3em] uppercase">What We Do</h4>
          <h2 className="text-4xl md:text-6xl font-bold tracking-tight">Capabilities Redefined</h2>
          <p className="max-w-2xl mx-auto text-white/50 text-lg font-light leading-relaxed">
            Bridging the gap between creative imagination and technological execution through the lens of artificial intelligence.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {services.map((service, idx) => (
            <div 
              key={service.title}
              className={`group relative p-10 bg-[#111] border border-white/5 rounded-3xl transition-all duration-500 hover:-translate-y-4 hover:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)] perspective-[1000px] overflow-hidden ${service.borderColor}`}
            >
              {/* Background Glow */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <div className={`absolute top-0 right-0 w-32 h-32 blur-[60px] rounded-full transition-opacity duration-500 opacity-0 group-hover:opacity-40 ${service.accent}`}></div>

              <div className="relative z-10 space-y-8">
                <div className="w-16 h-16 flex items-center justify-center rounded-2xl bg-[#0a0a0a] border border-white/10 text-white transition-all duration-500 group-hover:scale-110 group-hover:border-[#00d9ff] group-hover:text-[#00d9ff] group-hover:shadow-[0_0_20px_rgba(0,217,255,0.2)]">
                  {service.icon}
                </div>
                
                <div className="space-y-4">
                  <h3 className="text-2xl font-bold tracking-tight group-hover:text-white transition-colors">{service.title}</h3>
                  <p className="text-white/50 leading-relaxed text-sm transition-colors group-hover:text-white/80">
                    {service.description}
                  </p>
                </div>

                <div className="pt-4 overflow-hidden">
                  <a href="#" className="inline-flex items-center text-xs font-bold uppercase tracking-widest text-[#00d9ff] translate-y-10 group-hover:translate-y-0 transition-transform duration-500">
                    View Case Study <span className="ml-2">→</span>
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Services;
