import { LLMHelper } from "../LLMHelper";
import { buildPromptForMode } from "./promptRegistry";
import { ContextDocumentManager } from "../services/ContextDocumentManager";
import { CredentialsManager } from "../services/CredentialsManager";

export class FollowUpQuestionsLLM {
    private llmHelper: LLMHelper;

    constructor(llmHelper: LLMHelper) {
        this.llmHelper = llmHelper;
    }

    async generate(context: string, imagePath?: string): Promise<string> {
        try {
            const prompt = await this.getEnrichedPrompt();
            const stream = this.llmHelper.streamChat({
                message: context,
                context: this.buildVisualContext(imagePath),
                imagePath,
                systemPrompt: prompt
            });
            let full = "";
            for await (const chunk of stream) full += chunk;
            return full;
        } catch (e) {
            console.error("[FollowUpQuestionsLLM] Failed:", e);
            return "";
        }
    }

    async *generateStream(context: string, imagePath?: string): AsyncGenerator<string> {
        try {
            const prompt = await this.getEnrichedPrompt();
            yield* this.llmHelper.streamChat({
                message: context,
                context: this.buildVisualContext(imagePath),
                imagePath,
                systemPrompt: prompt
            });
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

        return buildPromptForMode({
            mode: 'followUpQuestions',
            settings: creds.getPromptSettings(),
            resumeText,
            jdText,
            projectKnowledge,
            agendaText,
            sessionMode: isMeeting ? 'meeting' : 'interview'
        });
    }

    private buildVisualContext(imagePath?: string): string | undefined {
        if (!imagePath) {
            return undefined;
        }

        return "An attached screenshot is part of this request. Use the screenshot as visual context when generating follow-up questions if it is relevant.";
    }
}
