import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import { DEFAULT_MAX_OUTPUT_TOKENS, ILLMProvider, ChatPayload } from "./ILLMProvider";
import { GEMINI_FLASH_MODEL, GEMINI_PRO_MODEL } from "../prompts";

// Re-export model constants for use by LLMHelper orchestrator
export { GEMINI_PRO_MODEL, GEMINI_FLASH_MODEL } from "../prompts";

const MAX_OUTPUT_TOKENS = DEFAULT_MAX_OUTPUT_TOKENS;

export class GeminiProvider implements ILLMProvider {
    readonly name = "Gemini";
    readonly isVisionCapable = true;

    constructor(private client: GoogleGenAI) { }

    public isAvailable(): boolean {
        return !!this.client;
    }

    public supportsMultimodal(): boolean {
        return true;
    }

    public async testConnection(): Promise<{ success: boolean; error?: string }> {
        try {
            const response = await this.client.models.generateContent({
                model: GEMINI_FLASH_MODEL,
                contents: [{ role: 'user', parts: [{ text: 'Say "Hello"' }] }]
            });
            return response?.text ? { success: true } : { success: false, error: "Empty response" };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Non-streaming generation via interface
     */
    public async generate(payload: ChatPayload): Promise<string> {
        let fullPrompt = payload.options?.skipSystemPrompt ? "" : (payload.systemPrompt || "");
        if (payload.context) fullPrompt += `\n\nCONTEXT:\n${payload.context}`;
        fullPrompt += `\n\nUSER QUESTION:\n${payload.message}`;

        if (payload.imagePath) {
            const imageData = await fs.promises.readFile(payload.imagePath);
            return this.generateContent([
                { text: fullPrompt },
                { inlineData: { mimeType: "image/png", data: imageData.toString("base64") } }
            ], GEMINI_FLASH_MODEL);
        }

        return this.generateContent([{ text: fullPrompt }], GEMINI_FLASH_MODEL);
    }

    /**
     * Streaming generation via interface
     */
    public async * stream(payload: ChatPayload): AsyncGenerator<string, void, unknown> {
        let fullPrompt = payload.options?.skipSystemPrompt ? "" : (payload.systemPrompt || "");
        if (payload.context) fullPrompt += `\n\nCONTEXT:\n${payload.context}`;
        fullPrompt += `\n\nUSER QUESTION:\n${payload.message}`;

        if (payload.imagePath) {
            yield* this.streamMultimodal(fullPrompt, payload.imagePath, GEMINI_FLASH_MODEL);
        } else {
            yield* this.streamWithModel(fullPrompt, GEMINI_FLASH_MODEL);
        }
    }

    // =========================================================================
    // Core Generation
    // =========================================================================

    public async generateWithPro(contents: any[]): Promise<string> {
        return this.generateContent(contents, GEMINI_PRO_MODEL);
    }

    public async generateWithFlash(contents: any[]): Promise<string> {
        return this.generateContent(contents, GEMINI_FLASH_MODEL);
    }

    public async generateContent(contents: any[], model: string): Promise<string> {
        console.log(`[GeminiProvider] Calling ${model}...`);
        const response = await this.client.models.generateContent({
            model: model,
            contents: contents,
            config: {
                maxOutputTokens: MAX_OUTPUT_TOKENS,
                temperature: 0.4,
            }
        });

        const candidate = response.candidates?.[0];
        if (!candidate) return "";

        let text = "";
        if (response.text) {
            text = response.text;
        } else if (candidate.content?.parts) {
            const parts = Array.isArray(candidate.content.parts) ? candidate.content.parts : [candidate.content.parts];
            for (const part of parts) {
                if (part?.text) text += part.text;
            }
        }
        return text;
    }

    // =========================================================================
    // Streaming Helpers
    // =========================================================================

    public async * streamWithModel(fullPrompt: string, model: string): AsyncGenerator<string, void, unknown> {
        const streamResult = await this.client.models.generateContentStream({
            model: model,
            contents: [{ text: fullPrompt }],
            config: {
                maxOutputTokens: MAX_OUTPUT_TOKENS,
                temperature: 0.4,
            }
        });
        yield* this.iterateStream(streamResult);
    }

    public async * streamMultimodal(fullPrompt: string, imagePath: string, model: string): AsyncGenerator<string, void, unknown> {
        const imageData = await fs.promises.readFile(imagePath);
        const streamResult = await this.client.models.generateContentStream({
            model: model,
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: fullPrompt },
                        { inlineData: { mimeType: "image/png", data: imageData.toString("base64") } }
                    ]
                }
            ],
            config: {
                maxOutputTokens: MAX_OUTPUT_TOKENS,
                temperature: 0.4,
            }
        });
        yield* this.iterateStream(streamResult);
    }

    public async * streamParallelRace(payload: ChatPayload): AsyncGenerator<string, void, unknown> {
        let fullPrompt = payload.options?.skipSystemPrompt ? "" : (payload.systemPrompt || "");
        if (payload.context) fullPrompt += `\n\nCONTEXT:\n${payload.context}`;
        fullPrompt += `\n\nUSER QUESTION:\n${payload.message}`;

        const flashPromise = this.collectResponse(fullPrompt, GEMINI_FLASH_MODEL);
        const proPromise = this.collectResponse(fullPrompt, GEMINI_PRO_MODEL);

        const result = await Promise.any([flashPromise, proPromise]);

        const chunkSize = 10;
        for (let i = 0; i < result.length; i += chunkSize) {
            yield result.substring(i, i + chunkSize);
        }
    }

    public async collectResponse(fullPrompt: string, model: string): Promise<string> {
        const response = await this.client.models.generateContent({
            model: model,
            contents: [{ text: fullPrompt }],
            config: {
                maxOutputTokens: MAX_OUTPUT_TOKENS,
                temperature: 0.4,
            }
        });
        return response.text || "";
    }

    // =========================================================================
    // Robust Proxy logic (Kept for compatibility)
    // =========================================================================

    public createRobustClient(realClient: GoogleGenAI): GoogleGenAI {
        const modelsProxy = new Proxy(realClient.models, {
            get: (target, prop, receiver) => {
                if (prop === 'generateContent') {
                    return async (args: any) => this.generateWithFallback(realClient, args);
                }
                return Reflect.get(target, prop, receiver);
            }
        });

        return new Proxy(realClient, {
            get: (target, prop, receiver) => {
                if (prop === 'models') return modelsProxy;
                return Reflect.get(target, prop, receiver);
            }
        });
    }

    public async generateWithFallback(client: GoogleGenAI, args: any): Promise<any> {
        const originalModel = args.model;
        try {
            const response = await client.models.generateContent({ ...args, model: originalModel });
            if (response.text) return response;
        } catch (e) { }

        const flashRetryPromise = client.models.generateContent({ ...args, model: originalModel });
        const proBackupPromise = client.models.generateContent({ ...args, model: GEMINI_PRO_MODEL });

        try {
            return await Promise.any([flashRetryPromise, proBackupPromise]);
        } catch (e) {
            return client.models.generateContent({ ...args, model: originalModel });
        }
    }

    private async * iterateStream(streamResult: any): AsyncGenerator<string, void, unknown> {
        const stream = streamResult.stream || streamResult;
        for await (const chunk of stream) {
            let chunkText = "";
            if (typeof chunk.text === 'function') {
                chunkText = chunk.text();
            } else if (typeof chunk.text === 'string') {
                chunkText = chunk.text;
            } else if (chunk.candidates?.[0]?.content?.parts?.[0]?.text) {
                chunkText = chunk.candidates[0].content.parts[0].text;
            }
            if (chunkText) yield chunkText;
        }
    }
}
