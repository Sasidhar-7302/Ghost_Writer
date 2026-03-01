import { LLMHelper } from "../LLMHelper";
import { UNIVERSAL_ANSWER_PROMPT } from "./prompts";
import { ContextDocumentManager } from "../services/ContextDocumentManager";
import { injectUserContext } from "./prompts";
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

            // Get custom prompt from CredentialsManager
            const creds = CredentialsManager.getInstance();
            const isMeeting = creds.getIsMeetingMode();
            const customPrompt = isMeeting ? creds.getMeetingPrompt() : creds.getInterviewPrompt();

            // Use UNIVERSAL_ANSWER_PROMPT as base if no custom prompt exists
            const basePrompt = customPrompt || UNIVERSAL_ANSWER_PROMPT;

            // Inject into prompt
            const prompt = injectUserContext(basePrompt, resumeText, jdText, projectKnowledge, agendaText, isMeeting ? 'meeting' : 'interview');

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
