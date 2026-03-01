import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ArrowRight, ArrowLeft, Key, Mic, Brain, FileText, Sparkles, Monitor, Activity, ShieldCheck, AlertCircle, Loader2, Globe, Command } from 'lucide-react';

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

const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete }) => {
    const [currentStep, setCurrentStep] = useState(0);
    const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
    const [isChecking, setIsChecking] = useState(false);
    const [systemInfo, setSystemInfo] = useState<{
        gpu: { success: boolean; info?: any; error?: string } | null;
        ollama: { success: boolean; running: boolean; models?: any[]; error?: string } | null;
        whisper: { hasBinary: boolean; hasModel: boolean; isDownloading: boolean; selectedModel: string } | null;
    }>({ gpu: null, ollama: null, whisper: null });

    const [apiKeys, setApiKeys] = useState({
        groq: '',
        openai: '',
        claude: '',
        deepseek: '',
        gemini: ''
    });

    const [primaryProvider, setPrimaryProvider] = useState<'gemini' | 'groq'>('gemini');

    const steps: SetupStep[] = [
        {
            id: 'welcome',
            title: 'Welcome',
            description: 'Your discrete AI companion for meetings and interviews.',
            icon: <Sparkles className="w-5 h-5" />,
            required: true
        },
        {
            id: 'diagnosis',
            title: 'Diagnosis',
            description: 'Optimizing for your specific hardware architecture.',
            icon: <Monitor className="w-5 h-5" />,
            required: true
        },
        {
            id: 'api-keys',
            title: 'Intelligence',
            description: 'Connect cloud brains or stick to local privacy.',
            icon: <Brain className="w-5 h-5" />,
            required: false
        },
        {
            id: 'microphone',
            title: 'Audio',
            description: 'Configuring secure system audio capture.',
            icon: <Mic className="w-5 h-5" />,
            required: false
        },
        {
            id: 'context',
            title: 'Context',
            description: 'Feed the AI your background for better answers.',
            icon: <FileText className="w-5 h-5" />,
            required: false
        },
        {
            id: 'ready',
            title: 'Ready',
            description: 'Everything is set. Ghost Writer is now active.',
            icon: <Check className="w-5 h-5" />,
            required: true
        }
    ];

    const performDiagnosis = async () => {
        setIsChecking(true);
        try {
            const [gpu, ollama, whisper] = await Promise.all([
                window.electronAPI.getGpuInfo(),
                window.electronAPI.checkOllamaStatus(),
                window.electronAPI.getWhisperStatus()
            ]);

            let updatedWhisper = whisper;

            if (gpu?.success && gpu.info && whisper) {
                const vram = gpu.info.vramGB;
                let recommended = whisper.selectedModel;
                
                if (vram >= 8) recommended = 'medium';
                else if (vram >= 4) recommended = 'small';
                else if (vram > 0) recommended = 'base';

                if (recommended !== whisper.selectedModel) {
                    await window.electronAPI.invoke('set-local-whisper-model', recommended);
                    updatedWhisper = await window.electronAPI.getWhisperStatus();
                }
            }

            setSystemInfo({ gpu, ollama, whisper: updatedWhisper });
        } catch (error) {
            console.error('Diagnosis failed:', error);
        } finally {
            setIsChecking(false);
        }
    };

    useEffect(() => {
        if (currentStep === 1) {
            performDiagnosis();
        }
    }, [currentStep]);

    const handleNext = async () => {
        if (currentStep === 2) {
            const promises = [];
            if (apiKeys.groq) promises.push(window.electronAPI.setGroqApiKey(apiKeys.groq));
            if (apiKeys.openai) promises.push(window.electronAPI.setOpenaiApiKey(apiKeys.openai));
            if (apiKeys.claude) promises.push(window.electronAPI.setClaudeApiKey(apiKeys.claude));
            if (apiKeys.deepseek) promises.push(window.electronAPI.setDeepseekApiKey(apiKeys.deepseek));
            if (apiKeys.gemini) promises.push(window.electronAPI.setGeminiApiKey(apiKeys.gemini));

            try {
                await Promise.all(promises);
            } catch (error) {
                console.error('Failed to save API keys:', error);
            }
        }

        if (currentStep < steps.length - 1) {
            setCurrentStep(currentStep + 1);
            setCompletedSteps(prev => new Set([...prev, currentStep]));
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

    const canProceed = () => {
        switch (currentStep) {
            case 1: return !isChecking;
            default: return true;
        }
    };

    const renderDiagnosisCard = (title: string, icon: React.ReactNode, status: 'loading' | 'success' | 'warning' | 'error', details: string, sub?: string) => {
        const statusColors = {
            loading: 'opacity-50',
            success: 'text-text-primary',
            warning: 'text-orange-400',
            error: 'text-red-400'
        };

        return (
            <div className={`p-4 rounded-xl bg-white/5 border border-white/10 flex items-start gap-4 transition-all duration-300 hover:bg-white/10`}>
                <div className={`mt-1 text-text-secondary`}>{icon}</div>
                <div className="flex-1 min-w-0 text-left text-xs">
                    <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-text-tertiary uppercase tracking-widest text-[10px]">{title}</span>
                        {status === 'loading' && <Loader2 className="w-3 h-3 animate-spin text-text-tertiary" />}
                        {status === 'success' && <ShieldCheck className="w-3 h-3 text-text-primary opacity-50" />}
                    </div>
                    <p className={`font-medium ${statusColors[status]}`}>{details}</p>
                    {sub && <p className="text-text-tertiary mt-0.5">{sub}</p>}
                </div>
            </div>
        );
    };

    const renderStepContent = () => {
        switch (currentStep) {
            case 0:
                return (
                    <div className="text-center py-4">
                        <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-8 border border-white/10">
                            <Sparkles className="w-8 h-8 text-text-primary" />
                        </div>
                        <h2 className="text-3xl font-light tracking-tight text-text-primary mb-4 italic">Ghost Writer</h2>
                        <p className="text-text-secondary max-w-sm mx-auto leading-relaxed mb-12">
                            High-fidelity meeting and interview assistance. 
                            Built for professionals who require discretion and accuracy.
                        </p>
                        <div className="grid grid-cols-3 gap-6 opacity-80 max-w-lg mx-auto border-t border-white/5 pt-12">
                            <div className="space-y-2">
                                <Activity className="w-5 h-5 mx-auto text-text-tertiary" />
                                <span className="block text-[10px] uppercase tracking-tighter text-text-tertiary">Live Detection</span>
                            </div>
                            <div className="space-y-2">
                                <ShieldCheck className="w-5 h-5 mx-auto text-text-tertiary" />
                                <span className="block text-[10px] uppercase tracking-tighter text-text-tertiary">Zero-Cloud Option</span>
                            </div>
                            <div className="space-y-2">
                                <Globe className="w-5 h-5 mx-auto text-text-tertiary" />
                                <span className="block text-[10px] uppercase tracking-tighter text-text-tertiary">Context Aware</span>
                            </div>
                        </div>
                    </div>
                );

            case 1:
                return (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                        <div className="grid grid-cols-1 gap-3 max-w-sm mx-auto pt-4">
                            {renderDiagnosisCard(
                                'GPU Bridge',
                                <Monitor className="w-4 h-4" />,
                                systemInfo.gpu ? (systemInfo.gpu.success ? 'success' : 'error') : 'loading',
                                systemInfo.gpu?.success ? systemInfo.gpu.info.name : (systemInfo.gpu?.error || 'Analyzing hardware...'),
                                systemInfo.gpu?.success ? `${systemInfo.gpu.info.vramGB}GB VRAM available` : undefined
                            )}
                            {renderDiagnosisCard(
                                'Local LLM',
                                <Brain className="w-4 h-4" />,
                                systemInfo.ollama ? (systemInfo.ollama.running ? 'success' : 'warning') : 'loading',
                                systemInfo.ollama?.running ? 'Ollama Engine active' : 'Ollama not detected',
                                systemInfo.ollama?.running ? `${systemInfo.ollama.models?.length || 0} models found` : 'Local privacy requires Ollama'
                            )}
                            {renderDiagnosisCard(
                                'Transcription',
                                <Mic className="w-4 h-4" />,
                                systemInfo.whisper ? (systemInfo.whisper.hasBinary && systemInfo.whisper.hasModel ? 'success' : 'warning') : 'loading',
                                systemInfo.whisper ? (systemInfo.whisper.hasBinary ? `Whisper ${systemInfo.whisper.selectedModel} ready` : 'Framework missing') : 'Initializing STT core...',
                                systemInfo.whisper?.hasModel ? 'GPU acceleration mapped' : 'Models will load on demand'
                            )}
                        </div>
                    </div>
                );

            case 2:
                return (
                    <div className="space-y-8 text-left max-w-sm mx-auto py-2">
                        <div className="space-y-2">
                            <label className="block text-[10px] uppercase tracking-widest text-text-tertiary font-bold">Cloud Provider</label>
                            <select 
                                value={primaryProvider}
                                onChange={(e) => setPrimaryProvider(e.target.value as any)}
                                className="w-full h-11 px-4 bg-white/5 border border-white/10 rounded-xl text-text-primary text-xs focus:outline-none focus:border-white/30 transition-all cursor-pointer appearance-none"
                            >
                                <option value="gemini" className="bg-bg-main">Google Gemini (Free / Pro)</option>
                                <option value="groq" className="bg-bg-main">Groq Inference (Free / Fast)</option>
                            </select>
                        </div>

                        {primaryProvider === 'gemini' ? (
                            <div className="space-y-2">
                                <label className="block text-[10px] uppercase tracking-widest text-text-tertiary font-bold">Gemini API Key</label>
                                <input
                                    type="password"
                                    value={apiKeys.gemini}
                                    onChange={(e) => setApiKeys(prev => ({ ...prev, gemini: e.target.value }))}
                                    placeholder="AIzaSy..."
                                    className="w-full h-11 px-4 bg-white/5 border border-white/10 rounded-xl text-text-primary text-xs focus:outline-none focus:border-white/30 transition-all placeholder:text-text-tertiary/30"
                                />
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <label className="block text-[10px] uppercase tracking-widest text-text-tertiary font-bold">Groq API Key</label>
                                <input
                                    type="password"
                                    value={apiKeys.groq}
                                    onChange={(e) => setApiKeys(prev => ({ ...prev, groq: e.target.value }))}
                                    placeholder="gsk_..."
                                    className="w-full h-11 px-4 bg-white/5 border border-white/10 rounded-xl text-text-primary text-xs focus:outline-none focus:border-white/30 transition-all placeholder:text-text-tertiary/30"
                                />
                            </div>
                        )}

                        <div className="flex gap-4">
                            <div className="flex-1 space-y-2">
                                <label className="block text-[10px] uppercase tracking-widest text-text-tertiary font-bold">OpenAI</label>
                                <input
                                    type="password"
                                    value={apiKeys.openai}
                                    onChange={(e) => setApiKeys(prev => ({ ...prev, openai: e.target.value }))}
                                    placeholder="sk-..."
                                    className="w-full h-11 px-4 bg-white/5 border border-white/10 rounded-xl text-text-primary text-xs focus:outline-none focus:border-white/30 transition-all placeholder:text-text-tertiary/30"
                                />
                            </div>
                            <div className="flex-1 space-y-2">
                                <label className="block text-[10px] uppercase tracking-widest text-text-tertiary font-bold">Claude</label>
                                <input
                                    type="password"
                                    value={apiKeys.claude}
                                    onChange={(e) => setApiKeys(prev => ({ ...prev, claude: e.target.value }))}
                                    placeholder="sk-ant-..."
                                    className="w-full h-11 px-4 bg-white/5 border border-white/10 rounded-xl text-text-primary text-xs focus:outline-none focus:border-white/30 transition-all placeholder:text-text-tertiary/30"
                                />
                            </div>
                        </div>

                        {!apiKeys.gemini && !apiKeys.groq && !apiKeys.openai && (
                            <p className="text-[10px] text-center text-text-tertiary italic opacity-60">
                                Leave blank to use local Ollama exclusively.
                            </p>
                        )}
                    </div>
                );

            case 3:
                return (
                    <div className="text-center space-y-8 py-6">
                        <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto border border-white/10">
                            <Mic className="w-8 h-8 text-text-primary" />
                        </div>
                        <p className="text-text-secondary max-w-sm mx-auto leading-relaxed">
                            Ghost Writer captures system audio buffers locally for zero-latency transcription. 
                            Everything stays on your machine.
                        </p>
                        <div className="max-w-xs mx-auto text-left space-y-3 pt-6 border-t border-white/5 font-mono text-[10px] uppercase tracking-tighter text-text-tertiary">
                            <div className="flex items-center gap-2">
                                <div className="w-1 h-1 bg-white/40 rounded-full" />
                                <span>WASAPI Loopback Capture</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-1 h-1 bg-white/40 rounded-full" />
                                <span>Rust-Native Resampling</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-1 h-1 bg-white/40 rounded-full" />
                                <span>Undetectable Logic Agent</span>
                            </div>
                        </div>
                    </div>
                );

            case 4:
                return (
                    <div className="text-center space-y-8 py-4">
                        <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto border border-white/10">
                            <FileText className="w-6 h-6 text-text-primary" />
                        </div>
                        <h3 className="text-xl font-light text-text-primary">Career Intelligence</h3>
                        <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto">
                            <div className="bg-white/5 p-5 rounded-2xl border border-white/5 text-left group hover:border-white/20 transition-all">
                                <span className="block text-[10px] font-bold text-text-tertiary uppercase tracking-widest mb-1">Portfolio</span>
                                <p className="text-xs text-text-secondary leading-normal">Feed resume and personal projects.</p>
                            </div>
                            <div className="bg-white/5 p-5 rounded-2xl border border-white/5 text-left group hover:border-white/20 transition-all">
                                <span className="block text-[10px] font-bold text-text-tertiary uppercase tracking-widest mb-1">Directives</span>
                                <p className="text-xs text-text-secondary leading-normal">Meeting goals and interviewer notes.</p>
                            </div>
                        </div>
                        <p className="text-[10px] text-text-tertiary italic">Skip now, customize in Settings later.</p>
                    </div>
                );

            case 5:
                return (
                    <div className="text-center space-y-12 py-10">
                        <div className="relative w-24 h-24 mx-auto">
                            <motion.div 
                                animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.1, 0.3] }}
                                transition={{ repeat: Infinity, duration: 3 }}
                                className="absolute inset-0 bg-white/20 rounded-full blur-2xl"
                            />
                            <div className="relative w-24 h-24 bg-white flex items-center justify-center rounded-3xl shadow-2xl">
                                <Check className="w-10 h-10 text-black" />
                            </div>
                        </div>
                        <div className="space-y-4">
                            <h2 className="text-3xl font-light tracking-tight text-text-primary">Deployment Ready</h2>
                            <p className="text-text-secondary max-w-sm mx-auto leading-relaxed">
                                Ghost Writer is optimized for your hardware. <br/>Discretion is now enabled.
                            </p>
                        </div>
                        <div className="flex justify-center gap-6 font-mono text-[9px] uppercase tracking-widest text-text-tertiary opacity-40">
                            <div className="flex items-center gap-2">
                                <Command className="w-3 h-3" />
                                <span>Shift + H Toggle</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Command className="w-3 h-3" />
                                <span>Ctrl + B Recap</span>
                            </div>
                        </div>
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-md flex items-center justify-center p-6">
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-xl bg-white/[0.03] border border-white/10 rounded-[2.5rem] shadow-[0_32px_128px_-16px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col backdrop-blur-3xl relative"
            >
                {/* Subtle Glass Highlight */}
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />

                {/* Progress Indicators */}
                <div className="px-10 pt-10 pb-4 flex items-center justify-between gap-2">
                    {steps.map((step, index) => (
                        <div key={step.id} className="flex-1 flex flex-col gap-2">
                            <div className={`h-[2px] rounded-full transition-all duration-700 ${
                                index <= currentStep ? 'bg-text-primary h-[3px]' : 'bg-white/10'
                            }`} />
                            <span className={`text-[8px] uppercase tracking-widest font-bold transition-opacity duration-500 ${
                                index === currentStep ? 'opacity-100 text-text-primary' : 'opacity-0'
                            }`}>{step.title}</span>
                        </div>
                    ))}
                </div>

                {/* Main Content Area */}
                <div className="px-12 py-10 min-h-[440px] flex flex-col justify-center relative">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentStep}
                            initial={{ opacity: 0, scale: 0.98, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 1.02, y: -10 }}
                            transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                        >
                            {renderStepContent()}
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Action Footer */}
                <div className="px-12 pb-12 flex items-center justify-between mt-auto">
                    <button
                        onClick={handleBack}
                        disabled={currentStep === 0}
                        className="h-12 px-6 flex items-center gap-2 text-text-tertiary hover:text-text-primary disabled:opacity-0 transition-all text-xs font-bold uppercase tracking-widest"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back
                    </button>

                    <button
                        onClick={handleNext}
                        disabled={!canProceed()}
                        className="h-14 min-w-[160px] bg-white text-black hover:bg-white/90 disabled:bg-white/10 disabled:text-text-tertiary rounded-2xl flex items-center justify-center gap-3 font-bold transition-all text-xs uppercase tracking-[0.2em] shadow-[0_10px_40px_-10px_rgba(255,255,255,0.3)] disabled:shadow-none"
                    >
                        {currentStep === steps.length - 1 ? 'Activate' : 'Next'}
                        {currentStep < steps.length - 1 && <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />}
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

export default SetupWizard;
