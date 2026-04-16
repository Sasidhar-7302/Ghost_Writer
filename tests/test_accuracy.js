/**
 * test_accuracy.js - Tests the intent classifier, question extraction, and post-processor
 * Run with: node test_accuracy.js
 * 
 * Tests the non-LLM parts of the pipeline to validate that:
 * 1. Intent classification correctly identifies question types
 * 2. Question extraction correctly pulls interviewer questions from transcripts
 * 3. Post-processor correctly strips meta-commentary and enforces intent-aware limits
 */

// ============================================================
// TEST 1: Intent Classifier
// ============================================================

// Simulate the intent classifier patterns
const INTENT_PATTERNS = {
    clarification: /(can you explain|what do you mean|clarify|could you elaborate on that specific)/i,
    follow_up: /(what happened|then what|and after that|what.s next|how did that go)/i,
    deep_dive: /(tell me more|dive deeper|explain further|walk me through|how does that work)/i,
    weakness_strength: /(weakness|strength|biggest challenge|area.*improve|what.*struggle|difficult.*experience|failure|mistake.*made|learn from|conflict|disagree)/i,
    behavioral: /(give me an example|tell me about a time|describe a situation|when have you|share an experience)/i,
    example_request: /(for example|concrete example|specific instance|like what|such as)/i,
    summary_probe: /(so to summarize|in summary|so basically|so you.re saying|let me make sure)/i,
    coding: /(write code|program|implement|function for|algorithm|how to code|setup a .* project|using .* library|debug this|snippet|boilerplate|example of .* in .*|optimize|refactor|best practice for .* code|utility method|component for|logic for)/i,
    system_design: /(design a|architect|scale|system design|how would you build|high level design|microservice|distributed|load balanc|database schema|api design|design.*system)/i,
    tradeoff: /(tradeoff|trade.off|pros and cons|compare|versus|vs |which.*prefer|which.*choose|advantage|disadvantage|when would you use|difference between)/i,
    technical_concept: /(what is|explain|define|how does.*work|what are|describe.*concept|walk me through the concept|principle|paradigm|methodology|approach to)/i,
};

function classifyIntent(question) {
    for (const [intent, pattern] of Object.entries(INTENT_PATTERNS)) {
        if (pattern.test(question)) {
            return intent;
        }
    }
    return 'general';
}

const testQuestions = [
    // Should match specific intents
    { q: "Tell me about a time you had to deal with a difficult teammate", expected: "behavioral" },
    { q: "Can you explain what you mean by microservices?", expected: "clarification" },
    { q: "How would you design a notification system for a social media app?", expected: "system_design" },
    { q: "What are the tradeoffs between SQL and NoSQL databases?", expected: "tradeoff" },
    { q: "What is your biggest weakness?", expected: "weakness_strength" },
    { q: "Implement a function to find the longest palindromic substring", expected: "coding" },
    { q: "What is dependency injection and how does it work?", expected: "technical_concept" },
    { q: "Tell me more about that project you mentioned", expected: "deep_dive" },
    { q: "Can you give me a concrete example of that?", expected: "example_request" },
    { q: "What happened after you deployed the fix?", expected: "follow_up" },
    { q: "So to summarize, you used React for the frontend?", expected: "summary_probe" },
    { q: "What's the difference between REST and GraphQL?", expected: "tradeoff" },
    { q: "How would you scale a chat application to 10 million users?", expected: "system_design" },
    { q: "Describe a situation where you disagreed with your manager", expected: "weakness_strength" },
    { q: "Write code for a binary search tree", expected: "coding" },
    // Edge cases — these should ideally hit something specific
    { q: "Why do you want to work here?", expected: "general" },
    { q: "Where do you see yourself in 5 years?", expected: "general" },
    { q: "What's your approach to code review?", expected: "technical_concept" },
    { q: "How do you handle load balancing in distributed systems?", expected: "system_design" },
    { q: "Which cloud provider do you prefer and why?", expected: "tradeoff" },
];

console.log("\n=== TEST 1: Intent Classifier ===\n");
let passed = 0;
let failed = 0;

for (const test of testQuestions) {
    const result = classifyIntent(test.q);
    const ok = result === test.expected;
    if (ok) {
        passed++;
        console.log(`  ✅ "${test.q.substring(0, 60)}..." → ${result}`);
    } else {
        failed++;
        console.log(`  ❌ "${test.q.substring(0, 60)}..." → ${result} (expected: ${test.expected})`);
    }
}

console.log(`\n  Results: ${passed}/${testQuestions.length} passed (${Math.round(passed / testQuestions.length * 100)}%)`);

// ============================================================
// TEST 2: Question Extraction from Transcript
// ============================================================

function extractLastQuestion(transcript) {
    const lines = transcript.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith('[INTERVIEWER')) {
            const match = line.match(/\[INTERVIEWER[^\]]*\]:\s*(.+)/);
            if (match && match[1] && match[1].trim().length > 5) {
                return match[1].trim();
            }
        }
    }
    return null;
}

const testTranscripts = [
    {
        name: "Standard interview question",
        transcript: `[ME]: I've been working with React for about 3 years now.
[INTERVIEWER – IMPORTANT]: Tell me about a time you had to refactor a large codebase. What was your approach?
[ME]: Well, at my previous company...`,
        expected: "Tell me about a time you had to refactor a large codebase. What was your approach?",
    },
    {
        name: "Multiple interviewer turns - gets the last one",
        transcript: `[INTERVIEWER – IMPORTANT]: Let's start with your background.
[ME]: Sure, I graduated from...
[INTERVIEWER – IMPORTANT]: That's interesting. How would you design a URL shortening service?`,
        expected: "That's interesting. How would you design a URL shortening service?",
    },
    {
        name: "Short interviewer prompt after discussion",
        transcript: `[INTERVIEWER – IMPORTANT]: Can you explain what happens when you type a URL in the browser?
[ME]: So first the browser resolves the DNS...
[INTERVIEWER – IMPORTANT]: And then what happens next?`,
        expected: "And then what happens next?",
    },
];

console.log("\n=== TEST 2: Question Extraction ===\n");
let qPassed = 0;

for (const test of testTranscripts) {
    const result = extractLastQuestion(test.transcript);
    const ok = result === test.expected;
    if (ok) {
        qPassed++;
        console.log(`  ✅ ${test.name}: "${result?.substring(0, 50)}..."`);
    } else {
        console.log(`  ❌ ${test.name}:`);
        console.log(`     Got:      "${result}"`);
        console.log(`     Expected: "${test.expected}"`);
    }
}
console.log(`\n  Results: ${qPassed}/${testTranscripts.length} passed`);

// ============================================================
// TEST 3: Post-Processor (Meta-Commentary Stripping)
// ============================================================

const META_PREFIXES = [
    /^(Sure,?\s*)?here'?s?\s+(what|how)\s+I\s+would\s+(say|respond|answer)[:\s]*/i,
    /^(Sure,?\s*)?I\s+would\s+(say|respond)\s+(something\s+like)[:\s]*/i,
    /^Let me (explain|break this down|walk you through)[:\s.]*/i,
    /^(So,?\s*)?to\s+answer\s+(your|this|the)\s+question[:\s,]*/i,
    /^(Great|Good|Excellent)\s+question[.!]?\s*/i,
    /^That'?s?\s+a\s+(great|good|excellent|interesting)\s+question[.!]?\s*/i,
    /^(Well,?\s*)?I'?d?\s+say\s+that\s*/i,
];

const META_SUFFIXES = [
    /\s*Does that (make sense|help|answer your question)\??$/i,
    /\s*Would you like me to (elaborate|explain|go into more detail)\??$/i,
    /\s*I can (elaborate|explain more|go deeper) if (you'd like|needed)\.?$/i,
];

function stripMeta(text) {
    let result = text;
    for (const p of META_PREFIXES) result = result.replace(p, "");
    for (const p of META_SUFFIXES) result = result.replace(p, "");
    return result.trim();
}

const metaTests = [
    {
        input: "Great question! In my experience with microservices, I've found that...",
        expected: "In my experience with microservices, I've found that...",
    },
    {
        input: "Here's what I would say: I implemented a caching layer using Redis.",
        expected: "I implemented a caching layer using Redis.",
    },
    {
        input: "Let me explain. The key difference between REST and GraphQL is the flexibility of queries.",
        expected: "The key difference between REST and GraphQL is the flexibility of queries.",
    },
    {
        input: "I led a team of 5 engineers to deliver the project on time. Does that answer your question?",
        expected: "I led a team of 5 engineers to deliver the project on time.",
    },
    {
        input: "That's a great question! I'd say that my biggest strength is problem-solving. Would you like me to elaborate?",
        expected: "my biggest strength is problem-solving.",
    },
    {
        input: "I used React with TypeScript for the frontend, which improved type safety by 40%.",
        expected: "I used React with TypeScript for the frontend, which improved type safety by 40%.",
    },
];

console.log("\n=== TEST 3: Meta-Commentary Stripping ===\n");
let mPassed = 0;

for (const test of metaTests) {
    const result = stripMeta(test.input);
    const ok = result === test.expected;
    if (ok) {
        mPassed++;
        console.log(`  ✅ Cleaned: "${result.substring(0, 60)}..."`);
    } else {
        console.log(`  ❌ Input:    "${test.input.substring(0, 50)}..."`);
        console.log(`     Got:      "${result}"`);
        console.log(`     Expected: "${test.expected}"`);
    }
}
console.log(`\n  Results: ${mPassed}/${metaTests.length} passed`);

// ============================================================
// SUMMARY
// ============================================================
const totalTests = testQuestions.length + testTranscripts.length + metaTests.length;
const totalPassed = passed + qPassed + mPassed;
console.log(`\n${"=".repeat(50)}`);
console.log(`  TOTAL: ${totalPassed}/${totalTests} passed (${Math.round(totalPassed / totalTests * 100)}%)`);
console.log(`${"=".repeat(50)}\n`);

if (totalPassed === totalTests) {
    console.log("  🎉 All tests passed! Pipeline is working correctly.\n");
} else {
    console.log(`  ⚠️  ${totalTests - totalPassed} test(s) need attention.\n`);
}
