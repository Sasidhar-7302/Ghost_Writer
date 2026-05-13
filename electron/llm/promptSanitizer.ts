/**
 * Prompt sanitization utilities.
 *
 * Untrusted text from meeting participants, OCR, or external transcripts can
 * carry prompt injection payloads (e.g. "Ignore previous instructions...",
 * fake "</system>" tags, embedded control sequences). These helpers neutralise
 * the most common attack vectors before the text is concatenated into a
 * system or user prompt.
 *
 * The goals are deliberately conservative:
 *   1. Preserve readability of the conversation for the model.
 *   2. Strip XML/HTML-style tags that mimic our own structural markers.
 *   3. Defang well-known jailbreak/override phrases by rewriting them.
 *   4. Cap absurdly long inputs that suggest a flooding attack.
 *
 * These transformations are intentionally text-level and reversible-looking
 * to the LLM so context is preserved while authority claims are removed.
 */

/** Hard cap for any single sanitised payload (characters, not tokens). */
export const MAX_SANITIZED_LENGTH = 16000;

/** Character that replaces the angle brackets we strip. */
const ANGLE_REPLACEMENT_OPEN = '\u2039'; // ‹
const ANGLE_REPLACEMENT_CLOSE = '\u203A'; // ›

/**
 * Common jailbreak / override phrases. Each entry is rewritten in place so
 * the model still sees the original meaning but loses the imperative form.
 */
const INJECTION_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
    { pattern: /\bignore (?:all )?(?:previous|prior|above|earlier) (?:instructions?|prompts?|messages?|rules?)\b/gi, replacement: '[redacted-instruction]' },
    { pattern: /\bdisregard (?:all )?(?:previous|prior|above|earlier) (?:instructions?|prompts?|messages?|rules?)\b/gi, replacement: '[redacted-instruction]' },
    { pattern: /\bforget (?:all )?(?:previous|prior|above|earlier) (?:instructions?|prompts?|messages?|rules?)\b/gi, replacement: '[redacted-instruction]' },
    { pattern: /\boverride (?:the )?(?:system|developer|prior) (?:prompt|instructions?)\b/gi, replacement: '[redacted-instruction]' },
    { pattern: /\byou are now (?:a |an )?(?:dan|jailbroken|unrestricted|developer mode)\b/gi, replacement: '[redacted-instruction]' },
    { pattern: /\bdo anything now\b/gi, replacement: '[redacted-instruction]' },
    { pattern: /\bsystem\s*:\s*you (?:are|must|will)\b/gi, replacement: '[redacted-system-claim]' },
    { pattern: /\b(?:reveal|print|leak|show|output) (?:the |your )?(?:system )?prompt\b/gi, replacement: '[redacted-instruction]' },
    { pattern: /\brepeat (?:the |your )?(?:system|hidden) (?:prompt|instructions?)\b/gi, replacement: '[redacted-instruction]' },
    { pattern: /\b(?:role\s*:\s*system|<\s*\/?\s*system\s*>|\[\s*system\s*\])/gi, replacement: '[redacted-system-tag]' },
];

/** Tag names we own structurally; stripping them prevents context-spoofing. */
const STRUCTURAL_TAGS = [
    'core_identity',
    'mode_definition',
    'grounding_instructions',
    'response_framework',
    'strict_rules',
    'user_context',
    'meeting_context',
    'resume',
    'job_description',
    'project_knowledge',
    'session_agenda',
    'question_to_answer',
    'intent_and_shape',
    'conversation_continuity',
    'user_extra_instructions',
    'persona',
    'tone',
    'system',
    'developer',
    'assistant',
];

const STRUCTURAL_TAG_REGEX = new RegExp(
    `<\\s*\\/?\\s*(?:${STRUCTURAL_TAGS.join('|')})\\s*>`,
    'gi'
);

/**
 * Sanitize untrusted user-facing content before embedding it in any prompt.
 * Returns a defanged copy. The original string is never mutated.
 */
export function sanitizeUserContent(input: string | null | undefined, options: { maxLength?: number } = {}): string {
    if (!input) return '';

    const maxLength = Math.max(256, Math.min(options.maxLength ?? MAX_SANITIZED_LENGTH, MAX_SANITIZED_LENGTH));
    let text = String(input);

    // 1. Strip control characters except common whitespace.
    text = text.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '');

    // 2. Replace structural tags that mimic our prompt scaffolding.
    text = text.replace(STRUCTURAL_TAG_REGEX, (match) =>
        `${ANGLE_REPLACEMENT_OPEN}${match.slice(1, -1).trim()}${ANGLE_REPLACEMENT_CLOSE}`
    );

    // 3. Defang fenced "system"/"role" blocks that aren't real tags.
    for (const { pattern, replacement } of INJECTION_PATTERNS) {
        text = text.replace(pattern, replacement);
    }

    // 4. Collapse excessive blank lines that some payloads use to push the
    //    real instructions out of the model's attention window.
    text = text.replace(/\n{4,}/g, '\n\n\n');

    // 5. Cap length. Truncate from the start so the most recent (and usually
    //    most relevant) text wins.
    if (text.length > maxLength) {
        text = `[transcript truncated]\n${text.slice(text.length - maxLength)}`;
    }

    return text;
}

/**
 * Sanitize a transcript line that includes a speaker tag like "[INTERVIEWER]:".
 * The speaker label is preserved verbatim; only the spoken content is filtered.
 */
export function sanitizeTranscriptLine(line: string): string {
    if (!line) return '';
    const match = line.match(/^(\s*\[[^\]]+\]:\s*)(.*)$/s);
    if (!match) {
        return sanitizeUserContent(line);
    }
    const [, prefix, body] = match;
    return `${prefix}${sanitizeUserContent(body)}`;
}

/**
 * Sanitize a multi-line transcript (one line per turn). Empty lines are
 * preserved to keep formatting intact.
 */
export function sanitizeTranscriptBlock(transcript: string): string {
    if (!transcript) return '';
    return transcript
        .split('\n')
        .map((line) => (line.trim().length === 0 ? line : sanitizeTranscriptLine(line)))
        .join('\n');
}
