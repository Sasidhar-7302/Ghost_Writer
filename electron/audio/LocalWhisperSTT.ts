/**
 * LocalWhisperSTT - Local Speech-to-Text using whisper.cpp
 *
 * Implements the same EventEmitter interface as GoogleSTT/RestSTT:
 *   Events: 'transcript' ({ text, isFinal, confidence }), 'error' (Error)
 *   Methods: start(), stop(), write(chunk: Buffer)
 *
 * Uses whisper-server.exe as a persistent HTTP server to keep the model
 * loaded in GPU VRAM. This eliminates the ~14s model-loading overhead
 * per transcription, achieving ~1-2s response times even with the medium model.
 *
 * Falls back to whisper-cli.exe (one-shot process) if the server fails to start.
 *
 * Requirements:
 *   - whisper-server.exe + whisper-cli.exe (auto-downloaded by WhisperModelManager)
 *   - ggml-*.bin model file (auto-downloaded by WhisperModelManager)
 */

import { EventEmitter } from 'events';
import { ChildProcess, execFile, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';

// Upload interval in milliseconds (how often we process buffered audio)
// Reduce interval to improve perceived "instant" transcription latency.
const PROCESS_INTERVAL_MS = 800;

// Minimum buffer size before processing (16kHz * 2 bytes * 1ch * 0.4s ≈ 12800)
const MIN_BUFFER_BYTES = 12800;

// Silence threshold - skip processing if audio is too quiet
const SILENCE_RMS_THRESHOLD = 50;

// Default whisper.cpp arguments for speed + accuracy balance
// NOTE: whisper-cli auto-detects CUDA GPUs, no --device flag needed
const WHISPER_ARGS = [
    '--language', 'en',
    '--no-timestamps',
    '--threads', '4',
];

// Whisper server configuration
const WHISPER_SERVER_PORT = 8178;
const WHISPER_SERVER_HOST = '127.0.0.1';
const SERVER_STARTUP_TIMEOUT_MS = 30000; // 30s for model loading
const SERVER_HEALTH_POLL_MS = 500;

// Shared server instance across all LocalWhisperSTT instances
let sharedServerProcess: ChildProcess | null = null;
let sharedServerReady = false;
let sharedServerModelPath: string | null = null;
let sharedServerRefCount = 0;

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

    // Server binary path (derived from whisperBinaryPath)
    private serverBinaryPath: string;

    constructor(whisperBinaryPath: string, modelPath: string) {
        super();
        this.whisperBinaryPath = whisperBinaryPath;
        this.modelPath = modelPath;
        this.tempDir = path.join(os.tmpdir(), 'ghost-writer-whisper');

        // Derive server binary path from CLI binary path
        const binDir = path.dirname(whisperBinaryPath);
        this.serverBinaryPath = path.join(binDir, 'whisper-server.exe');

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
            const hasServer = fs.existsSync(this.serverBinaryPath);
            console.log(`[LocalWhisperSTT] Ready (binary: ${this.whisperBinaryPath}, model: ${path.basename(this.modelPath)}, server: ${hasServer ? 'available' : 'not found'})`);
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

    // ==================== Server Management ====================

    /**
     * Start the shared whisper-server.exe process.
     * Multiple LocalWhisperSTT instances share one server via refcounting.
     */
    private async startServer(): Promise<void> {
        // If a server is already running with the same model, just increment refcount
        if (sharedServerProcess && sharedServerReady && sharedServerModelPath === this.modelPath) {
            sharedServerRefCount++;
            console.log(`[LocalWhisperSTT] Reusing existing whisper-server (refCount: ${sharedServerRefCount})`);
            return;
        }

        // If server exists but with different model, kill it first
        if (sharedServerProcess) {
            console.log('[LocalWhisperSTT] Killing existing server (model changed)');
            this.killServer();
        }

        if (!fs.existsSync(this.serverBinaryPath)) {
            console.warn(`[LocalWhisperSTT] whisper-server.exe not found at ${this.serverBinaryPath}, falling back to CLI mode`);
            return;
        }

        const args = [
            '--model', this.modelPath,
            '--port', String(WHISPER_SERVER_PORT),
            '--host', WHISPER_SERVER_HOST,
            ...WHISPER_ARGS,
        ];

        console.log(`[LocalWhisperSTT] Starting whisper-server on ${WHISPER_SERVER_HOST}:${WHISPER_SERVER_PORT}...`);

        try {
            sharedServerProcess = spawn(this.serverBinaryPath, args, {
                cwd: path.dirname(this.serverBinaryPath),
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsHide: true,
            });

            sharedServerModelPath = this.modelPath;
            sharedServerRefCount = 1;

            // Log server output for debugging
            sharedServerProcess.stdout?.on('data', (data: Buffer) => {
                const msg = data.toString().trim();
                if (msg) console.log(`[whisper-server] ${msg.substring(0, 200)}`);
            });

            sharedServerProcess.stderr?.on('data', (data: Buffer) => {
                const msg = data.toString().trim();
                if (msg && !msg.includes('ggml_cuda_init')) {
                    console.log(`[whisper-server] ${msg.substring(0, 200)}`);
                }
            });

            sharedServerProcess.on('exit', (code) => {
                console.log(`[LocalWhisperSTT] whisper-server exited with code ${code}`);
                sharedServerProcess = null;
                sharedServerReady = false;
                sharedServerModelPath = null;
                sharedServerRefCount = 0;
            });

            // Wait for server to become ready by polling the health endpoint
            await this.waitForServerReady();

        } catch (err: any) {
            console.error(`[LocalWhisperSTT] Failed to start whisper-server: ${err?.message || err}`);
            this.killServer();
        }
    }

    /**
     * Poll the server until it responds (model loaded into VRAM)
     */
    private waitForServerReady(): Promise<void> {
        return new Promise((resolve) => {
            const startTime = Date.now();

            const poll = () => {
                if (Date.now() - startTime > SERVER_STARTUP_TIMEOUT_MS) {
                    console.warn(`[LocalWhisperSTT] Server startup timed out after ${SERVER_STARTUP_TIMEOUT_MS}ms, falling back to CLI`);
                    resolve();
                    return;
                }

                if (!sharedServerProcess) {
                    console.warn('[LocalWhisperSTT] Server process died during startup');
                    resolve();
                    return;
                }

                const req = http.get(`http://${WHISPER_SERVER_HOST}:${WHISPER_SERVER_PORT}/`, (res) => {
                    // Any response means server is ready
                    res.resume(); // drain the response
                    sharedServerReady = true;
                    const elapsed = Date.now() - startTime;
                    console.log(`[LocalWhisperSTT] ✅ whisper-server ready in ${elapsed}ms (model loaded in GPU VRAM)`);
                    resolve();
                });

                req.on('error', () => {
                    // Server not ready yet, retry
                    setTimeout(poll, SERVER_HEALTH_POLL_MS);
                });

                req.setTimeout(1000, () => {
                    req.destroy();
                    setTimeout(poll, SERVER_HEALTH_POLL_MS);
                });
            };

            poll();
        });
    }

    /**
     * Kill the shared server process
     */
    private killServer(): void {
        if (sharedServerProcess) {
            try {
                sharedServerProcess.kill('SIGTERM');
                // Force kill after 2 seconds if still alive
                setTimeout(() => {
                    if (sharedServerProcess) {
                        try { sharedServerProcess.kill('SIGKILL'); } catch { }
                    }
                }, 2000);
            } catch { }
            sharedServerProcess = null;
            sharedServerReady = false;
            sharedServerModelPath = null;
            sharedServerRefCount = 0;
        }
    }

    /**
     * Decrement the server reference count. Kill server when no one uses it.
     */
    private releaseServer(): void {
        sharedServerRefCount = Math.max(0, sharedServerRefCount - 1);
        console.log(`[LocalWhisperSTT] Released server (refCount: ${sharedServerRefCount})`);
        if (sharedServerRefCount === 0) {
            console.log('[LocalWhisperSTT] No more users, shutting down whisper-server');
            this.killServer();
        }
    }

    // ==================== Lifecycle ====================

    /**
     * Start the processing timer and launch the server
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

        // Start the server in the background (don't block the timer)
        this.startServer().catch((err) => {
            console.warn('[LocalWhisperSTT] Server startup failed, will use CLI fallback:', err);
        });

        this.processTimer = setInterval(() => {
            this.flushAndProcess();
        }, PROCESS_INTERVAL_MS);
    }

    /**
     * Stop the processing timer, flush remaining buffer, and release server
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

        // Release our ref to the shared server
        this.releaseServer();
    }

    /**
     * Write raw PCM audio data to the internal buffer
     */
    public write(audioData: Buffer): void {
        if (!this.isActive) return;
        this.chunks.push(audioData);
        this.totalBufferedBytes += audioData.length;
    }

    // ==================== Transcription ====================

    /**
     * Concatenate buffered chunks, write WAV file, and run whisper
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
                // Use server if available, otherwise fall back to CLI
                let transcript: string;
                if (sharedServerReady && sharedServerProcess) {
                    transcript = await this.transcribeViaServer(tempFile);
                } else {
                    transcript = await this.transcribeViaCli(tempFile);
                }

                if (transcript && transcript.trim().length > 0) {
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
     * Transcribe via the persistent whisper-server HTTP endpoint.
     * Sends the WAV file as multipart/form-data POST to /inference.
     */
    private transcribeViaServer(wavFilePath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();

            try {
                const fileData = fs.readFileSync(wavFilePath);
                const boundary = `----WhisperBoundary${Date.now()}`;

                // Build multipart/form-data body
                const parts: Buffer[] = [];

                // File part
                parts.push(Buffer.from(
                    `--${boundary}\r\n` +
                    `Content-Disposition: form-data; name="file"; filename="${path.basename(wavFilePath)}"\r\n` +
                    `Content-Type: audio/wav\r\n\r\n`
                ));
                parts.push(fileData);
                parts.push(Buffer.from('\r\n'));

                // Response format part
                parts.push(Buffer.from(
                    `--${boundary}\r\n` +
                    `Content-Disposition: form-data; name="response_format"\r\n\r\n` +
                    `json\r\n`
                ));

                // Temperature part (greedy decoding for speed)
                parts.push(Buffer.from(
                    `--${boundary}\r\n` +
                    `Content-Disposition: form-data; name="temperature"\r\n\r\n` +
                    `0.0\r\n`
                ));

                // End boundary
                parts.push(Buffer.from(`--${boundary}--\r\n`));

                const body = Buffer.concat(parts);

                const options: http.RequestOptions = {
                    hostname: WHISPER_SERVER_HOST,
                    port: WHISPER_SERVER_PORT,
                    path: '/inference',
                    method: 'POST',
                    headers: {
                        'Content-Type': `multipart/form-data; boundary=${boundary}`,
                        'Content-Length': body.length,
                    },
                    timeout: 30000,
                };

                const req = http.request(options, (res) => {
                    const chunks: Buffer[] = [];
                    res.on('data', (chunk: Buffer) => chunks.push(chunk));
                    res.on('end', () => {
                        const elapsed = Date.now() - startTime;
                        const responseBody = Buffer.concat(chunks).toString();

                        if (res.statusCode !== 200) {
                            console.warn(`[LocalWhisperSTT] Server returned ${res.statusCode}: ${responseBody.substring(0, 200)}`);
                            // Fall back to CLI for this request
                            this.transcribeViaCli(wavFilePath).then(resolve).catch(reject);
                            return;
                        }

                        try {
                            const json = JSON.parse(responseBody);
                            let text = (json.text || '').trim();

                            // Apply same cleanup as CLI mode
                            text = this.cleanTranscript(text);

                            if (elapsed > 5000) {
                                console.warn(`[LocalWhisperSTT] Slow server transcription: ${elapsed}ms`);
                            }

                            resolve(text);
                        } catch (parseErr) {
                            console.warn(`[LocalWhisperSTT] Failed to parse server response, falling back to CLI`);
                            this.transcribeViaCli(wavFilePath).then(resolve).catch(reject);
                        }
                    });
                });

                req.on('error', (err) => {
                    console.warn(`[LocalWhisperSTT] Server request failed (${err.message}), falling back to CLI`);
                    this.transcribeViaCli(wavFilePath).then(resolve).catch(reject);
                });

                req.on('timeout', () => {
                    req.destroy();
                    console.warn(`[LocalWhisperSTT] Server request timed out, falling back to CLI`);
                    this.transcribeViaCli(wavFilePath).then(resolve).catch(reject);
                });

                req.write(body);
                req.end();

            } catch (err: any) {
                console.warn(`[LocalWhisperSTT] Server transcription error: ${err?.message}`);
                this.transcribeViaCli(wavFilePath).then(resolve).catch(reject);
            }
        });
    }

    /**
     * Fallback: Run whisper-cli.exe as a one-shot process (original behavior)
     */
    private transcribeViaCli(wavFilePath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const args = [
                '--model', this.modelPath,
                '--file', wavFilePath,
                ...WHISPER_ARGS,
            ];

            const attemptTranscription = (retryCount: number = 0) => {
                const startTime = Date.now();

                execFile(this.whisperBinaryPath, args, {
                    timeout: 60000, // 60 second timeout (allows for CUDA warmup on first call)
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

                        // Retry on failure up to 2 times
                        if (retryCount < 2) {
                            console.warn(`[LocalWhisperSTT] Transcription failed (attempt ${retryCount + 1}), retrying... Error: ${error.message}`);
                            setTimeout(() => attemptTranscription(retryCount + 1), 500);
                            return;
                        }

                        console.error(`[LocalWhisperSTT] Transcription failed after ${retryCount + 1} attempts:`, error);
                        reject(error);
                        return;
                    }

                    if (stderr && stderr.includes('error')) {
                        console.warn(`[LocalWhisperSTT] stderr: ${stderr.substring(0, 200)}`);
                    }

                    // Parse whisper.cpp output - it outputs text to stdout
                    let text = stdout
                        .split('\n')
                        .map(line => line.trim())
                        .filter(line => line.length > 0 && !line.startsWith('['))
                        .join(' ')
                        .trim();

                    // Clean up transcript
                    text = this.cleanTranscript(text);

                    // Skip if only music symbols or very short gibberish remain
                    if (text.length < 2) {
                        resolve('');
                        return;
                    }

                    resolve(text);
                });
            };

            attemptTranscription();
        });
    }

    /**
     * Clean up whisper transcript text (shared between server and CLI modes)
     */
    private cleanTranscript(text: string): string {
        return text
            .replace(/\[BLANK_AUDIO\]/g, '')
            .replace(/\(.*?\)/g, '') // Remove parenthetical notes like (music), (silence)
            .replace(/♪/g, '')        // Remove music note hallucinations
            .replace(/\s+/g, ' ')
            .trim();
    }

    // ==================== Audio Utilities ====================

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
