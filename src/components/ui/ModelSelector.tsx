import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check, Cloud, Terminal, Monitor, Server, Plus, RefreshCw, AlertCircle } from 'lucide-react';

interface ModelSelectorProps {
    currentModel: string;
    onSelectModel: (model: string) => void;
}

interface CustomProvider {
    id: string;
    name: string;
    curlCommand: string;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({ currentModel, onSelectModel }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'cloud' | 'custom' | 'local'>('cloud');
    const [ollamaModels, setOllamaModels] = useState<string[]>([]);
    const [customProviders, setCustomProviders] = useState<CustomProvider[]>([]);
    const [credentials, setCredentials] = useState<any>(null);
    const [loadingStatus, setLoadingStatus] = useState<{ model: string, status: 'loading' | 'ready' | 'error' } | null>(null);
    const [activeUsage, setActiveUsage] = useState<{ model: string, provider: string } | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Listen for model events
    useEffect(() => {
        if (!window.electronAPI) return;

        const unsubs: (() => void)[] = [];

        unsubs.push(window.electronAPI.on('model-status', (info: any) => {
            console.log('[ModelSelector] Status update:', info);
            setLoadingStatus(info);

            // Clear status after 3 seconds if ready
            if (info.status === 'ready' || info.status === 'error') {
                setTimeout(() => {
                    setLoadingStatus(prev => prev?.model === info.model ? null : prev);
                }, 3000);
            }
        }));

        unsubs.push(window.electronAPI.on('active-model', (info: any) => {
            console.log('[ModelSelector] Active model:', info);
            setActiveUsage(info);
            // Show for 5 seconds when an answer starts
            setTimeout(() => {
                setActiveUsage(null);
            }, 5000);
        }));

        return () => unsubs.forEach(unsub => unsub());
    }, []);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Load Data
    useEffect(() => {
        if (!isOpen) return;

        const loadData = async () => {
            try {
                // Load Custom
                const custom = await window.electronAPI?.invoke('get-custom-providers') as CustomProvider[];
                if (custom) setCustomProviders(custom);

                // Load Ollama
                const local = await window.electronAPI?.invoke('get-available-ollama-models') as string[];
                if (local) setOllamaModels(local);

                // Load Credentials Status
                const creds = await window.electronAPI?.invoke('get-stored-credentials');
                if (creds) setCredentials(creds);
            } catch (e) {
                console.error("Failed to load models or credentials:", e);
            }
        };
        loadData();
    }, [isOpen]);

    const handleSelect = (model: string) => {
        // For custom/local, we might need to pass an ID or specific format
        // The backend logic (LLMHelper) needs to know how to handle this string or we need a richer object
        // For now, consistent with existing app, we pass a string. 
        // We'll rely on a prefix convention or just the name if unique enough, 
        // OR the app state handling this selection needs to store provider type.
        // Assuming onSelectModel handles the switching logic.

        onSelectModel(model);
        setIsOpen(false);
    };

    const getModelDisplayName = (model: string) => {
        if (model.startsWith('ollama-')) return model.replace('ollama-', '');
        if (model === 'gemini-3-flash-preview') return 'Gemini 3 Flash';
        if (model === 'gemini-3-pro-preview') return 'Gemini 3 Pro';
        if (model === 'llama-3.3-70b-versatile') return 'Groq Llama 3.3';
        if (model === 'gpt-5.2-chat-latest') return 'GPT 5.2';
        if (model === 'claude-sonnet-4-5') return 'Sonnet 4.5';

        // Check custom providers
        const custom = customProviders.find(p => p.id === model || p.name === model);
        if (custom) return custom.name;

        return model;
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all text-[10px] font-bold uppercase tracking-widest text-text-primary min-w-[160px] relative group"
            >
                <div className="flex items-center gap-2 truncate">
                    {loadingStatus?.status === 'loading' ? (
                        <RefreshCw size={10} className="animate-spin text-text-primary shrink-0" />
                    ) : activeUsage ? (
                        <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse shadow-[0_0_8px_white] shrink-0" />
                    ) : null}

                    <div className="truncate">
                        {loadingStatus?.status === 'loading'
                            ? `${getModelDisplayName(loadingStatus.model)}`
                            : activeUsage
                                ? `${getModelDisplayName(activeUsage.model)}`
                                : getModelDisplayName(currentModel)}
                    </div>
                </div>
                <ChevronDown size={12} className={`shrink-0 ml-auto text-text-tertiary transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />

                {/* Fallback label */}
                {activeUsage && activeUsage.model !== currentModel.replace('ollama-', '') && (
                    <div className="absolute -top-8 left-0 bg-white text-black text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                        Fallback Core: {getModelDisplayName(activeUsage.model)}
                    </div>
                )}
            </button>

            {isOpen && (
                <div className="absolute bottom-full left-0 mb-2 w-72 bg-bg-main/90 border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden backdrop-blur-3xl flex flex-col">
                    {/* Tabs (Fixed at Top) */}
                    <div className="flex-none flex bg-white/5 border-b border-white/5 p-1.5 gap-1.5 z-10 relative">
                        <button
                            onClick={() => setActiveTab('cloud')}
                            className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] transition-all ${activeTab === 'cloud' ? 'text-black bg-white shadow-xl' : 'text-text-tertiary hover:text-text-primary hover:bg-white/5'}`}
                        >
                            Cloud
                        </button>
                        <button
                            onClick={() => setActiveTab('custom')}
                            className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] transition-all ${activeTab === 'custom' ? 'text-black bg-white shadow-xl' : 'text-text-tertiary hover:text-text-primary hover:bg-white/5'}`}
                        >
                            Custom
                        </button>
                        <button
                            onClick={() => setActiveTab('local')}
                            className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] transition-all ${activeTab === 'local' ? 'text-black bg-white shadow-xl' : 'text-text-tertiary hover:text-text-primary hover:bg-white/5'}`}
                        >
                            Local
                        </button>
                    </div>

                    {/* Scrollable Content */}
                    <div className="flex-1 p-2 max-h-[220px] overflow-y-auto overflow-x-hidden custom-scrollbar">

                        {/* Cloud Models */}
                        {activeTab === 'cloud' && (
                            <div className="space-y-1">
                                {(!credentials || credentials.hasGeminiKey) && (
                                    <>
                                        <ModelOption
                                            id="gemini-3-flash-preview"
                                            name="Gemini 3 Flash"
                                            desc="Fastest • Multimodal"
                                            icon={<Monitor size={14} />}
                                            selected={currentModel === 'gemini-3-flash-preview'}
                                            onSelect={() => handleSelect('gemini-3-flash-preview')}
                                        />
                                        <ModelOption
                                            id="gemini-3-pro-preview"
                                            name="Gemini 3 Pro"
                                            desc="Reasoning • High Quality"
                                            icon={<Monitor size={14} />}
                                            selected={currentModel === 'gemini-3-pro-preview'}
                                            onSelect={() => handleSelect('gemini-3-pro-preview')}
                                        />
                                        <div className="h-px bg-border-subtle my-1" />
                                    </>
                                )}

                                {credentials?.hasOpenaiKey && (
                                    <ModelOption
                                        id="gpt-5.2-chat-latest"
                                        name="GPT 5.2"
                                        desc="OpenAI"
                                        icon={<Cloud size={14} />}
                                        selected={currentModel === 'gpt-5.2-chat-latest'}
                                        onSelect={() => handleSelect('gpt-5.2-chat-latest')}
                                    />
                                )}

                                {credentials?.hasClaudeKey && (
                                    <ModelOption
                                        id="claude-sonnet-4-5"
                                        name="Sonnet 4.5"
                                        desc="Anthropic"
                                        icon={<Cloud size={14} />}
                                        selected={currentModel === 'claude-sonnet-4-5'}
                                        onSelect={() => handleSelect('claude-sonnet-4-5')}
                                    />
                                )}

                                {credentials?.hasGroqKey && (
                                    <ModelOption
                                        id="llama-3.3-70b-versatile"
                                        name="Groq Llama 3.3"
                                        desc="Ultra Fast"
                                        icon={<Cloud size={14} />}
                                        selected={currentModel === 'llama-3.3-70b-versatile'}
                                        onSelect={() => handleSelect('llama-3.3-70b-versatile')}
                                    />
                                )}

                                {credentials && !credentials.hasGeminiKey && !credentials.hasOpenaiKey && !credentials.hasClaudeKey && !credentials.hasGroqKey && (
                                    <div className="text-center py-6 text-text-tertiary">
                                        <p className="text-xs mb-2">No cloud API keys set.</p>
                                        <button
                                            onClick={() => window.electronAPI.invoke('toggle-settings-window')}
                                            className="text-[10px] text-accent-primary hover:underline"
                                        >
                                            Add Keys in Settings
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Custom Models */}
                        {activeTab === 'custom' && (
                            <div className="space-y-1">
                                {customProviders.length === 0 ? (
                                    <div className="text-center py-6 text-text-tertiary">
                                        <p className="text-xs mb-2">No custom providers.</p>
                                        <button className="text-[10px] text-accent-primary hover:underline">Manage in Settings</button>
                                    </div>
                                ) : (
                                    customProviders.map(provider => (
                                        <ModelOption
                                            key={provider.id}
                                            id={provider.id}
                                            name={provider.name}
                                            desc="Custom cURL"
                                            icon={<Terminal size={14} />}
                                            selected={currentModel === provider.id}
                                            onSelect={() => handleSelect(provider.id)}
                                        />
                                    ))
                                )}
                            </div>
                        )}

                        {/* Local Models (Ollama) */}
                        {activeTab === 'local' && (
                            <div className="space-y-1">
                                {ollamaModels.length === 0 ? (
                                    <div className="text-center py-6 text-text-tertiary">
                                        <p className="text-xs">No Ollama models found.</p>
                                        <p className="text-[10px] mt-1 opacity-70">Ensure Ollama is running.</p>
                                    </div>
                                ) : (
                                    ollamaModels.map(model => (
                                        <ModelOption
                                            key={model}
                                            id={`ollama-${model}`}
                                            name={model}
                                            desc="Local"
                                            icon={<Server size={14} />}
                                            selected={currentModel === `ollama-${model}`}
                                            loading={loadingStatus?.model === model ? loadingStatus.status : undefined}
                                            onSelect={() => handleSelect(`ollama-${model}`)}
                                        />
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

interface ModelOptionProps {
    id: string;
    name: string;
    desc: string;
    icon: React.ReactNode;
    selected: boolean;
    loading?: 'loading' | 'ready' | 'error';
    onSelect: () => void;
}

const ModelOption: React.FC<ModelOptionProps> = ({ name, desc, icon, selected, loading, onSelect }) => (
    <button
        onClick={onSelect}
        className={`w-full flex items-center justify-between p-2 rounded-xl transition-all group ${selected ? 'bg-white/10 ring-1 ring-white/10' : 'hover:bg-white/5'}`}
    >
        <div className="flex items-center gap-3">
            <div className={`p-1.5 rounded-lg transition-all ${selected ? 'bg-white text-black' : 'bg-white/5 text-text-tertiary group-hover:text-text-primary'}`}>
                {loading === 'loading' ? <RefreshCw size={12} className="animate-spin" /> : React.cloneElement(icon as React.ReactElement, { size: 12 })}
            </div>
            <div className="text-left">
                <div className={`text-[11px] font-bold uppercase tracking-widest truncate max-w-[140px] ${selected ? 'text-text-primary' : 'text-text-secondary'}`}>{name}</div>
                <div className="text-[9px] text-text-tertiary font-medium">
                    {loading === 'loading' ? 'Mapping VRAM...' : loading === 'ready' ? 'Active' : loading === 'error' ? 'Load failed' : desc}
                </div>
            </div>
        </div>
        {selected && !loading && <Check size={12} className="text-text-primary opacity-40" />}
        {loading === 'ready' && <div className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_8px_white]" />}
        {loading === 'error' && <AlertCircle size={12} className="text-red-500" />}
    </button>
);
