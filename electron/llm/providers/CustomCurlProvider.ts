import fs from "fs";
import { deepVariableReplacer } from '../../utils/curlUtils';
import curl2Json from "@bany/curl-to-json";
import { CustomProvider } from '../../services/CredentialsManager';
import { ILLMProvider, ChatPayload } from "./ILLMProvider";
import {
    UNIVERSAL_SYSTEM_PROMPT, UNIVERSAL_ANSWER_PROMPT, UNIVERSAL_WHAT_TO_ANSWER_PROMPT,
    UNIVERSAL_RECAP_PROMPT, UNIVERSAL_FOLLOWUP_PROMPT, UNIVERSAL_FOLLOW_UP_QUESTIONS_PROMPT, UNIVERSAL_ASSIST_PROMPT,
    CUSTOM_SYSTEM_PROMPT, CUSTOM_ANSWER_PROMPT, CUSTOM_WHAT_TO_ANSWER_PROMPT,
    CUSTOM_RECAP_PROMPT, CUSTOM_FOLLOWUP_PROMPT, CUSTOM_FOLLOW_UP_QUESTIONS_PROMPT, CUSTOM_ASSIST_PROMPT,
    HARD_SYSTEM_PROMPT,
} from "../prompts";

export class CustomCurlProvider implements ILLMProvider {
    readonly name = "Custom";

    public get isVisionCapable(): boolean {
        // If the user's cURL command has the IMAGE_BASE64 variable, we treat it as vision-capable
        return this.provider?.curlCommand?.includes("{{IMAGE_BASE64}}") || false;
    }

    constructor(private provider: CustomProvider) { }

    public getProvider(): CustomProvider { return this.provider; }

    public isAvailable(): boolean {
        return !!this.provider && !!this.provider.curlCommand;
    }

    public supportsMultimodal(): boolean {
        // Custom providers can support anything, user handles variable mapping
        return true;
    }

    public async testConnection(): Promise<{ success: boolean; error?: string }> {
        try {
            await this.generate({ message: "Hello" });
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    // =========================================================================
    // Non-Streaming Generation
    // =========================================================================

    public async generate(payload: ChatPayload): Promise<string> {
        const requestConfig = curl2Json(this.provider.curlCommand);

        let base64Image = "";
        if (payload.imagePath) {
            try {
                const imageData = await fs.promises.readFile(payload.imagePath);
                base64Image = imageData.toString("base64");
            } catch (e) {
                console.warn("[CustomCurlProvider] Failed to read image:", e);
            }
        }

        const combinedMessage = payload.context
            ? `${payload.systemPrompt || ""}\n\nCONTEXT:\n${payload.context}\n\nUSER QUESTION:\n${payload.message}`
            : (payload.systemPrompt ? `${payload.systemPrompt}\n\n${payload.message}` : payload.message);

        const variables = {
            TEXT: combinedMessage,
            PROMPT: combinedMessage,
            SYSTEM_PROMPT: payload.systemPrompt || "",
            USER_MESSAGE: payload.message,
            CONTEXT: payload.context || "",
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
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${JSON.stringify(data).substring(0, 200)}`);
            }

            return extractFromCommonFormats(data);
        } catch (error) {
            console.error("[CustomCurlProvider] Error:", error);
            throw error;
        }
    }

    // =========================================================================
    // Streaming Generation
    // =========================================================================

    public async * stream(payload: ChatPayload): AsyncGenerator<string, void, unknown> {
        const curlCommand = this.provider.curlCommand;
        const requestConfig = curl2Json(curlCommand);

        let base64Image = "";
        if (payload.imagePath) {
            try {
                const data = await fs.promises.readFile(payload.imagePath);
                base64Image = data.toString("base64");
            } catch (e) { }
        }

        const combinedMessageWithSystem = payload.systemPrompt
            ? `${payload.systemPrompt}\n\n${payload.context ? `${payload.context}\n\n` : ""}${payload.message}`
            : (payload.context ? `${payload.context}\n\n${payload.message}` : payload.message);

        const variables = {
            TEXT: combinedMessageWithSystem,
            PROMPT: combinedMessageWithSystem,
            SYSTEM_PROMPT: payload.systemPrompt || "",
            USER_MESSAGE: payload.message,
            CONTEXT: payload.context || "",
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
            yield "Error streaming from custom provider.";
        }
    }

    // =========================================================================
    // Prompt Mapping
    // =========================================================================

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

export function extractFromCommonFormats(data: any): string {
    if (!data || typeof data === 'string') return data || "";
    if (typeof data.response === 'string') return data.response;
    if (data.choices?.[0]?.message?.content) return data.choices[0].message.content;
    if (data.choices?.[0]?.delta?.content) return data.choices[0].delta.content;
    if (Array.isArray(data.content) && data.content[0]?.text) return data.content[0].text;
    if (typeof data.text === 'string') return data.text;
    if (typeof data.output === 'string') return data.output;
    if (typeof data.result === 'string') return data.result;
    return JSON.stringify(data);
}

function parseStreamLine(line: string): string | null {
    const trimmed = line.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("data: ")) {
        if (trimmed === "data: [DONE]") return null;
        try {
            const json = JSON.parse(trimmed.substring(6));
            return extractFromCommonFormats(json);
        } catch { return null; }
    }
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        try {
            const json = JSON.parse(trimmed);
            return extractFromCommonFormats(json);
        } catch { return null; }
    }
    return null;
}
