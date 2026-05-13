const fs = require('fs');

let file = fs.readFileSync('c:/Users/yepur/Desktop/My_Projects/Ghost_Writer/electron/llm/prompts.ts', 'utf8');

const target = "<rules>\r\n- Speak as a stakeholder: \"I think we should...\", \"Our next step is...\", \"Regarding the project...\"\r\n- Professional & Brief: 2-4 sentences max.\r\n- Output ONLY the spoken contribution.\r\n</rules>";

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

if (file.includes(target)) {
    file = file.replace(target, replacement);
    fs.writeFileSync('c:/Users/yepur/Desktop/My_Projects/Ghost_Writer/electron/llm/prompts.ts', file);
    console.log('prompts.ts updated successfully with exact string.');
} else {
    console.log('Target string did not match. Trying without \\r');
    const targetNoCr = "<rules>\n- Speak as a stakeholder: \"I think we should...\", \"Our next step is...\", \"Regarding the project...\"\n- Professional & Brief: 2-4 sentences max.\n- Output ONLY the spoken contribution.\n</rules>";
    if (file.includes(targetNoCr)) {
        file = file.replace(targetNoCr, replacement);
        fs.writeFileSync('c:/Users/yepur/Desktop/My_Projects/Ghost_Writer/electron/llm/prompts.ts', file);
        console.log('prompts.ts updated successfully without \\r.');
    } else {
        console.log('Still no match.');
    }
}
