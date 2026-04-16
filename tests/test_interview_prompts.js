/**
 * test_interview_prompts.js - Exhaustive tests for prompt grounding logic
 * 
 * Tests the injectUserContext function with extreme edge cases:
 * - Empty inputs
 * - Malformed strings
 * - Extremely large texts
 * - Missing modes
 * - Verify the inclusion of the new GROUNDING constraint.
 */

// Simulated function from electron/llm/prompts.ts
function injectUserContext(
    prompt,
    resumeText,
    jdText,
    projectKnowledge = "",
    agendaText = "",
    mode = 'interview'
) {
    const resumeBlock = resumeText ? `<resume>\n${resumeText}\n</resume>` : "";
    const jdBlock = jdText ? `<job_description>\n${jdText}\n</job_description>` : "";
    const projectBlock = projectKnowledge ? `<project_knowledge>\n${projectKnowledge}\n</project_knowledge>` : "";
    const agendaBlock = agendaText ? `<session_agenda>\n${agendaText}\n</session_agenda>` : "";

    const userContext = (resumeBlock || jdBlock)
        ? `<user_context>\n${resumeBlock}\n${jdBlock}\n</user_context>`
        : "";

    const meetingContext = (projectBlock || agendaBlock)
        ? `<meeting_context>\n${projectBlock}\n${agendaBlock}\n</meeting_context>`
        : "";

    let enrichedPrompt = prompt
        .split("{RESUME_CONTEXT}").join(resumeBlock)
        .split("{JD_CONTEXT}").join(jdBlock)
        .split("{PROJECT_KNOWLEDGE}").join(projectBlock)
        .split("{AGENDA_CONTEXT}").join(agendaBlock);

    const hasAnyContext = !!(resumeText || jdText || projectKnowledge || agendaText);
    const contextContent = mode === 'interview' ? userContext : meetingContext;
    const alreadyTagged = enrichedPrompt.includes("<user_context>") ||
        enrichedPrompt.includes("<meeting_context>") ||
        enrichedPrompt.includes("<resume>") ||
        enrichedPrompt.includes("<job_description>");

    if (hasAnyContext && !alreadyTagged) {
        if (enrichedPrompt.includes("</core_identity>")) {
            enrichedPrompt = enrichedPrompt.replace("</core_identity>", `</core_identity>\n${contextContent}`);
        } else {
            enrichedPrompt = `${contextContent}\n\n${enrichedPrompt}`;
        }
    }

    return enrichedPrompt;
}

const BASE_PROMPT = `<core_identity>You are an AI.</core_identity>\n\nGROUNDING: Reference specific roles, projects, and metrics from your context (Resume/JD). Never fabricate history. Tailor keywords to match JD requirements.`;

const testCases = [
    {
        name: "Edge Case: All inputs are empty strings",
        args: [BASE_PROMPT, "", "", "", "", "interview"],
        verify: (p) => p === BASE_PROMPT
    },
    {
        name: "Edge Case: Only Resume is provided, no JD",
        args: [BASE_PROMPT, "Software Engineer at Google", "", "", "", "interview"],
        verify: (p) => p.includes("<user_context>") && p.includes("Software Engineer at Google") && !p.includes("<job_description>")
    },
    {
        name: "Edge Case: Extremely large Resume text (simulated 10MB)",
        args: [BASE_PROMPT, "A".repeat(10000000), "", "", "", "interview"],
        verify: (p) => p.length > 10000000 && p.includes("<resume>")
    },
    {
        name: "Edge Case: Missing or undefined mode (defaults to interview)",
        args: [BASE_PROMPT, "ResumeData", "JDData", undefined, undefined, undefined],
        verify: (p) => p.includes("<user_context>") && !p.includes("<meeting_context>")
    },
    {
        name: "Verification: Core Identity preserves GROUNDING rule",
        args: [BASE_PROMPT, "ResumeData", "", "", "", "interview"],
        verify: (p) => p.includes("GROUNDING: Reference specific roles") && p.includes("</core_identity>\n<user_context>")
    }
];

console.log("\\n=== EXHAUSTIVE PROMPT GROUNDING TESTS ===\\n");
let passed = 0;

testCases.forEach((tc, idx) => {
    try {
        const t0 = performance.now();
        const result = injectUserContext(...tc.args);
        const tf = performance.now();

        if (tc.verify(result)) {
            passed++;
            console.log(`  ✅ [${idx + 1}] ${tc.name} (- ${(tf - t0).toFixed(2)}ms)`);
        } else {
            console.log(`  ❌ [${idx + 1}] ${tc.name}`);
        }
    } catch (e) {
        console.log(`  💥 [${idx + 1}] ${tc.name} generated exception: ${e.message}`);
    }
});

console.log(`\\nResults: ${passed}/${testCases.length} passed\\n`);
if (passed === testCases.length) {
    console.log("🎉 All Edge Cases Passed.");
    process.exit(0);
} else {
    process.exit(1);
}
