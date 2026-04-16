/**
 * CredentialsManager - Secure storage for API keys and service account paths
 * Uses Electron's safeStorage API for encryption at rest
 */

import { app, safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';
import { launchConfig } from '../config/launchConfig';
import { normalizePromptSettings } from '../llm/promptRegistry';
import type { LicenseVerificationRecord, PromptMode, PromptSettings, PromptSettingsMap } from '../llm/promptTypes';
import { logger } from '../utils/logger';

const log = logger.createChild('CredentialsManager');

function getCredentialsPath(): string {
    return path.join(app.getPath('userData'), 'credentials.enc');
}

export interface CustomProvider {
    id: string;
    name: string;
    curlCommand: string;
}

export interface StoredCredentials {
    geminiApiKey?: string;
    groqApiKey?: string;
    openaiApiKey?: string;
    claudeApiKey?: string;
    nvidiaApiKey?: string;
    deepseekApiKey?: string;
    googleServiceAccountPath?: string;
    customProviders?: CustomProvider[];
    // STT Provider settings
    sttProvider?: 'google' | 'groq' | 'openai' | 'deepgram' | 'elevenlabs' | 'azure' | 'ibmwatson' | 'local-whisper';
    groqSttApiKey?: string;
    groqSttModel?: string;
    openAiSttApiKey?: string;
    deepgramApiKey?: string;
    elevenLabsApiKey?: string;
    azureApiKey?: string;
    azureRegion?: string;
    ibmWatsonApiKey?: string;
    ibmWatsonRegion?: string;
    // Context documents
    resumePath?: string;
    jobDescriptionText?: string;
    // Customizable Prompts
    interviewPrompt?: string;
    meetingPrompt?: string;
    promptSettings?: Partial<PromptSettingsMap>;
    isMeetingMode?: boolean;
    telemetryEnabled?: boolean;
    // Local Whisper Manual Paths
    localWhisperBinaryPath?: string;
    localWhisperModelPath?: string;
    localWhisperModel?: string;
    // Ollama settings
    ollamaModel?: string;
    // Security
    airGapMode?: boolean;
    fullPrivacyPreviousSttProvider?: 'google' | 'groq' | 'openai' | 'deepgram' | 'elevenlabs' | 'azure' | 'ibmwatson' | 'local-whisper';
    fullPrivacyPreviousModel?: string;
    // Licensing
    gumroadLicenseKey?: string;
    machineId?: string;
    licenseStatus?: 'beta' | 'trial' | 'paid' | 'expired';
    betaRegisteredAt?: string;
    licenseVerificationRecord?: LicenseVerificationRecord;
    modelPreference?: string;
    openrouterApiKey?: string;
    remoteDisplayPin?: string;
}

export class CredentialsManager {
    private static instance: CredentialsManager;
    private credentials: StoredCredentials = {};

    private constructor() {
        // Load on construction after app ready
    }

    public static getInstance(): CredentialsManager {
        if (!CredentialsManager.instance) {
            CredentialsManager.instance = new CredentialsManager();
        }
        return CredentialsManager.instance;
    }

    /**
     * Initialize - load credentials from disk
     * Must be called after app.whenReady()
     */
    public init(): void {
        console.log(`[CredentialsManager] Data path: ${app.getPath('userData')}`);
        console.log(`[CredentialsManager] Loading from: ${getCredentialsPath()}`);
        this.loadCredentials();
        log.info('Initialized');
    }

    // =========================================================================
    // Getters
    // =========================================================================

    public getGeminiApiKey(): string | undefined {
        return this.credentials.geminiApiKey;
    }

    public getGroqApiKey(): string | undefined {
        return this.credentials.groqApiKey;
    }

    public getOpenaiApiKey(): string | undefined {
        return this.credentials.openaiApiKey;
    }

    public getClaudeApiKey(): string | undefined {
        return this.credentials.claudeApiKey;
    }

    public getNvidiaApiKey(): string | undefined {
        return this.credentials.nvidiaApiKey;
    }

    public getDeepseekApiKey(): string | undefined {
        return this.credentials.deepseekApiKey;
    }

    public getOllamaModel(): string | undefined {
        return this.credentials.ollamaModel;
    }

    public getModelPreference(): string | undefined {
        return this.credentials.modelPreference;
    }

    public getOpenrouterApiKey(): string | undefined {
        return this.credentials.openrouterApiKey;
    }

    public getRemoteDisplayPin(): string {
        return this.credentials.remoteDisplayPin || '0000';
    }

    public getResumePath(): string | undefined {
        return this.credentials.resumePath;
    }

    public getJobDescriptionText(): string | undefined {
        return this.credentials.jobDescriptionText;
    }

    public getInterviewPrompt(): string | undefined {
        return this.getPromptSettings().whatToAnswer.fullOverride || this.credentials.interviewPrompt;
    }

    public getMeetingPrompt(): string | undefined {
        return this.getPromptSettings().answer.fullOverride || this.credentials.meetingPrompt;
    }

    public getGoogleServiceAccountPath(): string | undefined {
        return this.credentials.googleServiceAccountPath;
    }

    public getCustomProviders(): CustomProvider[] {
        return this.credentials.customProviders || [];
    }

    public getSttProvider(): 'google' | 'groq' | 'openai' | 'deepgram' | 'elevenlabs' | 'azure' | 'ibmwatson' | 'local-whisper' {
        return this.credentials.sttProvider || 'google';
    }

    public getDeepgramApiKey(): string | undefined {
        return this.credentials.deepgramApiKey;
    }

    public getGroqSttApiKey(): string | undefined {
        return this.credentials.groqSttApiKey;
    }

    public getGroqSttModel(): string {
        return this.credentials.groqSttModel || 'whisper-large-v3-turbo';
    }

    public getOpenAiSttApiKey(): string | undefined {
        return this.credentials.openAiSttApiKey;
    }

    public getElevenLabsApiKey(): string | undefined {
        return this.credentials.elevenLabsApiKey;
    }

    public getAzureApiKey(): string | undefined {
        return this.credentials.azureApiKey;
    }

    public getAzureRegion(): string {
        return this.credentials.azureRegion || 'eastus';
    }

    public getIbmWatsonApiKey(): string | undefined {
        return this.credentials.ibmWatsonApiKey;
    }

    public getIbmWatsonRegion(): string {
        return this.credentials.ibmWatsonRegion || 'us-south';
    }

    public getLocalWhisperBinaryPath(): string | undefined {
        return this.credentials.localWhisperBinaryPath;
    }

    public getLocalWhisperModelPath(): string | undefined {
        return this.credentials.localWhisperModelPath;
    }

    public getIsMeetingMode(): boolean {
        return !!this.credentials.isMeetingMode;
    }

    public getAirGapMode(): boolean {
        return !!this.credentials.airGapMode;
    }

    public getFullPrivacyPreviousSttProvider(): 'google' | 'groq' | 'openai' | 'deepgram' | 'elevenlabs' | 'azure' | 'ibmwatson' | 'local-whisper' | undefined {
        return this.credentials.fullPrivacyPreviousSttProvider;
    }

    public getFullPrivacyPreviousModel(): string | undefined {
        return this.credentials.fullPrivacyPreviousModel;
    }

    public getAllCredentials(): StoredCredentials {
        return { ...this.credentials };
    }

    public getPromptSettings(): PromptSettingsMap {
        return normalizePromptSettings(this.credentials.promptSettings);
    }

    public getTelemetryEnabled(): boolean {
        return this.credentials.telemetryEnabled ?? launchConfig.telemetryDefaultEnabled;
    }

    // License getters
    public getLicenseKey(): string | undefined {
        return this.credentials.gumroadLicenseKey;
    }

    public getMachineId(): string | undefined {
        return this.credentials.machineId;
    }

    public getLicenseStatus(): 'beta' | 'trial' | 'paid' | 'expired' {
        return this.credentials.licenseStatus || (launchConfig.monetizationEnabled ? 'trial' : 'beta');
    }

    public getBetaRegisteredAt(): string | undefined {
        return this.credentials.betaRegisteredAt;
    }

    public getLicenseVerificationRecord(): LicenseVerificationRecord | undefined {
        return this.credentials.licenseVerificationRecord;
    }

    // =========================================================================
    // Setters (auto-save)
    // =========================================================================

    public setGeminiApiKey(key: string): void {
        this.credentials.geminiApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] Gemini API Key updated');
    }

    public setGroqApiKey(key: string): void {
        this.credentials.groqApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] Groq API Key updated');
    }

    public setOpenaiApiKey(key: string): void {
        this.credentials.openaiApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] OpenAI API Key updated');
    }

    public setClaudeApiKey(key: string): void {
        this.credentials.claudeApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] Claude API Key updated');
    }

    public setNvidiaApiKey(key: string): void {
        this.credentials.nvidiaApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] NVIDIA API Key updated');
    }

    public setDeepseekApiKey(key: string): void {
        this.credentials.deepseekApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] DeepSeek API Key updated');
    }

    public setOllamaModel(model: string): void {
        this.credentials.ollamaModel = model;
        this.saveCredentials();
        console.log(`[CredentialsManager] Ollama model set to: \${model}`);
    }

    public setModelPreference(modelId: string): void {
        this.credentials.modelPreference = modelId;
        this.saveCredentials();
        console.log(`[CredentialsManager] Model preference set to: \${modelId}`);
    }

    public setOpenrouterApiKey(key: string): void {
        this.credentials.openrouterApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] OpenRouter API Key updated');
    }

    public setRemoteDisplayPin(pin: string): void {
        this.credentials.remoteDisplayPin = pin;
        this.saveCredentials();
        console.log('[CredentialsManager] Remote Display PIN updated');
    }

    public setResumePath(filePath: string): void {
        this.credentials.resumePath = filePath;
        this.saveCredentials();
        console.log('[CredentialsManager] Resume path updated');
    }

    public setJobDescriptionText(text: string): void {
        this.credentials.jobDescriptionText = text;
        this.saveCredentials();
        console.log('[CredentialsManager] Job Description updated');
    }

    public setInterviewPrompt(prompt: string): void {
        this.updatePromptSetting('whatToAnswer', { fullOverride: prompt.trim() });
        console.log('[CredentialsManager] Interview Prompt updated');
    }

    public setMeetingPrompt(prompt: string): void {
        this.updatePromptSetting('answer', { fullOverride: prompt.trim() });
        console.log('[CredentialsManager] Meeting Prompt updated');
    }

    public setIsMeetingMode(isMeeting: boolean): void {
        this.credentials.isMeetingMode = isMeeting;
        this.saveCredentials();
        console.log(`[CredentialsManager] Meeting Mode set to: \${isMeeting}`);
    }

    public setTelemetryEnabled(enabled: boolean): void {
        this.credentials.telemetryEnabled = enabled;
        this.saveCredentials();
        console.log(`[CredentialsManager] Telemetry enabled set to: \${enabled}`);
    }

    public clearResume(): void {
        this.credentials.resumePath = undefined;
        this.saveCredentials();
        console.log('[CredentialsManager] Resume cleared');
    }

    public clearJobDescription(): void {
        this.credentials.jobDescriptionText = undefined;
        this.saveCredentials();
        console.log('[CredentialsManager] Job Description cleared');
    }

    public setGoogleServiceAccountPath(filePath: string): void {
        this.credentials.googleServiceAccountPath = filePath;
        this.saveCredentials();
        console.log('[CredentialsManager] Google Service Account path updated');
    }

    public setSttProvider(provider: 'google' | 'groq' | 'openai' | 'deepgram' | 'elevenlabs' | 'azure' | 'ibmwatson' | 'local-whisper'): void {
        this.credentials.sttProvider = provider;
        this.saveCredentials();
        console.log(`[CredentialsManager] STT Provider set to: \${provider}`);
    }

    public setDeepgramApiKey(key: string): void {
        this.credentials.deepgramApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] Deepgram API Key updated');
    }

    public setGroqSttApiKey(key: string): void {
        this.credentials.groqSttApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] Groq STT API Key updated');
    }

    public setOpenAiSttApiKey(key: string): void {
        this.credentials.openAiSttApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] OpenAI STT API Key updated');
    }

    public setGroqSttModel(model: string): void {
        this.credentials.groqSttModel = model;
        this.saveCredentials();
        console.log(`[CredentialsManager] Groq STT Model set to: \${model}`);
    }

    public setElevenLabsApiKey(key: string): void {
        this.credentials.elevenLabsApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] ElevenLabs API Key updated');
    }

    public setAzureApiKey(key: string): void {
        this.credentials.azureApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] Azure API Key updated');
    }

    public setAzureRegion(region: string): void {
        this.credentials.azureRegion = region;
        this.saveCredentials();
        console.log(`[CredentialsManager] Azure Region set to: \${region}`);
    }

    public setIbmWatsonApiKey(key: string): void {
        this.credentials.ibmWatsonApiKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] IBM Watson API Key updated');
    }

    public setIbmWatsonRegion(region: string): void {
        this.credentials.ibmWatsonRegion = region;
        this.saveCredentials();
        console.log(`[CredentialsManager] IBM Watson Region set to: \${region}`);
    }

    public setLocalWhisperBinaryPath(path: string): void {
        this.credentials.localWhisperBinaryPath = path;
        this.saveCredentials();
        console.log(`[CredentialsManager] Local Whisper Binary Path set to: \${path}`);
    }

    public setLocalWhisperModelPath(path: string): void {
        this.credentials.localWhisperModelPath = path;
        this.saveCredentials();
        console.log(`[CredentialsManager] Local Whisper Model Path set to: \${path}`);
    }

    public getLocalWhisperModel(): string {
        return this.credentials.localWhisperModel || 'medium';
    }

    public setLocalWhisperModel(model: string): void {
        if (this.credentials.localWhisperModel === model) {
            return;
        }
        this.credentials.localWhisperModel = model;
        this.saveCredentials();
        console.log(`[CredentialsManager] Local Whisper Model set to: \${model}`);
    }

    public setAirGapMode(enabled: boolean): void {
        this.credentials.airGapMode = enabled;
        this.saveCredentials();
        console.log(`[CredentialsManager] Full Privacy Mode set to: \${enabled} (STT: \${this.credentials.sttProvider})`);

        const { BrowserWindow } = require('electron');
        BrowserWindow.getAllWindows().forEach((win: any) => {
            win.webContents.send('air-gap-changed', enabled);
        });
    }

    public setFullPrivacyPreviousSttProvider(provider: 'google' | 'groq' | 'openai' | 'deepgram' | 'elevenlabs' | 'azure' | 'ibmwatson' | 'local-whisper'): void {
        this.credentials.fullPrivacyPreviousSttProvider = provider;
        this.saveCredentials();
    }

    public setFullPrivacyPreviousModel(modelId: string): void {
        this.credentials.fullPrivacyPreviousModel = modelId;
        this.saveCredentials();
    }

    public clearFullPrivacyBackups(): void {
        this.credentials.fullPrivacyPreviousSttProvider = undefined;
        this.credentials.fullPrivacyPreviousModel = undefined;
        this.saveCredentials();
    }

    // License setters
    public setLicenseKey(key: string): void {
        this.credentials.gumroadLicenseKey = key;
        this.saveCredentials();
        console.log('[CredentialsManager] License key updated');
    }

    public setMachineId(id: string): void {
        this.credentials.machineId = id;
        this.saveCredentials();
    }

    public setLicenseStatus(status: 'beta' | 'trial' | 'paid' | 'expired'): void {
        this.credentials.licenseStatus = status;
        this.saveCredentials();
        console.log(`[CredentialsManager] License status set to: \${status}`);
    }

    public setBetaRegisteredAt(date: string): void {
        this.credentials.betaRegisteredAt = date;
        this.saveCredentials();
    }

    public setLicenseVerificationRecord(record: LicenseVerificationRecord): void {
        this.credentials.licenseVerificationRecord = record;
        this.saveCredentials();
    }

    public setPromptSettings(promptSettings: Partial<PromptSettingsMap>): void {
        this.credentials.promptSettings = normalizePromptSettings(promptSettings);
        this.saveCredentials();
    }

    public updatePromptSetting(mode: PromptMode, patch: Partial<PromptSettings>): void {
        const currentSettings = this.getPromptSettings();
        currentSettings[mode] = {
            ...currentSettings[mode],
            ...patch,
        };
        this.credentials.promptSettings = normalizePromptSettings(currentSettings);
        this.saveCredentials();
    }

    public saveCustomProvider(provider: CustomProvider): void {
        if (!this.credentials.customProviders) {
            this.credentials.customProviders = [];
        }
        // Check if exists, update if so
        const index = this.credentials.customProviders.findIndex(p => p.id === provider.id);
        if (index !== -1) {
            this.credentials.customProviders[index] = provider;
        } else {
            this.credentials.customProviders.push(provider);
        }
        this.saveCredentials();
        console.log(`[CredentialsManager] Custom Provider '\${provider.name}' saved`);
    }

    public deleteCustomProvider(id: string): void {
        if (!this.credentials.customProviders) return;
        this.credentials.customProviders = this.credentials.customProviders.filter(p => p.id !== id);
        this.saveCredentials();
        console.log(`[CredentialsManager] Custom Provider '\${id}' deleted`);
    }

    public clearAll(): void {
        this.credentials = {};
        const credentialsPath = getCredentialsPath();
        if (fs.existsSync(credentialsPath)) {
            fs.unlinkSync(credentialsPath);
        }
        if (fs.existsSync(credentialsPath + '.json')) {
            fs.unlinkSync(credentialsPath + '.json');
        }
        console.log('[CredentialsManager] All credentials cleared');
    }

    private saveCredentials(): void {
        const credentialsPath = getCredentialsPath();
        if (!safeStorage.isEncryptionAvailable()) {
            throw new Error('Secure credential storage is unavailable on this machine.');
        }

        const data = JSON.stringify(this.credentials);
        const encrypted = safeStorage.encryptString(data);
        fs.mkdirSync(path.dirname(credentialsPath), { recursive: true });
        fs.writeFileSync(credentialsPath, encrypted);

        const legacyPlaintextPath = credentialsPath + '.json';
        if (fs.existsSync(legacyPlaintextPath)) {
            fs.rmSync(legacyPlaintextPath, { force: true });
        }
    }

    private loadCredentials(): void {
        try {
            const credentialsPath = getCredentialsPath();
            // Try encrypted file first
            if (fs.existsSync(credentialsPath)) {
                if (!safeStorage.isEncryptionAvailable()) {
                    log.warn('Encryption not available for load');
                    return;
                }

                const encrypted = fs.readFileSync(credentialsPath);
                const decrypted = safeStorage.decryptString(encrypted);
                this.credentials = JSON.parse(decrypted);
                this.migrateCredentials();
                console.log(`[CredentialsManager] Model preference loaded: \${this.credentials.modelPreference || 'none'}`);
                console.log(`[CredentialsManager] Ollama model loaded: \${this.credentials.ollamaModel || 'none'}`);
                log.info('Loaded encrypted credentials');
                return;
            }

            // Fallback: try plaintext file
            const plaintextPath = credentialsPath + '.json';
            if (fs.existsSync(plaintextPath)) {
                if (!safeStorage.isEncryptionAvailable()) {
                    log.warn('Legacy plaintext credentials detected, but secure storage is unavailable. Ignoring insecure credential file.');
                    this.credentials = {};
                    return;
                }

                const data = fs.readFileSync(plaintextPath, 'utf-8');
                this.credentials = JSON.parse(data);
                this.migrateCredentials();
                this.saveCredentials();
                fs.rmSync(plaintextPath, { force: true });
                log.info('Migrated plaintext credentials into encrypted storage');
                return;
            }

            this.migrateCredentials();
            log.info('No stored credentials found');
        } catch (error) {
            log.error('Failed to load credentials', error);
            this.credentials = {};
        }
    }

    private migrateCredentials(): void {
        const promptSettings = normalizePromptSettings(this.credentials.promptSettings);
        const legacyInterviewPrompt = this.credentials.interviewPrompt?.trim();
        const legacyMeetingPrompt = this.credentials.meetingPrompt?.trim();

        if (legacyInterviewPrompt && !promptSettings.whatToAnswer.fullOverride) {
            promptSettings.whatToAnswer.fullOverride = legacyInterviewPrompt;
        }

        if (legacyMeetingPrompt && !promptSettings.answer.fullOverride) {
            promptSettings.answer.fullOverride = legacyMeetingPrompt;
        }

        this.credentials.promptSettings = promptSettings;
        this.credentials.telemetryEnabled = this.credentials.telemetryEnabled ?? launchConfig.telemetryDefaultEnabled;
        this.credentials.licenseStatus = this.credentials.licenseStatus || (launchConfig.monetizationEnabled ? 'trial' : 'beta');

        delete this.credentials.interviewPrompt;
        delete this.credentials.meetingPrompt;
    }
}
