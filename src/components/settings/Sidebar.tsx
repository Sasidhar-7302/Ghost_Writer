import React from 'react';
import { Monitor, Cpu, Info, FileText, Mic, Keyboard, Terminal, FlaskConical, Briefcase, ClipboardList } from 'lucide-react';

interface SidebarProps {
    activeTab: 'general' | 'ai-providers' | 'interview' | 'meeting' | 'about' | 'context' | 'audio' | 'keybinds';
    setActiveTab: (tab: 'general' | 'ai-providers' | 'interview' | 'meeting' | 'about' | 'context' | 'audio' | 'keybinds') => void;
    onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, onClose }) => {
    return (
        <div className="w-64 bg-bg-sidebar flex flex-col border-r border-border-subtle h-full">
            <div className="p-6">
                <h2 className="font-semibold text-text-tertiary text-xs uppercase tracking-wider mb-4">Advanced Settings</h2>
                <nav className="space-y-1">
                    <button
                        onClick={() => setActiveTab('general')}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-3 ${activeTab === 'general' ? 'bg-bg-item-active text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-bg-item-active/50'}`}
                    >
                        <Monitor size={16} /> General
                    </button>
                    <button
                        onClick={() => setActiveTab('ai-providers')}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-3 ${activeTab === 'ai-providers' ? 'bg-bg-item-active text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-bg-item-active/50'}`}
                    >
                        <FlaskConical size={16} /> AI Providers
                    </button>
                    <button
                        onClick={() => setActiveTab('interview')}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-3 ${activeTab === 'interview' ? 'bg-bg-item-active text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-bg-item-active/50'}`}
                    >
                        <Briefcase size={16} /> Interview
                    </button>
                    <button
                        onClick={() => setActiveTab('meeting')}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-3 ${activeTab === 'meeting' ? 'bg-bg-item-active text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-bg-item-active/50'}`}
                    >
                        <ClipboardList size={16} /> Meetings
                    </button>
                    <button
                        onClick={() => setActiveTab('audio')}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-3 ${activeTab === 'audio' ? 'bg-bg-item-active text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-bg-item-active/50'}`}
                    >
                        <Mic size={16} /> Audio
                    </button>
                    <button
                        onClick={() => setActiveTab('keybinds')}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-3 ${activeTab === 'keybinds' ? 'bg-bg-item-active text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-bg-item-active/50'}`}
                    >
                        <Keyboard size={16} /> Keybinds
                    </button>
                    <button
                        onClick={() => setActiveTab('about')}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-3 ${activeTab === 'about' ? 'bg-bg-item-active text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-bg-item-active/50'}`}
                    >
                        <Info size={16} /> About
                    </button>
                    {/* Add more tabs as needed */}
                </nav>
            </div>

            <div className="mt-auto p-6 border-t border-border-subtle">
                <button
                    onClick={onClose}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-bg-item-active/50 transition-colors flex items-center gap-3"
                >
                    Close
                </button>
            </div>
        </div>
    );
};
