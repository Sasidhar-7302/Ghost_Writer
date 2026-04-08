import { Anthropic } from "@anthropic-ai/sdk";
import fs from "fs";
import { ILLMProvider, ChatPayload } from "./ILLMProvider";

let CLAUDE_MODEL = "claude-3-5-sonnet-latest";

export class ClaudeProvider implements ILLMProvider {
    readonly name = "Claude";
    readonly isVisionCapable = true;

    constructor(private client: Anthropic) { }

    public isAvailable(): boolean {
        return !!this.client;
    }

    public supportsMultimodal(): boolean {
        return true;
    }

    public async testConnection(): Promise<{ success: boolean; error?: string }> {
        try {
            const response = await this.client.messages.create({
                model: CLAUDE_MODEL,
                max_tokens: 10,
                messages: [{ role: "user", content: "Say hello" }]
            });
            const block = response?.content?.[0];
            return (block && 'text' in block && block.text) ? { success: true } : { success: false, error: "Empty response" };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    public static getModel(): string { return CLAUDE_MODEL; }
    public static setModel(model: string): void { CLAUDE_MODEL = model; }

    // =========================================================================
    // Non-Streaming Generation
    // =========================================================================

    public async generate(payload: ChatPayload): Promise<string> {
        const userMessage = payload.context
            ? `CONTEXT:\n${payload.context}\n\nUSER QUESTION:\n${payload.message}`
            : payload.message;

        const content: any[] = [];
        if (payload.imagePath) {
            const imageData = await fs.promises.readFile(payload.imagePath);
            const base64Image = imageData.toString("base64");
            content.push({
                type: "image",
                source: {
                    type: "base64",
                    media_type: "image/png",
                    data: base64Image
                }
            });
        }
        content.push({ type: "text", text: userMessage });

        const response = await this.client.messages.create({
            model: CLAUDE_MODEL,
            max_tokens: 8192,
            ...(payload.systemPrompt ? { system: payload.systemPrompt } : {}),
            messages: [{ role: "user", content }],
        });

        const textBlock = response.content.find((block: any) => block.type === 'text') as any;
        return textBlock?.text || "";
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
        const stream = await this.client.messages.stream({
            model: CLAUDE_MODEL,
            max_tokens: 8192,
            ...(systemPrompt ? { system: systemPrompt } : {}),
            messages: [{ role: "user", content: userMessage }],
        });

        for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                yield event.delta.text;
            }
        }
    }

    public async * streamMultimodal(userMessage: string, imagePath: string, systemPrompt?: string): AsyncGenerator<string, void, unknown> {
        const imageData = await fs.promises.readFile(imagePath);
        const base64Image = imageData.toString("base64");

        const stream = await this.client.messages.stream({
            model: CLAUDE_MODEL,
            max_tokens: 8192,
            ...(systemPrompt ? { system: systemPrompt } : {}),
            messages: [{
                role: "user",
                content: [
                    {
                        type: "image",
                        source: {
                            type: "base64",
                            media_type: "image/png",
                            data: base64Image
                        }
                    },
                    { type: "text", text: userMessage }
                ]
            }],
        });

        for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                yield event.delta.text;
            }
        }
    }
}
