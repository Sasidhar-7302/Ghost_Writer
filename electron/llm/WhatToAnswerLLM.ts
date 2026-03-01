import { LLMHelper } from "../LLMHelper";
import { CredentialsManager } from "../services/CredentialsManager";
import { UNIVERSAL_WHAT_TO_ANSWER_PROMPT, UNIVERSAL_MEETING_ANSWER_PROMPT, injectUserContext } from "./prompts";
import { TemporalContext } from "./TemporalContextBuilder";
import { IntentResult } from "./IntentClassifier";
import { ContextDocumentManager } from "../services/ContextDocumentManager";
import { CostTracker } from "../utils/costTracker";

export class WhatToAnswerLLM {
    private llmHelper: LLMHelper;

    constructor(llmHelper: LLMHelper) {
        this.llmHelper = llmHelper;
    }

    // Deprecated non-streaming method (redirect to streaming or implement if needed)
    async generate(cleanedTranscript: string): Promise<string> {
        // Simple wrapper around stream
        const stream = this.generateStream(cleanedTranscript);
        let full = "";
        for await (const chunk of stream) full += chunk;
        return full;
    }

    async *generateStream(
        cleanedTranscript: string,
        temporalContext?: TemporalContext,
        intentResult?: IntentResult,
        imagePath?: string
    ): AsyncGenerator<string> {
        try {
            let contextParts: string[] = [];

            // Extract the most recent interviewer question from the transcript
            // This makes it explicit which question the LLM should answer
            const lastQuestion = this.extractLastQuestion(cleanedTranscript);
            if (lastQuestion) {
                contextParts.push(`<question_to_answer>
ANSWER THIS QUESTION: "${lastQuestion}"
</question_to_answer>`);
            }

            if (intentResult) {
                contextParts.push(`<intent_and_shape>
DETECTED INTENT: ${intentResult.intent}
ANSWER SHAPE: ${intentResult.answerShape}
</intent_and_shape>`);
            }

            if (temporalContext && temporalContext.hasRecentResponses) {
                const history = temporalContext.previousResponses.map((r, i) => `${i + 1}. "${r}"`).join('\n');
                contextParts.push(`PREVIOUS RESPONSES (Avoid Repetition):\n${history}`);
            }

            const extraContext = contextParts.join('\n\n');
            const fullMessage = extraContext
                ? `${extraContext}\n\nCONVERSATION:\n${cleanedTranscript}`
                : cleanedTranscript;

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

            // Select the correct base prompt based on mode
            let basePrompt = customPrompt;
            if (!basePrompt) {
                basePrompt = isMeeting ? UNIVERSAL_MEETING_ANSWER_PROMPT : UNIVERSAL_WHAT_TO_ANSWER_PROMPT;
            }

            // Inject into prompt
            const prompt = injectUserContext(basePrompt, resumeText, jdText, projectKnowledge, agendaText, isMeeting ? 'meeting' : 'interview');

            // Use Universal Prompt
            // Note: WhatToAnswer has a very specific prompt. 
            // We should use UNIVERSAL_WHAT_TO_ANSWER_PROMPT as override

            // Track cost for this LLM call
            const costTracker = CostTracker.getInstance();
            const inputTokens = Math.ceil((fullMessage.length + prompt.length) / 4); // Rough estimate
            let outputTokens = 0;
            let fullResponse = "";

            const stream = this.llmHelper.streamChat(fullMessage, imagePath, undefined, prompt);
            for await (const chunk of stream) {
                fullResponse += chunk;
                yield chunk;
            }

            // Estimate output tokens and track cost
            outputTokens = Math.ceil(fullResponse.length / 4);
            const currentModel = this.llmHelper.getCurrentModel();
            if (currentModel) {
                const provider = this.getProviderFromModel(currentModel);
                costTracker.trackUsage(provider, currentModel, inputTokens, outputTokens).catch(err => {
                    console.error("Failed to track cost:", err);
                });
            }

        } catch (error) {
            console.error("[WhatToAnswerLLM] Stream failed:", error);
            yield "Could you repeat that? I want to make sure I address your question properly.";
        }
    }

    private getProviderFromModel(model: string): string {
        if (model.includes('gpt') || model.includes('openai')) return 'openai';
        if (model.includes('claude')) return 'claude';
        if (model.includes('gemini')) return 'gemini';
        if (model.includes('groq') || model.includes('llama')) return 'groq';
        if (model.includes('deepseek')) return 'deepseek';
        if (model.includes('nvidia')) return 'nvidia';
        if (model.includes('ollama')) return 'ollama';
        return 'unknown';
    }

    /**
     * Extract the most recent interviewer question from the formatted transcript.
     * Handles consecutive interviewer turns (multi-part questions) by merging them.
     * Returns null if no interviewer turn is found.
     */
    private extractLastQuestion(transcript: string): string | null {
        const lines = transcript.split('\n');

        // Walk backwards to find the last interviewer line
        let lastInterviewerIndex = -1;
        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            if (line.startsWith('[INTERVIEWER')) {
                lastInterviewerIndex = i;
                break;
            }
            // If we hit a [ME] line, stop - interviewer's question precedes user's response
            if (line.startsWith('[ME]')) {
                break;
            }
        }

        if (lastInterviewerIndex === -1) return null;

        // Collect consecutive interviewer lines (multi-part questions)
        const questionParts: string[] = [];
        for (let i = lastInterviewerIndex; i >= 0; i--) {
            const line = lines[i].trim();
            if (line.startsWith('[INTERVIEWER')) {
                const match = line.match(/\[INTERVIEWER[^\]]*\]:\s*(.+)/);
                if (match && match[1] && match[1].trim().length > 3) {
                    questionParts.unshift(match[1].trim());
                }
            } else {
                // Non-interviewer line — stop collecting
                break;
            }
        }

        if (questionParts.length === 0) return null;

        const fullQuestion = questionParts.join(' ');
        return fullQuestion.length > 5 ? fullQuestion : null;
    }
}
