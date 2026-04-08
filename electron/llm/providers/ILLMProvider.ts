/**
 * ILLMProvider - Common interface for all LLM provider implementations
 * Every provider must implement these methods to be pluggable into LLMHelper
 */

export interface ChatPayload {
    message: string;
    systemPrompt?: string;
    imagePath?: string;
    context?: string;
    options?: {
        temperature?: number;
        maxTokens?: number;
        skipSystemPrompt?: boolean;
        alternateGroqMessage?: string;
    };
}

export interface ILLMProvider {
    /** Human-readable provider name (e.g. "Gemini", "Ollama") */
    readonly name: string;

    /** Whether the provider is configured and ready to use */
    isAvailable(): boolean;

    /** Whether this provider supports image/multimodal input */
    supportsMultimodal(): boolean;

    /** Whether this provider is generally capable of vision tasks (even if current model isn't) */
    readonly isVisionCapable: boolean;

    /** Non-streaming generation */
    generate(payload: ChatPayload): Promise<string>;

    /** Streaming generation */
    stream(payload: ChatPayload): AsyncGenerator<string, void, unknown>;

    /** Test connection to the provider */
    testConnection(): Promise<{ success: boolean; error?: string }>;
}

/** Shared configuration passed to providers */
export interface ProviderConfig {
    maxOutputTokens?: number;
    temperature?: number;
}

/** Shared constants */
export const DEFAULT_MAX_OUTPUT_TOKENS = 65536;

/** Simple token estimation (rough approximation: 1 token ≈ 4 characters) */
export function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}
