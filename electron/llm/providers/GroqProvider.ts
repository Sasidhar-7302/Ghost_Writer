import Groq from "groq-sdk";
import { ILLMProvider, ChatPayload } from "./ILLMProvider";

let GROQ_MODEL = "llama-3.3-70b-versatile";

export class GroqProvider implements ILLMProvider {
    readonly name = "Groq";
    readonly isVisionCapable = false;

    constructor(private client: Groq) { }

    public isAvailable(): boolean {
        return !!this.client;
    }

    public supportsMultimodal(): boolean {
        return false;
    }

    public async testConnection(): Promise<{ success: boolean; error?: string }> {
        try {
            const response = await this.client.chat.completions.create({
                model: GROQ_MODEL,
                messages: [{ role: "user", content: "Say hello" }],
                max_tokens: 10
            });
            return response?.choices?.[0]?.message?.content ? { success: true } : { success: false, error: "Empty response" };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    public static getModel(): string { return GROQ_MODEL; }
    public static setModel(model: string): void { GROQ_MODEL = model; }

    private buildMessages(payload: ChatPayload): Array<{ role: "system" | "user"; content: string }> {
        const messages: Array<{ role: "system" | "user"; content: string }> = [];
        const userMessage = payload.context
            ? `CONTEXT:\n${payload.context}\n\nUSER QUESTION:\n${payload.message}`
            : payload.message;

        if (payload.systemPrompt) {
            messages.push({ role: "system", content: payload.systemPrompt });
        }

        messages.push({ role: "user", content: userMessage });
        return messages;
    }

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

    public async generate(payload: ChatPayload): Promise<string> {
        const response = await this.client.chat.completions.create({
            model: GROQ_MODEL,
            messages: this.buildMessages(payload),
            temperature: payload.options?.temperature ?? 0.4,
            max_tokens: payload.options?.maxTokens ?? 8192,
            stream: false
        });

        return response.choices[0]?.message?.content || "";
    }

    // =========================================================================
    // Streaming Generation
    // =========================================================================

    public async * stream(payload: ChatPayload): AsyncGenerator<string, void, unknown> {
        const stream = await this.client.chat.completions.create({
            model: GROQ_MODEL,
            messages: this.buildMessages(payload),
            stream: true,
            temperature: payload.options?.temperature ?? 0.4,
            max_tokens: payload.options?.maxTokens ?? 8192,
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
     * Updated to handle ChatPayload for consistency
     */
    public async * streamWithGeminiFallback(
        payload: ChatPayload,
        geminiStreamFn: (p: ChatPayload) => AsyncGenerator<string, void, unknown>
    ): AsyncGenerator<string, void, unknown> {
        try {
            const stream = await this.client.chat.completions.create({
                model: GROQ_MODEL,
                messages: this.buildMessages(payload),
                stream: true,
                temperature: payload.options?.temperature ?? 0.4,
                max_tokens: payload.options?.maxTokens ?? 8192,
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
        yield* geminiStreamFn(payload);
    }
}
