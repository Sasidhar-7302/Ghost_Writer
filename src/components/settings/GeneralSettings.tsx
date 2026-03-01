import React, { useState, useEffect } from 'react';
import { Info, Monitor, Globe } from 'lucide-react';

interface GeneralSettingsProps { }

export const GeneralSettings: React.FC<GeneralSettingsProps> = () => {
    // Recognition Language
    const [recognitionLanguage, setRecognitionLanguage] = useState('');
    const [availableLanguages, setAvailableLanguages] = useState<Record<string, any>>({});
    const [languageOptions, setLanguageOptions] = useState<any[]>([]);

    // Google Service Account
    const [serviceAccountPath, setServiceAccountPath] = useState('');

    // Security
    const [airGapMode, setAirGapMode] = useState(false);

    useEffect(() => {
        const loadInitialData = async () => {
            // Load Credentials
            try {
                // @ts-ignore  
                const creds = await window.electronAPI?.getStoredCredentials?.();
                if (creds && creds.googleServiceAccountPath) {
                    setServiceAccountPath(creds.googleServiceAccountPath);
                }
                if (creds && creds.airGapMode !== undefined) {
                    setAirGapMode(creds.airGapMode);
                }
            } catch (e) {
                console.error("Failed to load stored credentials:", e);
            }

            // Load Languages
            if (window.electronAPI?.getRecognitionLanguages) {
                const langs = await window.electronAPI.getRecognitionLanguages();
                setAvailableLanguages(langs);

                const desiredOrder = [
                    { key: 'english-india', label: 'English (India)' },
                    { key: 'english-us', label: 'English (United States)' },
                    { key: 'english-uk', label: 'English (United Kingdom)' },
                    { key: 'english-au', label: 'English (Australia)' },
                    { key: 'english-ca', label: 'English (Canada)' },
                ];

                const options = [
                    { value: 'auto', label: 'Auto (Recommended)' }
                ];

                desiredOrder.forEach(({ key, label }) => {
                    if (langs[key]) {
                        options.push({ value: key, label: label });
                    }
                });

                setLanguageOptions(options);

                const stored = localStorage.getItem('ghost_writer_recognition_language');
                if (!stored || stored === 'auto') {
                    setRecognitionLanguage('auto');
                    applyAutoLanguage(langs);
                } else if (langs[stored]) {
                    setRecognitionLanguage(stored);
                } else {
                    setRecognitionLanguage('auto');
                    applyAutoLanguage(langs);
                }
            }
        };
        loadInitialData();
    }, []);

    const applyAutoLanguage = (langs: any) => {
        const systemLocale = navigator.language;
        let match = 'english-us';
        for (const [key, config] of Object.entries(langs)) {
            if ((config as any).primary === systemLocale || (config as any).alternates.includes(systemLocale)) {
                match = key;
                break;
            }
        }
        if (systemLocale === 'en-IN') match = 'english-india';

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

    const handleSelectServiceAccount = async () => {
        try {
            const result = await window.electronAPI.selectServiceAccount();
            if (result.success && result.path) {
                setServiceAccountPath(result.path);
            }
        } catch (error) {
            console.error("Failed to select service account:", error);
        }
    };

    const handleAirGapToggle = async () => {
        const newMode = !airGapMode;
        setAirGapMode(newMode);
        if (window.electronAPI?.setAirGapMode) {
            await window.electronAPI.setAirGapMode(newMode);
        }
    };

    return (
        <div className="space-y-8 animated fadeIn">
            <div>
                <h3 className="text-lg font-bold text-text-primary mb-2">General Configuration</h3>
                <p className="text-xs text-text-secondary mb-4">Core settings for Ghost Writer.</p>

                <div className="space-y-4">
                    {/* Google Cloud Service Account */}
                    <div className="bg-[var(--bg-card-alpha)] backdrop-blur-xl rounded-xl p-5 border border-border-subtle">
                        <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Google Speech-to-Text Key (JSON)</label>
                        <div className="flex gap-3">
                            <div className="flex-1 bg-bg-input border border-border-subtle rounded-lg px-4 py-2.5 text-xs text-text-secondary truncate flex items-center">
                                {serviceAccountPath || "No file selected"}
                            </div>
                            <button
                                onClick={handleSelectServiceAccount}
                                className="bg-bg-input hover:bg-bg-secondary border border-border-subtle text-text-primary px-5 py-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
                            >
                                Select File
                            </button>
                        </div>
                        <p className="text-xs text-text-tertiary mt-2">Required for accurate speech recognition.</p>
                    </div>

                    {/* Recognition Language */}
                    <div className="bg-[var(--bg-card-alpha)] backdrop-blur-xl rounded-xl p-5 border border-border-subtle">
                        <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Recognition Language</label>
                        <div className="relative">
                            <select
                                value={recognitionLanguage}
                                onChange={(e) => handleLanguageChange(e.target.value)}
                                className="w-full appearance-none bg-bg-input border border-border-subtle rounded-lg px-4 py-2.5 text-xs text-text-primary focus:outline-none focus:border-accent-primary transition-colors cursor-pointer"
                            >
                                {languageOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                            <Globe size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
                        </div>
                        <p className="text-xs text-text-tertiary mt-2">Select your preferred accent for better recognition accuracy.</p>
                    </div>

                    {/* Air-Gap Mode */}
                    <div className="bg-[var(--bg-card-alpha)] backdrop-blur-xl rounded-xl p-5 border border-border-subtle relative overflow-hidden">
                        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-red-500 to-orange-500 opacity-50"></div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-xs font-bold text-red-400 uppercase tracking-wide">Strict Air-Gap Mode</label>
                            <button
                                onClick={handleAirGapToggle}
                                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full focus:outline-none transition-colors duration-200 ease-in-out ${airGapMode ? 'bg-red-500' : 'bg-bg-input'}`}
                                role="switch"
                                aria-checked={airGapMode}
                            >
                                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${airGapMode ? 'translate-x-2' : '-translate-x-2'}`} />
                            </button>
                        </div>
                        <p className="text-xs text-text-secondary leading-relaxed">
                            When enabled, <strong className="text-text-primary">Ghost Writer requires Local Whisper STT and Ollama LLM to be used.</strong> It will aggressively block any outgoing requests to public cloud providers (OpenAI, Gemini, Deepgram, etc.) to ensure complete data privacy for highly sensitive meetings.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
