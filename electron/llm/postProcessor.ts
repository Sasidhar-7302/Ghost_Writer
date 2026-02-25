// electron/llm/postProcessor.ts
// Hard post-processing clamp to enforce constraints
// Even if Gemini misbehaves, this ensures clean output

/**
 * Filler phrases to strip from end of responses
 */
const FILLER_PHRASES = [
    "I hope this helps",
    "Let me know if you",
    "Feel free to",
    "Does that make sense",
    "Is there anything else",
    "Hope that answers",
    "Let me know if you have",
    "I'd be happy to",
    "Happy to elaborate",
    "Happy to discuss",
    "I can go into more detail",
    "If that makes sense",
    "If you'd like more details",
    "I hope that covers",
];

/**
 * Prefixes to strip from start of responses
 */
const PREFIXES = [
    "Refined (rephrase):",
    "Refined (shorten):",
    "Refined (expand):",
    "Refined answer:",
    "Refined:",
    "Answer:",
    "Response:",
    "Suggestion:",
    "Here is the answer:",
    "Here is the refined answer:",
];

/**
 * Clamp response to strict interview copilot constraints
 * @param text - Raw LLM response
 * @param maxSentences - Maximum sentences allowed (default 3)
 * @param maxWords - Maximum words allowed (default 60)
 * @returns Clean, clamped plain text
 */
export function clampResponse(
    text: string,
    maxSentences: number = 3,
    maxWords: number = 60
): string {
    if (!text || typeof text !== "string") {
        return "";
    }

    let result = text.trim();

    // Step 1: Strip markdown
    result = stripMarkdown(result);

    // Step 2: Strip prefixes (labels)
    result = stripPrefixes(result);

    // Step 3: Remove filler phrases from end
    result = stripFillerPhrases(result);

    // CRITICAL: If code blocks were found (preserved from stripMarkdown), DO NOT CLAMP.
    // Code answers need to be full length.
    const hasCodeBlocks = /```/.test(result);

    if (!hasCodeBlocks) {
        // Step 4: Enforce sentence limit (only for prose)
        result = limitSentences(result, maxSentences);

        // Step 5: Enforce word limit (only for prose)
        result = limitWords(result, maxWords);
    }

    // Step 6: Final cleanup
    result = result.trim();

    return result;
}

/**
 * Strip all markdown formatting
 */
/**
 * Strip all markdown formatting but PRESERVE code blocks
 */
function stripMarkdown(text: string): string {
    const codeBlocks: string[] = [];
    let result = text;

    // Extract code blocks to protect them
    result = result.replace(/```[\s\S]*?```/g, (match) => {
        codeBlocks.push(match);
        return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
    });

    // Remove headers (# ## ### etc.)
    result = result.replace(/^#{1,6}\s+/gm, "");

    // Remove bold (**text** or __text__)
    result = result.replace(/\*\*([^*]+)\*\*/g, "$1");
    result = result.replace(/__([^_]+)__/g, "$1");

    // Remove italic (*text* or _text_)
    result = result.replace(/\*([^*]+)\*/g, "$1");
    result = result.replace(/_([^_]+)_/g, "$1");

    // Remove inline code (`text`) - keep content
    result = result.replace(/`([^`]+)`/g, "$1");

    // Remove bullet points (-, *, •)
    result = result.replace(/^[\s]*[-*•]\s+/gm, "");

    // Remove numbered lists
    result = result.replace(/^[\s]*\d+\.\s+/gm, "");

    // Remove blockquotes
    result = result.replace(/^>\s+/gm, "");

    // Remove horizontal rules
    result = result.replace(/^[-*_]{3,}$/gm, "");

    // Remove links [text](url) -> text
    result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

    // Collapse multiple newlines to single space (but preserve structure around blocks later?)
    // We should be careful collapsing newlines around placeholders
    result = result.replace(/\n+/g, " ");

    // Collapse multiple spaces
    result = result.replace(/\s+/g, " ");

    // Restore code blocks
    // Add newlines around them for better formatting
    codeBlocks.forEach((block, index) => {
        result = result.replace(`__CODE_BLOCK_${index}__`, `\n${block}\n`);
    });

    return result.trim();
}

/**
 * Remove trailing filler phrases that add no value
 */
function stripFillerPhrases(text: string): string {
    let result = text;

    for (const phrase of FILLER_PHRASES) {
        const regex = new RegExp(`[.!?]?\\s*${phrase}[^.!?]*[.!?]?\\s*$`, "i");
        result = result.replace(regex, ".");
    }

    // Clean up trailing punctuation issues
    result = result.replace(/\.+$/, ".");
    result = result.replace(/\s+\.$/, ".");

    return result.trim();
}

/**
 * Limit to N sentences
 */
function limitSentences(text: string, maxSentences: number): string {
    // Split on sentence boundaries (., !, ?)
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

    if (sentences.length <= maxSentences) {
        return text;
    }

    // Take first N sentences
    return sentences.slice(0, maxSentences).join(" ").trim();
}

/**
 * Limit to N words
 */
function limitWords(text: string, maxWords: number): string {
    const words = text.split(/\s+/);

    if (words.length <= maxWords) {
        return text;
    }

    // Take first N words
    let result = words.slice(0, maxWords).join(" ");

    // Try to end at a sentence boundary
    const lastPunctuation = result.search(/[.!?][^.!?]*$/);
    if (lastPunctuation > result.length * 0.6) {
        result = result.substring(0, lastPunctuation + 1);
    } else {
        // Add ellipsis if we cut mid-sentence
        result = result.replace(/[,;:]?\s*$/, "...");
    }

    return result.trim();
}

/**
 * Validate response meets constraints
 * Returns true if valid, false if clamping was needed
 */
export function validateResponse(
    text: string,
    maxSentences: number = 3,
    maxWords: number = 60
): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check for markdown
    if (/[#*_`]/.test(text)) {
        issues.push("Contains markdown");
    }

    // Check sentence count
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    if (sentences.length > maxSentences) {
        issues.push(`Too many sentences (${sentences.length}/${maxSentences})`);
    }

    // Check word count
    const words = text.split(/\s+/);
    if (words.length > maxWords) {
        issues.push(`Too many words (${words.length}/${maxWords})`);
    }

    return {
        valid: issues.length === 0,
        issues,
    };
}

/**
 * Strip common prefixes/labels
 */
function stripPrefixes(text: string): string {
    let result = text;
    for (const prefix of PREFIXES) {
        if (result.toLowerCase().startsWith(prefix.toLowerCase())) {
            result = result.substring(prefix.length).trim();
        }
    }
    // Handle "Refined (...):" regex pattern
    result = result.replace(/^Refined \([^)]+\):\s*/i, "");

    return result.trim();
}

/**
 * Strip meta-commentary that LLMs sometimes inject
 * "Here's what I would say:", "Let me explain", etc.
 */
export function stripMetaCommentary(text: string): string {
    let result = text;

    // Strip common meta-commentary prefixes
    const metaPrefixes = [
        /^(Sure,?\s*)?here'?s?\s+(what|how)\s+I\s+would\s+(say|respond|answer)[:\s]*/i,
        /^(Sure,?\s*)?I\s+would\s+(say|respond)\s+(something\s+like)[:\s]*/i,
        /^Let me (explain|break this down|walk you through|think about)[:\s.]*/i,
        /^(So,?\s*)?to\s+answer\s+(your|this|the)\s+question[:\s,]*/i,
        /^(Great|Good|Excellent|Interesting|Nice)\s+question[.!]?\s*/i,
        /^That'?s?\s+a\s+(great|good|excellent|interesting|really good|fantastic)\s+question[.!]?\s*/i,
        /^(Well,?\s*)?I'?d?\s+say\s+that\s*/i,
        /^(Absolutely|Definitely|Of course)[.!,]\s*/i,
        /^(Thanks for asking|Thank you for that question)[.!,]?\s*/i,
        /^I'?d?\s+love\s+to\s+(talk about|share|discuss)\s+(that|this)[.!,]?\s*/i,
        /^(So,?\s*)?the\s+way\s+I'?d?\s+(approach|think about|answer)\s+this\s+is[:\s,]*/i,
    ];

    for (const pattern of metaPrefixes) {
        result = result.replace(pattern, "");
    }

    // Strip trailing meta-commentary
    const metaSuffixes = [
        /\s*Does that (make sense|help|answer your question|cover what you were asking)\??$/i,
        /\s*Would you like me to (elaborate|explain|go into more detail|dive deeper)\??$/i,
        /\s*I can (elaborate|explain more|go deeper|provide more details) if (you'd like|needed|helpful)\.?$/i,
        /\s*Happy to (elaborate|discuss|dive deeper|explain more)\.?$/i,
        /\s*Let me know if (you'd like|you want|you need) (more details|me to elaborate|more context)\.?$/i,
        /\s*I'?d?\s+be happy to (go into more detail|elaborate|discuss further)\.?$/i,
    ];

    for (const pattern of metaSuffixes) {
        result = result.replace(pattern, "");
    }

    return result.trim();
}

/**
 * Intent-aware post-processing for interview answers
 * Uses different limits based on the type of question being answered
 */
export function postProcessForInterview(
    text: string,
    intent?: string
): string {
    if (!text || typeof text !== "string") return "";

    let result = text.trim();

    // Always strip prefixes and meta-commentary
    result = stripPrefixes(result);
    result = stripMetaCommentary(result);
    result = stripFillerPhrases(result);

    // Intent-adaptive limits
    let maxSentences: number;
    let maxWords: number;

    switch (intent) {
        case 'clarification':
        case 'summary_probe':
            maxSentences = 3;
            maxWords = 60;
            break;
        case 'follow_up':
        case 'example_request':
        case 'tradeoff':
        case 'technical_concept':
        case 'motivation':
        case 'estimation':
            maxSentences = 5;
            maxWords = 120;
            break;
        case 'behavioral':
        case 'weakness_strength':
        case 'deep_dive':
        case 'leadership':
            maxSentences = 8;
            maxWords = 200;
            break;
        case 'system_design':
            maxSentences = 10;
            maxWords = 300;
            break;
        case 'coding':
            // Don't clamp code answers at all
            return result.trim();
        default:
            // General: moderate limits
            maxSentences = 5;
            maxWords = 120;
    }

    // Check for code blocks — never clamp code
    if (/```/.test(result)) {
        return result.trim();
    }

    result = limitSentences(result, maxSentences);
    result = limitWords(result, maxWords);

    return result.trim();
}
