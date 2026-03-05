/**
 * CustomCurlProvider - Handles user-defined cURL-based LLM providers
 * Extracted from LLMHelper.ts for modularity
 */

import fs from "fs";
import { deepVariableReplacer } from '../../utils/curlUtils';
import curl2Json from "@bany/curl-to-json";
import { CustomProvider } from '../../services/CredentialsManager';
import {
    UNIVERSAL_SYSTEM_PROMPT, UNIVERSAL_ANSWER_PROMPT, UNIVERSAL_WHAT_TO_ANSWER_PROMPT,
    UNIVERSAL_RECAP_PROMPT, UNIVERSAL_FOLLOWUP_PROMPT, UNIVERSAL_FOLLOW_UP_QUESTIONS_PROMPT, UNIVERSAL_ASSIST_PROMPT,
    CUSTOM_SYSTEM_PROMPT, CUSTOM_ANSWER_PROMPT, CUSTOM_WHAT_TO_ANSWER_PROMPT,
    CUSTOM_RECAP_PROMPT, CUSTOM_FOLLOWUP_PROMPT, CUSTOM_FOLLOW_UP_QUESTIONS_PROMPT, CUSTOM_ASSIST_PROMPT,
    HARD_SYSTEM_PROMPT,
} from "../prompts";

export class CustomCurlProvider {
    constructor(private provider: CustomProvider) { }

    public getProvider(): CustomProvider { return this.provider; }

    // =========================================================================
    // Non-Streaming Generation
    // =========================================================================

    public async execute(
        combinedMessage: string,
        systemPrompt: string,
        rawUserMessage: string,
        context: string,
        imagePath?: string
    ): Promise<string> {
        const requestConfig = curl2Json(this.provider.curlCommand);

        let base64Image = "";
        if (imagePath) {
            try {
                const imageData = await fs.promises.readFile(imagePath);
                base64Image = imageData.toString("base64");
            } catch (e) {
                console.warn("[CustomCurlProvider] Failed to read image:", e);
            }
        }

        const variables = {
            TEXT: combinedMessage,
            PROMPT: combinedMessage,
            SYSTEM_PROMPT: systemPrompt,
            USER_MESSAGE: rawUserMessage,
            CONTEXT: context,
            IMAGE_BASE64: base64Image,
        };

        const url = deepVariableReplacer(requestConfig.url, variables);
        const headers = deepVariableReplacer(requestConfig.header || {}, variables);
        const body = deepVariableReplacer(requestConfig.data || {}, variables);

        try {
            const response = await fetch(url, {
                method: requestConfig.method || 'POST',
                headers: headers,
                body: JSON.stringify(body)
            });

            const data = await response.json();
            console.log(`[CustomCurlProvider] Raw response:`, JSON.stringify(data).substring(0, 1000));

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${JSON.stringify(data).substring(0, 200)}`);
            }

            const extracted = extractFromCommonFormats(data);
            console.log(`[CustomCurlProvider] Extracted text length: ${extracted.length}`);
            return extracted;
        } catch (error) {
            console.error("[CustomCurlProvider] Error:", error);
            throw error;
        }
    }

    // =========================================================================
    // Streaming Generation
    // =========================================================================

    public async * stream(
        message: string,
        context?: string,
        imagePath?: string,
        systemPrompt: string = UNIVERSAL_SYSTEM_PROMPT
    ): AsyncGenerator<string, void, unknown> {
        const curlCommand = this.provider.curlCommand;
        const requestConfig = curl2Json(curlCommand);

        let base64Image = "";
        if (imagePath) {
            try {
                const data = await fs.promises.readFile(imagePath);
                base64Image = data.toString("base64");
            } catch (e) { }
        }

        const combinedMessageWithSystem = systemPrompt
            ? `${systemPrompt}\n\n${context ? `${context}\n\n` : ""}${message}`
            : (context ? `${context}\n\n${message}` : message);

        const variables = {
            TEXT: combinedMessageWithSystem,
            PROMPT: combinedMessageWithSystem,
            SYSTEM_PROMPT: systemPrompt,
            USER_MESSAGE: message,
            CONTEXT: context || "",
            IMAGE_BASE64: base64Image,
        };

        const url = deepVariableReplacer(requestConfig.url, variables);
        const headers = deepVariableReplacer(requestConfig.header || {}, variables);
        const body = deepVariableReplacer(requestConfig.data || {}, variables);

        try {
            const response = await fetch(url, {
                method: requestConfig.method || 'POST',
                headers: headers,
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[CustomCurlProvider] HTTP ${response.status}: ${errorText.substring(0, 200)}`);
                yield `Error: Custom Provider returned HTTP ${response.status}`;
                return;
            }

            if (!response.body) return;

            let fullBody = "";
            let yieldedAny = false;

            // @ts-ignore
            for await (const chunk of response.body) {
                const text = new TextDecoder().decode(chunk);
                fullBody += text;

                const lines = text.split('\n');
                for (const line of lines) {
                    if (line.trim().length === 0) continue;
                    const items = parseStreamLine(line);
                    if (items) {
                        yield items;
                        yieldedAny = true;
                    }
                }
            }

            if (!yieldedAny && fullBody.trim().length > 0) {
                try {
                    const data = JSON.parse(fullBody);
                    const extracted = extractFromCommonFormats(data);
                    if (extracted) yield extracted;
                } catch {
                    if (fullBody.length < 5000) yield fullBody.trim();
                }
            }
        } catch (e) {
            console.error("[CustomCurlProvider] Streaming failed:", e);
            yield "Error streaming from custom provider.";
        }
    }

    // =========================================================================
    // Prompt Mapping
    // =========================================================================

    /**
     * Map UNIVERSAL (local model) prompts to richer CUSTOM prompts.
     * Custom providers can be any cloud model, so they get detailed prompts.
     */
    public static mapToCustomPrompt(prompt: string): string {
        if (prompt === UNIVERSAL_SYSTEM_PROMPT || prompt === HARD_SYSTEM_PROMPT) return CUSTOM_SYSTEM_PROMPT;
        if (prompt === UNIVERSAL_ANSWER_PROMPT) return CUSTOM_ANSWER_PROMPT;
        if (prompt === UNIVERSAL_WHAT_TO_ANSWER_PROMPT) return CUSTOM_WHAT_TO_ANSWER_PROMPT;
        if (prompt === UNIVERSAL_RECAP_PROMPT) return CUSTOM_RECAP_PROMPT;
        if (prompt === UNIVERSAL_FOLLOWUP_PROMPT) return CUSTOM_FOLLOWUP_PROMPT;
        if (prompt === UNIVERSAL_FOLLOW_UP_QUESTIONS_PROMPT) return CUSTOM_FOLLOW_UP_QUESTIONS_PROMPT;
        if (prompt === UNIVERSAL_ASSIST_PROMPT) return CUSTOM_ASSIST_PROMPT;
        return prompt;
    }
}

// =========================================================================
// Module-Level Helpers (shared between streaming and non-streaming)
// =========================================================================

/**
 * Try to extract text content from common LLM API response formats.
 * Supports: Ollama, OpenAI, Anthropic, and generic formats.
 */
export function extractFromCommonFormats(data: any): string {
    if (!data || typeof data === 'string') return data || "";

    // Ollama format
    if (typeof data.response === 'string') return data.response;

    // OpenAI format
    if (data.choices?.[0]?.message?.content) return data.choices[0].message.content;

    // OpenAI delta/streaming format
    if (data.choices?.[0]?.delta?.content) return data.choices[0].delta.content;

    // Anthropic format
    if (Array.isArray(data.content) && data.content[0]?.text) return data.content[0].text;

    // Generic text field
    if (typeof data.text === 'string') return data.text;

    // Generic output field
    if (typeof data.output === 'string') return data.output;

    // Generic result field
    if (typeof data.result === 'string') return data.result;

    console.warn("[CustomCurlProvider] Could not extract text from response, returning raw JSON");
    return JSON.stringify(data);
}

function parseStreamLine(line: string): string | null {
    const trimmed = line.trim();
    if (!trimmed) return null;

    // Handle SSE (data: ...)
    if (trimmed.startsWith("data: ")) {
        if (trimmed === "data: [DONE]") return null;
        try {
            const json = JSON.parse(trimmed.substring(6));
            return extractFromCommonFormats(json);
        } catch {
            return null;
        }
    }

    // Handle raw JSON chunks
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        try {
            const json = JSON.parse(trimmed);
            return extractFromCommonFormats(json);
        } catch {
            return null;
        }
    }

    return null;
}
