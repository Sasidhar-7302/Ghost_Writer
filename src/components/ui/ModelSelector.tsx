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
    const [openrouterModels, setOpenrouterModels] = useState<any[]>([]);
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
                if (creds) {
                    setCredentials(creds);
                    if (creds.hasOpenrouterKey) {
                        const orModels = await window.electronAPI?.invoke('get-available-openrouter-models');
                        if (orModels) setOpenrouterModels(orModels);
                    }
                }
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
        if (model.includes('gemini-1.5-flash')) return 'Gemini 1.5 Flash';
        if (model.includes('gemini-1.5-pro')) return 'Gemini 1.5 Pro';
        if (model.includes('gpt-4o-mini')) return 'GPT-4o Mini';
        if (model.includes('gpt-4o')) return 'GPT-4o';
        if (model.includes('claude-3-5-sonnet')) return 'Claude 3.5 Sonnet';
        if (model.includes('claude-3-5-haiku')) return 'Claude 3.5 Haiku';
        if (model.includes('llama-3.3-70b')) return 'Llama 3.3 70B';
        if (model.includes('llama-3.1-405b')) return 'Llama 3.1 405B';
        if (model === 'liquid/lfm-40b') return 'Liquid LFM';
        if (model === 'anthropic/claude-3.5-sonnet') return 'Claude 3.5 (OR)';
        if (model === 'meta-llama/llama-3.1-405b') return 'Llama 3.1 405B';

        // Check custom providers
        const custom = customProviders.find(p => p.id === model || p.name === model);
        if (custom) return custom.name;

        // Check OpenRouter dynamic models
        const orModel = openrouterModels.find(m => m.id === model);
        if (orModel) return orModel.name.split('/').pop() || orModel.name;

        return model;
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all text-xs font-bold uppercase tracking-widest text-white min-w-[160px] relative group"
            >
                <div className="flex items-center gap-2 truncate">
                    {loadingStatus?.status === 'loading' ? (
                        <RefreshCw size={12} className="animate-spin text-white shrink-0" />
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
                <ChevronDown size={14} className={`shrink-0 ml-auto text-white/50 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />

                {/* Fallback label */}
                {activeUsage && activeUsage.model !== currentModel.replace('ollama-', '') && (
                    <div className="absolute -top-10 left-0 bg-white text-black text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                        Fallback Core: {getModelDisplayName(activeUsage.model)}
                    </div>
                )}
            </button>

            {isOpen && (
                <div className="absolute bottom-full left-0 mb-2 w-72 bg-[#12121a]/95 border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden backdrop-blur-3xl flex flex-col">
                    {/* Tabs (Fixed at Top) */}
                    <div className="flex-none flex bg-white/5 border-b border-white/5 p-1.5 gap-1.5 z-10 relative">
                        <button
                            onClick={() => setActiveTab('cloud')}
                            className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all ${activeTab === 'cloud' ? 'text-black bg-white shadow-xl' : 'text-white/50 hover:text-white hover:bg-white/5'}`}
                        >
                            Cloud
                        </button>
                        <button
                            onClick={() => setActiveTab('custom')}
                            className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all ${activeTab === 'custom' ? 'text-black bg-white shadow-xl' : 'text-white/50 hover:text-white hover:bg-white/5'}`}
                        >
                            Custom
                        </button>
                        <button
                            onClick={() => setActiveTab('local')}
                            className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all ${activeTab === 'local' ? 'text-black bg-white shadow-xl' : 'text-white/50 hover:text-white hover:bg-white/5'}`}
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
                                        <div className="px-2 py-1 text-[8px] font-black uppercase tracking-[0.2em] text-white/30">Google Gemini</div>
                                        <ModelOption
                                            id="gemini-1.5-flash"
                                            name="Gemini 1.5 Flash"
                                            desc="Fastest • Balanced"
                                            icon={<Monitor size={14} />}
                                            selected={currentModel === 'gemini-1.5-flash'}
                                            onSelect={() => handleSelect('gemini-1.5-flash')}
                                        />
                                        <ModelOption
                                            id="gemini-1.5-pro"
                                            name="Gemini 1.5 Pro"
                                            desc="Deep Research • High Quality"
                                            icon={<Monitor size={14} />}
                                            selected={currentModel === 'gemini-1.5-pro'}
                                            onSelect={() => handleSelect('gemini-1.5-pro')}
                                        />
                                    </>
                                )}

                                {credentials?.hasOpenaiKey && (
                                    <>
                                        <div className="h-px bg-white/5 my-1" />
                                        <div className="px-2 py-1 text-[8px] font-black uppercase tracking-[0.2em] text-white/30">OpenAI</div>
                                        <ModelOption
                                            id="gpt-4o-mini"
                                            name="GPT-4o Mini"
                                            desc="Extremely Fast • Versatile"
                                            icon={<Cloud size={14} />}
                                            selected={currentModel === 'gpt-4o-mini'}
                                            onSelect={() => handleSelect('gpt-4o-mini')}
                                        />
                                        <ModelOption
                                            id="gpt-4o"
                                            name="GPT-4o"
                                            desc="SOTA Reasoning • Multimodal"
                                            icon={<Cloud size={14} />}
                                            selected={currentModel === 'gpt-4o'}
                                            onSelect={() => handleSelect('gpt-4o')}
                                        />
                                    </>
                                )}

                                {credentials?.hasClaudeKey && (
                                    <>
                                        <div className="h-px bg-white/5 my-1" />
                                        <div className="px-2 py-1 text-[8px] font-black uppercase tracking-[0.2em] text-white/30">Anthropic Claude</div>
                                        <ModelOption
                                            id="claude-3-5-haiku-latest"
                                            name="Claude 3.5 Haiku"
                                            desc="Instant • Coding"
                                            icon={<Cloud size={14} />}
                                            selected={currentModel === 'claude-3-5-haiku-latest'}
                                            onSelect={() => handleSelect('claude-3-5-haiku-latest')}
                                        />
                                        <ModelOption
                                            id="claude-3-5-sonnet-latest"
                                            name="Claude 3.5 Sonnet"
                                            desc="Best Reasoning/Speed Balance"
                                            icon={<Cloud size={14} />}
                                            selected={currentModel === 'claude-3-5-sonnet-latest'}
                                            onSelect={() => handleSelect('claude-3-5-sonnet-latest')}
                                        />
                                    </>
                                )}

                                {credentials?.hasGroqKey && (
                                    <>
                                        <div className="h-px bg-white/5 my-1" />
                                        <div className="px-2 py-1 text-[8px] font-black uppercase tracking-[0.2em] text-white/30">Groq (Ultra-Fast)</div>
                                        <ModelOption
                                            id="llama-3.3-70b-versatile"
                                            name="Llama 3.3 70B"
                                            desc="Low Latency • Versatile"
                                            icon={<Cloud size={14} />}
                                            selected={currentModel === 'llama-3.3-70b-versatile'}
                                            onSelect={() => handleSelect('llama-3.3-70b-versatile')}
                                        />
                                    </>
                                )}

                                {credentials?.hasOpenrouterKey && openrouterModels.length > 0 && (
                                    <>
                                        <div className="h-px bg-white/5 my-2" />
                                        
                                        {/* Free Models Section */}
                                        {openrouterModels.some(m => m.isFree) && (
                                            <>
                                                <div className="px-2 py-1 text-[8px] font-black uppercase tracking-[0.2em] text-green-400/50">OpenRouter Free (SOTA)</div>
                                                {/* Prioritize April 2026 Elite Set */}
                                                {[
                                                    { id: 'google/gemma-4-26b-a4b-it:free', tag: 'Fastest • Vision' },
                                                    { id: 'stepfun/step-3.5-flash:free', tag: 'Instant • Real-time' },
                                                    { id: 'google/gemma-4-31b-it:free', tag: 'Deep Logic • Summary SOTA' },
                                                    { id: 'qwen/qwen3-next-80b-a3b-instruct:free', tag: '262k Context • Stable' },
                                                    { id: 'minimax/minimax-m2.5:free', tag: 'Professional • Office Logic' }
                                                ].map(elite => {
                                                    const m = openrouterModels.find(mod => mod.id === elite.id);
                                                    return m ? (
                                                        <ModelOption
                                                            key={m.id}
                                                            id={m.id}
                                                            name={m.name}
                                                            desc={elite.tag}
                                                            icon={<Plus size={14} className="text-green-400" />}
                                                            selected={currentModel === m.id}
                                                            onSelect={() => handleSelect(m.id)}
                                                            isFree={true}
                                                        />
                                                    ) : null;
                                                })}
                                                
                                                {/* Show other free models that aren't in the elite set */}
                                                <div className="h-px bg-white/5 mx-2 my-1" />
                                                <div className="px-2 py-1 text-[7px] font-bold text-white/20">Additional Free Models</div>
                                                {openrouterModels
                                                    .filter(m => m.isFree && ![
                                                        'google/gemma-4-26b-a4b-it:free',
                                                        'stepfun/step-3.5-flash:free',
                                                        'google/gemma-4-31b-it:free',
                                                        'qwen/qwen3-next-80b-a3b-instruct:free',
                                                        'minimax/minimax-m2.5:free'
                                                    ].includes(m.id))
                                                    .slice(0, 5)
                                                    .map(model => (
                                                        <ModelOption
                                                            key={model.id}
                                                            id={model.id}
                                                            name={model.name}
                                                            desc="Universal Free"
                                                            icon={<Plus size={14} className="text-white/30" />}
                                                            selected={currentModel === model.id}
                                                            onSelect={() => handleSelect(model.id)}
                                                            isFree={true}
                                                        />
                                                    ))}
                                            </>
                                        )}

                                        {/* Featured/Paid Section */}
                                        <div className="px-2 py-1 mt-2 text-[8px] font-black uppercase tracking-[0.2em] text-white/30">OpenRouter Featured</div>
                                        {['deepseek/deepseek-chat', 'liquid/lfm-40b', 'anthropic/claude-3.5-sonnet', 'meta-llama/llama-3.1-405b'].map(id => {
                                            const m = openrouterModels.find(mod => mod.id === id);
                                            return m ? (
                                                <ModelOption
                                                    key={m.id}
                                                    id={m.id}
                                                    name={m.name}
                                                    desc={m.isFree ? "Free Model" : "Premium Model"}
                                                    icon={<Cloud size={14} />}
                                                    selected={currentModel === m.id}
                                                    onSelect={() => handleSelect(m.id)}
                                                    isFree={m.isFree}
                                                />
                                            ) : null;
                                        })}
                                    </>
                                )}

                                {credentials?.hasOpenrouterKey && openrouterModels.length === 0 && (
                                    <div className="px-3 py-2 text-[10px] text-white/30 italic">
                                        Loading OpenRouter catalog...
                                    </div>
                                )}

                                {credentials && !credentials.hasGeminiKey && !credentials.hasOpenaiKey && !credentials.hasClaudeKey && !credentials.hasGroqKey && (
                                    <div className="text-center py-5 text-white/50">
                                        <p className="text-sm mb-1.5 font-medium text-white/70">No cloud API keys set.</p>
                                        <p className="text-xs opacity-70 mb-3 px-4 leading-relaxed">
                                            If you don't use local Ollama models, add a <strong className="text-white">free Gemini or Groq</strong> API key to get started.
                                        </p>
                                        <button
                                            onClick={() => window.electronAPI.invoke('toggle-settings-window')}
                                            className="text-xs text-accent-primary hover:text-accent-primary/80 hover:underline font-bold px-3 py-1.5 bg-accent-primary/10 rounded-lg transition-colors"
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
                                    <div className="text-center py-6 text-white/50">
                                        <p className="text-sm mb-2">No custom providers.</p>
                                        <button className="text-xs text-accent-primary hover:underline">Manage in Settings</button>
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
                                    <div className="text-center py-6 text-white/50">
                                        <p className="text-sm">No Ollama models found.</p>
                                        <p className="text-xs mt-1 opacity-70">Ensure Ollama is running.</p>
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
    isFree?: boolean;
}

const ModelOption: React.FC<ModelOptionProps> = ({ name, desc, icon, selected, loading, isFree, onSelect }) => (
    <button
        onClick={onSelect}
        className={`w-full flex items-center justify-between p-2 rounded-xl transition-all group ${selected ? 'bg-white/10 ring-1 ring-white/10' : 'hover:bg-white/5'}`}
    >
        <div className="flex items-center gap-3">
            <div className={`p-1.5 rounded-lg transition-all ${selected ? 'bg-white text-black' : 'bg-white/5 text-white/50 group-hover:text-white'}`}>
                {loading === 'loading' ? <RefreshCw size={14} className="animate-spin" /> : React.cloneElement(icon as React.ReactElement, { size: 14 })}
            </div>
            <div className="text-left">
                <div className="flex items-center gap-1.5">
                    <div className={`text-xs font-bold uppercase tracking-widest truncate max-w-[140px] ${selected ? 'text-white' : 'text-white/70'}`}>{name}</div>
                    {isFree && (
                        <span className="px-1 py-0 rounded bg-green-500/10 text-green-400 text-[7px] font-black border border-green-500/20">FREE</span>
                    )}
                </div>
                <div className="text-[10px] text-white/50 font-medium">
                    {loading === 'loading' ? 'Mapping VRAM...' : loading === 'ready' ? 'Active' : loading === 'error' ? 'Load failed' : desc}
                </div>
            </div>
        </div>
        {selected && !loading && <Check size={14} className="text-white opacity-40" />}
        {loading === 'ready' && <div className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_8px_white]" />}
        {loading === 'error' && <AlertCircle size={12} className="text-red-500" />}
    </button>
);
