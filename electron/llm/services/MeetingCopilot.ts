import { LLMHelper } from "../../LLMHelper";
import { CredentialsManager } from "../../services/CredentialsManager";
import { buildPromptForMode } from "../promptRegistry";
import { formatTemporalContextForPrompt, TemporalContext } from "../TemporalContextBuilder";
import { ContextDocumentManager } from "../../services/ContextDocumentManager";
import { CostTracker } from "../../utils/costTracker";
import { sanitizeTranscriptBlock, sanitizeUserContent } from "../promptSanitizer";

export class MeetingCopilot {
    private llmHelper: LLMHelper;

    constructor(llmHelper: LLMHelper) {
        this.llmHelper = llmHelper;
    }

    async *generateAnswerStream(
        cleanedTranscript: string,
        temporalContext?: TemporalContext,
        imagePath?: string,
        signal?: AbortSignal
    ): AsyncGenerator<string> {
        try {
            const contextManager = ContextDocumentManager.getInstance();
            const projectKnowledge = contextManager.getProjectKnowledgeText();
            const agendaText = contextManager.getAgendaText();

            const creds = CredentialsManager.getInstance();
            const prompt = this.injectTemporalContext(
                buildPromptForMode({
                    mode: 'ragMeeting',
                    settings: creds.getPromptSettings(),
                    projectKnowledge,
                    agendaText,
                    sessionMode: 'meeting'
                }),
                temporalContext
            );

            const safeTranscript = sanitizeTranscriptBlock(cleanedTranscript);
            const costTracker = CostTracker.getInstance();
            const inputTokens = Math.ceil((safeTranscript.length + prompt.length) / 4);
            let fullResponse = "";

            const stream = this.llmHelper.streamChat({
                message: safeTranscript,
                imagePath: imagePath,
                systemPrompt: prompt,
                signal
            });

            for await (const chunk of stream) {
                if (signal?.aborted) {
                    break;
                }
                fullResponse += chunk;
                yield chunk;
            }

            const outputTokens = Math.ceil(fullResponse.length / 4);
            const currentModel = this.llmHelper.getCurrentModel();
            const provider = this.llmHelper.getCurrentProvider();
            if (currentModel && provider) {
                costTracker.trackUsage(provider, currentModel, inputTokens, outputTokens).catch(err => {
                    console.error("Failed to track cost:", err);
                });
            }

        } catch (error) {
            console.error("[MeetingCopilot] Stream failed:", error);
            yield "I encountered an error trying to formulate a response.";
        }
    }

    async generateManualAnswer(question: string, context?: string, signal?: AbortSignal): Promise<string> {
        try {
            const contextManager = ContextDocumentManager.getInstance();
            const projectKnowledge = contextManager.getProjectKnowledgeText();
            const agendaText = contextManager.getAgendaText();

            const creds = CredentialsManager.getInstance();
            const prompt = buildPromptForMode({
                mode: 'ragMeeting',
                settings: creds.getPromptSettings(),
                projectKnowledge,
                agendaText,
                sessionMode: 'meeting'
            });

            const stream = await this.llmHelper.streamChat({
                message: sanitizeUserContent(question, { maxLength: 4000 }),
                context: context ? sanitizeUserContent(context) : undefined,
                systemPrompt: prompt,
                signal
            });

            let fullResponse = "";
            for await (const chunk of stream) {
                fullResponse += chunk;
            }
            return fullResponse.trim();

        } catch (error) {
            console.error("[MeetingCopilot] Manual generation failed:", error);
            return "";
        }
    }

    private injectTemporalContext(prompt: string, temporalContext?: TemporalContext): string {
        const temporalPrompt = temporalContext ? formatTemporalContextForPrompt(temporalContext) : "";
        if (!temporalPrompt) {
            return prompt.replace("{TEMPORAL_CONTEXT}", "").trim();
        }

        if (prompt.includes("{TEMPORAL_CONTEXT}")) {
            return prompt.replace("{TEMPORAL_CONTEXT}", temporalPrompt);
        }

        return `${prompt}\n\n${temporalPrompt}`.trim();
    }
}
