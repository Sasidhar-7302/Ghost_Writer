// electron/llm/index.ts
// Central export for all LLM modules

export { AssistLLM } from "./AssistLLM";
export { FollowUpLLM } from "./FollowUpLLM";
export { FollowUpQuestionsLLM } from "./FollowUpQuestionsLLM";
export { RecapLLM } from "./RecapLLM";
export { InterviewCopilot } from "./services/InterviewCopilot";
export { MeetingCopilot } from "./services/MeetingCopilot";
export { MeetingSummarizer } from "./services/MeetingSummarizer";
export type { MeetingSummary } from "./services/MeetingSummarizer";
export { clampResponse, validateResponse, postProcessForInterview, stripMetaCommentary } from "./postProcessor";
export {
    cleanTranscript,
    sparsifyTranscript,
    formatTranscriptForLLM,
    prepareTranscriptForWhatToAnswer
} from "./transcriptCleaner";
export type { TranscriptTurn } from "./transcriptCleaner";
export {
    buildTemporalContext,
    formatTemporalContextForPrompt
} from "./TemporalContextBuilder";
export type { TemporalContext, AssistantResponse } from "./TemporalContextBuilder";
export {
    classifyIntent,
    getAnswerShapeGuidance
} from "./IntentClassifier";
export type { ConversationIntent, IntentResult } from "./IntentClassifier";
export { MODE_CONFIGS } from "./types";
export type { GenerationConfig, GeminiContent, LLMClient } from "./types";
export { buildPromptForMode, getDefaultPromptSettings, getDefaultPromptTemplates, getPromptModesForSession, normalizePromptSettings } from "./promptRegistry";
export { PROMPT_MODES } from "./promptTypes";
export type { LicenseVerificationRecord, PromptMode, PromptSettings, PromptSettingsMap } from "./promptTypes";
export {
    CORE_IDENTITY,
    UNIVERSAL_WHAT_TO_ANSWER_PROMPT,
    UNIVERSAL_FOLLOW_UP_QUESTIONS_PROMPT,
    UNIVERSAL_MEETING_ANSWER_PROMPT,
    UNIVERSAL_RECAP_PROMPT,
    UNIVERSAL_FOLLOWUP_PROMPT,
    UNIVERSAL_ASSIST_PROMPT,
    IMAGE_ANALYSIS_PROMPT,
    UNIVERSAL_ANSWER_PROMPT,
    UNIVERSAL_SYSTEM_PROMPT,
    GROQ_TITLE_PROMPT,
    GROQ_SUMMARY_JSON_PROMPT,
    FOLLOWUP_EMAIL_PROMPT,
    injectUserContext
} from "./prompts/index";
