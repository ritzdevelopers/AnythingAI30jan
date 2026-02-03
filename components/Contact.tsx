
import React from 'react';

const Contact: React.FC = () => {
  return (
    <section id="contact" className="py-32 px-6 md:px-12 relative">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[1200px] h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
      
      <div className="max-w-[1200px] mx-auto grid lg:grid-cols-2 gap-20 items-center">
        <div className="space-y-10">
          <div className="space-y-6">
            <h4 className="text-[#00d9ff] text-sm font-bold tracking-[0.3em] uppercase">Get In Touch</h4>
            <h2 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight">
              Ready to <br /> Scale with AI?
            </h2>
            <p className="text-white/50 text-lg leading-relaxed max-w-md">
              Whether you need a cinematic brand film or a full-scale AI automation infrastructure, our team is ready to deploy.
            </p>
          </div>

          <div className="space-y-6">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[#00d9ff]">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-bold text-white/30 uppercase tracking-widest">Email Us</p>
                <p className="text-white font-medium">info@ritzmediaworld.com</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[#00d9ff]">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-bold text-white/30 uppercase tracking-widest">Studio</p>
                <p className="text-white font-medium">402, 404, 4th floor Corporate Park, Tower A1 Sector 142, Noida, UK</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative group">
          {/* Glass Card Background */}
          <div className="absolute -inset-1 bg-gradient-to-r from-white/20 to-[#00d9ff]/20 rounded-3xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
          
          <div className="relative bg-[#111] border border-white/10 p-8 md:p-12 rounded-3xl backdrop-blur-xl shadow-2xl">
            <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/50 uppercase tracking-wider ml-1">Name</label>
                  <input 
                    type="text" 
                    placeholder="Akash Singh"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#00d9ff] focus:outline-none focus:ring-1 focus:ring-[#00d9ff] transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/50 uppercase tracking-wider ml-1">Company</label>
                  <input 
                    type="text" 
                    placeholder="HighTech AI"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#00d9ff] focus:outline-none focus:ring-1 focus:ring-[#00d9ff] transition-all"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-xs font-bold text-white/50 uppercase tracking-wider ml-1">Email</label>
                <input 
                  type="email" 
                  placeholder="Akashsingh@example.com"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#00d9ff] focus:outline-none focus:ring-1 focus:ring-[#00d9ff] transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-white/50 uppercase tracking-wider ml-1">Project Details</label>
                <textarea 
                  rows={4}
                  placeholder="Tell us about your AI vision..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#00d9ff] focus:outline-none focus:ring-1 focus:ring-[#00d9ff] transition-all resize-none"
                ></textarea>
              </div>

              <button className="w-full py-4 bg-white text-black font-bold rounded-xl hover:bg-[#00d9ff] hover:shadow-[0_0_20px_rgba(0,217,255,0.4)] transition-all duration-500 transform hover:-translate-y-1">
                Send Transmission
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Contact;
