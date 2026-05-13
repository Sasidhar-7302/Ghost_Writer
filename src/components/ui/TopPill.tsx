import React, { useState, useEffect } from "react";
import { ChevronUp, ChevronDown, Minus, X, MicOff } from "lucide-react";
import icon from "../icon.ico";

const STT_PROVIDER_LABELS: Record<string, string> = {
    'google': 'Google',
    'groq': 'Groq',
    'openai': 'OpenAI',
    'deepgram': 'Deepgram',
    'elevenlabs': 'ElevenLabs',
    'azure': 'Azure',
    'ibmwatson': 'Watson',
    'local-whisper': 'Whisper',
};

interface TopPillProps {
    expanded: boolean;
    onToggle: () => void;
    onMinimize: () => void;
    onQuit: () => void;
    sttProvider?: string;
    isListeningPaused?: boolean;
    className?: string;
}

export default function TopPill({
    expanded,
    onToggle,
    onMinimize,
    onQuit,
    sttProvider,
    isListeningPaused = false,
    className,
}: TopPillProps) {

    const providerLabel = sttProvider ? (STT_PROVIDER_LABELS[sttProvider] ?? sttProvider) : null;

    return (
        <div className={`flex justify-center mt-2 select-none z-50 ${className ?? ''}`}>
            <div
                className="
          draggable-area
          flex items-center gap-2
          rounded-full
          bg-[#1E1E1E]/68
          backdrop-blur-md
          border border-white/10
          shadow-lg shadow-black/20
          pl-1.5 pr-1.5 py-1.5
          transition-all duration-300 ease-sculpted
          hover:bg-[#1E1E1E]/78 hover:border-white/15 hover:shadow-xl
        "
            >
                {/* LOGO BUTTON */}
                <button
                    className="
            w-8 h-8
            rounded-full
            bg-white/5
            flex items-center justify-center
            relative overflow-hidden
            interaction-base interaction-press
            hover:bg-white/5
          "
                >
                    <img
                        src={icon}
                        alt="Ghost Writer"
                        className="w-[24px] h-[24px] object-contain opacity-90 scale-105"
                        draggable="false"
                        onDragStart={(e) => e.preventDefault()}
                    />
                </button>

                {/* CENTER SEGMENT */}
                <button
                    onClick={onToggle}
                    className="
            flex items-center gap-2
            group
            px-4 py-1.5
            rounded-full
            bg-white/5
            text-[12px]
            font-medium
            text-slate-200
            border border-white/0
            interaction-base interaction-hover interaction-press
            hover:bg-bg-item-surface hover:border-border-subtle hover:text-text-primary
          "
                >
                    <span className="opacity-70 group-hover:opacity-100 transition-opacity duration-200">
                        {expanded ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                        )}
                    </span>
                    <span className="tracking-wide opacity-80 group-hover:opacity-100">{expanded ? "Hide" : "Show"}</span>
                </button>

                {/* STT PROVIDER BADGE */}
                {providerLabel && (
                    <div
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold select-none transition-colors
                            ${isListeningPaused
                                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                : 'bg-white/5 text-slate-400 border border-white/10'}`}
                        title={isListeningPaused ? 'Listening paused (Ctrl+Shift+M to resume)' : `STT: ${providerLabel}`}
                    >
                        {isListeningPaused && <MicOff className="w-2.5 h-2.5" />}
                        <span>{isListeningPaused ? 'PAUSED' : providerLabel}</span>
                    </div>
                )}

                {/* STOP / QUIT BUTTON */}
                <button
                    onClick={onMinimize}
                    className="
            w-8 h-8
            rounded-full
            bg-white/5
            flex items-center justify-center
            text-text-primary
            interaction-base interaction-press
            hover:bg-white/10 hover:text-white
          "
                    title="Minimize"
                >
                    <Minus className="w-3.5 h-3.5 opacity-80" />
                </button>

                <button
                    onClick={onQuit}
                    className="
            w-8 h-8
            rounded-full
            bg-white/5
            flex items-center justify-center
            text-text-primary
            interaction-base interaction-press
            hover:bg-red-500/10 hover:text-red-400
          "
                    title="Close session"
                >
                    <X className="w-3.5 h-3.5 opacity-80" />
                </button>
            </div>
        </div>
    );
}
