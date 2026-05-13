const fs = require('fs');

// Fix ipcHandlers.ts
let ipc = fs.readFileSync('c:/Users/yepur/Desktop/My_Projects/Ghost_Writer/electron/ipcHandlers.ts', 'utf8');
ipc = ipc.replace(/import \{\s*GEMINI_PRO_MODEL,\s*GEMINI_FLASH_MODEL,\s*\}\ from "\.\/llm\/prompts";/, "");
fs.writeFileSync('c:/Users/yepur/Desktop/My_Projects/Ghost_Writer/electron/ipcHandlers.ts', ipc);

// Fix CustomCurlProvider.ts
let custom = fs.readFileSync('c:/Users/yepur/Desktop/My_Projects/Ghost_Writer/electron/llm/providers/CustomCurlProvider.ts', 'utf8');
custom = custom.replace(/import \{\s*CUSTOM_SYSTEM_PROMPT, CUSTOM_ANSWER_PROMPT, CUSTOM_WHAT_TO_ANSWER_PROMPT,\s*CUSTOM_RECAP_PROMPT, CUSTOM_FOLLOWUP_PROMPT, CUSTOM_FOLLOW_UP_QUESTIONS_PROMPT, CUSTOM_ASSIST_PROMPT,\s*HARD_SYSTEM_PROMPT,\s*\}\ from "\.\.\/prompts";/, `import { HARD_SYSTEM_PROMPT } from "../prompts/index";\n// The custom prompts shouldn't be imported, they were dynamically built. If they were hardcoded, they are likely missing or can use UNIVERSAL equivalents.\nimport { UNIVERSAL_SYSTEM_PROMPT as CUSTOM_SYSTEM_PROMPT, UNIVERSAL_ANSWER_PROMPT as CUSTOM_ANSWER_PROMPT, UNIVERSAL_WHAT_TO_ANSWER_PROMPT as CUSTOM_WHAT_TO_ANSWER_PROMPT, UNIVERSAL_RECAP_PROMPT as CUSTOM_RECAP_PROMPT, UNIVERSAL_FOLLOWUP_PROMPT as CUSTOM_FOLLOWUP_PROMPT, UNIVERSAL_FOLLOW_UP_QUESTIONS_PROMPT as CUSTOM_FOLLOW_UP_QUESTIONS_PROMPT, UNIVERSAL_ASSIST_PROMPT as CUSTOM_ASSIST_PROMPT } from "../prompts/index";`);
fs.writeFileSync('c:/Users/yepur/Desktop/My_Projects/Ghost_Writer/electron/llm/providers/CustomCurlProvider.ts', custom);

// Fix GeminiProvider.ts
let gemini = fs.readFileSync('c:/Users/yepur/Desktop/My_Projects/Ghost_Writer/electron/llm/providers/GeminiProvider.ts', 'utf8');
gemini = gemini.replace(/import \{ GEMINI_FLASH_MODEL, GEMINI_PRO_MODEL \} from "\.\.\/prompts";/, "const GEMINI_PRO_MODEL = 'gemini-1.5-pro';\nconst GEMINI_FLASH_MODEL = 'gemini-1.5-flash';");
gemini = gemini.replace(/export \{ GEMINI_PRO_MODEL, GEMINI_FLASH_MODEL \} from "\.\.\/prompts";/, "export { GEMINI_PRO_MODEL, GEMINI_FLASH_MODEL };");
fs.writeFileSync('c:/Users/yepur/Desktop/My_Projects/Ghost_Writer/electron/llm/providers/GeminiProvider.ts', gemini);

// Fix LLMHelper.ts
let llmHelper = fs.readFileSync('c:/Users/yepur/Desktop/My_Projects/Ghost_Writer/electron/LLMHelper.ts', 'utf8');
llmHelper = llmHelper.replace(/import \{\s*HARD_SYSTEM_PROMPT,\s*GROQ_SYSTEM_PROMPT,\s*OPENAI_SYSTEM_PROMPT,\s*CLAUDE_SYSTEM_PROMPT,\s*GEMINI_PRO_MODEL,\s*GEMINI_FLASH_MODEL\s*\} from "\.\/llm\/prompts";/, `import { CORE_IDENTITY as HARD_SYSTEM_PROMPT } from "./llm/prompts/index";`);
fs.writeFileSync('c:/Users/yepur/Desktop/My_Projects/Ghost_Writer/electron/LLMHelper.ts', llmHelper);

// Fix InterviewCopilot.ts relative import paths and regex
let interview = fs.readFileSync('c:/Users/yepur/Desktop/My_Projects/Ghost_Writer/electron/llm/services/InterviewCopilot.ts', 'utf8');
interview = interview.replace(/import \{ LLMHelper \} from "\.\.\/LLMHelper";/, `import { LLMHelper } from "../../LLMHelper";`);
interview = interview.replace(/\\\[\(\?:INTERVIEWER\|PERSON\[\^\\\\\]\]\*\)\\\]\:\\\s\*\(\.\+\)/g, `\\[(?:INTERVIEWER|PERSON[^\\]]*)\\]:\\s*(.+)`);
fs.writeFileSync('c:/Users/yepur/Desktop/My_Projects/Ghost_Writer/electron/llm/services/InterviewCopilot.ts', interview);

// Fix MeetingCopilot.ts relative import paths
let meeting = fs.readFileSync('c:/Users/yepur/Desktop/My_Projects/Ghost_Writer/electron/llm/services/MeetingCopilot.ts', 'utf8');
meeting = meeting.replace(/import \{ LLMHelper \} from "\.\.\/LLMHelper";/, `import { LLMHelper } from "../../LLMHelper";`);
fs.writeFileSync('c:/Users/yepur/Desktop/My_Projects/Ghost_Writer/electron/llm/services/MeetingCopilot.ts', meeting);

console.log('Fixed imports!');
