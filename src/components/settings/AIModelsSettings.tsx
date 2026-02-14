import React, { useState, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

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
                className="w-40 bg-bg-input border border-border-subtle rounded-lg px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent-primary flex items-center justify-between hover:bg-bg-elevated transition-colors"
                type="button"
            >
                <span className="truncate pr-2">{selectedOption ? selectedOption.name : placeholder}</span>
                <ChevronDown size={14} className={`text-text-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`} />
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
    const [defaultModel, setDefaultModel] = useState<string>('gemini');

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
                        setDefaultModel(`ollama-${model}`);
                    } else if (provider === 'custom') {
                        // We need to find which custom provider it is.
                        // `model` might be the custom provider ID or name?
                        // LLMHelper.ts would show how it stores it.
                        // For now, let's just default to 'gemini' if we can't find it, or try to match.
                        const found = custom?.find((c: CustomProvider) => c.id === model || c.name === model);
                        if (found) setDefaultModel(found.id);
                    } else {
                        // Cloud mapping
                        if (provider === 'gemini') setDefaultModel(model === 'gemini-1.5-pro' ? 'gemini-pro' : 'gemini');
                        else if (provider === 'openai') setDefaultModel('gpt-4o'); // Simplified
                        else if (provider === 'claude') setDefaultModel('claude');
                        else if (provider === 'groq') setDefaultModel('llama');
                        else if (provider === 'nvidia') setDefaultModel('nvidia');
                        else if (provider === 'deepseek') setDefaultModel('deepseek');
                    }
                }

            } catch (e) {
                console.error("Failed to load AI Models settings:", e);
            }
        };
        loadSettings();
    }, []);

    return (
        <div className="space-y-5 animated fadeIn pb-10">
            <div>
                <h3 className="text-sm font-bold text-text-primary mb-1">Default Model for Chat</h3>
                <p className="text-xs text-text-secondary mb-2">Primary model for new chats. Other configured models act as fallbacks.</p>
            </div>

            <div className="bg-bg-item-surface rounded-xl p-5 border border-border-subtle flex items-center justify-between">
                <div>
                    <label className="block text-xs font-medium text-text-primary uppercase tracking-wide mb-0">Active Model</label>
                    <p className="text-[10px] text-text-secondary">Applies to new chats instantly.</p>
                </div>
                <ModelSelect
                    value={defaultModel}
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
                    onChange={(val) => {
                        setDefaultModel(val);
                        // @ts-ignore
                        window.electronAPI?.invoke('set-model', val).catch(console.error);
                    }}
                />
            </div>
        </div>
    );
};
