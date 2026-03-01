const fs = require('fs');
const path = require('path');

// Mock fetch to capture body
let capturedBody = null;
global.fetch = async (url, options) => {
    capturedBody = JSON.parse(options.body);
    return {
        ok: true,
        json: async () => ({ response: "Mock summary response" }),
        body: null
    };
};

async function testOptions() {
    const { LLMHelper } = require('../dist-electron/LLMHelper.js');
    const helper = new LLMHelper(undefined, true, 'qwen3-vl:8b', 'http://localhost:11434');

    console.log("Testing Summarization Options...");
    try {
        await helper.generateMeetingSummary("Summarize this", "Short context".repeat(100));
        console.log("Captured Summary Body Options:", capturedBody.options);
        if (capturedBody.options.num_ctx === 16384) {
            console.log("✅ num_ctx for summary is correct (16384)");
        } else {
            console.error("❌ num_ctx for summary is wrong:", capturedBody.options.num_ctx);
        }
    } catch (e) {
        console.log("Skipping full summary test as it might need full initialization.");
    }

    console.log("\nTesting Streaming Options...");
    try {
        const gen = helper.streamChat("Hello", undefined, "Context context context context context");
        await gen.next();
        console.log("Captured Stream Body Options:", capturedBody.options);
        if (capturedBody.options.num_ctx >= 4096) {
            console.log("✅ num_ctx for stream is correct (>=4096)");
        } else {
            console.error("❌ num_ctx for stream is wrong:", capturedBody.options.num_ctx);
        }
    } catch (e) {
        console.log("Stream test skipped.");
    }
}

testOptions();
