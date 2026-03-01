import { LLMHelper } from "../LLMHelper";
import { UNIVERSAL_FOLLOWUP_PROMPT, injectUserContext } from "./prompts";
import { ContextDocumentManager } from "../services/ContextDocumentManager";
import { CredentialsManager } from "../services/CredentialsManager";

export class FollowUpLLM {
    private llmHelper: LLMHelper;

    constructor(llmHelper: LLMHelper) {
        this.llmHelper = llmHelper;
    }

    async generate(previousAnswer: string, refinementRequest: string, context?: string): Promise<string> {
        try {
            const prompt = await this.getEnrichedPrompt();
            const message = `PREVIOUS ANSWER:\n${previousAnswer}\n\nREQUEST: ${refinementRequest}`;
            const stream = this.llmHelper.streamChat(message, undefined, context, prompt);
            let full = "";
            for await (const chunk of stream) full += chunk;
            return full;
        } catch (e) {
            console.error("[FollowUpLLM] Failed:", e);
            return "";
        }
    }

    async *generateStream(previousAnswer: string, refinementRequest: string, context?: string): AsyncGenerator<string> {
        try {
            const prompt = await this.getEnrichedPrompt();
            const message = `PREVIOUS ANSWER:\n${previousAnswer}\n\nREQUEST: ${refinementRequest}`;
            yield* this.llmHelper.streamChat(message, undefined, context, prompt);
        } catch (e) {
            console.error("[FollowUpLLM] Stream Failed:", e);
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
            UNIVERSAL_FOLLOWUP_PROMPT, 
            resumeText, 
            jdText, 
            projectKnowledge, 
            agendaText, 
            isMeeting ? 'meeting' : 'interview'
        );
    }
}
