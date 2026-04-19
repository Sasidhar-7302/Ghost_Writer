import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Check, 
    Sparkles, 
    Monitor, 
    Activity, 
    ShieldCheck, 
    Brain, 
    User, 
    Mail, 
    Briefcase, 
    Building, 
    Target, 
    ChevronRight, 
    Zap,
    Cpu,
    Fingerprint,
    Network
} from 'lucide-react';
import {
    SetupWizardFullPrivacyStatus,
    SetupWizardGpuStatus,
    SetupWizardOllamaStatus,
    SetupWizardSystemInfo,
    SetupWizardWhisperStatus,
    canProceedFromDiagnosis,
    getRecommendedWhisperModel,
} from './setupWizardState';

interface SetupWizardProps {
    onComplete: () => void;
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

    const steps = [
        { id: 'awakening', title: 'Awakening', description: 'Initializing neural core.' },
        { id: 'identity', title: 'Identity', description: 'Mapping biological data.' },
        { id: 'calibration', title: 'Calibration', description: 'Synchronizing hardware.' },
        { id: 'activation', title: 'Activation', description: 'Ready for deployment.' }
    ];

    const fallbackGpuStatus: SetupWizardGpuStatus = { success: false, error: 'Hardware analysis unavailable' };
    const fallbackOllamaStatus: SetupWizardOllamaStatus = { success: false, running: false, models: [], error: 'Ollama check unavailable' };
    const fallbackWhisperStatus: SetupWizardWhisperStatus = { hasBinary: false, hasModel: false, hasOperationalServer: false, isDownloading: false, selectedModel: 'small-tdrz' };
    const fallbackFullPrivacyStatus: SetupWizardFullPrivacyStatus = {
        enabled: false, localWhisperReady: false, localWhisperModelReady: false,
        ollamaReachable: false, localTextModelReady: false, localVisionModelReady: false,
        activeOllamaModel: '', errors: []
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
                whisper = { ...whisper, selectedModel: recommended };
            }
        }

        setSystemInfo({ gpu, ollama, whisper, fullPrivacy });
    };

    useEffect(() => {
        Promise.all([
            window.electronAPI.getTelemetrySettings(),
            window.electronAPI.getUserProfile()
        ]).then(([settings, savedProfile]) => {
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
        }).catch(err => console.error(err));
    }, []);

    useEffect(() => {
        let pollInterval: NodeJS.Timeout;
        if (currentStep === 2) {
            performDiagnosis().then(() => {
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
                        }
                        return nextState;
                    });
                }, 2000);
            });
        }
        return () => { if (pollInterval) clearInterval(pollInterval); };
    }, [currentStep]);

    const handleNext = async () => {
        if (currentStep === 1) {
            if (!profile.fullName.trim()) {
                setProfileError('Biological identifier required.');
                return;
            }
            try {
                setSavingProfile(true);
                await window.electronAPI.saveUserProfile({ ...profile });
            } catch (err) {
                setProfileError('Failed to synchronize identity.');
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

    const updateProfileField = (field: keyof UserProfileFormState, value: string) => {
        setProfile(p => ({ ...p, [field]: value }));
        if (profileError) setProfileError('');
    };

    const handleTelemetryToggle = async () => {
        const next = !telemetryEnabled;
        const res = await window.electronAPI.setTelemetrySettings(next);
        if (res.success) setTelemetryEnabled(next);
    };

    return (
        <div className="fixed inset-0 z-[200] bg-[#020205] flex items-center justify-center p-6 sm:p-12 font-sans overflow-hidden">
            {/* Neural Background Atmosphere */}
            <div className="absolute inset-0 pointer-events-none">
                <motion.div 
                    animate={{ 
                        scale: [1, 1.2, 1],
                        opacity: [0.1, 0.2, 0.1],
                        x: [0, 50, 0],
                        y: [0, -50, 0]
                    }}
                    transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                    className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-accent-primary/20 rounded-full blur-[150px]" 
                />
                <motion.div 
                    animate={{ 
                        scale: [1, 1.3, 1],
                        opacity: [0.05, 0.15, 0.05],
                        x: [0, -30, 0],
                        y: [0, 40, 0]
                    }}
                    transition={{ duration: 15, repeat: Infinity, ease: "linear", delay: 2 }}
                    className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-purple-600/10 rounded-full blur-[150px]" 
                />
                <div className="absolute inset-0 bg-white/[0.01] opacity-[0.03] contrast-125" />
            </div>

            <motion.div
                initial={{ opacity: 0, scale: 0.98, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="relative w-full max-w-4xl h-[700px] flex flex-col md:flex-row bg-[#08080c]/60 border border-white/5 rounded-[2.5rem] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.8)] backdrop-blur-2xl overflow-hidden"
            >
                {/* Side Navigation / Status */}
                <div className="w-full md:w-72 bg-black/20 border-r border-white/5 p-10 flex flex-col justify-between shrink-0">
                    <div className="space-y-12">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-accent-primary/10 flex items-center justify-center">
                                <Sparkles className="w-4 h-4 text-accent-primary" />
                            </div>
                            <span className="font-heading font-medium tracking-tighter text-lg text-white">Ghost Writer</span>
                        </div>

                        <div className="space-y-6">
                            {steps.map((step, i) => (
                                <div key={step.id} className="relative group flex items-center gap-4">
                                    <div className={`relative z-10 w-2 h-2 rounded-full transition-all duration-500 ${i <= currentStep ? 'bg-accent-primary shadow-[0_0_12px_rgba(56,189,248,0.5)]' : 'bg-white/10'}`} />
                                    {i < steps.length - 1 && (
                                        <div className={`absolute left-[3.5px] top-2 w-[1px] h-6 transition-all duration-500 ${i < currentStep ? 'bg-accent-primary/30' : 'bg-white/5'}`} />
                                    )}
                                    <div className="flex flex-col">
                                        <span className={`text-[10px] font-mono tracking-widest uppercase transition-colors ${i === currentStep ? 'text-accent-primary' : 'text-white/20'}`}>
                                            Step_0{i + 1}
                                        </span>
                                        <span className={`text-xs font-medium transition-colors ${i === currentStep ? 'text-white' : 'text-white/40'}`}>
                                            {step.title}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                        <div className="flex items-center gap-2 mb-2">
                            <Activity className="w-3 h-3 text-accent-primary/60" />
                            <span className="text-[9px] font-mono uppercase tracking-widest text-white/30">System_Status</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-1 h-1 rounded-full bg-accent-primary animate-pulse" />
                            <span className="text-[10px] text-white/50 font-medium tracking-tight truncate">Neural engines nominal...</span>
                        </div>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col min-w-0">
                    <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={currentStep}
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                                className="h-full flex flex-col"
                            >
                                {currentStep === 0 && (
                                    <div className="flex flex-col h-full max-w-lg mx-auto text-center space-y-8 justify-center">
                                        <div className="relative inline-block mx-auto mb-4">
                                            <div className="absolute inset-0 bg-accent-primary blur-[60px] opacity-20 animate-pulse" />
                                            <motion.div 
                                                animate={{ rotate: 360 }}
                                                transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                                                className="relative w-28 h-28 rounded-full border border-dashed border-accent-primary/20 flex items-center justify-center"
                                            >
                                                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-accent-primary/20 to-transparent flex items-center justify-center p-0.5">
                                                    <div className="w-full h-full rounded-full bg-[#08080c] flex items-center justify-center">
                                                        <Cpu className="w-10 h-10 text-accent-primary" />
                                                    </div>
                                                </div>
                                            </motion.div>
                                        </div>

                                        <div className="space-y-4">
                                            <h1 className="text-4xl font-heading font-light tracking-tight text-white leading-tight">
                                                A professional <span className="italic text-accent-primary">ghost</span> in your machine.
                                            </h1>
                                            <p className="text-white/40 leading-relaxed font-light">
                                                Ghost Writer is a high-performance neural companion designed to ground your professional presence during high-stakes sessions.
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4 pt-6">
                                            <div onClick={handleTelemetryToggle} className="group p-4 rounded-3xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all cursor-pointer flex flex-col gap-3">
                                                <div className="flex items-center justify-between">
                                                    <Network className={`w-4 h-4 transition-colors ${telemetryEnabled ? 'text-accent-primary' : 'text-white/20'}`} />
                                                    <div className={`w-8 h-4 rounded-full p-1 flex items-center transition-all ${telemetryEnabled ? 'bg-accent-primary' : 'bg-white/10'}`}>
                                                        <motion.div 
                                                            animate={{ x: telemetryEnabled ? 16 : 0 }}
                                                            transition={{ type: "spring", stiffness: 300, damping: 20 }}
                                                            className="w-2 h-2 rounded-full bg-white shadow-sm" 
                                                        />
                                                    </div>
                                                </div>
                                                <div className="text-left">
                                                    <div className="text-[10px] font-mono uppercase tracking-widest text-white/30 group-hover:text-white/50 transition-colors">Telemetry</div>
                                                    <div className="text-xs text-white/60 font-medium">Model optimization</div>
                                                </div>
                                                <p className="text-[9px] leading-relaxed text-white/20 font-sans mt-0.5">
                                                    We collect basic system diagnostics to optimize neural performance and future system stability. Data is stored securely and used only for internal improvements.
                                                </p>
                                            </div>

                                            <div className="p-4 rounded-3xl bg-white/[0.02] border border-white/5 flex flex-col gap-3">
                                                <ShieldCheck className="w-4 h-4 text-green-500/60" />
                                                <div className="text-left">
                                                    <div className="text-[10px] font-mono uppercase tracking-widest text-white/30">Privacy</div>
                                                    <div className="text-xs text-white/60 font-medium">100% On-device by design</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {currentStep === 1 && (
                                    <div className="space-y-8">
                                        <div className="space-y-3">
                                            <h2 className="text-4xl font-heading font-light text-white tracking-tight">Biological Identity</h2>
                                            <p className="text-white/40 leading-relaxed font-light">Confirm your professional identity to personalize your neural experience.</p>
                                        </div>

                                        <div className="flex flex-col gap-y-6 max-w-sm mx-auto">
                                            {[
                                                { id: 'fullName', label: 'FULL_NAME', icon: <User />, placeholder: 'Enter your full name' },
                                                { id: 'email', label: 'NEURAL_EMAIL', icon: <Mail />, placeholder: 'Enter your professional email' },
                                                { id: 'preferredName', label: 'NEURAL_HANDLE', icon: <Fingerprint />, placeholder: 'Enter your preferred handle' }
                                            ].map((f) => (
                                                <div key={f.id} className="space-y-3">
                                                    <div className="flex items-center gap-2 px-1">
                                                        <span className="text-[10px] font-mono tracking-[0.2em] text-accent-primary/40 leading-none">{f.label}</span>
                                                    </div>
                                                    <div className="group relative">
                                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-accent-primary/60 transition-colors">
                                                            {React.cloneElement(f.icon as React.ReactElement, { size: 16 })}
                                                        </div>
                                                        <input
                                                            type="text"
                                                            value={(profile as any)[f.id]}
                                                            onChange={(e) => updateProfileField(f.id as any, e.target.value)}
                                                            className="w-full bg-white/[0.02] border border-white/10 rounded-2xl pl-12 pr-6 py-4 text-white text-sm outline-none focus:border-accent-primary/30 focus:bg-white/[0.04] transition-all placeholder:text-white/10"
                                                            placeholder={f.placeholder}
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="max-w-xs mx-auto text-center space-y-4">
                                            <p className="text-[10px] text-white/20 leading-relaxed font-light">
                                                We collect basic identity and performance metrics to personalize your experience and improve our neural engines. Your data is stored securely and never shared with third parties.
                                            </p>
                                        </div>

                                        {profileError && (
                                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-400 text-[10px] font-mono uppercase tracking-widest text-center py-2 px-4 rounded-xl bg-red-400/5 border border-red-400/10">
                                                Error: {profileError}
                                            </motion.div>
                                        )}
                                    </div>
                                )}

                                {currentStep === 2 && (
                                    <div className="h-full flex flex-col justify-center space-y-8">
                                        <div className="text-center space-y-3">
                                            <h2 className="text-4xl font-heading font-light text-white tracking-tight">Silicon Calibration</h2>
                                            <p className="text-white/40 leading-relaxed font-light max-w-md mx-auto">Analyzing local hardware to optimize neural engine performance.</p>
                                        </div>

                                        <div className="flex flex-col items-center gap-8 py-4">
                                            <div className="relative">
                                                {/* Central Animated Pulse */}
                                                <div className="absolute inset-0 bg-accent-primary/10 rounded-full blur-2xl animate-pulse" />
                                                <div className="relative w-32 h-32 rounded-full border border-white/5 flex items-center justify-center">
                                                    <motion.div 
                                                        animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
                                                        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                                                        className="absolute inset-0 rounded-full border border-accent-primary/30" 
                                                    />
                                                    <Brain className="w-12 h-12 text-accent-primary/80" />
                                                </div>

                                                {/* Orbital Status Items */}
                                                {[
                                                    { id: 'gpu', label: 'SILICON', icon: <Cpu />, ready: systemInfo.gpu?.success, delay: 0 },
                                                    { id: 'ollama', label: 'NEURAL', icon: <Network />, ready: systemInfo.ollama?.running, delay: 0.2 },
                                                    { id: 'whisper', label: 'STT_CORE', icon: <Activity />, ready: systemInfo.whisper?.hasOperationalServer, delay: 0.4 }
                                                ].map((item, idx) => {
                                                    const angle = (idx * 120 - 90) * (Math.PI / 180);
                                                    const x = Math.cos(angle) * 80;
                                                    const y = Math.sin(angle) * 80;
                                                    return (
                                                        <motion.div
                                                            key={item.id}
                                                            initial={{ opacity: 0, scale: 0.5, x: 0, y: 0 }}
                                                            animate={{ x, y, opacity: 1, scale: 1 }}
                                                            transition={{ delay: item.delay }}
                                                            className="absolute left-[calc(50%-20px)] top-[calc(50%-20px)] flex flex-col items-center gap-2"
                                                        >
                                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-500 ${item.ready ? 'bg-accent-primary/20 text-accent-primary shadow-[0_0_15px_rgba(56,189,248,0.3)]' : 'bg-white/5 text-white/20 animate-pulse'}`}>
                                                                {React.cloneElement(item.icon as React.ReactElement, { size: 18 })}
                                                            </div>
                                                            <span className={`text-[8px] font-mono tracking-widest transition-colors ${item.ready ? 'text-accent-primary/60' : 'text-white/10'}`}>{item.label}</span>
                                                        </motion.div>
                                                    );
                                                })}
                                            </div>

                                            <div className="flex flex-col items-center gap-4 text-center">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex space-x-1">
                                                        <div className="w-1 h-1 rounded-full bg-accent-primary animate-bounce [animation-delay:-0.3s]" />
                                                        <div className="w-1 h-1 rounded-full bg-accent-primary animate-bounce [animation-delay:-0.15s]" />
                                                        <div className="w-1 h-1 rounded-full bg-accent-primary animate-bounce" />
                                                    </div>
                                                    <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">Synchronizing_Hardware</span>
                                                </div>
                                                <p className="text-[10px] text-white/20 font-medium max-w-[240px]">This process optimizes LLM & STT models for your specific hardware architecture.</p>
                                                
                                                {/* Dynamic Recommendation */}
                                                {systemInfo.gpu && (
                                                    <motion.div 
                                                        initial={{ opacity: 0, y: 10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        className="mt-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5 max-w-xs"
                                                    >
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <Sparkles className="w-3 h-3 text-accent-primary" />
                                                            <span className="text-[9px] font-mono text-accent-primary uppercase tracking-widest">Hardware Profile</span>
                                                        </div>
                                                        <div className="text-[11px] text-white font-medium mb-1">{systemInfo.gpu.info?.name || 'DirectX/Metal GPU'} detected</div>
                                                        <p className="text-[10px] text-white/50 leading-relaxed">
                                                            {systemInfo.gpu.success && (systemInfo.gpu.info?.vramGB || 0) >= 4 
                                                                ? "Powerful GPU detected. We recommend using Local Models (Ollama) for maximum privacy and low latency."
                                                                : "Limited VRAM detected. For the best experience, we recommend using Cloud Models (Gemini/Groq) and Cloud TTS."}
                                                        </p>
                                                    </motion.div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {currentStep === 3 && (
                                    <div className="flex flex-col items-center text-center space-y-8 h-full justify-center py-6">
                                        <div className="relative">
                                            <div className="absolute inset-0 bg-accent-primary blur-[80px] opacity-20" />
                                            <motion.div 
                                                initial={{ scale: 0.8, opacity: 0 }}
                                                animate={{ scale: 1, opacity: 1 }}
                                                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                                                className="relative w-32 h-32 rounded-full border border-white/10 flex items-center justify-center"
                                            >
                                                <motion.div 
                                                    animate={{ rotate: 360 }}
                                                    transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                                                    className="absolute inset-0 rounded-full border border-t-accent-primary/40 border-r-transparent border-b-transparent border-l-transparent" 
                                                />
                                                <Check className="w-16 h-16 text-accent-primary" />
                                            </motion.div>
                                        </div>

                                        <div className="space-y-4">
                                            <h2 className="text-4xl font-heading font-light text-white tracking-tight">System Online</h2>
                                            <p className="text-white/40 leading-relaxed font-light max-w-sm mx-auto leading-relaxed">
                                                Biological data synchronized. Neural engines nominal. Ghost Writer is now fully integrated with your workspace.
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-2 gap-8 w-full max-w-md pt-6">
                                            <div className="flex flex-col items-center gap-3 p-4 rounded-[2rem] bg-white/[0.02] border border-white/5">
                                                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10">
                                                    <span className="text-[9px] font-mono text-white/60">Ctrl</span>
                                                    <span className="text-[9px] font-mono text-white/20">+</span>
                                                    <span className="text-[9px] font-mono text-white/60">B</span>
                                                </div>
                                                <span className="text-[10px] font-mono uppercase tracking-widest text-white/30">Toggle_Interface</span>
                                            </div>

                                            <div className="flex flex-col items-center gap-3 p-4 rounded-[2rem] bg-white/[0.02] border border-white/5">
                                                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10">
                                                    <span className="text-[9px] font-mono text-white/60">Ctrl</span>
                                                    <span className="text-[9px] font-mono text-white/20">+</span>
                                                    <span className="text-[9px] font-mono text-white/60">H</span>
                                                </div>
                                                <span className="text-[10px] font-mono uppercase tracking-widest text-white/30">Capture_Screenshot</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </div>

                    {/* Footer Actions */}
                    <div className="p-12 pt-0 flex items-center justify-between">
                        <button
                            onClick={() => currentStep > 0 && setCurrentStep(currentStep - 1)}
                            className={`text-[10px] font-mono uppercase tracking-[0.3em] transition-all flex items-center gap-2 ${currentStep === 0 ? 'opacity-0 pointer-events-none' : 'text-white/20 hover:text-accent-primary'}`}
                        >
                            <span className="text-lg leading-none">←</span>
                            <span>BACK_PROTOCOL</span>
                        </button>
                        
                        <button
                            onClick={handleNext}
                            disabled={savingProfile || (currentStep === 1 && !profile.fullName.trim()) || (currentStep === 2 && !canProceedFromDiagnosis(systemInfo))}
                            className="group relative flex items-center justify-center gap-4 bg-accent-primary text-[#020205] px-12 h-16 rounded-2xl font-mono font-bold text-[10px] uppercase tracking-[0.3em] overflow-hidden transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-20 disabled:grayscale disabled:scale-100"
                        >
                            <div className="absolute inset-0 bg-white/30 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                            <span className="relative z-10">{savingProfile ? 'SYNCING...' : currentStep === steps.length - 1 ? 'INIT_SEQUENCE' : 'NEXT_PROTOCOL'}</span>
                            <ChevronRight className="w-4 h-4 relative z-10" />
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default SetupWizard;
