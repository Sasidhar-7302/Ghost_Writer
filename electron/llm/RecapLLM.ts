import { LLMHelper } from "../LLMHelper";
import { UNIVERSAL_RECAP_PROMPT, injectUserContext } from "./prompts";
import { ContextDocumentManager } from "../services/ContextDocumentManager";
import { CredentialsManager } from "../services/CredentialsManager";

export class RecapLLM {
    private llmHelper: LLMHelper;

    constructor(llmHelper: LLMHelper) {
        this.llmHelper = llmHelper;
    }

    /**
     * Generate a neutral conversation summary
     */
    async generate(context: string): Promise<string> {
        if (!context.trim()) return "";
        try {
            const prompt = await this.getEnrichedPrompt();
            const stream = this.llmHelper.streamChat(context, undefined, undefined, prompt);
            let fullResponse = "";
            for await (const chunk of stream) fullResponse += chunk;
            return this.clampRecapResponse(fullResponse);
        } catch (error) {
            console.error("[RecapLLM] Generation failed:", error);
            return "";
        }
    }

    /**
     * Generate a neutral conversation summary (Streamed)
     */
    async *generateStream(context: string): AsyncGenerator<string> {
        if (!context.trim()) return;
        try {
            const prompt = await this.getEnrichedPrompt();
            // Use our universal helper
            yield* this.llmHelper.streamChat(context, undefined, undefined, prompt);
        } catch (error) {
            console.error("[RecapLLM] Streaming generation failed:", error);
        }
    }

    private async getEnrichedPrompt(): Promise<string> {
        const contextManager = ContextDocumentManager.getInstance();
        const resumeText = contextManager.getResumeText();
        const jdText = contextManager.getJDText();
        const projectKnowledge = contextManager.getProjectKnowledgeText();
        const agendaText = contextManager.getAgendaText();

        const creds = CredentialsManager.getInstance();
        const isMeeting = creds.getIsMeetingMode();

        return injectUserContext(
            UNIVERSAL_RECAP_PROMPT, 
            resumeText, 
            jdText, 
            projectKnowledge, 
            agendaText, 
            isMeeting ? 'meeting' : 'interview'
        );
    }

    private clampRecapResponse(text: string): string {
        if (!text) return "";
        // Simple clamp: max 5 lines
        return text.split('\n').filter(l => l.trim()).slice(0, 5).join('\n');
    }
}
