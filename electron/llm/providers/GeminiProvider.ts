/**
 * GeminiProvider - Handles all Gemini (Google AI) generation and streaming
 * Extracted from LLMHelper.ts for modularity
 */

import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import { DEFAULT_MAX_OUTPUT_TOKENS } from "./ILLMProvider";

// Re-export model constants for use by LLMHelper orchestrator
export { GEMINI_PRO_MODEL, GEMINI_FLASH_MODEL } from "../prompts";

const MAX_OUTPUT_TOKENS = DEFAULT_MAX_OUTPUT_TOKENS;

export class GeminiProvider {
    constructor(private client: GoogleGenAI) { }

    // =========================================================================
    // Non-Streaming Generation
    // =========================================================================

    /**
     * Generate content using Gemini 3 Flash (text reasoning)
     * Used by IntelligenceManager for mode-specific prompts
     * NOTE: Migrated from Pro to Flash for consistency
     */
    public async generateWithPro(contents: any[]): Promise<string> {
        const { GEMINI_FLASH_MODEL } = require("../prompts");

        const response = await this.client.models.generateContent({
            model: GEMINI_FLASH_MODEL,
            contents: contents,
            config: {
                maxOutputTokens: MAX_OUTPUT_TOKENS,
                temperature: 0.3,
            }
        });
        return response.text || "";
    }

    /**
     * Generate content using Gemini 3 Flash (audio + fast multimodal)
     * CRITICAL: Audio input MUST use this model, not Pro
     */
    public async generateWithFlash(contents: any[]): Promise<string> {
        const { GEMINI_FLASH_MODEL } = require("../prompts");

        const response = await this.client.models.generateContent({
            model: GEMINI_FLASH_MODEL,
            contents: contents,
            config: {
                maxOutputTokens: MAX_OUTPUT_TOKENS,
                temperature: 0.3,
            }
        });
        return response.text || "";
    }

    /**
     * Generate content using the specified Gemini model with robust response extraction
     */
    public async generateContent(contents: any[], model: string): Promise<string> {
        console.log(`[GeminiProvider] Calling ${model}...`);

        // @ts-ignore
        const response = await this.client.models.generateContent({
            model: model,
            contents: contents,
            config: {
                maxOutputTokens: MAX_OUTPUT_TOKENS,
                temperature: 0.4,
            }
        });

        const candidate = response.candidates?.[0];
        if (!candidate) {
            console.error("[GeminiProvider] No candidates returned!");
            return "";
        }

        if (candidate.finishReason && candidate.finishReason !== "STOP") {
            console.warn(`[GeminiProvider] Generation stopped with reason: ${candidate.finishReason}`);
        }

        // Try multiple ways to access text - handle different response structures
        let text = "";

        if (response.text) {
            text = response.text;
        } else if (candidate.content?.parts) {
            const parts = Array.isArray(candidate.content.parts) ? candidate.content.parts : [candidate.content.parts];
            for (const part of parts) {
                if (part?.text) {
                    text += part.text;
                }
            }
        } else if (typeof candidate.content === 'string') {
            text = candidate.content;
        }

        if (!text || text.trim().length === 0) {
            console.error("[GeminiProvider] Candidate found but text is empty.");
            if (candidate.finishReason === "MAX_TOKENS") {
                return "Response was truncated due to length limit. Please try a shorter question or break it into parts.";
            }
            return "";
        }

        console.log(`[GeminiProvider] Extracted text length: ${text.length}`);
        return text;
    }

    // =========================================================================
    // Streaming Generation
    // =========================================================================

    /**
     * Stream response from a specific Gemini model (text-only)
     */
    public async * streamWithModel(fullMessage: string, model: string): AsyncGenerator<string, void, unknown> {
        const streamResult = await this.client.models.generateContentStream({
            model: model,
            contents: [{ text: fullMessage }],
            config: {
                maxOutputTokens: MAX_OUTPUT_TOKENS,
                temperature: 0.4,
            }
        });

        yield* this.iterateStream(streamResult);
    }

    /**
     * Stream multimodal (image + text) response from Gemini
     */
    public async * streamMultimodal(userMessage: string, imagePath: string, model: string): AsyncGenerator<string, void, unknown> {
        const imageData = await fs.promises.readFile(imagePath);
        const base64Image = imageData.toString("base64");

        const streamResult = await this.client.models.generateContentStream({
            model: model,
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: userMessage },
                        {
                            inlineData: {
                                mimeType: "image/png",
                                data: base64Image,
                            }
                        }
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

    /**
     * Race Flash and Pro streams, return whichever succeeds first
     */
    public async * streamParallelRace(fullMessage: string): AsyncGenerator<string, void, unknown> {
        const { GEMINI_FLASH_MODEL, GEMINI_PRO_MODEL } = require("../prompts");

        const flashPromise = this.collectResponse(fullMessage, GEMINI_FLASH_MODEL);
        const proPromise = this.collectResponse(fullMessage, GEMINI_PRO_MODEL);

        const result = await Promise.any([flashPromise, proPromise]);

        const chunkSize = 10;
        for (let i = 0; i < result.length; i += chunkSize) {
            yield result.substring(i, i + chunkSize);
        }
    }

    /**
     * Collect full response from a Gemini model (non-streaming, for race)
     */
    public async collectResponse(fullMessage: string, model: string): Promise<string> {
        const response = await this.client.models.generateContent({
            model: model,
            contents: [{ text: fullMessage }],
            config: {
                maxOutputTokens: MAX_OUTPUT_TOKENS,
                temperature: 0.4,
            }
        });

        return response.text || "";
    }

    // =========================================================================
    // Robust Client Proxy (for consumer code like IntelligenceManager)
    // =========================================================================

    /**
     * Creates a proxy around the real Gemini client to intercept generation calls
     * and apply robust retry/fallback logic without modifying consumer code.
     */
    public createRobustClient(realClient: GoogleGenAI): GoogleGenAI {
        const modelsProxy = new Proxy(realClient.models, {
            get: (target, prop, receiver) => {
                if (prop === 'generateContent') {
                    return async (args: any) => {
                        return this.generateWithFallback(realClient, args);
                    };
                }
                return Reflect.get(target, prop, receiver);
            }
        });

        return new Proxy(realClient, {
            get: (target, prop, receiver) => {
                if (prop === 'models') {
                    return modelsProxy;
                }
                return Reflect.get(target, prop, receiver);
            }
        });
    }

    /**
     * ROBUST GENERATION STRATEGY (SPECULATIVE PARALLEL EXECUTION)
     * 1. Attempt with original model (Flash).
     * 2. If it fails/empties, launch Flash retry + Pro backup in parallel.
     * 3. Return whichever finishes successfully first.
     * 4. If both fail, try Flash one last time.
     */
    public async generateWithFallback(client: GoogleGenAI, args: any): Promise<any> {
        const GEMINI_PRO_MODEL = "gemini-3-pro-preview";
        const originalModel = args.model;

        const isValidResponse = (response: any) => {
            const candidate = response.candidates?.[0];
            if (!candidate) return false;
            if (response.text && response.text.trim().length > 0) return true;
            if (candidate.content?.parts?.[0]?.text && candidate.content.parts[0].text.trim().length > 0) return true;
            if (typeof candidate.content === 'string' && candidate.content.trim().length > 0) return true;
            return false;
        };

        // 1. Initial Attempt (Flash)
        try {
            const response = await client.models.generateContent({ ...args, model: originalModel });
            if (isValidResponse(response)) return response;
            console.warn(`[GeminiProvider] Initial ${originalModel} call returned empty/invalid response.`);
        } catch (error: any) {
            console.warn(`[GeminiProvider] Initial ${originalModel} call failed: ${error.message}`);
        }

        console.log(`[GeminiProvider] 🚀 Triggering Speculative Parallel Retry (Flash + Pro)...`);

        // 2. Parallel Execution (Retry Flash vs Pro)
        const flashRetryPromise = (async () => {
            try {
                const res = await client.models.generateContent({ ...args, model: originalModel });
                if (isValidResponse(res)) return { type: 'flash', res };
                throw new Error("Empty Flash Response");
            } catch (e) { throw e; }
        })();

        const proBackupPromise = (async () => {
            try {
                const res = await client.models.generateContent({ ...args, model: GEMINI_PRO_MODEL });
                if (isValidResponse(res)) return { type: 'pro', res };
                throw new Error("Empty Pro Response");
            } catch (e) { throw e; }
        })();

        // 3. Race
        try {
            const winner = await Promise.any([flashRetryPromise, proBackupPromise]);
            console.log(`[GeminiProvider] Parallel race won by: ${winner.type}`);
            return winner.res;
        } catch (aggregateError) {
            console.warn(`[GeminiProvider] Both parallel retry attempts failed.`);
        }

        // 4. Last Resort
        console.log(`[GeminiProvider] ⚠️ All parallel attempts failed. Trying Flash one last time...`);
        try {
            return await client.models.generateContent({ ...args, model: originalModel });
        } catch (finalError) {
            console.error(`[GeminiProvider] Final retry failed.`);
            throw finalError;
        }
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /** Shared stream iterator for Gemini responses */
    private async * iterateStream(streamResult: any): AsyncGenerator<string, void, unknown> {
        // @ts-ignore
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
            if (chunkText) {
                yield chunkText;
            }
        }
    }
}
