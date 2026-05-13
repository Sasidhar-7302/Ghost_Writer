import { LLMHelper } from "../../LLMHelper";
import { CredentialsManager } from "../../services/CredentialsManager";
import { buildPromptForMode } from "../promptRegistry";
import { formatTemporalContextForPrompt, TemporalContext } from "../TemporalContextBuilder";
import { IntentResult } from "../IntentClassifier";
import { ContextDocumentManager } from "../../services/ContextDocumentManager";
import { CostTracker } from "../../utils/costTracker";
import { sanitizeTranscriptBlock, sanitizeUserContent } from "../promptSanitizer";

export class InterviewCopilot {
    private llmHelper: LLMHelper;

    constructor(llmHelper: LLMHelper) {
        this.llmHelper = llmHelper;
    }

    async *generateAnswerStream(
        cleanedTranscript: string,
        temporalContext?: TemporalContext,
        intentResult?: IntentResult,
        imagePath?: string,
        signal?: AbortSignal
    ): AsyncGenerator<string> {
        try {
            const safeTranscript = sanitizeTranscriptBlock(cleanedTranscript);
            let contextParts: string[] = [];

            const lastQuestion = this.extractLastQuestion(safeTranscript);
            if (lastQuestion) {
                contextParts.push(`<question_to_answer>\nANSWER THIS QUESTION: "${sanitizeUserContent(lastQuestion, { maxLength: 1024 })}"\n</question_to_answer>`);
            }

            if (intentResult) {
                contextParts.push(`<intent_and_shape>\nDETECTED INTENT: ${intentResult.intent}\nANSWER SHAPE: ${intentResult.answerShape}\n</intent_and_shape>`);
            }

            if (temporalContext && temporalContext.hasRecentResponses) {
                const history = temporalContext.previousResponses.map((r, i) => `${i + 1}. "${sanitizeUserContent(r, { maxLength: 800 })}"`).join('\n');
                contextParts.push(`PREVIOUS RESPONSES (Avoid Repetition):\n${history}`);
                contextParts.push(`<conversation_continuity>\nThe interviewer already heard your earlier answer. Build on it with new information, sharper specifics, or a different angle.\nDo not restart from the same introduction, and do not restate the full previous answer unless the interviewer explicitly asks you to repeat it.\n</conversation_continuity>`);
            }

            const extraContext = contextParts.join('\n\n');
            const fullMessage = extraContext
                ? `${extraContext}\n\nCONVERSATION:\n${safeTranscript}`
                : safeTranscript;

            const contextManager = ContextDocumentManager.getInstance();
            const resumeText = contextManager.getResumeText();
            const jdText = contextManager.getJDText();

            const creds = CredentialsManager.getInstance();
            const prompt = this.injectTemporalContext(
                buildPromptForMode({
                    mode: 'whatToAnswer',
                    settings: creds.getPromptSettings(),
                    resumeText,
                    jdText,
                    sessionMode: 'interview'
                }),
                temporalContext
            );

            const costTracker = CostTracker.getInstance();
            const inputTokens = Math.ceil((fullMessage.length + prompt.length) / 4);
            let fullResponse = "";

            const stream = this.llmHelper.streamChat({
                message: fullMessage,
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
            console.error("[InterviewCopilot] Stream failed:", error);
            yield "Could you repeat that? I want to make sure I address your question properly.";
        }
    }

    async generateManualAnswer(question: string, context?: string, signal?: AbortSignal): Promise<string> {
        try {
            const contextManager = ContextDocumentManager.getInstance();
            const resumeText = contextManager.getResumeText();
            const jdText = contextManager.getJDText();

            const creds = CredentialsManager.getInstance();
            const prompt = buildPromptForMode({
                mode: 'whatToAnswer',
                settings: creds.getPromptSettings(),
                resumeText,
                jdText,
                sessionMode: 'interview'
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
            console.error("[InterviewCopilot] Manual generation failed:", error);
            return "";
        }
    }

    private extractLastQuestion(transcript: string): string | null {
        const lines = transcript.split('\n');
        let lastInterviewerIndex = -1;
        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            if (line.startsWith('[INTERVIEWER') || line.startsWith('[PERSON')) {
                lastInterviewerIndex = i;
                break;
            }
            if (line.startsWith('[ME]')) {
                break;
            }
        }

        if (lastInterviewerIndex === -1) return null;

        const questionParts: string[] = [];
        for (let i = lastInterviewerIndex; i >= 0; i--) {
            const line = lines[i].trim();
            if (line.startsWith('[INTERVIEWER') || line.startsWith('[PERSON')) {
                const match = line.match(/\[(?:INTERVIEWER|PERSON[^\]]*)\]:\s*(.+)/);
                if (match && match[1] && match[1].trim().length > 3) {
                    questionParts.unshift(match[1].trim());
                }
            } else {
                break;
            }
        }

        if (questionParts.length === 0) return null;

        const fullQuestion = questionParts.join(' ');
        return fullQuestion.length > 5 ? fullQuestion : null;
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
