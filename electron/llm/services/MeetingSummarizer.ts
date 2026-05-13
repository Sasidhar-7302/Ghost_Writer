import { LLMHelper } from '../../LLMHelper';
import { TranscriptSegment } from '../../IntelligenceManager';

export interface MeetingSummary {
    context: string;
    actionItems: string[];
    decisions: string[];
}

export class MeetingSummarizer {
    private llmHelper: LLMHelper;

    constructor(llmHelper: LLMHelper) {
        this.llmHelper = llmHelper;
    }

    public async summarize(transcript: TranscriptSegment[]): Promise<MeetingSummary | null> {
        if (!transcript || transcript.length === 0) {
            return null;
        }

        const formattedTranscript = transcript.map(segment => {
            let speakerLabel = segment.speaker;
            if (segment.speaker === 'user') speakerLabel = 'You';
            if (segment.speaker === 'interviewer') speakerLabel = 'Person 1';
            return `[${speakerLabel}]: ${segment.text}`;
        }).join('\n');

        const prompt = `You are a world-class executive assistant and technical scribe. Your task is to generate high-fidelity, comprehensive meeting notes from the provided transcript. Your notes must be significantly better than standard AI summaries (like Granola). 

CRITICAL REQUIREMENTS:
- Do NOT hallucinate or invent facts, owners, deadlines, or decisions.
- Be exhaustive but highly structured. Capture the full depth of the meeting, including technical details, architecture decisions, and business context.
- Use a professional, third-person tone.

Extract the following structure:
1. "context": A comprehensive overview of why the meeting happened, the major discussion arcs, what was decided, and what remains open.
2. "actionItems": Concrete tasks. Format as "Task - Owner (if known)". Prefix with "Implied -" if the task is a logical consequence not explicitly stated.
3. "decisions": A detailed list of all decisions, agreements, and technical architectural choices made during the meeting.

Return ONLY a valid JSON object matching this exact structure:
{
  "context": "string",
  "actionItems": ["string"],
  "decisions": ["string"]
}

TRANSCRIPT:
${formattedTranscript}
`;

        try {
            // We use chat rather than Ollama directly to be provider agnostic
            const payload = {
                message: "Please summarize the meeting based on the system prompt instructions.",
                systemPrompt: prompt,
                options: {
                    temperature: 0.3
                }
            };
            
            // We can just call chat on a generic ILLMProvider, but LLMHelper has generateSuggestion or callOllama, 
            // wait, LLMHelper has a chat method? In LLMHelper.ts I saw:
            // "const text = await this.chat({ ... })" in analyzeImageFile.
            
            const responseText = await (this.llmHelper as any).chat(payload);
            const cleaned = this.llmHelper.cleanJsonResponse(responseText);
            return JSON.parse(cleaned) as MeetingSummary;
            
        } catch (error) {
            console.error("[MeetingSummarizer] Error summarizing meeting:", error);
            return null;
        }
    }
}
