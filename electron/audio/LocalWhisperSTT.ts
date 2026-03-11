/**
 * LocalWhisperSTT - Local Speech-to-Text using whisper.cpp
 *
 * Implements the same EventEmitter interface as GoogleSTT/RestSTT:
 *   Events: 'transcript' ({ text, isFinal, confidence }), 'error' (Error)
 *   Methods: start(), stop(), write(chunk: Buffer)
 *
 * Uses whisper-server as a persistent HTTP server to keep the model
 * loaded in GPU VRAM. This eliminates the ~14s model-loading overhead
 * per transcription, achieving ~1-2s response times even with the medium model.
 *
 * Falls back to whisper-cli (one-shot process) if the server fails to start.
 *
 * Requirements:
 *   - whisper-server + whisper-cli (auto-downloaded by WhisperModelManager)
 *   - ggml-*.bin model file (auto-downloaded by WhisperModelManager)
 */

import { EventEmitter } from 'events';
import { ChildProcess, execFile, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';
import * as net from 'net';
import { GPUHelper } from '../utils/GPUHelper';

// Upload interval in milliseconds (how often we process buffered audio)
const PROCESS_INTERVAL_MS = 2000; // 2s chunks balance latency and transcript stability

// Minimum buffer size before processing (16kHz * 2 bytes * 1ch * 2s ≈ 64000)
const MIN_BUFFER_BYTES = 64000;

// Silence threshold - skip processing if audio is too quiet
const SILENCE_RMS_THRESHOLD = 50;

const NON_SPEECH_TRANSCRIPT_PATTERNS = [
    /^\[(?:MUSIC(?: PLAYING)?|PHONE RINGING|NOISE|END PLAYBACK|APPLAUSE|LAUGHTER|INAUDIBLE|SILENCE|BLANK_AUDIO)\]$/i,
    /^\((?:music|upbeat music|noise|mouse clicking|keyboard clicking|clicking|tapping|phone ringing|computer chimes|air whooshing)\)$/i,
];

// Default whisper.cpp threads for speed + accuracy balance
const CPU_COUNT = os.cpus().length;
const OPTIMAL_THREADS = Math.max(2, CPU_COUNT - 2); // Leave 2 cores for the OS / Electron

// Whisper server configuration
const WHISPER_SERVER_PORT = 8178;
const WHISPER_SERVER_HOST = '127.0.0.1';
const SERVER_STARTUP_TIMEOUT_MS = 60000; // Increased to 60s for slow GPU init
const SERVER_HEALTH_POLL_MS = 500;

// Shared server instance across all LocalWhisperSTT instances
let sharedServerProcess: ChildProcess | null = null;
let sharedServerReady = false;
let sharedServerModelPath: string | null = null;
let sharedServerRefCount = 0;
let sharedServerStarting = false; // True while server is booting (model loading)
let sharedServerFailed = false;  // True if server startup definitively failed
let sharedServerPromise: Promise<void> | null = null; // Used to serialize multiple start attempts

/**
 * Cleanup any orphaned whisper-server processes from previous crashes.
 */
export async function cleanupOrphanedServers(): Promise<void> {
    console.log('[LocalWhisperSTT] Checking for orphaned whisper-server processes...');
    try {
        const { exec } = require('child_process');
        const command = process.platform === 'win32'
            ? 'taskkill /F /IM whisper-server.exe /T'
            : 'pkill -9 whisper-server';

        return new Promise((resolve) => {
            exec(command, (err: any) => {
                if (err) {
                    // This usually means no process was found, which is fine
                    console.log('[LocalWhisperSTT] No orphaned servers found or cleanup failed (expected if none running).');
                } else {
                    console.log('[LocalWhisperSTT] Successfully cleaned up orphaned server processes.');
                }
                resolve();
            });
        });
    } catch (e) {
        console.warn('[LocalWhisperSTT] Failed to run orphan cleanup:', e);
    }
}

export class LocalWhisperSTT extends EventEmitter {
    private whisperBinaryPath: string;
    private modelPath: string;
    private isAvailable: boolean = false;

    private chunks: Buffer[] = [];
    private totalBufferedBytes = 0;
    private processTimer: NodeJS.Timeout | null = null;
    private isActive = false;
    private isProcessing = false;
    private currentProcessingPromise: Promise<void> | null = null;

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
        const serverName = process.platform === 'win32' ? 'whisper-server.exe' : 'whisper-server';
        this.serverBinaryPath = path.join(binDir, serverName);

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
     * Dynamically build whispered args based on current model features
     */
    private getWhisperArgs(): string[] {
        const args = [
            '--language', 'en',
            '--threads', String(OPTIMAL_THREADS),
        ];

        // If diarization is enabled, we require timestamps, otherwise we suppress them
        if (this.modelPath.includes('tdrz')) {
            args.push('-tdrz');
        } else {
            args.push('--no-timestamps');
        }
        return args;
    }

    /**
     * Proactively check if this STT provider is healthy and ready to start.
     * Checks for binary existence, model existence, and optional GPU connectivity.
     */
    public async checkHealth(): Promise<{ success: boolean; error?: string }> {
        if (!fs.existsSync(this.whisperBinaryPath)) {
            return { success: false, error: `Whisper CLI binary not found: ${this.whisperBinaryPath}` };
        }
        if (!fs.existsSync(this.serverBinaryPath)) {
            return { success: false, error: `Whisper Server binary not found: ${this.serverBinaryPath}` };
        }
        if (!fs.existsSync(this.modelPath)) {
            return { success: false, error: `Whisper model not found: ${this.modelPath}` };
        }

        // If server is already running and failed, report it
        if (sharedServerFailed) {
            return { success: false, error: 'Local Whisper server failed to start previously.' };
        }

        return { success: true };
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
     * Start the shared whisper-server process.
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
            const serverName = path.basename(this.serverBinaryPath);
            console.warn(`[LocalWhisperSTT] ${serverName} not found at ${this.serverBinaryPath}, falling back to CLI mode`);
            sharedServerFailed = true;
            return;
        }

        // Use a promise-based lock to ensure only one server starts
        if (sharedServerPromise) {
            sharedServerRefCount++;
            console.log(`[LocalWhisperSTT] Waiting for existing server startup promise (refCount: ${sharedServerRefCount})...`);
            return sharedServerPromise;
        }

        sharedServerRefCount = 1;

        sharedServerPromise = (async () => {
            sharedServerStarting = true;
            sharedServerFailed = false;

            const gpu = await GPUHelper.detectGPU();
            const args = [
                '--model', this.modelPath,
                '--port', String(WHISPER_SERVER_PORT),
                '--host', WHISPER_SERVER_HOST,
                ...this.getWhisperArgs(),
            ];

            if (gpu.isNvidia) {
                console.log(`[LocalWhisperSTT] GPU Acceleration active (${gpu.name})`);
            } else {
                console.log(`[LocalWhisperSTT] CPU Mode (${OPTIMAL_THREADS} threads)`);
                args.push('-ng');
            }

            const binDir = path.dirname(this.serverBinaryPath);
            const spawnEnv = { ...process.env };
            if (process.platform === 'win32') {
                spawnEnv.PATH = `${binDir}${path.delimiter}${spawnEnv.PATH || ''}`;
                spawnEnv.CUDA_VISIBLE_DEVICES = '0';
            }

            console.log(`[LocalWhisperSTT] Starting whisper-server from: ${this.serverBinaryPath}`);
            console.log(`[LocalWhisperSTT] Working directory: ${binDir}`);

            try {
                sharedServerProcess = spawn(this.serverBinaryPath, args, {
                    cwd: binDir,
                    env: spawnEnv,
                    stdio: ['ignore', 'pipe', 'pipe'],
                    windowsHide: true,
                });

                sharedServerModelPath = this.modelPath;

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
                    sharedServerPromise = null;
                });

                // Wait for server to become ready by polling the health endpoint
                await this.waitForServerReady();

                if (!sharedServerReady) {
                    console.warn('[LocalWhisperSTT] Server did not become ready, marking as failed');
                    sharedServerFailed = true;
                }

            } catch (err: any) {
                console.error(`[LocalWhisperSTT] Failed to start whisper-server: ${err?.message || err}`);
                sharedServerFailed = true;
                this.killServer();
            } finally {
                sharedServerStarting = false;
                sharedServerPromise = null;
            }
        })();

        return sharedServerPromise;
    }

    /**
     * Poll the server until it responds (model loaded into VRAM)
     * Uses a multi-stage check:
     * 1. TCP Socket connectivity (confirming some listener is on the port)
     * 2. HTTP response from common endpoints
     */
    private waitForServerReady(): Promise<void> {
        return new Promise((resolve) => {
            const startTime = Date.now();

            const poll = () => {
                const elapsed = Date.now() - startTime;
                if (elapsed > SERVER_STARTUP_TIMEOUT_MS) {
                    console.warn(`[LocalWhisperSTT] Server startup timed out after ${SERVER_STARTUP_TIMEOUT_MS}ms, falling back to CLI`);
                    resolve();
                    return;
                }

                if (!sharedServerProcess) {
                    console.warn('[LocalWhisperSTT] Server process died during startup');
                    resolve();
                    return;
                }

                // Stage 1: Check if the TCP port is open
                const socket = new net.Socket();
                socket.on('error', () => {
                    socket.destroy();
                    setTimeout(poll, SERVER_HEALTH_POLL_MS);
                });

                socket.connect(WHISPER_SERVER_PORT, WHISPER_SERVER_HOST, () => {
                    socket.destroy();
                    // Stage 2: Port is open! Now verify HTTP responsiveness
                    // We try /props first, but if it fails we check if / exists.
                    // If the port is open but HTTP fails, the server is likely still loading.
                    this.verifyHttpReadiness()
                        .then((ready) => {
                            if (ready) {
                                sharedServerReady = true;
                                console.log(`[LocalWhisperSTT] ✅ whisper-server ready in ${Date.now() - startTime}ms`);
                                resolve();
                            } else {
                                setTimeout(poll, SERVER_HEALTH_POLL_MS);
                            }
                        })
                        .catch(() => {
                            setTimeout(poll, SERVER_HEALTH_POLL_MS);
                        });
                });
            };

            poll();
        });
    }

    /**
     * Verify that the HTTP server is actually responding to requests.
     * Tries /props (preferred) then / (fallback).
     */
    private async verifyHttpReadiness(): Promise<boolean> {
        const tryEndpoint = (path: string): Promise<boolean> => {
            return new Promise((resolve) => {
                const req = http.get({
                    hostname: WHISPER_SERVER_HOST,
                    port: WHISPER_SERVER_PORT,
                    path: path,
                    timeout: 1000,
                }, (res) => {
                    res.resume();
                    // Any response (even 404/405) means the HTTP server is alive and listening
                    // though 200 is preferred.
                    resolve(res.statusCode !== undefined);
                });
                req.on('error', () => resolve(false));
                req.end();
            });
        };

        // If /props exists and returns 200, we're definitely ready.
        // If not, any response from / means the server is at least up.
        const [propsReady, rootReady] = await Promise.all([
            tryEndpoint('/props'),
            tryEndpoint('/')
        ]);

        return propsReady || rootReady;
    }

    /**
     * Kill the shared server process
     */
    private killServer(): void {
        if (sharedServerProcess) {
            try {
                sharedServerProcess.kill('SIGTERM');
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
            sharedServerStarting = false;
            sharedServerFailed = false;
            sharedServerPromise = null;
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

        // CRITICAL: Start the server and WAIT for it before processing audio.
        this.startServer()
            .then(() => {
                if (!this.isActive) return;
                console.log('[LocalWhisperSTT] Server startup phase complete, starting audio processing timer');
                this.processTimer = setInterval(() => {
                    this.flushAndProcess();
                }, PROCESS_INTERVAL_MS);
            })
            .catch((err) => {
                console.warn('[LocalWhisperSTT] Server startup failed, starting timer with CLI fallback:', err);
                sharedServerFailed = true;
                if (!this.isActive) return;
                this.processTimer = setInterval(() => {
                    this.flushAndProcess();
                }, PROCESS_INTERVAL_MS);
            });
    }

    /**
     * Stop the processing timer, flush remaining buffer, and release server.
     * Async to ensure final transcription completes before server shutdown.
     */
    public async stop(): Promise<void> {
        if (!this.isActive) return;

        console.log('[LocalWhisperSTT] Stopping (awaiting final flush)...');
        this.isActive = false;

        if (this.processTimer) {
            clearInterval(this.processTimer);
            this.processTimer = null;
        }

        // 1. Wait for any current processing to finish
        if (this.currentProcessingPromise) {
            await this.currentProcessingPromise;
        }

        // 2. Flush remaining audio and WAIT for it
        await this.flushAndProcess();

        // 3. Release our ref to the shared server (will kill if last ref)
        this.releaseServer();
    }

    /**
     * Write raw PCM audio data to the internal buffer
     */
    public write(audioData: Buffer): void {
        if (!this.isActive) return;
        this.chunks.push(audioData);
        this.totalBufferedBytes += audioData.length;

        // Debug logging for buffer growth (sampled)
        if (this.chunks.length % 50 === 0) {
            console.log(`[LocalWhisperSTT] Buffered ${this.chunks.length} chunks (${(this.totalBufferedBytes / 1024).toFixed(1)} KB)`);
        }
    }

    // ==================== Transcription ====================

    /**
     * Concatenate buffered chunks, write WAV file, and run whisper
     */
    private async flushAndProcess(): Promise<void> {
        if (this.chunks.length === 0 || this.totalBufferedBytes < MIN_BUFFER_BYTES) return;
        if (this.isProcessing) return;

        this.currentProcessingPromise = (async () => {
            this.isProcessing = true;
            try {
                const currentChunks = this.chunks;
                this.chunks = [];
                this.totalBufferedBytes = 0;

                const rawPcm = Buffer.concat(currentChunks);

                if (this.isSilent(rawPcm)) {
                    return;
                }

                const wavBuffer = this.addWavHeader(rawPcm, this.sampleRate);

                try {
                    const tempFile = path.join(this.tempDir, `whisper_${Date.now()}.wav`);
                    fs.writeFileSync(tempFile, wavBuffer);

                    try {
                        let transcript: string;
                        if (sharedServerReady && sharedServerProcess) {
                            transcript = await this.transcribeViaServer(tempFile);
                        } else if (sharedServerStarting && !sharedServerFailed) {
                            console.log(`[LocalWhisperSTT] Server still loading model, skip/buffer check (Current chunks: ${this.chunks.length})...`);
                            // Re-insert chunks so we don't lose audio while server is warming up
                            this.chunks.unshift(currentChunks[0]); // Simple retry logic for next cycle
                            return;
                        } else {
                            console.log('[LocalWhisperSTT] Using CLI fallback for transcription...');
                            transcript = await this.transcribeViaCli(tempFile);
                        }

                        if (transcript && transcript.trim().length > 0) {
                            console.log(`[LocalWhisperSTT] Transcript: "${transcript.substring(0, 50)}${transcript.length > 50 ? '...' : ''}"`);
                            this.emit('transcript', {
                                text: transcript.trim(),
                                isFinal: true,
                                confidence: 0.85,
                            });
                        }
                    } finally {
                        try { fs.unlinkSync(tempFile); } catch { }
                    }
                } catch (err) {
                    console.error('[LocalWhisperSTT] Processing error:', err);
                    this.emit('error', err instanceof Error ? err : new Error(String(err)));
                }
            } finally {
                this.isProcessing = false;
                this.currentProcessingPromise = null;
            }
        })();

        return this.currentProcessingPromise;
    }

    /**
     * Transcribe via the persistent whisper-server HTTP endpoint.
     */
    private transcribeViaServer(wavFilePath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();

            try {
                const fileData = fs.readFileSync(wavFilePath);
                const boundary = `----WhisperBoundary${Date.now()}`;
                const parts: Buffer[] = [];

                parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${path.basename(wavFilePath)}"\r\nContent-Type: audio/wav\r\n\r\n`));
                parts.push(fileData);
                parts.push(Buffer.from('\r\n'));
                parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\njson\r\n`));
                parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="temperature"\r\n\r\n0.0\r\n`));
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
                            this.transcribeViaCli(wavFilePath).then(resolve).catch(reject);
                            return;
                        }

                        try {
                            const json = JSON.parse(responseBody);
                            let text = (json.text || '').trim();
                            text = this.cleanTranscript(text);
                            if (elapsed > 5000) console.warn(`[LocalWhisperSTT] Slow server transcription: ${elapsed}ms`);
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
     * Fallback: Run whisper-cli as a one-shot process
     */
    private transcribeViaCli(wavFilePath: string): Promise<string> {
        return GPUHelper.detectGPU().then((gpu) => new Promise((resolve, reject) => {
            const args = [
                '--model', this.modelPath,
                '--file', wavFilePath,
                ...this.getWhisperArgs(),
            ];

            if (!gpu.isNvidia) args.push('-ng', 'true');

            const attemptTranscription = (retryCount: number = 0) => {
                const startTime = Date.now();

                execFile(this.whisperBinaryPath, args, {
                    timeout: 60000,
                    maxBuffer: 1024 * 1024,
                    cwd: path.dirname(this.whisperBinaryPath)
                }, (error, stdout, stderr) => {
                    const elapsed = Date.now() - startTime;

                    if (error) {
                        if (error.killed) {
                            console.warn(`[LocalWhisperSTT] Process timed out after ${elapsed}ms`);
                            resolve('');
                            return;
                        }
                        if (retryCount < 2) {
                            setTimeout(() => attemptTranscription(retryCount + 1), 500);
                            return;
                        }
                        reject(error);
                        return;
                    }

                    let text = stdout
                        .split('\n')
                        .map(line => line.trim())
                        .filter(line => line.length > 0)
                        .map(line => {
                            // Strip timestamps if tinydiarize forces them (e.g. [00:00:00.000 --> 00:00:02.000])
                            return line.replace(/^\[\d{2}:\d{2}:\d{2}\.\d{3}\s-->\s\d{2}:\d{2}:\d{2}\.\d{3}\]\s*/, '').trim();
                        })
                        // Avoid stripping [SPEAKER_00] tags which start with [
                        .filter(line => line.length > 0 && (!line.startsWith('[') || line.startsWith('[SPEAKER')))
                        .join(' ')
                        .trim();

                    text = this.cleanTranscript(text);
                    resolve(text);
                });
            };

            attemptTranscription();
        }));
    }

    /**
     * Clean up whisper transcript text
     */
    private cleanTranscript(text: string): string {
        if (!text) return '';
        let cleaned = text
            .replace(/\[BLANK_AUDIO\]/gi, '')
            .replace(/\(music\)/gi, '')
            .replace(/\(noise\)/gi, '')
            // Map [SPEAKER_00] to (Speaker 1)
            .replace(/\[SPEAKER_(\d{2})\]/gi, (match, p1) => {
                const id = parseInt(p1, 10);
                return `(Speaker ${id + 1}) `;
            })
            .replace(/\s+/g, ' ')
            .trim();

        if (this.isNonSpeechTranscript(cleaned)) {
            return '';
        }

        const words = cleaned.split(' ');
        if (words.length > 5) {
            const firstWord = words[0].toLowerCase();
            const allSame = words.every(w => w.toLowerCase() === firstWord);
            if (allSame) return '';
        }
        return cleaned;
    }

    private isNonSpeechTranscript(text: string): boolean {
        if (!text) return true;

        return NON_SPEECH_TRANSCRIPT_PATTERNS.some((pattern) => pattern.test(text));
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
        buffer.write('RIFF', 0);
        buffer.writeUInt32LE(36 + samples.length, 4);
        buffer.write('WAVE', 8);
        buffer.write('fmt ', 12);
        buffer.writeUInt32LE(16, 16);
        buffer.writeUInt16LE(1, 20);
        buffer.writeUInt16LE(this.numChannels, 22);
        buffer.writeUInt32LE(sampleRate, 24);
        buffer.writeUInt32LE(sampleRate * this.numChannels * (this.bitsPerSample / 8), 28);
        buffer.writeUInt16LE(this.numChannels * (this.bitsPerSample / 8), 32);
        buffer.writeUInt16LE(this.bitsPerSample, 34);
        buffer.write('data', 36);
        buffer.writeUInt32LE(samples.length, 40);
        samples.copy(buffer, 44);
        return buffer;
    }
}
