import { LLMHelper } from "../LLMHelper";
import { ContextDocumentManager } from "../services/ContextDocumentManager";
import { buildPromptForMode } from "./promptRegistry";
import { CredentialsManager } from "../services/CredentialsManager";

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
            // Get user context (resume/JD/Project/Agenda)
            const contextManager = ContextDocumentManager.getInstance();
            const resumeText = contextManager.getResumeText();
            const jdText = contextManager.getJDText();
            const projectKnowledge = contextManager.getProjectKnowledgeText();
            const agendaText = contextManager.getAgendaText();

            const creds = CredentialsManager.getInstance();
            const isMeeting = creds.getIsMeetingMode();
            const prompt = buildPromptForMode({
                mode: 'answer',
                settings: creds.getPromptSettings(),
                resumeText,
                jdText,
                projectKnowledge,
                agendaText,
                sessionMode: isMeeting ? 'meeting' : 'interview'
            });

            // Use LLMHelper's streamChat but collect all tokens since this method is non-streaming
            const stream = await this.llmHelper.streamChat({
                message: question,
                context: context,
                systemPrompt: prompt
            });

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
