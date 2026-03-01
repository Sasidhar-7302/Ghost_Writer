import React, { useState, useEffect, useRef } from 'react';
import { Upload, FileText, Trash2, CheckCircle, AlertCircle, Save } from 'lucide-react';

export const ContextGroundingSettings: React.FC = () => {
    const [resumeText, setResumeText] = useState('');
    const [jdText, setJdText] = useState('');
    const [projectText, setProjectText] = useState('');
    const [agendaText, setAgendaText] = useState('');
    const [loading, setLoading] = useState(false);
    const [isMeeting, setIsMeeting] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error' | null, message: string }>({ type: null, message: '' });

    const resumeInputRef = useRef<HTMLInputElement>(null);
    const jdInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        loadContext();
        loadMode();
    }, []);

    const loadMode = async () => {
        const mode = await window.electronAPI.getMeetingMode();
        setIsMeeting(mode);
    };

    const loadContext = async () => {
        try {
            setLoading(true);
            const docs = await window.electronAPI.getContextDocuments();
            setResumeText(docs.resumeText || '');
            setJdText(docs.jdText || '');
            setProjectText(docs.projectText || '');
            setAgendaText(docs.agendaText || '');
        } catch (error) {
            console.error('Failed to load context documents:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'resume' | 'jd') => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setLoading(true);
            // We pass the file path to the main process
            // Note: In Electron renderer, the File object has a 'path' property
            const filePath = (file as any).path;

            let result;
            if (type === 'resume') {
                if (isMeeting) {
                    result = await window.electronAPI.uploadProject(filePath);
                    if (result.success && result.text) setProjectText(result.text);
                } else {
                    result = await window.electronAPI.uploadResume(filePath);
                    if (result.success && result.text) setResumeText(result.text);
                }
            } else {
                if (isMeeting) {
                    result = await window.electronAPI.uploadAgenda(filePath);
                    if (result.success && result.text) setAgendaText(result.text);
                } else {
                    result = await window.electronAPI.uploadJD(filePath);
                    if (result.success && result.text) setJdText(result.text);
                }
            }

            if (result.success) {
                const label = type === 'resume'
                    ? (isMeeting ? 'Project Documentation' : 'Resume')
                    : (isMeeting ? 'Agenda' : 'Job Description');
                showStatus('success', `${label} uploaded successfully!`);
            } else {
                showStatus('error', `Failed to upload ${type}: ${result.error}`);
            }
        } catch (error) {
            showStatus('error', `Error uploading file: ${error}`);
        } finally {
            setLoading(false);
            // Reset input
            if (e.target) e.target.value = '';
        }
    };

    const handleSaveText = async (type: 'resume' | 'jd') => {
        try {
            setLoading(true);
            let result;
            if (type === 'resume') {
                if (isMeeting) {
                    result = await window.electronAPI.saveProjectText(projectText);
                } else {
                    result = await window.electronAPI.saveResumeText(resumeText);
                }
            } else {
                if (isMeeting) {
                    result = await window.electronAPI.saveAgendaText(agendaText);
                } else {
                    result = await window.electronAPI.saveJDText(jdText);
                }
            }

            if (result.success) {
                const label = type === 'resume'
                    ? (isMeeting ? 'Project Documentation' : 'Resume')
                    : (isMeeting ? 'Agenda' : 'Job Description');
                showStatus('success', `${label} saved successfully!`);
            } else {
                showStatus('error', `Failed to save: ${result.error}`);
            }
        } catch (error) {
            showStatus('error', `Error saving text: ${error}`);
        } finally {
            setLoading(false);
        }
    };

    const handleClear = async (type: 'resume' | 'jd') => {
        const label = type === 'resume'
            ? (isMeeting ? 'Project Documentation' : 'Resume')
            : (isMeeting ? 'Agenda' : 'Job Description');
        if (!confirm(`Are you sure you want to clear the ${label} context?`)) return;

        try {
            setLoading(true);
            if (type === 'resume') {
                if (isMeeting) {
                    await window.electronAPI.clearProject();
                    setProjectText('');
                } else {
                    await window.electronAPI.clearResume();
                    setResumeText('');
                }
            } else {
                if (isMeeting) {
                    await window.electronAPI.clearAgenda();
                    setAgendaText('');
                } else {
                    await window.electronAPI.clearJD();
                    setJdText('');
                }
            }
            showStatus('success', 'Context cleared.');
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

    return (
        <div className="space-y-6 text-text-primary">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-text-primary mb-1">
                        {isMeeting ? 'Meeting Context' : 'Interview Context'}
                    </h2>
                    <p className="text-sm text-text-secondary">
                        {isMeeting
                            ? 'Provide project documentation and the agenda to help the AI give more relevant insights.'
                            : 'Provide your Resume and the Job Description to help the AI give more relevant answers.'}
                    </p>
                </div>
            </div>

            {status.message && (
                <div className={`p-3 rounded-lg flex items-center gap-2 ${status.type === 'success' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                    {status.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
                    {status.message}
                </div>
            )}

            {/* Resume Section */}
            <div className="bg-[var(--bg-card-alpha)] backdrop-blur-xl border border-border-subtle rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <FileText className="text-purple-400" size={20} />
                        <h3 className="font-semibold text-text-primary">
                            {isMeeting ? 'Project Documentation' : 'Resume / CV'}
                        </h3>
                    </div>
                    <div className="flex gap-2">
                        <input
                            type="file"
                            ref={resumeInputRef}
                            className="hidden"
                            accept=".pdf,.docx,.txt,.md"
                            onChange={(e) => handleFileUpload(e, 'resume')}
                        />
                        <button
                            onClick={() => resumeInputRef.current?.click()}
                            disabled={loading}
                            className="px-3 py-1.5 bg-bg-item-surface hover:bg-bg-item-active text-text-primary border border-border-subtle rounded text-xs font-medium transition-colors flex items-center gap-1"
                        >
                            <Upload size={14} /> Upload File
                        </button>
                        <button
                            onClick={() => handleClear('resume')}
                            disabled={loading || (isMeeting ? !projectText : !resumeText)}
                            className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded text-xs font-medium transition-colors flex items-center gap-1"
                        >
                            <Trash2 size={14} /> Clear
                        </button>
                    </div>
                </div>

                <div className="relative">
                    <textarea
                        value={isMeeting ? projectText : resumeText}
                        onChange={(e) => isMeeting ? setProjectText(e.target.value) : setResumeText(e.target.value)}
                        placeholder={isMeeting
                            ? "Paste project documentation, technical specs, or meeting notes here..."
                            : "Paste your resume text here, or upload a PDF/DOCX file..."}
                        className="w-full h-48 bg-bg-input border border-border-subtle rounded-md p-3 text-sm focus:border-accent-primary focus:ring-1 focus:ring-accent-primary outline-none resize-none font-mono text-text-primary scrollbar-thin"
                    />
                    <button
                        onClick={() => handleSaveText('resume')}
                        disabled={loading}
                        className="absolute bottom-3 right-3 px-3 py-1.5 bg-accent-primary hover:bg-accent-secondary text-bg-primary rounded text-xs font-medium shadow-lg transition-colors flex items-center gap-1"
                    >
                        <Save size={14} /> Save Text
                    </button>
                </div>
                <p className="text-xs text-text-tertiary mt-2">
                    Uploaded files are automatically converted to text. You can edit the extracted text above.
                </p>
            </div>

            {/* JD Section */}
            <div className="bg-[var(--bg-card-alpha)] backdrop-blur-xl border border-border-subtle rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <FileText className="text-blue-400" size={20} />
                        <h3 className="font-semibold text-text-primary">
                            {isMeeting ? 'Meeting Agenda' : 'Job Description'}
                        </h3>
                    </div>
                    <div className="flex gap-2">
                        <input
                            type="file"
                            ref={jdInputRef}
                            className="hidden"
                            accept=".pdf,.docx,.txt,.md"
                            onChange={(e) => handleFileUpload(e, 'jd')}
                        />
                        <button
                            onClick={() => jdInputRef.current?.click()}
                            disabled={loading}
                            className="px-3 py-1.5 bg-bg-item-surface hover:bg-bg-item-active text-text-primary border border-border-subtle rounded text-xs font-medium transition-colors flex items-center gap-1"
                        >
                            <Upload size={14} /> Upload File
                        </button>
                        <button
                            onClick={() => handleClear('jd')}
                            disabled={loading || (isMeeting ? !agendaText : !jdText)}
                            className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded text-xs font-medium transition-colors flex items-center gap-1"
                        >
                            <Trash2 size={14} /> Clear
                        </button>
                    </div>
                </div>

                <div className="relative">
                    <textarea
                        value={isMeeting ? agendaText : jdText}
                        onChange={(e) => isMeeting ? setAgendaText(e.target.value) : setJdText(e.target.value)}
                        placeholder={isMeeting
                            ? "Paste the meeting agenda, goals, or discussion points here..."
                            : "Paste the Job Description text here..."}
                        className="w-full h-48 bg-bg-input border border-border-subtle rounded-md p-3 text-sm focus:border-accent-primary focus:ring-1 focus:ring-accent-primary outline-none resize-none font-mono text-text-primary scrollbar-thin"
                    />
                    <button
                        onClick={() => handleSaveText('jd')}
                        disabled={loading}
                        className="absolute bottom-3 right-3 px-3 py-1.5 bg-accent-primary hover:bg-accent-secondary text-bg-primary rounded text-xs font-medium shadow-lg transition-colors flex items-center gap-1"
                    >
                        <Save size={14} /> Save Text
                    </button>
                </div>
            </div>
        </div>
    );
};
