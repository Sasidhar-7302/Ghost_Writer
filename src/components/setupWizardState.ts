export interface SetupWizardGpuStatus {
    success: boolean;
    info?: {
        name?: string;
        vramGB?: number;
    };
    error?: string;
}

export interface SetupWizardOllamaStatus {
    success: boolean;
    running: boolean;
    models?: Array<{ name?: string }>;
    error?: string;
}

export interface SetupWizardWhisperStatus {
    hasBinary: boolean;
    hasModel: boolean;
    hasOperationalServer?: boolean;
    isDownloading: boolean;
    selectedModel: string;
}

export interface SetupWizardFullPrivacyStatus {
    enabled: boolean;
    localWhisperReady: boolean;
    localWhisperModelReady: boolean;
    ollamaReachable: boolean;
    localTextModelReady: boolean;
    localVisionModelReady: boolean;
    activeOllamaModel: string;
    errors: string[];
}

export interface SetupWizardSystemInfo {
    gpu: SetupWizardGpuStatus | null;
    ollama: SetupWizardOllamaStatus | null;
    whisper: SetupWizardWhisperStatus | null;
    fullPrivacy: SetupWizardFullPrivacyStatus | null;
}

export function getRecommendedWhisperModel(vramGB: number | undefined, currentModel: string): string {
    if (typeof vramGB !== 'number' || Number.isNaN(vramGB)) {
        return currentModel;
    }

    if (vramGB >= 4) return 'small-tdrz';
    if (vramGB > 0) return 'base';

    return currentModel;
}

export function hasCompletedDiagnosis(systemInfo: SetupWizardSystemInfo): boolean {
    return Boolean(
        systemInfo.gpu &&
        systemInfo.ollama &&
        systemInfo.whisper &&
        systemInfo.fullPrivacy
    );
}

export function isBlockedByFullPrivacy(systemInfo: SetupWizardSystemInfo): boolean {
    const status = systemInfo.fullPrivacy;
    if (!status?.enabled) {
        return false;
    }

    return (
        !status.localWhisperReady ||
        !status.localWhisperModelReady ||
        !status.ollamaReachable ||
        !status.localTextModelReady
    );
}

export function canProceedFromDiagnosis(systemInfo: SetupWizardSystemInfo): boolean {
    if (!hasCompletedDiagnosis(systemInfo)) {
        return false;
    }

    if (!systemInfo.fullPrivacy?.enabled) {
        return true;
    }

    if (systemInfo.whisper?.isDownloading) {
        return false;
    }

    return !isBlockedByFullPrivacy(systemInfo);
}
