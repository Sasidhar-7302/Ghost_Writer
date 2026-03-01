/**
 * TrialBanner — Slim top banner shown during the trial period.
 * Displays remaining days and a subtle "Buy" CTA.
 */
import React from 'react';

interface TrialBannerProps {
    remainingDays: number;
    onBuyClick: () => void;
}

const TrialBanner: React.FC<TrialBannerProps> = ({ remainingDays, onBuyClick }) => {
    const daysText = remainingDays <= 1
        ? 'Less than 1 day'
        : `${Math.ceil(remainingDays)} days`;

    return (
        <div style={styles.banner}>
            <span style={styles.text}>
                ⏰ {daysText} left in your free trial
            </span>
            <button style={styles.button} onClick={onBuyClick}>
                Get Lifetime License — $10
            </button>
        </div>
    );
};

const styles: Record<string, React.CSSProperties> = {
    banner: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: '8px 16px',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: '#fff',
        fontSize: 13,
        fontWeight: 500,
        zIndex: 10000,
        flexShrink: 0,
    },
    text: {
        opacity: 0.9,
    },
    button: {
        padding: '4px 14px',
        fontSize: 12,
        fontWeight: 700,
        color: '#667eea',
        background: '#fff',
        border: 'none',
        borderRadius: 6,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
    },
};

export default TrialBanner;
