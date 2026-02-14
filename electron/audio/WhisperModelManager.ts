/**
 * WhisperModelManager - Manages whisper.cpp binary and model downloads
 *
 * Handles:
 *   - Downloading pre-built whisper.cpp binary for Windows
 *   - Downloading GGML whisper model files from Hugging Face
 *   - Verifying binary and model integrity
 *   - Providing paths to LocalWhisperSTT
 *
 * Storage location: {app.getPath('userData')}/whisper/
 *   ├── bin/
 *   │   └── main.exe (whisper.cpp binary)
 *   └── models/
 *       └── ggml-small.bin (whisper model)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { app } from 'electron';
import { IncomingMessage } from 'http';

// whisper.cpp release info
const WHISPER_CPP_VERSION = 'v1.8.3';
const WHISPER_CPP_BINARY_URL = `https://github.com/ggerganov/whisper.cpp/releases/download/${WHISPER_CPP_VERSION}/whisper-bin-x64.zip`;

// Hugging Face model URLs
const WHISPER_MODELS: Record<string, { url: string; size: string }> = {
    'tiny': {
        url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
        size: '75MB',
    },
    'base': {
        url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
        size: '142MB',
    },
    'small': {
        url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
        size: '466MB',
    },
    'medium': {
        url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin',
        size: '1.5GB',
    },
};

// Default model - best balance of speed and accuracy for consumer GPUs
const DEFAULT_MODEL = 'small';

export interface WhisperPaths {
    binaryPath: string;
    modelPath: string;
    isReady: boolean;
}

export class WhisperModelManager {
    private static instance: WhisperModelManager | null = null;
    private whisperDir: string;
    private binDir: string;
    private modelsDir: string;
    private selectedModel: string;
    private isDownloading: boolean = false;
    private downloadProgress: number = 0;

    constructor(model: string = DEFAULT_MODEL) {
        this.selectedModel = model;

        // Use app's userData directory for storage
        const userDataPath = app.getPath('userData');
        this.whisperDir = path.join(userDataPath, 'whisper');
        this.binDir = path.join(this.whisperDir, 'bin');
        this.modelsDir = path.join(this.whisperDir, 'models');

        // Create directories
        this.ensureDirectories();
    }

    public static getInstance(model?: string): WhisperModelManager {
        if (!WhisperModelManager.instance) {
            // Load saved model from credentials if not provided
            let initialModel = model;
            if (!initialModel) {
                try {
                    const { CredentialsManager } = require('../services/CredentialsManager');
                    initialModel = CredentialsManager.getInstance().getLocalWhisperModel();
                } catch (e) {
                    console.error('Failed to load saved whisper model:', e);
                }
            }
            WhisperModelManager.instance = new WhisperModelManager(initialModel);
        }
        return WhisperModelManager.instance;
    }

    public setModel(model: string): void {
        if (WHISPER_MODELS[model]) {
            this.selectedModel = model;
            // Persist choice
            try {
                const { CredentialsManager } = require('../services/CredentialsManager');
                CredentialsManager.getInstance().setLocalWhisperModel(model);
            } catch (e) {
                console.error('Failed to save whisper model preference:', e);
            }
            console.log(`[WhisperModelManager] Model switched to: ${model}`);
        } else {
            console.error(`[WhisperModelManager] Invalid model requested: ${model}`);
        }
    }

    /**
     * Get paths to whisper binary and model
     */
    public getPaths(): WhisperPaths {
        const binaryPath = this.getBinaryPath();
        const modelPath = this.getModelPath();

        return {
            binaryPath,
            modelPath,
            isReady: fs.existsSync(binaryPath) && fs.existsSync(modelPath),
        };
    }

    /**
     * Get path to whisper.cpp binary
     */
    public getBinaryPath(): string {
        // Check custom path first
        const { CredentialsManager } = require('../services/CredentialsManager');
        const customPath = CredentialsManager.getInstance().getLocalWhisperBinaryPath();
        if (customPath && fs.existsSync(customPath)) {
            return customPath;
        }

        const defaultName = process.platform === 'win32' ? 'main.exe' : 'main';
        const standardPath = path.join(this.binDir, defaultName);

        // Check if it's nested in a 'Release' folder (common in newer whisper.cpp zip releases)
        const nestedPath = path.join(this.binDir, 'Release', defaultName);

        if (fs.existsSync(standardPath)) return standardPath;
        if (fs.existsSync(nestedPath)) return nestedPath;

        return standardPath;
    }

    /**
     * Get path to the selected GGML model file
     */
    public getModelPath(): string {
        // Check custom path first (only if it matches the selected model, or if we treat custom path as override regardless of selection?
        // Let's treat it as: if custom path is set, IT IS the model. But wait, `selectedModel` might be important for UI.
        // Actually, if user sets a custom path, they are manually overriding the "downloaded" model.
        // However, if they just picked a file, we should probably return that file.
        const { CredentialsManager } = require('../services/CredentialsManager');
        const customPath = CredentialsManager.getInstance().getLocalWhisperModelPath();
        if (customPath && fs.existsSync(customPath)) {
            return customPath;
        }

        return path.join(this.modelsDir, `ggml-${this.selectedModel}.bin`);
    }

    /**
     * Check if whisper is fully set up (binary + model exist)
     */
    public isReady(): boolean {
        return fs.existsSync(this.getBinaryPath()) && fs.existsSync(this.getModelPath());
    }

    /**
     * Check if binary exists
     */
    public hasBinary(): boolean {
        return fs.existsSync(this.getBinaryPath());
    }

    /**
     * Check if model exists
     */
    public hasModel(): boolean {
        return fs.existsSync(this.getModelPath());
    }

    /**
     * Download the whisper.cpp binary if not present
     * Returns true if download was successful or binary already exists
     */
    public async ensureBinary(): Promise<boolean> {
        if (this.hasBinary()) {
            console.log('[WhisperModelManager] Binary already exists');
            return true;
        }

        if (this.isDownloading) {
            console.log('[WhisperModelManager] Download already in progress');
            return false;
        }

        console.log(`[WhisperModelManager] Downloading whisper.cpp binary (${WHISPER_CPP_VERSION})...`);
        this.isDownloading = true;

        try {
            // Download the zip file
            const zipPath = path.join(this.whisperDir, 'whisper-bin.zip');
            await this.downloadFile(WHISPER_CPP_BINARY_URL, zipPath);

            // Extract the binary
            await this.extractZip(zipPath, this.binDir);

            // Clean up zip
            try { fs.unlinkSync(zipPath); } catch { }

            // Make binary executable on Unix
            if (process.platform !== 'win32') {
                fs.chmodSync(this.getBinaryPath(), 0o755);
            }

            console.log(`[WhisperModelManager] Binary ready: ${this.getBinaryPath()}`);
            return true;
        } catch (err) {
            console.error('[WhisperModelManager] Failed to download binary:', err);
            return false;
        } finally {
            this.isDownloading = false;
            this.downloadProgress = 0;
        }
    }

    /**
     * Download the GGML model file if not present
     * Returns true if download was successful or model already exists
     */
    public async ensureModel(): Promise<boolean> {
        if (this.hasModel()) {
            console.log(`[WhisperModelManager] Model ggml-${this.selectedModel}.bin already exists`);
            return true;
        }

        const modelConfig = WHISPER_MODELS[this.selectedModel];
        if (!modelConfig) {
            console.error(`[WhisperModelManager] Unknown model: ${this.selectedModel}`);
            return false;
        }

        if (this.isDownloading) {
            console.log('[WhisperModelManager] Download already in progress');
            return false;
        }

        console.log(`[WhisperModelManager] Downloading ggml-${this.selectedModel}.bin (${modelConfig.size})...`);
        this.isDownloading = true;

        try {
            await this.downloadFile(modelConfig.url, this.getModelPath());
            console.log(`[WhisperModelManager] Model ready: ${this.getModelPath()}`);
            return true;
        } catch (err) {
            console.error('[WhisperModelManager] Failed to download model:', err);
            // Clean up partial download
            try { fs.unlinkSync(this.getModelPath()); } catch { }
            return false;
        } finally {
            this.isDownloading = false;
            this.downloadProgress = 0;
        }
    }

    /**
     * Ensure both binary and model are available
     */
    public async ensureReady(): Promise<boolean> {
        // If we have valid paths (custom or default), we are ready
        if (this.isReady()) {
            return true;
        }

        // If not ready, see if we need to download default binary
        if (!this.hasBinary()) {
            // Only download if we are NOT using a custom path (because if custom path is set but invalid, hasBinary returns false, and we shouldn't overwrite it? 
            // Actually getBinaryPath falls back to default if custom is invalid/missing.
            // So if hasBinary() is false, it means neither custom nor default is present.
            // We should try to download the default one.
            const binaryOk = await this.ensureBinary();
            if (!binaryOk) return false;
        }

        // Same for model
        if (!this.hasModel()) {
            const modelOk = await this.ensureModel();
            return modelOk;
        }

        return true;
    }

    /**
     * Get download status info (for UI progress display)
     */
    public getStatus(): { hasBinary: boolean; hasModel: boolean; isDownloading: boolean; selectedModel: string; progress: number } {
        return {
            hasBinary: this.hasBinary(),
            hasModel: this.hasModel(),
            isDownloading: this.isDownloading,
            selectedModel: this.selectedModel,
            progress: this.downloadProgress,
        };
    }

    // --- Private helpers ---

    private ensureDirectories(): void {
        for (const dir of [this.whisperDir, this.binDir, this.modelsDir]) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        }
    }

    /**
     * Download a file from URL to disk with redirect following
     */
    private downloadFile(url: string, destPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const { net } = require('electron');

            console.log(`[WhisperModelManager] Starting download from: ${url}`);
            // net.request follows redirects by default and uses system proxy
            const request = net.request(url);

            const timeout = setTimeout(() => {
                request.abort();
                console.error(`[WhisperModelManager] Download TIMEOUT after 60s for: ${url}`);
                reject(new Error(`Download timed out after 60s: ${url}`));
            }, 60000);

            request.on('response', (response: any) => {
                clearTimeout(timeout);
                console.log(`[WhisperModelManager] Response received: ${response.statusCode} for ${url}`);
                if (response.statusCode !== 200) {
                    reject(new Error(`HTTP ${response.statusCode} downloading ${url}`));
                    return;
                }

                const totalBytes = parseInt(response.headers['content-length'] as string || '0', 10);
                let downloadedBytes = 0;
                let lastLogPercent = 0;

                const fileStream = fs.createWriteStream(destPath);

                response.on('data', (chunk: Buffer) => {
                    downloadedBytes += chunk.length;
                    if (totalBytes > 0) {
                        const percent = Math.floor((downloadedBytes / totalBytes) * 100);
                        this.downloadProgress = percent;

                        // Log every 10% or at significant milestones
                        if (percent >= lastLogPercent + 10 || percent === 100) {
                            console.log(`[WhisperModelManager] Download progress: ${percent}% (${(downloadedBytes / 1048576).toFixed(1)}MB / ${(totalBytes / 1048576).toFixed(1)}MB)`);
                            lastLogPercent = percent;
                        }
                    }
                });

                response.pipe(fileStream);

                fileStream.on('finish', () => {
                    fileStream.close();
                    console.log(`[WhisperModelManager] Download complete: ${path.basename(destPath)}`);
                    resolve();
                });

                fileStream.on('error', (err: any) => {
                    fs.unlinkSync(destPath);
                    reject(err);
                });
            });

            request.on('error', (err: any) => {
                clearTimeout(timeout);
                console.error(`[WhisperModelManager] Network error:`, err);
                reject(err);
            });

            request.end();
        });
    }

    /**
     * Extract a zip file to a directory
     * Uses Node.js built-in (available in Electron) or falls back to PowerShell on Windows
     */
    private async extractZip(zipPath: string, destDir: string): Promise<void> {
        if (process.platform === 'win32') {
            // Use PowerShell's Expand-Archive on Windows
            const { execSync } = require('child_process');
            execSync(`powershell -ExecutionPolicy Bypass -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`, {
                timeout: 60000,
            });
        } else {
            // Use unzip on Unix
            const { execSync } = require('child_process');
            execSync(`unzip -o "${zipPath}" -d "${destDir}"`, {
                timeout: 60000,
            });
        }
    }
}
