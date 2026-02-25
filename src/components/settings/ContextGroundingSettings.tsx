import React, { useState, useEffect, useRef } from 'react';
import { Upload, FileText, Trash2, CheckCircle, AlertCircle, Save } from 'lucide-react';

export const ContextGroundingSettings: React.FC = () => {
    const [resumeText, setResumeText] = useState('');
    const [jdText, setJdText] = useState('');
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error' | null, message: string }>({ type: null, message: '' });

    const resumeInputRef = useRef<HTMLInputElement>(null);
    const jdInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        loadContext();
    }, []);

    const loadContext = async () => {
        try {
            setLoading(true);
            const docs = await window.electronAPI.getContextDocuments();
            setResumeText(docs.resumeText || '');
            setJdText(docs.jdText || '');
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
                result = await window.electronAPI.uploadResume(filePath);
                if (result.success && result.text) setResumeText(result.text);
            } else {
                result = await window.electronAPI.uploadJD(filePath);
                if (result.success && result.text) setJdText(result.text);
            }

            if (result.success) {
                showStatus('success', `${type === 'resume' ? 'Resume' : 'Job Description'} uploaded successfully!`);
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
                result = await window.electronAPI.saveResumeText(resumeText);
            } else {
                result = await window.electronAPI.saveJDText(jdText);
            }

            if (result.success) {
                showStatus('success', `${type === 'resume' ? 'Resume' : 'Job Description'} saved successfully!`);
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
        if (!confirm(`Are you sure you want to clear the ${type === 'resume' ? 'Resume' : 'Job Description'} context?`)) return;

        try {
            setLoading(true);
            if (type === 'resume') {
                await window.electronAPI.clearResume();
                setResumeText('');
            } else {
                await window.electronAPI.clearJD();
                setJdText('');
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
        <div className="space-y-6 text-gray-200">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-white mb-1">Context Grounding</h2>
                    <p className="text-sm text-gray-400">
                        Provide your Resume and the Job Description to help the AI give more relevant answers.
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
            <div className="bg-gray-800/50 rounded-lg p-5 border border-gray-700">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <FileText className="text-purple-400" size={20} />
                        <h3 className="font-semibold text-white">Resume / CV</h3>
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
                            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs font-medium transition-colors flex items-center gap-1"
                        >
                            <Upload size={14} /> Upload File
                        </button>
                        <button
                            onClick={() => handleClear('resume')}
                            disabled={loading || !resumeText}
                            className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded text-xs font-medium transition-colors flex items-center gap-1"
                        >
                            <Trash2 size={14} /> Clear
                        </button>
                    </div>
                </div>

                <div className="relative">
                    <textarea
                        value={resumeText}
                        onChange={(e) => setResumeText(e.target.value)}
                        placeholder="Paste your resume text here, or upload a PDF/DOCX file..."
                        className="w-full h-48 bg-gray-900/50 border border-gray-700 rounded-md p-3 text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none resize-none font-mono"
                    />
                    <button
                        onClick={() => handleSaveText('resume')}
                        disabled={loading}
                        className="absolute bottom-3 right-3 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-medium shadow-lg transition-colors flex items-center gap-1"
                    >
                        <Save size={14} /> Save Text
                    </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                    Uploaded files are automatically converted to text. You can edit the extracted text above.
                </p>
            </div>

            {/* JD Section */}
            <div className="bg-gray-800/50 rounded-lg p-5 border border-gray-700">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <FileText className="text-blue-400" size={20} />
                        <h3 className="font-semibold text-white">Job Description</h3>
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
                            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs font-medium transition-colors flex items-center gap-1"
                        >
                            <Upload size={14} /> Upload File
                        </button>
                        <button
                            onClick={() => handleClear('jd')}
                            disabled={loading || !jdText}
                            className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded text-xs font-medium transition-colors flex items-center gap-1"
                        >
                            <Trash2 size={14} /> Clear
                        </button>
                    </div>
                </div>

                <div className="relative">
                    <textarea
                        value={jdText}
                        onChange={(e) => setJdText(e.target.value)}
                        placeholder="Paste the Job Description text here..."
                        className="w-full h-48 bg-gray-900/50 border border-gray-700 rounded-md p-3 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none font-mono"
                    />
                    <button
                        onClick={() => handleSaveText('jd')}
                        disabled={loading}
                        className="absolute bottom-3 right-3 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium shadow-lg transition-colors flex items-center gap-1"
                    >
                        <Save size={14} /> Save Text
                    </button>
                </div>
            </div>
        </div>
    );
};
