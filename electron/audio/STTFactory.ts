import { EventEmitter } from 'events';
import { LocalWhisperSTT } from './LocalWhisperSTT';
import { GoogleSTT } from './GoogleSTT';
import { DeepgramStreamingSTT } from './DeepgramStreamingSTT';
import { RestSTT, RestSttProvider } from './RestSTT';
import { WhisperModelManager } from './WhisperModelManager';
import { CredentialsManager } from '../services/CredentialsManager';

export interface ISTT extends EventEmitter {
    start(): void | Promise<void>;
    stop(): void | Promise<void>;
    write(audioData: Buffer): void;
    setRecognitionLanguage?(key: string): void;
    setSampleRate?(rate: number): void;
    setAudioChannelCount?(count: number): void;
    setCredentials?(keyFilePath: string): void;
}

export class STTFactory {
    /**
     * Create an STT instance based on the provider and availability.
     * Implements an intelligent fallback mechanism.
     */
    public static async createSTT(speakerType: 'user' | 'interviewer'): Promise<ISTT> {
        const creds = CredentialsManager.getInstance();
        const fullPrivacyMode = creds.getAirGapMode();
        const sttProvider = fullPrivacyMode ? 'local-whisper' : creds.getSttProvider();

        console.log(`[STTFactory] Creating STT for ${speakerType} (Requested Provider: ${sttProvider})`);

        // 1. Explicitly requested Local Whisper (or Air Gap Mode)
        if (sttProvider === 'local-whisper') {
            const modelManager = WhisperModelManager.getInstance();
            const ready = await modelManager.ensureReady();
            if (ready) {
                const paths = modelManager.getPaths();
                const whisper = new LocalWhisperSTT(paths.binaryPath, paths.modelPath);
                const health = await whisper.checkHealth();
                if (health.success) {
                    console.log(`[STTFactory] Successfully created LocalWhisperSTT for ${speakerType}`);
                    return whisper as ISTT;
                }
                if (fullPrivacyMode) {
                    throw new Error(`Full Privacy Mode is enabled, but Local Whisper failed its health check: ${health.error}`);
                }
                console.warn(`[STTFactory] Local Whisper health check failed: ${health.error}. Falling back to Google...`);
            } else {
                if (fullPrivacyMode) {
                    throw new Error("Full Privacy Mode is enabled, but Local Whisper is not operational. Configure the Local Whisper runtime and model before continuing.");
                }
                console.warn(`[STTFactory] Local Whisper is not operational after setup/repair. Falling back to Google...`);
            }
            const googleStt = new GoogleSTT();
            if (speakerType === 'interviewer') {
                googleStt.setEnableDiarization(true);
            }
            return googleStt as ISTT;
        }

        // 2. Deepgram (High Priority for cloud)
        if (sttProvider === 'deepgram') {
            const apiKey = creds.getDeepgramApiKey();
            if (apiKey) {
                return new DeepgramStreamingSTT(apiKey) as ISTT;
            }
            console.warn(`[STTFactory] Deepgram API key missing. Trying Local Whisper fallback...`);
            // Deepgram Fallback -> Local Whisper
            return this.createLocalWhisperWithFallback();
        }

        // 3. REST Providers (Groq, OpenAI, etc.)
        if (['groq', 'openai', 'elevenlabs', 'azure', 'ibmwatson'].includes(sttProvider)) {
            const restProvider = sttProvider as RestSttProvider;
            let apiKey: string | undefined;
            let region: string | undefined;
            let modelOverride: string | undefined;

            if (restProvider === 'groq') {
                apiKey = creds.getGroqSttApiKey();
                modelOverride = creds.getGroqSttModel();
            } else if (restProvider === 'openai') {
                apiKey = creds.getOpenAiSttApiKey();
            } else if (restProvider === 'elevenlabs') {
                apiKey = creds.getElevenLabsApiKey();
            } else if (restProvider === 'azure') {
                apiKey = creds.getAzureApiKey();
                region = creds.getAzureRegion();
            } else if (restProvider === 'ibmwatson') {
                apiKey = creds.getIbmWatsonApiKey();
                region = creds.getIbmWatsonRegion();
            }

            if (apiKey) {
                return new RestSTT(restProvider, apiKey, modelOverride, region) as ISTT;
            }
            console.warn(`[STTFactory] ${sttProvider} API key missing. Falling back to Google...`);
        }

        // 4. Default Fallback (Google Web Speech / GoogleSTT)
        if (fullPrivacyMode) {
            throw new Error("Full Privacy Mode is enabled, so cloud STT providers are blocked. Configure Local Whisper before continuing.");
        }
        const googleStt = new GoogleSTT();
        if (speakerType === 'interviewer') {
            googleStt.setEnableDiarization(true);
        }
        return googleStt as ISTT;
    }

    /**
     * Helper to create Local Whisper with its own fallback to Google
     */
    private static async createLocalWhisperWithFallback(): Promise<ISTT> {
        const modelManager = WhisperModelManager.getInstance();
        const ready = await modelManager.ensureReady();
        if (ready) {
            const paths = modelManager.getPaths();
            const whisper = new LocalWhisperSTT(paths.binaryPath, paths.modelPath);
            const health = await whisper.checkHealth();
            if (health.success) {
                return whisper as ISTT;
            }
        }
        return new GoogleSTT() as ISTT;
    }
}
