import React, { useState, useEffect } from 'react';
import { ChevronDown, Check, Save, RefreshCw } from 'lucide-react';

interface CustomProvider {
    id: string;
    name: string;
    curlCommand: string;
}

interface ModelOption {
    id: string;
    name: string;
}

interface ModelSelectProps {
    value: string;
    options: ModelOption[];
    onChange: (value: string) => void;
    placeholder?: string;
}

const ModelSelect: React.FC<ModelSelectProps> = ({ value, options, onChange, placeholder = "Select model" }) => {
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

    const selectedOption = options.find(o => o.id === value);

    return (
        <div className="relative" ref={containerRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-56 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs text-text-primary focus:outline-none focus:border-white/30 flex items-center justify-between hover:bg-white/10 transition-all duration-300 shadow-sm"
                type="button"
            >
                <span className="truncate pr-2 font-bold">{selectedOption ? selectedOption.name : placeholder}</span>
                <ChevronDown size={14} className={`text-text-tertiary transition-transform duration-500 ${isOpen ? 'rotate-180 text-white' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute top-full right-0 mt-1 w-full bg-bg-elevated border border-border-subtle rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto animated fadeIn">
                    <div className="p-1 space-y-0.5">
                        {options.map((option) => (
                            <button
                                key={option.id}
                                onClick={() => {
                                    onChange(option.id);
                                    setIsOpen(false);
                                }}
                                className={`w-full text-left px-3 py-2 text-xs rounded-md flex items-center justify-between group transition-colors ${value === option.id ? 'bg-bg-input hover:bg-bg-elevated text-text-primary' : 'text-text-secondary hover:bg-bg-input hover:text-text-primary'}`}
                                type="button"
                            >
                                <span className="truncate">{option.name}</span>
                                {value === option.id && <Check size={14} className="text-accent-primary shrink-0 ml-2" />}
                            </button>
                        ))}
                        {options.length === 0 && (
                            <div className="px-3 py-2 text-xs text-gray-500 italic">No models available</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export const AIModelsSettings: React.FC = () => {
    // State
    const [hasStoredKey, setHasStoredKey] = useState<Record<string, boolean>>({});
    const [customProviders, setCustomProviders] = useState<CustomProvider[]>([]);
    const [ollamaModels, setOllamaModels] = useState<string[]>([]);
    const [savedModel, setSavedModel] = useState<string>('gemini');
    const [selectedModel, setSelectedModel] = useState<string>('gemini');
    const [isApplying, setIsApplying] = useState(false);
    const [showApplied, setShowApplied] = useState(false);
    const [gpuInfo, setGpuInfo] = useState<{name: string, vramGB: number, tier: string} | null>(null);

    // Load Data
    useEffect(() => {
        const loadSettings = async () => {
            try {
                // @ts-ignore
                const currentConfig = await window.electronAPI?.invoke('get-current-llm-config');
                if (currentConfig && currentConfig.model) {
                    // Logic to reconstruct the "selected" ID from the backend config
                    // This might be tricky if backend only returns model ID but not provider.
                    // But usually we set the "provider" based on the selection.
                    // For now, let's rely on 'get-current-llm-config' or we might need to store the "user selection" in credentials too?
                    // The UI currently sets it via 'set-model'.
                    // Actually, 'get-current-llm-config' returns { provider, model, isOllama }.

                    // But we don't have a direct "get-default-model-selection" API that maps back to the UI ID.
                    // However, we can infer it.
                    // If isOllama, ID is `ollama-${model}`.
                    // If custom, ID is provider.id.
                    // If cloud, ID is usually the provider name or specific model ID (e.g. 'gemini-pro').

                    // Let's check how 'set-model' works in main.ts.
                    // It seems it calls llmHelper.setModel(val). 
                    // AND it calls `reconfigureSTT`? No, that's for STT.

                    // Actually, let's check `get-current-llm-config` in `ipcHandlers.ts` (line 354). 
                    // It returns { provider, model, isOllama }.
                }

                // Load Credentials (to see which cloud providers are enabled)
                // @ts-ignore
                const creds = await window.electronAPI?.getStoredCredentials?.();
                if (creds) {
                    setHasStoredKey({
                        gemini: creds.hasGeminiKey,
                        groq: creds.hasGroqKey,
                        openai: creds.hasOpenaiKey,
                        claude: creds.hasClaudeKey,
                        nvidia: creds.hasNvidiaKey,
                        deepseek: creds.hasDeepseekKey
                    });
                }

                // Load Custom Providers
                // @ts-ignore
                const custom = await window.electronAPI?.invoke('get-custom-providers');
                if (custom) setCustomProviders(custom);

                // Load Ollama Models
                // @ts-ignore
                const models = await window.electronAPI?.invoke('get-available-ollama-models');
                if (models) setOllamaModels(models);

                // Determine current selection
                // This is a bit of a heuristic since we don't store the exact "UI ID" in the backend, we store the result.
                // But `set-model` in the UI does this: 
                // invoke('set-model', val)

                // Wait, I didn't see `set-model` handler in `ipcHandlers.ts` view!
                // It might be in `main.ts` or somewhere else I missed?
                // Or I missed it in `ipcHandlers.ts`. 
                // Let's assume there is a `get-ui-selected-model` or similar, OR just rely on `get-current-llm-config` and map it back.

                // Actually, in `AIProvidersSettings.tsx` it did `setDefaultModel(val)`. It had local state `defaultModel`. 
                // Does it persist?
                // `handleTestKey` etc persist keys.
                // `setDefaultModel` is just state?
                // Ah, line 332: `window.electronAPI?.invoke('set-model', val)`.

                // If I reload the app, does it remember?
                // If the backend remembers, then `get-current-llm-config` should tell us.
                // Let's mapping:
                // if provider == 'gemini', model == 'gemini-1.5-flash' -> id = 'gemini'
                // if provider == 'gemini', model == 'gemini-1.5-pro' -> id = 'gemini-pro'
                // etc.

                if (currentConfig) {
                    const { provider, model, isOllama } = currentConfig;
                    if (isOllama) {
                        setSavedModel(`ollama-${model}`);
                        setSelectedModel(`ollama-${model}`);
                    } else if (provider === 'custom') {
                        const found = custom?.find((c: CustomProvider) => c.id === model || c.name === model);
                        if (found) {
                            setSavedModel(found.id);
                            setSelectedModel(found.id);
                        }
                    } else {
                        // Cloud mapping
                        let id = 'gemini';
                        if (provider === 'gemini') id = model === 'gemini-1.5-pro' ? 'gemini-pro' : 'gemini';
                        else if (provider === 'openai') id = 'gpt-4o';
                        else if (provider === 'claude') id = 'claude';
                        else if (provider === 'groq') id = 'llama';
                        else if (provider === 'nvidia') id = 'nvidia';
                        else if (provider === 'deepseek') id = 'deepseek';

                        setSavedModel(id);
                        setSelectedModel(id);
                    }
                }

                if (window.electronAPI?.getGpuInfo) {
                     const gpu = await window.electronAPI.getGpuInfo();
                     if (gpu.success && gpu.info) {
                         setGpuInfo(gpu.info);
                     }
                }

            } catch (e) {
                console.error("Failed to load AI Models settings:", e);
            }
        };
        loadSettings();
    }, []);

    const handleApply = async () => {
        setIsApplying(true);
        try {
            // @ts-ignore
            await window.electronAPI?.invoke('set-model', selectedModel);
            setSavedModel(selectedModel);
            setShowApplied(true);
            setTimeout(() => setShowApplied(false), 3000);
        } catch (e) {
            console.error("Failed to apply model settings:", e);
        } finally {
            setIsApplying(false);
        }
    };

    return (
        <div className="space-y-5 animated fadeIn pb-10">
            <div>
                <h3 className="text-sm font-bold text-text-primary mb-1">Default Model for Chat</h3>
                <p className="text-xs text-text-secondary mb-2">Primary model for new chats. Other configured models act as fallbacks.</p>
            </div>

            <div className="relative z-30 bg-white/5 backdrop-blur-3xl rounded-2xl p-6 border border-white/10 flex items-center justify-between shadow-2xl transition-all duration-500 hover:bg-white/[0.07]">
                <div>
                    <label className="block text-xs font-medium text-text-primary uppercase tracking-wide mb-0">Active Model</label>
                    <p className="text-[10px] text-text-secondary">Applies to new chats instantly.</p>
                </div>
                <div className="flex items-center gap-3">
                    {showApplied && (
                        <div className="flex items-center gap-1.5 text-green-500 font-medium text-[10px] animated fadeIn">
                            <Check size={12} />
                            Applied
                        </div>
                    )}
                    <ModelSelect
                        value={selectedModel}
                        options={[
                            ...(hasStoredKey.gemini ? [{ id: 'gemini', name: 'Gemini 3 Flash' }, { id: 'gemini-pro', name: 'Gemini 3 Pro' }] : []),
                            ...(hasStoredKey.openai ? [{ id: 'gpt-4o', name: 'GPT 5.2' }] : []),
                            ...(hasStoredKey.claude ? [{ id: 'claude', name: 'Sonnet 4.5' }] : []),
                            ...(hasStoredKey.groq ? [{ id: 'llama', name: 'Groq Llama 3.3' }] : []),
                            ...(hasStoredKey.nvidia ? [{ id: 'nvidia', name: 'NVIDIA Kimi K2.5' }] : []),
                            ...(hasStoredKey.deepseek ? [{ id: 'deepseek', name: 'DeepSeek R1' }] : []),
                            ...customProviders.map(p => ({ id: p.id, name: p.name })),
                            ...ollamaModels.map(m => ({ id: `ollama-${m}`, name: `${m} (Local)` }))
                        ]}
                        onChange={(val) => setSelectedModel(val)}
                    />
                    {selectedModel !== savedModel && (
                        <button
                            onClick={handleApply}
                            disabled={isApplying}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-accent-primary text-bg-primary hover:bg-accent-secondary disabled:opacity-50 transition-all flex items-center gap-2 shadow-sm hover:shadow-md"
                        >
                            {isApplying ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
                            Apply
                        </button>
                    )}
                </div>
            </div>

            {/* VRAM Budgeting UI - Only show when an Ollama model is selected and GPU is detected */}
            {selectedModel.startsWith('ollama-') && gpuInfo && (
                <div className="relative z-20 bg-white/5 backdrop-blur-3xl rounded-2xl p-6 border border-white/10 mt-4 space-y-4 shadow-xl transition-all duration-500 hover:bg-white/[0.07]">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-text-primary uppercase tracking-wide">VRAM Budget</label>
                        <span className="text-[10px] text-text-secondary bg-bg-input px-2 py-1 rounded-md border border-border-subtle">{gpuInfo.name}</span>
                    </div>

                    {(() => {
                        const modelName = selectedModel.replace('ollama-', '');
                        
                        // Heuristic VRAM calculation (rough estimates)
                        let requiredVRAM = 4.5; // default 7B
                        if (modelName.includes('32b')) requiredVRAM = 18;
                        else if (modelName.includes('14b')) requiredVRAM = 9;
                        else if (modelName.includes('8b')) requiredVRAM = 5.5;
                        else if (modelName.includes('7b')) requiredVRAM = 4.5;
                        else if (modelName.includes('3b')) requiredVRAM = 2.5;
                        else if (modelName.includes('1.5b')) requiredVRAM = 1.5;

                        const totalVRAM = gpuInfo.vramGB;
                        // For non-NVIDIA/AMD discrete GPUs or generic, totalVRAM might be 0, assume minimum shared.
                        const effectiveVRAM = totalVRAM > 0 ? totalVRAM : 8; // fallback assuming shared memory
                        
                        const usedRatio = Math.min((requiredVRAM / effectiveVRAM) * 100, 100);
                        const isWarning = usedRatio > 85;
                        const isDanger = usedRatio > 100 || effectiveVRAM < requiredVRAM;

                        return (
                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <div className="flex justify-between text-[11px] font-medium">
                                        <span className={isDanger ? 'text-red-400' : isWarning ? 'text-orange-400' : 'text-emerald-400'}>
                                            Estimated Usage: {requiredVRAM} GB
                                        </span>
                                        <span className="text-text-secondary">Capacity: {totalVRAM > 0 ? `${totalVRAM} GB` : 'Shared Memory'}</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-bg-input rounded-full overflow-hidden">
                                        <div 
                                            className={`h-full rounded-full transition-all duration-500 ${isDanger ? 'bg-red-500' : isWarning ? 'bg-orange-500' : 'bg-emerald-500'}`}
                                            style={{ width: `${usedRatio}%` }}
                                        />
                                    </div>
                                </div>

                                {isDanger && (
                                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-2 rounded-lg text-[11px] leading-relaxed">
                                        <strong>⚠️ Potential Slower Generation:</strong> This model requires more VRAM than your GPU has available. It will fallback to system RAM, causing significantly slower response times.
                                    </div>
                                )}
                                {!isDanger && isWarning && (
                                    <div className="bg-orange-500/10 border border-orange-500/20 text-orange-400 px-3 py-2 rounded-lg text-[11px] leading-relaxed">
                                        <strong>⚠️ High VRAM Expected:</strong> This model will use most of your VRAM, leaving little room for other heavy applications or high-res gaming during generation.
                                    </div>
                                )}
                                {!isDanger && !isWarning && totalVRAM > 0 && (
                                    <div className="text-[10px] text-text-secondary italic">
                                        Your hardware can comfortably run this model.
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </div>
            )}
        </div>
    );
};
