import { LLMHelper } from "../LLMHelper";
import { UNIVERSAL_FOLLOW_UP_QUESTIONS_PROMPT, injectUserContext } from "./prompts";
import { ContextDocumentManager } from "../services/ContextDocumentManager";
import { CredentialsManager } from "../services/CredentialsManager";

export class FollowUpQuestionsLLM {
    private llmHelper: LLMHelper;

    constructor(llmHelper: LLMHelper) {
        this.llmHelper = llmHelper;
    }

    async generate(context: string): Promise<string> {
        try {
            const prompt = await this.getEnrichedPrompt();
            const stream = this.llmHelper.streamChat(context, undefined, undefined, prompt);
            let full = "";
            for await (const chunk of stream) full += chunk;
            return full;
        } catch (e) {
            console.error("[FollowUpQuestionsLLM] Failed:", e);
            return "";
        }
    }

    async *generateStream(context: string): AsyncGenerator<string> {
        try {
            const prompt = await this.getEnrichedPrompt();
            yield* this.llmHelper.streamChat(context, undefined, undefined, prompt);
        } catch (e) {
            console.error("[FollowUpQuestionsLLM] Stream Failed:", e);
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
            UNIVERSAL_FOLLOW_UP_QUESTIONS_PROMPT, 
            resumeText, 
            jdText, 
            projectKnowledge, 
            agendaText, 
            isMeeting ? 'meeting' : 'interview'
        );
    }
}
