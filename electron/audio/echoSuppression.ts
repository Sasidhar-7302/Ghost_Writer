export interface TranscriptEchoCandidate {
    text: string;
    timestamp: number;
    final?: boolean;
}

function normalizeTranscriptText(text: string): string {
    return text
        .toLowerCase()
        .replace(/[\[\](){}.,!?;:"'`~@#$%^&*_+=<>|\\/.-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function toWordSet(text: string): Set<string> {
    return new Set(
        normalizeTranscriptText(text)
            .split(' ')
            .filter((word) => word.length >= 2)
    );
}

function overlapRatio(a: Set<string>, b: Set<string>): number {
    const smaller = a.size <= b.size ? a : b;
    const larger = a.size <= b.size ? b : a;

    if (smaller.size === 0) {
        return 0;
    }

    let shared = 0;
    for (const word of smaller) {
        if (larger.has(word)) {
            shared += 1;
        }
    }

    return shared / smaller.size;
}

const CLOSE_ECHO_WINDOW_MS = 3500;
const WHISPER_ARTIFACT_RE = /(?:\b[A-Z]_\s*){2,}|\b[A-Z]_[A-Z]_/;
const DISTINCTIVE_WORD_MIN_LENGTH = 4;

function hasWhisperArtifact(text: string): boolean {
    return WHISPER_ARTIFACT_RE.test(text);
}

function hasSharedDistinctiveWord(a: Set<string>, b: Set<string>): boolean {
    const smaller = a.size <= b.size ? a : b;
    const larger = a.size <= b.size ? b : a;

    for (const word of smaller) {
        if (word.length >= DISTINCTIVE_WORD_MIN_LENGTH && larger.has(word)) {
            return true;
        }
    }

    return false;
}

/** Mic picks up speaker output (e.g. HiDock speakerphone); short STT fragments must still match loopback. */
function userPhraseAppearsInInterviewerPhrase(userNorm: string, interviewerNorm: string): boolean {
    if (userNorm.length < 2 || interviewerNorm.length < userNorm.length) {
        return false;
    }
    const escaped = userNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|\\s)${escaped}(\\s|$)`, 'i');
    return re.test(interviewerNorm);
}

export function isLikelyEchoTranscript(
    userText: string,
    recentInterviewerTranscripts: TranscriptEchoCandidate[],
    now: number,
    windowMs: number = 20000
): boolean {
    const normalizedUser = normalizeTranscriptText(userText);
    if (!normalizedUser.length) {
        return false;
    }

    const userWords = toWordSet(normalizedUser);

    return recentInterviewerTranscripts.some((candidate) => {
        if (!candidate?.text) {
            return false;
        }

        if (now - candidate.timestamp > windowMs) {
            return false;
        }

        const normalizedInterviewer = normalizeTranscriptText(candidate.text);
        if (normalizedInterviewer.length < 2) {
            return false;
        }

        // Exact match
        if (normalizedUser === normalizedInterviewer) {
            return true;
        }

        const interviewerWords = toWordSet(normalizedInterviewer);
        if (interviewerWords.size === 0) {
            return false;
        }
        const isCloseEchoCandidate = now - candidate.timestamp <= CLOSE_ECHO_WINDOW_MS;

        // Short mic transcripts that are a single word (or two) already present on loopback
        // (fixes "and", "okay", "no" attributed to You when Teams mic is muted but speaker still plays)
        if (userWords.size <= 2 && normalizedUser.length <= 36) {
            for (const w of userWords) {
                if (w.length >= 2 && interviewerWords.has(w)) {
                    return true;
                }
            }
            if (normalizedUser.length >= 2 && normalizedUser.length <= 28) {
                if (userPhraseAppearsInInterviewerPhrase(normalizedUser, normalizedInterviewer)) {
                    return true;
                }
            }
        }

        // Substring containment (relaxed length threshold)
        if (
            normalizedUser.length >= 8 &&
            normalizedInterviewer.length >= 8 &&
            (normalizedInterviewer.includes(normalizedUser) || normalizedUser.includes(normalizedInterviewer))
        ) {
            return true;
        }

        if (userWords.size === 0) {
            return false;
        }

        if (
            isCloseEchoCandidate &&
            hasWhisperArtifact(userText) &&
            hasSharedDistinctiveWord(userWords, interviewerWords)
        ) {
            return true;
        }

        // Word-overlap matching with lower thresholds
        if (Math.min(userWords.size, interviewerWords.size) < 2) {
            return normalizedUser === normalizedInterviewer;
        }

        const wordOverlap = overlapRatio(userWords, interviewerWords);
        if (
            isCloseEchoCandidate &&
            Math.min(userWords.size, interviewerWords.size) >= 3 &&
            wordOverlap >= 0.4
        ) {
            return true;
        }

        // Lower overlap threshold - mic picks up degraded audio so STT may produce different words
        return wordOverlap >= 0.6;
    });
}

export function pruneTranscriptEchoCandidates(
    candidates: TranscriptEchoCandidate[],
    now: number,
    windowMs: number = 20000
): TranscriptEchoCandidate[] {
    return candidates.filter((candidate) => now - candidate.timestamp <= windowMs);
}
