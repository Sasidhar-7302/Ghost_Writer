/**
 * LocalWhisperSTT - Local Speech-to-Text using whisper.cpp binary
 *
 * Implements the same EventEmitter interface as GoogleSTT/RestSTT:
 *   Events: 'transcript' ({ text, isFinal, confidence }), 'error' (Error)
 *   Methods: start(), stop(), write(chunk: Buffer)
 *
 * Buffers raw PCM chunks, writes WAV to temp file, and runs whisper.cpp binary.
 * Uses the whisper-small model for best speed/accuracy balance on consumer GPUs.
 *
 * Requirements:
 *   - whisper.cpp main binary (auto-downloaded by WhisperModelManager)
 *   - ggml-small.bin model file (auto-downloaded by WhisperModelManager)
 */

import { EventEmitter } from 'events';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Upload interval in milliseconds (how often we process buffered audio)
const PROCESS_INTERVAL_MS = 3000;

// Minimum buffer size before processing (16kHz * 2 bytes * 1ch * 0.5s = 16000)
const MIN_BUFFER_BYTES = 16000;

// Silence threshold - skip processing if audio is too quiet
const SILENCE_RMS_THRESHOLD = 50;

// Default whisper.cpp arguments for speed + accuracy balance
const WHISPER_ARGS = [
    '--language', 'en',
    '--no-timestamps',
    '--print-special', 'false',
    '--threads', '4',
];

export class LocalWhisperSTT extends EventEmitter {
    private whisperBinaryPath: string;
    private modelPath: string;
    private isAvailable: boolean = false;

    private chunks: Buffer[] = [];
    private totalBufferedBytes = 0;
    private processTimer: NodeJS.Timeout | null = null;
    private isActive = false;
    private isProcessing = false;

    // Audio config (must match SystemAudioCapture / MicrophoneCapture output)
    private sampleRate = 16000;
    private numChannels = 1;
    private bitsPerSample = 16;

    // Temp directory for WAV files
    private tempDir: string;

    constructor(whisperBinaryPath: string, modelPath: string) {
        super();
        this.whisperBinaryPath = whisperBinaryPath;
        this.modelPath = modelPath;
        this.tempDir = path.join(os.tmpdir(), 'ghost-writer-whisper');

        // Ensure temp directory exists
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }

        // Check if binary and model exist
        this.checkAvailability();
    }

    /**
     * Check if whisper.cpp binary and model are available
     */
    private checkAvailability(): void {
        const binaryExists = fs.existsSync(this.whisperBinaryPath);
        const modelExists = fs.existsSync(this.modelPath);

        this.isAvailable = binaryExists && modelExists;

        if (!binaryExists) {
            console.warn(`[LocalWhisperSTT] Binary not found: ${this.whisperBinaryPath}`);
        }
        if (!modelExists) {
            console.warn(`[LocalWhisperSTT] Model not found: ${this.modelPath}`);
        }
        if (this.isAvailable) {
            console.log(`[LocalWhisperSTT] Ready (binary: ${this.whisperBinaryPath}, model: ${path.basename(this.modelPath)})`);
        }
    }

    /**
     * Check if local whisper is available and ready to use
     */
    public getIsAvailable(): boolean {
        return this.isAvailable;
    }

    /**
     * Update sample rate to match the audio source
     */
    public setSampleRate(rate: number): void {
        if (this.sampleRate === rate) return;
        console.log(`[LocalWhisperSTT] Updating sample rate to ${rate}Hz`);
        this.sampleRate = rate;
    }

    /**
     * Update channel count
     */
    public setAudioChannelCount(count: number): void {
        if (this.numChannels === count) return;
        console.log(`[LocalWhisperSTT] Updating channel count to ${count}`);
        this.numChannels = count;
    }

    /**
     * No-op for LocalWhisperSTT
     */
    public setRecognitionLanguage(_key: string): void {
        console.log(`[LocalWhisperSTT] setRecognitionLanguage called (handled via whisper args)`);
    }

    /**
     * No-op for LocalWhisperSTT
     */
    public setCredentials(_keyFilePath: string): void {
        console.log(`[LocalWhisperSTT] setCredentials called (no-op for local whisper)`);
    }

    /**
     * Start the processing timer
     */
    public start(): void {
        if (this.isActive) return;
        if (!this.isAvailable) {
            console.warn('[LocalWhisperSTT] Cannot start - whisper.cpp binary or model not found');
            return;
        }

        console.log('[LocalWhisperSTT] Starting...');
        this.isActive = true;
        this.chunks = [];
        this.totalBufferedBytes = 0;

        this.processTimer = setInterval(() => {
            this.flushAndProcess();
        }, PROCESS_INTERVAL_MS);
    }

    /**
     * Stop the processing timer and flush remaining buffer
     */
    public stop(): void {
        if (!this.isActive) return;

        console.log('[LocalWhisperSTT] Stopping...');
        this.isActive = false;

        if (this.processTimer) {
            clearInterval(this.processTimer);
            this.processTimer = null;
        }

        // Flush remaining audio
        this.flushAndProcess();
    }

    /**
     * Write raw PCM audio data to the internal buffer
     */
    public write(audioData: Buffer): void {
        if (!this.isActive) return;
        this.chunks.push(audioData);
        this.totalBufferedBytes += audioData.length;
    }

    /**
     * Concatenate buffered chunks, write WAV file, and run whisper.cpp
     */
    private async flushAndProcess(): Promise<void> {
        if (this.chunks.length === 0 || this.totalBufferedBytes < MIN_BUFFER_BYTES) return;
        if (this.isProcessing) return;

        // Grab current buffer and reset
        const currentChunks = this.chunks;
        this.chunks = [];
        this.totalBufferedBytes = 0;

        // Concatenate all chunks
        const rawPcm = Buffer.concat(currentChunks);

        // Check for silence
        if (this.isSilent(rawPcm)) {
            return;
        }

        // Add WAV header
        const wavBuffer = this.addWavHeader(rawPcm, this.sampleRate);

        this.isProcessing = true;

        try {
            // Write WAV to temp file
            const tempFile = path.join(this.tempDir, `whisper_${Date.now()}.wav`);
            fs.writeFileSync(tempFile, wavBuffer);

            try {
                const transcript = await this.transcribeFile(tempFile);

                if (transcript && transcript.trim().length > 0) {
                    console.log(`[LocalWhisperSTT] Transcript: "${transcript.substring(0, 60)}..."`);
                    this.emit('transcript', {
                        text: transcript.trim(),
                        isFinal: true,
                        confidence: 0.85, // Local whisper confidence estimate
                    });
                }
            } finally {
                // Clean up temp file
                try {
                    fs.unlinkSync(tempFile);
                } catch {
                    // Ignore cleanup errors
                }
            }
        } catch (err) {
            console.error('[LocalWhisperSTT] Processing error:', err);
            this.emit('error', err instanceof Error ? err : new Error(String(err)));
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Run whisper.cpp binary on a WAV file and return the transcript
     */
    private transcribeFile(wavFilePath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const args = [
                '--model', this.modelPath,
                '--file', wavFilePath,
                ...WHISPER_ARGS,
            ];

            const startTime = Date.now();

            execFile(this.whisperBinaryPath, args, {
                timeout: 30000, // 30 second timeout
                maxBuffer: 1024 * 1024, // 1MB output buffer
                cwd: path.dirname(this.whisperBinaryPath)
            }, (error, stdout, stderr) => {
                const elapsed = Date.now() - startTime;

                if (error) {
                    // Don't reject on timeout - just log it
                    if (error.killed) {
                        console.warn(`[LocalWhisperSTT] Process timed out after ${elapsed}ms`);
                        resolve('');
                        return;
                    }
                    reject(error);
                    return;
                }

                if (stderr && stderr.includes('error')) {
                    console.warn(`[LocalWhisperSTT] stderr: ${stderr.substring(0, 200)}`);
                }

                // Parse whisper.cpp output - it outputs text to stdout
                // Clean up the output (remove leading/trailing whitespace, special tokens)
                let text = stdout
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0 && !line.startsWith('['))
                    .join(' ')
                    .trim();

                // Remove common whisper artifacts
                text = text
                    .replace(/\[BLANK_AUDIO\]/g, '')
                    .replace(/\(.*?\)/g, '') // Remove parenthetical notes like (music), (silence)
                    .replace(/\s+/g, ' ')
                    .trim();

                if (elapsed > 2000) {
                    console.warn(`[LocalWhisperSTT] Slow transcription: ${elapsed}ms for ${wavFilePath}`);
                }

                resolve(text);
            });
        });
    }

    /**
     * Check if audio buffer is essentially silence
     */
    private isSilent(pcmBuffer: Buffer): boolean {
        let sum = 0;
        const step = 20;
        let count = 0;

        for (let i = 0; i < pcmBuffer.length - 1; i += 2 * step) {
            const sample = pcmBuffer.readInt16LE(i);
            sum += sample * sample;
            count++;
        }

        if (count === 0) return true;
        const rms = Math.sqrt(sum / count);
        return rms < SILENCE_RMS_THRESHOLD;
    }

    /**
     * Add a WAV RIFF header to raw PCM data
     */
    private addWavHeader(samples: Buffer, sampleRate: number = 16000): Buffer {
        const buffer = Buffer.alloc(44 + samples.length);
        // RIFF chunk descriptor
        buffer.write('RIFF', 0);
        buffer.writeUInt32LE(36 + samples.length, 4);
        buffer.write('WAVE', 8);
        // fmt sub-chunk
        buffer.write('fmt ', 12);
        buffer.writeUInt32LE(16, 16);
        buffer.writeUInt16LE(1, 20);  // PCM
        buffer.writeUInt16LE(this.numChannels, 22);
        buffer.writeUInt32LE(sampleRate, 24);
        buffer.writeUInt32LE(sampleRate * this.numChannels * (this.bitsPerSample / 8), 28);
        buffer.writeUInt16LE(this.numChannels * (this.bitsPerSample / 8), 32);
        buffer.writeUInt16LE(this.bitsPerSample, 34);
        // data sub-chunk
        buffer.write('data', 36);
        buffer.writeUInt32LE(samples.length, 40);
        samples.copy(buffer, 44);

        return buffer;
    }
}
