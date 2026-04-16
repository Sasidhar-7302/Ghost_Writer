import {
    IMAGE_ANALYSIS_PROMPT,
    UNIVERSAL_ANSWER_PROMPT,
    UNIVERSAL_ASSIST_PROMPT,
    UNIVERSAL_FOLLOWUP_PROMPT,
    UNIVERSAL_FOLLOW_UP_QUESTIONS_PROMPT,
    UNIVERSAL_MEETING_ANSWER_PROMPT,
    UNIVERSAL_RECAP_PROMPT,
    UNIVERSAL_SYSTEM_PROMPT,
    UNIVERSAL_WHAT_TO_ANSWER_PROMPT,
    injectUserContext
} from "./prompts";
import { PromptMode, PromptSettings, PromptSettingsMap, PROMPT_MODES } from "./promptTypes";

export interface PromptTemplateDefinition {
    id: string;
    title: string;
    description: string;
    sessionMode: "interview" | "meeting" | "global";
    prompt: string;
}

const PROMPT_TEMPLATES: Record<PromptMode, PromptTemplateDefinition> = {
    assist: {
        id: "builtin:assist",
        title: "Assist",
        description: "Passive observation and concise situational insight.",
        sessionMode: "global",
        prompt: UNIVERSAL_ASSIST_PROMPT
    },
    answer: {
        id: "builtin:answer",
        title: "Answer",
        description: "Direct spoken answer generation for the current session.",
        sessionMode: "global",
        prompt: UNIVERSAL_ANSWER_PROMPT
    },
    whatToAnswer: {
        id: "builtin:whatToAnswer",
        title: "What To Answer",
        description: "Strategic spoken answer for interview questions.",
        sessionMode: "interview",
        prompt: UNIVERSAL_WHAT_TO_ANSWER_PROMPT
    },
    followUpRefinement: {
        id: "builtin:followUpRefinement",
        title: "Follow-Up Refinement",
        description: "Rewrite a previous answer based on direct feedback.",
        sessionMode: "global",
        prompt: UNIVERSAL_FOLLOWUP_PROMPT
    },
    followUpQuestions: {
        id: "builtin:followUpQuestions",
        title: "Follow-Up Questions",
        description: "Generate smart follow-up questions for the current topic.",
        sessionMode: "interview",
        prompt: UNIVERSAL_FOLLOW_UP_QUESTIONS_PROMPT
    },
    recap: {
        id: "builtin:recap",
        title: "Recap",
        description: "Turn a conversation into high-fidelity meeting notes.",
        sessionMode: "global",
        prompt: UNIVERSAL_RECAP_PROMPT
    },
    ragMeeting: {
        id: "builtin:ragMeeting",
        title: "RAG Meeting",
        description: "Answer using meeting-specific retrieval context.",
        sessionMode: "meeting",
        prompt: UNIVERSAL_MEETING_ANSWER_PROMPT
    },
    ragGlobal: {
        id: "builtin:ragGlobal",
        title: "RAG Global",
        description: "Answer using the full knowledge base and stored meeting context.",
        sessionMode: "global",
        prompt: UNIVERSAL_SYSTEM_PROMPT
    },
    imageAnalysis: {
        id: "builtin:imageAnalysis",
        title: "Image Analysis",
        description: "Describe screenshots and visual context precisely.",
        sessionMode: "global",
        prompt: IMAGE_ANALYSIS_PROMPT
    }
};

const DEFAULT_SESSION_MODES: Record<"interview" | "meeting", PromptMode[]> = {
    interview: ["whatToAnswer", "answer", "assist", "followUpRefinement", "followUpQuestions", "recap"],
    meeting: ["answer", "assist", "followUpRefinement", "recap", "ragMeeting", "imageAnalysis"]
};

export function getDefaultPromptTemplates(): Record<PromptMode, PromptTemplateDefinition> {
    return PROMPT_TEMPLATES;
}

export function getPromptModesForSession(sessionMode: "interview" | "meeting"): PromptMode[] {
    return DEFAULT_SESSION_MODES[sessionMode];
}

export function getDefaultPromptSettings(): PromptSettingsMap {
    return PROMPT_MODES.reduce((acc, mode) => {
        acc[mode] = {
            defaultPromptId: PROMPT_TEMPLATES[mode].id,
            extraInstructions: "",
            fullOverride: "",
            enabled: true,
            validation: { isValid: true }
        };
        return acc;
    }, {} as PromptSettingsMap);
}

export function normalizePromptSettings(settings?: Partial<PromptSettingsMap> | null): PromptSettingsMap {
    const defaults = getDefaultPromptSettings();
    if (!settings) {
        return defaults;
    }

    for (const mode of PROMPT_MODES) {
        const current = settings[mode] || {};
        defaults[mode] = {
            ...defaults[mode],
            ...current,
            defaultPromptId: PROMPT_TEMPLATES[mode].id,
            validation: validatePromptSettings({
                ...defaults[mode],
                ...current,
                defaultPromptId: PROMPT_TEMPLATES[mode].id
            })
        };
    }

    return defaults;
}

export function validatePromptSettings(settings: PromptSettings): PromptSettings["validation"] {
    const extraInstructions = settings.extraInstructions?.trim() || "";
    const fullOverride = settings.fullOverride?.trim() || "";

    if (extraInstructions.length > 4000) {
        return { isValid: false, error: "Extra instructions must stay under 4000 characters." };
    }

    if (fullOverride.length > 20000) {
        return { isValid: false, error: "Full overrides must stay under 20000 characters." };
    }

    return { isValid: true };
}

export function buildPromptForMode(params: {
    mode: PromptMode;
    settings?: Partial<PromptSettingsMap> | null;
    resumeText?: string;
    jdText?: string;
    projectKnowledge?: string;
    agendaText?: string;
    sessionMode: "interview" | "meeting";
}): string {
    const normalized = normalizePromptSettings(params.settings);
    const modeSettings = normalized[params.mode];
    const template = PROMPT_TEMPLATES[params.mode];

    const basePrompt = modeSettings.fullOverride?.trim() || template.prompt;
    const enrichedPrompt = modeSettings.extraInstructions?.trim()
        ? `${basePrompt}\n\n<user_extra_instructions>\n${modeSettings.extraInstructions.trim()}\n</user_extra_instructions>`
        : basePrompt;

    return injectUserContext(
        enrichedPrompt,
        params.resumeText || "",
        params.jdText || "",
        params.projectKnowledge || "",
        params.agendaText || "",
        params.sessionMode,
        { includeSourceDisclosure: params.mode !== "recap" }
    );
}
