const fs = require("fs");
const http = require("http");
const path = require("path");
const { app } = require("electron");

const projectRoot = path.resolve(__dirname, "..");
const distLLMHelperPath = path.join(projectRoot, "dist-electron", "electron", "LLMHelper.js");
const imageFixturePath = path.join(projectRoot, "assets", "tests", "code_sample_1.png");

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function createServer() {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            let body = "";
            req.on("data", (chunk) => {
                body += chunk.toString();
            });
            req.on("end", () => {
                let parsed = {};
                try {
                    parsed = body ? JSON.parse(body) : {};
                    if (typeof parsed === "string") {
                        parsed = JSON.parse(parsed);
                    }
                } catch {
                    parsed = {};
                }

                const responseText = [
                    `message=${parsed.message || parsed.prompt || ""}`,
                    `context=${parsed.context || ""}`,
                    `system=${parsed.system || parsed.systemPrompt || ""}`,
                    `image=${parsed.image ? "yes" : "no"}`
                ].join(" | ");

                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ response: responseText }));
            });
        });

        server.listen(0, "127.0.0.1", () => {
            resolve(server);
        });
    });
}

function buildCurlCommand(port) {
    return `curl -X POST http://127.0.0.1:${port}/chat -H 'Content-Type: application/json' --data-raw '{"prompt":"{{TEXT}}","image":"{{IMAGE_BASE64}}"}'`;
}

async function readStream(generator) {
    let output = "";
    for await (const chunk of generator) {
        output += chunk;
    }
    return output;
}

async function main() {
    let server;

    try {
        assert(fs.existsSync(distLLMHelperPath), "dist-electron/electron/LLMHelper.js not found.");
        assert(fs.existsSync(imageFixturePath), "Smoke image fixture not found.");

        server = await createServer();
        const port = server.address().port;
        const curlCommand = buildCurlCommand(port);
        const { LLMHelper } = require(distLLMHelperPath);
        const llmHelper = new LLMHelper();

        await llmHelper.switchToCustom({
            id: "smoke-provider",
            name: "Smoke Provider",
            curlCommand
        });

        const connection = await llmHelper.testCustomProvider(curlCommand);
        assert(connection.success, `Custom provider connection test failed: ${connection.error || "unknown error"}`);

        const textResponse = await llmHelper.chat({
            message: "hello smoke",
            context: "context block",
            systemPrompt: "system block"
        });
        assert(textResponse.includes("hello smoke"), `Text chat did not preserve message. Actual: ${textResponse}`);
        assert(textResponse.includes("context block"), `Text chat did not preserve context. Actual: ${textResponse}`);
        assert(textResponse.includes("system block"), `Text chat did not preserve system prompt. Actual: ${textResponse}`);

        const streamResponse = await readStream(llmHelper.streamChat({
            message: "stream smoke",
            context: "stream context",
            systemPrompt: "stream system"
        }));
        assert(streamResponse.includes("stream smoke"), `Stream chat did not preserve message. Actual: ${streamResponse}`);
        assert(streamResponse.includes("stream context"), `Stream chat did not preserve context. Actual: ${streamResponse}`);

        const imageResponse = await llmHelper.chat({
            message: "describe the screenshot",
            imagePath: imageFixturePath,
            context: "image context",
            systemPrompt: "vision system"
        });
        assert(imageResponse.includes("image=yes"), "Image chat did not send image data.");

        const analyzed = await llmHelper.analyzeImageFile(imageFixturePath);
        assert(analyzed.text.includes("image=yes"), "analyzeImageFile did not route through multimodal chat.");

        console.log("[smoke] app boot, custom provider, text chat, stream chat, and image chat all passed.");
        server.close();
        app.exit(0);
    } catch (error) {
        if (server) {
            server.close();
        }
        console.error(`[smoke] ${error.message || error}`);
        app.exit(1);
    }
}

app.whenReady().then(main);
