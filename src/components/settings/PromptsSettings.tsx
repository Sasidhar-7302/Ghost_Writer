import React, { useState, useEffect } from 'react';
import { Save, RotateCcw, Check, AlertCircle, Info } from 'lucide-react';

export const PromptsSettings: React.FC = () => {
    const [interviewPrompt, setInterviewPrompt] = useState('');
    const [meetingPrompt, setMeetingPrompt] = useState('');
    const [defaultInterview, setDefaultInterview] = useState('');
    const [defaultMeeting, setDefaultMeeting] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<'interview' | 'meeting' | null>(null);
    const [status, setStatus] = useState<{ type: 'success' | 'error' | null, message: string }>({ type: null, message: '' });

    useEffect(() => {
        loadPrompts();
    }, []);

    const loadPrompts = async () => {
        try {
            setLoading(true);
            const custom = await window.electronAPI.getCustomPrompts();
            const defaults = await window.electronAPI.getDefaultPrompts();

            setInterviewPrompt(custom.interviewPrompt || defaults.interviewPrompt);
            setMeetingPrompt(custom.meetingPrompt || defaults.meetingPrompt);
            setDefaultInterview(defaults.interviewPrompt);
            setDefaultMeeting(defaults.meetingPrompt);
        } catch (error) {
            console.error('Failed to load prompts:', error);
            showStatus('error', 'Failed to load prompts.');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (type: 'interview' | 'meeting') => {
        try {
            setSaving(type);
            const prompt = type === 'interview' ? interviewPrompt : meetingPrompt;
            const result = await window.electronAPI.setCustomPrompt(type, prompt);

            if (result.success) {
                showStatus('success', `${type === 'interview' ? 'Interview' : 'Meeting'} prompt saved!`);
            } else {
                showStatus('error', `Failed to save: ${result.error}`);
            }
        } catch (error) {
            showStatus('error', `Error saving: ${error}`);
        } finally {
            setSaving(null);
        }
    };

    const handleReset = (type: 'interview' | 'meeting') => {
        if (confirm(`Reset ${type} prompt to default? This will overwrite your changes.`)) {
            if (type === 'interview') setInterviewPrompt(defaultInterview);
            else setMeetingPrompt(defaultMeeting);
        }
    };

    const showStatus = (type: 'success' | 'error', message: string) => {
        setStatus({ type, message });
        setTimeout(() => setStatus({ type: null, message: '' }), 3000);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64 text-text-tertiary">
                <div className="animate-pulse">Loading prompt settings...</div>
            </div>
        );
    }

    return (
        <div className="space-y-6 text-text-primary animated fadeIn">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-text-primary mb-1">Customizable Prompts</h2>
                    <p className="text-sm text-text-secondary">
                        Customize the system instructions for different AI modes.
                    </p>
                </div>
            </div>

            {status.message && (
                <div className={`p-3 rounded-lg flex items-center gap-2 ${status.type === 'success' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                    {status.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
                    {status.message}
                </div>
            )}

            {/* Interview Prompt Section */}
            <div className="bg-[var(--bg-card-alpha)] backdrop-blur-xl rounded-xl p-5 border border-border-subtle">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400">
                            <Info size={18} />
                        </div>
                        <div>
                            <h3 className="font-semibold text-text-primary">Interview Prompt</h3>
                            <p className="text-[10px] text-text-secondary">Used for "What Should I Say?" (Strategic Advisor mode)</p>
                        </div>
                    </div>
                </div>

                <div className="relative group">
                    <textarea
                        value={interviewPrompt}
                        onChange={(e) => setInterviewPrompt(e.target.value)}
                        placeholder="Enter custom interview system prompt..."
                        className="w-full h-48 bg-bg-input border border-border-subtle rounded-xl p-3 text-xs focus:border-accent-primary focus:ring-1 focus:ring-accent-primary outline-none resize-none font-mono text-text-primary transition-all scrollbar-thin scrollbar-thumb-gray-700"
                    />
                    <div className="absolute bottom-3 right-3 flex gap-2">
                        <button
                            onClick={() => handleReset('interview')}
                            className="px-3 py-1.5 bg-bg-item-surface hover:bg-bg-item-active text-text-primary rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 shadow-sm border border-border-subtle"
                            title="Reset to default"
                        >
                            <RotateCcw size={14} /> Reset
                        </button>
                        <button
                            onClick={() => handleSave('interview')}
                            disabled={saving === 'interview'}
                            className="px-3 py-1.5 bg-accent-primary hover:bg-accent-secondary text-bg-primary rounded-lg text-xs font-medium shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
                        >
                            {saving === 'interview' ? <RotateCcw size={14} className="animate-spin" /> : <Save size={14} />}
                            Save
                        </button>
                    </div>
                </div>
                <div className="mt-3 flex items-start gap-2 p-2 bg-blue-500/10 rounded-lg border border-blue-500/20 text-[10px] text-blue-300">
                    <Info size={14} className="shrink-0 mt-0.5" />
                    <p>
                        <strong>Note:</strong> You can use <code>{"{RESUME_CONTEXT}"}</code> and <code>{"{JD_CONTEXT}"}</code> placeholders to inject user context.
                    </p>
                </div>
            </div>

            {/* Meeting Prompt Section */}
            <div className="bg-[var(--bg-card-alpha)] backdrop-blur-xl rounded-xl p-5 border border-border-subtle">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
                            <Info size={18} />
                        </div>
                        <div>
                            <h3 className="font-semibold text-text-primary">Meeting Prompt</h3>
                            <p className="text-[10px] text-text-secondary">Used for real-time meeting assistance (Active Co-Pilot mode)</p>
                        </div>
                    </div>
                </div>

                <div className="relative group">
                    <textarea
                        value={meetingPrompt}
                        onChange={(e) => setMeetingPrompt(e.target.value)}
                        placeholder="Enter custom meeting system prompt..."
                        className="w-full h-48 bg-bg-input border border-border-subtle rounded-xl p-3 text-xs focus:border-accent-primary focus:ring-1 focus:ring-accent-primary outline-none resize-none font-mono text-text-primary transition-all scrollbar-thin scrollbar-thumb-gray-700"
                    />
                    <div className="absolute bottom-3 right-3 flex gap-2">
                        <button
                            onClick={() => handleReset('meeting')}
                            className="px-3 py-1.5 bg-bg-item-surface hover:bg-bg-item-active text-text-primary border border-border-subtle rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 shadow-sm"
                            title="Reset to default"
                        >
                            <RotateCcw size={14} /> Reset
                        </button>
                        <button
                            onClick={() => handleSave('meeting')}
                            disabled={saving === 'meeting'}
                            className="px-3 py-1.5 bg-accent-primary hover:bg-accent-secondary text-bg-primary rounded-lg text-xs font-medium shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
                        >
                            {saving === 'meeting' ? <RotateCcw size={14} className="animate-spin" /> : <Save size={14} />}
                            Save
                        </button>
                    </div>
                </div>
                <div className="mt-3 flex items-start gap-2 p-2 bg-blue-500/10 rounded-lg border border-blue-500/20 text-[10px] text-blue-300">
                    <Info size={14} className="shrink-0 mt-0.5" />
                    <p>
                        <strong>Tip:</strong> For meetings, you can repurpose the Resume/JD context as Project Docs/Agenda.
                    </p>
                </div>
            </div>
        </div>
    );
};

const CheckCircle: React.FC<{ size?: number, className?: string }> = ({ size = 20, className }) => (
    <Check size={size} className={className} />
);
