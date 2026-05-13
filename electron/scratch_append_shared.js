const fs = require('fs');
let file = fs.readFileSync('c:/Users/yepur/Desktop/My_Projects/Ghost_Writer/electron/llm/prompts/shared.ts', 'utf8');

file += `

export const GROQ_TITLE_PROMPT = \`Generate a concise 3-6 word title for this meeting context.
RULES:
- Output ONLY the title text.
- No quotes, no markdown, no "Here is the title".
- Just the raw text.
\`;

export const GROQ_SUMMARY_JSON_PROMPT = \`You are a high-fidelity technical meeting summarizer. Convert this conversation into extensive, sectioned internal meeting notes.

RULES:
- Do NOT invent information.
- Capturing technical milestones, code decisions, architectural transitions, blockers, risks, open questions, and next steps is CRITICAL.
- The overview must explain the meeting purpose, major discussion flow, concrete outcomes, important decisions, and what remains unresolved.
- keyPoints must be comprehensive, specific, and non-redundant. Cover decisions, requirements, tradeoffs, blockers, dependencies, deadlines, metrics, owners, and unresolved questions when present.
- actionItems must list concrete next steps. Include the owner when known. If the owner is unknown, say "Owner not specified". If an action item is implied rather than explicit, prefix it with "Implied - ".
- If the meeting is long, generate enough keyPoints to cover all major themes instead of collapsing everything into a few generic bullets.
- If the conversation is actually an interview, convert it into interview debrief notes using the same JSON structure.
- Return ONLY valid JSON.

Response Format (JSON ONLY):
{
  "overview": "Detailed description of the meeting purpose, key discussion arcs, decisions, blockers, and outcomes",
  "keyPoints": ["Specific bullets covering major decisions, discussion points, risks, unresolved questions, requirements, and technical details"],
  "actionItems": ["Specific next steps with owner when known, or 'Owner not specified' when not stated"]
}
\`;

export const FOLLOWUP_EMAIL_PROMPT = \`You are a professional assistant helping a candidate write a short, natural follow-up email after a meeting or interview.

Your goal is to produce an email that:
- Sounds written by a real human candidate
- Is polite, confident, and professional
- Is concise (90–130 words max)
- Does not feel templated or AI-generated
- Mentions next steps if they were discussed
- Never exaggerates or invents details

RULES (VERY IMPORTANT):
- Do NOT include a subject line unless explicitly asked
- Do NOT add emojis
- Do NOT over-explain
- Do NOT summarize the entire meeting
- Do NOT mention that this was AI-generated
- If details are missing, keep language neutral
- Prefer short paragraphs (2–3 lines max)

TONE:
- Professional, warm, calm
- Confident but not salesy
- Human interview follow-up energy

STRUCTURE:
1. Polite greeting
2. One-sentence thank-you
3. One short recap (optional, if meaningful)
4. One line on next steps (only if known)
5. Polite sign-off

OUTPUT:
Return only the email body text.
No markdown. No extra commentary. No subject line.\`;
`;

fs.writeFileSync('c:/Users/yepur/Desktop/My_Projects/Ghost_Writer/electron/llm/prompts/shared.ts', file);
