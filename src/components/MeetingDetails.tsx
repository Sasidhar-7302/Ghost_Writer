import React, { useState } from 'react';
import { ArrowLeft, Search, Mail, Link, ChevronDown, Play, ArrowUp, Copy, Check, MoreHorizontal, Settings, ArrowRight, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import MeetingChatOverlay from './MeetingChatOverlay';
import EditableTextBlock from './EditableTextBlock';
import GhostWriterLogo from './icon.ico';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const formatTime = (ms: number) => {
    const date = new Date(ms);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).toLowerCase();
};

const formatDuration = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}:${Number(seconds) < 10 ? '0' : ''}${seconds}`;
};

interface Meeting {
    id: string;
    title: string;
    date: string;
    duration: string;
    summary: string;
    detailedSummary?: {
        overview?: string;
        actionItems: string[];
        keyPoints: string[];
        actionItemsTitle?: string;
        keyPointsTitle?: string;
    };
    transcript?: Array<{
        speaker: string;
        text: string;
        timestamp: number;
    }>;
    usage?: Array<{
        type: 'assist' | 'followup' | 'chat' | 'followup_questions';
        timestamp: number;
        question?: string;
        answer?: string;
        items?: string[];
    }>;
    screenshots?: string[];
    context_json?: string;
}

const ScreenshotPreview = ({ path }: { path: string }) => {
    const [preview, setPreview] = useState<string | null>(null);

    React.useEffect(() => {
        if (window.electronAPI?.getImagePreview) {
            window.electronAPI.getImagePreview(path).then(setPreview).catch(console.error);
        }
    }, [path]);

    if (!preview) return <div className="aspect-video bg-bg-tertiary animate-pulse rounded-lg border border-border-subtle" />;

    return (
        <div className="block relative group overflow-hidden rounded-lg border border-border-subtle shadow-sm hover:border-black/10 dark:hover:border-white/10 transition-colors">
            <img src={preview} alt="Meeting capture" className="w-full object-cover aspect-video group-hover:scale-105 transition-transform duration-300" />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 backdrop-blur-sm pointer-events-none">
                <Search size={24} className="text-white" />
            </div>
            <a href={preview} download={`screenshot-${path.split(/[\\/]/).pop()?.replace('.png', '') || 'capture'}.png`} className="absolute inset-0 z-10" />
        </div>
    );
};

interface MeetingDetailsProps {
    meeting: Meeting;
    onBack: () => void;
    onOpenSettings: () => void;
}

const MeetingDetails: React.FC<MeetingDetailsProps> = ({ meeting: initialMeeting }) => {
    // We need local state for the meeting object to reflect optimistic updates
    const [meeting, setMeeting] = useState<Meeting>(initialMeeting);
    const [activeTab, setActiveTab] = useState<'summary' | 'transcript' | 'usage' | 'screenshots' | 'context'>('summary');
    const [query, setQuery] = useState('');
    const [isCopied, setIsCopied] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [submittedQuery, setSubmittedQuery] = useState('');
    const [isRegenerating, setIsRegenerating] = useState(false);

    const handleRegenerate = async () => {
        if (!meeting.id || isRegenerating) return;
        
        setIsRegenerating(true);
        try {
            if (window.electronAPI?.regenerateMeetingSummary) {
                const updatedMeeting = await window.electronAPI.regenerateMeetingSummary(meeting.id);
                if (updatedMeeting) {
                    setMeeting(updatedMeeting);
                }
            }
        } catch (err) {
            console.error('Failed to regenerate summary:', err);
        } finally {
            setIsRegenerating(false);
        }
    };

    const handleSubmitQuestion = () => {
        if (query.trim()) {
            setSubmittedQuery(query);
            if (!isChatOpen) {
                setIsChatOpen(true);
            }
            setQuery('');
        }
    };

    const handleInputKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && query.trim()) {
            e.preventDefault();
            handleSubmitQuestion();
        }
    };

    const handleCopy = async () => {
        let textToCopy = '';

        if (activeTab === 'summary' && meeting.detailedSummary) {
            textToCopy = `
Meeting: ${meeting.title}
Date: ${new Date(meeting.date).toLocaleDateString()}

OVERVIEW:
${meeting.detailedSummary.overview || ''}

ACTION ITEMS:
${meeting.detailedSummary.actionItems?.map(item => `- ${item}`).join('\n') || 'None'}

KEY POINTS:
${meeting.detailedSummary.keyPoints?.map(item => `- ${item}`).join('\n') || 'None'}
            `.trim();
        } else if (activeTab === 'transcript' && meeting.transcript) {
            textToCopy = meeting.transcript.map(t => `[${formatTime(t.timestamp)}] ${t.speaker === 'user' ? 'Me' : 'Them'}: ${t.text}`).join('\n');
        } else if (activeTab === 'usage' && meeting.usage) {
            textToCopy = meeting.usage.map(u => `Q: ${u.question || ''}\nA: ${u.answer || ''}`).join('\n\n');
        }

        if (!textToCopy) return;

        try {
            await navigator.clipboard.writeText(textToCopy);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy content:', err);
        }
    };

    // UPDATE HANDLERS
    const handleTitleSave = async (newTitle: string) => {
        setMeeting(prev => ({ ...prev, title: newTitle }));
        if (window.electronAPI?.updateMeetingTitle) {
            await window.electronAPI.updateMeetingTitle(meeting.id, newTitle);
        }
    };

    const handleOverviewSave = async (newOverview: string) => {
        setMeeting(prev => ({
            ...prev,
            detailedSummary: {
                ...prev.detailedSummary!,
                overview: newOverview
            }
        }));
        if (window.electronAPI?.updateMeetingSummary) {
            await window.electronAPI.updateMeetingSummary(meeting.id, { overview: newOverview });
        }
    };

    const handleActionItemSave = async (index: number, newVal: string) => {
        const newItems = [...(meeting.detailedSummary?.actionItems || [])];
        if (!newVal.trim()) {
            // Optional: Remove empty items? For now just keep empty or update
        }
        newItems[index] = newVal;

        setMeeting(prev => ({
            ...prev,
            detailedSummary: {
                ...prev.detailedSummary!,
                actionItems: newItems
            }
        }));

        if (window.electronAPI?.updateMeetingSummary) {
            await window.electronAPI.updateMeetingSummary(meeting.id, { actionItems: newItems });
        }
    };

    const handleKeyPointSave = async (index: number, newVal: string) => {
        const newItems = [...(meeting.detailedSummary?.keyPoints || [])];
        newItems[index] = newVal;

        setMeeting(prev => ({
            ...prev,
            detailedSummary: {
                ...prev.detailedSummary!,
                keyPoints: newItems
            }
        }));

        if (window.electronAPI?.updateMeetingSummary) {
            await window.electronAPI.updateMeetingSummary(meeting.id, { keyPoints: newItems });
        }
    };


    return (
        <div className="h-full w-full flex flex-col bg-bg-main text-text-secondary font-sans overflow-hidden">
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.3 }}
                className="flex flex-col h-full"
            >
                {/* Fixed Header: Meta Info & Tabs */}
                <header className="flex-none bg-bg-main z-10">
                    <div className="max-w-4xl mx-auto px-8 pt-8 pb-4">
                        {/* Meta Info & Actions Row */}
                        <div className="flex items-start justify-between mb-6">
                            <div className="w-full pr-4">
                                {/* Date formatting could be improved to use meeting.date if it's an ISO string */}
                                <div className="text-xs text-text-tertiary font-medium mb-1">
                                    {new Date(meeting.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                                </div>

                                {/* Editable Title */}
                                <EditableTextBlock
                                    initialValue={meeting.title}
                                    onSave={handleTitleSave}
                                    tagName="h1"
                                    className="text-3xl font-bold text-text-primary tracking-tight -ml-2 px-2 py-1 rounded-md transition-colors"
                                    multiline={false}
                                />
                            </div>
                        </div>

                        {/* Tabs & Actions Bar */}
                        <div className="flex flex-wrap items-center justify-between gap-y-4 mb-4">
                            {/* Segmented Control Tabs */}
                            <div className="bg-white/[0.03] p-1 rounded-full inline-flex items-center gap-1 border border-white/5 backdrop-blur-3xl shadow-2xl">
                                {['summary', 'transcript', 'usage', 'screenshots', 'context'].map((tab) => (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveTab(tab as any)}
                                        className={`
                                            relative px-6 py-2.5 text-[10px] font-mono font-bold uppercase tracking-[0.2em] rounded-full transition-all duration-300 z-10
                                            ${activeTab === tab ? 'text-[#08080c]' : 'text-text-tertiary hover:text-white hover:bg-white/5'}
                                        `}
                                    >
                                        {activeTab === tab && (
                                            <motion.div
                                                layoutId="activeTabBackground"
                                                className="absolute inset-0 bg-white rounded-full -z-10 shadow-[0_5px_15px_-5px_rgba(255,255,255,0.4)]"
                                                initial={false}
                                                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                            />
                                        )}
                                        {tab}
                                    </button>
                                ))}
                            </div>
 
                            {/* Secondary Actions Group */}
                            <div className="flex items-center gap-2 bg-white/[0.02] p-1 rounded-full border border-white/5 backdrop-blur-xl">
                                {activeTab === 'summary' && (
                                    <button
                                        onClick={handleRegenerate}
                                        disabled={isRegenerating}
                                        className={`flex items-center gap-2 px-4 py-2 text-[10px] font-mono font-black uppercase tracking-widest rounded-full transition-all ${isRegenerating ? 'text-accent-primary animate-pulse bg-accent-primary/5' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                                        title="Regenerate Summary"
                                    >
                                        <RefreshCw size={12} className={isRegenerating ? 'animate-spin' : ''} />
                                        <span>{isRegenerating ? 'Syncing...' : 'Regen'}</span>
                                    </button>
                                )}
                                
                                <button
                                    onClick={handleCopy}
                                    className="flex items-center gap-2 px-4 py-2 text-[10px] font-mono font-black uppercase tracking-widest text-white/40 hover:text-white hover:bg-white/5 rounded-full transition-all"
                                    title={isCopied ? 'Copied to clipboard' : 'Copy to clipboard'}
                                >
                                    {isCopied ? (
                                        <>
                                            <Check size={12} className="text-emerald-500" />
                                            <span className="text-emerald-500">Done</span>
                                        </>
                                    ) : (
                                        <>
                                            <Copy size={12} />
                                            <span>Copy</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                    {/* Subtle Divider */}
                    <div className="max-w-4xl mx-auto px-8">
                        <div className="h-px bg-white/5" />
                    </div>
                </header>

                {/* Main Content Area: Now scrollable independently */}
                <main className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
                    <div className="max-w-4xl mx-auto px-8 py-8 pb-40">
                        {/* Tab Content */}
                        <div className="space-y-8">
                        {/* Using standard divs for content, framer motion for layout */}
                        {activeTab === 'summary' && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                {/* Overview - Rendered as Markdown */}
                                <div className="mb-6 pb-6 border-b border-border-subtle prose prose-sm dark:prose-invert max-w-none">
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        components={{
                                            h1: ({ node, ...props }) => <h1 className="text-xl font-bold text-text-primary mt-4 mb-2" {...props} />,
                                            h2: ({ node, ...props }) => <h2 className="text-lg font-semibold text-text-primary mt-4 mb-2" {...props} />,
                                            h3: ({ node, ...props }) => <h3 className="text-base font-semibold text-text-primary mt-3 mb-1" {...props} />,
                                            p: ({ node, ...props }) => <p className="text-sm text-text-secondary leading-relaxed mb-2" {...props} />,
                                            ul: ({ node, ...props }) => <ul className="list-disc ml-4 mb-2 space-y-1" {...props} />,
                                            ol: ({ node, ...props }) => <ol className="list-decimal ml-4 mb-2 space-y-1" {...props} />,
                                            li: ({ node, ...props }) => <li className="text-sm text-text-secondary" {...props} />,
                                            strong: ({ node, ...props }) => <strong className="font-semibold text-text-primary" {...props} />,
                                            a: ({ node, ...props }) => <a className="text-blue-500 hover:underline" {...props} />,
                                        }}
                                    >
                                        {meeting.detailedSummary?.overview || ''}
                                    </ReactMarkdown>
                                </div>


                                {/* Action Items - Only show if there are items */}
                                {meeting.detailedSummary?.actionItems && meeting.detailedSummary.actionItems.length > 0 && (
                                    <section className="mb-8">
                                        <div className="flex items-center justify-between mb-4">
                                            <EditableTextBlock
                                                initialValue={meeting.detailedSummary?.actionItemsTitle || 'Action Items'}
                                                onSave={(val) => {
                                                    setMeeting(prev => ({
                                                        ...prev,
                                                        detailedSummary: { ...prev.detailedSummary!, actionItemsTitle: val }
                                                    }));
                                                    window.electronAPI?.updateMeetingSummary(meeting.id, { actionItemsTitle: val });
                                                }}
                                                tagName="h2"
                                                className="text-lg font-semibold text-text-primary -ml-2 px-2 py-1 rounded-sm transition-colors"
                                                multiline={false}
                                            />
                                        </div>
                                        <ul className="space-y-3">
                                            {meeting.detailedSummary.actionItems.map((item, i) => (
                                                <li key={i} className="flex items-start gap-3 group">
                                                    <div className="mt-2 w-1.5 h-1.5 rounded-full bg-text-secondary group-hover:bg-blue-500 transition-colors shrink-0" />
                                                    <div className="flex-1">
                                                        <EditableTextBlock
                                                            initialValue={item}
                                                            onSave={(val) => handleActionItemSave(i, val)}
                                                            tagName="p"
                                                            className="text-sm text-text-secondary leading-relaxed -ml-2 px-2 rounded-sm transition-colors"
                                                            placeholder="Type an action item..."
                                                            onEnter={() => {
                                                                const newItems = [...(meeting.detailedSummary?.actionItems || [])];
                                                                newItems.splice(i + 1, 0, "");
                                                                setMeeting(prev => ({
                                                                    ...prev,
                                                                    detailedSummary: { ...prev.detailedSummary!, actionItems: newItems }
                                                                }));
                                                            }}
                                                        />
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    </section>
                                )}

                                {/* Key Points - Only show if there are items */}
                                {meeting.detailedSummary?.keyPoints && meeting.detailedSummary.keyPoints.length > 0 && (
                                    <section>
                                        <div className="flex items-center justify-between mb-4">
                                            <EditableTextBlock
                                                initialValue={meeting.detailedSummary?.keyPointsTitle || 'Key Points'}
                                                onSave={(val) => {
                                                    setMeeting(prev => ({
                                                        ...prev,
                                                        detailedSummary: { ...prev.detailedSummary!, keyPointsTitle: val }
                                                    }));
                                                    window.electronAPI?.updateMeetingSummary(meeting.id, { keyPointsTitle: val });
                                                }}
                                                tagName="h2"
                                                className="text-lg font-semibold text-text-primary -ml-2 px-2 py-1 rounded-sm transition-colors"
                                                multiline={false}
                                            />
                                        </div>
                                        <ul className="space-y-3">
                                            {meeting.detailedSummary.keyPoints.map((item, i) => (
                                                <li key={i} className="flex items-start gap-3 group">
                                                    <div className="mt-2 w-1.5 h-1.5 rounded-full bg-white animate-pulse shadow-[0_0_8px_white] shrink-0 opacity-40 group-hover:opacity-100 transition-opacity" />
                                                    <div className="flex-1">
                                                        <EditableTextBlock
                                                            initialValue={item}
                                                            onSave={(val) => handleKeyPointSave(i, val)}
                                                            tagName="p"
                                                            className="text-sm text-text-secondary leading-relaxed -ml-2 px-2 rounded-sm transition-colors"
                                                            placeholder="Type a key point..."
                                                            onEnter={() => {
                                                                const newItems = [...(meeting.detailedSummary?.keyPoints || [])];
                                                                newItems.splice(i + 1, 0, "");
                                                                setMeeting(prev => ({
                                                                    ...prev,
                                                                    detailedSummary: { ...prev.detailedSummary!, keyPoints: newItems }
                                                                }));
                                                            }}
                                                        />
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    </section>
                                )}
                            </motion.div>
                        )}

                        {activeTab === 'transcript' && (
                            <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                <div className="space-y-6">
                                    {(() => {
                                        console.log('Raw Transcript:', meeting.transcript);
                                        const filteredTranscript = meeting.transcript?.filter(entry => {
                                            const isHidden = ['system', 'ai', 'assistant', 'model'].includes(entry.speaker?.toLowerCase());
                                            if (isHidden) console.log('Filtered out:', entry);
                                            return !isHidden;
                                        }) || [];
                                        console.log('Filtered Transcript:', filteredTranscript);

                                        if (filteredTranscript.length === 0) {
                                            return <p className="text-text-tertiary">No transcript available.</p>;
                                        }

                                        return filteredTranscript.map((entry, i) => (
                                            <div key={i} className="group">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-xs font-semibold text-text-secondary">
                                                        {entry.speaker === 'user' ? 'Me' : 'Them'}
                                                    </span>
                                                    <span className="text-xs text-text-tertiary font-mono">{entry.timestamp ? formatTime(entry.timestamp) : '0:00'}</span>
                                                </div>
                                                <p className="text-text-secondary text-[15px] leading-relaxed transition-colors select-text cursor-text">{entry.text}</p>
                                            </div>
                                        ));
                                    })()}
                                </div>
                            </motion.section>
                        )}

                        {activeTab === 'usage' && (
                            <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8 pb-10">
                                {meeting.usage?.map((interaction, i) => (
                                    <div key={i} className="space-y-4">
                                        {/* User Question */}
                                        {interaction.question && (
                                            <div className="flex justify-end">
                                                <div className="bg-white text-black px-5 py-2.5 rounded-2xl rounded-tr-sm max-w-[80%] text-[14px] font-bold leading-relaxed shadow-[0_10px_30px_-10px_rgba(255,255,255,0.2)]">
                                                    {interaction.question}
                                                </div>
                                            </div>
                                        )}

                                        {/* AI Answer */}
                                        {interaction.answer && (
                                            <div className="flex items-start gap-4">
                                                <div className="mt-1 w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center border border-white/10 shrink-0">
                                                    <img src={GhostWriterLogo} alt="AI" className="w-5 h-5 object-contain" />
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1.5">
                                                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-text-primary">Ghost Writer</span>
                                                        <span className="text-[10px] text-text-tertiary font-medium uppercase tracking-widest opacity-60">{formatTime(interaction.timestamp)}</span>
                                                    </div>
                                                    <div className="bg-white/[0.03] border border-white/5 rounded-2xl rounded-tl-sm p-5 text-text-secondary text-[15px] leading-relaxed whitespace-pre-wrap font-medium">
                                                        {interaction.answer}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {!meeting.usage?.length && <p className="text-text-tertiary">No usage history.</p>}
                            </motion.section>
                        )}

                        {activeTab === 'screenshots' && (
                            <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4 pb-10">
                                {meeting.screenshots && meeting.screenshots.length > 0 ? (
                                    <div className="grid grid-cols-2 gap-4">
                                        {meeting.screenshots.map((path, i) => (
                                            <ScreenshotPreview key={i} path={path} />
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-text-tertiary">No screenshots taken during this session.</p>
                                )}
                            </motion.section>
                        )}

                        {activeTab === 'context' && (
                            <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8 pb-10">
                                {(() => {
                                    try {
                                        const ctx = meeting.context_json ? JSON.parse(meeting.context_json) : null;
                                        if (!ctx) return <p className="text-text-tertiary">No context data preserved for this session.</p>;

                                        return (
                                            <div className="space-y-10">
                                                {/* Documents Section */}
                                                <div className="space-y-6">
                                                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-primary opacity-50">Synchronized Documents</h3>
                                                    
                                                    <div className="grid grid-cols-1 gap-4">
                                                        {ctx.resumeText && (
                                                            <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-3">
                                                                <div className="flex items-center gap-2 text-text-primary">
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                                                                    <span className="text-xs font-bold uppercase tracking-widest">Candidate Resume</span>
                                                                </div>
                                                                <div className="text-[13px] leading-relaxed text-text-secondary opacity-80 line-clamp-6 whitespace-pre-wrap font-mono">
                                                                    {ctx.resumeText}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {ctx.jdText && (
                                                            <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-3">
                                                                <div className="flex items-center gap-2 text-text-primary">
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                                                    <span className="text-xs font-bold uppercase tracking-widest">Job Description</span>
                                                                </div>
                                                                <div className="text-[13px] leading-relaxed text-text-secondary opacity-80 line-clamp-6 whitespace-pre-wrap font-mono">
                                                                    {ctx.jdText}
                                                                </div>
                                                            </div>
                                                        )}
                                                        
                                                        {!ctx.resumeText && !ctx.jdText && <p className="text-text-tertiary text-xs italic">No documents were attached to this session.</p>}
                                                    </div>
                                                </div>

                                                {/* Prompt Settings Section */}
                                                {ctx.promptSettings && (
                                                    <div className="space-y-6">
                                                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-primary opacity-50">Active Prompt Calibration</h3>
                                                        <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-4">
                                                            <div>
                                                                <span className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary block mb-2">Technical Interview Mode</span>
                                                                <p className="text-[13px] text-text-secondary font-medium leading-relaxed italic border-l-2 border-white/10 pl-4 py-1">
                                                                    {ctx.promptSettings.interviewPrompt || "Standard AI Assistant Architecture"}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                                
                                                <div className="pt-4 flex items-center gap-2 opacity-30">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
                                                    <span className="text-[9px] font-mono uppercase tracking-widest">Snapshot Captured {new Date(ctx.timestamp || meeting.date).toLocaleString()}</span>
                                                </div>
                                            </div>
                                        );
                                    } catch (e) {
                                        return <p className="text-text-tertiary">Error parsing session context.</p>;
                                    }
                                })()}
                            </motion.section>
                        )}
                        </div> {/* space-y-8 */}
                    </div> {/* max-w-4xl centerer */}
                </main>
            </motion.div>

            {/* Floating Footer (Ask Bar) */}
            <div className={`absolute bottom-0 left-0 right-0 p-8 flex justify-center pointer-events-none ${isChatOpen ? 'z-50' : 'z-20'}`}>
                <div className="w-full max-w-[480px] relative group pointer-events-auto">
                    {/* Dark Glass Effect Input (Matching Reference) */}
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleInputKeyDown}
                        placeholder="Contextual query regarding this session..."
                        className="w-full pl-8 pr-16 py-5 bg-white/[0.03] backdrop-blur-3xl border border-white/10 rounded-2xl text-[14px] text-white placeholder-text-tertiary/40 focus:outline-none focus:border-white/30 transition-all duration-500 shadow-2xl font-medium"
                    />
                    <button
                        onClick={handleSubmitQuestion}
                        className={`absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-xl transition-all duration-500 border border-white/10 ${query.trim() ? 'bg-white text-black shadow-[0_0_25px_rgba(255,255,255,0.3)] hover:scale-105' : 'bg-white/5 text-text-tertiary hover:bg-white/10'
                            }`}
                    >
                        <ArrowUp size={18} />
                    </button>
                </div>
            </div>

            {/* Chat Overlay */}
            <MeetingChatOverlay
                isOpen={isChatOpen}
                onClose={() => {
                    setIsChatOpen(false);
                    setQuery('');
                    setSubmittedQuery('');
                }}
                meetingContext={{
                    id: meeting.id,  // Required for RAG queries
                    title: meeting.title,
                    summary: meeting.detailedSummary?.overview,
                    keyPoints: meeting.detailedSummary?.keyPoints,
                    actionItems: meeting.detailedSummary?.actionItems,
                    transcript: meeting.transcript
                }}
                initialQuery={submittedQuery}
                onNewQuery={(newQuery) => {
                    setSubmittedQuery(newQuery);
                }}
            />
        </div>
    );
};

export default MeetingDetails;
