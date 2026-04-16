import React, { useEffect, useRef, useState } from 'react';
import {
    Upload, FileText, Trash2, Check, AlertCircle, Save,
    RotateCcw, Terminal, Briefcase, FileJson,
    ClipboardList, Target
} from 'lucide-react';

interface SessionSettingsProps {
    mode: 'interview' | 'meeting';
}

type PromptMode =
    | 'assist'
    | 'answer'
    | 'whatToAnswer'
    | 'followUpRefinement'
    | 'followUpQuestions'
    | 'recap'
    | 'ragMeeting'
    | 'ragGlobal'
    | 'imageAnalysis';

interface PromptSettings {
    defaultPromptId: string;
    extraInstructions?: string;
    fullOverride?: string;
    enabled: boolean;
    validation?: {
        isValid: boolean;
        error?: string;
    };
}

interface PromptTemplateDefinition {
    id: string;
    title: string;
    description: string;
    sessionMode: 'interview' | 'meeting' | 'global';
    prompt: string;
}

function getPromptDisplayMeta(
    sessionMode: 'interview' | 'meeting',
    promptMode: PromptMode,
    template?: PromptTemplateDefinition
): { title: string; description: string } {
    if (promptMode === 'recap') {
        return sessionMode === 'meeting'
            ? {
                title: 'Meeting Summary',
                description: 'Post-meeting summary, decisions, blockers, and action-item extraction.'
            }
            : {
                title: 'Interview Debrief',
                description: 'Post-interview summary, takeaways, and follow-up capture.'
            };
    }

    return {
        title: template?.title || promptMode,
        description: template?.description || 'Customize the runtime prompt.'
    };
}

const EDITABLE_SESSION_PROMPT_MODES: Record<'interview' | 'meeting', PromptMode[]> = {
    interview: ['whatToAnswer', 'answer', 'recap'],
    meeting: ['answer', 'assist', 'recap']
};

function getEditorValueForMode(
    promptMode: PromptMode,
    settings: Record<string, PromptSettings>,
    templates: Record<string, PromptTemplateDefinition>
): string {
    const selectedSettings = settings[promptMode];
    const bundledPrompt = templates[promptMode]?.prompt || '';

    if (selectedSettings?.fullOverride?.trim()) {
        return selectedSettings.fullOverride;
    }

    if (selectedSettings?.extraInstructions?.trim()) {
        return `${bundledPrompt}\n\n<user_extra_instructions>\n${selectedSettings.extraInstructions.trim()}\n</user_extra_instructions>`;
    }

    return bundledPrompt;
}

export const SessionSettings: React.FC<SessionSettingsProps> = ({ mode }) => {
    const editablePromptModes = EDITABLE_SESSION_PROMPT_MODES[mode];

    const [promptSettings, setPromptSettings] = useState<Record<string, PromptSettings>>({});
    const [promptTemplates, setPromptTemplates] = useState<Record<string, PromptTemplateDefinition>>({});
    const [promptDrafts, setPromptDrafts] = useState<Record<string, string>>({});
    const [selectedPromptMode, setSelectedPromptMode] = useState<PromptMode>(editablePromptModes[0]);

    const [contextFile1, setContextFile1] = useState('');
    const [contextFile2, setContextFile2] = useState('');

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error' | null, message: string }>({ type: null, message: '' });

    const file1InputRef = useRef<HTMLInputElement>(null);
    const file2InputRef = useRef<HTMLInputElement>(null);

    const isInterview = mode === 'interview';

    useEffect(() => {
        loadData();
    }, [mode]);

    useEffect(() => {
        setSelectedPromptMode(editablePromptModes[0]);
    }, [mode]);

    useEffect(() => {
        if (!editablePromptModes.every((promptMode) => !!promptTemplates[promptMode])) {
            return;
        }

        const nextDrafts: Record<string, string> = {};
        for (const promptMode of editablePromptModes) {
            nextDrafts[promptMode] = getEditorValueForMode(promptMode, promptSettings, promptTemplates);
        }
        setPromptDrafts(nextDrafts);
    }, [mode, promptSettings, promptTemplates]);

    const loadData = async () => {
        try {
            setLoading(true);

            const [storedPromptSettings, templates, docs] = await Promise.all([
                window.electronAPI.getPromptSettings(),
                window.electronAPI.getDefaultPromptTemplates(),
                window.electronAPI.getContextDocuments()
            ]);

            setPromptSettings(storedPromptSettings);
            setPromptTemplates(templates);

            if (isInterview) {
                setContextFile1(docs.resumeText || '');
                setContextFile2(docs.jdText || '');
            } else {
                setContextFile1(docs.projectText || '');
                setContextFile2(docs.agendaText || '');
            }
        } catch (error) {
            console.error('Failed to load session data:', error);
            showStatus('error', 'Failed to load settings.');
        } finally {
            setLoading(false);
        }
    };

    const handlePromptDraftChange = (promptMode: PromptMode, value: string) => {
        setPromptDrafts((prev) => ({
            ...prev,
            [promptMode]: value
        }));
    };

    const handleSavePrompts = async () => {
        try {
            setSaving(true);

            const results = await Promise.all(
                editablePromptModes.map(async (promptMode) => {
                    const bundledPrompt = promptTemplates[promptMode]?.prompt || '';
                    const draft = promptDrafts[promptMode] ?? bundledPrompt;
                    const normalizedDraft = draft.trim();
                    const normalizedBundledPrompt = bundledPrompt.trim();

                    const result = await window.electronAPI.updatePromptSettings(promptMode, {
                        extraInstructions: '',
                        fullOverride: normalizedDraft === normalizedBundledPrompt ? '' : draft
                    });

                    return {
                        promptMode,
                        result,
                        nextSettings: {
                            ...(promptSettings[promptMode] || { enabled: true, defaultPromptId: promptTemplates[promptMode]?.id || '' }),
                            defaultPromptId: promptTemplates[promptMode]?.id || '',
                            extraInstructions: '',
                            fullOverride: normalizedDraft === normalizedBundledPrompt ? '' : draft,
                            enabled: true
                        }
                    };
                })
            );

            const failed = results.find(({ result }) => !result.success);
            if (failed) {
                showStatus('error', `Failed to save ${promptTemplates[failed.promptMode]?.title || failed.promptMode}: ${failed.result.error}`);
                return;
            }

            setPromptSettings((prev) => {
                const next = { ...prev };
                for (const { promptMode, nextSettings } of results) {
                    next[promptMode] = nextSettings;
                }
                return next;
            });

            showStatus('success', `${isInterview ? 'Interview' : 'Meeting'} prompts saved.`);
        } catch (error) {
            showStatus('error', `Error saving prompts: ${error}`);
        } finally {
            setSaving(false);
        }
    };

    const handleResetPrompts = () => {
        const nextDrafts: Record<string, string> = {};
        for (const promptMode of editablePromptModes) {
            nextDrafts[promptMode] = getEditorValueForMode(promptMode, promptSettings, promptTemplates);
        }
        setPromptDrafts(nextDrafts);
    };

    const handleUseBundledPrompts = async () => {
        try {
            setSaving(true);

            const results = await Promise.all(
                editablePromptModes.map((promptMode) =>
                    window.electronAPI.updatePromptSettings(promptMode, {
                        extraInstructions: '',
                        fullOverride: ''
                    })
                )
            );

            const failedIndex = results.findIndex((result) => !result.success);
            if (failedIndex !== -1) {
                const failedMode = editablePromptModes[failedIndex];
                showStatus('error', `Failed to restore default prompt: ${results[failedIndex].error || failedMode}`);
                return;
            }

            const nextPromptSettings = { ...promptSettings };
            const nextDrafts: Record<string, string> = { ...promptDrafts };

            for (const promptMode of editablePromptModes) {
                nextPromptSettings[promptMode] = {
                    ...(promptSettings[promptMode] || { enabled: true, defaultPromptId: promptTemplates[promptMode]?.id || '' }),
                    defaultPromptId: promptTemplates[promptMode]?.id || '',
                    extraInstructions: '',
                    fullOverride: '',
                    enabled: true
                };
                nextDrafts[promptMode] = promptTemplates[promptMode]?.prompt || '';
            }

            setPromptSettings(nextPromptSettings);
            setPromptDrafts(nextDrafts);
            showStatus('success', `${isInterview ? 'Interview' : 'Meeting'} prompts restored to defaults.`);
        } catch (error) {
            showStatus('error', `Error restoring default prompts: ${error}`);
        } finally {
            setSaving(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'file1' | 'file2') => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setLoading(true);
            const filePath = (file as any).path;

            let result;
            if (type === 'file1') {
                result = isInterview
                    ? await window.electronAPI.uploadResume(filePath)
                    : await window.electronAPI.uploadProject(filePath);
                if (result.success && result.text) setContextFile1(result.text);
            } else {
                result = isInterview
                    ? await window.electronAPI.uploadJD(filePath)
                    : await window.electronAPI.uploadAgenda(filePath);
                if (result.success && result.text) setContextFile2(result.text);
            }

            if (result.success) {
                const label = type === 'file1'
                    ? (isInterview ? 'Resume' : 'Project Documentation')
                    : (isInterview ? 'Job Description' : 'Agenda');
                showStatus('success', `${label} uploaded successfully!`);
            } else {
                showStatus('error', `Failed to upload: ${result.error}`);
            }
        } catch (error) {
            showStatus('error', `Error uploading file: ${error}`);
        } finally {
            setLoading(false);
            if (e.target) e.target.value = '';
        }
    };

    const handleSaveContextText = async (type: 'file1' | 'file2') => {
        try {
            setLoading(true);
            let result;
            if (type === 'file1') {
                result = isInterview
                    ? await window.electronAPI.saveResumeText(contextFile1)
                    : await window.electronAPI.saveProjectText(contextFile1);
            } else {
                result = isInterview
                    ? await window.electronAPI.saveJDText(contextFile2)
                    : await window.electronAPI.saveAgendaText(contextFile2);
            }

            if (result.success) {
                const label = type === 'file1'
                    ? (isInterview ? 'Resume' : 'Project Documentation')
                    : (isInterview ? 'Job Description' : 'Agenda');
                showStatus('success', `${label} text saved!`);
            } else {
                showStatus('error', `Failed to save: ${result.error}`);
            }
        } catch (error) {
            showStatus('error', `Error saving text: ${error}`);
        } finally {
            setLoading(false);
        }
    };

    const handleClearContext = async (type: 'file1' | 'file2') => {
        const label = type === 'file1'
            ? (isInterview ? 'Resume' : 'Project Documentation')
            : (isInterview ? 'Job Description' : 'Agenda');

        if (!confirm(`Are you sure you want to clear the ${label} context?`)) return;

        try {
            setLoading(true);
            if (type === 'file1') {
                isInterview
                    ? await window.electronAPI.clearResume()
                    : await window.electronAPI.clearProject();
                setContextFile1('');
            } else {
                isInterview
                    ? await window.electronAPI.clearJD()
                    : await window.electronAPI.clearAgenda();
                setContextFile2('');
            }
            showStatus('success', `${label} cleared.`);
        } catch (error) {
            showStatus('error', `Error clearing context: ${error}`);
        } finally {
            setLoading(false);
        }
    };

    const showStatus = (type: 'success' | 'error', message: string) => {
        setStatus({ type, message });
        setTimeout(() => setStatus({ type: null, message: '' }), 3000);
    };

    const hasLoadedPromptTemplates = editablePromptModes.every((promptMode) => !!promptTemplates[promptMode]);
    const hasUnsavedPromptChanges = editablePromptModes.some(
        (promptMode) => (promptDrafts[promptMode] ?? '') !== getEditorValueForMode(promptMode, promptSettings, promptTemplates)
    );
    const selectedPromptTemplate = promptTemplates[selectedPromptMode];
    const selectedPromptMeta = getPromptDisplayMeta(mode, selectedPromptMode, selectedPromptTemplate);

    if (loading && !hasLoadedPromptTemplates) {
        return (
            <div className="flex items-center justify-center h-64 text-text-tertiary">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
                    <div className="text-sm font-medium animate-pulse">Loading {isInterview ? 'Interview' : 'Meeting'} settings...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-10 text-text-primary animated fadeIn scrollbar-hide">
            <div className="relative">
                <div className="absolute -left-4 top-0 w-1 h-12 bg-accent-primary rounded-full blur-sm opacity-50" />
                <h2 className="text-3xl font-black text-text-primary mb-2 flex items-center gap-4 tracking-tight">
                    {isInterview ? <Briefcase className="text-accent-primary" size={32} /> : <ClipboardList className="text-accent-primary" size={32} />}
                    {isInterview ? 'Interview Intelligence' : 'Meeting Intelligence'}
                </h2>
                <p className="text-sm text-text-secondary max-w-2xl leading-relaxed">
                    {isInterview
                        ? 'Edit the three core interview prompts together and save them in one pass.'
                        : 'Edit the three core meeting prompts together and save them in one pass.'}
                </p>
            </div>

            {status.message && (
                <div className={`p-4 rounded-2xl flex items-center gap-3 border ${status.type === 'success' ? 'bg-accent-primary/5 border-accent-primary/20 text-accent-primary' : 'bg-red-500/10 border-red-500/30 text-red-300'} animated slideInDown shadow-lg shadow-black/20`}>
                    {status.type === 'success' ? <Check size={20} /> : <AlertCircle size={20} />}
                    <span className="text-sm font-bold tracking-tight">{status.message}</span>
                </div>
            )}

            <section className="bg-[var(--bg-card-alpha)] backdrop-blur-xl rounded-3xl p-6 border border-white/5 shadow-2xl group hover:border-accent-primary/20 transition-all duration-500">
                <div className="flex items-start justify-between gap-4 mb-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-accent-primary/10 text-accent-primary flex items-center justify-center shadow-[0_0_20px_rgba(0,242,255,0.1)]">
                            <Terminal size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-text-primary tracking-tight">System Prompts</h3>
                            <p className="text-xs text-text-tertiary mt-0.5">Choose a runtime mode, edit its prompt, then save the full page.</p>
                        </div>
                    </div>
                    <div className="flex gap-3 shrink-0">
                        <button
                            onClick={handleResetPrompts}
                            className="px-4 py-2 bg-bg-item-surface hover:bg-bg-item-active text-text-secondary hover:text-text-primary rounded-xl text-xs font-bold transition-all border border-border-subtle flex items-center gap-2"
                        >
                            <RotateCcw size={14} /> Reset
                        </button>
                        <button
                            onClick={handleUseBundledPrompts}
                            disabled={saving}
                            className="px-4 py-2 bg-accent-primary/10 hover:bg-accent-primary/15 text-accent-primary rounded-xl text-xs font-bold transition-all border border-accent-primary/20 flex items-center gap-2 disabled:opacity-50"
                            title={`Restore the bundled ${mode} prompts`}
                        >
                            Use Default
                        </button>
                        <button
                            onClick={handleSavePrompts}
                            disabled={saving || !hasUnsavedPromptChanges}
                            className="px-6 py-2 bg-accent-primary hover:bg-accent-secondary text-bg-primary rounded-xl text-xs font-black transition-all shadow-[0_4px_20px_rgba(0,242,255,0.3)] flex items-center gap-2 disabled:opacity-50"
                        >
                            {saving ? <RotateCcw size={14} className="animate-spin" /> : <Save size={14} />}
                            SAVE CHANGES
                        </button>
                    </div>
                </div>

                <div className="mb-4 flex items-center justify-between gap-4 rounded-2xl border border-border-subtle bg-bg-input/40 px-4 py-4">
                    <div className="min-w-0 flex-1">
                        <label className="block text-[11px] font-bold uppercase tracking-[0.24em] text-text-tertiary mb-2">
                            Runtime Mode
                        </label>
                        <select
                            value={selectedPromptMode}
                            onChange={(e) => setSelectedPromptMode(e.target.value as PromptMode)}
                            className="w-full rounded-2xl border border-border-subtle bg-bg-input px-4 py-3 text-sm font-semibold text-text-primary outline-none transition-all focus:border-accent-primary/40 focus:ring-2 focus:ring-accent-primary/20"
                        >
                            {editablePromptModes.map((promptMode) => (
                                <option key={promptMode} value={promptMode}>
                                    {getPromptDisplayMeta(mode, promptMode, promptTemplates[promptMode]).title}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="hidden min-w-0 max-w-sm lg:block">
                        <div className="text-sm font-semibold text-text-primary">
                            {selectedPromptMeta.title}
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                            {selectedPromptMeta.description}
                        </p>
                    </div>
                </div>

                <div className="rounded-3xl border border-border-subtle bg-bg-input/40 p-5">
                    <div className="mb-3 lg:hidden">
                        <div className="text-sm font-semibold text-text-primary">
                            {selectedPromptMeta.title}
                        </div>
                        <p className="mt-1 text-xs text-text-secondary">
                            {selectedPromptMeta.description}
                        </p>
                    </div>
                    <textarea
                        value={promptDrafts[selectedPromptMode] ?? ''}
                        onChange={(e) => handlePromptDraftChange(selectedPromptMode, e.target.value)}
                        placeholder={`Edit the ${selectedPromptMeta.title.toLowerCase()} prompt...`}
                        className="w-full h-[30rem] bg-bg-input border border-border-subtle rounded-2xl p-6 text-xs font-mono text-text-primary focus:ring-2 focus:ring-accent-primary/20 focus:border-accent-primary/50 outline-none resize-none transition-all scrollbar-thin placeholder:opacity-30"
                    />
                    <p className="mt-3 text-[11px] leading-relaxed text-text-tertiary">
                        Reset restores the last saved page state. Use Default restores the bundled prompts for all three modes on this page. Save Changes writes all three prompts together.
                    </p>
                </div>
            </section>

            <div className="flex flex-col gap-10">
                <section className="bg-[var(--bg-card-alpha)] backdrop-blur-xl rounded-3xl p-8 border border-white/5 shadow-2xl group hover:border-accent-primary/20 transition-all duration-500">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-2xl ${isInterview ? 'bg-blue-500/10 text-blue-400' : 'bg-cyan-500/10 text-cyan-400'} flex items-center justify-center shadow-lg shadow-black/20`}>
                                {isInterview ? <FileText size={24} /> : <FileJson size={24} />}
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-text-primary tracking-tight">{isInterview ? 'Candidate Profile' : 'Project Knowledge'}</h3>
                                <p className="text-xs text-text-tertiary mt-0.5">{isInterview ? 'Upload resume for experience grounding' : 'Technical docs or project specifications'}</p>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <input
                                type="file"
                                ref={file1InputRef}
                                className="hidden"
                                accept=".pdf,.docx,.txt,.md"
                                onChange={(e) => handleFileUpload(e, 'file1')}
                            />
                            <button
                                onClick={() => file1InputRef.current?.click()}
                                className="px-5 py-2 bg-bg-item-surface hover:bg-bg-item-active text-text-primary rounded-xl text-xs font-bold border border-border-subtle transition-all shadow-lg flex items-center justify-center gap-2"
                            >
                                <Upload size={14} className="text-accent-primary" /> UPLOAD FILE
                            </button>
                            <button
                                onClick={() => handleClearContext('file1')}
                                disabled={!contextFile1}
                                className="px-4 py-2 bg-red-500/5 hover:bg-red-500/10 text-red-400 rounded-xl text-xs font-bold border border-red-500/10 transition-all disabled:opacity-20 flex items-center justify-center"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </div>

                    <div className="relative flex-1">
                        <textarea
                            value={contextFile1}
                            onChange={(e) => setContextFile1(e.target.value)}
                            placeholder={isInterview ? 'Paste resume text here...' : 'Paste project documentation here...'}
                            className="w-full h-56 bg-bg-input border border-border-subtle rounded-2xl p-6 text-xs font-mono text-text-primary focus:ring-2 focus:ring-accent-primary/20 focus:border-accent-primary/50 outline-none resize-none transition-all scrollbar-thin"
                        />
                        <button
                            onClick={() => handleSaveContextText('file1')}
                            className="absolute bottom-4 right-4 p-2.5 bg-accent-primary hover:bg-accent-secondary text-bg-primary rounded-xl shadow-[0_4px_15px_rgba(0,242,255,0.3)] transition-all"
                            title="Save Content"
                        >
                            <Save size={16} />
                        </button>
                    </div>
                </section>

                <section className="bg-[var(--bg-card-alpha)] backdrop-blur-xl rounded-3xl p-8 border border-white/5 shadow-2xl group hover:border-accent-primary/20 transition-all duration-500">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-2xl ${isInterview ? 'bg-orange-500/10 text-orange-400' : 'bg-emerald-500/10 text-emerald-400'} flex items-center justify-center shadow-lg shadow-black/20`}>
                                {isInterview ? <Target size={24} /> : <ClipboardList size={24} />}
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-text-primary tracking-tight">{isInterview ? 'Position Context' : 'Session Agenda'}</h3>
                                <p className="text-xs text-text-tertiary mt-0.5">{isInterview ? 'Job description and requirements' : 'Meeting goals and discussion points'}</p>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <input
                                type="file"
                                ref={file2InputRef}
                                className="hidden"
                                accept=".pdf,.docx,.txt,.md"
                                onChange={(e) => handleFileUpload(e, 'file2')}
                            />
                            <button
                                onClick={() => file2InputRef.current?.click()}
                                className="px-5 py-2 bg-bg-item-surface hover:bg-bg-item-active text-text-primary rounded-xl text-xs font-bold border border-border-subtle transition-all shadow-lg flex items-center justify-center gap-2"
                            >
                                <Upload size={14} className="text-accent-primary" /> UPLOAD FILE
                            </button>
                            <button
                                onClick={() => handleClearContext('file2')}
                                disabled={!contextFile2}
                                className="px-4 py-2 bg-red-500/5 hover:bg-red-500/10 text-red-400 rounded-xl text-xs font-bold border border-red-500/10 transition-all disabled:opacity-20 flex items-center justify-center"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </div>

                    <div className="relative flex-1">
                        <textarea
                            value={contextFile2}
                            onChange={(e) => setContextFile2(e.target.value)}
                            placeholder={isInterview ? 'Paste job description here...' : 'Paste agenda here...'}
                            className="w-full h-56 bg-bg-input border border-border-subtle rounded-2xl p-6 text-xs font-mono text-text-primary focus:ring-2 focus:ring-accent-primary/20 focus:border-accent-primary/50 outline-none resize-none transition-all scrollbar-thin"
                        />
                        <button
                            onClick={() => handleSaveContextText('file2')}
                            className="absolute bottom-4 right-4 p-2.5 bg-accent-primary hover:bg-accent-secondary text-bg-primary rounded-xl shadow-[0_4px_15px_rgba(0,242,255,0.3)] transition-all"
                            title="Save Content"
                        >
                            <Save size={16} />
                        </button>
                    </div>
                </section>
            </div>
        </div>
    );
};
