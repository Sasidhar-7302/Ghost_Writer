const assert = require("assert");
const fs = require("fs");
const path = require("path");

const promptRegistryPath = path.join(__dirname, "..", "dist-electron", "electron", "llm", "promptRegistry.js");

if (!fs.existsSync(promptRegistryPath)) {
  throw new Error("dist-electron/electron/llm/promptRegistry.js not found. Compile electron sources before running this test.");
}

const {
  buildPromptForMode,
  getDefaultPromptSettings,
  getDefaultPromptTemplates,
  normalizePromptSettings,
  getPromptModesForSession
} = require(promptRegistryPath);

function testDefaultTemplates() {
  const templates = getDefaultPromptTemplates();
  assert.ok(templates.answer, "answer prompt template should exist");
  assert.ok(templates.whatToAnswer, "whatToAnswer prompt template should exist");
  assert.ok(Array.isArray(getPromptModesForSession("interview")), "interview prompt modes should be enumerable");
}

function testNormalization() {
  const normalized = normalizePromptSettings({
    answer: {
      defaultPromptId: "ignored",
      extraInstructions: "Keep it tight.",
      enabled: true
    }
  });

  assert.strictEqual(normalized.answer.extraInstructions, "Keep it tight.");
  assert.strictEqual(normalized.answer.defaultPromptId, "builtin:answer");
  assert.strictEqual(normalized.assist.enabled, true);
}

function testPromptAssembly() {
  const settings = getDefaultPromptSettings();
  settings.answer.extraInstructions = "Mention concrete metrics when available.";

  const prompt = buildPromptForMode({
    mode: "answer",
    settings,
    resumeText: "Scaled a payments API to 12M monthly requests.",
    jdText: "Looking for backend leadership.",
    projectKnowledge: "",
    agendaText: "",
    sessionMode: "interview"
  });

  assert.ok(prompt.includes("Mention concrete metrics when available."), "extra instructions should be appended");
  assert.ok(prompt.includes("Scaled a payments API"), "resume context should be injected");
}

function testRecapPromptAssembly() {
  const settings = getDefaultPromptSettings();

  const prompt = buildPromptForMode({
    mode: "recap",
    settings,
    resumeText: "",
    jdText: "",
    projectKnowledge: "Project migration from REST to gRPC.",
    agendaText: "Review blockers, decisions, and next steps.",
    sessionMode: "meeting"
  });

  assert.ok(prompt.includes('"overview"'), "recap prompt should require overview JSON");
  assert.ok(prompt.includes('"keyPoints"'), "recap prompt should require keyPoints JSON");
  assert.ok(prompt.includes('"actionItems"'), "recap prompt should require actionItems JSON");
  assert.ok(prompt.includes("Owner not specified"), "recap prompt should define owner handling");
  assert.ok(prompt.includes("Project migration from REST to gRPC."), "meeting context should be injected");
  assert.ok(!prompt.includes("__SOURCES__"), "recap prompt should not append source disclosure outside JSON");
}

testDefaultTemplates();
testNormalization();
testPromptAssembly();
testRecapPromptAssembly();

console.log("[prompt-settings] prompt registry regression passed.");
