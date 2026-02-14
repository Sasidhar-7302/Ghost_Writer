import { LLMHelper } from "../LLMHelper";
import { UNIVERSAL_ANSWER_PROMPT } from "./prompts";
import { ContextDocumentManager } from "../services/ContextDocumentManager";
import { injectUserContext } from "./prompts";

export class AnswerLLM {
    private llmHelper: LLMHelper;

    constructor(llmHelper: LLMHelper) {
        this.llmHelper = llmHelper;
    }

    /**
     * Generate a spoken interview answer
     */
    async generate(question: string, context?: string): Promise<string> {
        try {
            // Get user context (resume/JD)
            const contextManager = ContextDocumentManager.getInstance();
            const resumeText = contextManager.getResumeText();
            const jdText = contextManager.getJDText();

            // Inject into prompt
            const prompt = injectUserContext(UNIVERSAL_ANSWER_PROMPT, resumeText, jdText);

            // Use LLMHelper's streamChat but collect all tokens since this method is non-streaming
            const stream = await this.llmHelper.streamChat(question, undefined, context, prompt);

            let fullResponse = "";
            for await (const chunk of stream) {
                fullResponse += chunk;
            }
            return fullResponse.trim();

        } catch (error) {
            console.error("[AnswerLLM] Generation failed:", error);
            return "";
        }
    }
}
