import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ArrowRight, ArrowLeft, Mic, Brain, Sparkles, Monitor, Activity, ShieldCheck, Loader2, Globe, Command, Cpu, Terminal, Zap } from 'lucide-react';
import {
    SetupWizardFullPrivacyStatus,
    SetupWizardGpuStatus,
    SetupWizardOllamaStatus,
    SetupWizardSystemInfo,
    SetupWizardWhisperStatus,
    canProceedFromDiagnosis,
    getRecommendedWhisperModel,
    hasCompletedDiagnosis,
    isBlockedByFullPrivacy
} from './setupWizardState';

interface SetupWizardProps {
    onComplete: () => void;
}

interface SetupStep {
    id: string;
    title: string;
    description: string;
    icon: React.ReactNode;
    required: boolean;
}

interface UserProfileFormState {
    fullName: string;
    preferredName: string;
    email: string;
    currentRole: string;
    company: string;
    targetRole: string;
}

const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete }) => {
    const [currentStep, setCurrentStep] = useState(0);
    const [telemetryEnabled, setTelemetryEnabled] = useState(false);
    const [profile, setProfile] = useState<UserProfileFormState>({
        fullName: '',
        preferredName: '',
        email: '',
        currentRole: '',
        company: '',
        targetRole: ''
    });
    const [profileError, setProfileError] = useState('');
    const [savingProfile, setSavingProfile] = useState(false);
    const [systemInfo, setSystemInfo] = useState<SetupWizardSystemInfo>({
        gpu: null,
        ollama: null,
        whisper: null,
        fullPrivacy: null
    });

    const steps: SetupStep[] = [
        {
            id: 'welcome',
            title: 'Welcome',
            description: 'Initiating your AI companion.',
            icon: <Sparkles className="w-6 h-6" />,
            required: true
        },
        {
            id: 'profile',
            title: 'Identity',
            description: 'Define your professional presence.',
            icon: <Globe className="w-6 h-6" />,
            required: true
        },
        {
            id: 'diagnosis',
            title: 'System Analysis',
            description: 'Scanning hardware for peak performance.',
            icon: <Monitor className="w-6 h-6" />,
            required: true
        },
        {
            id: 'ready',
            title: 'Deployment',
            description: 'Ghost Writer is standing by.',
            icon: <Check className="w-6 h-6" />,
            required: true
        }
    ];

    const fallbackGpuStatus: SetupWizardGpuStatus = {
        success: false,
        error: 'Hardware analysis unavailable'
    };

    const fallbackOllamaStatus: SetupWizardOllamaStatus = {
        success: false,
        running: false,
        models: [],
        error: 'Ollama check unavailable'
    };

    const fallbackWhisperStatus: SetupWizardWhisperStatus = {
        hasBinary: false,
        hasModel: false,
        hasOperationalServer: false,
        isDownloading: false,
        selectedModel: 'small-tdrz'
    };

    const fallbackFullPrivacyStatus: SetupWizardFullPrivacyStatus = {
        enabled: false,
        localWhisperReady: false,
        localWhisperModelReady: false,
        ollamaReachable: false,
        localTextModelReady: false,
        localVisionModelReady: false,
        activeOllamaModel: '',
        errors: []
    };

    const performDiagnosis = async () => {
        const [gpuResult, ollamaResult, whisperResult, fullPrivacyResult] = await Promise.allSettled([
            window.electronAPI.getGpuInfo(),
            window.electronAPI.checkOllamaStatus(),
            window.electronAPI.getWhisperStatus(),
            window.electronAPI.getFullPrivacyStatus()
        ]);

        const gpu = gpuResult.status === 'fulfilled' ? gpuResult.value : fallbackGpuStatus;
        const ollama = ollamaResult.status === 'fulfilled' ? ollamaResult.value : fallbackOllamaStatus;
        let whisper = whisperResult.status === 'fulfilled' ? whisperResult.value : fallbackWhisperStatus;
        const fullPrivacy = fullPrivacyResult.status === 'fulfilled' ? fullPrivacyResult.value : fallbackFullPrivacyStatus;

        const recommended = getRecommendedWhisperModel(gpu?.info?.vramGB, whisper.selectedModel);
        if (recommended !== whisper.selectedModel) {
            try {
                await window.electronAPI.setLocalWhisperModel(recommended);
                whisper = await window.electronAPI.getWhisperStatus();
            } catch (error) {
                console.error('Failed to update recommended whisper model:', error);
                whisper = { ...whisper, selectedModel: recommended };
            }
        }

        setSystemInfo({
            gpu,
            ollama,
            whisper,
            fullPrivacy
        });
    };

    useEffect(() => {
        Promise.all([
            window.electronAPI.getTelemetrySettings(),
            window.electronAPI.getUserProfile()
        ])
            .then(([settings, savedProfile]) => {
                setTelemetryEnabled(!!settings.enabled);
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
            })
            .catch((error) => console.error('Failed to load onboarding settings:', error));
    }, []);

    useEffect(() => {
        let pollInterval: NodeJS.Timeout;

        if (currentStep === 2) {
            const runScan = async () => {
                await performDiagnosis();
                // Minimal delay to show the diagnostic terminal loading
                await new Promise(r => setTimeout(r, 1000));

                pollInterval = setInterval(async () => {
                    const [ollamaResult, whisperResult, fullPrivacyResult] = await Promise.allSettled([
                        window.electronAPI.checkOllamaStatus(),
                        window.electronAPI.getWhisperStatus(),
                        window.electronAPI.getFullPrivacyStatus()
                    ]);

                    setSystemInfo((prev) => {
                        const nextState: SetupWizardSystemInfo = {
                            ...prev,
                            ollama: ollamaResult.status === 'fulfilled' ? ollamaResult.value : prev.ollama,
                            whisper: whisperResult.status === 'fulfilled' ? whisperResult.value : prev.whisper,
                            fullPrivacy: fullPrivacyResult.status === 'fulfilled' ? fullPrivacyResult.value : prev.fullPrivacy
                        };

                        if (canProceedFromDiagnosis(nextState)) {
                            clearInterval(pollInterval);
                            setTimeout(() => {
                                setCurrentStep(3);
                            }, 1200);
                        }

                        return nextState;
                    });
                }, 2000);
            };
            runScan();
        }

        return () => {
            if (pollInterval) clearInterval(pollInterval);
        };
    }, [currentStep]);

    const handleNext = async () => {
        if (currentStep === 1) {
            const fullName = profile.fullName.trim();
            if (!fullName) {
                setProfileError('Identification required.');
                return;
            }

            try {
                setSavingProfile(true);
                setProfileError('');
                const result = await window.electronAPI.saveUserProfile({
                    fullName,
                    preferredName: profile.preferredName.trim(),
                    email: profile.email.trim(),
                    currentRole: profile.currentRole.trim(),
                    company: profile.company.trim(),
                    targetRole: profile.targetRole.trim()
                });

                if (!result.success) {
                    setProfileError(result.error || 'Identity uplink failed.');
                    return;
                }
            } catch (error) {
                console.error('Failed to save onboarding profile:', error);
                setProfileError('System error during profile sync.');
                return;
            } finally {
                setSavingProfile(false);
            }
        }

        if (currentStep < steps.length - 1) {
            setCurrentStep(currentStep + 1);
        } else {
            localStorage.setItem('setupComplete', 'true');
            onComplete();
        }
    };

    const handleBack = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        }
    };

    const handleTelemetryToggle = async () => {
        const nextValue = !telemetryEnabled;
        try {
            const result = await window.electronAPI.setTelemetryEnabled(nextValue);
            if (result.success) {
                setTelemetryEnabled(nextValue);
            }
        } catch (error) {
            console.error('Failed to update telemetry settings from onboarding:', error);
        }
    };

    const canProceed = () => {
        switch (currentStep) {
            case 1:
                return profile.fullName.trim().length > 0;
            case 2:
                return canProceedFromDiagnosis(systemInfo);
            default: return true;
        }
    };

    const updateProfileField = (field: keyof UserProfileFormState, value: string) => {
        setProfile((prev) => ({
            ...prev,
            [field]: value
        }));
        if (profileError) {
            setProfileError('');
        }
    };

    const DiagnosticTerminal = () => {
        const lines = [
            { id: 'gpu', label: 'HARDWARE ACCEL', value: systemInfo.gpu?.success ? (systemInfo.gpu.info?.name || 'GENERIC GPU') : 'SOFTWARE MODE', status: systemInfo.gpu ? (systemInfo.gpu.success ? 'success' : 'error') : 'loading' },
            { id: 'vram', label: 'MEMORY UPLINK', value: systemInfo.gpu?.success && typeof systemInfo.gpu.info?.vramGB === 'number' ? `${systemInfo.gpu.info.vramGB}GB VRAM` : 'SYNCING...', status: systemInfo.gpu ? (systemInfo.gpu.success ? 'success' : 'warning') : 'loading' },
            { id: 'ollama', label: 'LOCAL KNOWLEDGE', value: systemInfo.ollama?.running ? 'OLLAMA ACTIVE' : 'ENGINE COLD', status: systemInfo.ollama ? (systemInfo.ollama.running ? 'success' : 'warning') : 'loading' },
            { id: 'whisper', label: 'STT PIPELINE', value: systemInfo.whisper?.hasOperationalServer ? 'SERVER READY' : (systemInfo.whisper?.hasBinary ? 'BINARY DETECTED' : 'INITIALIZING...'), status: systemInfo.whisper ? (systemInfo.whisper.hasOperationalServer ? 'success' : 'warning') : 'loading' },
        ];

        return (
            <div className="w-full max-w-sm mx-auto space-y-4 font-mono text-xs">
                <div className="flex items-center gap-2 mb-6 text-white/30 px-2 uppercase tracking-[0.3em]">
                    <Terminal className="w-3 h-3" />
                    <span>System Diagnostic</span>
                </div>
                
                <div className="space-y-3 rounded-3xl border border-white/10 bg-black/40 p-6 backdrop-blur-md relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-2 opacity-10">
                        <Zap className="w-12 h-12" />
                    </div>
                    
                    {lines.map((line, i) => (
                        <div key={line.id} className="flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                                <span className="text-white/40">{line.label}</span>
                                {line.status === 'loading' && <Loader2 className="w-3 h-3 animate-spin text-white/30" />}
                                {line.status === 'success' && <ShieldCheck className="w-3 h-3 text-[var(--accent-primary)] shadow-[0_0_8px_var(--accent-primary)]" />}
                                {line.status === 'warning' && <Activity className="w-3 h-3 text-orange-400" />}
                                {line.status === 'error' && <Zap className="w-3 h-3 text-red-500" />}
                            </div>
                            <div className="flex items-center gap-1.5">
                                <motion.div 
                                    className={`h-1 rounded-full ${line.status === 'success' ? 'bg-[var(--accent-primary)]' : line.status === 'loading' ? 'bg-white/10' : 'bg-orange-500/50'}`} 
                                    initial={{ width: 0 }}
                                    animate={{ width: line.status === 'success' ? '100%' : '30%' }}
                                    transition={{ duration: 0.8, delay: i * 0.1 }}
                                />
                            </div>
                            <span className={`text-[10px] ${line.status === 'success' ? 'text-white' : 'text-white/30'}`}>{line.value}</span>
                        </div>
                    ))}

                    <div className="mt-6 pt-4 border-t border-white/5 space-y-1">
                        <div className="flex gap-2 text-white/20">
                            <span>></span>
                            <span className="animate-pulse">_</span>
                        </div>
                    </div>
                </div>

                <div className="px-2 text-[10px] text-white/30 leading-relaxed text-center italic">
                    Ghost Writer is optimizing your local experience based on detected hardware tiers.
                </div>
            </div>
        );
    };

    const renderStepContent = () => {
        switch (currentStep) {
            case 0:
                return (
                    <div className="text-center py-4 relative">
                        <div className="relative mx-auto mb-10 h-24 w-24">
                            <motion.div 
                                animate={{ rotate: 360 }}
                                transition={{ repeat: Infinity, duration: 20, ease: "linear" }}
                                className="absolute inset-[-12px] border-t-2 border-r-2 border-white/5 rounded-full"
                            />
                            <motion.div 
                                animate={{ rotate: -360 }}
                                transition={{ repeat: Infinity, duration: 15, ease: "linear" }}
                                className="absolute inset-[-6px] border-b-2 border-l-2 border-[var(--accent-primary)]/10 rounded-full"
                            />
                            <div className="relative flex h-full w-full items-center justify-center rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.15),rgba(18,18,26,0.95))] shadow-[0_32px_80px_-20px_rgba(56,189,248,0.4)]">
                                <Sparkles className="w-10 h-10 text-[var(--accent-primary)]" />
                            </div>
                        </div>
                        
                        <h2 className="mb-2 text-4xl font-light tracking-[-0.05em] text-white">Ghost Writer</h2>
                        <div className="inline-block px-3 py-1 mb-8 rounded-full bg-white/5 border border-white/10 text-[10px] uppercase tracking-[0.4em] font-bold text-white/50">
                            Initiate Sequence
                        </div>
                        
                        <p className="text-base text-white/70 max-w-sm mx-auto leading-relaxed mb-12 font-light">
                            High-fidelity meeting and interview assistance. 
                            Discrete by design. Powered by your local hardware.
                        </p>

                        <div className="flex items-center justify-center gap-12 opacity-40">
                            <ShieldCheck className="w-5 h-5" />
                            <Cpu className="w-5 h-5" />
                            <Brain className="w-5 h-5" />
                        </div>
                    </div>
                );

            case 1:
                return (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                        <div className="text-center space-y-2">
                            <h2 className="text-2xl font-light text-white tracking-tight">Identity Uplink</h2>
                            <p className="text-xs text-white/40 uppercase tracking-[0.2em] font-bold">Local Encryption Active</p>
                        </div>

                        <div className="space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <label className="space-y-1.5 md:col-span-2 group">
                                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30 group-focus-within:text-[var(--accent-primary)] transition-colors">Full name</span>
                                    <input
                                        type="text"
                                        value={profile.fullName}
                                        onChange={(e) => updateProfileField('fullName', e.target.value)}
                                        placeholder="James Howlett"
                                        className="w-full rounded-2xl border border-white/5 bg-white/2 px-5 py-3.5 text-sm text-white placeholder:text-white/10 outline-none transition-all focus:border-[var(--accent-primary)]/50 focus:bg-white/5"
                                    />
                                </label>

                                <label className="space-y-1.5">
                                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30 group-focus-within:text-[var(--accent-primary)] transition-colors">Preferred name</span>
                                    <input
                                        type="text"
                                        value={profile.preferredName}
                                        onChange={(e) => updateProfileField('preferredName', e.target.value)}
                                        placeholder="Logan"
                                        className="w-full rounded-2xl border border-white/5 bg-white/2 px-5 py-3.5 text-sm text-white placeholder:text-white/10 outline-none transition-all focus:border-[var(--accent-primary)]/50 focus:bg-white/5"
                                    />
                                </label>

                                <label className="space-y-1.5">
                                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30 group-focus-within:text-[var(--accent-primary)] transition-colors">Target role</span>
                                    <input
                                        type="text"
                                        value={profile.targetRole}
                                        onChange={(e) => updateProfileField('targetRole', e.target.value)}
                                        placeholder="Staff Architect"
                                        className="w-full rounded-2xl border border-white/5 bg-white/2 px-5 py-3.5 text-sm text-white placeholder:text-white/10 outline-none transition-all focus:border-[var(--accent-primary)]/50 focus:bg-white/5"
                                    />
                                </label>
                            </div>

                            <div className="rounded-2xl border border-white/5 bg-white/2 p-4 flex items-center justify-between group transition-colors hover:bg-white/5">
                                <div className="space-y-0.5">
                                    <div className="text-xs font-bold text-white/70 group-hover:text-white transition-colors">TELEMETRY UPLINK</div>
                                    <p className="text-[10px] text-white/30 italic">Anonymous usage diagnostics (Opt-in)</p>
                                </div>
                                <button
                                    onClick={handleTelemetryToggle}
                                    className={`relative inline-flex h-5 w-10 shrink-0 items-center rounded-full transition-all duration-300 ${telemetryEnabled ? 'bg-[var(--accent-primary)] shadow-[0_0_12px_var(--accent-primary)]' : 'bg-white/10'}`}
                                >
                                    <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-all duration-300 transform ${telemetryEnabled ? 'translate-x-5.5' : 'translate-x-1'}`} />
                                </button>
                            </div>
                        </div>

                        {profileError && (
                            <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-2.5 text-[10px] text-red-300 uppercase tracking-widest text-center font-bold">
                                {profileError}
                            </div>
                        )}
                    </div>
                );

            case 2:
                return (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                        <DiagnosticTerminal />
                    </div>
                );

            case 3:
                return (
                    <div className="text-center space-y-12 py-6">
                        <div className="relative w-28 h-28 mx-auto">
                            <motion.div
                                animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0.05, 0.2] }}
                                transition={{ repeat: Infinity, duration: 4 }}
                                className="absolute inset-[-20px] rounded-full blur-3xl bg-[var(--accent-primary)]"
                            />
                            <div className="relative flex h-full w-full items-center justify-center rounded-[2.5rem] border border-white/10 bg-[#0a0a0f] shadow-[0_40px_100px_-30px_rgba(56,189,248,0.6)]">
                                <Check className="h-12 w-12 text-[var(--accent-primary)]" />
                            </div>
                        </div>
                        
                        <div className="space-y-3">
                            <h2 className="text-4xl font-light tracking-tight text-white">System Activated</h2>
                            <p className="text-sm text-white/50 max-w-sm mx-auto leading-relaxed italic">
                                Ghost Writer has successfully synchronized with your hardware architecture.
                            </p>
                        </div>

                        <div className="flex justify-center gap-10 font-mono text-[9px] uppercase tracking-[0.3em] text-white/25">
                            <div className="flex items-center gap-2">
                                <div className="w-1 h-1 rounded-full bg-emerald-500" />
                                <span>Stealth Ready</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-1 h-1 rounded-full bg-emerald-500" />
                                <span>Local LLM Ready</span>
                            </div>
                        </div>
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-2xl flex items-center justify-center p-6">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 40 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: "spring", damping: 20, stiffness: 100 }}
                className={`relative flex w-full max-w-lg flex-col overflow-hidden rounded-[3rem] border border-white/5 bg-[linear-gradient(180deg,rgba(10,10,15,0.98),rgba(2,2,4,0.98))] shadow-[0_40px_160px_-20px_rgba(0,0,0,0.95)] ${navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? 'pt-8' : ''}`}
            >
                {/* Spectral Glow Effect */}
                <div className="pointer-events-none absolute top-[-50px] left-1/2 -translate-x-1/2 w-full h-[150px] bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.1),transparent_70%)] opacity-50" />

                {/* Vertical Progress Chain */}
                <div className="absolute right-8 top-12 bottom-12 w-px bg-white/5 flex flex-col justify-between items-center py-2">
                    {steps.map((_, index) => (
                        <div 
                            key={index} 
                            className={`w-1 h-1 rounded-full transition-all duration-500 ${index <= currentStep ? 'bg-[var(--accent-primary)] shadow-[0_0_8px_var(--accent-primary)]' : 'bg-white/10'}`} 
                        />
                    ))}
                </div>

                {/* Main Content Area */}
                <div className="px-12 py-12 min-h-[480px] flex flex-col justify-center relative">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentStep}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                        >
                            {renderStepContent()}
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Professional Footer Controls */}
                <div className="px-12 pb-12 flex items-center justify-between">
                    <button
                        onClick={handleBack}
                        disabled={currentStep === 0}
                        className="group h-10 px-4 flex items-center gap-2 text-white/20 hover:text-white disabled:opacity-0 transition-all text-[10px] font-bold uppercase tracking-[0.2em]"
                    >
                        <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                        Back
                    </button>

                    <button
                        onClick={handleNext}
                        disabled={!canProceed() || savingProfile}
                        className="relative group h-14 min-w-[160px] overflow-hidden rounded-[1.25rem] bg-white text-black transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-20 disabled:scale-100"
                    >
                        <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent,rgba(255,255,255,0.4),transparent)] -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                        <div className="flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em]">
                            {savingProfile ? 'Syncing...' : currentStep === steps.length - 1 ? 'Go Active' : 'Proceed'}
                            {currentStep < steps.length - 1 && <ArrowRight className="w-3.5 h-3.5" />}
                        </div>
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

export default SetupWizard;
