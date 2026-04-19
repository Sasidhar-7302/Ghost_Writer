const fs = require('fs');
const path = 'c:\\Users\\yepur\\Desktop\\My_Projects\\Ghost_Writer\\electron\\IntelligenceManager.ts';
let content = fs.readFileSync(path, 'utf8');

// 1. Update stopMeeting snapshot
const oldSnapshot = `        const snapshot = {
            transcript: [...this.fullTranscript],
            usage: [...this.fullUsage],
            startTime: this.sessionStartTime,
            durationMs: durationMs,
            context: this.getFullSessionContext(), // Use FULL session context, not just recent window
            screenshots: [...this.currentScreenshots],
            meetingMetadata: this.currentMeetingMetadata ? { ...this.currentMeetingMetadata } : null
        };`;

const newSnapshot = `        // Capture current context documents and prompt settings for persistence
        const contextDocs = ContextDocumentManager.getInstance().getAllDocuments();
        const promptSettings = CredentialsManager.getInstance().getPromptSettings();
        const contextSnapshot = {
            ...contextDocs,
            promptSettings,
            timestamp: Date.now()
        };

        const snapshot = {
            transcript: [...this.fullTranscript],
            usage: [...this.fullUsage],
            startTime: this.sessionStartTime,
            durationMs: durationMs,
            context: this.getFullSessionContext(), // Use FULL session context, not just recent window
            screenshots: [...this.currentScreenshots],
            meetingMetadata: this.currentMeetingMetadata ? { ...this.currentMeetingMetadata } : null,
            context_json: JSON.stringify(contextSnapshot)
        };`;

// Use a more flexible replace if exact match fails
if (content.indexOf('this.getFullSessionContext()') !== -1 && !content.includes('context_json: JSON.stringify')) {
    content = content.replace(/const snapshot = \{[\s\S]*?meetingMetadata: this\.currentMeetingMetadata \? \{ \.\.\.this\.currentMeetingMetadata \} : null\s*};/, newSnapshot);
}

// 2. Update processAndSaveMeeting signature
content = content.replace(
    /private async processAndSaveMeeting\(data: \{[\s\S]*?meetingMetadata: \{[\s\S]*?\} \| null\s*\}, meetingId: string\): Promise<void> \{/,
    `private async processAndSaveMeeting(data: {
        transcript: TranscriptSegment[],
        usage: any[],
        startTime: number,
        durationMs: number,
        context: string,
        screenshots: string[],
        meetingMetadata: {
            title?: string;
            calendarEventId?: string;
            source?: 'manual' | 'calendar';
        } | null;
        context_json?: string;
    }, meetingId: string): Promise<void> {`
);

// 3. Update meetingData object in processAndSaveMeeting
content = content.replace(
    /isProcessed: true, \/\/ Mark as processed\s*screenshots: \[\.\.\.data\.screenshots\]\s*};/,
    `isProcessed: true, // Mark as processed
                screenshots: [...data.screenshots],
                context_json: data.context_json
            };`
);

fs.writeFileSync(path, content);
console.log('Successfully updated IntelligenceManager.ts');
