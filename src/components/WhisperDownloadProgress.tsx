import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Loader2, Check, X, Cpu } from 'lucide-react';

interface WhisperStatus {
    hasBinary: boolean;
    hasModel: boolean;
    isDownloading: boolean;
    selectedModel: string;
    progress: number;
    downloadingModel: string | null;
}

export const WhisperDownloadProgress: React.FC = () => {
    const [status, setStatus] = useState<WhisperStatus | null>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const checkStatus = async () => {
            if (window.electronAPI?.getWhisperStatus) {
                const s = await window.electronAPI.getWhisperStatus();
                setStatus(s as any);
                if (s.isDownloading) {
                    setIsVisible(true);
                }
            }
        };

        checkStatus();

        // Listen for progress events
        const removeListener = window.electronAPI?.onWhisperDownloadProgress?.((data: { model: string; progress: number }) => {
            setStatus(prev => {
                const newStatus = prev ? {
                    ...prev,
                    isDownloading: data.progress < 100,
                    downloadingModel: data.progress < 100 ? data.model : null,
                    progress: data.progress,
                } : {
                    hasBinary: false,
                    hasModel: false,
                    isDownloading: data.progress < 100,
                    selectedModel: 'small',
                    progress: data.progress,
                    downloadingModel: data.model
                };

                if (data.progress < 100) {
                    setIsVisible(true);
                }
                return newStatus;
            });

            if (data.progress >= 100) {
                // Keep visible for a bit after completion
                setTimeout(() => {
                    checkStatus(); // Refresh full status
                    setTimeout(() => setIsVisible(false), 3000);
                }, 500);
            }
        });

        return () => removeListener?.();
    }, []);

    if (!status || !isVisible || !status.isDownloading) {
        // Return null if not downloading, but we might want to show "Complete" briefly
        if (isVisible && status && !status.isDownloading && status.progress >= 100) {
            // Show complete state
        } else {
            return null;
        }
    }

    const modelName = status.downloadingModel === 'binary' ? 'Whisper Engine' : `Whisper ${status.downloadingModel || status.selectedModel} model`;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="fixed bottom-6 right-6 z-[100] w-72 bg-bg-card border border-border-subtle rounded-2xl shadow-2xl p-4 backdrop-blur-xl"
            >
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-accent-primary/10 flex items-center justify-center text-accent-primary">
                        {status.progress >= 100 ? <Check size={20} /> : <Download size={20} className="animate-bounce" />}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold text-text-primary truncate">
                            {status.progress >= 100 ? 'Download Complete' : 'Downloading Components'}
                        </h4>
                        <p className="text-[11px] text-text-secondary truncate italic">
                            {modelName}
                        </p>
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
                        <span className="text-text-tertiary">Progress</span>
                        <span className="text-accent-primary">{status.progress}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-bg-input rounded-full overflow-hidden">
                        <motion.div
                            className="h-full bg-accent-primary"
                            initial={{ width: 0 }}
                            animate={{ width: `${status.progress}%` }}
                            transition={{ duration: 0.5 }}
                        />
                    </div>
                </div>

                {status.progress < 100 && (
                    <div className="mt-3 flex items-center gap-2 text-[10px] text-text-tertiary">
                        <Loader2 size={12} className="animate-spin" />
                        <span>Please keep Ghost Writer open...</span>
                    </div>
                )}
            </motion.div>
        </AnimatePresence>
    );
};
