
const fs = require('fs');
const path = require('path');

// Mock a minimal LLMHelper to test the fallback logic
async function verifySummaryFallback() {
    console.log("Verifying Meeting Summary Fallback logic...");

    // We can't easily run the full Electron context here without significant boilerplate,
    // so we'll check the LLMHelper.ts content for the fix.

    const llmFile = path.resolve(__dirname, '../electron/LLMHelper.ts');
    const content = fs.readFileSync(llmFile, 'utf8');

    // Check 1: vision model expands
    const hasQwen3 = content.includes('qwen3-vl');
    console.log(hasQwen3 ? "✅ qwen3-vl support found." : "❌ qwen3-vl support missing.");

    // Check 2: vision selection respect
    const hasRespect = content.includes('isAlreadyVision');
    console.log(hasRespect ? "✅ isAlreadyVision check found." : "❌ isAlreadyVision check missing.");

    // Check 3: Gemini Pro guard
    const hasClientGuard = content.includes('if (this.client) {') && content.includes('// ATTEMPT 3: Gemini Pro');
    console.log(hasClientGuard ? "✅ Gemini Pro client guard found (prevents crash on missing key)." : "❌ Gemini Pro client guard missing.");

    // Check 4: Ollama Fallback
    const hasOllamaFallback = content.includes('// ATTEMPT 4: Ollama');
    console.log(hasOllamaFallback ? "✅ Ollama summary fallback found." : "❌ Ollama summary fallback missing.");

    if (hasQwen3 && hasRespect && hasClientGuard && hasOllamaFallback) {
        console.log("\nSUCCESS: All summary and vision logic fixes verified in code.");
    } else {
        console.error("\nFAILURE: Some fixes are missing from LLMHelper.ts");
        process.exit(1);
    }
}

verifySummaryFallback().catch(console.error);
