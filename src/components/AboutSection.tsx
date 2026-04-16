import React, { useState, useEffect } from 'react';
import { Cpu, Github, Heart, Mail, Shield, Star, User, Briefcase, Building2, AtSign, Edit2, Check, X, Loader2 } from 'lucide-react';
import evinProfile from './icon.ico';
import { APP_VERSION } from '../lib/appVersion';

interface UserProfile {
    fullName: string;
    preferredName: string;
    email: string;
    currentRole: string;
    company: string;
    targetRole: string;
}

export const AboutSection: React.FC = () => {
    const [copied, setCopied] = useState(false);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editedProfile, setEditedProfile] = useState<UserProfile | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    useEffect(() => {
        if (window.electronAPI?.getUserProfile) {
            window.electronAPI.getUserProfile().then((savedProfile: any) => {
                if (savedProfile) {
                    setProfile({
                        fullName: savedProfile.fullName || '',
                        preferredName: savedProfile.preferredName || '',
                        email: savedProfile.email || '',
                        currentRole: savedProfile.currentRole || '',
                        company: savedProfile.company || '',
                        targetRole: savedProfile.targetRole || ''
                    });
                }
            });
        }
    }, []);

    const openExternal = (url: string) => {
        if (window.electronAPI?.invoke) {
            window.electronAPI.invoke('open-external', url);
            return;
        }
        window.open(url, '_blank');
    };

    const handleCopyEmail = () => {
        navigator.clipboard.writeText('contact@ghostwriter.ai');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleEdit = () => {
        setEditedProfile(profile);
        setIsEditing(true);
        setSaveSuccess(false);
    };

    const handleCancel = () => {
        setIsEditing(false);
        setEditedProfile(null);
    };

    const handleSave = async () => {
        if (!editedProfile || !window.electronAPI?.saveUserProfile) return;

        setIsSaving(true);
        try {
            const result = await window.electronAPI.saveUserProfile(editedProfile);
            if (result.success) {
                setProfile(editedProfile);
                setIsEditing(false);
                setSaveSuccess(true);
                setTimeout(() => setSaveSuccess(false), 3000);
            } else {
                console.error('Failed to save profile:', result.error);
            }
        } catch (error) {
            console.error('Error saving profile:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const updateField = (field: keyof UserProfile, value: string) => {
        if (!editedProfile) return;
        setEditedProfile({ ...editedProfile, [field]: value });
    };

    return (
        <div className="space-y-8 animated fadeIn pb-10 max-w-2xl mx-auto">
            <div className="flex flex-col items-center transition-all duration-700 pt-4">
                <div className="w-20 h-20 mb-6 group cursor-default flex items-center justify-center">
                    <img
                        src={evinProfile}
                        alt="Ghost Writer Logo"
                        className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6 drop-shadow-[0_0_15px_rgba(255,255,255,0.15)]"
                    />
                </div>
                <h1 className="text-2xl font-bold text-text-primary tracking-tight mb-2">{`Ghost Writer v${APP_VERSION}`}</h1>
                <div className="flex items-center gap-2 mb-6">
                    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-black text-[9px] font-black uppercase tracking-[0.2em] shadow-[0_0_20px_rgba(255,255,255,0.3)]">
                        <div className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
                        Desktop Beta
                    </span>
                    <span className="px-3 py-1 rounded-full bg-white/5 text-text-tertiary text-[9px] font-bold border border-white/5 uppercase tracking-widest">
                        {`v${APP_VERSION} Public Beta`}
                    </span>
                </div>
                <p className="text-center text-text-secondary text-sm leading-relaxed max-w-md">
                    Desktop assistance for interview and meeting workflows, with optional local-first operation and configurable cloud providers.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white/[0.03] backdrop-blur-3xl border border-white/5 rounded-2xl p-6 hover:bg-white/5 hover:border-white/10 transition-all duration-500 group">
                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-text-tertiary mb-4 border border-white/5 shadow-sm group-hover:text-text-primary group-hover:bg-white/10 transition-all">
                        <Shield size={20} />
                    </div>
                    <h3 className="text-xs font-black text-text-primary uppercase tracking-widest mb-2">Privacy Controls</h3>
                    <p className="text-[11px] text-text-tertiary leading-relaxed font-medium">
                        Credentials use OS secure storage when available. Cloud providers are only used when you configure them and choose to send requests.
                    </p>
                </div>

                <div className="bg-white/[0.03] backdrop-blur-3xl border border-white/5 rounded-2xl p-6 hover:bg-white/5 hover:border-white/10 transition-all duration-500 group">
                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-text-tertiary mb-4 border border-white/5 shadow-sm group-hover:text-text-primary group-hover:bg-white/10 transition-all">
                        <Cpu size={20} />
                    </div>
                    <h3 className="text-xs font-black text-text-primary uppercase tracking-widest mb-2">Runtime Flexibility</h3>
                    <p className="text-[11px] text-text-tertiary leading-relaxed font-medium">
                        Route work between local runtimes and cloud models, depending on your machine, provider configuration, and latency needs.
                    </p>
                </div>
            </div>

            {profile && (profile.fullName || profile.email) && (
                <div className="bg-[var(--bg-card-alpha)] backdrop-blur-xl border border-border-subtle rounded-2xl overflow-hidden shadow-xl animated slideInUp">
                    <div className="p-6 border-b border-border-subtle bg-white/[0.02]">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-[var(--accent-primary)]/10 flex items-center justify-center text-[var(--accent-primary)] border border-[var(--accent-primary)]/20 shadow-[0_0_20px_rgba(56,189,248,0.15)]">
                                    <User size={24} />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-text-primary">User Profile</h3>
                                    <p className="text-[10px] text-text-tertiary uppercase tracking-widest font-medium">Onboarding Details</p>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                                {saveSuccess && !isEditing && (
                                    <span className="text-[10px] font-bold text-emerald-400 animated fadeInRight mr-2 uppercase tracking-widest">Saved!</span>
                                )}
                                {isEditing ? (
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={handleSave}
                                            disabled={isSaving}
                                            className="p-2 rounded-xl bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20 transition-all disabled:opacity-50"
                                            title="Save Changes"
                                        >
                                            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                        </button>
                                        <button
                                            onClick={handleCancel}
                                            disabled={isSaving}
                                            className="p-2 rounded-xl bg-white/5 text-text-secondary hover:bg-white/10 transition-all disabled:opacity-50"
                                            title="Cancel"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={handleEdit}
                                        className="p-2 rounded-xl bg-white/5 text-text-tertiary hover:text-text-primary hover:bg-white/10 transition-all group"
                                        title="Edit Profile"
                                    >
                                        <Edit2 size={16} className="group-hover:scale-110 transition-transform" />
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-8">
                            <div className="space-y-1.5">
                                <span className="text-[10px] font-black text-text-tertiary uppercase tracking-[0.2em] block px-1">Full Name</span>
                                {isEditing ? (
                                    <input
                                        type="text"
                                        value={editedProfile?.fullName}
                                        onChange={(e) => updateField('fullName', e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-primary/50 transition-colors"
                                        placeholder="Full Name"
                                    />
                                ) : (
                                    <p className="text-sm font-medium text-text-primary px-1">{profile.fullName || 'Not set'}</p>
                                )}
                            </div>
                            <div className="space-y-1.5">
                                <span className="text-[10px] font-black text-text-tertiary uppercase tracking-[0.2em] block px-1">Preferred Name</span>
                                {isEditing ? (
                                    <input
                                        type="text"
                                        value={editedProfile?.preferredName}
                                        onChange={(e) => updateField('preferredName', e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-primary/50 transition-colors"
                                        placeholder="Preferred Name"
                                    />
                                ) : (
                                    <p className="text-sm font-medium text-text-primary px-1">{profile.preferredName || 'Not set'}</p>
                                )}
                            </div>
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-2 px-1">
                                    <AtSign size={12} className="text-text-tertiary" />
                                    <span className="text-[10px] font-black text-text-tertiary uppercase tracking-[0.2em] block">Email Address</span>
                                </div>
                                {isEditing ? (
                                    <input
                                        type="email"
                                        value={editedProfile?.email}
                                        onChange={(e) => updateField('email', e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-primary/50 transition-colors"
                                        placeholder="Email Address"
                                    />
                                ) : (
                                    <p className="text-sm font-medium text-text-primary px-1">{profile.email || 'Not set'}</p>
                                )}
                            </div>
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-2 px-1">
                                    <Briefcase size={12} className="text-text-tertiary" />
                                    <span className="text-[10px] font-black text-text-tertiary uppercase tracking-[0.2em] block">Current Role</span>
                                </div>
                                {isEditing ? (
                                    <input
                                        type="text"
                                        value={editedProfile?.currentRole}
                                        onChange={(e) => updateField('currentRole', e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-primary/50 transition-colors"
                                        placeholder="Current Role"
                                    />
                                ) : (
                                    <p className="text-sm font-medium text-text-primary px-1">{profile.currentRole || 'Not set'}</p>
                                )}
                            </div>
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-2 px-1">
                                    <Building2 size={12} className="text-text-tertiary" />
                                    <span className="text-[10px] font-black text-text-tertiary uppercase tracking-[0.2em] block">Company</span>
                                </div>
                                {isEditing ? (
                                    <input
                                        type="text"
                                        value={editedProfile?.company}
                                        onChange={(e) => updateField('company', e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-primary/50 transition-colors"
                                        placeholder="Company"
                                    />
                                ) : (
                                    <p className="text-sm font-medium text-text-primary px-1">{profile.company || 'Not set'}</p>
                                )}
                            </div>
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-2 px-1">
                                    <Star size={12} className="text-text-tertiary" />
                                    <span className="text-[10px] font-black text-text-tertiary uppercase tracking-[0.2em] block">Target Role</span>
                                </div>
                                {isEditing ? (
                                    <input
                                        type="text"
                                        value={editedProfile?.targetRole}
                                        onChange={(e) => updateField('targetRole', e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-primary/50 transition-colors"
                                        placeholder="Target Role"
                                    />
                                ) : (
                                    <p className="text-sm font-medium text-text-primary px-1">{profile.targetRole || 'Not set'}</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-[var(--bg-card-alpha)] backdrop-blur-xl border border-border-subtle rounded-2xl overflow-hidden shadow-sm">
                <div className="p-6 border-b border-border-subtle">
                    <div className="flex items-start gap-5">
                        <div className="w-14 h-14 rounded-full bg-[var(--bg-glass)] backdrop-blur-md border border-border-subtle flex items-center justify-center overflow-hidden shrink-0 shadow-xl">
                            <img src={evinProfile} alt="Ghost Writer Core" className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center justify-between mb-2">
                                <div>
                                    <h4 className="text-sm font-bold text-text-primary">Ghost Writer Core</h4>
                                    <p className="text-[10px] text-text-tertiary">Ghost Writer Team</p>
                                </div>
                                <button
                                    onClick={() => openExternal('https://github.com/ghostwriter/ghost-writer')}
                                    className="text-text-tertiary hover:text-text-primary transition-colors"
                                >
                                    <Github size={16} />
                                </button>
                            </div>
                            <p className="text-xs text-text-secondary leading-relaxed">
                                Maintained by the Ghost Writer Team. Ghost Writer is a desktop beta focused on responsive interview and meeting assistance for individual users.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 divide-x divide-border-subtle">
                    <button
                        onClick={() => openExternal('https://github.com/ghostwriter/ghost-writer')}
                        className="p-4 flex flex-col items-center justify-center gap-2 hover:bg-accent-primary/5 transition-colors group"
                    >
                        <Star size={16} className="text-yellow-500 group-hover:fill-current" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary group-hover:text-text-primary">Repository</span>
                    </button>
                    <button
                        onClick={handleCopyEmail}
                        className="p-4 flex flex-col items-center justify-center gap-2 hover:bg-accent-primary/5 transition-all active:scale-95 group cursor-pointer"
                        title="Click to copy email"
                    >
                        <Mail size={16} className={`transition-colors duration-300 ${copied ? 'text-emerald-400' : 'text-text-primary'}`} />
                        <div className="flex flex-col items-center">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary group-hover:text-text-primary transition-colors">
                                {copied ? 'Email Copied' : 'Support'}
                            </span>
                            <span className="text-[10px] text-text-primary font-medium">contact@ghostwriter.ai</span>
                        </div>
                    </button>
                </div>
            </div>

            <div className="bg-white/5 backdrop-blur-3xl border border-white/5 rounded-2xl p-6 flex items-center justify-between shadow-2xl relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-r from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                <div className="flex items-center gap-4 relative z-10">
                    <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-text-tertiary border border-white/10">
                        <Heart size={20} />
                    </div>
                    <div>
                        <h4 className="text-xs font-black text-text-primary uppercase tracking-widest">Launch Platforms</h4>
                        <p className="text-[10px] text-text-tertiary mt-1 max-w-[220px] font-medium">
                            Supported in v1.0.0 on Windows x64 and macOS arm64.
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex flex-col items-center gap-4 pt-6 opacity-60">
                <div className="flex items-center gap-6">
                    <button className="text-[10px] font-bold uppercase tracking-widest text-text-secondary hover:text-text-primary transition-colors">Privacy Policy</button>
                    <button className="text-[10px] font-bold uppercase tracking-widest text-text-secondary hover:text-text-primary transition-colors">Terms of Service</button>
                    <button className="text-[10px] font-bold uppercase tracking-widest text-text-secondary hover:text-text-primary transition-colors">Legal</button>
                </div>
                <p className="text-[9px] font-medium tracking-tight text-text-tertiary">Copyright {new Date().getFullYear()} Ghost Writer. All rights reserved.</p>
            </div>
        </div>
    );
};
