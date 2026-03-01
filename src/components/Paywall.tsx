/**
 * Paywall — Full-screen overlay shown when trial has expired.
 * Handles the checkout flow: Buy → Listen for Realtime → Instant unlock.
 */
import React, { useState, useCallback } from 'react';

interface PaywallProps {
    onUnlocked: () => void;
}

const Paywall: React.FC<PaywallProps> = ({ onUnlocked }) => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [manualKey, setManualKey] = useState('');
    const [showManualInput, setShowManualInput] = useState(false);
    const [error, setError] = useState('');
    const [status, setStatus] = useState<'idle' | 'waiting' | 'success'>('idle');

    const handleBuy = useCallback(async () => {
        setIsProcessing(true);
        setError('');
        setStatus('waiting');

        try {
            // 1. Initiate checkout (opens Gumroad in browser)
            const { sessionId } = await (window as any).electronAPI.invoke('initiate-checkout');

            // 2. Subscribe and wait for Realtime completion
            const { licenseKey } = await (window as any).electronAPI.invoke('subscribe-checkout', sessionId);

            if (licenseKey) {
                setStatus('success');
                setTimeout(() => onUnlocked(), 1500); // Brief celebration before unlock
            }
        } catch (err: any) {
            setError('Checkout failed. Please try again or enter your license key manually.');
            setStatus('idle');
        } finally {
            setIsProcessing(false);
        }
    }, [onUnlocked]);

    const handleManualActivation = useCallback(async () => {
        if (!manualKey.trim()) return;
        setIsProcessing(true);
        setError('');

        try {
            const { success } = await (window as any).electronAPI.invoke('activate-license', manualKey.trim());
            if (success) {
                setStatus('success');
                setTimeout(() => onUnlocked(), 1500);
            } else {
                setError('Invalid license key. Please check and try again.');
            }
        } catch {
            setError('Activation failed. Please check your internet connection.');
        } finally {
            setIsProcessing(false);
        }
    }, [manualKey, onUnlocked]);

    return (
        <div style={styles.overlay}>
            <div style={styles.container}>
                {status === 'success' ? (
                    <div style={styles.successContainer}>
                        <div style={styles.checkmark}>✅</div>
                        <h1 style={styles.successTitle}>Welcome to Ghost Writer Pro!</h1>
                        <p style={styles.successSubtitle}>Your access has been activated.</p>
                    </div>
                ) : (
                    <>
                        <div style={styles.logoSection}>
                            <h1 style={styles.title}>Ghost Writer</h1>
                            <p style={styles.subtitle}>The beta period has ended</p>
                        </div>

                        <div style={styles.features}>
                            <div style={styles.feature}>
                                <span style={styles.featureIcon}>🎙️</span>
                                <span>Real-time AI transcription</span>
                            </div>
                            <div style={styles.feature}>
                                <span style={styles.featureIcon}>🧠</span>
                                <span>Smart meeting summaries</span>
                            </div>
                            <div style={styles.feature}>
                                <span style={styles.featureIcon}>🔒</span>
                                <span>100% local & private processing</span>
                            </div>
                            <div style={styles.feature}>
                                <span style={styles.featureIcon}>♾️</span>
                                <span>Lifetime access — one payment</span>
                            </div>
                        </div>

                        <button
                            style={{
                                ...styles.buyButton,
                                ...(isProcessing ? styles.buyButtonDisabled : {}),
                            }}
                            onClick={handleBuy}
                            disabled={isProcessing}
                        >
                            {status === 'waiting'
                                ? '⏳ Waiting for payment...'
                                : '🚀 Get Lifetime License — $9'}
                        </button>

                        {status === 'waiting' && (
                            <p style={styles.waitingText}>
                                Complete the purchase in your browser. This page will unlock automatically.
                            </p>
                        )}

                        {error && <p style={styles.error}>{error}</p>}

                        <div style={styles.manualSection}>
                            {showManualInput ? (
                                <div style={styles.manualInputRow}>
                                    <input
                                        type="text"
                                        placeholder="Enter license key..."
                                        value={manualKey}
                                        onChange={(e) => setManualKey(e.target.value)}
                                        style={styles.manualInput}
                                        onKeyDown={(e) => e.key === 'Enter' && handleManualActivation()}
                                    />
                                    <button
                                        style={styles.activateButton}
                                        onClick={handleManualActivation}
                                        disabled={isProcessing || !manualKey.trim()}
                                    >
                                        Activate
                                    </button>
                                </div>
                            ) : (
                                <button
                                    style={styles.manualToggle}
                                    onClick={() => setShowManualInput(true)}
                                >
                                    Already have a license?
                                </button>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

const styles: Record<string, React.CSSProperties> = {
    overlay: {
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a3e 50%, #0f0f23 100%)',
        backdropFilter: 'blur(20px)',
    },
    container: {
        maxWidth: 480,
        width: '100%',
        padding: '48px 40px',
        textAlign: 'center' as const,
    },
    logoSection: {
        marginBottom: 32,
    },
    title: {
        fontSize: 36,
        fontWeight: 800,
        color: '#fff',
        margin: '0 0 8px 0',
        letterSpacing: '-0.5px',
    },
    subtitle: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.6)',
        margin: 0,
    },
    features: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 12,
        marginBottom: 32,
        textAlign: 'left' as const,
    },
    feature: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontSize: 15,
        color: 'rgba(255,255,255,0.85)',
        padding: '10px 16px',
        background: 'rgba(255,255,255,0.05)',
        borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.08)',
    },
    featureIcon: {
        fontSize: 20,
        width: 28,
        textAlign: 'center' as const,
    },
    buyButton: {
        width: '100%',
        padding: '16px 24px',
        fontSize: 18,
        fontWeight: 700,
        color: '#fff',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        border: 'none',
        borderRadius: 12,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        marginBottom: 12,
    },
    buyButtonDisabled: {
        opacity: 0.6,
        cursor: 'not-allowed',
    },
    waitingText: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.5)',
        margin: '8px 0 0 0',
    },
    error: {
        fontSize: 13,
        color: '#ff6b6b',
        margin: '8px 0 0 0',
    },
    manualSection: {
        marginTop: 24,
    },
    manualToggle: {
        background: 'none',
        border: 'none',
        color: 'rgba(255,255,255,0.4)',
        fontSize: 13,
        cursor: 'pointer',
        textDecoration: 'underline',
    },
    manualInputRow: {
        display: 'flex',
        gap: 8,
    },
    manualInput: {
        flex: 1,
        padding: '10px 14px',
        fontSize: 14,
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 8,
        color: '#fff',
        outline: 'none',
    },
    activateButton: {
        padding: '10px 18px',
        fontSize: 14,
        fontWeight: 600,
        color: '#fff',
        background: '#667eea',
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
    },
    successContainer: {
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        gap: 16,
    },
    checkmark: {
        fontSize: 64,
        animation: 'fadeIn 0.5s ease',
    },
    successTitle: {
        fontSize: 28,
        fontWeight: 800,
        color: '#fff',
        margin: 0,
    },
    successSubtitle: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.6)',
        margin: 0,
    },
};

export default Paywall;
