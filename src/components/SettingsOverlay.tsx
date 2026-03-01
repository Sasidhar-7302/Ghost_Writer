import React, { useState, useEffect } from 'react';
import {
    X, Mic, Speaker, Monitor, Keyboard, User, LifeBuoy, LogOut, Upload,
    ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
    Camera, RotateCcw, Eye, Layout, MessageSquare, Crop,
    ChevronDown, Check, BadgeCheck, Power, Palette, Calendar, Ghost, Sun, Moon, RefreshCw, Info, Globe, FlaskConical, Terminal, Settings, Activity, ExternalLink, FileText, Cpu, Loader2, Download, Briefcase, ClipboardList
} from 'lucide-react';
import { analytics } from '../lib/analytics/analytics.service';
import icon from "./icon.ico";
import { AboutSection } from './AboutSection';
import { AIProvidersSettings } from './settings/AIProvidersSettings';
import { AIModelsSettings } from './settings/AIModelsSettings';
import { SessionSettings } from './settings/SessionSettings';
import { motion, AnimatePresence } from 'framer-motion';

interface CustomSelectProps {
    label: string;
    icon: React.ReactNode;
    value: string;
    options: MediaDeviceInfo[];
    onChange: (value: string) => void;
    placeholder?: string;
}

const CustomSelect: React.FC<CustomSelectProps> = ({ label, icon, value, options, onChange, placeholder = "Select device" }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedLabel = options.find(o => o.deviceId === value)?.label || placeholder;

    return (
        <div className="bg-bg-card rounded-xl p-4 border border-border-subtle" ref={containerRef}>
            {label && (
                <div className="flex items-center gap-2 mb-3">
                    <span className="text-text-secondary">{icon}</span>
                    <label className="text-xs font-medium text-text-primary uppercase tracking-wide">{label}</label>
                </div>
            )}

            <div className="relative">
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="w-full bg-bg-input border border-border-subtle rounded-lg px-3 py-2.5 text-sm text-text-primary flex items-center justify-between hover:bg-bg-elevated transition-colors"
                >
                    <span className="truncate pr-4">{selectedLabel}</span>
                    <ChevronDown size={14} className={`text-text-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {isOpen && (
                    <div className="absolute top-full left-0 w-full mt-1 bg-bg-elevated border border-border-subtle rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto animated fadeIn">
                        <div className="p-1 space-y-0.5">
                            {options.map((device) => (
                                <button
                                    key={device.deviceId}
                                    onClick={() => {
                                        onChange(device.deviceId);
                                        setIsOpen(false);
                                    }}
                                    className={`w-full text-left px-3 py-2 text-sm rounded-md flex items-center justify-between group transition-colors ${value === device.deviceId ? 'bg-bg-input hover:bg-bg-elevated text-text-primary' : 'text-text-secondary hover:bg-bg-input hover:text-text-primary'}`}
                                >
                                    <span className="truncate">{device.label || `Device ${device.deviceId.slice(0, 5)}...`}</span>
                                    {value === device.deviceId && <Check size={14} className="text-accent-primary" />}
                                </button>
                            ))}
                            {options.length === 0 && (
                                <div className="px-3 py-2 text-sm text-gray-500 italic">No devices found</div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

interface ProviderOption {
    id: string;
    label: string;
    badge?: string | null;
    desc: string;
    color: string;
    icon: React.ReactNode;
}

interface ProviderSelectProps {
    value: string;
    options: ProviderOption[];
    onChange: (value: string) => void;
}

const ProviderSelect: React.FC<ProviderSelectProps> = ({ value, options, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selected = options.find(o => o.id === value);

    const getBadgeStyle = () => {
        return 'bg-white/10 text-text-primary border-white/20';
    };

    const getIconStyle = (isSelectedItem: boolean = false) => {
        if (isSelectedItem) return 'bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.3)]';
        return 'bg-white/5 text-text-tertiary group-hover:text-text-primary group-hover:bg-white/10 transition-all';
    };

    return (
        <div ref={containerRef} className="relative z-20 font-sans">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full group bg-bg-input border border-border-subtle hover:border-border-muted shadow-sm rounded-xl p-2.5 pr-3.5 flex items-center justify-between transition-all duration-200 outline-none focus:ring-2 focus:ring-accent-primary/20 ${isOpen ? 'ring-2 ring-accent-primary/20 border-accent-primary/50' : 'hover:shadow-md'}`}
            >
                {selected ? (
                    <div className="flex items-center gap-3 overflow-hidden">
                        <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 transition-all duration-300 ${getIconStyle()}`}>
                            {selected.icon}
                        </div>
                        <div className="min-w-0 flex-1 text-left">
                            <div className="flex items-center gap-2">
                                <span className="text-[13px] font-semibold text-text-primary truncate leading-tight">{selected.label}</span>
                                {selected.badge && (
                                    <span className={`px-1.5 py-[1px] rounded-[6px] text-[9px] font-bold uppercase tracking-wider border ${getBadgeStyle()}`}>
                                        {selected.badge}
                                    </span>
                                )}
                            </div>
                            {/* Short description for trigger */}
                            <span className="text-[11px] text-text-tertiary truncate block leading-tight mt-0.5">{selected.desc}</span>
                        </div>
                    </div>
                ) : <span className="text-text-secondary px-2 text-sm">Select Provider</span>}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-text-tertiary transition-transform duration-300 group-hover:bg-bg-surface ${isOpen ? 'rotate-180 bg-bg-surface text-text-primary' : ''}`}>
                    <ChevronDown size={14} strokeWidth={2.5} />
                </div>
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 4, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.98 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="absolute top-full left-0 w-full mt-2 bg-bg-elevated/90 backdrop-blur-xl border border-border-subtle rounded-xl shadow-2xl overflow-hidden ring-1 ring-black/5"
                    >
                        <div className="max-h-[320px] overflow-y-auto p-1.5 space-y-0.5 custom-scrollbar">
                            {options.map(option => {
                                const isSelected = value === option.id;
                                return (
                                    <button
                                        key={option.id}
                                        onClick={() => { onChange(option.id); setIsOpen(false); }}
                                        className={`w-full rounded-[10px] p-2 flex items-center gap-3 transition-all duration-200 group relative ${isSelected ? 'bg-bg-item-active shadow-inner' : 'hover:bg-bg-item-surface'}`}
                                    >
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-200 ${isSelected ? 'scale-100' : 'scale-95 group-hover:scale-100'} ${getIconStyle(false)}`}>
                                            {option.icon}
                                        </div>
                                        <div className="flex-1 min-w-0 text-left">
                                            <div className="flex items-center justify-between mb-0.5">
                                                <span className={`text-[13px] font-medium transition-colors ${isSelected ? 'text-text-primary' : 'text-text-secondary'}`}>{option.label}</span>
                                                {isSelected && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}><Check size={14} className="text-accent-primary" strokeWidth={3} /></motion.div>}
                                            </div>
                                            <span className={`text-[11px] block truncate transition-colors ${isSelected ? 'text-text-primary/70' : 'text-text-tertiary'}`}>{option.desc}</span>
                                        </div>
                                        {/* Hover Indicator */}
                                        {!isSelected && <div className="absolute inset-0 rounded-[10px] ring-1 ring-inset ring-white/0 group-hover:ring-white/5 pointer-events-none" />}
                                    </button>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

interface SettingsOverlayProps {
    isOpen: boolean;
    onClose: () => void;
}

const SettingsOverlay: React.FC<SettingsOverlayProps> = ({ isOpen, onClose }) => {
    const [activeTab, setActiveTab] = useState<'general' | 'ai-providers' | 'providers' | 'interview' | 'meeting' | 'audio' | 'keybinds' | 'about'>('general');
    const [isUndetectable, setIsUndetectable] = useState(false);
    const [disguiseMode, setDisguiseMode] = useState<'terminal' | 'settings' | 'activity' | 'none'>('none');
    const [openOnLogin, setOpenOnLogin] = useState(false);
    const [themeMode, setThemeMode] = useState<'system' | 'light' | 'dark'>('system');
    const [isThemeDropdownOpen, setIsThemeDropdownOpen] = useState(false);
    const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'uptodate' | 'error'>('idle');
    const themeDropdownRef = React.useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    // Sync with global state changes
    useEffect(() => {
        if (window.electronAPI?.onUndetectableChanged) {
            const unsubscribe = window.electronAPI.onUndetectableChanged((newState: boolean) => {
                setIsUndetectable(newState);
            });
            return () => unsubscribe();
        }
    }, []);

    useEffect(() => {
        if (window.electronAPI?.onDisguiseChanged) {
            const unsubscribe = window.electronAPI.onDisguiseChanged((newMode: any) => {
                setDisguiseMode(newMode);
            });
            return () => unsubscribe();
        }
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (themeDropdownRef.current && !themeDropdownRef.current.contains(event.target as Node)) {
                setIsThemeDropdownOpen(false);
            }
        };

        if (isThemeDropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isThemeDropdownOpen]);

    const [showTranscript, setShowTranscript] = useState(() => {
        const stored = localStorage.getItem('ghost_writer_interviewer_transcript');
        return stored !== 'false';
    });

    // Recognition Language
    const [recognitionLanguage, setRecognitionLanguage] = useState('');
    const [availableLanguages, setAvailableLanguages] = useState<Record<string, any>>({});
    const [languageOptions, setLanguageOptions] = useState<any[]>([]);

    useEffect(() => {
        const loadLanguages = async () => {
            if (window.electronAPI?.getRecognitionLanguages) {
                const langs = await window.electronAPI.getRecognitionLanguages();
                setAvailableLanguages(langs);

                // Define the specific order and labels requested by user
                const desiredOrder = [
                    { key: 'english-india', label: 'English (India)' },
                    { key: 'english-us', label: 'English (United States)' },
                    { key: 'english-uk', label: 'English (United Kingdom)' },
                    { key: 'english-au', label: 'English (Australia)' },
                    { key: 'english-ca', label: 'English (Canada)' },
                ];

                // Create options list starting with Auto
                const options = [
                    {
                        deviceId: 'auto',
                        label: 'Auto (Recommended)',
                        kind: 'audioinput' as MediaDeviceKind,
                        groupId: '',
                        toJSON: () => ({})
                    }
                ];

                // Add the rest if they exist in backend response
                desiredOrder.forEach(({ key, label }) => {
                    if (langs[key]) {
                        options.push({
                            deviceId: key,
                            label: label, // Use requested label
                            kind: 'audioinput' as MediaDeviceKind,
                            groupId: '',
                            toJSON: () => ({})
                        });
                    }
                });

                setLanguageOptions(options);

                // Load stored preference
                const stored = localStorage.getItem('ghost_writer_recognition_language');

                // If stored is 'auto' or not set, default to 'auto'
                if (!stored || stored === 'auto') {
                    setRecognitionLanguage('auto');
                    // We still need to set the actual backend language based on system locale
                    // But for UI, we show 'auto'
                    applyAutoLanguage(langs);
                } else if (langs[stored]) {
                    setRecognitionLanguage(stored);
                } else {
                    // Fallback if stored key no longer exists
                    setRecognitionLanguage('auto');
                    applyAutoLanguage(langs);
                }
            }
        };
        loadLanguages();
    }, []);

    const applyAutoLanguage = (langs: any) => {
        const systemLocale = navigator.language;
        let match = 'english-us';

        // Logic to find best match from available langs
        for (const [key, config] of Object.entries(langs)) {
            if ((config as any).primary === systemLocale || (config as any).alternates.includes(systemLocale)) {
                match = key;
                break;
            }
        }
        if (systemLocale === 'en-IN') match = 'english-india';

        // Send actual code to backend, but keep UI as 'auto' (handled by separating state if needed, 
        // but here 'recognitionLanguage' state tracks the dropdown value)
        if (window.electronAPI?.setRecognitionLanguage) {
            window.electronAPI.setRecognitionLanguage(match);
        }
    };

    const handleLanguageChange = (key: string) => {
        setRecognitionLanguage(key);
        localStorage.setItem('ghost_writer_recognition_language', key);

        if (key === 'auto') {
            applyAutoLanguage(availableLanguages);
        } else {
            if (window.electronAPI?.setRecognitionLanguage) {
                window.electronAPI.setRecognitionLanguage(key);
            }
        }
    };


    // Sync transcript setting
    useEffect(() => {
        const handleStorage = () => {
            const stored = localStorage.getItem('ghost_writer_interviewer_transcript');
            setShowTranscript(stored !== 'false');
        };
        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, []);

    // Theme Handlers
    const handleSetTheme = async (mode: 'system' | 'light' | 'dark') => {
        setThemeMode(mode);
        if (window.electronAPI?.setThemeMode) {
            await window.electronAPI.setThemeMode(mode);
        }
    };

    // Audio Settings
    const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
    const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedInput, setSelectedInput] = useState('');
    const [selectedOutput, setSelectedOutput] = useState('');
    const [micLevel, setMicLevel] = useState(0);
    const [useLegacyAudio, setUseLegacyAudio] = useState(false);

    // STT Provider settings
    const [sttProvider, setSttProvider] = useState<'google' | 'groq' | 'openai' | 'deepgram' | 'elevenlabs' | 'azure' | 'ibmwatson' | 'local-whisper'>('google');
    const [groqSttModel, setGroqSttModel] = useState('whisper-large-v3-turbo');
    const [whisperStatus, setWhisperStatus] = useState<{ hasBinary: boolean; hasModel: boolean; isDownloading: boolean; selectedModel: string; progress?: number; installedModels?: Record<string, boolean>; downloadingModel?: string | null; customBinaryPath?: string; customModelPath?: string } | null>(null);
    const [pendingWhisperModel, setPendingWhisperModel] = useState<string | null>(null);
    const [whisperApplied, setWhisperApplied] = useState(false);

    // Poll Whisper Status
    useEffect(() => {
        let interval: NodeJS.Timeout;
        const checkStatus = async () => {
            if (window.electronAPI?.getWhisperStatus) {
                const status = await window.electronAPI.getWhisperStatus();
                setWhisperStatus(status);
            }
        };

        if (sttProvider === 'local-whisper' || (whisperStatus && whisperStatus.isDownloading)) {
            checkStatus(); // Initial check
            interval = setInterval(checkStatus, 1000); // Poll every second
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [sttProvider, whisperStatus?.isDownloading]);

    // Listen for real-time download progress events
    useEffect(() => {
        // @ts-ignore
        const removeListener = window.electronAPI?.onWhisperDownloadProgress?.((data: { model: string; progress: number }) => {
            setWhisperStatus(prev => prev ? {
                ...prev,
                isDownloading: data.progress < 100,
                downloadingModel: data.progress < 100 ? data.model : null,
                progress: data.progress,
            } : null);

            // Refresh full status when download completes
            if (data.progress >= 100) {
                setTimeout(async () => {
                    // @ts-ignore
                    const status = await window.electronAPI?.getWhisperStatus?.();
                    if (status) setWhisperStatus(status);
                }, 500);
            }
        });
        return () => removeListener?.();
    }, []);

    const [sttGroqKey, setSttGroqKey] = useState('');
    const [sttOpenaiKey, setSttOpenaiKey] = useState('');
    const [sttDeepgramKey, setSttDeepgramKey] = useState('');
    const [sttElevenLabsKey, setSttElevenLabsKey] = useState('');
    const [sttAzureKey, setSttAzureKey] = useState('');
    const [sttAzureRegion, setSttAzureRegion] = useState('eastus');
    const [sttIbmKey, setSttIbmKey] = useState('');
    const [sttTestStatus, setSttTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
    const [sttTestError, setSttTestError] = useState('');
    const [sttSaving, setSttSaving] = useState(false);
    const [sttSaved, setSttSaved] = useState(false);
    const [googleServiceAccountPath, setGoogleServiceAccountPath] = useState<string | null>(null);
    const [hasStoredSttGroqKey, setHasStoredSttGroqKey] = useState(false);
    const [hasStoredSttOpenaiKey, setHasStoredSttOpenaiKey] = useState(false);
    const [hasStoredDeepgramKey, setHasStoredDeepgramKey] = useState(false);
    const [hasStoredElevenLabsKey, setHasStoredElevenLabsKey] = useState(false);
    const [hasStoredAzureKey, setHasStoredAzureKey] = useState(false);
    const [hasStoredIbmWatsonKey, setHasStoredIbmWatsonKey] = useState(false);
    const [isSttDropdownOpen, setIsSttDropdownOpen] = useState(false);
    const sttDropdownRef = React.useRef<HTMLDivElement>(null);

    // Close STT dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (sttDropdownRef.current && !sttDropdownRef.current.contains(event.target as Node)) {
                setIsSttDropdownOpen(false);
            }
        };
        if (isSttDropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isSttDropdownOpen]);

    // Load STT settings on mount
    useEffect(() => {
        const loadSttSettings = async () => {
            try {
                // @ts-ignore
                const creds = await window.electronAPI?.getStoredCredentials?.();
                if (creds) {
                    setSttProvider((creds.sttProvider || 'google') as typeof sttProvider);
                    if ((creds as any).groqSttModel) setGroqSttModel((creds as any).groqSttModel);
                    setGoogleServiceAccountPath(creds.googleServiceAccountPath);
                    setHasStoredSttGroqKey(creds.hasSttGroqKey);
                    setHasStoredSttOpenaiKey(creds.hasSttOpenaiKey);
                    setHasStoredDeepgramKey(creds.hasDeepgramKey);
                    setHasStoredElevenLabsKey(creds.hasElevenLabsKey);
                    setHasStoredAzureKey(creds.hasAzureKey);
                    if (creds.azureRegion) setSttAzureRegion(creds.azureRegion);
                    setHasStoredIbmWatsonKey(creds.hasIbmWatsonKey);
                }
            } catch (e) {
                console.error('Failed to load STT settings:', e);
            }
        };
        if (isOpen) loadSttSettings();
    }, [isOpen]);

    const handleSttProviderChange = async (provider: 'google' | 'groq' | 'openai' | 'deepgram' | 'elevenlabs' | 'azure' | 'ibmwatson') => {
        setSttProvider(provider);
        setIsSttDropdownOpen(false);
        setSttTestStatus('idle');
        setSttTestError('');
        try {
            // @ts-ignore
            await window.electronAPI?.setSttProvider?.(provider);
        } catch (e) {
            console.error('Failed to set STT provider:', e);
        }
    };

    const handleSttKeySubmit = async (provider: 'groq' | 'openai' | 'deepgram' | 'elevenlabs' | 'azure' | 'ibmwatson', key: string) => {
        if (!key.trim()) return;
        setSttSaving(true);
        try {
            if (provider === 'groq') {
                // @ts-ignore
                await window.electronAPI?.setGroqSttApiKey?.(key.trim());
            } else if (provider === 'openai') {
                // @ts-ignore
                await window.electronAPI?.setOpenaiSttApiKey?.(key.trim());
            } else if (provider === 'elevenlabs') {
                // @ts-ignore
                await window.electronAPI?.setElevenLabsApiKey?.(key.trim());
            } else if (provider === 'azure') {
                // @ts-ignore
                await window.electronAPI?.setAzureApiKey?.(key.trim());
            } else if (provider === 'ibmwatson') {
                // @ts-ignore
                await window.electronAPI?.setIbmWatsonApiKey?.(key.trim());
            } else {
                // @ts-ignore
                await window.electronAPI?.setDeepgramApiKey?.(key.trim());
            }
            if (provider === 'groq') setHasStoredSttGroqKey(true);
            else if (provider === 'openai') setHasStoredSttOpenaiKey(true);
            else if (provider === 'elevenlabs') setHasStoredElevenLabsKey(true);
            else if (provider === 'azure') setHasStoredAzureKey(true);
            else if (provider === 'ibmwatson') setHasStoredIbmWatsonKey(true);
            else setHasStoredDeepgramKey(true);

            setSttSaved(true);
            setTimeout(() => setSttSaved(false), 2000);
        } catch (e) {
            console.error(`Failed to save ${provider} STT key:`, e);
        } finally {
            setSttSaving(false);
        }
    };

    const handleTestSttConnection = async () => {
        if (sttProvider === 'google') return;
        const keyMap: Record<string, string> = {
            groq: sttGroqKey, openai: sttOpenaiKey, deepgram: sttDeepgramKey,
            elevenlabs: sttElevenLabsKey, azure: sttAzureKey, ibmwatson: sttIbmKey,
        };
        const keyToTest = keyMap[sttProvider] || '';
        if (!keyToTest.trim()) {
            setSttTestStatus('error');
            setSttTestError('Please enter an API key first');
            return;
        }

        setSttTestStatus('testing');
        setSttTestError('');
        try {
            // @ts-ignore
            const result = await window.electronAPI?.testSttConnection?.(
                sttProvider,
                keyToTest.trim(),
                sttProvider === 'azure' ? sttAzureRegion : undefined
            );
            if (result?.success) {
                setSttTestStatus('success');
                setTimeout(() => setSttTestStatus('idle'), 3000);
            } else {
                setSttTestStatus('error');
                setSttTestError(result?.error || 'Connection failed');
            }
        } catch (e: any) {
            setSttTestStatus('error');
            setSttTestError(e.message || 'Test failed');
        }
    };


    const [calendarStatus, setCalendarStatus] = useState<{ connected: boolean; email?: string }>({ connected: false });
    const [isCalendarsLoading, setIsCalendarsLoading] = useState(false);

    const audioContextRef = React.useRef<AudioContext | null>(null);
    const analyserRef = React.useRef<AnalyserNode | null>(null);
    const sourceRef = React.useRef<MediaStreamAudioSourceNode | null>(null);
    const rafRef = React.useRef<number | null>(null);
    const streamRef = React.useRef<MediaStream | null>(null);

    // Load stored credentials on mount




    const handleCheckForUpdates = async () => {
        if (updateStatus === 'checking') return;
        setUpdateStatus('checking');
        try {
            await window.electronAPI.checkForUpdates();
        } catch (error) {
            console.error("Failed to check for updates:", error);
            setUpdateStatus('error');
            setTimeout(() => setUpdateStatus('idle'), 3000);
        }
    };

    useEffect(() => {
        if (!isOpen) return;

        const unsubs = [
            window.electronAPI.onUpdateChecking(() => {
                setUpdateStatus('checking');
            }),
            window.electronAPI.onUpdateAvailable(() => {
                setUpdateStatus('available');
                // Don't close settings - let user see the button change to "Update Available"
            }),
            window.electronAPI.onUpdateNotAvailable(() => {
                setUpdateStatus('uptodate');
                setTimeout(() => setUpdateStatus('idle'), 3000);
            }),
            window.electronAPI.onUpdateError((err) => {
                console.error('[Settings] Update error:', err);
                setUpdateStatus('error');
                setTimeout(() => setUpdateStatus('idle'), 3000);
            })
        ];

        return () => unsubs.forEach(unsub => unsub());
    }, [isOpen, onClose]);

    useEffect(() => {
        if (isOpen) {
            // Load detectable status
            if (window.electronAPI?.getUndetectable) {
                window.electronAPI.getUndetectable().then(setIsUndetectable);
            }
            if (window.electronAPI?.getOpenAtLogin) {
                window.electronAPI.getOpenAtLogin().then(setOpenOnLogin);
            }
            if (window.electronAPI?.getThemeMode) {
                window.electronAPI.getThemeMode().then(({ mode }) => setThemeMode(mode));
            }

            // Load settings
            const loadDevices = async () => {
                try {
                    const [inputs, outputs] = await Promise.all([
                        // @ts-ignore
                        window.electronAPI?.getInputDevices() || Promise.resolve([]),
                        // @ts-ignore
                        window.electronAPI?.getOutputDevices() || Promise.resolve([])
                    ]);

                    // Map to shape compatible with CustomSelect (which expects MediaDeviceInfo-like objects)
                    const formatDevices = (devs: any[]) => devs.map(d => ({
                        deviceId: d.id,
                        label: d.name,
                        kind: 'audioinput' as MediaDeviceKind,
                        groupId: '',
                        toJSON: () => d
                    }));

                    setInputDevices(formatDevices(inputs));
                    setOutputDevices(formatDevices(outputs));

                    // Load saved preferences
                    const savedInput = localStorage.getItem('preferredInputDeviceId');
                    const savedOutput = localStorage.getItem('preferredOutputDeviceId');

                    if (savedInput && inputs.find((d: any) => d.id === savedInput)) {
                        setSelectedInput(savedInput);
                    } else if (inputs.length > 0 && !selectedInput) {
                        setSelectedInput(inputs[0].id);
                    }

                    if (savedOutput && outputs.find((d: any) => d.id === savedOutput)) {
                        setSelectedOutput(savedOutput);
                    } else if (outputs.length > 0 && !selectedOutput) {
                        setSelectedOutput(outputs[0].id);
                    }
                } catch (e) {
                    console.error("Error loading native devices:", e);
                }
            };
            loadDevices();

            // Load Legacy Audio pref
            const savedLegacy = localStorage.getItem('useLegacyAudioBackend') === 'true';
            setUseLegacyAudio(savedLegacy);

            // Load Calendar Status
            if (window.electronAPI?.getCalendarStatus) {
                window.electronAPI.getCalendarStatus().then(setCalendarStatus);
            }
        }
    }, [isOpen, selectedInput, selectedOutput]); // Re-run if isOpen changes, or if selected devices are cleared

    // Effect for real-time audio level monitoring via native IPC
    useEffect(() => {
        let mounted = true;
        let removeAudioLevelListener: (() => void) | null = null;

        if (isOpen && activeTab === 'audio') {
            const startNativeAudioTest = async () => {
                try {
                    await window.electronAPI?.startAudioTest?.(selectedInput || undefined);
                    console.log("[Settings] Started native audio test");
                } catch (e) {
                    console.error("[Settings] Failed to start native audio test:", e);
                }
            };

            const handleAudioLevel = (level: number) => {
                if (mounted) {
                    // level is 0-1 from main process, scale to 0-100
                    setMicLevel(level * 100);
                }
            };

            startNativeAudioTest();
            removeAudioLevelListener = window.electronAPI?.onAudioLevel?.(handleAudioLevel) ?? null;

            return () => {
                mounted = false;
                removeAudioLevelListener?.();
                window.electronAPI?.stopAudioTest?.();
                setMicLevel(0);
            };
        } else {
            setMicLevel(0);
        }
    }, [isOpen, activeTab, selectedInput]);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="fixed inset-0 z-50 bg-[var(--bg-overlay)] backdrop-blur-md flex items-center justify-center p-8"
                >
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0, y: 10 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.95, opacity: 0, y: 10 }}
                        transition={{ type: "spring", stiffness: 350, damping: 25 }}
                        className="bg-[var(--bg-glass)] w-full max-w-5xl h-[85vh] rounded-3xl border border-border-subtle shadow-[var(--shadow-premium)] flex overflow-hidden backdrop-blur-3xl"
                    >
                        {/* Dedicated Sidebar */}
                        <div className="w-64 bg-[var(--bg-sidebar-alpha)] border-r border-border-subtle flex flex-col backdrop-blur-2xl">
                            <div className="p-8 border-b border-border-subtle">
                                <h2 className="text-xl font-bold text-text-primary tracking-tight flex items-center gap-2">
                                    <Settings size={20} className="text-text-secondary" />
                                    Settings
                                </h2>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-text-tertiary uppercase tracking-[0.2em] px-3 mb-2 block opacity-40">System Core</label>
                                    <button
                                        onClick={() => setActiveTab('general')}
                                        className={`w-full text-left px-3 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all flex items-center gap-3 ${activeTab === 'general' ? 'bg-white text-black shadow-2xl scale-105 z-10' : 'text-text-tertiary hover:text-text-primary hover:bg-white/5'}`}
                                    >
                                        <Monitor size={14} /> Appearance
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('ai-providers')}
                                        className={`w-full text-left px-3 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all flex items-center gap-3 ${activeTab === 'ai-providers' ? 'bg-white text-black shadow-2xl scale-105 z-10' : 'text-text-tertiary hover:text-text-primary hover:bg-white/5'}`}
                                    >
                                        <FlaskConical size={14} /> Intelligence
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('providers')}
                                        className={`w-full text-left px-3 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all flex items-center gap-3 ${activeTab === 'providers' ? 'bg-white text-black shadow-2xl scale-105 z-10' : 'text-text-tertiary hover:text-text-primary hover:bg-white/5'}`}
                                    >
                                        <Ghost size={14} /> Model Routing
                                    </button>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-text-tertiary uppercase tracking-[0.2em] px-3 mb-2 block opacity-40">Active Context</label>
                                    <button
                                        onClick={() => setActiveTab('interview')}
                                        className={`w-full text-left px-3 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all flex items-center gap-3 ${activeTab === 'interview' ? 'bg-white text-black shadow-2xl scale-105 z-10' : 'text-text-tertiary hover:text-text-primary hover:bg-white/5'}`}
                                    >
                                        <Briefcase size={14} /> Interviews
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('meeting')}
                                        className={`w-full text-left px-3 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all flex items-center gap-3 ${activeTab === 'meeting' ? 'bg-white text-black shadow-2xl scale-105 z-10' : 'text-text-tertiary hover:text-text-primary hover:bg-white/5'}`}
                                    >
                                        <ClipboardList size={14} /> Meetings
                                    </button>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-text-tertiary uppercase tracking-[0.2em] px-3 mb-2 block opacity-40">Hardware</label>
                                    <button
                                        onClick={() => setActiveTab('audio')}
                                        className={`w-full text-left px-3 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all flex items-center gap-3 ${activeTab === 'audio' ? 'bg-white text-black shadow-2xl scale-105 z-10' : 'text-text-tertiary hover:text-text-primary hover:bg-white/5'}`}
                                    >
                                        <Mic size={14} /> Audio I/O
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('keybinds')}
                                        className={`w-full text-left px-3 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all flex items-center gap-3 ${activeTab === 'keybinds' ? 'bg-white text-black shadow-2xl scale-105 z-10' : 'text-text-tertiary hover:text-text-primary hover:bg-white/5'}`}
                                    >
                                        <Keyboard size={14} /> Controls
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('about')}
                                        className={`w-full text-left px-3 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all flex items-center gap-3 ${activeTab === 'about' ? 'bg-white text-black shadow-2xl scale-105 z-10' : 'text-text-tertiary hover:text-text-primary hover:bg-white/5'}`}
                                    >
                                        <Info size={14} /> System Info
                                    </button>
                                </div>
                            </div>

                            <div className="p-6 border-t border-border-subtle bg-bg-sidebar-alpha">
                                <div className="flex items-center gap-3 px-2">
                                    <div className="w-9 h-9 rounded-xl bg-bg-item-surface border border-border-subtle flex items-center justify-center p-1.5 shadow-sm">
                                        <img src={icon} alt="Logo" className="w-full h-full object-contain" />
                                    </div>
                                    <div className="flex-1 overflow-hidden">
                                        <p className="text-xs font-bold text-text-primary truncate">Ghost Writer</p>
                                        <p className="text-[10px] text-text-tertiary truncate">v2.0.0 Pro</p>
                                    </div>
                                    <button onClick={onClose} className="text-text-tertiary hover:text-text-primary transition-colors">
                                        <LogOut size={16} className="rotate-180" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Main Content Area */}
                        <div className="flex-1 overflow-y-auto bg-transparent relative custom-scrollbar p-10">
                            <div className="max-w-4xl mx-auto min-h-full">
                                {activeTab === 'general' && (
                                    <div className="space-y-6 animated fadeIn">
                                        <div className="space-y-3.5">
                                            {/* UndetectableToggle */}
                                            <div className={`bg-[var(--bg-card-alpha)] backdrop-blur-xl rounded-xl p-5 border border-border-subtle flex items-center justify-between transition-all ${isUndetectable ? 'shadow-lg shadow-blue-500/10' : ''}`}>
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center gap-2">
                                                        {isUndetectable ? (
                                                            <svg
                                                                width="18"
                                                                height="18"
                                                                viewBox="0 0 24 24"
                                                                fill="none"
                                                                stroke="currentColor"
                                                                strokeWidth="2"
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                className="text-text-primary"
                                                            >
                                                                <path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z" fill="currentColor" stroke="currentColor" />
                                                                <path d="M9 10h.01" stroke="var(--bg-item-surface)" strokeWidth="2.5" />
                                                                <path d="M15 10h.01" stroke="var(--bg-item-surface)" strokeWidth="2.5" />
                                                            </svg>
                                                        ) : (
                                                            <Ghost size={18} className="text-text-primary" />
                                                        )}
                                                        <h3 className="text-lg font-bold text-text-primary">{isUndetectable ? 'Undetectable' : 'Detectable'}</h3>
                                                    </div>
                                                    <p className="text-xs text-text-secondary">
                                                        Ghost Writer is currently {isUndetectable ? 'undetectable' : 'detectable'} by screen-sharing. <button className="text-blue-400 hover:underline">Supported apps here</button>
                                                    </p>
                                                </div>
                                                <div
                                                    onClick={() => {
                                                        const newState = !isUndetectable;
                                                        setIsUndetectable(newState);
                                                        window.electronAPI?.setUndetectable(newState);
                                                        // Analytics: Undetectable Mode Toggle
                                                        analytics.trackModeSelected(newState ? 'undetectable' : 'overlay');
                                                    }}
                                                    className={`w-11 h-6 rounded-full relative cursor-pointer transition-colors ${isUndetectable ? 'bg-accent-primary' : 'bg-bg-toggle-switch border border-border-muted'}`}
                                                >
                                                    <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${isUndetectable ? 'translate-x-5' : 'translate-x-0'}`} />
                                                </div>
                                            </div>

                                            <div>
                                                <h3 className="text-lg font-bold text-text-primary mb-1">General settings</h3>
                                                <p className="text-xs text-text-secondary mb-2">Customize how Ghost Writer works for you</p>

                                                <div className="space-y-4">
                                                    {/* Open at Login */}
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-10 h-10 bg-[var(--bg-card-alpha)] backdrop-blur-lg rounded-lg border border-border-subtle flex items-center justify-center text-text-tertiary">
                                                                <Power size={20} />
                                                            </div>
                                                            <div>
                                                                <h3 className="text-sm font-bold text-text-primary">Open Ghost Writer when you log in</h3>
                                                                <p className="text-xs text-text-secondary mt-0.5">Ghost Writer will open automatically when you log in to your computer</p>
                                                            </div>
                                                        </div>
                                                        <div
                                                            onClick={() => {
                                                                const newState = !openOnLogin;
                                                                setOpenOnLogin(newState);
                                                                window.electronAPI?.setOpenAtLogin(newState);
                                                            }}
                                                            className={`w-11 h-6 rounded-full relative cursor-pointer transition-colors ${openOnLogin ? 'bg-accent-primary' : 'bg-bg-toggle-switch border border-border-muted'}`}
                                                        >
                                                            <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${openOnLogin ? 'translate-x-5' : 'translate-x-0'}`} />
                                                        </div>
                                                    </div>

                                                    {/* Interviewer Transcript */}
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-10 h-10 bg-[var(--bg-card-alpha)] backdrop-blur-lg rounded-lg border border-border-subtle flex items-center justify-center text-text-tertiary">
                                                                <MessageSquare size={20} />
                                                            </div>
                                                            <div>
                                                                <h3 className="text-sm font-bold text-text-primary">Interviewer Transcript</h3>
                                                                <p className="text-xs text-text-secondary mt-0.5">Show real-time transcription of the interviewer</p>
                                                            </div>
                                                        </div>
                                                        <div
                                                            onClick={() => {
                                                                const newState = !showTranscript;
                                                                setShowTranscript(newState);
                                                                localStorage.setItem('ghost_writer_interviewer_transcript', String(newState));
                                                                window.dispatchEvent(new Event('storage'));
                                                            }}
                                                            className={`w-11 h-6 rounded-full relative cursor-pointer transition-colors ${showTranscript ? 'bg-accent-primary' : 'bg-bg-toggle-switch border border-border-muted'}`}
                                                        >
                                                            <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${showTranscript ? 'translate-x-5' : 'translate-x-0'}`} />
                                                        </div>
                                                    </div>


                                                    {/* Theme */}
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-10 h-10 bg-[var(--bg-card-alpha)] backdrop-blur-lg rounded-lg border border-border-subtle flex items-center justify-center text-text-tertiary">
                                                                <Palette size={20} />
                                                            </div>
                                                            <div>
                                                                <h3 className="text-sm font-bold text-text-primary">Theme</h3>
                                                                <p className="text-xs text-text-secondary mt-0.5">Customize how Ghost Writer looks on your device</p>
                                                            </div>
                                                        </div>

                                                        <div className="relative" ref={themeDropdownRef}>
                                                            <button
                                                                onClick={() => setIsThemeDropdownOpen(!isThemeDropdownOpen)}
                                                                className="bg-bg-component hover:bg-bg-elevated border border-border-subtle text-text-primary px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 min-w-[100px] justify-between"
                                                            >
                                                                <div className="flex items-center gap-2 overflow-hidden">
                                                                    <span className="text-text-secondary shrink-0">
                                                                        {themeMode === 'system' && <Monitor size={14} />}
                                                                        {themeMode === 'light' && <Sun size={14} />}
                                                                        {themeMode === 'dark' && <Moon size={14} />}
                                                                    </span>
                                                                    <span className="capitalize text-ellipsis overflow-hidden whitespace-nowrap">{themeMode}</span>
                                                                </div>
                                                                <ChevronDown size={12} className={`shrink-0 transition-transform ${isThemeDropdownOpen ? 'rotate-180' : ''}`} />
                                                            </button>

                                                            {/* Dropdown Menu */}
                                                            {isThemeDropdownOpen && (
                                                                <div className="absolute right-0 top-full mt-1 w-full bg-bg-elevated border border-border-subtle rounded-lg shadow-xl overflow-hidden z-20 p-1 animated fadeIn select-none">
                                                                    {[
                                                                        { mode: 'system', label: 'System', icon: <Monitor size={14} /> },
                                                                        { mode: 'light', label: 'Light', icon: <Sun size={14} /> },
                                                                        { mode: 'dark', label: 'Dark', icon: <Moon size={14} /> }
                                                                    ].map((option) => (
                                                                        <button
                                                                            key={option.mode}
                                                                            onClick={() => {
                                                                                handleSetTheme(option.mode as any);
                                                                                setIsThemeDropdownOpen(false);
                                                                            }}
                                                                            className={`w-full text-left px-2 py-1.5 rounded-md text-xs flex items-center gap-2 transition-colors ${themeMode === option.mode ? 'text-text-primary bg-bg-item-active/50' : 'text-text-secondary hover:bg-bg-input hover:text-text-primary'}`}
                                                                        >
                                                                            <span className={themeMode === option.mode ? 'text-text-primary' : 'text-text-secondary group-hover:text-text-primary'}>{option.icon}</span>
                                                                            <span className="font-medium">{option.label}</span>
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Version */}
                                                    <div className="flex items-start justify-between gap-4">
                                                        <div className="flex items-start gap-4">
                                                            <div className="w-10 h-10 bg-[var(--bg-card-alpha)] backdrop-blur-lg rounded-lg border border-border-subtle flex items-center justify-center text-text-tertiary shrink-0">
                                                                <BadgeCheck size={20} />
                                                            </div>
                                                            <div>
                                                                <h3 className="text-sm font-bold text-text-primary">Version</h3>
                                                                <p className="text-xs text-text-secondary mt-0.5">
                                                                    You are currently using Ghost Writer version 2.0.0.
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={async () => {
                                                                if (updateStatus === 'available') {
                                                                    try {
                                                                        // @ts-ignore
                                                                        await window.electronAPI.downloadUpdate();
                                                                        onClose(); // Close settings to show the banner
                                                                    } catch (err) {
                                                                        console.error("Failed to start download:", err);
                                                                    }
                                                                } else {
                                                                    handleCheckForUpdates();
                                                                }
                                                            }}
                                                            disabled={updateStatus === 'checking'}
                                                            className={`px-5 py-2 rounded-lg text-[13px] font-bold transition-all flex items-center gap-2 shrink-0 ${updateStatus === 'checking' ? 'bg-bg-input text-text-tertiary cursor-wait' :
                                                                updateStatus === 'available' ? 'bg-accent-primary text-bg-primary hover:bg-accent-secondary shadow-lg shadow-blue-500/20' :
                                                                    updateStatus === 'uptodate' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                                                                        updateStatus === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                                                                            'bg-bg-component hover:bg-bg-input text-text-primary'
                                                                }`}
                                                        >
                                                            {updateStatus === 'checking' ? (
                                                                <>
                                                                    <RefreshCw size={14} className="animate-spin" />
                                                                    Checking...
                                                                </>
                                                            ) : updateStatus === 'available' ? (
                                                                <>
                                                                    <ArrowDown size={14} />
                                                                    Update Available
                                                                </>
                                                            ) : updateStatus === 'uptodate' ? (
                                                                <>
                                                                    <Check size={14} />
                                                                    Up to date
                                                                </>
                                                            ) : updateStatus === 'error' ? (
                                                                <>
                                                                    <X size={14} />
                                                                    Error
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <RefreshCw size={14} />
                                                                    Check for updates
                                                                </>
                                                            )}
                                                        </button>
                                                    </div>

                                                </div>
                                            </div>

                                        </div>

                                        {/* Process Disguise */}
                                        {/* Process Disguise */}
                                        <div className="bg-[var(--bg-card-alpha)] backdrop-blur-xl rounded-xl p-5 border border-border-subtle">
                                            <div className="flex flex-col gap-1 mb-3">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="text-lg font-bold text-text-primary">Process Disguise</h3>
                                                </div>
                                                <p className="text-xs text-text-secondary">
                                                    Disguise Ghost Writer as another application to prevent detection during screen sharing.
                                                    <span className="block mt-1 text-text-tertiary">
                                                        Select a disguise to be automatically applied when Undetectable mode is on.
                                                    </span>
                                                </p>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3">
                                                {[
                                                    { id: 'none', label: 'None (Default)', icon: <Layout size={14} /> },
                                                    { id: 'terminal', label: 'Terminal', icon: <Terminal size={14} /> },
                                                    { id: 'settings', label: 'System Settings', icon: <Settings size={14} /> },
                                                    { id: 'activity', label: 'Activity Monitor', icon: <Activity size={14} /> }
                                                ].map((option) => (
                                                    <button
                                                        key={option.id}
                                                        onClick={() => {
                                                            // @ts-ignore
                                                            setDisguiseMode(option.id);
                                                            // @ts-ignore
                                                            window.electronAPI?.setDisguise(option.id);
                                                            // Analytics
                                                            analytics.trackModeSelected(`disguise_${option.id}`);
                                                        }}
                                                        className={`p-3 rounded-lg border text-left flex items-center gap-3 transition-all ${disguiseMode === option.id
                                                            ? 'bg-accent-primary/10 border-accent-primary/30 text-text-primary'
                                                            : 'bg-bg-input border-border-subtle text-text-secondary hover:text-text-primary hover:bg-[var(--bg-card-alpha)]'
                                                            }`}
                                                    >
                                                        <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${disguiseMode === option.id ? 'bg-accent-primary/10 text-accent-primary' : 'bg-bg-input backdrop-blur-sm text-text-secondary'
                                                            }`}>
                                                            {option.icon}
                                                        </div>
                                                        <span className="text-xs font-medium">{option.label}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                    </div>
                                )}
                                {activeTab === 'ai-providers' && (
                                    <AIProvidersSettings />
                                )}

                                {activeTab === 'providers' && (
                                    <div className="space-y-6">
                                        <AIModelsSettings />
                                    </div>
                                )}



                                {activeTab === 'audio' && (
                                    <div className="space-y-6 animated fadeIn">
                                        {/* ── Speech Provider Section ── */}
                                        <div>
                                            <h3 className="text-lg font-bold text-text-primary mb-1">Speech Provider</h3>
                                            <p className="text-xs text-text-secondary mb-5">Choose the engine that transcribes audio to text.</p>

                                            <div className="space-y-4">
                                                <div className="bg-[var(--bg-card-alpha)] backdrop-blur-xl rounded-xl border border-border-subtle p-4 space-y-3">
                                                    <label className="text-xs font-medium text-text-secondary block">Speech Provider</label>
                                                    <div className="relative">
                                                        <ProviderSelect
                                                            value={sttProvider}
                                                            onChange={(val) => handleSttProviderChange(val as any)}
                                                            options={[
                                                                { id: 'local-whisper', label: 'Local Whisper', badge: 'Private', desc: 'Runs locally on your device (Free)', color: 'emerald', icon: <Cpu size={14} /> },
                                                                { id: 'google', label: 'Google Cloud', badge: 'Default', desc: 'gRPC streaming via Service Account', color: 'blue', icon: <Mic size={14} /> },
                                                                { id: 'groq', label: 'Groq Whisper', badge: 'Fast', desc: 'Ultra-fast REST transcription', color: 'orange', icon: <Mic size={14} /> },
                                                                { id: 'openai', label: 'OpenAI Whisper', badge: null, desc: 'OpenAI-compatible Whisper API', color: 'green', icon: <Mic size={14} /> },
                                                                { id: 'deepgram', label: 'Deepgram Nova-2', badge: 'Accurate', desc: 'High-accuracy REST transcription', color: 'purple', icon: <Mic size={14} /> },
                                                                { id: 'elevenlabs', label: 'ElevenLabs Scribe', badge: null, desc: 'High-quality Scribe v1 API', color: 'teal', icon: <Mic size={14} /> },
                                                                { id: 'azure', label: 'Azure Speech', badge: null, desc: 'Microsoft Cognitive Services STT', color: 'cyan', icon: <Mic size={14} /> },
                                                                { id: 'ibmwatson', label: 'IBM Watson', badge: null, desc: 'IBM Watson cloud STT service', color: 'indigo', icon: <Mic size={14} /> },
                                                            ]}
                                                        />
                                                    </div>
                                                </div>

                                                {/* Local Whisper Settings */}
                                                {sttProvider === 'local-whisper' && (
                                                    <div className="bg-[var(--bg-card-alpha)] backdrop-blur-xl rounded-xl border border-border-subtle p-4">
                                                        <div className="flex items-start justify-between mb-4">
                                                            <div>
                                                                <label className="text-xs font-medium text-text-secondary block mb-1">Local Whisper Status</label>
                                                                <div className="flex items-center gap-2">
                                                                    <div className={`w-2 h-2 rounded-full ${whisperStatus?.hasBinary && whisperStatus?.hasModel ? 'bg-green-500' : 'bg-amber-500'}`} />
                                                                    <span className="text-sm font-medium text-text-primary">
                                                                        {whisperStatus?.isDownloading
                                                                            ? 'Downloading components...'
                                                                            : whisperStatus?.hasBinary && whisperStatus?.hasModel
                                                                                ? 'Ready to transcribe'
                                                                                : 'Setup required'}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            {whisperStatus?.isDownloading && (
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-[10px] font-bold text-accent-primary animate-pulse">
                                                                        {whisperStatus.progress && whisperStatus.progress > 0
                                                                            ? `${whisperStatus.progress}%`
                                                                            : 'Connecting...'}
                                                                    </span>
                                                                    <Loader2 size={16} className="animate-spin text-accent-primary" />
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Model Selection */}
                                                        <div className="mb-4">
                                                            <label className="text-xs font-medium text-text-secondary mb-2 block">Whisper Model</label>
                                                            <div className="grid grid-cols-2 gap-2">
                                                                {[
                                                                    { id: 'tiny', label: 'Tiny', size: '~75MB', desc: 'Fastest' },
                                                                    { id: 'base', label: 'Base', size: '~142MB', desc: 'Fast' },
                                                                    { id: 'small', label: 'Small', size: '~466MB', desc: 'Balanced' },
                                                                    { id: 'medium', label: 'Medium', size: '~1.5GB', desc: 'Accurate' },
                                                                ].map((m) => {
                                                                    const isSelected = (pendingWhisperModel || whisperStatus?.selectedModel) === m.id;
                                                                    const isInstalled = whisperStatus?.installedModels?.[m.id] ?? false;
                                                                    const isDownloading = whisperStatus?.downloadingModel === m.id;
                                                                    const downloadProgress = isDownloading ? (whisperStatus?.progress || 0) : 0;

                                                                    return (
                                                                        <button
                                                                            key={m.id}
                                                                            onClick={() => {
                                                                                if (isDownloading) return;
                                                                                if (isInstalled) {
                                                                                    setPendingWhisperModel(m.id);
                                                                                }
                                                                            }}
                                                                            className={`relative rounded-lg p-2 text-left border transition-all overflow-hidden ${isSelected
                                                                                ? 'bg-emerald-500/10 border-emerald-500/50'
                                                                                : isInstalled
                                                                                    ? 'bg-bg-input border-transparent hover:bg-bg-elevated'
                                                                                    : 'bg-bg-input border-transparent opacity-80 hover:opacity-100'
                                                                                }`}
                                                                        >
                                                                            {/* Download progress bar overlay */}
                                                                            {isDownloading && (
                                                                                <div
                                                                                    className="absolute bottom-0 left-0 h-1 bg-accent-primary transition-all duration-300 ease-out"
                                                                                    style={{ width: `${downloadProgress}%` }}
                                                                                />
                                                                            )}
                                                                            <div className="flex items-center justify-between mb-0.5">
                                                                                <span className={`text-xs font-semibold ${isSelected ? 'text-emerald-400' : 'text-text-primary'}`}>{m.label}</span>
                                                                                <div className="flex items-center gap-1">
                                                                                    {isDownloading && (
                                                                                        <span className="text-[9px] font-bold text-accent-primary animate-pulse">{downloadProgress}%</span>
                                                                                    )}
                                                                                    {isInstalled ? (
                                                                                        isSelected ? <Check size={12} className="text-emerald-400" /> : <Check size={10} className="text-green-500/60" />
                                                                                    ) : isDownloading ? (
                                                                                        <Loader2 size={12} className="animate-spin text-accent-primary" />
                                                                                    ) : (
                                                                                        <Download
                                                                                            size={12}
                                                                                            className="text-text-tertiary hover:text-accent-primary cursor-pointer transition-colors"
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                // @ts-ignore
                                                                                                window.electronAPI?.downloadWhisperModel?.(m.id).then((res: any) => {
                                                                                                    if (res?.status) setWhisperStatus(res.status);
                                                                                                });
                                                                                            }}
                                                                                        />
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                            <div className="flex items-center justify-between text-[10px]">
                                                                                <span className="text-text-tertiary">
                                                                                    {isDownloading ? 'Downloading...' : isInstalled ? m.desc : 'Not installed'}
                                                                                </span>
                                                                                <span className="text-text-tertiary opacity-70">{m.size}</span>
                                                                            </div>
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>

                                                            {/* Pending changes / Apply button */}
                                                            {pendingWhisperModel && pendingWhisperModel !== whisperStatus?.selectedModel && (
                                                                <div className="mt-4 flex items-center justify-between bg-bg-input/50 p-3 rounded-lg border border-emerald-500/20 animated slideInUp">
                                                                    <div className="flex items-center gap-2">
                                                                        <Info size={14} className="text-emerald-400" />
                                                                        <span className="text-xs text-text-secondary">
                                                                            {whisperStatus?.installedModels?.[pendingWhisperModel] ? 'Changes pending...' : 'Model not downloaded'}
                                                                        </span>
                                                                    </div>
                                                                    <button
                                                                        onClick={async () => {
                                                                            if (!pendingWhisperModel) return;
                                                                            const isModelInstalled = whisperStatus?.installedModels?.[pendingWhisperModel];

                                                                            if (!isModelInstalled) {
                                                                                // Download first, then apply
                                                                                // @ts-ignore
                                                                                const dlRes = await window.electronAPI?.downloadWhisperModel?.(pendingWhisperModel);
                                                                                if (dlRes?.status) setWhisperStatus(dlRes.status);
                                                                                if (!dlRes?.success) return;
                                                                            }

                                                                            // Apply the model
                                                                            setWhisperStatus(prev => prev ? { ...prev, selectedModel: pendingWhisperModel } : null);
                                                                            // @ts-ignore
                                                                            const res = await window.electronAPI?.setLocalWhisperModel(pendingWhisperModel);
                                                                            if (res?.status) {
                                                                                setWhisperStatus(res.status);
                                                                                if (res.status.hasBinary && res.status.hasModel) {
                                                                                    setPendingWhisperModel(null);
                                                                                    setWhisperApplied(true);
                                                                                    setTimeout(() => setWhisperApplied(false), 3000);
                                                                                }
                                                                            } else {
                                                                                setPendingWhisperModel(null);
                                                                                setWhisperApplied(true);
                                                                                setTimeout(() => setWhisperApplied(false), 3000);
                                                                            }
                                                                        }}
                                                                        disabled={whisperStatus?.isDownloading}
                                                                        className={`px-4 py-1.5 text-bg-primary text-xs font-bold rounded-lg transition-all shadow-lg active:scale-95 flex items-center gap-2 ${whisperStatus?.installedModels?.[pendingWhisperModel]
                                                                            ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20'
                                                                            : 'bg-accent-primary hover:bg-accent-secondary shadow-accent-primary/20'
                                                                            } ${whisperStatus?.isDownloading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                                    >
                                                                        {whisperStatus?.installedModels?.[pendingWhisperModel] ? (
                                                                            'Apply Changes'
                                                                        ) : (
                                                                            <><Download size={12} /> Download & Apply</>
                                                                        )}
                                                                    </button>
                                                                </div>
                                                            )}

                                                            {whisperApplied && (
                                                                <div className="mt-3 flex items-center gap-2 px-1 text-emerald-400 animated fadeIn">
                                                                    <Check size={14} strokeWidth={3} />
                                                                    <span className="text-xs font-bold">Whisper model applied successfully!</span>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {!whisperStatus?.isDownloading && (!whisperStatus?.hasBinary || !whisperStatus?.hasModel) && (
                                                            <div className="bg-bg-input rounded-lg p-3 mb-4">
                                                                <div className="flex items-start gap-3">
                                                                    <div className="bg-accent-primary/10 text-accent-primary p-2 rounded-lg">
                                                                        <Download size={16} />
                                                                    </div>
                                                                    <div>
                                                                        <h4 className="text-sm font-medium text-text-primary mb-1">Required Components Missing</h4>
                                                                        <p className="text-xs text-text-secondary mb-3">
                                                                            Ghost Writer needs to download the Whisper engine and <b>{whisperStatus?.selectedModel || 'small'}</b> model file to run locally.
                                                                        </p>
                                                                        <button
                                                                            // @ts-ignore
                                                                            onClick={() => window.electronAPI?.setupWhisper?.(whisperStatus?.selectedModel)}
                                                                            className="px-3 py-1.5 bg-accent-primary hover:bg-accent-secondary text-bg-primary text-xs font-bold rounded-lg transition-colors flex items-center gap-2"
                                                                        >
                                                                            Download & Setup
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}

                                                        <div className="grid grid-cols-2 gap-2 mt-2">
                                                            <div className="bg-bg-input rounded-lg p-2.5 border border-border-subtle">
                                                                <span className="text-[10px] text-text-tertiary uppercase tracking-wider font-bold block mb-0.5">Engine</span>
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-xs font-medium text-text-primary">whisper.cpp</span>
                                                                    {whisperStatus?.hasBinary ? <Check size={12} className="text-green-500" /> : <X size={12} className="text-red-400" />}
                                                                </div>
                                                            </div>
                                                            <div className="bg-bg-input rounded-lg p-2.5 border border-border-subtle">
                                                                <span className="text-[10px] text-text-tertiary uppercase tracking-wider font-bold block mb-0.5">Model</span>
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-xs font-medium text-text-primary">{whisperStatus?.selectedModel || 'Unknown'}</span>
                                                                    {whisperStatus?.hasModel ? <Check size={12} className="text-green-500" /> : <X size={12} className="text-red-400" />}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Manual Path Overrides */}
                                                        <div className="mt-4 pt-4 border-t border-border-subtle space-y-3">
                                                            <h4 className="text-xs font-bold text-text-primary">Advanced: Manual Paths</h4>
                                                            <div className="space-y-2">
                                                                {/* Binary Path */}
                                                                <div>
                                                                    <label className="text-[10px] text-text-secondary uppercase tracking-wider font-bold block mb-1">Whisper Binary (main.exe / main)</label>
                                                                    <div className="flex gap-2">
                                                                        <div className="flex-1 bg-bg-input border border-border-subtle rounded-lg px-2 py-1.5 text-xs text-text-secondary font-mono truncate">
                                                                            {whisperStatus?.customBinaryPath || "Default (Managed)"}
                                                                        </div>
                                                                        <button
                                                                            onClick={async () => {
                                                                                // @ts-ignore
                                                                                const path = await window.electronAPI?.selectLocalFile("Select Whisper Binary", [{ name: 'Executables', extensions: ['exe', ''] }]);
                                                                                if (path) {
                                                                                    // @ts-ignore
                                                                                    const res = await window.electronAPI?.setLocalWhisperPaths(path, undefined);
                                                                                    if (res?.status) setWhisperStatus(res.status);
                                                                                }
                                                                            }}
                                                                            className="px-2 py-1 bg-bg-input hover:bg-bg-elevated border border-border-subtle rounded-lg text-xs font-medium text-text-primary transition-colors"
                                                                        >
                                                                            Change
                                                                        </button>
                                                                    </div>
                                                                </div>

                                                                {/* Model Path */}
                                                                <div>
                                                                    <label className="text-[10px] text-text-secondary uppercase tracking-wider font-bold block mb-1">Model File (.bin)</label>
                                                                    <div className="flex gap-2">
                                                                        <div className="flex-1 bg-bg-input border border-border-subtle rounded-lg px-2 py-1.5 text-xs text-text-secondary font-mono truncate">
                                                                            {whisperStatus?.customModelPath || "Default (Managed)"}
                                                                        </div>
                                                                        <button
                                                                            onClick={async () => {
                                                                                // @ts-ignore
                                                                                const path = await window.electronAPI?.selectLocalFile("Select Whisper Model", [{ name: 'Bin Files', extensions: ['bin'] }]);
                                                                                if (path) {
                                                                                    // @ts-ignore
                                                                                    const res = await window.electronAPI?.setLocalWhisperPaths(undefined, path);
                                                                                    if (res?.status) setWhisperStatus(res.status);
                                                                                }
                                                                            }}
                                                                            className="px-2 py-1 bg-bg-input hover:bg-bg-elevated border border-border-subtle rounded-lg text-xs font-medium text-text-primary transition-colors"
                                                                        >
                                                                            Change
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Groq Model Selector */}
                                                {sttProvider === 'groq' && (
                                                    <div className="bg-bg-card rounded-xl border border-border-subtle p-4">
                                                        <label className="text-xs font-medium text-text-secondary mb-2.5 block">Whisper Model</label>
                                                        <div className="grid grid-cols-2 gap-2">
                                                            {[
                                                                { id: 'whisper-large-v3-turbo', label: 'V3 Turbo', desc: 'Fastest' },
                                                                { id: 'whisper-large-v3', label: 'V3', desc: 'Most Accurate' },
                                                            ].map((m) => (
                                                                <button
                                                                    key={m.id}
                                                                    onClick={async () => {
                                                                        setGroqSttModel(m.id);
                                                                        try {
                                                                            // @ts-ignore
                                                                            await window.electronAPI?.setGroqSttModel?.(m.id);
                                                                        } catch (e) {
                                                                            console.error('Failed to set Groq model:', e);
                                                                        }
                                                                    }}
                                                                    className={`rounded-lg px-3 py-2.5 text-left transition-all duration-200 ease-in-out active:scale-[0.98] ${groqSttModel === m.id
                                                                        ? 'bg-blue-600 text-white shadow-md'
                                                                        : 'bg-bg-input hover:bg-bg-elevated text-text-primary'
                                                                        }`}
                                                                >
                                                                    <span className="text-sm font-medium block">{m.label}</span>
                                                                    <span className={`text-[11px] transition-colors ${groqSttModel === m.id ? 'text-white/70' : 'text-text-tertiary'
                                                                        }`}>{m.desc}</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Google Cloud Service Account */}
                                                {sttProvider === 'google' && (
                                                    <div className="bg-bg-card rounded-xl border border-border-subtle p-4">
                                                        <label className="text-xs font-medium text-text-secondary mb-2 block">Service Account JSON</label>
                                                        <div className="flex gap-2">
                                                            <div className="flex-1 bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-secondary font-mono truncate">
                                                                {googleServiceAccountPath
                                                                    ? <span className="text-text-primary">{googleServiceAccountPath.split('/').pop()}</span>
                                                                    : <span className="text-text-tertiary italic">No file selected</span>}
                                                            </div>
                                                            <button
                                                                onClick={async () => {
                                                                    // @ts-ignore
                                                                    const result = await window.electronAPI?.selectServiceAccount?.();
                                                                    if (result?.success && result.path) {
                                                                        setGoogleServiceAccountPath(result.path);
                                                                    }
                                                                }}
                                                                className="px-3 py-2 bg-bg-input hover:bg-bg-elevated border border-border-subtle rounded-lg text-xs font-medium text-text-primary transition-colors flex items-center gap-2"
                                                            >
                                                                <Upload size={14} /> Select File
                                                            </button>
                                                        </div>
                                                        <p className="text-[10px] text-text-tertiary mt-2">
                                                            Required for Google Cloud Speech-to-Text.
                                                        </p>
                                                    </div>
                                                )}

                                                {/* API Key Input (non-Google providers) */}
                                                {sttProvider !== 'google' && sttProvider !== 'local-whisper' && (
                                                    <div className="bg-bg-card rounded-xl border border-border-subtle p-4 space-y-3">
                                                        <label className="text-xs font-medium text-text-secondary block">
                                                            {sttProvider === 'groq' ? 'Groq' : sttProvider === 'openai' ? 'OpenAI' : sttProvider === 'elevenlabs' ? 'ElevenLabs' : sttProvider === 'azure' ? 'Azure' : sttProvider === 'ibmwatson' ? 'IBM Watson' : 'Deepgram'} API Key
                                                        </label>
                                                        <div className="flex gap-2">
                                                            <input
                                                                type="password"
                                                                value={
                                                                    sttProvider === 'groq' ? sttGroqKey
                                                                        : sttProvider === 'openai' ? sttOpenaiKey
                                                                            : sttProvider === 'elevenlabs' ? sttElevenLabsKey
                                                                                : sttProvider === 'azure' ? sttAzureKey
                                                                                    : sttProvider === 'ibmwatson' ? sttIbmKey
                                                                                        : sttDeepgramKey
                                                                }
                                                                onChange={(e) => {
                                                                    if (sttProvider === 'groq') setSttGroqKey(e.target.value);
                                                                    else if (sttProvider === 'openai') setSttOpenaiKey(e.target.value);
                                                                    else if (sttProvider === 'elevenlabs') setSttElevenLabsKey(e.target.value);
                                                                    else if (sttProvider === 'azure') setSttAzureKey(e.target.value);
                                                                    else if (sttProvider === 'ibmwatson') setSttIbmKey(e.target.value);
                                                                    else setSttDeepgramKey(e.target.value);
                                                                }}
                                                                placeholder={
                                                                    sttProvider === 'groq'
                                                                        ? (hasStoredSttGroqKey ? '••••••••••••' : 'Enter Groq API key')
                                                                        : sttProvider === 'openai'
                                                                            ? (hasStoredSttOpenaiKey ? '••••••••••••' : 'Enter OpenAI API key')
                                                                            : sttProvider === 'elevenlabs'
                                                                                ? (hasStoredElevenLabsKey ? '••••••••••••' : 'Enter ElevenLabs API key')
                                                                                : sttProvider === 'azure'
                                                                                    ? (hasStoredAzureKey ? '••••••••••••' : 'Enter Azure API key')
                                                                                    : sttProvider === 'ibmwatson'
                                                                                        ? (hasStoredIbmWatsonKey ? '••••••••••••' : 'Enter IBM Watson API key')
                                                                                        : (hasStoredDeepgramKey ? '••••••••••••' : 'Enter Deepgram API key')
                                                                }
                                                                className="flex-1 bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent-primary transition-colors"
                                                            />
                                                            <button
                                                                onClick={() => {
                                                                    const keyMap: Record<string, string> = {
                                                                        groq: sttGroqKey, openai: sttOpenaiKey, deepgram: sttDeepgramKey,
                                                                        elevenlabs: sttElevenLabsKey, azure: sttAzureKey, ibmwatson: sttIbmKey,
                                                                    };
                                                                    handleSttKeySubmit(sttProvider as any, keyMap[sttProvider] || '');
                                                                }}
                                                                disabled={sttSaving || !(() => {
                                                                    const keyMap: Record<string, string> = {
                                                                        groq: sttGroqKey, openai: sttOpenaiKey, deepgram: sttDeepgramKey,
                                                                        elevenlabs: sttElevenLabsKey, azure: sttAzureKey, ibmwatson: sttIbmKey,
                                                                    };
                                                                    return (keyMap[sttProvider] || '').trim();
                                                                })()}
                                                                className={`px-5 py-2.5 rounded-lg text-xs font-medium transition-colors ${sttSaved
                                                                    ? 'bg-green-500/20 text-green-400'
                                                                    : 'bg-bg-input hover:bg-bg-input/80 border border-border-subtle text-text-primary disabled:opacity-50'
                                                                    }`}
                                                            >
                                                                {sttSaving ? 'Saving...' : sttSaved ? 'Saved!' : 'Save'}
                                                            </button>
                                                        </div>

                                                        {/* Azure Region Input */}
                                                        {sttProvider === 'azure' && (
                                                            <div className="space-y-1.5">
                                                                <label className="text-xs font-medium text-text-secondary block">Region</label>
                                                                <div className="flex gap-2">
                                                                    <input
                                                                        type="text"
                                                                        value={sttAzureRegion}
                                                                        onChange={(e) => setSttAzureRegion(e.target.value)}
                                                                        placeholder="e.g. eastus"
                                                                        className="flex-1 bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent-primary transition-colors"
                                                                    />
                                                                    <button
                                                                        onClick={async () => {
                                                                            if (!sttAzureRegion.trim()) return;
                                                                            // @ts-ignore
                                                                            await window.electronAPI?.setAzureRegion?.(sttAzureRegion.trim());
                                                                            setSttSaved(true);
                                                                            setTimeout(() => setSttSaved(false), 2000);
                                                                        }}
                                                                        disabled={!sttAzureRegion.trim()}
                                                                        className="px-5 py-2.5 rounded-lg text-xs font-medium bg-bg-input hover:bg-bg-input/80 border border-border-subtle text-text-primary disabled:opacity-50 transition-colors"
                                                                    >
                                                                        Save
                                                                    </button>
                                                                </div>
                                                                <p className="text-[10px] text-text-tertiary">e.g. eastus, westeurope, westus2</p>
                                                            </div>
                                                        )}

                                                        <div className="flex items-center gap-3">
                                                            <button
                                                                onClick={handleTestSttConnection}
                                                                disabled={sttTestStatus === 'testing'}
                                                                className="text-xs bg-bg-input hover:bg-bg-elevated text-text-primary px-3 py-1.5 rounded-md transition-colors flex items-center gap-2 disabled:opacity-50"
                                                            >
                                                                {sttTestStatus === 'testing' ? (
                                                                    <><RefreshCw size={12} className="animate-spin" /> Testing...</>
                                                                ) : sttTestStatus === 'success' ? (
                                                                    <><Check size={12} className="text-green-500" /> Connected!</>
                                                                ) : (
                                                                    <>Test Connection</>
                                                                )}
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    const urls: Record<string, string> = {
                                                                        groq: 'https://console.groq.com/keys',
                                                                        openai: 'https://platform.openai.com/api-keys',
                                                                        deepgram: 'https://console.deepgram.com',
                                                                        elevenlabs: 'https://elevenlabs.io/app/settings/api-keys',
                                                                        azure: 'https://portal.azure.com/#create/Microsoft.CognitiveServicesSpeech',
                                                                        ibmwatson: 'https://cloud.ibm.com/catalog/services/speech-to-text'
                                                                    };
                                                                    if (urls[sttProvider]) {
                                                                        // @ts-ignore
                                                                        window.electronAPI?.openExternal(urls[sttProvider]);
                                                                    }
                                                                }}
                                                                className="text-xs text-text-tertiary hover:text-text-primary flex items-center gap-1 transition-colors ml-1"
                                                                title="Get API Key"
                                                            >
                                                                <ExternalLink size={12} />
                                                            </button>
                                                            {sttTestStatus === 'error' && (
                                                                <span className="text-xs text-red-400">{sttTestError}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Accent Preference */}
                                                <CustomSelect
                                                    label="Preferred English Accent"
                                                    icon={null}
                                                    value={recognitionLanguage}
                                                    options={languageOptions}
                                                    onChange={handleLanguageChange}
                                                    placeholder="Select Accent"
                                                />
                                                <div className="flex gap-2 items-center -mt-2 px-1">
                                                    <Info size={14} className="text-text-secondary shrink-0" />
                                                    <p className="text-xs text-text-secondary whitespace-nowrap">
                                                        Improves accuracy by prioritizing your accent. Other English accents are still supported.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="h-px bg-border-subtle" />

                                        {/* ── Audio Configuration Section ── */}
                                        <div>
                                            <h3 className="text-lg font-bold text-text-primary mb-1">Audio Configuration</h3>
                                            <p className="text-xs text-text-secondary mb-5">Manage input and output devices.</p>

                                            <div className="space-y-4">
                                                <CustomSelect
                                                    label="Input Device"
                                                    icon={<Mic size={16} />}
                                                    value={selectedInput}
                                                    options={inputDevices}
                                                    onChange={(id) => {
                                                        setSelectedInput(id);
                                                        localStorage.setItem('preferredInputDeviceId', id);
                                                    }}
                                                    placeholder="Default Microphone"
                                                />

                                                <div>
                                                    <div className="flex justify-between text-xs text-text-secondary mb-2 px-1">
                                                        <span>Input Level</span>
                                                    </div>
                                                    <div className="h-1.5 bg-bg-input rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-green-500 transition-all duration-100 ease-out"
                                                            style={{ width: `${micLevel}%` }}
                                                        />
                                                    </div>
                                                </div>

                                                <div className="h-px bg-border-subtle my-2" />

                                                <CustomSelect
                                                    label="Output Device"
                                                    icon={<Speaker size={16} />}
                                                    value={selectedOutput}
                                                    options={outputDevices}
                                                    onChange={(id) => {
                                                        setSelectedOutput(id);
                                                        localStorage.setItem('preferredOutputDeviceId', id);
                                                    }}
                                                    placeholder="Default Speakers"
                                                />

                                                <div className="flex justify-end">
                                                    <button
                                                        onClick={async () => {
                                                            try {
                                                                const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
                                                                if (!AudioContext) {
                                                                    console.error("Web Audio API not supported");
                                                                    return;
                                                                }

                                                                const ctx = new AudioContext();

                                                                if (ctx.state === 'suspended') {
                                                                    await ctx.resume();
                                                                }

                                                                const oscillator = ctx.createOscillator();
                                                                const gainNode = ctx.createGain();

                                                                oscillator.connect(gainNode);
                                                                gainNode.connect(ctx.destination);

                                                                oscillator.type = 'sine';
                                                                oscillator.frequency.setValueAtTime(523.25, ctx.currentTime);
                                                                gainNode.gain.setValueAtTime(0.5, ctx.currentTime);
                                                                gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.0);

                                                                if (selectedOutput && (ctx as any).setSinkId) {
                                                                    try {
                                                                        await (ctx as any).setSinkId(selectedOutput);
                                                                    } catch (e) {
                                                                        console.warn("Error setting sink for AudioContext", e);
                                                                    }
                                                                }

                                                                oscillator.start();
                                                                oscillator.stop(ctx.currentTime + 1.0);
                                                            } catch (e) {
                                                                console.error("Error playing test sound", e);
                                                            }
                                                        }}
                                                        className="text-xs bg-bg-input hover:bg-bg-elevated text-text-primary px-3 py-1.5 rounded-md transition-colors flex items-center gap-2"
                                                    >
                                                        <Speaker size={12} /> Test Sound
                                                    </button>
                                                </div>

                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'keybinds' && (
                                    <div className="space-y-6 animated fadeIn h-full">
                                        <div className="flex flex-col h-full">
                                            <div className="mb-6">
                                                <h3 className="text-lg font-bold text-text-primary mb-1">Keyboard shortcuts</h3>
                                                <p className="text-xs text-text-secondary">View and customize global keybinds.</p>
                                            </div>

                                            <div className="flex-1 overflow-y-auto pr-2 space-y-6 custom-scrollbar pb-6">
                                                {/* Global / General Shortcuts */}
                                                <div>
                                                    <h4 className="text-[10px] font-black text-text-tertiary uppercase tracking-[0.2em] mb-3 px-1">General Control</h4>
                                                    <div className="space-y-2.5">
                                                        {[
                                                            { label: 'Toggle Visibility', key: 'Ctrl/Cmd+B / Alt+G', desc: 'Show or Hide the Ghost Writer interface' },
                                                            { label: 'Show/Center', key: 'Ctrl/Cmd+Shift+Space', desc: 'Bring Ghost Writer to the front and center' },
                                                            { label: 'Reset / Cancel', key: 'Ctrl/Cmd+R / Alt+C', desc: 'Cancel ongoing AI requests and clear state' },
                                                        ].map((kb, idx) => (
                                                            <div key={idx} className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 flex items-center justify-between group hover:bg-white/[0.05] hover:border-white/10 transition-all duration-300">
                                                                <div>
                                                                    <span className="text-sm font-bold text-text-primary block mb-0.5">{kb.label}</span>
                                                                    <span className="text-[11px] text-text-tertiary font-medium">{kb.desc}</span>
                                                                </div>
                                                                <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-[10px] font-black text-white shadow-xl min-w-[100px] text-center uppercase tracking-wider">
                                                                    {kb.key}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Meeting & Transcription */}
                                                <div>
                                                    <h4 className="text-[10px] font-black text-text-tertiary uppercase tracking-[0.2em] mb-3 px-1">Meeting Automation</h4>
                                                    <div className="space-y-2.5">
                                                        {[
                                                            { label: 'Start transcription', key: 'F9', desc: 'Global toggle to Start or End a meeting session' },
                                                            { label: 'What to answer', key: 'F8 / Ctrl/Cmd+J', desc: 'Ask AI for the best response to the current dialogue' },
                                                            { label: 'Process Context', key: 'Ctrl/Cmd+Enter', desc: 'Force process current screenshots & transcript' },
                                                        ].map((kb, idx) => (
                                                            <div key={idx} className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 flex items-center justify-between group hover:bg-white/[0.05] hover:border-white/10 transition-all duration-300">
                                                                <div>
                                                                    <span className="text-sm font-bold text-text-primary block mb-0.5">{kb.label}</span>
                                                                    <span className="text-[11px] text-text-tertiary font-medium">{kb.desc}</span>
                                                                </div>
                                                                <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-[10px] font-black text-white shadow-xl min-w-[100px] text-center uppercase tracking-wider">
                                                                    {kb.key}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Screenshot Tools */}
                                                <div>
                                                    <h4 className="text-[10px] font-black text-text-tertiary uppercase tracking-[0.2em] mb-3 px-1">Intelligence Capture</h4>
                                                    <div className="space-y-2.5">
                                                        {[
                                                            { label: 'Intelligence Shot', key: 'Ctrl/Cmd+H', desc: 'Capture screenshot and analyze immediately' },
                                                            { label: 'Contextual Selection', key: 'Ctrl/Cmd+Shift+H', desc: 'Attach a specific area as manual context' },
                                                        ].map((kb, idx) => (
                                                            <div key={idx} className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 flex items-center justify-between group hover:bg-white/[0.05] hover:border-white/10 transition-all duration-300">
                                                                <div>
                                                                    <span className="text-sm font-bold text-text-primary block mb-0.5">{kb.label}</span>
                                                                    <span className="text-[11px] text-text-tertiary font-medium">{kb.desc}</span>
                                                                </div>
                                                                <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-[10px] font-black text-white shadow-xl min-w-[100px] text-center uppercase tracking-wider">
                                                                    {kb.key}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Window Management */}
                                                <div>
                                                    <h4 className="text-[10px] font-black text-text-tertiary uppercase tracking-[0.2em] mb-3 px-1">Window Management</h4>
                                                    <div className="space-y-2.5">
                                                        {[
                                                            { label: 'Move Up', key: 'Ctrl/Cmd + ↑', desc: 'Shift the active window upwards' },
                                                            { label: 'Move Down', key: 'Ctrl/Cmd + ↓', desc: 'Shift the active window downwards' },
                                                            { label: 'Move Left', key: 'Ctrl/Cmd + ←', desc: 'Shift the active window to the left' },
                                                            { label: 'Move Right', key: 'Ctrl/Cmd + →', desc: 'Shift the active window to the right' },
                                                        ].map((kb, idx) => (
                                                            <div key={idx} className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 flex items-center justify-between group hover:bg-white/[0.05] hover:border-white/10 transition-all duration-300">
                                                                <div>
                                                                    <span className="text-sm font-bold text-text-primary block mb-0.5">{kb.label}</span>
                                                                    <span className="text-[11px] text-text-tertiary font-medium">{kb.desc}</span>
                                                                </div>
                                                                <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-[10px] font-black text-white shadow-xl min-w-[100px] text-center uppercase tracking-wider">
                                                                    {kb.key}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'interview' && (
                                    <SessionSettings mode="interview" />
                                )}

                                {activeTab === 'meeting' && (
                                    <SessionSettings mode="meeting" />
                                )}

                                {activeTab === 'about' && (
                                    <AboutSection />
                                )}
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default SettingsOverlay;
