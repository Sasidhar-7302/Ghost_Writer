import React, { useState, useEffect } from 'react';
import { ToggleLeft, ToggleRight, Search, Zap, Calendar, ArrowRight, ArrowLeft, MoreHorizontal, Globe, Clock, ChevronRight, Settings, RefreshCw, Eye, EyeOff, Ghost, Plus, Mail, Link as LinkIcon, ChevronDown, Trash2, Bell, Check, Download, Play } from 'lucide-react';
import { generateMeetingPDF } from '../utils/pdfGenerator';
import icon from "./icon.ico";
import mainui from "../UI_comp/mainui.png";

import MeetingDetails from './MeetingDetails';
import TopSearchPill from './TopSearchPill';
import GlobalChatOverlay from './GlobalChatOverlay';
import { motion, AnimatePresence } from 'framer-motion';
import { analytics } from '../lib/analytics/analytics.service'; // Added analytics import

interface Meeting {
    id: string;
    title: string;
    date: string;
    duration: string;
    summary: string;
    detailedSummary?: {
        actionItems: string[];
        keyPoints: string[];
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
    active?: boolean; // UI state
    time?: string; // Optional for compatibility
}

interface LauncherProps {
    onStartMeeting: () => void;
    onOpenSettings: () => void;
}

// Helper to format date groups
const getGroupLabel = (dateStr: string) => {
    if (dateStr === "Today") return "Today"; // Backward compatibility

    const date = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (checkDate.getTime() === today.getTime()) return "Today";
    if (checkDate.getTime() === yesterday.getTime()) return "Yesterday";

    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

// Helper to format time (e.g. 3:14pm)
const formatTime = (dateStr: string) => {
    if (dateStr === "Today") return "Just now"; // Legacy
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
};

const Launcher: React.FC<LauncherProps> = ({ onStartMeeting, onOpenSettings }) => {
    const [meetings, setMeetings] = useState<Meeting[]>([]);
    const [isDetectable, setIsDetectable] = useState(false);
    const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
    const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);
    const [isPrepared, setIsPrepared] = useState(false);
    const [preparedEvent, setPreparedEvent] = useState<any>(null);
    const [isCalendarConnected, setIsCalendarConnected] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [showNotification, setShowNotification] = useState(false);

    // Global search state (for AI chat overlay)
    const [isGlobalChatOpen, setIsGlobalChatOpen] = useState(false);
    const [submittedGlobalQuery, setSubmittedGlobalQuery] = useState('');

    const fetchMeetings = () => {
        if (window.electronAPI && window.electronAPI.getRecentMeetings) {
            window.electronAPI.getRecentMeetings().then(setMeetings).catch(err => console.error("Failed to fetch meetings:", err));
        }
    };

    const fetchEvents = () => {
        if (window.electronAPI && window.electronAPI.getUpcomingEvents) {
            window.electronAPI.getUpcomingEvents().then(setUpcomingEvents).catch(err => console.error("Failed to fetch events:", err));
        }
    }

    const handleRefresh = async () => {
        setIsRefreshing(true);
        analytics.trackCommandExecuted('refresh_calendar');
        try {
            if (window.electronAPI && window.electronAPI.calendarRefresh) {
                setShowNotification(true);
                await window.electronAPI.calendarRefresh();
                // fetchEvents();
                fetchMeetings();
                setTimeout(() => {
                    setShowNotification(false);
                }, 3000);
            } else {
                console.warn("electronAPI.calendarRefresh not found");
            }
        } catch (e) {
            console.error("Refresh failed in handleRefresh:", e);
        } finally {
            // Ensure distinct feedback provided (min 500ms spin)
            setTimeout(() => setIsRefreshing(false), 500);
        }
    };

    useEffect(() => {
        console.log("Launcher mounted");
        // Seed demo data if needed (safe to call always)
        if (window.electronAPI && window.electronAPI.invoke) {
            window.electronAPI.invoke('seed-demo').catch(err => console.error("Failed to seed demo:", err));
        }

        // Sync initial undetectable state
        if (window.electronAPI?.getUndetectable) {
            window.electronAPI.getUndetectable().then((undetectable) => {
                setIsDetectable(!undetectable);
            });
        }

        // Listen for undetectable changes
        let removeUndetectableListener: (() => void) | undefined;
        if (window.electronAPI?.onUndetectableChanged) {
            removeUndetectableListener = window.electronAPI.onUndetectableChanged((undetectable) => {
                setIsDetectable(!undetectable);
            });
        }

        fetchMeetings();
        // fetchEvents();

        // Listen for background updates (e.g. after meeting processing finishes)
        const removeMeetingsListener = window.electronAPI.onMeetingsUpdated(() => {
            console.log("Received meetings-updated event");
            fetchMeetings();
        });

        // Simple polling for events every minute
        // const interval = setInterval(fetchEvents, 60000);

        return () => {
            if (removeMeetingsListener) removeMeetingsListener();
            if (removeUndetectableListener) removeUndetectableListener();
            // clearInterval(interval);
        };
    }, []);

    // Filter next meeting (within 60 mins)
    const nextMeeting = upcomingEvents.find(e => {
        const diff = new Date(e.startTime).getTime() - Date.now();
        return diff > -5 * 60000 && diff < 60 * 60000; // -5 min to +60 min
    });

    const handlePrepare = (event: any) => {
        setPreparedEvent(event);
        setIsPrepared(true);
    };

    const handleStartPreparedMeeting = async () => {
        if (!preparedEvent) return;
        analytics.trackCommandExecuted('start_prepared_meeting');
        try {
            const inputDeviceId = localStorage.getItem('preferredInputDeviceId');
            const outputDeviceId = localStorage.getItem('preferredOutputDeviceId');

            await window.electronAPI.invoke('start-meeting', {
                title: preparedEvent.title,
                calendarEventId: preparedEvent.id,
                source: 'calendar',
                audio: { inputDeviceId, outputDeviceId }
            });
            setIsPrepared(false);
        } catch (e) {
            console.error("Failed to start prepared meeting", e);
        }
    };

    if (!window.electronAPI) {
        return <div className="text-white p-10">Error: Electron API not initialized. Check preload script.</div>;
    }

    const toggleDetectable = () => {
        const newState = !isDetectable;
        setIsDetectable(newState);
        window.electronAPI?.setUndetectable(!newState); // Note: setUndetectable takes the *undetectable* state, which is inverse of *detectable*
        analytics.trackModeSelected(newState ? 'launcher' : 'undetectable'); // If visible (detectable), mode is normal/launcher. If not detectable, mode is undetectable.
    };

    // Group meetings
    const groupedMeetings = meetings.reduce((acc, meeting) => {
        const label = getGroupLabel(meeting.date);
        if (!acc[label]) acc[label] = [];
        acc[label].push(meeting);
        return acc;
    }, {} as Record<string, Meeting[]>);

    // Group order (Today, Yesterday, then others sorted new to old is implicit via API return order ideally, 
    // but JS object key order isn't guaranteed. We can use a Map or just known keys.)
    // Simple sort for keys:
    const sortedGroups = Object.keys(groupedMeetings).sort((a, b) => {
        if (a === 'Today') return -1;
        if (b === 'Today') return 1;
        if (a === 'Yesterday') return -1;
        if (b === 'Yesterday') return 1;
        // Approximation for others: parse date
        return new Date(b).getTime() - new Date(a).getTime();
    });


    const [forwardMeeting, setForwardMeeting] = useState<Meeting | null>(null);
    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
    const [menuEntered, setMenuEntered] = useState(false);

    useEffect(() => {
        setMenuEntered(false);
    }, [activeMenuId]);

    // Global click listener to close menu
    useEffect(() => {
        const handleClickOutside = () => setActiveMenuId(null);
        window.addEventListener('click', handleClickOutside);
        return () => window.removeEventListener('click', handleClickOutside);
    }, []);

    const handleOpenMeeting = async (meeting: Meeting) => {
        setForwardMeeting(null); // Clear forward history on new navigation
        console.log("[Launcher] Opening meeting:", meeting.id);
        analytics.trackCommandExecuted('open_meeting_details');

        // Fetch full meeting details including transcript and usage
        if (window.electronAPI && window.electronAPI.getMeetingDetails) {
            try {
                console.log("[Launcher] Fetching full meeting details...");
                const fullMeeting = await window.electronAPI.getMeetingDetails(meeting.id);
                console.log("[Launcher] Got meeting details:", fullMeeting);
                console.log("[Launcher] Transcript count:", fullMeeting?.transcript?.length);
                console.log("[Launcher] Usage count:", fullMeeting?.usage?.length);
                if (fullMeeting) {
                    setSelectedMeeting(fullMeeting);
                    return;
                }
            } catch (err) {
                console.error("[Launcher] Failed to fetch meeting details:", err);
            }
        } else {
            console.warn("[Launcher] getMeetingDetails not available on electronAPI");
        }
        // Fallback to list-view data if fetch fails
        setSelectedMeeting(meeting);
    };

    const handleBack = () => {
        setForwardMeeting(selectedMeeting);
        setSelectedMeeting(null);
    };

    const handleForward = () => {
        if (forwardMeeting) {
            setSelectedMeeting(forwardMeeting);
            setForwardMeeting(null);
        }
    };

    // Helper to format duration to mm:ss or mmm:ss
    const formatDurationPill = (durationStr: string) => {
        // Assume format "X min"
        const minutes = parseInt(durationStr.replace('min', '').trim()) || 0;
        const mm = minutes.toString().padStart(2, '0');
        return `${mm}:00`;
    };

    return (
        <div className="h-full w-full flex flex-col bg-bg-primary text-text-primary font-sans overflow-hidden selection:bg-accent-secondary/30">
            {/* 1. Header Navigation Bar (Command Center style) */}
            <header className="h-14 flex items-center justify-between px-4 border-b border-border-subtle bg-[var(--bg-sidebar-alpha)] backdrop-blur-3xl z-50">
                {/* Left: Navigation Controls */}
                <div className="flex items-center gap-1 no-drag">
                    <button
                        onClick={handleBack}
                        disabled={!selectedMeeting}
                        className="p-1.5 text-text-tertiary hover:text-text-primary disabled:opacity-20 transition-all duration-300 rounded-lg hover:bg-bg-item-surface"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <button
                        onClick={handleForward}
                        disabled={!forwardMeeting}
                        className="p-1.5 text-text-tertiary hover:text-text-primary disabled:opacity-20 transition-all duration-300 rounded-lg hover:bg-bg-item-surface"
                    >
                        <ArrowRight size={18} />
                    </button>
                </div>

                {/* Center: Command Palette Input */}
                <TopSearchPill
                    meetings={meetings}
                    onAIQuery={(query) => {
                        analytics.trackCommandExecuted('ai_query_search');
                        setSubmittedGlobalQuery(query);
                        setIsGlobalChatOpen(true);
                    }}
                    onLiteralSearch={(query) => {
                        analytics.trackCommandExecuted('literal_search');
                        setSubmittedGlobalQuery(query);
                        setIsGlobalChatOpen(true);
                    }}
                    onOpenMeeting={(meetingId) => {
                        const meeting = meetings.find(m => m.id === meetingId);
                        if (meeting) {
                            handleOpenMeeting(meeting);
                            analytics.trackCommandExecuted('open_meeting_from_search');
                        }
                    }}
                />

                {/* Right: Actions */}
                <div className="flex items-center gap-2 no-drag">
                    <button
                        onClick={() => onOpenSettings()}
                        className="p-2 text-text-tertiary hover:text-text-primary transition-all duration-300 rounded-lg hover:bg-bg-item-surface"
                        title="Settings"
                    >
                        <Settings size={18} />
                    </button>
                </div>
            </header>

            <div className="relative flex-1 flex flex-col overflow-hidden">
                {!isDetectable && (
                    <div className="absolute inset-1 border-2 border-dashed border-white/20 rounded-2xl pointer-events-none z-[100]" />
                )}
                <AnimatePresence mode="wait">
                    {selectedMeeting ? (
                        <motion.div
                            key="details"
                            className="flex-1 overflow-hidden"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                        >
                            <MeetingDetails
                                meeting={selectedMeeting}
                                onBack={handleBack}
                                onOpenSettings={onOpenSettings}
                            />
                        </motion.div>
                    ) : (
                        <motion.div
                            key="launcher"
                            className="flex-1 flex flex-col overflow-hidden"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                        >

                            {/* Main Area - Fixed Top, Scrollable Bottom */}
                            {/* Top Section is now effectively static due to parent flex col */}

                            {/* TOP SECTION: Minimalist Header (Seamless) */}
                            <section className="px-8 py-8 shrink-0 flex items-center justify-center">
                                <div className="max-w-4xl mx-auto w-full">
                                    {/* 1. Hero Section: Integrated Single-Row Design (Minimalist) */}
                                    <div className="flex items-center justify-between w-full h-16 px-2 transition-all duration-500">

                                        {/* LEFT: Logo & Brand */}
                                        <div className="flex-1 flex justify-start">
                                            <div className="flex items-center gap-4 group/brand cursor-default">
                                                <div className="w-10 h-10 flex items-center justify-center transition-transform duration-500 group-hover/brand:scale-105 group-hover/brand:rotate-3">
                                                    <img src={icon} alt="Logo" className="w-full h-full object-contain filter drop-shadow-[0_0_12px_rgba(255,255,255,0.15)]" />
                                                </div>
                                                <div className="flex flex-col">
                                                    <h1 className="text-lg font-bold text-text-primary tracking-tight leading-none">Ghost Writer</h1>
                                                    <span className="text-[10px] text-text-tertiary font-medium mt-1 uppercase tracking-widest opacity-70">Production v1.2.4</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* CENTER: Mode Toggle */}
                                        <div className="flex justify-center">
                                            <div
                                                className="flex items-center p-1 bg-white/5 border border-white/10 rounded-full h-9 min-w-[170px] relative cursor-pointer select-none hover:bg-white/10 transition-all duration-300"
                                                onClick={toggleDetectable}
                                            >
                                                <motion.div
                                                    className="absolute inset-1 w-[calc(50%-4px)] bg-white text-black rounded-full shadow-2xl z-0"
                                                    animate={{ x: isDetectable ? 0 : '100%' }}
                                                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                                                />
                                                <div className={`flex-1 flex items-center justify-center gap-1.5 z-10 transition-all duration-500 ${isDetectable ? 'text-black' : 'text-text-tertiary/60'}`}>
                                                    <Eye size={12} className={isDetectable ? 'font-black' : ''} />
                                                    <span className="text-[9px] font-black uppercase tracking-[0.15em]">Visible</span>
                                                </div>
                                                <div className={`flex-1 flex items-center justify-center gap-1.5 z-10 transition-all duration-500 ${!isDetectable ? 'text-black' : 'text-text-tertiary/60'}`}>
                                                    <Ghost size={12} className={!isDetectable ? 'font-black' : ''} />
                                                    <span className="text-[9px] font-black uppercase tracking-[0.15em]">Ghost</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* RIGHT: Actions */}
                                        <div className="flex-1 flex justify-end items-center gap-4">
                                            {/* Refresh Button */}
                                            <button
                                                onClick={handleRefresh}
                                                disabled={isRefreshing}
                                                className={`p-2 text-text-tertiary hover:text-text-primary transition-all hover:bg-bg-item-surface rounded-xl border border-transparent hover:border-border-subtle ${isRefreshing ? 'animate-spin text-text-primary' : ''}`}
                                                title="Sync Calendar"
                                            >
                                                <RefreshCw size={18} />
                                            </button>

                                            {/* Start Ghost Writer CTA */}
                                            <button
                                                onClick={() => {
                                                    onStartMeeting();
                                                    analytics.trackCommandExecuted('start_ghost_writer_cta');
                                                }}
                                                className="
                                                    group/btn relative overflow-hidden
                                                    bg-white text-black
                                                    px-6 py-2.5
                                                    rounded-xl
                                                    font-black text-[11px] uppercase tracking-[0.2em]
                                                    transition-all duration-500
                                                    hover:bg-white/90
                                                    hover:scale-[1.05]
                                                    active:scale-[0.95]
                                                    flex items-center gap-2.5
                                                    shadow-[0_20px_40px_-10px_rgba(255,255,255,0.3)]
                                                "
                                            >
                                                <Play size={12} fill="currentColor" className="ml-0.5" />
                                                <span>Initiate</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* 2. Hero Section Cards - Only show if there is content */}
                                    {((isPrepared && preparedEvent) || nextMeeting) && (
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 h-[198px]">
                                            {/* PREPARED STATE CARD */}
                                            {isPrepared && preparedEvent ? (
                                                <div className="md:col-span-3 relative group rounded-xl overflow-hidden border border-emerald-500/30 bg-bg-secondary flex flex-col items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-900/40 via-bg-secondary to-bg-secondary">
                                                    <div className="absolute top-4 right-4 text-emerald-400">
                                                        <Zap size={16} className="text-yellow-400" />
                                                    </div>
                                                    <div className="text-center max-w-lg z-10">
                                                        <span className="inline-block px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold tracking-wider mb-4 border border-emerald-500/20">
                                                            READY TO JOIN
                                                        </span>
                                                        <h2 className="text-2xl font-bold text-text-primary mb-2">{preparedEvent.title}</h2>
                                                        <p className="text-xs text-text-secondary mb-6 flex items-center justify-center gap-2">
                                                            <Calendar size={12} />
                                                            {new Date(preparedEvent.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} - {new Date(preparedEvent.endTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                                            {preparedEvent.link && " • Link Ready"}
                                                        </p>
                                                        <div className="flex items-center gap-3 justify-center">
                                                            <button
                                                                onClick={handleStartPreparedMeeting}
                                                                className="bg-emerald-500 hover:bg-emerald-400 text-white px-8 py-3 rounded-xl text-sm font-semibold transition-all shadow-lg hover:shadow-emerald-500/25 active:scale-95 flex items-center gap-2"
                                                            >
                                                                Start Meeting
                                                                <ArrowRight size={16} />
                                                            </button>
                                                            <button
                                                                onClick={() => setIsPrepared(false)}
                                                                className="px-4 py-3 rounded-xl text-xs font-medium text-text-tertiary hover:text-text-primary transition-colors"
                                                            >
                                                                Cancel
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[300px] bg-emerald-500/10 blur-[100px] pointer-events-none" />
                                                </div>
                                            ) : (
                                                /* Dynamic Next Meeting */
                                                <div className="md:col-span-2 relative group rounded-xl overflow-hidden bg-bg-secondary flex flex-col">
                                                    <div className="p-5 flex-1 relative z-10">
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                            <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">Up Next</span>
                                                            <span className="text-[11px] text-text-tertiary">• Starts in {nextMeeting ? Math.max(0, Math.ceil((new Date(nextMeeting.startTime).getTime() - Date.now()) / 60000)) : 0} min</span>
                                                        </div>
                                                        <h2 className="text-xl font-bold text-text-primary leading-tight mb-1 line-clamp-2">
                                                            {nextMeeting?.title}
                                                        </h2>
                                                        <div className="flex items-center gap-2 text-text-secondary text-xs mt-2">
                                                            <Calendar size={12} />
                                                            <span>{nextMeeting ? new Date(nextMeeting.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''} - {nextMeeting ? new Date(nextMeeting.endTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}</span>
                                                            {nextMeeting?.link && (
                                                                <>
                                                                    <span className="opacity-20">|</span>
                                                                    <LinkIcon size={12} />
                                                                    <span className="truncate max-w-[150px]">Meeting Link Found</span>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="p-4 bg-[var(--bg-card-alpha)] border-t border-border-subtle flex items-center gap-3">
                                                        <button
                                                            onClick={() => nextMeeting && handlePrepare(nextMeeting)}
                                                            className="flex-1 bg-bg-item-surface hover:bg-bg-item-active border border-border-subtle text-text-primary px-4 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2"
                                                        >
                                                            <Zap size={13} className="text-yellow-400" />
                                                            Prepare
                                                        </button>
                                                        <button
                                                            onClick={onStartMeeting}
                                                            className="px-4 py-2 rounded-lg text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg-item-surface transition-all"
                                                        >
                                                            Start now
                                                        </button>
                                                    </div>
                                                    <div className="absolute top-0 right-0 w-[150px] h-[150px] bg-emerald-500/10 blur-[60px] pointer-events-none" />
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </section>

                            {/* BOTTOM SECTION: Black Background (Scrollable content) */}
                            <main className="flex-1 overflow-y-auto custom-scrollbar bg-bg-primary">
                                <section className="px-8 py-8 min-h-full">
                                    <div className="max-w-4xl mx-auto space-y-8">

                                        {/* Iterating Date Groups */}
                                        {sortedGroups.map((label) => (
                                            <section key={label}>
                                                <h3 className="text-[13px] font-medium text-text-secondary mb-3 pl-1">{label}</h3>
                                                <div className="space-y-1">
                                                    {groupedMeetings[label].map((m) => (
                                                        <motion.div
                                                            key={m.id}
                                                            layoutId={`meeting-${m.id}`}
                                                            className="group relative flex items-center justify-between px-5 py-3.5 rounded-2xl bg-[var(--bg-card-alpha)] hover:bg-bg-item-surface transition-all cursor-pointer border border-border-subtle hover:border-border-muted"
                                                            onClick={() => handleOpenMeeting(m)}
                                                        >
                                                            <div className="flex flex-col gap-0.5 max-w-[65%]">
                                                                <div className={`font-semibold text-[14px] truncate ${m.title === 'Processing...' ? 'text-accent-primary italic animate-pulse' : 'text-text-primary'}`}>
                                                                    {m.title}
                                                                </div>
                                                                {m.summary && (
                                                                    <div className="text-[11px] text-text-tertiary truncate opacity-60">
                                                                        {m.summary}
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Time & Duration Section */}
                                                            <div className="flex items-center gap-5">
                                                                {m.title === 'Processing...' ? (
                                                                    <div className="flex items-center gap-2 transition-all duration-200 ease-out group-hover:opacity-0 group-hover:translate-x-2">
                                                                        <RefreshCw size={12} className="animate-spin text-accent-primary" />
                                                                        <span className="text-[10px] text-accent-primary font-bold uppercase tracking-wider">Processing</span>
                                                                    </div>
                                                                ) : (
                                                                    <>
                                                                        <div className="flex flex-col items-end gap-1.5 transition-all duration-200 ease-out group-hover:opacity-0 group-hover:translate-x-2">
                                                                            <span className="text-[11px] text-text-secondary font-medium uppercase tracking-tight">
                                                                                {formatTime(m.date)}
                                                                            </span>
                                                                            <span className="bg-bg-item-surface text-text-tertiary text-[9px] px-2 py-0.5 rounded-full font-bold tracking-widest border border-border-subtle">
                                                                                {formatDurationPill(m.duration)}
                                                                            </span>
                                                                        </div>
                                                                    </>
                                                                )}
                                                            </div>

                                                            {/* Context Menu Trigger (Slides in on hover) */}
                                                            <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 translate-x-4 transition-all duration-300 ease-out group-hover:opacity-100 group-hover:translate-x-0">
                                                                <button
                                                                    className="p-1.5 text-text-secondary hover:text-text-primary transition-colors"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setActiveMenuId(activeMenuId === m.id ? null : m.id);
                                                                    }}
                                                                >
                                                                    <MoreHorizontal size={16} />
                                                                </button>
                                                            </div>

                                                            {/* Dropdown Menu */}
                                                            <AnimatePresence>
                                                                {activeMenuId === m.id && (
                                                                    <motion.div
                                                                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                                                        exit={{ opacity: 0, scale: 0.95, y: 5 }}
                                                                        transition={{ duration: 0.1 }}
                                                                        className="absolute right-0 top-full mt-1 w-[90px] bg-[#1E1E1E]/80 backdrop-blur-xl border border-white/10 rounded-lg shadow-2xl z-50 overflow-hidden"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                        onMouseEnter={() => setMenuEntered(true)}
                                                                        onMouseLeave={() => {
                                                                            if (menuEntered) setActiveMenuId(null);
                                                                        }}
                                                                    >
                                                                        <div className="p-1 flex flex-col gap-0.5">
                                                                            <button
                                                                                className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-text-primary hover:bg-white/10 rounded-lg transition-colors text-left"
                                                                                onClick={async () => {
                                                                                    setActiveMenuId(null);
                                                                                    analytics.trackPdfExported();
                                                                                    // Fetch full details if needed
                                                                                    if (window.electronAPI && window.electronAPI.getMeetingDetails) {
                                                                                        try {
                                                                                            const fullMeeting = await window.electronAPI.getMeetingDetails(m.id);
                                                                                            if (fullMeeting) {
                                                                                                generateMeetingPDF(fullMeeting);
                                                                                            } else {
                                                                                                generateMeetingPDF(m);
                                                                                            }
                                                                                        } catch (e) {
                                                                                            console.error("Failed to fetch details for PDF", e);
                                                                                            generateMeetingPDF(m);
                                                                                        }
                                                                                    } else {
                                                                                        generateMeetingPDF(m);
                                                                                    }
                                                                                }}
                                                                            >
                                                                                <Download size={13} />
                                                                                Export
                                                                            </button>
                                                                            <button
                                                                                className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-lg transition-colors text-left"
                                                                                onClick={async () => {
                                                                                    if (window.electronAPI && window.electronAPI.deleteMeeting) {
                                                                                        const success = await window.electronAPI.deleteMeeting(m.id);
                                                                                        if (success) {
                                                                                            // Optimistic update or refetch
                                                                                            setMeetings(prev => prev.filter(meeting => meeting.id !== m.id));

                                                                                            // Clear stale history if the deleted meeting was in navigation
                                                                                            if (forwardMeeting && forwardMeeting.id === m.id) setForwardMeeting(null);
                                                                                        }
                                                                                    }
                                                                                    setActiveMenuId(null);
                                                                                }}
                                                                            >
                                                                                <Trash2 size={13} />
                                                                                Delete
                                                                            </button>
                                                                        </div>
                                                                    </motion.div>
                                                                )}
                                                            </AnimatePresence>
                                                        </motion.div>
                                                    ))}
                                                </div>
                                            </section>
                                        ))}

                                        {meetings.length === 0 && (
                                            <div className="p-4 text-text-tertiary text-sm">No recent meetings.</div>
                                        )}

                                    </div>
                                </section>
                            </main>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div >



            {/* Notification Toast - Liquid Glass */}
            <AnimatePresence>
                {
                    showNotification && (
                        <motion.div
                            initial={{ y: 50, opacity: 0, scale: 0.9 }}
                            animate={{ y: 0, opacity: 1, scale: 1 }}
                            exit={{ y: 50, opacity: 0, scale: 0.9 }}
                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                            className="fixed bottom-10 right-10 z-[2000] flex items-center gap-4 pl-4 pr-6 py-4 rounded-2xl bg-white/10 backdrop-blur-3xl border border-white/20 shadow-2xl saturate-[180%]"
                        >
                            {/* Mono Icon Orb */}
                            <div className="relative flex items-center justify-center w-10 h-10 rounded-full bg-white text-black shadow-2xl">
                                <RefreshCw size={16} className="animate-[spin_3s_linear_infinite]" />
                            </div>

                            {/* Text Content */}
                            <div className="flex flex-col">
                                <span className="text-[12px] font-black text-text-primary uppercase tracking-[0.2em]">Synchronized</span>
                                <span className="text-[9px] text-text-tertiary font-bold uppercase tracking-widest opacity-60">Meeting core updated</span>
                            </div>
                        </motion.div>
                    )
                }
            </AnimatePresence>
            {/* Global Chat Overlay */}
            <GlobalChatOverlay
                isOpen={isGlobalChatOpen}
                onClose={() => {
                    setIsGlobalChatOpen(false);
                    setSubmittedGlobalQuery('');
                }}
                initialQuery={submittedGlobalQuery}
            />
        </div >
    );
};

export default Launcher;
