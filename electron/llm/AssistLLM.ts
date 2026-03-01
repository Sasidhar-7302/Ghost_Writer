// electron/llm/AssistLLM.ts
// MODE: Assist - Passive observation (low priority)
// Provides brief observational insights, NEVER suggests what to say
// Uses LLMHelper for centralized routing and universal prompts

import { LLMHelper } from "../LLMHelper";
import { UNIVERSAL_ASSIST_PROMPT, injectUserContext } from "./prompts";
import { ContextDocumentManager } from "../services/ContextDocumentManager";
import { CredentialsManager } from "../services/CredentialsManager";

export class AssistLLM {
    private llmHelper: LLMHelper;

    constructor(llmHelper: LLMHelper) {
        this.llmHelper = llmHelper;
    }

    /**
     * Generate passive observational insight
     * @param context - Current conversation context
     * @returns Insight (no post-clamp; prompt enforces brevity)
     */
    async generate(context: string): Promise<string> {
        try {
            if (!context.trim()) {
                return "";
            }

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

            // Use UNIVERSAL_ASSIST_PROMPT as base if no custom prompt exists
            const basePrompt = customPrompt || UNIVERSAL_ASSIST_PROMPT;

            // Inject into system prompt
            const prompt = injectUserContext(basePrompt, resumeText, jdText, projectKnowledge, agendaText, isMeeting ? 'meeting' : 'interview');

            // Centralized LLM logic
            // providing a specific instruction as message, using UNIVERSAL_ASSIST_PROMPT as system prompt
            const instruction = "Briefly summarize what is happening right now in 1-2 sentences. Do not give advice, just observation.";

            return await this.llmHelper.chat(
                instruction,
                undefined, // no image
                context,
                prompt
            );

        } catch (error) {
            console.error("[AssistLLM] Generation failed:", error);
            return "";
        }
    }
}
