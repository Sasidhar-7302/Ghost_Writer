import { app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import https from 'https';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

export class AIRuntimeManager {
    private static instance: AIRuntimeManager;
    private runtimeDir: string;
    private isDownloading: boolean = false;

    // The remote URL where the pre-packaged zip file containing the missing node_modules is hosted.
    // The user should upload a zip file named "ai-runtime.zip" to their GitHub releases.
    private readonly RUNTIME_ZIP_URL = "https://github.com/Sasidhar-7302/Ghost_Writer/releases/download/v2.1.0/ai-runtime.zip";

    private constructor() {
        this.runtimeDir = path.join(app.getPath('userData'), 'ai-runtime');
    }

    public static getInstance(): AIRuntimeManager {
        if (!AIRuntimeManager.instance) {
            AIRuntimeManager.instance = new AIRuntimeManager();
        }
        return AIRuntimeManager.instance;
    }

    /**
     * Check if the runtime exists locally.
     */
    public isRuntimeInstalled(): boolean {
        const xenovaPath = path.join(this.runtimeDir, 'node_modules', '@xenova', 'transformers', 'package.json');
        return fs.existsSync(xenovaPath);
    }

    /**
     * Get the absolute path to the local transformers module for dynamic imports.
     */
    public getTransformersPath(): string {
        return path.join(this.runtimeDir, 'node_modules', '@xenova', 'transformers');
    }

    /**
     * Install the AI runtime from the remote zip.
     */
    public async installRuntime(window: BrowserWindow): Promise<void> {
        if (this.isRuntimeInstalled()) {
            window.webContents.send('ai-download-complete', { success: true });
            return;
        }

        if (this.isDownloading) {
            return;
        }

        this.isDownloading = true;

        try {
            if (!fs.existsSync(this.runtimeDir)) {
                fs.mkdirSync(this.runtimeDir, { recursive: true });
            }

            const zipPath = path.join(this.runtimeDir, 'ai-runtime.zip');

            // 1. Download the zip
            await this.downloadFile(this.RUNTIME_ZIP_URL, zipPath, window);

            // 2. Extract the zip
            window.webContents.send('ai-download-progress', { status: 'Extracting AI modules...', percent: 100 });
            await this.extractZip(zipPath, this.runtimeDir);

            // 3. Cleanup zip
            fs.unlinkSync(zipPath);

            // 4. Verify installation
            if (!this.isRuntimeInstalled()) {
                throw new Error("Target package files were not found after extraction.");
            }

            window.webContents.send('ai-download-complete', { success: true });
        } catch (error) {
            console.error('[AIRuntimeManager] Installation failed:', error);
            window.webContents.send('ai-download-complete', { success: false, error: (error as Error).message });

            // Cleanup failed attempt
            if (fs.existsSync(this.runtimeDir)) {
                fs.rmSync(this.runtimeDir, { recursive: true, force: true });
            }
        } finally {
            this.isDownloading = false;
        }
    }

    private downloadFile(url: string, dest: string, window: BrowserWindow): Promise<void> {
        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(dest);

            const request = https.get(url, (response) => {
                if (response.statusCode === 301 || response.statusCode === 302) {
                    if (response.headers.location) {
                        return resolve(this.downloadFile(response.headers.location, dest, window));
                    }
                }

                if (response.statusCode !== 200) {
                    return reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
                }

                const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
                let downloadedBytes = 0;

                response.on('data', (chunk) => {
                    downloadedBytes += chunk.length;
                    const percent = totalBytes ? Math.round((downloadedBytes / totalBytes) * 100) : 0;

                    window.webContents.send('ai-download-progress', {
                        status: `Downloading AI Runtime (${(downloadedBytes / 1024 / 1024).toFixed(1)} MB / ${(totalBytes / 1024 / 1024).toFixed(1)} MB)`,
                        percent
                    });
                });

                response.pipe(file);

                file.on('finish', () => {
                    file.close();
                    resolve();
                });
            });

            request.on('error', (err) => {
                fs.unlink(dest, () => reject(err));
            });

            file.on('error', (err) => {
                fs.unlink(dest, () => reject(err));
            });
        });
    }

    private async extractZip(zipPath: string, destDir: string): Promise<void> {
        // Fallback extraction method depending on OS since we don't want to bundle heavy unzipping packages
        const isWin = process.platform === "win32";

        try {
            if (isWin) {
                await execPromise(`powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`);
            } else {
                await execPromise(`unzip -o "${zipPath}" -d "${destDir}"`);
            }
        } catch (error) {
            throw new Error(`Extraction failed: ${(error as Error).message}`);
        }
    }
}
