import OpenAI from "openai";
import fs from "fs";
import { ILLMProvider, ChatPayload } from "./ILLMProvider";

export class OpenAICompatProvider implements ILLMProvider {
    constructor(
        private client: OpenAI,
        private modelId: string,
        public readonly name: string
    ) { }

    public isAvailable(): boolean {
        return !!this.client;
    }

    public supportsMultimodal(): boolean {
        // We allow custom OpenAI-compatible endpoints to attempt multimodal 
        // if they receive an image payload. Disallow deepseek-reasoner explicitly if needed,
        // but typically the API itself will just reject it if unsupported.
        return true;
    }

    // =========================================================================
    // Non-Streaming Generation
    // =========================================================================

    public async generate(payload: ChatPayload): Promise<string> {
        const userMessage = payload.context
            ? `CONTEXT:\n${payload.context}\n\nUSER QUESTION:\n${payload.message}`
            : payload.message;

        const messages: any[] = [];
        if (payload.systemPrompt) {
            messages.push({ role: "system", content: payload.systemPrompt });
        }

        if (payload.imagePath) {
            const imageData = await fs.promises.readFile(payload.imagePath);
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
            model: this.modelId,
            messages,
            temperature: payload.options?.temperature ?? 0.4,
            max_tokens: payload.options?.maxTokens ?? 8192,
        });

        return response.choices[0]?.message?.content || "";
    }

    // =========================================================================
    // Streaming Generation
    // =========================================================================

    public async * stream(payload: ChatPayload): AsyncGenerator<string, void, unknown> {
        const userMessage = payload.context
            ? `CONTEXT:\n${payload.context}\n\nUSER QUESTION:\n${payload.message}`
            : payload.message;

        if (payload.imagePath) {
            yield* this.streamMultimodal(userMessage, payload.imagePath, payload.systemPrompt);
        } else {
            yield* this.streamInternal(userMessage, payload.systemPrompt);
        }
    }

    private async * streamInternal(userMessage: string, systemPrompt?: string): AsyncGenerator<string, void, unknown> {
        const messages: any[] = [];
        if (systemPrompt) {
            messages.push({ role: "system", content: systemPrompt });
        }
        messages.push({ role: "user", content: userMessage });

        const stream = await this.client.chat.completions.create({
            model: this.modelId,
            messages,
            stream: true,
            temperature: 0.4,
            max_tokens: 8192,
        });

        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta as any;
            const reasoning = delta?.reasoning_content;
            if (reasoning) {
                yield `__THOUGHT__${reasoning}`;
            }
            const content = delta?.content;
            if (content) {
                yield content;
            }
        }
    }

    private async * streamMultimodal(userMessage: string, imagePath: string, systemPrompt?: string): AsyncGenerator<string, void, unknown> {
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
            model: this.modelId,
            messages,
            stream: true,
            temperature: 0.4,
            max_tokens: 8192,
        });

        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta as any;
            const reasoning = delta?.reasoning_content;
            if (reasoning) {
                yield `__THOUGHT__${reasoning}`;
            }
            const content = delta?.content;
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
                model: this.modelId,
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
