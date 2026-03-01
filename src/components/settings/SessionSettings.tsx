import React, { useState, useEffect, useRef } from 'react';
import {
    Upload, FileText, Trash2, Check, AlertCircle, Save,
    RotateCcw, Info, Terminal, Briefcase, FileJson,
    MessageSquare, ClipboardList, Target
} from 'lucide-react';

interface SessionSettingsProps {
    mode: 'interview' | 'meeting';
}

export const SessionSettings: React.FC<SessionSettingsProps> = ({ mode }) => {
    // Prompt state
    const [prompt, setPrompt] = useState('');
    const [defaultPrompt, setDefaultPrompt] = useState('');

    // Context state
    const [contextFile1, setContextFile1] = useState(''); // Resume or Project Docs
    const [contextFile2, setContextFile2] = useState(''); // JD or Agenda

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error' | null, message: string }>({ type: null, message: '' });

    const file1InputRef = useRef<HTMLInputElement>(null);
    const file2InputRef = useRef<HTMLInputElement>(null);

    const isInterview = mode === 'interview';

    useEffect(() => {
        loadData();
    }, [mode]);

    const loadData = async () => {
        try {
            setLoading(true);

            // Load prompts
            const customPrompts = await window.electronAPI.getCustomPrompts();
            const defaultPrompts = await window.electronAPI.getDefaultPrompts();

            if (isInterview) {
                setPrompt(customPrompts.interviewPrompt || defaultPrompts.interviewPrompt);
                setDefaultPrompt(defaultPrompts.interviewPrompt);
            } else {
                setPrompt(customPrompts.meetingPrompt || defaultPrompts.meetingPrompt);
                setDefaultPrompt(defaultPrompts.meetingPrompt);
            }

            // Load context documents
            const docs = await window.electronAPI.getContextDocuments();
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

    const handleSavePrompt = async () => {
        try {
            setSaving(true);
            const result = await window.electronAPI.setCustomPrompt(mode, prompt);

            if (result.success) {
                showStatus('success', `${isInterview ? 'Interview' : 'Meeting'} prompt saved!`);
            } else {
                showStatus('error', `Failed to save prompt: ${result.error}`);
            }
        } catch (error) {
            showStatus('error', `Error saving prompt: ${error}`);
        } finally {
            setSaving(false);
        }
    };

    const handleResetPrompt = () => {
        if (confirm(`Reset ${mode} prompt to default? This will overwrite your current text.`)) {
            setPrompt(defaultPrompt);
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

    if (loading && !prompt) {
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
            {/* Header */}
            <div className="relative">
                <div className="absolute -left-4 top-0 w-1 h-12 bg-accent-primary rounded-full blur-sm opacity-50" />
                <h2 className="text-3xl font-black text-text-primary mb-2 flex items-center gap-4 tracking-tight">
                    {isInterview ? <Briefcase className="text-accent-primary" size={32} /> : <ClipboardList className="text-accent-primary" size={32} />}
                    {isInterview ? 'Interview Intelligence' : 'Meeting Intelligence'}
                </h2>
                <p className="text-sm text-text-secondary max-w-2xl leading-relaxed">
                    {isInterview
                        ? 'Master your interviews with AI-powered grounding and real-time guidance.'
                        : 'Optimize your meeting productivity with session-specific context and behavior.'}
                </p>
            </div>

            {status.message && (
                <div className={`p-4 rounded-2xl flex items-center gap-3 border ${status.type === 'success' ? 'bg-accent-primary/5 border-accent-primary/20 text-accent-primary' : 'bg-red-500/10 border-red-500/30 text-red-300'} animated slideInDown shadow-lg shadow-black/20`}>
                    {status.type === 'success' ? <Check size={20} /> : <AlertCircle size={20} />}
                    <span className="text-sm font-bold tracking-tight">{status.message}</span>
                </div>
            )}

            {/* System Prompt Section */}
            <section className="bg-[var(--bg-card-alpha)] backdrop-blur-xl rounded-3xl p-8 border border-white/5 shadow-2xl group hover:border-accent-primary/20 transition-all duration-500">
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl bg-accent-primary/10 text-accent-primary flex items-center justify-center shadow-[0_0_20px_rgba(0,242,255,0.1)]`}>
                            <Terminal size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-text-primary tracking-tight">System Prompt</h3>
                            <p className="text-xs text-text-tertiary mt-0.5">Define core AI behaviors and constraints</p>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={handleResetPrompt}
                            className="px-4 py-2 bg-bg-item-surface hover:bg-bg-item-active text-text-secondary hover:text-text-primary rounded-xl text-xs font-bold transition-all border border-border-subtle flex items-center gap-2"
                        >
                            <RotateCcw size={14} /> Reset
                        </button>
                        <button
                            onClick={handleSavePrompt}
                            disabled={saving}
                            className="px-6 py-2 bg-accent-primary hover:bg-accent-secondary text-bg-primary rounded-xl text-xs font-black transition-all shadow-[0_4px_20px_rgba(0,242,255,0.3)] flex items-center gap-2 disabled:opacity-50"
                        >
                            {saving ? <RotateCcw size={14} className="animate-spin" /> : <Save size={14} />}
                            SAVE CHANGES
                        </button>
                    </div>
                </div>

                <div className="relative group">
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder={`Enter custom ${mode} system prompt...`}
                        className="w-full h-64 bg-bg-input border border-border-subtle rounded-2xl p-6 text-xs font-mono text-text-primary focus:ring-2 focus:ring-accent-primary/20 focus:border-accent-primary/50 outline-none resize-none transition-all scrollbar-thin placeholder:opacity-30"
                    />
                </div>

                <div className={`mt-6 p-4 rounded-2xl border bg-accent-primary/5 border-accent-primary/10 text-accent-primary/80 flex items-start gap-4`}>
                    <Info size={18} className="shrink-0 mt-0.5 opacity-70" />
                    <p className="text-[11px] leading-relaxed font-medium">
                        <strong className="text-text-primary">Injection points:</strong> Embed {isInterview ? (
                            <><code>{"{RESUME_CONTEXT}"}</code> and <code>{"{JD_CONTEXT}"}</code></>
                        ) : (
                            <><code>{"{PROJECT_KNOWLEDGE}"}</code> and <code>{"{AGENDA_CONTEXT}"}</code></>
                        )} to dynamically populate your session data during reference.
                    </p>
                </div>
            </section>

            {/* Context Documents Section */}
            <div className="flex flex-col gap-10">
                {/* File 1: Resume or Project Docs */}
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
                            placeholder={isInterview ? "Paste resume text here..." : "Paste project documentation here..."}
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

                {/* File 2: JD or Agenda */}
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
                            placeholder={isInterview ? "Paste job description here..." : "Paste agenda here..."}
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
