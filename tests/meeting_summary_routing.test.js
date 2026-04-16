const assert = require("assert");
const fs = require("fs");
const path = require("path");

const distLLMHelperPath = path.join(__dirname, "..", "dist-electron", "electron", "LLMHelper.js");

if (!fs.existsSync(distLLMHelperPath)) {
  throw new Error("dist-electron/electron/LLMHelper.js not found. Compile electron sources before running this test.");
}

const { LLMHelper } = require(distLLMHelperPath);

async function testSelectedModelRouting() {
  let capturedPayload = null;
  let capturedOperation = null;

  const helper = {
    useOllama: true,
    airGapMode: false,
    ollamaModel: "kimi-k2.5:cloud",
    withTimeout: async (promise, _timeoutMs, operationName) => {
      capturedOperation = operationName;
      return await promise;
    },
    chatWithGemini: async (payload) => {
      capturedPayload = payload;
      return '{"overview":"ok","keyPoints":[],"actionItems":[]}';
    },
    getCurrentProvider: () => "ollama",
    getCurrentModel: () => "kimi-k2.5:cloud",
  };

  const response = await LLMHelper.prototype.generateMeetingSummary.call(helper, {
    systemPrompt: "PRIMARY_PROMPT",
    context: "MEETING_CONTEXT",
    groqSystemPrompt: "GROQ_PROMPT",
  });

  assert.strictEqual(response, '{"overview":"ok","keyPoints":[],"actionItems":[]}');
  assert.ok(capturedPayload, "meeting summary should route through selected-model chat");
  assert.strictEqual(capturedPayload.systemPrompt, "PRIMARY_PROMPT");
  assert.strictEqual(capturedPayload.context, "MEETING_CONTEXT");
  assert.strictEqual(
    capturedPayload.message,
    "Return only the requested meeting output for the supplied context."
  );
  assert.strictEqual(capturedOperation, "kimi-k2.5:cloud Meeting Summary");
}

async function testGroqPromptSelection() {
  let capturedPayload = null;

  const helper = {
    useOllama: false,
    airGapMode: false,
    withTimeout: async (promise) => await promise,
    chatWithGemini: async (payload) => {
      capturedPayload = payload;
      return "summary";
    },
    getCurrentProvider: () => "groq",
    getCurrentModel: () => "groq",
  };

  const response = await LLMHelper.prototype.generateMeetingSummary.call(helper, {
    systemPrompt: "PRIMARY_PROMPT",
    context: "MEETING_CONTEXT",
    groqSystemPrompt: "GROQ_PROMPT",
  });

  assert.strictEqual(response, "summary");
  assert.ok(capturedPayload, "groq summary should still use the selected-model chat path");
  assert.strictEqual(capturedPayload.systemPrompt, "GROQ_PROMPT");
}

(async () => {
  await testSelectedModelRouting();
  await testGroqPromptSelection();
  console.log("[meeting-summary-routing] selected model routing regression passed.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
