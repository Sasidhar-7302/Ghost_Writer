/**
 * ClaudeProvider - Handles all Anthropic Claude generation and streaming
 * Extracted from LLMHelper.ts for modularity
 */

import { Anthropic } from "@anthropic-ai/sdk";
import fs from "fs";

let CLAUDE_MODEL = "claude-3-5-sonnet-latest";

export class ClaudeProvider {
    constructor(private client: Anthropic) { }

    public static getModel(): string { return CLAUDE_MODEL; }
    public static setModel(model: string): void { CLAUDE_MODEL = model; }

    // =========================================================================
    // Non-Streaming Generation
    // =========================================================================

    public async generate(userMessage: string, systemPrompt?: string, imagePath?: string): Promise<string> {
        const content: any[] = [];
        if (imagePath) {
            const imageData = await fs.promises.readFile(imagePath);
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
            ...(systemPrompt ? { system: systemPrompt } : {}),
            messages: [{ role: "user", content }],
        });

        const textBlock = response.content.find((block: any) => block.type === 'text') as any;
        return textBlock?.text || "";
    }

    // =========================================================================
    // Streaming Generation
    // =========================================================================

    public async * stream(userMessage: string, systemPrompt?: string): AsyncGenerator<string, void, unknown> {
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
