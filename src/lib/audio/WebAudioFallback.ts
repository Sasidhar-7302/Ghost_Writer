/**
 * WebAudioFallback - Renderer-side audio capture fallback
 * 
 * Uses standard Web APIs (getDisplayMedia, getUserMedia) to capture audio
 * when the native Rust module fails to load or initialize.
 */

export class WebAudioFallback {
    private static instance: WebAudioFallback;
    private stream: MediaStream | null = null;
    private audioContext: AudioContext | null = null;
    private processor: AudioWorkletNode | null = null;
    private source: MediaStreamAudioSourceNode | null = null;

    private constructor() { }

    public static getInstance(): WebAudioFallback {
        if (!WebAudioFallback.instance) {
            WebAudioFallback.instance = new WebAudioFallback();
        }
        return WebAudioFallback.instance;
    }

    /**
     * Start capturing system audio via getDisplayMedia
     */
    public async startSystemCapture(): Promise<void> {
        try {
            console.log('[WebAudioFallback] Requesting display media for system audio...');
            this.stream = await navigator.mediaDevices.getDisplayMedia({
                video: true, // Required for getDisplayMedia, but we only want audio
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });

            const audioTracks = this.stream.getAudioTracks();
            if (audioTracks.length === 0) {
                throw new Error('No audio track found in display media stream');
            }

            await this.setupProcessor(this.stream);
            console.log('[WebAudioFallback] System audio capture started.');
        } catch (err) {
            console.error('[WebAudioFallback] Failed to start system capture:', err);
            throw err;
        }
    }

    /**
     * Start capturing microphone audio via getUserMedia
     */
    public async startMicCapture(): Promise<void> {
        try {
            console.log('[WebAudioFallback] Requesting user media for microphone...');
            const micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            await this.setupProcessor(micStream);
            console.log('[WebAudioFallback] Microphone capture started.');
        } catch (err) {
            console.error('[WebAudioFallback] Failed to start mic capture:', err);
            throw err;
        }
    }

    private async setupProcessor(stream: MediaStream): Promise<void> {
        this.audioContext = new AudioContext({ sampleRate: 16000 });

        // In a real production app, we would use an AudioWorklet for better performance.
        // For this fallback, we'll use a ScriptProcessorNode or similar if Worklet is too complex to setup here.
        // But let's try a simple ScriptProcessor for now since we're piping to IPC anyway.

        this.source = this.audioContext.createMediaStreamSource(stream);

        // Use 2 channels input to capture stereo system audio, out 1 channel mono
        const processor = this.audioContext.createScriptProcessor(4096, 2, 1);

        processor.onaudioprocess = (e) => {
            const left = e.inputBuffer.getChannelData(0);
            const right = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : left;

            // Convert Stereo Float32 to Mono Int16 PCM
            const pcmData = new Int16Array(left.length);
            for (let i = 0; i < left.length; i++) {
                // Sum and average channels for mono
                const s = Math.max(-1, Math.min(1, (left[i] + right[i]) / 2));
                pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }

            // Stream to Main process
            if (window.electronAPI?.sendRawAudio) {
                window.electronAPI.sendRawAudio(Buffer.from(pcmData.buffer));
            }
        };

        this.source.connect(processor);
        processor.connect(this.audioContext.destination);
    }

    public stop(): void {
        console.log('[WebAudioFallback] Stopping capture...');
        this.stream?.getTracks().forEach(track => track.stop());
        this.stream = null;

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        this.source = null;
        this.processor = null;
    }
}
