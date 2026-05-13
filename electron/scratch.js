const fs = require('fs');

function updateIntelligenceManager() {
    let file = fs.readFileSync('c:/Users/yepur/Desktop/My_Projects/Ghost_Writer/electron/IntelligenceManager.ts', 'utf8');

    // Update ContextItem
    file = file.replace(
        "export interface ContextItem {\r\n    role: 'interviewer' | 'user' | 'assistant';\r\n    text: string;",
        "export interface ContextItem {\r\n    role: 'interviewer' | 'user' | 'assistant';\r\n    speaker?: string;\r\n    text: string;"
    );

    // Update addTranscript
    file = file.replace(
        "this.contextItems.push({\r\n            role,\r\n            text,",
        "this.contextItems.push({\r\n            role,\r\n            speaker: segment.speaker,\r\n            text,"
    );

    // Update getFormattedContext
    file = file.replace(
        "const label = item.role === 'interviewer' ? 'INTERVIEWER' :\r\n                item.role === 'user' ? 'ME' :\r\n                    'ASSISTANT (PREVIOUS SUGGESTION)';",
        "let label = item.role === 'interviewer' ? 'INTERVIEWER' : item.role === 'user' ? 'ME' : 'ASSISTANT (PREVIOUS SUGGESTION)';\r\n            if (item.speaker && item.speaker.toLowerCase().startsWith('person')) { label = item.speaker.toUpperCase(); }"
    );

    fs.writeFileSync('c:/Users/yepur/Desktop/My_Projects/Ghost_Writer/electron/IntelligenceManager.ts', file);
    console.log('IntelligenceManager updated successfully.');
}

function updateMain() {
    let file = fs.readFileSync('c:/Users/yepur/Desktop/My_Projects/Ghost_Writer/electron/main.ts', 'utf8');

    file = file.replace(
        "const mappedSpeaker = segment.speakerId !== undefined ? `interviewer_${segment.speakerId}` : 'interviewer';",
        "const mappedSpeaker = segment.speakerId !== undefined ? `Person ${segment.speakerId + 1}` : 'Person';"
    );

    fs.writeFileSync('c:/Users/yepur/Desktop/My_Projects/Ghost_Writer/electron/main.ts', file);
    console.log('main.ts updated successfully.');
}

updateIntelligenceManager();
updateMain();
