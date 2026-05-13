const fs = require('fs');
let file = fs.readFileSync('c:/Users/yepur/Desktop/My_Projects/Ghost_Writer/electron/IntelligenceManager.ts', 'utf8');

// 1. Imports
file = file.replace(
    /import \{ AnswerLLM, AssistLLM, FollowUpLLM, RecapLLM, FollowUpQuestionsLLM, WhatToAnswerLLM,\s*\nprepareTranscriptForWhatToAnswer, GROQ_TITLE_PROMPT, GROQ_SUMMARY_JSON_PROMPT, buildPromptForMode,\s*\nbuildTemporalContext, AssistantResponse, classifyIntent, postProcessForInterview \} from '\.\/llm';/,
    `import { AssistLLM, FollowUpLLM, RecapLLM, FollowUpQuestionsLLM, InterviewCopilot, MeetingCopilot,\nprepareTranscriptForWhatToAnswer, GROQ_TITLE_PROMPT, GROQ_SUMMARY_JSON_PROMPT, buildPromptForMode,\nbuildTemporalContext, AssistantResponse, classifyIntent, postProcessForInterview } from './llm';`
);

// 2. Class fields
file = file.replace(/private answerLLM: AnswerLLM \| null = null;/, "private interviewCopilot: InterviewCopilot | null = null;\n    private meetingCopilot: MeetingCopilot | null = null;");
file = file.replace(/private whatToAnswerLLM: WhatToAnswerLLM \| null = null;/, "");

// 3. initializeLLMs
file = file.replace(/this\.answerLLM = new AnswerLLM\(this\.llmHelper\);/, "this.interviewCopilot = new InterviewCopilot(this.llmHelper);\n        this.meetingCopilot = new MeetingCopilot(this.llmHelper);");
file = file.replace(/this\.whatToAnswerLLM = new WhatToAnswerLLM\(this\.llmHelper\);/, "");

// 4. runWhatShouldISay
const whatToSayOld = `// Use WhatToAnswerLLM for clean pipeline
            if (!this.whatToAnswerLLM) {
                // Fallback to AnswerLLM if not initialized
                if (!this.answerLLM) {
                    this.setMode('idle');
                    return "Please configure your API Keys in Settings to use this feature.";
                }
                const context = this.getFormattedContext(180);
                const answer = await this.answerLLM.generate(question || '', context);
                if (answer) {
                    this.addAssistantMessage(answer);
                    this.emit('suggested_answer', answer, question || 'inferred', confidence);
                }
                this.setMode('idle');
                return answer || "Could you repeat that? I want to make sure I address your question properly.";
            }`;

const whatToSayNew = `if (!this.interviewCopilot || !this.meetingCopilot) {
                this.setMode('idle');
                return "Please configure your API Keys in Settings to use this feature.";
            }`;

file = file.replace(whatToSayOld, whatToSayNew);

const streamOld = `// NOW STREAMING - with optional image support

            let fullAnswer = "";
            const stream = this.whatToAnswerLLM.generateStream(preparedTranscript, temporalContext, intentResult, targetImagePath);

            for await (const token of stream) {
                this.emit('suggested_answer_token', token, question || 'inferred', confidence);
                fullAnswer += token;
            }`;

const streamNew = `// NOW STREAMING - with optional image support

            let fullAnswer = "";
            let stream: AsyncGenerator<string>;
            const isMeeting = CredentialsManager.getInstance().getIsMeetingMode();
            if (isMeeting) {
                stream = this.meetingCopilot.generateAnswerStream(preparedTranscript, temporalContext, targetImagePath);
            } else {
                stream = this.interviewCopilot.generateAnswerStream(preparedTranscript, temporalContext, intentResult, targetImagePath);
            }

            for await (const token of stream) {
                this.emit('suggested_answer_token', token, question || 'inferred', confidence);
                fullAnswer += token;
            }`;

file = file.replace(streamOld, streamNew);

const storeOld = `// Store in context (WhatToAnswerLLM never returns empty)
            this.addAssistantMessage(fullAnswer);`;
const storeNew = `// Store in context
            this.addAssistantMessage(fullAnswer);`;

file = file.replace(storeOld, storeNew);


// 5. runManualAnswer
const manualOld = `if (!this.answerLLM) {
                this.setMode('idle');
                return null;
            }

            // Use AnswerLLM with manual question
            const context = this.getFormattedContext(120);
            const answer = await this.answerLLM.generate(question, context);`;

const manualNew = `if (!this.interviewCopilot || !this.meetingCopilot) {
                this.setMode('idle');
                return null;
            }

            const context = this.getFormattedContext(120);
            let answer = "";
            const isMeeting = CredentialsManager.getInstance().getIsMeetingMode();
            if (isMeeting) {
                answer = await this.meetingCopilot.generateManualAnswer(question, context);
            } else {
                answer = await this.interviewCopilot.generateManualAnswer(question, context);
            }`;

file = file.replace(manualOld, manualNew);


fs.writeFileSync('c:/Users/yepur/Desktop/My_Projects/Ghost_Writer/electron/IntelligenceManager.ts', file);
