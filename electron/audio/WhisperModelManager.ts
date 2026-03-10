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
let WHISPER_CPP_VERSION = 'v1.8.3'; // Fallback
let cachedBinaryUrls: { cpu: string; cuda: string; source?: string } | null = null;
const CUDA_RUNTIME_DLLS = ['cublas64_12.dll', 'cublasLt64_12.dll', 'cudart64_12.dll'];

/**
 * Get download URLs for whisper binaries.
 * Windows: Returns both CPU-only and CUDA-enabled pre-built URLs.
 * macOS: Returns source tarball URL (no pre-built macOS binaries available).
 */
const getWhisperBinaryUrls = async (): Promise<{ cpu: string; cuda: string; source?: string } | null> => {
    if (process.platform !== 'win32' && process.platform !== 'darwin') return null;
    if (cachedBinaryUrls) return cachedBinaryUrls;

    // Try to dynamically fetch the newest release from GitHub
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const res = await fetch('https://api.github.com/repos/ggerganov/whisper.cpp/releases/latest', {
            headers: { 'User-Agent': 'GhostWriter-App' },
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.ok) {
            const data = await res.json();
            WHISPER_CPP_VERSION = data.tag_name;

            if (process.platform === 'darwin') {
                // macOS: use source tarball (no pre-built binaries available)
                cachedBinaryUrls = {
                    cpu: data.tarball_url || `https://github.com/ggml-org/whisper.cpp/archive/refs/tags/${WHISPER_CPP_VERSION}.tar.gz`,
                    cuda: data.tarball_url || `https://github.com/ggml-org/whisper.cpp/archive/refs/tags/${WHISPER_CPP_VERSION}.tar.gz`,
                    source: data.tarball_url || `https://github.com/ggml-org/whisper.cpp/archive/refs/tags/${WHISPER_CPP_VERSION}.tar.gz`,
                };
                return cachedBinaryUrls;
            }

            const cpuAsset = data.assets?.find((a: any) => a.name === 'whisper-bin-x64.zip');
            const cudaAsset = data.assets?.find((a: any) =>
                a.name.includes('cublas-12') && a.name.includes('x64'));

            if (cpuAsset && cudaAsset) {
                cachedBinaryUrls = {
                    cpu: cpuAsset.browser_download_url,
                    cuda: cudaAsset.browser_download_url,
                };
                return cachedBinaryUrls;
            }
        }
    } catch (e) { /* Silent fallback */ }

    if (process.platform === 'darwin') {
        cachedBinaryUrls = {
            cpu: `https://github.com/ggml-org/whisper.cpp/archive/refs/tags/${WHISPER_CPP_VERSION}.tar.gz`,
            cuda: `https://github.com/ggml-org/whisper.cpp/archive/refs/tags/${WHISPER_CPP_VERSION}.tar.gz`,
            source: `https://github.com/ggml-org/whisper.cpp/archive/refs/tags/${WHISPER_CPP_VERSION}.tar.gz`,
        };
        return cachedBinaryUrls;
    }

    cachedBinaryUrls = {
        cpu: `https://github.com/ggml-org/whisper.cpp/releases/download/${WHISPER_CPP_VERSION}/whisper-bin-x64.zip`,
        cuda: `https://github.com/ggml-org/whisper.cpp/releases/download/${WHISPER_CPP_VERSION}/whisper-cublas-12.4.0-bin-x64.zip`,
    };
    return cachedBinaryUrls;
};

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
    'small-tdrz': {
        url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en-tdrz.bin',
        size: '466MB',
    },
    'medium': {
        url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin',
        size: '1.5GB',
    },
    'large': {
        url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large.bin',
        size: '6.2GB',
    },
};

// Default model depends on hardware:
//   - NVIDIA GPU: 'medium' (best accuracy, 1.5GB loads into VRAM in ~2s)
//   - CPU-only:   'tiny'   (fastest CPU inference, 74MB loads in <1s)
const GPU_DEFAULT_MODEL = 'small-tdrz';
const CPU_DEFAULT_MODEL = 'tiny';
const DEFAULT_MODEL = 'small-tdrz'; // Switch default to tdrz for new features

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
    private downloadingModelName: string | null = null;
    private hasUserExplicitlyChosen: boolean = false;

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
            let explicitChoice = false;
            if (!initialModel) {
                try {
                    const { CredentialsManager } = require('../services/CredentialsManager');
                    const saved = CredentialsManager.getInstance().getLocalWhisperModel();
                    if (saved) {
                        initialModel = saved;
                        explicitChoice = true;
                    }
                } catch (e) {
                    console.error('Failed to load saved whisper model:', e);
                }
            } else {
                explicitChoice = true;
            }
            WhisperModelManager.instance = new WhisperModelManager(initialModel);
            WhisperModelManager.instance.hasUserExplicitlyChosen = explicitChoice;

            // Auto-detect optimal model based on GPU if user hasn't explicitly chosen
            if (!explicitChoice) {
                WhisperModelManager.instance.autoSelectModel();
            }
        }
        return WhisperModelManager.instance;
    }

    /**
     * Auto-detect GPU and select the optimal whisper model.
     * Only called when the user hasn't explicitly chosen a model.
     */
    private async autoSelectModel(): Promise<void> {
        try {
            const { GPUHelper } = require('../utils/GPUHelper');
            const gpu = await GPUHelper.detectGPU();

            if (gpu.isNvidia && gpu.vramGB >= 4) {
                // GPU user: use medium for best accuracy
                if (this.selectedModel !== GPU_DEFAULT_MODEL) {
                    console.log(`[WhisperModelManager] NVIDIA GPU detected (${gpu.name}, ${gpu.vramGB}GB). Auto-selecting '${GPU_DEFAULT_MODEL}' model for best accuracy.`);
                    this.selectedModel = GPU_DEFAULT_MODEL;
                }
            } else {
                // CPU-only or low VRAM: use tiny for fast inference
                console.log(`[WhisperModelManager] No NVIDIA GPU detected (${gpu.name}). Auto-selecting '${CPU_DEFAULT_MODEL}' model for fast CPU inference.`);
                this.selectedModel = CPU_DEFAULT_MODEL;
            }
        } catch (e) {
            console.warn('[WhisperModelManager] GPU detection failed, keeping default model:', e);
        }
    }

    public setModel(model: string): void {
        if (WHISPER_MODELS[model]) {
            if (this.selectedModel === model) {
                return;
            }
            this.selectedModel = model;
            this.hasUserExplicitlyChosen = true;
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
     * Get path to whisper.cpp binary.
     * Binaries live in AppData/Roaming/ghost-writer/whisper/bin/ (downloaded on-demand).
     */
    public getBinaryPath(): string {
        // Check custom path first
        const { CredentialsManager } = require('../services/CredentialsManager');
        const customPath = CredentialsManager.getInstance().getLocalWhisperBinaryPath();
        if (customPath && fs.existsSync(customPath)) {
            return customPath;
        }

        const defaultName = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
        const legacyName = process.platform === 'win32' ? 'main.exe' : 'main';

        // Check for whisper-cli first (new name), then main (deprecated)
        for (const name of [defaultName, legacyName]) {
            const standardPath = path.join(this.binDir, name);
            const nestedPath = path.join(this.binDir, 'Release', name);

            if (fs.existsSync(nestedPath)) return nestedPath;
            if (fs.existsSync(standardPath)) return standardPath;
        }

        return path.join(this.binDir, defaultName);
    }

    /**
     * Get path to the selected GGML model file
     */
    public getModelPath(): string {
        // First check if the selected model's standard file exists
        const standardPath = path.join(this.modelsDir, `ggml-${this.selectedModel}.bin`);
        if (fs.existsSync(standardPath)) {
            return standardPath;
        }

        // Fall back to custom path only if standard path doesn't exist
        const { CredentialsManager } = require('../services/CredentialsManager');
        const customPath = CredentialsManager.getInstance().getLocalWhisperModelPath();
        if (customPath && fs.existsSync(customPath)) {
            return customPath;
        }

        // Return the standard path (even if it doesn't exist)
        return standardPath;
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
     * Check if the SELECTED model file exists
     * This checks specifically for ggml-{selectedModel}.bin, NOT custom paths
     */
    public hasModel(): boolean {
        const standardPath = path.join(this.modelsDir, `ggml-${this.selectedModel}.bin`);
        if (fs.existsSync(standardPath)) {
            return true;
        }
        // Also accept custom path as a fallback
        const { CredentialsManager } = require('../services/CredentialsManager');
        const customPath = CredentialsManager.getInstance().getLocalWhisperModelPath();
        return !!(customPath && fs.existsSync(customPath));
    }

    /**
     * Check if the current binary has GPU acceleration support.
     * Windows: CUDA build includes ggml-cuda.dll alongside the binaries.
     * macOS: Apple Silicon uses Metal acceleration natively (always available if binary exists).
     */
    public hasCUDASupport(): boolean {
        if (process.platform === 'darwin') {
            // macOS Apple Silicon always uses Metal GPU acceleration when built from source
            return this.hasBinary();
        }

        const candidateDirs = [this.binDir, path.join(this.binDir, 'Release')];

        return candidateDirs.some((dir) => {
            if (!fs.existsSync(dir)) {
                return false;
            }

            // Older whisper.cpp CUDA bundles included ggml-cuda.dll directly.
            if (fs.existsSync(path.join(dir, 'ggml-cuda.dll'))) {
                return true;
            }

            // Newer cublas builds ship CUDA runtime DLLs next to whisper-cli.exe/whisper-server.exe.
            const hasRuntimeSet = CUDA_RUNTIME_DLLS.every((file) => fs.existsSync(path.join(dir, file)));
            const hasWhisperExecutable =
                fs.existsSync(path.join(dir, 'whisper-cli.exe')) ||
                fs.existsSync(path.join(dir, 'whisper-server.exe')) ||
                fs.existsSync(path.join(dir, 'main.exe'));

            return hasRuntimeSet && hasWhisperExecutable;
        });
    }

    /**
     * Download the whisper.cpp binary if not present.
     * Automatically selects the correct build (CUDA or CPU) based on GPU detection.
     * Returns true if download was successful or binary already exists.
     */
    public async ensureBinary(): Promise<boolean> {
        // If already extracted or we have any acceptable binary, return true
        if (this.hasBinary()) {
            console.log('[WhisperModelManager] Binary already exists');
            // Check if we should upgrade to CUDA build
            try {
                const { GPUHelper } = require('../utils/GPUHelper');
                const gpu = await GPUHelper.detectGPU();
                if (gpu.isNvidia && !this.hasCUDASupport()) {
                    console.log('[WhisperModelManager] NVIDIA GPU detected but no CUDA binary. Downloading GPU-enabled build...');
                    return this.downloadBinary(true);
                }
            } catch (e) {
                console.warn('[WhisperModelManager] GPU check failed, keeping existing binary:', e);
            }
            return true;
        }

        if (this.isDownloading) {
            console.log('[WhisperModelManager] Download already in progress');
            return false;
        }

        // Auto-detect GPU for initial download
        let useGPU = false;
        try {
            const { GPUHelper } = require('../utils/GPUHelper');
            const gpu = await GPUHelper.detectGPU();
            useGPU = gpu.isNvidia;
            if (useGPU) {
                console.log(`[WhisperModelManager] NVIDIA GPU detected (${gpu.name}). Will download CUDA-enabled build.`);
            } else {
                console.log(`[WhisperModelManager] No NVIDIA GPU. Will download CPU-only build.`);
            }
        } catch (e) {
            console.warn('[WhisperModelManager] GPU detection failed, downloading CPU build:', e);
        }

        return this.downloadBinary(useGPU);
    }

    /**
     * Download the whisper binary (CPU or CUDA variant).
     * On macOS, builds from source since no pre-built binaries are available.
     */
    private async downloadBinary(cuda: boolean): Promise<boolean> {
        const urls = await getWhisperBinaryUrls();
        if (!urls) {
            console.warn(`[WhisperModelManager] No download URL for platform ${process.platform}.`);
            return false;
        }

        // macOS: build from source
        if (process.platform === 'darwin' && urls.source) {
            return this.buildFromSource(urls.source);
        }

        const url = cuda ? urls.cuda : urls.cpu;
        const buildType = cuda ? 'CUDA (GPU-enabled)' : 'CPU-only';
        console.log(`[WhisperModelManager] Downloading ${buildType} whisper binary from ${url} (${WHISPER_CPP_VERSION})...`);
        this.isDownloading = true;

        try {
            // Clear existing binaries before downloading new ones
            if (fs.existsSync(this.binDir)) {
                const existingFiles = fs.readdirSync(this.binDir);
                for (const file of existingFiles) {
                    const filePath = path.join(this.binDir, file);
                    try { fs.unlinkSync(filePath); } catch { }
                }
            }

            // Download the zip file
            const zipPath = path.join(this.whisperDir, 'whisper-bin.zip');
            this.downloadingModelName = cuda ? 'binary-cuda' : 'binary';
            await this.downloadFile(url, zipPath);

            // Extract the binary
            await this.extractZip(zipPath, this.binDir);

            // Clean up zip
            try { fs.unlinkSync(zipPath); } catch { }

            // Make binary executable on Unix
            if (process.platform !== 'win32') {
                fs.chmodSync(this.getBinaryPath(), 0o755);
            }

            console.log(`[WhisperModelManager] ${buildType} binary ready: ${this.getBinaryPath()}`);
            if (cuda) {
                console.log(`[WhisperModelManager] CUDA support: ${this.hasCUDASupport() ? 'YES ✅' : 'NO ❌'}`);
            }
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
     * Build whisper.cpp from source on macOS.
     * Downloads the source tarball, extracts, compiles with cmake+make.
     * Apple Silicon Metal GPU acceleration is enabled automatically.
     */
    private async buildFromSource(sourceUrl: string): Promise<boolean> {
        console.log(`[WhisperModelManager] Building whisper.cpp from source for macOS (Metal GPU acceleration)...`);
        this.isDownloading = true;
        this.downloadingModelName = 'binary';

        const buildDir = path.join(this.whisperDir, 'build-src');

        try {
            // Clean previous build
            if (fs.existsSync(buildDir)) {
                const { execSync } = require('child_process');
                execSync(`rm -rf "${buildDir}"`, { timeout: 10000 });
            }
            fs.mkdirSync(buildDir, { recursive: true });

            // Clear existing binaries
            if (fs.existsSync(this.binDir)) {
                const existingFiles = fs.readdirSync(this.binDir);
                for (const file of existingFiles) {
                    const filePath = path.join(this.binDir, file);
                    try { fs.unlinkSync(filePath); } catch { }
                }
            }
            fs.mkdirSync(this.binDir, { recursive: true });

            // Download source tarball
            const tarballPath = path.join(this.whisperDir, 'whisper-src.tar.gz');
            this.downloadProgress = 5;
            console.log(`[WhisperModelManager] Downloading source from ${sourceUrl}...`);
            await this.downloadFile(sourceUrl, tarballPath);

            this.downloadProgress = 30;
            console.log('[WhisperModelManager] Extracting source...');

            // Extract tarball
            const { execSync } = require('child_process');
            execSync(`tar -xzf "${tarballPath}" -C "${buildDir}" --strip-components=1`, {
                timeout: 60000,
            });

            // Clean up tarball
            try { fs.unlinkSync(tarballPath); } catch { }

            this.downloadProgress = 40;
            console.log('[WhisperModelManager] Compiling whisper.cpp (this may take 1-2 minutes)...');

            // Build with cmake (Metal is enabled by default on macOS Apple Silicon)
            const cmakeBuildDir = path.join(buildDir, 'build');
            fs.mkdirSync(cmakeBuildDir, { recursive: true });

            execSync(`cmake .. -DCMAKE_BUILD_TYPE=Release`, {
                cwd: cmakeBuildDir,
                timeout: 60000,
                stdio: 'pipe',
            });

            this.downloadProgress = 60;

            execSync(`cmake --build . --config Release -j$(sysctl -n hw.logicalcpu)`, {
                cwd: cmakeBuildDir,
                timeout: 300000, // 5 minutes for compilation
                stdio: 'pipe',
            });

            this.downloadProgress = 90;

            // Find and copy the built binary to our bin directory
            const possiblePaths = [
                path.join(cmakeBuildDir, 'bin', 'whisper-cli'),
                path.join(cmakeBuildDir, 'bin', 'main'),
                path.join(cmakeBuildDir, 'whisper-cli'),
                path.join(cmakeBuildDir, 'main'),
            ];

            let builtBinaryPath: string | null = null;
            for (const p of possiblePaths) {
                if (fs.existsSync(p)) {
                    builtBinaryPath = p;
                    break;
                }
            }

            if (!builtBinaryPath) {
                // Search recursively for whisper-cli
                try {
                    const findResult = execSync(`find "${cmakeBuildDir}" -name "whisper-cli" -type f`, {
                        timeout: 5000,
                        encoding: 'utf-8',
                    }).trim();
                    if (findResult) {
                        builtBinaryPath = findResult.split('\n')[0];
                    }
                } catch { }
            }

            if (!builtBinaryPath) {
                throw new Error('Build succeeded but could not find whisper-cli binary');
            }

            // Copy binary to bin directory
            const destPath = path.join(this.binDir, 'whisper-cli');
            fs.copyFileSync(builtBinaryPath, destPath);
            fs.chmodSync(destPath, 0o755);

            this.downloadProgress = 100;
            console.log(`[WhisperModelManager] macOS binary built and ready: ${destPath}`);
            console.log('[WhisperModelManager] Metal GPU acceleration: ENABLED ✅');

            // Clean up build directory
            try {
                execSync(`rm -rf "${buildDir}"`, { timeout: 10000 });
            } catch { }

            return true;
        } catch (err) {
            console.error('[WhisperModelManager] Failed to build from source:', err);
            // Provide helpful error message
            if (String(err).includes('cmake') || String(err).includes('not found')) {
                console.error('[WhisperModelManager] Xcode Command Line Tools may not be installed.');
                console.error('[WhisperModelManager] Install with: xcode-select --install');
            }
            return false;
        } finally {
            this.isDownloading = false;
            this.downloadProgress = 0;
            // Clean up build dir on failure too
            try {
                if (fs.existsSync(buildDir)) {
                    const { execSync } = require('child_process');
                    execSync(`rm -rf "${buildDir}"`, { timeout: 10000 });
                }
            } catch { }
        }
    }

    /**
     * Download the GGML model file if not present
     * Returns true if download was successful or model already exists
     */
    public async ensureModel(): Promise<boolean> {
        // Check specifically for the selected model's standard path
        const standardPath = path.join(this.modelsDir, `ggml-${this.selectedModel}.bin`);
        if (fs.existsSync(standardPath)) {
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
            await this.downloadFile(modelConfig.url, standardPath);
            console.log(`[WhisperModelManager] Model ready: ${standardPath}`);
            return true;
        } catch (err) {
            console.error('[WhisperModelManager] Failed to download model:', err);
            // Clean up partial download
            try { fs.unlinkSync(standardPath); } catch { }
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
    public getStatus(): { hasBinary: boolean; hasModel: boolean; isDownloading: boolean; selectedModel: string; progress: number; installedModels: Record<string, boolean>; downloadingModel: string | null; customBinaryPath?: string; customModelPath?: string } {
        const { CredentialsManager } = require('../services/CredentialsManager');
        const customBinaryPath = CredentialsManager.getInstance().getLocalWhisperBinaryPath();
        const customModelPath = CredentialsManager.getInstance().getLocalWhisperModelPath();

        return {
            hasBinary: this.hasBinary(),
            hasModel: this.hasModel(),
            isDownloading: this.isDownloading,
            selectedModel: this.selectedModel,
            progress: this.downloadProgress,
            installedModels: this.getInstalledModels(),
            downloadingModel: this.downloadingModelName,
            customBinaryPath: customBinaryPath || undefined,
            customModelPath: customModelPath || undefined,
        };
    }

    /**
     * Check which models are installed on disk
     */
    public getInstalledModels(): Record<string, boolean> {
        const result: Record<string, boolean> = {};
        for (const modelName of Object.keys(WHISPER_MODELS)) {
            result[modelName] = fs.existsSync(path.join(this.modelsDir, `ggml-${modelName}.bin`));
        }
        return result;
    }

    /**
     * Download a specific model (without changing selected model).
     * Sends progress events to all BrowserWindows.
     */
    public async downloadSpecificModel(model: string): Promise<boolean> {
        const modelConfig = WHISPER_MODELS[model];
        if (!modelConfig) {
            console.error(`[WhisperModelManager] Unknown model: ${model}`);
            return false;
        }

        const standardPath = path.join(this.modelsDir, `ggml-${model}.bin`);
        if (fs.existsSync(standardPath)) {
            console.log(`[WhisperModelManager] Model ggml-${model}.bin already exists`);
            return true;
        }

        if (this.isDownloading) {
            console.log('[WhisperModelManager] Download already in progress');
            return false;
        }

        console.log(`[WhisperModelManager] Downloading ggml-${model}.bin (${modelConfig.size})...`);
        this.isDownloading = true;
        this.downloadingModelName = model;
        this.downloadProgress = 0;
        this.broadcastDownloadProgress(model, 0);

        try {
            await this.downloadFile(modelConfig.url, standardPath);
            console.log(`[WhisperModelManager] Model ready: ${standardPath}`);
            this.broadcastDownloadProgress(model, 100);
            return true;
        } catch (err) {
            console.error('[WhisperModelManager] Failed to download model:', err);
            try { fs.unlinkSync(standardPath); } catch { }
            return false;
        } finally {
            this.isDownloading = false;
            this.downloadingModelName = null;
            this.downloadProgress = 0;
        }
    }

    /**
     * Broadcast download progress to all renderer windows
     */
    private broadcastDownloadProgress(model: string, progress: number): void {
        try {
            const { BrowserWindow } = require('electron');
            const windows = BrowserWindow.getAllWindows();
            for (const win of windows) {
                if (!win.isDestroyed()) {
                    win.webContents.send('whisper-download-progress', { model, progress });
                }
            }
        } catch (e) {
            // Ignore broadcast errors
        }
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
                console.error(`[WhisperModelManager] Download TIMEOUT after 600s for: ${url}`);
                reject(new Error(`Download timed out after 600s: ${url}`));
            }, 600000);

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

                        // Broadcast progress to renderer windows
                        if (this.downloadingModelName) {
                            this.broadcastDownloadProgress(this.downloadingModelName, percent);
                        } else {
                            this.broadcastDownloadProgress('unknown', percent);
                        }

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
