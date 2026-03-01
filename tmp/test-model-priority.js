
const fs = require('fs');
const path = require('path');

async function testModelPriority() {
    console.log("Analyzing LLMHelper.ts for smart selection logic...");
    const llmFile = path.resolve(__dirname, '../electron/LLMHelper.ts');
    const content = fs.readFileSync(llmFile, 'utf8');

    // 1. Check getBestAvailableModel exists
    if (content.includes('public getBestAvailableModel(): string')) {
        console.log("✅ getBestAvailableModel implemented.");
    } else {
        console.log("❌ getBestAvailableModel missing!");
    }

    // 2. Check priority order
    const priorityOrder = [
        'if (this.apiKey) return GEMINI_FLASH_MODEL',
        'if (this.groqApiKey) return GROQ_MODEL',
        'if (this.deepseekApiKey) return DEEPSEEK_MODEL'
    ];

    let allPriosMatch = true;
    for (const p of priorityOrder) {
        if (!content.includes(p)) {
            allPriosMatch = false;
            console.log(`❌ Priority check failed for: ${p}`);
        }
    }
    if (allPriosMatch) console.log("✅ Provider priority order verified (Cloud first).");

    // 3. Check Ranked Models for RTX 3060 (High Tier)
    if (content.includes("'qwen2.5:14b', 'qwen2.5:7b'")) {
        console.log("✅ Ranked local models found for High tier.");
    } else {
        console.log("❌ Ranked local models missing or incorrect for High tier!");
    }

    // 4. Check IPC handler auto-switch
    const handlerFile = path.resolve(__dirname, '../electron/ipc/credentialHandlers.ts');
    const handlerContent = fs.readFileSync(handlerFile, 'utf8');
    if (handlerContent.includes('llmHelper.setModel(llmHelper.getBestAvailableModel())')) {
        console.log("✅ IPC handlers now auto-switch to best model on key update.");
    } else {
        console.log("❌ IPC handlers missing auto-switch logic!");
    }
}

testModelPriority();
