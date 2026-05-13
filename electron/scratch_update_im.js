const fs = require('fs');

let file = fs.readFileSync('c:/Users/yepur/Desktop/My_Projects/Ghost_Writer/electron/IntelligenceManager.ts', 'utf8');

// Update imports
file = file.replace(
    /import \{ AnswerLLM, AssistLLM, FollowUpLLM, RecapLLM, FollowUpQuestionsLLM, WhatToAnswerLLM, /g,
    "import { InterviewCopilot, MeetingCopilot, AssistLLM, FollowUpLLM, RecapLLM, FollowUpQuestionsLLM, "
);

// Replace variable declarations
file = file.replace(/private answerLLM: AnswerLLM \| null = null;/g, "private interviewCopilot: InterviewCopilot | null = null;");
file = file.replace(/private whatToAnswerLLM: WhatToAnswerLLM \| null = null;/g, "private meetingCopilot: MeetingCopilot | null = null;");

// Update initializeLLMs
file = file.replace(/this\.answerLLM = new AnswerLLM\(this\.llmHelper\);/g, "this.interviewCopilot = new InterviewCopilot(this.llmHelper);");
file = file.replace(/this\.whatToAnswerLLM = new WhatToAnswerLLM\(this\.llmHelper\);/g, "this.meetingCopilot = new MeetingCopilot(this.llmHelper);");

// Update runManualAnswer
file = file.replace(
    /if \(!this\.answerLLM\) \{[\s\S]*?return "Please configure your API Keys in Settings to use this feature\.";[\s\S]*?\}/,
    `if (!this.interviewCopilot || !this.meetingCopilot) {
            this.setMode('idle');
            return "Please configure your API Keys in Settings to use this feature.";
        }`
);

file = file.replace(
    /const response = await this\.answerLLM\.generate\(question, preparedTranscript\);/g,
    `let response = "";
        const isMeeting = CredentialsManager.getInstance().getIsMeetingMode();
        if (isMeeting) {
            response = await this.meetingCopilot.generateManualAnswer(question, preparedTranscript);
        } else {
            response = await this.interviewCopilot.generateManualAnswer(question, preparedTranscript);
        }`
);

// Update runWhatShouldISay
file = file.replace(
    /if \(!this\.whatToAnswerLLM\) \{[\s\S]*?if \(!this\.answerLLM\) \{[\s\S]*?return "Please configure your API Keys in Settings to use this feature\.";[\s\S]*?\}[\s\S]*?\}/,
    `if (!this.interviewCopilot || !this.meetingCopilot) {
            this.setMode('idle');
            return;
        }`
);

file = file.replace(
    /const stream = this\.whatToAnswerLLM\.generateStream\(preparedTranscript, temporalContext, intentResult,[\s\S]*?targetImagePath\);/,
    `let stream: AsyncGenerator<string>;
            const isMeeting = CredentialsManager.getInstance().getIsMeetingMode();
            if (isMeeting) {
                stream = this.meetingCopilot.generateAnswerStream(preparedTranscript, temporalContext, targetImagePath);
            } else {
                stream = this.interviewCopilot.generateAnswerStream(preparedTranscript, temporalContext, intentResult, targetImagePath);
            }`
);

fs.writeFileSync('c:/Users/yepur/Desktop/My_Projects/Ghost_Writer/electron/IntelligenceManager.ts', file);
console.log('IntelligenceManager updated successfully.');
