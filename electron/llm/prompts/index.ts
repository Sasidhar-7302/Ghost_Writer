export * from './coreIdentity';
export * from './interviews';
export * from './meetings';
export * from './shared';

/**
 * Inject User Context into prompts based on mode
 */
export function injectUserContext(
    prompt: string,
    resumeText: string,
    jdText: string,
    projectKnowledge?: string,
    agendaText?: string,
    mode: 'interview' | 'meeting' = 'interview',
    options?: {
        includeSourceDisclosure?: boolean;
    }
): string {
    const isInterview = mode === 'interview';
    const resumeBlock = (isInterview && resumeText) ? `<resume>\n${resumeText}\n</resume>` : "";
    const jdBlock = (isInterview && jdText) ? `<job_description>\n${jdText}\n</job_description>` : "";
    const projectBlock = projectKnowledge ? `<project_knowledge>\n${projectKnowledge}\n</project_knowledge>` : "";
    const agendaBlock = agendaText ? `<session_agenda>\n${agendaText}\n</session_agenda>` : "";

    const userContext = (resumeBlock || jdBlock)
        ? `<user_context>\n${resumeBlock}\n${jdBlock}\n</user_context>`
        : "";

    const meetingContext = (projectBlock || agendaBlock)
        ? `<meeting_context>\n${projectBlock}\n${agendaBlock}\n</meeting_context>`
        : "";

    let enrichedPrompt = prompt
        .replaceAll("{RESUME_CONTEXT}", resumeBlock)
        .replaceAll("{JD_CONTEXT}", jdBlock)
        .replaceAll("{PROJECT_KNOWLEDGE}", projectBlock)
        .replaceAll("{AGENDA_CONTEXT}", agendaBlock);

    // Force context injection into specific prompts if placeholders are missing
    const hasAnyContext = !!(resumeText || jdText || projectKnowledge || agendaText);

    // Check if the prompt already has structured context tags
    const contextContent = mode === 'interview' ? userContext : meetingContext;
    const alreadyTagged = enrichedPrompt.includes("</user_context>") ||
        enrichedPrompt.includes("</meeting_context>") ||
        enrichedPrompt.includes("</resume>") ||
        enrichedPrompt.includes("</job_description>") ||
        enrichedPrompt.includes("</project_knowledge>") ||
        enrichedPrompt.includes("</session_agenda>");

    if (hasAnyContext && !alreadyTagged) {
        if (enrichedPrompt.includes("</core_identity>")) {
            enrichedPrompt = enrichedPrompt.replace("</core_identity>", `</core_identity>\n${contextContent}`);
        } else {
            enrichedPrompt = `${contextContent}\n\n${enrichedPrompt}`;
        }
    }

    if (hasAnyContext && options?.includeSourceDisclosure !== false) {
        const sourcesUsed: string[] = [];
        if (resumeText) sourcesUsed.push('Resume');
        if (jdText) sourcesUsed.push('Job Description');
        if (projectKnowledge) sourcesUsed.push('Project Knowledge');
        if (agendaText) sourcesUsed.push('Meeting Agenda');

        const sourceRule = `\n\n<source_disclosure_rule>\nAt the very end of your response, if you used any provided context to ground your answer, append exactly one line: __SOURCES__: [${sourcesUsed.join(', ')}]. If multiple sources were relevant, list them. If no specific context was used for this particular response, omit this line.\n</source_disclosure_rule>`;
        enrichedPrompt += sourceRule;
    }

    return enrichedPrompt;
}
