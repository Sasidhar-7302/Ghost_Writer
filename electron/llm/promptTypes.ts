export const PROMPT_MODES = [
    "assist",
    "answer",
    "whatToAnswer",
    "followUpRefinement",
    "followUpQuestions",
    "recap",
    "ragMeeting",
    "ragGlobal",
    "imageAnalysis"
] as const;

export type PromptMode = (typeof PROMPT_MODES)[number];

export interface PromptSettings {
    defaultPromptId: string;
    extraInstructions?: string;
    fullOverride?: string;
    enabled: boolean;
    validation?: {
        isValid: boolean;
        error?: string;
    };
}

export type PromptSettingsMap = Record<PromptMode, PromptSettings>;

export interface LicenseVerificationRecord {
    status: "verified" | "grace" | "disabled" | "failed";
    verifiedAt?: string;
    graceUntil?: string;
    lastFailureReason?: string;
    source: "gumroad" | "beta-free" | "cache" | "supabase" | "manual";
}
