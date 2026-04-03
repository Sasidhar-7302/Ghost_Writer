import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ArrowRight, ArrowLeft, Mic, Brain, Sparkles, Monitor, Activity, ShieldCheck, Loader2, Globe, Command } from 'lucide-react';
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

const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete }) => {
    const [currentStep, setCurrentStep] = useState(0);
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
            description: 'Your discrete AI companion for meetings and interviews.',
            icon: <Sparkles className="w-6 h-6" />,
            required: true
        },
        {
            id: 'diagnosis',
            title: 'Diagnosis & Setup',
            description: 'Optimizing and downloading models for your hardware.',
            icon: <Monitor className="w-6 h-6" />,
            required: true
        },
        {
            id: 'ready',
            title: 'Ready',
            description: 'Everything is set. Ghost Writer is now active.',
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

        if (gpuResult.status === 'rejected') {
            console.error('GPU diagnosis failed:', gpuResult.reason);
        }
        if (ollamaResult.status === 'rejected') {
            console.error('Ollama diagnosis failed:', ollamaResult.reason);
        }
        if (whisperResult.status === 'rejected') {
            console.error('Whisper diagnosis failed:', whisperResult.reason);
        }
        if (fullPrivacyResult.status === 'rejected') {
            console.error('Full Privacy diagnosis failed:', fullPrivacyResult.reason);
        }

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
        let pollInterval: NodeJS.Timeout;

        if (currentStep === 1) {
            performDiagnosis().then(() => {
                // Keep diagnosis current while the user is on this step.
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
                                setCurrentStep(2);
                            }, 1500);
                        }

                        return nextState;
                    });
                }, 2000);
            });
        }

        return () => {
            if (pollInterval) clearInterval(pollInterval);
        };
    }, [currentStep]);

    const handleNext = async () => {
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

    const canProceed = () => {
        switch (currentStep) {
            case 1:
                return canProceedFromDiagnosis(systemInfo);
            default: return true;
        }
    };

    const renderDiagnosisCard = (title: string, icon: React.ReactNode, status: 'loading' | 'success' | 'warning' | 'error', details: string, sub?: string) => {
        const statusColors = {
            loading: 'text-white/70',
            success: 'text-white',
            warning: 'text-orange-400',
            error: 'text-red-400'
        };

        return (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.8)] transition-all duration-300 hover:border-white/20 hover:bg-white/10">
                <div className="flex items-start gap-4">
                <div className="mt-1 text-[var(--accent-primary)]">{icon}</div>
                <div className="flex-1 min-w-0 text-left text-sm">
                    <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-white/40 uppercase tracking-widest text-xs">{title}</span>
                        {status === 'loading' && <Loader2 className="w-4 h-4 animate-spin text-white/40" />}
                        {status === 'success' && <ShieldCheck className="w-4 h-4 text-[var(--accent-primary)]" />}
                    </div>
                    <p className={`font-medium ${statusColors[status]}`}>{details}</p>
                    {sub && <p className="text-white/40 mt-0.5">{sub}</p>}
                </div>
                </div>
            </div>
        );
    };

    const renderStepContent = () => {
        const diagnosisComplete = hasCompletedDiagnosis(systemInfo);
        const fullPrivacyBlocking = isBlockedByFullPrivacy(systemInfo);
        const whisperReady = !!(systemInfo.whisper && (systemInfo.whisper.hasOperationalServer ?? systemInfo.whisper.hasBinary));
        const gpuName = systemInfo.gpu?.info?.name || 'Analyzing hardware...';
        const gpuVram = systemInfo.gpu?.info?.vramGB;

        switch (currentStep) {
            case 0:
                return (
                    <div className="text-center py-4">
                        <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.22),rgba(18,18,26,0.92))] shadow-[0_24px_60px_-24px_rgba(56,189,248,0.55)]">
                            <Sparkles className="w-10 h-10 text-[var(--accent-primary)]" />
                        </div>
                        <h2 className="mb-4 text-4xl font-light tracking-tight text-white italic">Ghost Writer</h2>
                        <p className="text-base text-white/70 max-w-sm mx-auto leading-relaxed mb-12">
                            High-fidelity meeting and interview assistance with the same visual system as the core app.
                            Private by default, fast in live conversations, and tuned for screenshot-aware answers.
                        </p>
                        <div className="mx-auto grid max-w-lg grid-cols-3 gap-6 border-t border-white/10 pt-10 opacity-90">
                            <div className="space-y-3">
                                <Activity className="mx-auto h-6 w-6 text-[var(--accent-primary)]" />
                                <span className="block text-xs font-medium uppercase tracking-wider text-white/40">Live Detection</span>
                            </div>
                            <div className="space-y-3">
                                <ShieldCheck className="mx-auto h-6 w-6 text-[var(--accent-primary)]" />
                                <span className="block text-xs font-medium uppercase tracking-wider text-white/40">Zero-Cloud Option</span>
                            </div>
                            <div className="space-y-3">
                                <Globe className="mx-auto h-6 w-6 text-[var(--accent-primary)]" />
                                <span className="block text-xs font-medium uppercase tracking-wider text-white/40">Context Aware</span>
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
                                systemInfo.gpu?.success ? gpuName : (systemInfo.gpu?.error || 'Analyzing hardware...'),
                                systemInfo.gpu?.success && typeof gpuVram === 'number' ? `${gpuVram}GB VRAM available` : undefined
                            )}
                            {renderDiagnosisCard(
                                'Local LLM',
                                <Brain className="w-4 h-4" />,
                                systemInfo.ollama ? (systemInfo.ollama.running ? 'success' : 'warning') : 'loading',
                                systemInfo.ollama?.running ? 'Ollama Engine active' : 'Ollama not detected',
                                systemInfo.fullPrivacy?.enabled
                                    ? (systemInfo.ollama?.running ? `${systemInfo.ollama.models?.length || 0} models found` : 'Required for Full Privacy Mode')
                                    : (systemInfo.ollama?.running ? `${systemInfo.ollama.models?.length || 0} models found` : 'Optional unless you want a local-only LLM')
                            )}
                            {renderDiagnosisCard(
                                'Transcription',
                                <Mic className="w-4 h-4" />,
                                systemInfo.whisper ? (whisperReady && systemInfo.whisper.hasModel ? 'success' : 'warning') : 'loading',
                                systemInfo.whisper ? (whisperReady ? `Whisper ${systemInfo.whisper.selectedModel} ready` : 'Local Whisper not installed') : 'Initializing STT core...',
                                systemInfo.fullPrivacy?.enabled
                                    ? (systemInfo.whisper?.hasModel ? 'Required for offline transcription' : 'Download the local model to stay fully offline')
                                    : (systemInfo.whisper?.hasModel ? 'Local transcription available' : 'Optional: configure local or cloud STT later')
                            )}
                        </div>
                        <div className={`mx-auto max-w-sm rounded-2xl border px-4 py-3 text-left text-sm ${systemInfo.fullPrivacy?.enabled
                            ? (fullPrivacyBlocking
                                ? 'border-red-500/30 bg-red-500/10 text-red-100'
                                : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-100')
                            : 'border-white/10 bg-white/5 text-white/70'
                            }`}>
                            {!diagnosisComplete ? (
                                <p>Checking your local runtime options and fallback paths.</p>
                            ) : systemInfo.fullPrivacy?.enabled ? (
                                <p>
                                    {fullPrivacyBlocking
                                        ? 'Full Privacy Mode is enabled, so Local Whisper and Ollama must be ready before you continue.'
                                        : 'Full Privacy Mode prerequisites look good. You can continue with a fully local setup.'}
                                </p>
                            ) : (
                                <p>
                                    Local Whisper, Ollama, and GPU acceleration are optional. You can continue now and configure cloud STT or cloud LLM providers later in Settings.
                                </p>
                            )}
                        </div>
                    </div>
                );

            case 2:
                return (
                    <div className="text-center space-y-12 py-10">
                        <div className="relative w-24 h-24 mx-auto">
                            <motion.div
                                animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.1, 0.3] }}
                                transition={{ repeat: Infinity, duration: 3 }}
                                className="absolute inset-0 rounded-full blur-2xl"
                                style={{ backgroundColor: 'rgba(56, 189, 248, 0.2)' }}
                            />
                            <div className="relative flex h-24 w-24 items-center justify-center rounded-3xl border border-white/10 bg-\[#12121a\] shadow-[0_32px_90px_-40px_rgba(56,189,248,0.8)]">
                                <Check className="h-10 w-10 text-[var(--accent-primary)]" />
                            </div>
                        </div>
                        <div className="space-y-4">
                            <h2 className="text-4xl font-light tracking-tight text-white">Deployment Ready</h2>
                            <p className="text-base text-white/70 max-w-sm mx-auto leading-relaxed">
                                Ghost Writer is ready to launch. You can keep using local runtimes or switch to cloud STT and cloud LLM providers later in Settings.
                            </p>
                        </div>
                        <div className="flex justify-center gap-8 font-mono text-xs uppercase tracking-widest text-white/40 opacity-50">
                            <div className="flex items-center gap-2">
                                <Command className="w-4 h-4" />
                                <span>Shift + H Toggle</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Command className="w-4 h-4" />
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
        <div className="fixed inset-0 z-[200] bg-[var(--overlay-bg)] backdrop-blur-xl flex items-center justify-center p-6">
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                className={`relative flex w-full max-w-xl flex-col overflow-hidden rounded-[2.5rem] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,26,0.98),rgba(5,5,8,0.98))] shadow-[0_32px_128px_-16px_rgba(0,0,0,0.85)] ${navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? 'pt-8' : ''}`}
            >
                {/* Subtle Glass Highlight */}
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.12),transparent_45%)]" />

                {/* Progress Indicators */}
                <div className="px-10 pt-10 pb-4 flex items-center justify-between gap-2">
                    {steps.map((step, index) => (
                        <div key={step.id} className="flex-1 flex flex-col gap-2">
                            <div className={`h-[2px] rounded-full transition-all duration-700 ${index <= currentStep ? 'h-[3px] bg-[var(--accent-primary)]' : 'bg-border-subtle'}`} />
                            <span className={`text-xs uppercase tracking-widest font-bold transition-opacity duration-500 ${index === currentStep ? 'opacity-100 text-white' : 'opacity-0'
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
                        className="h-12 px-6 flex items-center gap-2 text-white/40 hover:text-white disabled:opacity-0 transition-all text-sm font-bold uppercase tracking-widest"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back
                    </button>

                    <button
                        onClick={handleNext}
                        disabled={!canProceed()}
                        className="flex h-14 min-w-[180px] items-center justify-center gap-3 rounded-2xl bg-[var(--accent-primary)] text-black shadow-[0_16px_40px_-18px_rgba(56,189,248,0.85)] transition-all text-sm font-bold uppercase tracking-[0.2em] hover:brightness-110 disabled:bg-bg-input disabled:text-white/40 disabled:shadow-none"
                    >
                        {currentStep === steps.length - 1 ? 'Activate' : currentStep === 1 && !systemInfo.fullPrivacy?.enabled ? 'Continue' : 'Next'}
                        {currentStep < steps.length - 1 && <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />}
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

export default SetupWizard;
