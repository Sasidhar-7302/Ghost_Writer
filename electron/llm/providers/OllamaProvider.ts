/**
 * OllamaProvider - Handles all local Ollama model interactions
 * Extracted from LLMHelper.ts for modularity
 */

import { nativeImage } from "electron";
import fs from "fs";
import { exec } from 'child_process';
import { promisify } from 'util';
import { GPUHelper, GPUInfo } from '../../utils/GPUHelper';
import { UNIVERSAL_SYSTEM_PROMPT } from "../prompts";
import { estimateTokens } from "./ILLMProvider";

const execAsync = promisify(exec);

export class OllamaProvider {
    private gpuInfo: GPUInfo | null = null;
    private initPromise: Promise<void> | null = null;
    private isInitializing: boolean = false;

    constructor(
        private ollamaUrl: string = "http://localhost:11434",
        private ollamaModel: string = ""
    ) { }

    // =========================================================================
    // Getters / Setters
    // =========================================================================

    public getModel(): string { return this.ollamaModel; }
    public setModel(model: string): void { this.ollamaModel = model; }
    public getUrl(): string { return this.ollamaUrl; }
    public setUrl(url: string): void { this.ollamaUrl = url; }

    // =========================================================================
    // Initialization
    // =========================================================================

    public async initializeGPUAndOllama(): Promise<void> {
        this.gpuInfo = await GPUHelper.detectGPU();
        console.log(`[OllamaProvider] Hardware Detected: ${this.gpuInfo.name} (${this.gpuInfo.vramGB}GB VRAM) - Tier: ${this.gpuInfo.tier}`);
        await this.initializeModel();
    }

    public async initializeModel(): Promise<void> {
        if (this.isInitializing && this.initPromise) return this.initPromise;
        this.isInitializing = true;

        this.initPromise = (async () => {
            try {
                if (!this.gpuInfo) {
                    this.gpuInfo = await GPUHelper.detectGPU();
                    console.log(`[OllamaProvider] Hardware Detected: ${this.gpuInfo.name} (${this.gpuInfo.vramGB}GB VRAM) - Tier: ${this.gpuInfo.tier}`);
                }

                // Fetch detailed model info from Ollama
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);
                let detailedModels: any[] = [];
                try {
                    const response = await fetch(`${this.ollamaUrl}/api/tags`, { signal: controller.signal });
                    clearTimeout(timeoutId);
                    if (response.ok) {
                        const data = await response.json();
                        detailedModels = data.models || [];
                    }
                } catch (e) {
                    clearTimeout(timeoutId);
                }

                if (detailedModels.length === 0) {
                    return; // Ollama is unresponsive/empty
                }

                // If user has explicitly selected a model, DO NOT override with hardware detection
                if (this.ollamaModel && this.ollamaModel !== "") {
                    const isSelectedModelInstalled = detailedModels.some(m => m.name === this.ollamaModel);
                    if (isSelectedModelInstalled) {
                        console.log(`[OllamaProvider] Using user-selected Ollama model: ${this.ollamaModel}`);
                        return;
                    } else {
                        console.warn(`[OllamaProvider] User-selected model ${this.ollamaModel} is not installed. Falling back to dynamic allocation.`);
                        this.ollamaModel = "";
                    }
                }

                // Filter out pure embedding/vision models for the main chat responder role
                let chatModels = detailedModels.filter(m => {
                    const lower = m.name.toLowerCase();
                    return !lower.includes('embed') && !lower.includes('nomic');
                });

                if (chatModels.length === 0) {
                    if (detailedModels.length > 0) this.ollamaModel = detailedModels[0].name;
                    return;
                } else {
                    // Dynamic Hardware-Aware Selection
                    const vramBytes = (this.gpuInfo?.vramGB || 4) * 1024 * 1024 * 1024;
                    const maxModelSizeBytes = Math.max(1 * 1024 * 1024 * 1024, vramBytes - (2.5 * 1024 * 1024 * 1024));

                    chatModels.sort((a, b) => b.size - a.size);

                    let selectedModel = chatModels.find(m => m.size <= maxModelSizeBytes);
                    if (!selectedModel) {
                        selectedModel = chatModels[chatModels.length - 1];
                    }

                    this.ollamaModel = selectedModel.name;
                    const sizeGB = (selectedModel.size / 1024 / 1024 / 1024).toFixed(1);
                    console.log(`[OllamaProvider] Smart selection: Auto-assigned ${this.ollamaModel} (${sizeGB} GB) safely inside ${this.gpuInfo?.vramGB}GB VRAM threshold.`);
                }

                // Final fallback
                if (!this.ollamaModel) {
                    const backups = await this.getModels();
                    if (backups.length > 0) {
                        this.ollamaModel = backups[0];
                    } else {
                        return;
                    }
                }

                // Test the selected model works
                try {
                    await this.call("Hello");
                } catch (e) {
                    console.warn(`[OllamaProvider] Initial ping to ${this.ollamaModel} failed.`);
                }
            } catch (error: any) {
                try {
                    const models = await this.getModels();
                    if (models.length > 0) {
                        this.ollamaModel = models[0];
                    }
                } catch (fallbackError: any) { }
            } finally {
                this.isInitializing = false;
            }
        })();
        return this.initPromise;
    }

    // =========================================================================
    // Non-Streaming Generation
    // =========================================================================

    /**
     * Call Ollama with a specific model override
     */
    public async callWithModel(modelId: string, prompt: string, imagePath?: string): Promise<string> {
        const promptTokens = estimateTokens(prompt);
        const contextWindow = Math.max(4096, Math.min(8192, promptTokens + (imagePath ? 2048 : 1024)));

        const body: any = {
            model: modelId,
            stream: false,
            options: {
                temperature: 0.7,
                num_ctx: contextWindow,
            }
        };

        if (imagePath) {
            const currentLower = modelId.toLowerCase();
            const isVision = ['llava', 'minicpm-v', 'moondream', 'qwen2-vl', 'qwen3-vl', 'qwen3.5'].some(v => currentLower.includes(v));

            if (!isVision) {
                const available = await this.getModels();
                const visionModel = available.find(m => {
                    const low = m.toLowerCase();
                    return (low.includes('qwen3-vl') || low.includes('qwen2-vl') || low.includes('llava') || low.includes('minicpm-v') || low.includes('moondream') || low.includes('qwen3.5'));
                });
                if (visionModel) {
                    console.log(`[OllamaProvider] Auto-switching to vision model: ${visionModel}`);
                    modelId = visionModel;
                }
            }

            if (isVision || modelId !== body.model) {
                try {
                    const img = nativeImage.createFromPath(imagePath);
                    const resized = img.resize({ width: Math.min(1024, img.getSize().width) });
                    const imageBase64 = resized.toJPEG(75).toString('base64');

                    body.model = modelId;
                    body.messages = [
                        { role: 'system', content: 'You are an AI analyzing a user\'s screen. Provide a concise, helpful response.' },
                        { role: 'user', content: prompt, images: [imageBase64] }
                    ];

                    const resp = await fetch(`${this.ollamaUrl}/api/chat`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body)
                    });

                    const data = await resp.json();
                    return data.message?.content || data.response || "";
                } catch (e) {
                    console.error("[OllamaProvider] Vision call failed:", e);
                }
            }
        }

        body.prompt = prompt;
        const resp = await fetch(`${this.ollamaUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await resp.json();
        return data.response || "";
    }

    /**
     * Call Ollama with the currently selected model
     */
    public async call(prompt: string, imagePath?: string): Promise<string> {
        return this.callWithModel(this.ollamaModel, prompt, imagePath);
    }

    // =========================================================================
    // Streaming Generation
    // =========================================================================

    /**
     * Stream response from Ollama with vision model auto-switching
     */
    public async * stream(
        message: string,
        context?: string,
        systemPrompt: string = UNIVERSAL_SYSTEM_PROMPT,
        imagePath?: string
    ): AsyncGenerator<string, void, unknown> {
        const fullPrompt = context
            ? `SYSTEM: ${systemPrompt}\nCONTEXT: ${context}\nUSER: ${message}`
            : `SYSTEM: ${systemPrompt}\nUSER: ${message}`;

        const promptTokens = estimateTokens(fullPrompt);
        const contextWindow = Math.max(4096, Math.min(8192, promptTokens + (imagePath ? 2048 : 1024)));

        try {
            let modelToUse = this.ollamaModel;
            const images: string[] = [];

            if (imagePath) {
                const currentLower = this.ollamaModel.toLowerCase();
                const isAlreadyVision = ['llava', 'minicpm-v', 'moondream', 'qwen2-vl', 'qwen3-vl', 'qwen3.5'].some(v => currentLower.includes(v));

                if (!isAlreadyVision) {
                    const available = await this.getModels();
                    const visionModel = available.find(m => {
                        const low = m.toLowerCase();
                        return (low.includes('qwen3-vl') || low.includes('qwen2-vl') || low.includes('llava') || low.includes('minicpm-v') || low.includes('moondream') || low.includes('qwen3.5'));
                    });

                    if (visionModel) {
                        console.log(`[OllamaProvider] Switching to vision model for streaming: ${visionModel}`);
                        modelToUse = visionModel;
                    } else {
                        console.warn(`[OllamaProvider] No vision model found in Ollama.`);
                        yield "⚠️ I cannot analyze this screenshot because you don't have a Vision Model installed in Ollama. Please open your terminal and run `ollama run llava:7b` or `ollama run qwen2.5-vl:7b` to enable screenshot analysis in Local Mode.";
                        return;
                    }
                } else {
                    modelToUse = this.ollamaModel;
                }
                try {
                    const img = nativeImage.createFromPath(imagePath);
                    const resized = img.resize({ width: Math.min(1024, img.getSize().width) });
                    images.push(resized.toJPEG(75).toString('base64'));
                } catch (err) {
                    console.error(`[OllamaProvider] Failed to read image:`, err);
                }
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                controller.abort();
                console.warn(`[OllamaProvider] Ollama stream timed out after 180s`);
            }, 180000);

            let lineBuffer = "";
            try {
                const isChat = images.length > 0;
                const endpoint = isChat ? '/api/chat' : '/api/generate';

                const body: any = {
                    model: modelToUse,
                    stream: true,
                    options: {
                        temperature: 0.7,
                        num_ctx: contextWindow,
                        num_thread: 8,
                    }
                };

                if (isChat) {
                    const visionPrompt = "You are an AI analyzing a user's screen. Provide a concise, helpful response regarding the contents of this image.";
                    body.messages = [
                        { role: 'system', content: visionPrompt },
                        { role: 'user', content: context ? `CONTEXT: ${context}\n\nQUESTION: ${message}` : message, images }
                    ];
                } else {
                    body.prompt = fullPrompt;
                }

                const response = await fetch(`${this.ollamaUrl}${endpoint}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                    signal: controller.signal
                });

                if (!response.body) throw new Error("No response body from Ollama");

                // @ts-ignore
                for await (const chunk of response.body) {
                    lineBuffer += new TextDecoder().decode(chunk);

                    const lines = lineBuffer.split('\n');
                    lineBuffer = lines.pop() || "";

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed) continue;
                        try {
                            const json = JSON.parse(trimmed);
                            const content = isChat ? json.message?.content : json.response;
                            if (content) yield content;
                            if (json.done) {
                                clearTimeout(timeoutId);
                                return;
                            }
                        } catch { }
                    }
                }
            } finally {
                clearTimeout(timeoutId);
            }
        } catch (error: any) {
            if (error.name === 'AbortError') {
                yield "\n\n⏱️ Response timed out. Try a shorter question or a smaller model.";
            } else {
                console.error("[OllamaProvider] Stream error:", error);
                yield `\n\nError: ${error.message}`;
            }
        }
    }

    // =========================================================================
    // Utility Methods
    // =========================================================================

    public async checkAvailable(): Promise<boolean> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            const response = await fetch(`${this.ollamaUrl}/api/tags`, { signal: controller.signal });
            clearTimeout(timeoutId);
            return response.ok;
        } catch {
            return false;
        }
    }

    public async getModels(): Promise<string[]> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        try {
            const response = await fetch(`${this.ollamaUrl}/api/tags`, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!response.ok) throw new Error('Failed to fetch models');

            const data = await response.json();
            return data.models?.map((model: any) => model.name) || [];
        } catch (error) {
            clearTimeout(timeoutId);
            console.warn("[OllamaProvider] Error fetching Ollama models:", error);
            return [];
        }
    }

    public async forceRestart(): Promise<boolean> {
        try {
            const platform = process.platform;
            if (platform === 'win32') {
                await execAsync('taskkill /F /IM ollama.exe').catch(() => { });
                await new Promise(r => setTimeout(r, 1000));
                execAsync('start "" "ollama" serve').catch(() => { });
            } else if (platform === 'darwin') {
                await execAsync('pkill -9 ollama').catch(() => { });
                await new Promise(r => setTimeout(r, 1000));
                execAsync('open -a Ollama').catch(() => { });
            } else {
                await execAsync('pkill -9 ollama').catch(() => { });
                await new Promise(r => setTimeout(r, 1000));
                execAsync('ollama serve &').catch(() => { });
            }

            // Wait for restart
            for (let i = 0; i < 10; i++) {
                await new Promise(r => setTimeout(r, 500));
                if (await this.checkAvailable()) {
                    console.log(`[OllamaProvider] Ollama restarted successfully after ${(i + 1) * 500}ms`);
                    return true;
                }
            }
            return false;
        } catch (error) {
            console.error("[OllamaProvider] Failed to restart Ollama:", error);
            return false;
        }
    }

    /**
     * Background pre-load for Ollama models to warm up VRAM
     */
    public async preloadModel(modelId: string): Promise<void> {
        if (!modelId) return;
        console.log(`[OllamaProvider] Pre-loading model: ${modelId}`);

        try {
            await fetch(`${this.ollamaUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: modelId,
                    prompt: "",
                    stream: false
                })
            });
            console.log(`[OllamaProvider] Model pre-loaded successfully: ${modelId}`);
        } catch (error) {
            console.warn(`[OllamaProvider] Pre-load failed for ${modelId}:`, error);
        }
    }

    /**
     * Generate summary with Ollama, preferring text-only models over vision models
     */
    public async generateSummary(
        systemPrompt: string,
        context: string,
        withTimeout: <T>(promise: Promise<T>, ms: number, name: string) => Promise<T>,
        processResponse: (text: string) => string
    ): Promise<string> {
        try {
            let modelToUse = this.ollamaModel;
            const currentLower = this.ollamaModel.toLowerCase();
            const isVisionModel = ['vl', 'llava', 'minicpm'].some(v => currentLower.includes(v));

            if (isVisionModel) {
                console.log(`[OllamaProvider] Selected model ${this.ollamaModel} is Vision-heavy. Searching for faster text-only summary model...`);
                const available = await this.getModels();
                const fastModel = available.find(m => {
                    const low = m.toLowerCase();
                    return (low.includes('llama3.1') || low.includes('llama3.2') || low.includes('qwen2.5') || low.includes('mistral')) && !low.includes('vl');
                });

                if (fastModel) {
                    console.log(`[OllamaProvider] Switching to ${fastModel} for faster local summarization.`);
                    modelToUse = fastModel;
                }
            }

            const response = (await withTimeout(
                this.callWithModel(modelToUse, `${systemPrompt}\n\nCONTEXT:\n${context}`),
                300000,
                "Ollama Summary"
            )) as string;

            if (response && response.trim().length > 0) {
                console.log(`[OllamaProvider] ✅ Ollama summary generated successfully.`);
                return processResponse(response);
            }
        } catch (e: any) {
            console.warn(`[OllamaProvider] ⚠️ Ollama summary failed: ${e.message}`);
        }

        throw new Error("Failed to generate summary after all fallback attempts.");
    }
}
