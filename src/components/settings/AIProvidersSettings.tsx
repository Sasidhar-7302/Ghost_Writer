import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, AlertCircle, CheckCircle, Save, ChevronDown, Check, RefreshCw, Zap } from 'lucide-react';
import { validateCurl } from '../../lib/curl-validator';

interface CustomProvider {
    id: string;
    name: string;
    curlCommand: string;
}



export const AIProvidersSettings: React.FC = () => {
    // Unified Cloud Providers
    const CLOUD_PROVIDERS = [
        { id: 'gemini', name: 'Google Gemini', placeholder: 'AIzaSy...', description: 'Advanced multimodal models' },
        { id: 'groq', name: 'Groq', placeholder: 'gsk_...', description: 'Ultra-fast inference' },
        { id: 'openai', name: 'OpenAI', placeholder: 'sk-...', description: 'GPT-4o and o1 reasoning' },
        { id: 'claude', name: 'Anthropic Claude', placeholder: 'sk-ant-...', description: 'Claude 3.5 Sonnet' },
        { id: 'nvidia', name: 'NVIDIA NIM', placeholder: 'nvapi-...', description: 'Powers Kimi K2.5' },
        { id: 'deepseek', name: 'DeepSeek', placeholder: 'sk-...', description: 'DeepSeek R1 Reasoning' },
        { id: 'openrouter', name: 'OpenRouter', placeholder: 'sk-or-...', description: 'Access 100+ models' }
    ];

    const [selectedProviderId, setSelectedProviderId] = useState('gemini');
    const [activeKeyInput, setActiveKeyInput] = useState('');

    // Status
    const [savedStatus, setSavedStatus] = useState<Record<string, boolean>>({});
    const [savingStatus, setSavingStatus] = useState<Record<string, boolean>>({});
    const [hasStoredKey, setHasStoredKey] = useState<Record<string, boolean>>({});
    const [testingStatus, setTestingStatus] = useState<Record<string, boolean>>({});
    const [testResult, setTestResult] = useState<Record<string, { success: boolean; error?: string } | null>>({});

    // --- Custom Providers ---
    const [customProviders, setCustomProviders] = useState<CustomProvider[]>([]);
    const [isEditingCustom, setIsEditingCustom] = useState(false);
    const [editingProvider, setEditingProvider] = useState<CustomProvider | null>(null);
    const [customName, setCustomName] = useState('');
    const [customCurl, setCustomCurl] = useState('');
    const [curlError, setCurlError] = useState<string | null>(null);

    // --- Local (Ollama) ---
    const [ollamaModels, setOllamaModels] = useState<string[]>([]);
    const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'detected' | 'not-found' | 'fixing'>('checking');
    const [ollamaRestarted, setOllamaRestarted] = useState(false);
    const [isRefreshingOllama, setIsRefreshingOllama] = useState(false);

    // --- Default Model ---


    // Load Initial Data
    useEffect(() => {
        const loadCredentials = async () => {
            try {
                // @ts-ignore
                const creds = await window.electronAPI?.getStoredCredentials?.();
                if (creds) {
                    setHasStoredKey({
                        gemini: creds.hasGeminiKey,
                        groq: creds.hasGroqKey,
                        openai: creds.hasOpenaiKey,
                        claude: creds.hasClaudeKey,
                        nvidia: creds.hasNvidiaKey,
                        deepseek: creds.hasDeepseekKey,
                        openrouter: creds.hasOpenrouterKey
                    });
                }

                // @ts-ignore
                const custom = await window.electronAPI?.invoke('get-custom-providers');
                if (custom) {
                    setCustomProviders(custom);
                }

                // Check Ollama
                checkOllama();

            } catch (e) {
                console.error("Failed to load settings:", e);
            }
        };
        loadCredentials();
    }, []);

    const checkOllama = async (isInitial = true) => {
        if (isInitial) setOllamaStatus('checking');
        try {
            // @ts-ignore
            const models = await window.electronAPI?.invoke('get-available-ollama-models');
            if (models && models.length > 0) {
                setOllamaModels(models);
                setOllamaStatus('detected');
            } else {
                if (isInitial && !ollamaRestarted) {
                    handleFixOllama();
                } else {
                    setOllamaStatus('not-found');
                }
            }
        } catch (e) {
            console.warn("Ollama check failed:", e);
            if (isInitial && !ollamaRestarted) {
                handleFixOllama();
            } else {
                setOllamaStatus('not-found');
            }
        }
    };

    const handleFixOllama = async () => {
        setOllamaStatus('fixing');
        try {
            // @ts-ignore
            const result = await window.electronAPI?.invoke('force-restart-ollama');
            if (result && result.success) {
                setOllamaRestarted(true);
                // Wait for server to be ready
                setTimeout(() => checkOllama(false), 2000);
            } else {
                setOllamaStatus('not-found');
            }
        } catch (e) {
            console.error("Fix failed", e);
            setOllamaStatus('not-found');
        }
    };

    const handleSaveKey = async () => {
        const provider = selectedProviderId;
        const key = activeKeyInput;
        if (!key.trim()) return;
        
        setSavingStatus(prev => ({ ...prev, [provider]: true }));
        try {
            let result;
            // @ts-ignore
            if (provider === 'gemini') result = await window.electronAPI.setGeminiApiKey(key);
            // @ts-ignore
            else if (provider === 'groq') result = await window.electronAPI.setGroqApiKey(key);
            // @ts-ignore
            else if (provider === 'openai') result = await window.electronAPI.setOpenaiApiKey(key);
            // @ts-ignore
            else if (provider === 'claude') result = await window.electronAPI.setClaudeApiKey(key);
            // @ts-ignore
            else if (provider === 'nvidia') result = await window.electronAPI.setNvidiaApiKey(key);
            // @ts-ignore
            else if (provider === 'deepseek') result = await window.electronAPI.setDeepseekApiKey(key);
            // @ts-ignore
            else if (provider === 'openrouter') result = await window.electronAPI.invoke('set-openrouter-api-key', key);

            if (result && result.success) {
                setSavedStatus(prev => ({ ...prev, [provider]: true }));
                setHasStoredKey(prev => ({ ...prev, [provider]: true }));
                setActiveKeyInput('');
                setTimeout(() => setSavedStatus(prev => ({ ...prev, [provider]: false })), 2000);
            }
        } catch (e) {
            console.error(`Failed to save ${provider} key:`, e);
        } finally {
            setSavingStatus(prev => ({ ...prev, [provider]: false }));
        }
    };

    const handleDeleteKey = async (provider: string) => {
        if (!confirm(`Clear API key for ${provider}?`)) return;
        try {
            // Re-using set-api-key with empty string effectively clears it in most managers
            // Or use specific clear logic if available
            // @ts-ignore
            let result;
            if (provider === 'gemini') result = await window.electronAPI.setGeminiApiKey('');
            else if (provider === 'groq') result = await window.electronAPI.setGroqApiKey('');
            else if (provider === 'openai') result = await window.electronAPI.setOpenaiApiKey('');
            else if (provider === 'claude') result = await window.electronAPI.setClaudeApiKey('');
            else if (provider === 'nvidia') result = await window.electronAPI.setNvidiaApiKey('');
            else if (provider === 'deepseek') result = await window.electronAPI.setDeepseekApiKey('');
            else if (provider === 'openrouter') result = await window.electronAPI.invoke('set-openrouter-api-key', '');

            if (result && result.success) {
                setHasStoredKey(prev => ({ ...prev, [provider]: false }));
            }
        } catch (e) {
            console.error(`Failed to delete ${provider} key:`, e);
        }
    };

    const handleTestKey = async () => {
        const provider = selectedProviderId;
        const key = activeKeyInput;
        if (!key.trim()) return;
        
        setTestingStatus(prev => ({ ...prev, [provider]: true }));
        setTestResult(prev => ({ ...prev, [provider]: null }));

        try {
            // @ts-ignore
            const result = await window.electronAPI.testLlmConnection(provider, key);
            setTestResult(prev => ({ ...prev, [provider]: result }));
        } catch (e: any) {
            setTestResult(prev => ({ ...prev, [provider]: { success: false, error: e.message } }));
        } finally {
            setTestingStatus(prev => ({ ...prev, [provider]: false }));
        }
    };


    // --- Custom Provider Handlers ---

    const handleEditProvider = (provider: CustomProvider) => {
        setEditingProvider(provider);
        setCustomName(provider.name);
        setCustomCurl(provider.curlCommand);
        setIsEditingCustom(true);
        setCurlError(null);
    };

    const handleNewProvider = () => {
        setEditingProvider(null);
        setCustomName('');
        setCustomCurl('');
        setIsEditingCustom(true);
        setCurlError(null);
    };

    const handleSaveCustom = async () => {
        setCurlError(null);
        if (!customName.trim()) {
            setCurlError("Provider Name is required.");
            return;
        }

        const validation = validateCurl(customCurl);
        if (!validation.isValid) {
            setCurlError(validation.message || "Invalid cURL command.");
            return;
        }

        const newProvider: CustomProvider = {
            id: editingProvider ? editingProvider.id : crypto.randomUUID(),
            name: customName,
            curlCommand: customCurl
        };

        try {
            // @ts-ignore
            const result = await window.electronAPI.invoke('save-custom-provider', newProvider);
            if (result.success) {
                // Refresh list
                // @ts-ignore
                const updated = await window.electronAPI.invoke('get-custom-providers');
                setCustomProviders(updated);
                setIsEditingCustom(false);
            } else {
                setCurlError(result.error);
            }
        } catch (e: any) {
            setCurlError(e.message);
        }
    };

    const handleDeleteCustom = async (id: string) => {
        if (!confirm("Are you sure you want to delete this provider?")) return;
        try {
            // @ts-ignore
            const result = await window.electronAPI.invoke('delete-custom-provider', id);
            if (result.success) {
                // @ts-ignore
                const updated = await window.electronAPI.invoke('get-custom-providers');
                setCustomProviders(updated);
            }
        } catch (e) {
            console.error("Failed to delete provider:", e);
        }
    };

    return (
        <div className="space-y-5 animated fadeIn pb-10">


            {/* Cloud Providers Management */}
            <div className="space-y-6">
                <div>
                    <h3 className="text-sm font-bold text-text-primary mb-1">Cloud Providers</h3>
                    <p className="text-xs text-text-secondary mb-2">Connect to premium LLM services via API keys.</p>
                </div>

                {/* Main Setup Card */}
                <div className="bg-[var(--bg-card-alpha)] backdrop-blur-3xl rounded-2xl p-6 border border-border-subtle shadow-xl relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-br from-accent-primary/5 via-transparent to-transparent pointer-events-none" />
                    
                    <div className="relative space-y-6">
                        {/* Row 1: Provider Selection */}
                        <div className="space-y-2">
                            <label className="block text-[10px] font-bold text-text-tertiary uppercase tracking-widest pl-1">Target Service</label>
                            <div className="relative group/select">
                                <select
                                    value={selectedProviderId}
                                    onChange={(e) => {
                                        setSelectedProviderId(e.target.value);
                                        setTestResult(prev => ({ ...prev, [e.target.value]: null }));
                                    }}
                                    className="w-full bg-bg-input border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-text-primary transition-all appearance-none cursor-pointer"
                                >
                                    {CLOUD_PROVIDERS.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                                <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none group-hover/select:text-text-primary transition-colors" />
                            </div>
                            <p className="text-[10px] text-text-tertiary pl-1 italic">
                                {CLOUD_PROVIDERS.find(p => p.id === selectedProviderId)?.description}
                            </p>
                        </div>

                        {/* Row 2: API Key Input */}
                        <div className="space-y-2">
                            <label className="block text-[10px] font-bold text-text-tertiary uppercase tracking-widest pl-1">
                                API Key
                                {hasStoredKey[selectedProviderId] && <span className="ml-2 text-green-500 normal-case">✓ Stored</span>}
                            </label>
                            <input
                                type="password"
                                value={activeKeyInput}
                                onChange={(e) => setActiveKeyInput(e.target.value)}
                                placeholder={hasStoredKey[selectedProviderId] ? "••••••••••••" : CLOUD_PROVIDERS.find(p => p.id === selectedProviderId)?.placeholder}
                                className="w-full bg-bg-input border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-text-primary transition-all font-mono"
                            />
                        </div>

                        {/* Test Result Display */}
                        {testResult[selectedProviderId] && (
                            <div className={`animated slideInDown flex items-center gap-2 p-3 rounded-xl border ${testResult[selectedProviderId].success ? 'bg-green-500/5 border-green-500/20 text-green-400' : 'bg-red-500/5 border-red-500/20 text-red-400'}`}>
                                {testResult[selectedProviderId].success ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                                <span className="text-xs">{testResult[selectedProviderId].success ? 'Connection verified!' : `Verification failed: ${testResult[selectedProviderId].error}`}</span>
                            </div>
                        )}

                        {/* Row 3: Actions */}
                        <div className="flex items-center justify-end gap-3 pt-2">
                            <button
                                onClick={handleTestKey}
                                disabled={testingStatus[selectedProviderId] || !activeKeyInput.trim()}
                                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold bg-bg-elevated hover:bg-bg-input border border-border-subtle text-text-primary disabled:opacity-30 transition-all hover:scale-[1.02] active:scale-95"
                            >
                                {testingStatus[selectedProviderId] ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
                                Test Connection
                            </button>
                            <button
                                onClick={handleSaveKey}
                                disabled={savingStatus[selectedProviderId] || !activeKeyInput.trim()}
                                className={`flex items-center gap-2 px-8 py-2.5 rounded-xl text-xs font-black transition-all hover:scale-[1.02] active:scale-95 shadow-lg ${savedStatus[selectedProviderId]
                                    ? 'bg-green-500 text-white'
                                    : 'bg-white text-black disabled:opacity-30'
                                    }`}
                            >
                                <Save size={14} />
                                {savingStatus[selectedProviderId] ? 'Saving...' : savedStatus[selectedProviderId] ? 'Saved Successfully!' : 'Synchronize Provider'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Active Providers Monitor */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                        <h4 className="text-[10px] font-bold text-text-tertiary uppercase tracking-[0.2em]">Verified Connections</h4>
                        <div className="h-[1px] flex-1 mx-4 bg-border-subtle opacity-30" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {CLOUD_PROVIDERS.filter(p => hasStoredKey[p.id]).map(provider => (
                            <div 
                                key={provider.id} 
                                className="bg-[var(--bg-card-alpha)] backdrop-blur-xl rounded-xl p-4 border border-border-subtle flex items-center justify-between group/card hover:border-accent-primary/50 transition-all cursor-default"
                                onClick={() => {
                                    setSelectedProviderId(provider.id);
                                    setActiveKeyInput('');
                                }}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-bg-input flex items-center justify-center text-accent-primary border border-accent-primary/10 group-hover/card:bg-accent-primary/10 transition-colors">
                                        <Check size={16} />
                                    </div>
                                    <div>
                                        <h5 className="text-xs font-bold text-text-primary group-hover/card:text-accent-primary transition-colors">{provider.name}</h5>
                                        <p className="text-[9px] text-text-tertiary uppercase tracking-tighter">Active Connection</p>
                                    </div>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteKey(provider.id);
                                    }}
                                    className="p-2 opacity-0 group-hover/card:opacity-100 text-text-tertiary hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                                    title="Disconnect Provider"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                        {CLOUD_PROVIDERS.filter(p => hasStoredKey[p.id]).length === 0 && (
                            <div className="col-span-full py-8 text-center bg-bg-input/30 rounded-2xl border border-dashed border-border-subtle">
                                <p className="text-xs text-text-tertiary italic">No cloud providers connected. Use the form above to get started.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Local (Ollama) Providers */}
            <div className="space-y-5">
                <div className="flex items-center justify-between mb-2">
                    <div>
                        <h3 className="text-sm font-bold text-text-primary mb-1">Local Models (Ollama)</h3>
                        <p className="text-xs text-text-secondary">Run open-source models locally.</p>
                    </div>
                    <button
                        onClick={async () => {
                            setIsRefreshingOllama(true);
                            await checkOllama(false);
                            // Add a small delay for visual feedback if the check is too fast
                            setTimeout(() => setIsRefreshingOllama(false), 500);
                        }}
                        className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-input transition-colors"
                        title="Refresh Ollama"
                        disabled={isRefreshingOllama}
                    >
                        <RefreshCw size={18} className={isRefreshingOllama ? "animate-spin" : ""} />
                    </button>
                </div>

                <div className="bg-bg-item-surface rounded-xl p-5 border border-border-subtle">
                    {ollamaStatus === 'checking' && (
                        <div className="flex items-center gap-2 text-xs text-text-secondary">
                            <span className="animate-spin">⏳</span> Checking for Ollama...
                        </div>
                    )}

                    {ollamaStatus === 'fixing' && (
                        <div className="flex items-center gap-2 text-xs text-text-secondary">
                            <span className="animate-spin">🔧</span> Attempting to auto-fix connection...
                        </div>
                    )}

                    {ollamaStatus === 'not-found' && (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2 text-xs text-red-400">
                                <AlertCircle size={14} />
                                <span>Ollama not detected</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <p className="text-xs text-text-secondary">
                                    Ensure Ollama is running (`ollama serve`).
                                </p>
                                <button
                                    onClick={handleFixOllama}
                                    className="text-[10px] bg-bg-elevated hover:bg-bg-input px-2 py-1 rounded border border-border-subtle"
                                >
                                    Auto-Fix Connection
                                </button>
                            </div>
                        </div>
                    )}

                    {ollamaStatus === 'detected' && ollamaModels.length > 0 && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-xs text-green-400 mb-3">
                                <CheckCircle size={14} />
                                <span>Ollama connected</span>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                {/* Left Column: Local */}
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                                        <h4 className="text-[10px] uppercase font-bold text-text-tertiary tracking-widest">Native Local</h4>
                                    </div>
                                    <div className="space-y-1.5">
                                        {ollamaModels
                                            .filter(m => !(m.toLowerCase().includes('cloud') || m.toLowerCase().includes('gemini') || m.toLowerCase().includes('gpt')))
                                            .map(model => (
                                                <div key={model} className="flex items-center justify-between p-2 bg-bg-input rounded-lg border border-border-subtle group hover:border-slate-700/50 transition-colors">
                                                    <span className="text-[11px] text-text-primary font-mono truncate mr-2" title={model}>{model}</span>
                                                    <span className="text-[9px] text-bg-elevated bg-text-secondary px-1.5 py-0.5 rounded-full font-bold shrink-0">LOCAL</span>
                                                </div>
                                            ))}
                                        {ollamaModels.filter(m => !(m.toLowerCase().includes('cloud') || m.toLowerCase().includes('gemini') || m.toLowerCase().includes('gpt'))).length === 0 && (
                                            <div className="text-[10px] text-text-tertiary italic p-2 border border-dashed border-border-subtle rounded-lg">None discovered</div>
                                        )}
                                    </div>
                                </div>

                                {/* Right Column: Cloud */}
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-accent-primary" />
                                        <h4 className="text-[10px] uppercase font-bold text-text-tertiary tracking-widest">Cloud Proxies</h4>
                                    </div>
                                    <div className="space-y-1.5">
                                        {ollamaModels
                                            .filter(m => (m.toLowerCase().includes('cloud') || m.toLowerCase().includes('gemini') || m.toLowerCase().includes('gpt')))
                                            .map(model => (
                                                <div key={model} className="flex items-center justify-between p-2 bg-bg-input rounded-lg border border-border-subtle group hover:border-accent-primary/20 transition-colors">
                                                    <span className="text-[11px] text-text-primary font-mono truncate mr-2" title={model}>{model}</span>
                                                    <span className="text-[9px] text-bg-elevated bg-text-secondary px-1.5 py-0.5 rounded-full font-bold shrink-0">CLOUD</span>
                                                </div>
                                            ))}
                                        {ollamaModels.filter(m => (m.toLowerCase().includes('cloud') || m.toLowerCase().includes('gemini') || m.toLowerCase().includes('gpt'))).length === 0 && (
                                            <div className="text-[10px] text-text-tertiary italic p-2 border border-dashed border-border-subtle rounded-lg">None discovered</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    {ollamaStatus === 'detected' && ollamaModels.length === 0 && (
                        <div className="text-xs text-text-secondary">
                            Ollama is running but no models found. Run `ollama pull llama3` to get started.
                        </div>
                    )}
                </div>
            </div>

            {/* Custom Providers */}
            <div className="space-y-5">
                <div className="flex items-center justify-between mb-2">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-sm font-bold text-text-primary">Custom Providers</h3>
                            <span className="px-1.5 py-0 rounded-full text-[7px] font-bold bg-yellow-500/10 text-yellow-500 uppercase tracking-widest border border-yellow-500/20 leading-loose mt-0.5">Experimental</span>
                        </div>
                        <p className="text-xs text-text-secondary">Add your own AI endpoints via cURL.</p>
                    </div>
                    {!isEditingCustom && (
                        <button
                            onClick={handleNewProvider}
                            className="flex items-center gap-2 px-3 py-1.5 bg-bg-input hover:bg-bg-elevated border border-border-subtle rounded-lg text-xs font-medium text-text-primary transition-colors"
                        >
                            <Plus size={14} /> Add Provider
                        </button>
                    )}
                </div>

                {isEditingCustom ? (
                    <div className="bg-[var(--bg-card-alpha)] backdrop-blur-xl rounded-xl p-5 border border-border-subtle animated fadeIn">
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="text-sm font-bold text-text-primary">{editingProvider ? 'Edit Provider' : 'New Provider'}</h4>
                            <button
                                onClick={async () => {
                                    if (!customCurl.trim()) return;
                                    setTestingStatus(prev => ({ ...prev, custom: true }));
                                    setTestResult(prev => ({ ...prev, custom: null }));
                                    try {
                                        // @ts-ignore
                                        const result = await window.electronAPI.testLlmConnection('custom', customCurl);
                                        setTestResult(prev => ({ ...prev, custom: result }));
                                    } catch (e: any) {
                                        setTestResult(prev => ({ ...prev, custom: { success: false, error: e.message } }));
                                    } finally {
                                        setTestingStatus(prev => ({ ...prev, custom: false }));
                                    }
                                }}
                                disabled={testingStatus.custom || !customCurl.trim()}
                                className="flex items-center gap-2 px-3 py-1.5 bg-bg-input hover:bg-bg-elevated border border-border-subtle rounded-lg text-xs font-medium text-text-primary transition-colors disabled:opacity-50"
                            >
                                {testingStatus.custom ? (
                                    <>
                                        <RefreshCw size={14} className="animate-spin" />
                                        Testing...
                                    </>
                                ) : (
                                    <>
                                        <Zap size={14} />
                                        Test Connection
                                    </>
                                )}
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-text-primary uppercase tracking-wide mb-1">Provider Name</label>
                                <input
                                    type="text"
                                    value={customName}
                                    onChange={(e) => setCustomName(e.target.value)}
                                    placeholder="My Custom LLM"
                                    className="w-full bg-bg-input border border-border-subtle rounded-lg px-4 py-2.5 text-xs text-text-primary focus:outline-none focus:border-accent-primary transition-colors"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-text-primary uppercase tracking-wide mb-1">cURL Command</label>
                                <div className="relative">
                                    <textarea
                                        value={customCurl}
                                        onChange={(e) => setCustomCurl(e.target.value)}
                                        placeholder={`curl https://api.openai.com/v1/chat/completions ... "content": "{{TEXT}}"`}
                                        className="w-full h-32 bg-bg-input border border-border-subtle rounded-lg p-4 text-xs font-mono text-text-primary focus:outline-none focus:border-accent-primary transition-colors resize-none leading-relaxed"
                                    />
                                </div>
                            </div>

                            <div className="bg-bg-elevated/30 rounded-lg overflow-hidden border border-border-subtle mt-4">
                                <div className="px-4 py-3 bg-bg-elevated/50 border-b border-border-subtle flex items-center justify-between">
                                    <h5 className="font-bold text-text-primary text-xs flex items-center gap-2">
                                        <span className="text-accent-primary">ℹ️</span> Configuration Guide
                                    </h5>
                                </div>

                                <div className="p-4 space-y-4">
                                    <div>
                                        <p className="text-xs text-text-secondary mb-2 font-medium">Available Variables</p>
                                        <div className="grid grid-cols-1 gap-2">
                                            <div className="flex items-center gap-2 text-xs">
                                                <code className="bg-bg-input px-1.5 py-0.5 rounded text-text-primary font-mono border border-border-subtle">{"{{TEXT}}"}</code>
                                                <span className="text-text-tertiary">Combined System + Context + Message (Recommended)</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs">
                                                <code className="bg-bg-input px-1.5 py-0.5 rounded text-text-primary font-mono border border-border-subtle">{"{{IMAGE_BASE64}}"}</code>
                                                <span className="text-text-tertiary">Screenshot data (if available)</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <p className="text-xs text-text-secondary mb-2 font-medium">Examples</p>
                                        <div className="space-y-3">
                                            {/* Ollama Example */}
                                            <div>
                                                <div className="text-[10px] uppercase tracking-wider text-text-tertiary mb-1.5">Local (Ollama)</div>
                                                <div className="bg-bg-input p-2.5 rounded-lg border border-border-subtle overflow-x-auto group relative">
                                                    <code className="font-mono text-[10px] text-text-primary whitespace-pre block">
                                                        curl http://localhost:11434/api/generate -d '{"{"}"model": "llama3", "prompt": "{`{{TEXT}}`}"{"}"}'
                                                    </code>
                                                </div>
                                            </div>

                                            {/* OpenAI Example */}
                                            <div>
                                                <div className="text-[10px] uppercase tracking-wider text-text-tertiary mb-1.5">OpenAI Compatible</div>
                                                <div className="bg-bg-input p-2.5 rounded-lg border border-border-subtle overflow-x-auto">
                                                    <code className="font-mono text-[10px] text-text-primary whitespace-pre block">
                                                        {`curl https://api.openai.com/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "{{TEXT}}"}
    ],
    "temperature": 0.7
  }'`}
                                                    </code>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {testResult.custom && (
                                <div className={`flex items-start gap-2 p-3 ${testResult.custom.success ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'} border rounded-lg text-xs`}>
                                    {testResult.custom.success ? <CheckCircle size={14} className="shrink-0 mt-0.5" /> : <AlertCircle size={14} className="shrink-0 mt-0.5" />}
                                    <span>{testResult.custom.success ? 'Connection successful! The provider is responding correctly.' : `Connection failed: ${testResult.custom.error}`}</span>
                                </div>
                            )}

                            {curlError && (
                                <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs text-left">
                                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                                    <span>{curlError}</span>
                                </div>
                            )}

                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    onClick={() => setIsEditingCustom(false)}
                                    className="px-4 py-2 rounded-lg text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg-input transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveCustom}
                                    className="px-4 py-2 rounded-lg text-xs font-bold bg-accent-primary text-bg-primary hover:bg-accent-secondary transition-colors flex items-center gap-2"
                                >
                                    <Save size={14} /> Save Provider
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {customProviders.length === 0 ? (
                            <div className="text-center py-8 bg-bg-item-surface rounded-xl border border-border-subtle border-dashed">
                                <p className="text-xs text-text-tertiary">No custom providers added yet.</p>
                            </div>
                        ) : (
                            customProviders.map((provider) => (
                                <div key={provider.id} className="bg-[var(--bg-card-alpha)] backdrop-blur-xl rounded-xl p-4 border border-border-subtle flex items-center justify-between group">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-bg-input flex items-center justify-center text-text-secondary font-mono text-xs font-bold">
                                            {provider.name.substring(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-medium text-text-primary">{provider.name}</h4>
                                            <p className="text-[10px] text-text-tertiary font-mono truncate max-w-[200px] opacity-60">
                                                {provider.curlCommand.substring(0, 30)}...
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => handleEditProvider(provider)}
                                            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
                                            title="Edit"
                                        >
                                            <Edit2 size={14} />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteCustom(provider.id)}
                                            className="p-1.5 rounded-lg text-text-secondary hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                            title="Delete"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
