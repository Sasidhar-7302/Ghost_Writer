const fs = require('fs');

let file = fs.readFileSync('c:/Users/yepur/Desktop/My_Projects/Ghost_Writer/electron/llm/prompts.ts', 'utf8');

const target = `<rules>
- Speak as a stakeholder: "I think we should...", "Our next step is...", "Regarding the project..."
- Professional & Brief: 2-4 sentences max.
- Output ONLY the spoken contribution.
</rules>`;

const replacement = `<rules>
- Speak as a stakeholder: "I think we should...", "Our next step is...", "Regarding the project..."
- Professional & Brief: 2-4 sentences max.
- Output ONLY the spoken contribution.
</rules>

<assistant_override>
- IF the user explicitly asks YOU (the AI assistant) for a summary, recap, or catch-up (e.g., "What did I miss?", "Summarize the last 10 minutes", "Catch me up"):
  - DO NOT generate a spoken contribution for the user to say out loud.
  - INSTEAD, break character and provide a concise, factual summary of the recent transcript directly to the user.
  - Format the summary cleanly using bullet points.
</assistant_override>`;

file = file.replace(target, replacement);

fs.writeFileSync('c:/Users/yepur/Desktop/My_Projects/Ghost_Writer/electron/llm/prompts.ts', file);
console.log('prompts.ts updated successfully.');
