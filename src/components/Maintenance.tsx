import React from 'react';
import { motion } from 'framer-motion';

interface MaintenanceProps {
    message?: string;
}

const Maintenance: React.FC<MaintenanceProps> = ({
    message = "Ghost Writer is currently undergoing scheduled maintenance. Please check back later."
}) => {
    return (
        <div className="fixed inset-0 bg-[#0A0A0B] flex flex-col items-center justify-center p-8 text-center overflow-hidden">
            {/* Background Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-purple-500/10 blur-[120px] rounded-full" />

            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="relative z-10 max-w-md w-full"
            >
                {/* Icon */}
                <div className="mb-8 flex justify-center">
                    <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center backdrop-blur-xl shadow-2xl">
                        <svg
                            className="w-10 h-10 text-purple-400 animate-pulse"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1.5}
                                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37a1.724 1.724 0 002.572-1.065z"
                            />
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1.5}
                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                        </svg>
                    </div>
                </div>

                <h1 className="text-3xl font-bold text-white mb-4 tracking-tight">
                    System Update
                </h1>

                <p className="text-zinc-400 text-lg leading-relaxed mb-8">
                    {message}
                </p>

                <div className="flex flex-col gap-4">
                    <div className="px-5 py-3 rounded-full bg-white/5 border border-white/10 text-zinc-500 text-sm font-medium">
                        Service will resume shortly
                    </div>
                    <button
                        onClick={() => window.location.reload()}
                        className="text-purple-400 hover:text-purple-300 text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Retry Connection
                    </button>
                </div>
            </motion.div>

            {/* Footer Branding */}
            <div className="absolute bottom-10 left-0 right-0">
                <span className="text-zinc-600 text-xs font-mono tracking-widest uppercase">
                    Ghost Writer Enterprise Security
                </span>
            </div>
        </div>
    );
};

export default Maintenance;
