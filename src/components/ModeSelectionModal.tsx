import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    X, Briefcase, Users, CheckCircle2, AlertCircle, 
    ArrowRight, Info, FileText, ClipboardList 
} from 'lucide-react';

interface ModeSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (mode: 'interview' | 'meeting') => void;
}

const ModeSelectionModal: React.FC<ModeSelectionModalProps> = ({ isOpen, onClose, onConfirm }) => {
    const [selectedMode, setSelectedMode] = useState<'interview' | 'meeting'>('interview');
    const [status, setStatus] = useState({
        resume: false,
        jd: false,
        project: false,
        agenda: false
    });

    useEffect(() => {
        if (isOpen) {
            // Check data readiness
            window.electronAPI.getContextDocuments().then((docs: any) => {
                setStatus({
                    resume: !!docs.resumeText?.trim(),
                    jd: !!docs.jdText?.trim(),
                    project: !!docs.projectText?.trim(),
                    agenda: !!docs.agendaText?.trim()
                });
                
                // Set initial mode based on what's stored or default
                if (docs.isMeetingMode) {
                    setSelectedMode('meeting');
                } else {
                    setSelectedMode('interview');
                }
            });
        }
    }, [isOpen]);

    const handleConfirm = async () => {
        const isMeeting = selectedMode === 'meeting';
        await window.electronAPI.setMeetingMode(isMeeting);
        onConfirm(selectedMode);
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
                {/* Backdrop */}
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-black/60 backdrop-blur-md"
                />

                {/* Modal Container */}
                <motion.div 
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    className="relative w-full max-w-2xl bg-bg-primary/80 border border-white/10 rounded-3xl shadow-2xl overflow-hidden backdrop-blur-2xl"
                >
                    {/* Header */}
                    <div className="p-8 pb-4 flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-text-primary tracking-tight">Select Session Mode</h2>
                            <p className="text-sm text-text-tertiary mt-1">Ghost Writer works best when grounded in your context.</p>
                        </div>
                        <button 
                            onClick={onClose}
                            className="p-2 hover:bg-white/5 rounded-full text-text-tertiary hover:text-text-primary transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    <div className="p-8 pt-4 space-y-8">
                        {/* Mode Selection Grid */}
                        <div className="grid grid-cols-2 gap-4">
                            {/* Interview Card */}
                            <button 
                                onClick={() => setSelectedMode('interview')}
                                className={`group relative p-6 rounded-2xl border-2 transition-all duration-300 text-left ${
                                    selectedMode === 'interview' 
                                    ? 'bg-accent-primary/10 border-accent-primary shadow-[0_0_20px_rgba(var(--accent-primary-rgb),0.2)]' 
                                    : 'bg-white/5 border-transparent hover:border-white/20'
                                }`}
                            >
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110 ${
                                    selectedMode === 'interview' ? 'bg-accent-primary text-black' : 'bg-white/10 text-text-secondary'
                                }`}>
                                    <Briefcase size={24} />
                                </div>
                                <h3 className="text-lg font-bold text-text-primary mb-1">Interview Mode</h3>
                                <p className="text-xs text-text-tertiary leading-relaxed mb-4">
                                    Optimized for job interviews. References your Resume and Job Description.
                                </p>
                                
                                {/* Status Indicator */}
                                <div className="space-y-2 pt-2 border-t border-white/5">
                                    <StatusRow icon={<FileText size={12} />} label="Resume" exists={status.resume} />
                                    <StatusRow icon={<ClipboardList size={12} />} label="Job Description" exists={status.jd} />
                                </div>
                            </button>

                            {/* Meeting Card */}
                            <button 
                                onClick={() => setSelectedMode('meeting')}
                                className={`group relative p-6 rounded-2xl border-2 transition-all duration-300 text-left ${
                                    selectedMode === 'meeting' 
                                    ? 'bg-emerald-500/10 border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.2)]' 
                                    : 'bg-white/5 border-transparent hover:border-white/20'
                                }`}
                            >
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110 ${
                                    selectedMode === 'meeting' ? 'bg-emerald-500 text-white' : 'bg-white/10 text-text-secondary'
                                }`}>
                                    <Users size={24} />
                                </div>
                                <h3 className="text-lg font-bold text-text-primary mb-1">Meeting Mode</h3>
                                <p className="text-xs text-text-tertiary leading-relaxed mb-4">
                                    Collaborative teamwork. Uses Project Knowledge and Agenda.
                                </p>

                                {/* Status Indicator */}
                                <div className="space-y-2 pt-2 border-t border-white/5">
                                    <StatusRow icon={<CheckCircle2 size={12} />} label="Project Context" exists={status.project} />
                                    <StatusRow icon={<Info size={12} />} label="Meeting Agenda" exists={status.agenda} />
                                </div>
                            </button>
                        </div>

                        {/* Recommendation Banner */}
                        <DataWarning mode={selectedMode} status={status} />

                        {/* Footer Actions */}
                        <div className="flex items-center justify-end gap-3 pt-4">
                            <button 
                                onClick={onClose}
                                className="px-6 py-2.5 rounded-xl text-sm font-bold text-text-tertiary hover:text-text-primary transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleConfirm}
                                className={`px-8 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest flex items-center gap-2 shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98] ${
                                    selectedMode === 'interview' 
                                    ? 'bg-white text-black hover:bg-white/90' 
                                    : 'bg-emerald-500 text-white hover:bg-emerald-400'
                                }`}
                            >
                                Start session
                                <ArrowRight size={16} />
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

const StatusRow: React.FC<{ icon: React.ReactNode, label: string, exists: boolean }> = ({ icon, label, exists }) => (
    <div className="flex items-center justify-between text-[10px] uppercase font-black tracking-widest">
        <div className="flex items-center gap-2 text-text-tertiary">
            {icon}
            <span>{label}</span>
        </div>
        {exists ? (
            <span className="text-emerald-400">Ready</span>
        ) : (
            <span className="text-orange-400/60">Missing</span>
        )}
    </div>
);

const DataWarning: React.FC<{ mode: 'interview' | 'meeting', status: any }> = ({ mode, status }) => {
    const isMissingData = mode === 'interview' 
        ? (!status.resume || !status.jd) 
        : (!status.project || !status.agenda);

    if (!isMissingData) return (
        <div className="flex items-start gap-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle2 size={18} className="text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-300 leading-relaxed font-medium">
                Perfect! You have all documents ready for this {mode}. Ghost Writer will provide highly grounded, intelligent answers.
            </p>
        </div>
    );

    return (
        <div className="flex items-start gap-4 p-4 rounded-xl bg-orange-500/10 border border-orange-500/20">
            <AlertCircle size={18} className="text-orange-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
                <p className="text-xs text-orange-300 leading-relaxed font-bold">
                    Heads up: Some context is missing.
                </p>
                <p className="text-[11px] text-orange-200/70 leading-relaxed">
                    While Ghost Writer will still work, providing your {mode === 'interview' ? 'Resume/JD' : 'Project Knowledge/Agenda'} significantly improves the quality and grounding of AI responses.
                </p>
            </div>
        </div>
    );
};

export default ModeSelectionModal;
