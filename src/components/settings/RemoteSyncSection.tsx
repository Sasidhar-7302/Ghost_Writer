import React, { useState, useEffect } from 'react';
import { Monitor, RefreshCw, ExternalLink, ShieldCheck, Wifi, Smartphone, Info, Copy, Check } from 'lucide-react';
import { motion } from 'framer-motion';

export const RemoteSyncSection: React.FC = () => {
    const [url, setUrl] = useState<string>('');
    const [pin, setPin] = useState<string>('0000');
    const [isLoading, setIsLoading] = useState(true);
    const [isRestarting, setIsRestarting] = useState(false);
    const [copied, setCopied] = useState(false);
    const [isSavingPin, setIsSavingPin] = useState(false);

    const loadData = async () => {
        setIsLoading(true);
        try {
            if (window.electronAPI?.getRemoteDisplayUrl) {
                const res = await window.electronAPI.getRemoteDisplayUrl();
                setUrl(res.url);
            }
            if (window.electronAPI?.getRemoteDisplayPin) {
                const savedPin = await window.electronAPI.getRemoteDisplayPin();
                setPin(savedPin);
            }
        } catch (error) {
            console.error('Failed to load remote display data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleRestart = async () => {
        setIsRestarting(true);
        try {
            if (window.electronAPI?.restartRemoteServer) {
                const res = await window.electronAPI.restartRemoteServer();
                setUrl(res.url);
            }
        } catch (error) {
            console.error('Failed to restart remote server:', error);
        } finally {
            setTimeout(() => setIsRestarting(false), 1000);
        }
    };

    const handleSavePin = async (newPin: string) => {
        setPin(newPin);
        if (newPin.length === 4) {
            setIsSavingPin(true);
            try {
                if (window.electronAPI?.setRemoteDisplayPin) {
                    await window.electronAPI.setRemoteDisplayPin(newPin);
                }
            } catch (error) {
                console.error('Failed to save PIN:', error);
            } finally {
                setTimeout(() => setIsSavingPin(false), 500);
            }
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const qrUrl = url ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}` : '';

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-text-primary">
                    <Smartphone size={20} className="text-accent-primary" />
                    <h2 className="text-xl font-bold tracking-tight">Stealth Remote Display</h2>
                </div>
                <p className="text-sm text-text-tertiary">
                    Bypass screen-overlay detection by viewing AI answers on your mobile device.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* QR Code Card */}
                <div className="bg-bg-card border border-border-subtle rounded-2xl p-6 flex flex-col items-center justify-center gap-4 shadow-sm">
                    <div className="relative group">
                        <div className="absolute -inset-4 bg-accent-primary/5 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        <div className="relative bg-white p-4 rounded-xl shadow-lg">
                            {isLoading ? (
                                <div className="w-[160px] h-[160px] flex items-center justify-center bg-gray-50 rounded-lg">
                                    <RefreshCw className="w-8 h-8 text-accent-primary animate-spin" />
                                </div>
                            ) : url ? (
                                <img src={qrUrl} alt="QR Code" className="w-[160px] h-[160px] block" />
                            ) : (
                                <div className="w-[160px] h-[160px] flex items-center justify-center bg-gray-100 rounded-lg text-text-tertiary">
                                    No Connection
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="text-center space-y-1">
                        <p className="text-sm font-semibold text-text-primary">Scan to Connect</p>
                        <p className="text-[11px] text-text-tertiary">Point your phone camera here</p>
                    </div>
                </div>

                {/* Connection Details Card */}
                <div className="bg-bg-card border border-border-subtle rounded-2xl p-6 flex flex-col gap-5 shadow-sm">
                    <div className="space-y-4">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest">Local Network URL</label>
                            <div className="flex gap-2">
                                <div className="flex-1 bg-bg-input border border-border-subtle rounded-xl px-4 py-3 text-xs font-mono text-text-secondary truncate flex items-center">
                                    {isLoading ? 'Loading...' : url || 'Not available'}
                                </div>
                                <button
                                    onClick={copyToClipboard}
                                    className="p-3 bg-bg-input border border-border-subtle rounded-xl text-text-tertiary hover:text-text-primary transition-colors active:scale-95"
                                    title="Copy URL"
                                >
                                    {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest flex items-center gap-2">
                                Remote Access PIN
                                {isSavingPin && <Smartphone size={10} className="animate-pulse text-accent-primary" />}
                            </label>
                            <div className="relative group/pin">
                                <input
                                    type="text"
                                    maxLength={4}
                                    value={pin}
                                    onChange={(e) => handleSavePin(e.target.value.replace(/\D/g, ''))}
                                    className="w-full bg-bg-input border border-border-subtle rounded-xl px-4 py-3 text-sm font-mono tracking-[0.5em] text-accent-primary focus:border-accent-primary focus:ring-1 focus:ring-accent-primary outline-none transition-all"
                                    placeholder="0000"
                                />
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-text-tertiary group-focus-within/pin:text-accent-primary transition-colors">
                                    4 DIGITS
                                </div>
                            </div>
                            <p className="text-[9px] text-text-tertiary italic">Mandatory code to unlock the mobile viewer session.</p>
                        </div>

                        <div className="flex flex-col gap-3">
                            <button
                                onClick={handleRestart}
                                disabled={isRestarting}
                                className="w-full bg-accent-primary text-white font-bold py-3.5 rounded-xl text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-accent-primary/90 transition-all active:scale-[0.98] shadow-lg shadow-accent-primary/20 disabled:opacity-50"
                            >
                                <RefreshCw size={16} className={isRestarting ? 'animate-spin' : ''} />
                                {isRestarting ? 'Restarting...' : 'Restart Server'}
                            </button>
                            <p className="text-[10px] text-center text-text-tertiary px-4 leading-relaxed italic">
                                Note: Your phone must be on the <span className="text-accent-primary font-semibold">same Wi-Fi network</span> as this computer.
                            </p>
                        </div>
                    </div>

                    <div className="mt-auto pt-4 border-t border-border-subtle flex items-center gap-3 text-text-tertiary">
                        <div className={`w-2 h-2 rounded-full ${url ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500 animate-pulse'}`} />
                        <span className="text-[11px] font-medium">{url ? 'Server Live' : 'Server Offline'}</span>
                        <div className="ml-auto flex items-center gap-1.5 text-[10px] bg-bg-surface px-2 py-1 rounded-lg border border-border-subtle">
                            <Wifi size={10} /> Local Sync
                        </div>
                    </div>
                </div>
            </div>

            {/* Info Section */}
            <div className="bg-accent-primary/5 rounded-2xl p-6 border border-accent-primary/10">
                <div className="flex gap-4">
                    <div className="w-12 h-12 rounded-xl bg-accent-primary/10 flex items-center justify-center shrink-0">
                        <ShieldCheck className="text-accent-primary" size={24} />
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-sm font-bold text-text-primary flex items-center gap-2"> Why use Remote Display? </h3>
                        <p className="text-xs text-text-secondary leading-relaxed">
                            Some interview platforms (like Proctoring software) detect overlays on your computer screen. By using <strong>Remote Display</strong>, Ghost Writer's AI answers are sent directly to your phone. 
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                            <div className="flex items-start gap-2 text-[11px] text-text-secondary">
                                <div className="w-1.5 h-1.5 rounded-full bg-accent-primary mt-1 shrink-0" />
                                <span>Zero desktop footprint</span>
                            </div>
                            <div className="flex items-start gap-2 text-[11px] text-text-secondary">
                                <div className="w-1.5 h-1.5 rounded-full bg-accent-primary mt-1 shrink-0" />
                                <span>Real-time mobile updates</span>
                            </div>
                            <div className="flex items-start gap-2 text-[11px] text-text-secondary">
                                <div className="w-1.5 h-1.5 rounded-full bg-accent-primary mt-1 shrink-0" />
                                <span>Bypasses proctoring overlays</span>
                            </div>
                            <div className="flex items-start gap-2 text-[11px] text-text-secondary">
                                <div className="w-1.5 h-1.5 rounded-full bg-accent-primary mt-1 shrink-0" />
                                <span>Perfect for recruiter calls</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
