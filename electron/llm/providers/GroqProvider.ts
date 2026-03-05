/**
 * GroqProvider - Handles Groq API generation and streaming
 * Extracted from LLMHelper.ts for modularity
 */

import Groq from "groq-sdk";

let GROQ_MODEL = "llama-3.3-70b-versatile";

export class GroqProvider {
    constructor(private client: Groq) { }

    public static getModel(): string { return GROQ_MODEL; }
    public static setModel(model: string): void { GROQ_MODEL = model; }

    // =========================================================================
    // Dynamic Model Resolution
    // =========================================================================

    public static async resolveModel(apiKey: string): Promise<void> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            const res = await fetch('https://api.groq.com/openai/v1/models', {
                headers: { 'Authorization': `Bearer ${apiKey}` },
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (res.ok) {
                const data = await res.json();
                const models = data.data || [];
                const llamaModels = models.filter((m: any) => m.id.includes('llama-3') && m.id.includes('versatile'));
                if (llamaModels.length > 0) {
                    llamaModels.sort((a: any, b: any) => b.id.length - a.id.length);
                    GROQ_MODEL = llamaModels[0].id;
                } else if (models.length > 0) {
                    GROQ_MODEL = models[0].id;
                }
                console.log(`[GroqProvider] Dynamically resolved model: ${GROQ_MODEL}`);
            }
        } catch (e) { /* Silent fallback to default */ }
    }

    // =========================================================================
    // Non-Streaming Generation
    // =========================================================================

    public async generate(fullMessage: string): Promise<string> {
        const response = await this.client.chat.completions.create({
            model: GROQ_MODEL,
            messages: [{ role: "user", content: fullMessage }],
            temperature: 0.4,
            max_tokens: 8192,
            stream: false
        });

        return response.choices[0]?.message?.content || "";
    }

    // =========================================================================
    // Streaming Generation
    // =========================================================================

    public async * stream(fullMessage: string): AsyncGenerator<string, void, unknown> {
        const stream = await this.client.chat.completions.create({
            model: GROQ_MODEL,
            messages: [{ role: "user", content: fullMessage }],
            stream: true,
            temperature: 0.4,
            max_tokens: 8192,
        });

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
                yield content;
            }
        }
    }

    /**
     * Stream with Groq, falling back to Gemini if Groq fails
     * Used by mode-specific LLMs (RecapLLM, FollowUpLLM, WhatToAnswerLLM)
     */
    public async * streamWithGeminiFallback(
        groqMessage: string,
        geminiMessage: string,
        geminiStreamFn: (msg: string, model: string) => AsyncGenerator<string, void, unknown>,
        config?: { temperature?: number; maxTokens?: number }
    ): AsyncGenerator<string, void, unknown> {
        const temp = config?.temperature ?? 0.4;
        const maxTok = config?.maxTokens ?? 8192;

        try {
            const stream = await this.client.chat.completions.create({
                model: GROQ_MODEL,
                messages: [{ role: "user", content: groqMessage }],
                stream: true,
                temperature: temp,
                max_tokens: maxTok,
            });

            let hasContent = false;
            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content;
                if (content) {
                    hasContent = true;
                    yield content;
                }
            }

            if (hasContent) return;
            console.warn("[GroqProvider] Groq stream returned empty. Falling back to Gemini...");
        } catch (e: any) {
            console.warn(`[GroqProvider] Groq stream failed: ${e.message}. Falling back to Gemini...`);
        }

        // Fallback to Gemini
        const { GEMINI_FLASH_MODEL } = require("../prompts");
        yield* geminiStreamFn(geminiMessage, GEMINI_FLASH_MODEL);
    }
}
