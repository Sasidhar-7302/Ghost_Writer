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

export function isLikelyEchoTranscript(
    userText: string,
    recentInterviewerTranscripts: TranscriptEchoCandidate[],
    now: number,
    windowMs: number = 8000
): boolean {
    const normalizedUser = normalizeTranscriptText(userText);
    if (normalizedUser.length < 8) {
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
        if (normalizedInterviewer.length < 8) {
            return false;
        }

        if (normalizedUser === normalizedInterviewer) {
            return true;
        }

        if (
            normalizedUser.length >= 12 &&
            normalizedInterviewer.length >= 12 &&
            (normalizedInterviewer.includes(normalizedUser) || normalizedUser.includes(normalizedInterviewer))
        ) {
            return true;
        }

        const interviewerWords = toWordSet(normalizedInterviewer);
        if (Math.min(userWords.size, interviewerWords.size) < 4) {
            return false;
        }

        return overlapRatio(userWords, interviewerWords) >= 0.85;
    });
}

export function pruneTranscriptEchoCandidates(
    candidates: TranscriptEchoCandidate[],
    now: number,
    windowMs: number = 8000
): TranscriptEchoCandidate[] {
    return candidates.filter((candidate) => now - candidate.timestamp <= windowMs);
}
