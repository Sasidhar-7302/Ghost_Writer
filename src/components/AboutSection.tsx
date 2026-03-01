import React, { useState, useEffect } from 'react';
import {
    Github, Twitter, Shield, Cpu, Database,
    Heart, Linkedin, Instagram, Mail, MicOff, Star, Bug
} from 'lucide-react';
import evinProfile from './icon.ico';

interface AboutSectionProps { }

export const AboutSection: React.FC<AboutSectionProps> = () => {
    const [copied, setCopied] = useState(false);

    const handleOpenLink = (e: React.MouseEvent<HTMLAnchorElement>, url: string) => {
        e.preventDefault();
        if (window.electronAPI?.invoke) {
            window.electronAPI.invoke('open-external', url);
        } else {
            window.open(url, '_blank');
        }
    };

    const handleCopyEmail = () => {
        navigator.clipboard.writeText("yepurisasi@gmail.com");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="space-y-8 animated fadeIn pb-10 max-w-2xl mx-auto">
            {/* 1. Production Header */}
            <div className="flex flex-col items-center transition-all duration-700 pt-4">
                <div className="w-20 h-20 mb-6 group cursor-default flex items-center justify-center">
                    <img src={evinProfile} alt="Ghost Writer Logo" className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6 drop-shadow-[0_0_15px_rgba(255,255,255,0.15)]" />
                </div>
                <h1 className="text-2xl font-bold text-text-primary tracking-tight mb-2">Ghost Writer v2.0.0</h1>
                <div className="flex items-center gap-2 mb-6">
                    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-black text-[9px] font-black uppercase tracking-[0.2em] shadow-[0_0_20px_rgba(255,255,255,0.3)]">
                        <div className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
                        Production Stable
                    </span>
                    <span className="px-3 py-1 rounded-full bg-white/5 text-text-tertiary text-[9px] font-bold border border-white/5 uppercase tracking-widest">
                        v2.0.0.5192
                    </span>
                </div>
                <p className="text-center text-text-secondary text-sm leading-relaxed max-w-md">
                    The invisible intelligent layer for modern professionals. Designed for privacy, speed, and deep contextual awareness.
                </p>
            </div>

            {/* 2. Core Pillars (Grid) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white/[0.03] backdrop-blur-3xl border border-white/5 rounded-2xl p-6 hover:bg-white/5 hover:border-white/10 transition-all duration-500 group">
                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-text-tertiary mb-4 border border-white/5 shadow-sm group-hover:text-text-primary group-hover:bg-white/10 transition-all">
                        <Shield size={20} />
                    </div>
                    <h3 className="text-xs font-black text-text-primary uppercase tracking-widest mb-2">Privacy Core</h3>
                    <p className="text-[11px] text-text-tertiary leading-relaxed font-medium">
                        Zero-persistence transient memory. Your data never leaves your secure local environment.
                    </p>
                </div>
                <div className="bg-white/[0.03] backdrop-blur-3xl border border-white/5 rounded-2xl p-6 hover:bg-white/5 hover:border-white/10 transition-all duration-500 group">
                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-text-tertiary mb-4 border border-white/5 shadow-sm group-hover:text-text-primary group-hover:bg-white/10 transition-all">
                        <Cpu size={20} />
                    </div>
                    <h3 className="text-xs font-black text-text-primary uppercase tracking-widest mb-2">Hybrid Compute</h3>
                    <p className="text-[11px] text-text-tertiary leading-relaxed font-medium">
                        Optimized routing across local Whisper and high-performance cloud intelligence.
                    </p>
                </div>
            </div>

            {/* 3. Community & Developer */}
            <div className="bg-[var(--bg-card-alpha)] backdrop-blur-xl border border-border-subtle rounded-2xl overflow-hidden shadow-sm">
                <div className="p-6 border-b border-border-subtle">
                    <div className="flex items-start gap-5">
                        <div className="w-14 h-14 rounded-full bg-[var(--bg-glass)] backdrop-blur-md border border-border-subtle flex items-center justify-center overflow-hidden shrink-0 shadow-xl">
                            <img src={evinProfile} alt="Sasidhar Yepuri" className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center justify-between mb-2">
                                <div>
                                    <h4 className="text-sm font-bold text-text-primary">Sasidhar Yepuri</h4>
                                    <p className="text-[10px] text-text-tertiary">Founder & Lead Architect</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button onClick={(e) => handleOpenLink(e as any, "https://github.com/Sasidhar-7302")} className="text-text-tertiary hover:text-text-primary transition-colors"><Github size={16} /></button>
                                    <button onClick={(e) => handleOpenLink(e as any, "https://www.linkedin.com/in/sasidharyepuri")} className="text-text-tertiary hover:text-text-primary transition-colors"><Linkedin size={16} /></button>
                                </div>
                            </div>
                            <p className="text-xs text-text-secondary leading-relaxed">
                                Building the future of human-AI collaboration. Ghost Writer is open-source and community driven.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 divide-x divide-border-subtle">
                    <button
                        onClick={(e) => handleOpenLink(e as any, "https://github.com/Sasidhar-7302/Ghost_Writer")}
                        className="p-4 flex flex-col items-center justify-center gap-2 hover:bg-accent-primary/5 transition-colors group"
                    >
                        <Star size={16} className="text-yellow-500 group-hover:fill-current" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary group-hover:text-text-primary">Star Repo</span>
                    </button>
                    <button
                        onClick={handleCopyEmail}
                        className="p-4 flex flex-col items-center justify-center gap-2 hover:bg-accent-primary/5 transition-all active:scale-95 group cursor-pointer"
                        title="Click to copy email"
                    >
                        <Mail size={16} className={`transition-colors duration-300 ${copied ? 'text-emerald-400' : 'text-text-primary'}`} />
                        <div className="flex flex-col items-center">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary group-hover:text-text-primary transition-colors">
                                {copied ? 'Copied!' : 'Contact'}
                            </span>
                            <span className="text-[10px] text-text-primary font-medium">{copied ? 'yepurisasi@gmail.com' : 'yepurisasi@gmail.com'}</span>
                        </div>
                    </button>
                </div>
            </div>

            {/* 4. Support & Contributions */}
            <div className="bg-white/5 backdrop-blur-3xl border border-white/5 rounded-2xl p-6 flex items-center justify-between shadow-2xl relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-r from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                <div className="flex items-center gap-4 relative z-10">
                    <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-text-tertiary border border-white/10">
                        <Heart size={20} />
                    </div>
                    <div>
                        <h4 className="text-xs font-black text-text-primary uppercase tracking-widest">Founder Support</h4>
                        <p className="text-[10px] text-text-tertiary mt-1 max-w-[200px] font-medium">Empower independent development through direct contributions.</p>
                    </div>
                </div>
                <button
                    onClick={(e) => handleOpenLink(e as any, "https://paypal.me/sasidhar7302")}
                    className="px-6 py-2.5 bg-white text-black rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white/90 transition-all shadow-[0_10px_30px_-10px_rgba(255,255,255,0.4)] active:scale-95 relative z-10"
                >
                    Back Project
                </button>
            </div>

            {/* 5. Production Footer */}
            <div className="flex flex-col items-center gap-4 pt-6 opacity-60">
                <div className="flex items-center gap-6">
                    <button className="text-[10px] font-bold uppercase tracking-widest text-text-secondary hover:text-text-primary transition-colors">Privacy Policy</button>
                    <button className="text-[10px] font-bold uppercase tracking-widest text-text-secondary hover:text-text-primary transition-colors">Terms of Service</button>
                    <button className="text-[10px] font-bold uppercase tracking-widest text-text-secondary hover:text-text-primary transition-colors">Legal</button>
                </div>
                <p className="text-[9px] font-medium tracking-tight text-text-tertiary">© {new Date().getFullYear()} Ghost Writer. All rights reserved.</p>
            </div>
        </div>
    );
};
