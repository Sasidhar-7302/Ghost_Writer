/**
 * OpenAICompatProvider - Handles OpenAI, NVIDIA NIM, and DeepSeek
 * All three use the OpenAI SDK, so they share a common base pattern
 * Extracted from LLMHelper.ts for modularity
 */

import OpenAI from "openai";
import fs from "fs";

export class OpenAICompatProvider {
    constructor(
        private client: OpenAI,
        private model: string,
        private providerName: string
    ) { }

    // =========================================================================
    // Non-Streaming Generation
    // =========================================================================

    public async generate(userMessage: string, systemPrompt?: string, imagePath?: string): Promise<string> {
        const messages: any[] = [];
        if (systemPrompt) {
            messages.push({ role: "system", content: systemPrompt });
        }

        if (imagePath) {
            const imageData = await fs.promises.readFile(imagePath);
            const base64Image = imageData.toString("base64");
            messages.push({
                role: "user",
                content: [
                    { type: "text", text: userMessage },
                    { type: "image_url", image_url: { url: `data:image/png;base64,${base64Image}` } }
                ]
            });
        } else {
            messages.push({ role: "user", content: userMessage });
        }

        const response = await this.client.chat.completions.create({
            model: this.model,
            messages,
            temperature: 0.4,
            max_tokens: 8192,
        });

        return response.choices[0]?.message?.content || "";
    }

    // =========================================================================
    // Streaming Generation
    // =========================================================================

    public async * stream(userMessage: string, systemPrompt?: string): AsyncGenerator<string, void, unknown> {
        const messages: any[] = [];
        if (systemPrompt) {
            messages.push({ role: "system", content: systemPrompt });
        }
        messages.push({ role: "user", content: userMessage });

        const stream = await this.client.chat.completions.create({
            model: this.model,
            messages,
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

    public async * streamMultimodal(userMessage: string, imagePath: string, systemPrompt?: string): AsyncGenerator<string, void, unknown> {
        const imageData = await fs.promises.readFile(imagePath);
        const base64Image = imageData.toString("base64");

        const messages: any[] = [];
        if (systemPrompt) {
            messages.push({ role: "system", content: systemPrompt });
        }
        messages.push({
            role: "user",
            content: [
                { type: "text", text: userMessage },
                { type: "image_url", image_url: { url: `data:image/png;base64,${base64Image}` } }
            ]
        });

        const stream = await this.client.chat.completions.create({
            model: this.model,
            messages,
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

    // =========================================================================
    // Connection Test
    // =========================================================================

    public async testConnection(): Promise<{ success: boolean; error?: string }> {
        try {
            const response = await this.client.chat.completions.create({
                model: this.model,
                messages: [{ role: "user", content: "Hello" }],
                max_tokens: 10,
                stream: false,
            });
            return { success: !!response.choices[0]?.message?.content };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    // =========================================================================
    // Dynamic Model Resolution
    // =========================================================================

    /**
     * Fetch the latest available model from the provider's API
     * Used for Groq-style providers that have dynamic model lists
     */
    public static async resolveModel(
        apiKey: string,
        apiUrl: string,
        filterFn: (models: any[]) => string | null
    ): Promise<string | null> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            const res = await fetch(apiUrl, {
                headers: { 'Authorization': `Bearer ${apiKey}` },
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (res.ok) {
                const data = await res.json();
                const models = data.data || [];
                return filterFn(models);
            }
        } catch (e) { /* Silent fallback */ }
        return null;
    }
}
