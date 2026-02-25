import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ArrowRight, ArrowLeft, Key, Mic, Brain, FileText, Sparkles } from 'lucide-react';

interface SetupWizardProps {
    onComplete: () => void;
}

interface SetupStep {
    id: string;
    title: string;
    description: string;
    icon: React.ReactNode;
    required: boolean;
}

const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete }) => {
    const [currentStep, setCurrentStep] = useState(0);
    const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
    const [apiKeys, setApiKeys] = useState({
        groq: '',
        openai: '',
        claude: '',
        deepseek: ''
    });

    const steps: SetupStep[] = [
        {
            id: 'welcome',
            title: 'Welcome to Ghost Writer',
            description: 'Your AI interview assistant is ready to help. Let\'s get you set up in just a few steps.',
            icon: <Sparkles className="w-6 h-6" />,
            required: true
        },
        {
            id: 'api-keys',
            title: 'AI Provider Setup',
            description: 'Add an API key to power your AI responses, or skip if you plan to use a local model like Ollama.',
            icon: <Key className="w-6 h-6" />,
            required: false
        },
        {
            id: 'microphone',
            title: 'Audio Setup',
            description: 'Ghost Writer will use your system audio to listen to conversations. Make sure your microphone is working.',
            icon: <Mic className="w-6 h-6" />,
            required: false
        },
        {
            id: 'context',
            title: 'Context Documents (Optional)',
            description: 'Upload your resume and job description for personalized, context-aware responses.',
            icon: <FileText className="w-6 h-6" />,
            required: false
        },
        {
            id: 'ready',
            title: 'You\'re All Set!',
            description: 'Ghost Writer is configured and ready to help with your interviews.',
            icon: <Brain className="w-6 h-6" />,
            required: true
        }
    ];

    const handleNext = async () => {
        if (currentStep === 1) {
            // Save API keys
            const promises = [];
            if (apiKeys.groq) promises.push(window.electronAPI.setGroqApiKey(apiKeys.groq));
            if (apiKeys.openai) promises.push(window.electronAPI.setOpenaiApiKey(apiKeys.openai));
            if (apiKeys.claude) promises.push(window.electronAPI.setClaudeApiKey(apiKeys.claude));
            if (apiKeys.deepseek) promises.push(window.electronAPI.setDeepseekApiKey(apiKeys.deepseek));

            try {
                await Promise.all(promises);
                setCompletedSteps(prev => new Set([...prev, currentStep]));
            } catch (error) {
                console.error('Failed to save API keys:', error);
                return;
            }
        }

        if (currentStep < steps.length - 1) {
            setCurrentStep(currentStep + 1);
            setCompletedSteps(prev => new Set([...prev, currentStep]));
        } else {
            // Mark setup as complete
            localStorage.setItem('setupComplete', 'true');
            onComplete();
        }
    };

    const handleBack = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        }
    };

    const canProceed = () => {
        switch (currentStep) {
            case 1: // API Keys
                return true; // API keys are now optional (can use Ollama)
            default:
                return true;
        }
    };

    const renderStepContent = () => {
        switch (currentStep) {
            case 0: // Welcome
                return (
                    <div className="text-center space-y-6">
                        <div className="w-20 h-20 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto">
                            <Sparkles className="w-10 h-10 text-blue-400" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-white mb-2">Welcome to Ghost Writer</h2>
                            <p className="text-gray-300 text-lg">
                                Your invisible AI assistant for high-stakes interviews and meetings.
                                Get real-time suggestions while staying undetected in screen shares.
                            </p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
                            <div className="bg-gray-800/50 rounded-lg p-4">
                                <Mic className="w-8 h-8 text-green-400 mx-auto mb-2" />
                                <h3 className="font-semibold text-white">Real-time Listening</h3>
                                <p className="text-gray-400 text-sm">Captures conversations automatically</p>
                            </div>
                            <div className="bg-gray-800/50 rounded-lg p-4">
                                <Brain className="w-8 h-8 text-purple-400 mx-auto mb-2" />
                                <h3 className="font-semibold text-white">AI-Powered Responses</h3>
                                <p className="text-gray-400 text-sm">Context-aware suggestions</p>
                            </div>
                            <div className="bg-gray-800/50 rounded-lg p-4">
                                <FileText className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                                <h3 className="font-semibold text-white">Invisible Overlay</h3>
                                <p className="text-gray-400 text-sm">Undetectable in screen shares</p>
                            </div>
                        </div>
                    </div>
                );

            case 1: // API Keys
                return (
                    <div className="space-y-6">
                        <div className="text-center">
                            <h2 className="text-2xl font-bold text-white mb-2">Set Up AI Providers</h2>
                            <p className="text-gray-300">
                                Add API keys for cloud providers (optional if using local Ollama).
                            </p>
                        </div>

                        <div className="space-y-4 max-w-md mx-auto">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Groq API Key (Recommended - Free)
                                </label>
                                <input
                                    type="password"
                                    value={apiKeys.groq}
                                    onChange={(e) => setApiKeys(prev => ({ ...prev, groq: e.target.value }))}
                                    placeholder="gsk_..."
                                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                                />
                                <p className="text-xs text-gray-400 mt-1">
                                    Get your free API key at <a href="https://console.groq.com" className="text-blue-400 hover:underline">console.groq.com</a>
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    OpenAI API Key (Optional)
                                </label>
                                <input
                                    type="password"
                                    value={apiKeys.openai}
                                    onChange={(e) => setApiKeys(prev => ({ ...prev, openai: e.target.value }))}
                                    placeholder="sk-..."
                                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Claude API Key (Optional)
                                </label>
                                <input
                                    type="password"
                                    value={apiKeys.claude}
                                    onChange={(e) => setApiKeys(prev => ({ ...prev, claude: e.target.value }))}
                                    placeholder="sk-ant-..."
                                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    DeepSeek API Key (Optional)
                                </label>
                                <input
                                    type="password"
                                    value={apiKeys.deepseek}
                                    onChange={(e) => setApiKeys(prev => ({ ...prev, deepseek: e.target.value }))}
                                    placeholder="sk-..."
                                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                                />
                            </div>
                        </div>

                        {!apiKeys.groq && !apiKeys.openai && !apiKeys.claude && !apiKeys.deepseek && (
                            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                                <p className="text-blue-400 text-sm">
                                    No cloud keys added. You can configure Ollama in Settings after setup.
                                </p>
                            </div>
                        )}
                    </div>
                );

            case 2: // Microphone
                return (
                    <div className="text-center space-y-6">
                        <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
                            <Mic className="w-10 h-10 text-green-400" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-white mb-2">Audio Setup</h2>
                            <p className="text-gray-300 text-lg">
                                Ghost Writer uses system audio capture to listen to your conversations.
                                Make sure your microphone and speakers are working properly.
                            </p>
                        </div>
                        <div className="bg-gray-800/50 rounded-lg p-6 max-w-md mx-auto">
                            <h3 className="font-semibold text-white mb-2">What happens next:</h3>
                            <ul className="text-left text-gray-300 space-y-2">
                                <li>• Ghost Writer captures system audio automatically</li>
                                <li>• No need to select specific microphones</li>
                                <li>• Works with any audio setup (Zoom, Teams, etc.)</li>
                                <li>• Your privacy is protected - audio stays local</li>
                            </ul>
                        </div>
                    </div>
                );

            case 3: // Context Documents
                return (
                    <div className="text-center space-y-6">
                        <div className="w-20 h-20 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto">
                            <FileText className="w-10 h-10 text-blue-400" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-white mb-2">Context Documents (Optional)</h2>
                            <p className="text-gray-300 text-lg">
                                Upload your resume and the job description to get personalized,
                                context-aware responses during interviews.
                            </p>
                        </div>
                        <div className="bg-gray-800/50 rounded-lg p-6 max-w-md mx-auto">
                            <h3 className="font-semibold text-white mb-2">Benefits:</h3>
                            <ul className="text-left text-gray-300 space-y-2">
                                <li>• Answers tailored to your experience</li>
                                <li>• References specific job requirements</li>
                                <li>• More relevant and compelling responses</li>
                                <li>• Can be added later in Settings</li>
                            </ul>
                        </div>
                    </div>
                );

            case 4: // Ready
                return (
                    <div className="text-center space-y-6">
                        <div className="w-20 h-20 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto">
                            <Check className="w-10 h-10 text-purple-400" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-white mb-2">You're All Set!</h2>
                            <p className="text-gray-300 text-lg">
                                Ghost Writer is configured and ready to help with your interviews.
                                Click "Get Started" to begin.
                            </p>
                        </div>
                        <div className="bg-gray-800/50 rounded-lg p-6 max-w-md mx-auto">
                            <h3 className="font-semibold text-white mb-2">Quick Start:</h3>
                            <ol className="text-left text-gray-300 space-y-2">
                                <li>1. Click "Start Meeting" in the launcher</li>
                                <li>2. Join your interview/meeting</li>
                                <li>3. Ghost Writer will appear as an invisible overlay</li>
                                <li>4. Get real-time AI suggestions</li>
                            </ol>
                        </div>
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-gray-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden"
            >
                {/* Progress Bar */}
                <div className="bg-gray-800 px-6 py-4">
                    <div className="flex items-center justify-between mb-2">
                        {steps.map((step, index) => (
                            <div key={step.id} className="flex items-center">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${index < currentStep || completedSteps.has(index)
                                        ? 'bg-blue-500 text-white'
                                        : index === currentStep
                                            ? 'bg-blue-500/20 text-blue-400 border-2 border-blue-500'
                                            : 'bg-gray-700 text-gray-400'
                                    }`}>
                                    {completedSteps.has(index) ? <Check className="w-4 h-4" /> : index + 1}
                                </div>
                                {index < steps.length - 1 && (
                                    <div className={`w-12 h-0.5 mx-2 ${index < currentStep ? 'bg-blue-500' : 'bg-gray-700'
                                        }`} />
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div className="px-6 py-8 overflow-y-auto max-h-[60vh]">
                    {renderStepContent()}
                </div>

                {/* Footer */}
                <div className="bg-gray-800 px-6 py-4 flex items-center justify-between">
                    <button
                        onClick={handleBack}
                        disabled={currentStep === 0}
                        className="flex items-center gap-2 px-4 py-2 text-gray-300 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back
                    </button>

                    <button
                        onClick={handleNext}
                        disabled={!canProceed()}
                        className="flex items-center gap-2 px-6 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 text-white rounded-lg font-medium disabled:cursor-not-allowed"
                    >
                        {currentStep === steps.length - 1 ? 'Get Started' : 'Next'}
                        {currentStep < steps.length - 1 && <ArrowRight className="w-4 h-4" />}
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

export default SetupWizard;