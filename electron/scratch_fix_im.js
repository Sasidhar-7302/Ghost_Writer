const fs = require('fs');

let file = fs.readFileSync('c:/Users/yepur/Desktop/My_Projects/Ghost_Writer/electron/IntelligenceManager.ts', 'utf8');

// Fix whatToAnswerLLM and answerLLM checks in runWhatShouldISay
file = file.replace(
    /\/\/ Use WhatToAnswerLLM for clean pipeline\s*if \(!this\.whatToAnswerLLM\) \{\s*\/\/ Fallback to AnswerLLM if not initialized\s*if \(!this\.interviewCopilot \|\| !this\.meetingCopilot\) \{/,
    `if (!this.interviewCopilot || !this.meetingCopilot) {`
);

// Fix remaining answerLLM.generate calls (like in a fallback)
file = file.replace(
    /const answer = await this\.answerLLM\.generate\(question \|\| '', context\);/g,
    `let answer = "";
                const isMeeting = CredentialsManager.getInstance().getIsMeetingMode();
                if (isMeeting) {
                    answer = await this.meetingCopilot.generateManualAnswer(question || '', context);
                } else {
                    answer = await this.interviewCopilot.generateManualAnswer(question || '', context);
                }`
);

// Fix runManualAnswer (if there are other answerLLM calls)
file = file.replace(
    /if \(!this\.answerLLM\) \{/g,
    `if (!this.interviewCopilot || !this.meetingCopilot) {`
);

file = file.replace(
    /const answer = await this\.answerLLM\.generate\(question, context\);/g,
    `let answer = "";
            const isMeeting = CredentialsManager.getInstance().getIsMeetingMode();
            if (isMeeting) {
                answer = await this.meetingCopilot.generateManualAnswer(question, context);
            } else {
                answer = await this.interviewCopilot.generateManualAnswer(question, context);
            }`
);

fs.writeFileSync('c:/Users/yepur/Desktop/My_Projects/Ghost_Writer/electron/IntelligenceManager.ts', file);
