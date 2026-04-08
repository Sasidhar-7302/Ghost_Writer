import fs from "fs";
import os from "os";
import path from "path";
import sharp from "sharp";

export interface PrepareImageOptions {
    runOCR?: boolean;
    maxWidth?: number;
    pngCompressionLevel?: number;
    ocrTimeoutMs?: number;
    cleanupMaxAgeMs?: number;
}

export interface PreparedImageResult {
    originalPath: string;
    processedPath: string;
    ocrText?: string;
    metadata: {
        originalSize: number;
        processedSize: number;
        width: number;
        height: number;
        usedOCR: boolean;
        temporary: boolean;
        outputDir: string;
    };
}

function resolveElectronUserDataPath(): string | null {
    try {
        // `require("electron")` returns a string in plain Node, so guard carefully.
        const electron = require("electron");
        if (!electron || typeof electron !== "object" || !electron.app) {
            return null;
        }

        const app = electron.app as { isReady?: () => boolean; getPath?: (name: string) => string };
        if (typeof app.getPath !== "function") {
            return null;
        }

        if (typeof app.isReady === "function" && !app.isReady()) {
            return null;
        }

        return app.getPath("userData");
    } catch {
        return null;
    }
}

export class MultimodalHelper {
    private static instance: MultimodalHelper;
    private cleanupComplete = false;

    public static getInstance(): MultimodalHelper {
        if (!MultimodalHelper.instance) {
            MultimodalHelper.instance = new MultimodalHelper();
        }
        return MultimodalHelper.instance;
    }

    private resolveCacheDir(): string {
        const userDataPath = resolveElectronUserDataPath();
        if (userDataPath) {
            return path.join(userDataPath, "multimodal-cache");
        }
        return path.join(os.tmpdir(), "ghost-writer", "multimodal-cache");
    }

    private ensureCacheDir(): string {
        const cacheDir = this.resolveCacheDir();
        fs.mkdirSync(cacheDir, { recursive: true });
        return cacheDir;
    }

    private async runOCR(imagePath: string, timeoutMs: number): Promise<string | undefined> {
        try {
            const ocrPromise = (async () => {
                const Tesseract = await import("tesseract.js");
                const result = await Tesseract.recognize(imagePath, "eng", {
                    logger: () => undefined
                });
                return result.data?.text?.trim() || undefined;
            })();

            return await Promise.race([
                ocrPromise,
                new Promise<undefined>((resolve) => {
                    setTimeout(() => resolve(undefined), timeoutMs);
                })
            ]);
        } catch (error) {
            console.warn("[MultimodalHelper] OCR failed, continuing without OCR:", error);
            return undefined;
        }
    }

    public async cleanupOldTempFiles(maxAgeMs = 24 * 60 * 60 * 1000): Promise<void> {
        const cacheDir = this.ensureCacheDir();
        const now = Date.now();

        try {
            const entries = await fs.promises.readdir(cacheDir, { withFileTypes: true });
            await Promise.all(entries.map(async (entry) => {
                if (!entry.isFile() || !entry.name.startsWith("gw-mm-")) {
                    return;
                }

                const fullPath = path.join(cacheDir, entry.name);
                try {
                    const stats = await fs.promises.stat(fullPath);
                    if (now - stats.mtimeMs > maxAgeMs) {
                        await fs.promises.unlink(fullPath);
                    }
                } catch {
                    // Best-effort cleanup only.
                }
            }));
        } catch {
            // Best-effort cleanup only.
        }
    }

    public async prepareImage(imagePath: string, options: PrepareImageOptions = {}): Promise<PreparedImageResult> {
        if (!fs.existsSync(imagePath)) {
            throw new Error(`Image not found: ${imagePath}`);
        }

        if (!this.cleanupComplete) {
            this.cleanupComplete = true;
            await this.cleanupOldTempFiles(options.cleanupMaxAgeMs);
        }

        const cacheDir = this.ensureCacheDir();
        const originalStats = await fs.promises.stat(imagePath);
        const outputPath = path.join(
            cacheDir,
            `gw-mm-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.png`
        );

        const source = sharp(imagePath).rotate();
        const metadata = await source.metadata();
        const width = metadata.width ?? options.maxWidth ?? 1600;
        const height = metadata.height ?? 0;

        await source
            .resize({
                width: options.maxWidth ?? 1600,
                withoutEnlargement: true
            })
            .png({
                compressionLevel: options.pngCompressionLevel ?? 3
            })
            .toFile(outputPath);

        const processedStats = await fs.promises.stat(outputPath);
        const ocrText = options.runOCR
            ? await this.runOCR(outputPath, options.ocrTimeoutMs ?? 5000)
            : undefined;

        return {
            originalPath: imagePath,
            processedPath: outputPath,
            ocrText,
            metadata: {
                originalSize: originalStats.size,
                processedSize: processedStats.size,
                width,
                height,
                usedOCR: !!ocrText,
                temporary: true,
                outputDir: cacheDir
            }
        };
    }

    public async cleanupFile(filePath: string): Promise<void> {
        if (!filePath) {
            return;
        }

        const cacheDir = path.resolve(this.ensureCacheDir());
        const resolvedPath = path.resolve(filePath);
        if (!resolvedPath.startsWith(cacheDir)) {
            return;
        }

        try {
            await fs.promises.unlink(resolvedPath);
        } catch {
            // Best-effort cleanup only.
        }
    }
}
