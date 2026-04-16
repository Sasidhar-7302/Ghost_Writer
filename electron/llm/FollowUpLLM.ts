import { LLMHelper } from "../LLMHelper";
import { buildPromptForMode } from "./promptRegistry";
import { ContextDocumentManager } from "../services/ContextDocumentManager";
import { CredentialsManager } from "../services/CredentialsManager";

export class FollowUpLLM {
    private llmHelper: LLMHelper;

    constructor(llmHelper: LLMHelper) {
        this.llmHelper = llmHelper;
    }

    async generate(previousAnswer: string, refinementRequest: string, context?: string, imagePath?: string): Promise<string> {
        try {
            const prompt = await this.getEnrichedPrompt();
            const message = `PREVIOUS ANSWER:\n${previousAnswer}\n\nREQUEST: ${refinementRequest}`;
            const stream = this.llmHelper.streamChat({
                message: message,
                context: this.buildVisualContext(context, imagePath),
                imagePath,
                systemPrompt: prompt
            });
            let full = "";
            for await (const chunk of stream) full += chunk;
            return full;
        } catch (e) {
            console.error("[FollowUpLLM] Failed:", e);
            return "";
        }
    }

    async *generateStream(previousAnswer: string, refinementRequest: string, context?: string, imagePath?: string): AsyncGenerator<string> {
        try {
            const prompt = await this.getEnrichedPrompt();
            const message = `PREVIOUS ANSWER:\n${previousAnswer}\n\nREQUEST: ${refinementRequest}`;
            yield* this.llmHelper.streamChat({
                message: message,
                context: this.buildVisualContext(context, imagePath),
                imagePath,
                systemPrompt: prompt
            });
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

        return buildPromptForMode({
            mode: 'followUpRefinement',
            settings: creds.getPromptSettings(),
            resumeText,
            jdText,
            projectKnowledge,
            agendaText,
            sessionMode: isMeeting ? 'meeting' : 'interview'
        });
    }

    private buildVisualContext(context?: string, imagePath?: string): string | undefined {
        if (!imagePath) {
            return context;
        }

        const note = "An attached screenshot is part of this refinement request. Use the screenshot as visual context if it is relevant.";
        return context ? `${context}\n\n${note}` : note;
    }
}
