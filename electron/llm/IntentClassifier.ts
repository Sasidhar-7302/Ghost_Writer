// electron/llm/IntentClassifier.ts
// Lightweight intent classification for "What should I say?"
// Micro step that runs before answer generation

export type ConversationIntent =
    | 'clarification'      // "Can you explain that?"
    | 'follow_up'          // "What happened next?"
    | 'deep_dive'          // "Tell me more about X"
    | 'behavioral'         // "Give me an example of..."
    | 'example_request'    // "Can you give a concrete example?"
    | 'summary_probe'      // "So to summarize..."
    | 'coding'             // "Write code for X" or implementation questions
    | 'system_design'      // "Design a system for X"
    | 'tradeoff'           // "Compare X vs Y" / "What are the tradeoffs?"
    | 'weakness_strength'  // "What's your biggest weakness?" / "Tell me about a failure"
    | 'technical_concept'  // "What is X?" / "Explain how Y works"
    | 'motivation'         // "Why do you want to work here?" / "Why this role?"
    | 'leadership'         // "How do you lead a team?" / "Tell me about mentoring"
    | 'estimation'         // "How long would it take?" / "How would you estimate?"
    | 'general';           // Default fallback

export interface IntentResult {
    intent: ConversationIntent;
    confidence: number;
    answerShape: string;
}

/**
 * Answer shapes mapped to intents
 * This controls HOW the answer is structured, not just WHAT it says
 */
const INTENT_ANSWER_SHAPES: Record<ConversationIntent, string> = {
    clarification: 'Give a direct, focused 1-2 sentence clarification. No setup, no context-setting.',
    follow_up: 'Continue the narrative naturally. 1-2 sentences. No recap of what was already said.',
    deep_dive: 'Provide a structured but concise explanation. Use concrete specifics, not abstract concepts.',
    behavioral: 'Lead with a specific example or story. Use the STAR pattern implicitly (Situation, Task, Action, Result). Focus on measurable outcomes and impact. 3-5 sentences.',
    example_request: 'Provide ONE concrete, detailed example. Make it realistic and specific. Include numbers or metrics if possible.',
    summary_probe: 'Confirm the summary briefly and add one clarifying point if needed.',
    coding: 'Provide a smart, production-ready code implementation. Start with a 1-sentence approach description, then the code block with inline comments, then 1 sentence explaining why this approach is optimal.',
    system_design: 'Provide a structured walkthrough: requirements, key components, data flow, and tradeoffs. 4-8 spoken sentences. Lead with the high-level approach, then drill into key decisions and scalability considerations.',
    tradeoff: 'Acknowledge both sides, state your clear preference with concrete reasoning grounded in real experience. 2-4 sentences.',
    weakness_strength: 'Give a genuine, self-aware answer. For weaknesses: name it, show awareness, explain what you are doing to improve with a concrete example. For strengths: back with a specific achievement and metrics. 3-5 sentences.',
    technical_concept: 'Give a clear, concise definition first, then explain with a concrete real-world example. 2-4 sentences.',
    motivation: 'Show genuine enthusiasm grounded in specifics about the company/role. Connect your experience to their mission or technical challenges. 2-4 sentences.',
    leadership: 'Lead with a specific leadership or mentoring story. Focus on how you empowered others and the outcome. 3-5 sentences.',
    estimation: 'Break down the estimate into components. State assumptions clearly. Give a range with reasoning. 3-5 sentences.',
    general: 'Respond naturally based on context. Keep it conversational and direct. Answer the specific question asked.'
};

/**
 * Pattern-based intent detection (fast, no LLM call)
 * For common patterns this is sufficient
 */
function detectIntentByPattern(lastInterviewerTurn: string): IntentResult | null {
    const text = lastInterviewerTurn.toLowerCase().trim();

    // Clarification patterns
    if (/(can you explain|what do you mean|clarify|could you elaborate on that specific)/i.test(text)) {
        return { intent: 'clarification', confidence: 0.9, answerShape: INTENT_ANSWER_SHAPES.clarification };
    }

    // Follow-up patterns  
    if (/(what happened|then what|and after that|what.s next|how did that go)/i.test(text)) {
        return { intent: 'follow_up', confidence: 0.85, answerShape: INTENT_ANSWER_SHAPES.follow_up };
    }

    // Deep dive patterns
    if (/(tell me more|dive deeper|explain further|walk me through|how does that work)/i.test(text)) {
        return { intent: 'deep_dive', confidence: 0.85, answerShape: INTENT_ANSWER_SHAPES.deep_dive };
    }

    // Weakness / strength / self-awareness patterns (check BEFORE behavioral — "disagree", "conflict" are more specific)
    if (/(weakness|strength|biggest challenge|area.*improve|what.*struggle|difficult.*experience|failure|mistake.*made|learn from|conflict|disagree)/i.test(text)) {
        return { intent: 'weakness_strength', confidence: 0.9, answerShape: INTENT_ANSWER_SHAPES.weakness_strength };
    }

    // Behavioral patterns
    if (/(give me an example|tell me about a time|describe a situation|when have you|share an experience)/i.test(text)) {
        return { intent: 'behavioral', confidence: 0.9, answerShape: INTENT_ANSWER_SHAPES.behavioral };
    }

    // Example request patterns
    if (/(for example|concrete example|specific instance|like what|such as)/i.test(text)) {
        return { intent: 'example_request', confidence: 0.85, answerShape: INTENT_ANSWER_SHAPES.example_request };
    }

    // Summary probe patterns
    if (/(so to summarize|in summary|so basically|so you.re saying|let me make sure)/i.test(text)) {
        return { intent: 'summary_probe', confidence: 0.85, answerShape: INTENT_ANSWER_SHAPES.summary_probe };
    }

    // Coding patterns (Broad detection for programming/implementation)
    if (/(write code|program|implement|function for|algorithm|how to code|setup a .* project|using .* library|debug this|snippet|boilerplate|example of .* in .*|optimize|refactor|best practice for .* code|utility method|component for|logic for)/i.test(text)) {
        return { intent: 'coding', confidence: 0.9, answerShape: INTENT_ANSWER_SHAPES.coding };
    }

    // System design patterns
    if (/(design a|architect|scale|system design|how would you build|high level design|microservice|distributed|load balanc|database schema|api design|design.*system)/i.test(text)) {
        return { intent: 'system_design', confidence: 0.9, answerShape: INTENT_ANSWER_SHAPES.system_design };
    }

    // Tradeoff / comparison patterns
    if (/(tradeoff|trade.off|pros and cons|compare|versus|vs |which.*prefer|which.*choose|advantage|disadvantage|when would you use|difference between)/i.test(text)) {
        return { intent: 'tradeoff', confidence: 0.85, answerShape: INTENT_ANSWER_SHAPES.tradeoff };
    }

    // Motivation / "why" patterns
    if (/(why.*want.*work|why.*interest|why.*role|why.*company|why.*position|what attracts you|what draws you|why.*leave|why.*looking|what motivates)/i.test(text)) {
        return { intent: 'motivation', confidence: 0.9, answerShape: INTENT_ANSWER_SHAPES.motivation };
    }

    // Leadership / mentoring patterns
    if (/(lead.*team|manage.*team|mentor|how do you lead|leadership style|delegate|how.*manage.*people|cross.functional|stakeholder)/i.test(text)) {
        return { intent: 'leadership', confidence: 0.85, answerShape: INTENT_ANSWER_SHAPES.leadership };
    }

    // Estimation patterns
    if (/(how long|estimate|timeline|how.*many.*days|effort|how.*would.*scope|story points|sprint|how.*plan)/i.test(text)) {
        return { intent: 'estimation', confidence: 0.8, answerShape: INTENT_ANSWER_SHAPES.estimation };
    }

    // Technical concept / "explain X" patterns
    if (/(what is|explain|define|how does.*work|what are|describe.*concept|walk me through the concept|principle|paradigm|methodology|approach to)/i.test(text)) {
        return { intent: 'technical_concept', confidence: 0.8, answerShape: INTENT_ANSWER_SHAPES.technical_concept };
    }

    return null; // No clear pattern detected
}

/**
 * Context-aware intent detection
 * Looks at conversation flow, not just the last turn
 */
function detectIntentByContext(
    recentTranscript: string,
    assistantMessageCount: number
): IntentResult {
    // If we've given multiple answers and interviewer is probing, likely follow_up
    if (assistantMessageCount >= 2) {
        // Check if interviewer is drilling down
        const lines = recentTranscript.split('\n');
        const interviewerLines = lines.filter(l => l.includes('[INTERVIEWER'));

        // Short interviewer prompts after long exchanges = follow-up probe
        const lastInterviewerLine = interviewerLines[interviewerLines.length - 1] || '';
        if (lastInterviewerLine.length < 50 && assistantMessageCount >= 2) {
            return { intent: 'follow_up', confidence: 0.7, answerShape: INTENT_ANSWER_SHAPES.follow_up };
        }
    }

    // Default to general
    return { intent: 'general', confidence: 0.5, answerShape: INTENT_ANSWER_SHAPES.general };
}

/**
 * Main intent classification function
 * Combines pattern matching with context awareness
 * Fast enough to run inline (~0-5ms)
 */
export function classifyIntent(
    lastInterviewerTurn: string | null,
    recentTranscript: string,
    assistantMessageCount: number
): IntentResult {
    // Try pattern-based first (high confidence)
    if (lastInterviewerTurn) {
        const patternResult = detectIntentByPattern(lastInterviewerTurn);
        if (patternResult) {
            return patternResult;
        }
    }

    // Fall back to context-based
    return detectIntentByContext(recentTranscript, assistantMessageCount);
}

/**
 * Get answer shape guidance for prompt injection
 */
export function getAnswerShapeGuidance(intent: ConversationIntent): string {
    return INTENT_ANSWER_SHAPES[intent];
}
