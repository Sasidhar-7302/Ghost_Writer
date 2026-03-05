import { EventEmitter } from 'events';
import { GoogleGenAI } from "@google/genai";
import { Anthropic } from "@anthropic-ai/sdk";
import OpenAI from "openai";
import Groq from "groq-sdk";
import fs from "fs";

import { GeminiProvider } from "./llm/providers/GeminiProvider";
import { OllamaProvider } from "./llm/providers/OllamaProvider";
import { OpenAICompatProvider } from "./llm/providers/OpenAICompatProvider";
import { ClaudeProvider } from "./llm/providers/ClaudeProvider";
import { GroqProvider } from "./llm/providers/GroqProvider";
import { CustomCurlProvider } from "./llm/providers/CustomCurlProvider";

import { extractFromCommonFormats } from "./llm/providers/CustomCurlProvider";

import { CustomProvider } from "./types/customProviders";
import { GPUHelper, GPUInfo } from "./utils/GPUHelper";
import { CostTracker } from "./utils/costTracker";

import {
  UNIVERSAL_SYSTEM_PROMPT,
  HARD_SYSTEM_PROMPT,
  GROQ_SYSTEM_PROMPT,
  OPENAI_SYSTEM_PROMPT,
  CLAUDE_SYSTEM_PROMPT,
  IMAGE_ANALYSIS_PROMPT,
  GEMINI_PRO_MODEL,
  GEMINI_FLASH_MODEL
} from "./llm/prompts";

export const OPENAI_MODEL = "gpt-4o";
export const CLAUDE_MODEL = "claude-3-5-sonnet-latest";
export const DEEPSEEK_MODEL = "deepseek-reasoner";
export const RUNPOD_MODEL = "openai/runpod-model";
export const NVIDIA_MODEL = "meta/llama-3.3-70b-instruct";
const GROQ_MODEL = "llama-3.3-70b-versatile";

// Let the provider handle its own config, orchestrator shouldn't hardcode if possible
// We keep it for the OpenAI/Claude instances for now
const MAX_OUTPUT_TOKENS = 8192;

export class LLMHelper extends EventEmitter {
  private apiKey: string = ""
  private client: GoogleGenAI | null = null
  private geminiModel: string = GEMINI_FLASH_MODEL
  private currentModelId: string = GEMINI_FLASH_MODEL

  private useOllama: boolean = false
  private ollamaUrl: string = "http://localhost:11434"
  private ollamaModel: string = ""

  private groqApiKey: string = ""
  private groqClient: Groq | null = null

  private openaiApiKey: string = ""
  private openaiClient: OpenAI | null = null

  private claudeApiKey: string = ""
  private claudeClient: Anthropic | null = null

  private nvidiaApiKey: string = ""
  private nvidiaClient: OpenAI | null = null

  private deepseekApiKey: string = ""
  private deepseekClient: OpenAI | null = null

  private gpuInfo: GPUInfo | null = null
  private isInitializing: boolean = false
  private initPromise: Promise<void> | null = null

  private customProvider: CustomProvider | null = null;
  private airGapMode: boolean = false;

  constructor(apiKey: string = "") {
    super()
    if (apiKey) {
      this.setApiKey(apiKey)
    }

    try {
      const { CredentialsManager } = require('./services/CredentialsManager');
      this.airGapMode = CredentialsManager.getInstance().getAirGapMode();
    } catch (e) {
      this.airGapMode = false;
    }

    this.initializeGPUAndOllama()
  }

  // ─── INITIALIZATION ───────────────────────────────────────────────

  private async initializeGPUAndOllama() {
    if (this.isInitializing) return this.initPromise
    this.isInitializing = true

    this.initPromise = (async () => {
      try {
        this.gpuInfo = await GPUHelper.detectGPU()
        const provider = new OllamaProvider(this.ollamaUrl, this.ollamaModel)
        await provider.initializeModel()
        this.ollamaModel = provider.getModel() || this.ollamaModel
      } catch (error) {
        console.warn("[LLMHelper] Non-critical error initializing GPU/Ollama:", error)
      } finally {
        this.isInitializing = false
      }
    })()

    return this.initPromise
  }

  // ─── GETTERS & SETTERS ────────────────────────────────────────────

  public setApiKey(apiKey: string): void {
    if (!apiKey) return
    this.apiKey = apiKey
    this.client = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: { apiVersion: "v1alpha" }
    })
  }

  public setGroqApiKey(apiKey: string): void {
    if (!apiKey) return;
    this.groqApiKey = apiKey;
    this.groqClient = new Groq({ apiKey, dangerouslyAllowBrowser: true });
    GroqProvider.resolveModel(apiKey);
  }

  public setOpenaiApiKey(apiKey: string): void {
    if (!apiKey) return;
    this.openaiApiKey = apiKey;
    this.openaiClient = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
  }

  public setClaudeApiKey(apiKey: string): void {
    if (!apiKey) return;
    this.claudeApiKey = apiKey;
    this.claudeClient = new Anthropic({ apiKey });
  }

  public setNvidiaApiKey(apiKey: string): void {
    if (!apiKey) return;
    this.nvidiaApiKey = apiKey;
    this.nvidiaClient = new OpenAI({ apiKey, baseURL: 'https://integrate.api.nvidia.com/v1', dangerouslyAllowBrowser: true });
  }

  public setDeepseekApiKey(apiKey: string): void {
    if (!apiKey) return;
    this.deepseekApiKey = apiKey;
    this.deepseekClient = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com', dangerouslyAllowBrowser: true });
  }

  public getGroqApiKey(): string { return this.groqApiKey; }
  public getClient(): GoogleGenAI | null { return this.client }
  public getGroqClient(): Groq | null { return this.groqClient }
  public getOpenaiClient(): OpenAI | null { return this.openaiClient }
  public getClaudeClient(): Anthropic | null { return this.claudeClient }
  public getNvidiaClient(): OpenAI | null { return this.nvidiaClient }
  public getDeepseekClient(): OpenAI | null { return this.deepseekClient }

  public getModel(): string { return this.useOllama ? `ollama-${this.ollamaModel}` : this.geminiModel }
  public getOllamaUrl(): string { return this.ollamaUrl }

  public getCurrentProvider(): string {
    if (this.useOllama) return 'ollama';
    if (this.customProvider) return 'custom';
    if (this.currentModelId === GEMINI_PRO_MODEL || this.currentModelId === GEMINI_FLASH_MODEL) return 'gemini';
    if (this.currentModelId === GROQ_MODEL) return 'groq';
    if (this.currentModelId === OPENAI_MODEL) return 'openai';
    if (this.currentModelId === CLAUDE_MODEL) return 'claude';
    if (this.currentModelId === NVIDIA_MODEL) return 'nvidia';
    if (this.currentModelId === DEEPSEEK_MODEL) return 'deepseek';
    return 'unknown';
  }

  public getCurrentModel(): string {
    if (this.useOllama) return this.ollamaModel;
    if (this.customProvider) return this.customProvider.name;
    return this.currentModelId;
  }

  public setAirGapMode(enabled: boolean): void {
    this.airGapMode = enabled;
    console.log(`[LLMHelper] Air gap mode set to: ${enabled}`);
  }

  public setModel(modelId: string, customProviders: CustomProvider[] = []): void {
    let airGapMode = false;
    try {
      const { CredentialsManager } = require('./services/CredentialsManager');
      airGapMode = CredentialsManager.getInstance().getAirGapMode();
    } catch (e) { }

    if (airGapMode && !modelId.startsWith('ollama-')) {
      console.warn(`[LLMHelper] Air-Gap Mode is ON. Refusing to set cloud model: ${modelId}`);
      modelId = `ollama-${this.ollamaModel}`;
    }

    let targetModelId = modelId;
    if (modelId === 'gemini') targetModelId = GEMINI_FLASH_MODEL;
    if (modelId === 'gemini-pro') targetModelId = GEMINI_PRO_MODEL;
    if (modelId === 'gpt-4o') targetModelId = OPENAI_MODEL;
    if (modelId === 'claude') targetModelId = CLAUDE_MODEL;
    if (modelId === 'llama') targetModelId = GROQ_MODEL;
    if (modelId === 'nvidia') targetModelId = NVIDIA_MODEL;
    if (modelId === 'deepseek') targetModelId = DEEPSEEK_MODEL;

    if (targetModelId.startsWith('ollama-')) {
      this.useOllama = true;
      this.ollamaModel = targetModelId.replace('ollama-', '');
      this.customProvider = null;
      console.log(`[LLMHelper] Switched to Ollama: ${this.ollamaModel}`);
      return;
    }

    const custom = customProviders.find(p => p.id === targetModelId);
    if (custom) {
      this.useOllama = false;
      this.customProvider = custom;
      console.log(`[LLMHelper] Switched to Custom Provider: ${custom.name}`);
      return;
    }

    this.useOllama = false;
    this.customProvider = null;
    this.currentModelId = targetModelId;

    if (targetModelId === GEMINI_PRO_MODEL) this.geminiModel = GEMINI_PRO_MODEL;
    if (targetModelId === GEMINI_FLASH_MODEL) this.geminiModel = GEMINI_FLASH_MODEL;

    console.log(`[LLMHelper] Switched to Cloud Model: ${targetModelId}`);

    if (this.useOllama) {
      this.preloadModel(this.ollamaModel);
    }
  }

  // ─── MODEL MANAGEMENT ─────────────────────────────────────────────

  public async preloadModel(modelId: string): Promise<void> {
    const provider = new OllamaProvider(this.ollamaUrl, this.ollamaModel);
    return provider.preloadModel(modelId);
  }

  public getBestAvailableModel(): string {
    let airGapMode = false;
    try {
      const { CredentialsManager } = require('./services/CredentialsManager');
      airGapMode = CredentialsManager.getInstance().getAirGapMode();
    } catch (e) { }

    if (airGapMode) return `ollama-${this.ollamaModel}`;
    if (this.apiKey) return GEMINI_FLASH_MODEL;
    if (this.groqApiKey) return GROQ_MODEL;
    if (this.deepseekApiKey) return DEEPSEEK_MODEL;
    if (this.openaiApiKey) return OPENAI_MODEL;
    if (this.claudeApiKey) return CLAUDE_MODEL;
    if (this.nvidiaApiKey) return NVIDIA_MODEL;
    if (this.useOllama) return `ollama-${this.ollamaModel}`;

    if (!this.apiKey && !this.groqApiKey && !this.deepseekApiKey && !this.openaiApiKey && !this.claudeApiKey && !this.nvidiaApiKey) {
      return `ollama-${this.ollamaModel}`;
    }

    return GEMINI_FLASH_MODEL;
  }

  // ─── UTILITY METHODS ──────────────────────────────────────────────

  public cleanJsonResponse(text: string): string {
    let cleaned = text.replace(/```json\s*\n?/g, '').replace(/```\s*$/g, '').trim();
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
    }
    return cleaned;
  }

  public processResponse(text: string): string {
    if (!text) return "";
    let processed = text.replace(/\*\*(.+?)\*\*/g, '$1');
    const thinkStart = processed.indexOf('<think>');
    if (thinkStart !== -1) {
      const thinkEnd = processed.indexOf('</think>');
      if (thinkEnd !== -1) {
        processed = processed.substring(0, thinkStart) + processed.substring(thinkEnd + 8);
      }
    }
    processed = processed.replace(/<think>[\s\S]*?<\/think>/g, '');
    processed = processed.replace(/^[\s*#-]+/, '').trim();
    processed = processed.replace(/\n{3,}/g, '\n\n');
    return processed.trim();
  }

  public async withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (error: any) {
        if (i === retries - 1) throw error;
        if (error.message?.includes("503") || error.message?.includes("overloaded")) {
          await this.delay(1000 * (i + 1));
        } else {
          throw error;
        }
      }
    }
    throw new Error("All retries exhausted");
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, operationName: string): Promise<T> {
    let timeoutHandle: NodeJS.Timeout;
    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error(`${operationName} timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    return Promise.race([
      promise.then((result) => { clearTimeout(timeoutHandle); return result; }),
      timeoutPromise
    ]);
  }

  // ─── OLLAMA PROVIDER DELEGATIONS ──────────────────────────────────

  private async callOllamaWithModel(modelId: string, prompt: string, imagePath?: string): Promise<string> {
    const provider = new OllamaProvider(this.ollamaUrl, modelId);
    return provider.callWithModel(modelId, prompt, imagePath);
  }

  public async callOllama(prompt: string, imagePath?: string): Promise<string> {
    return this.callOllamaWithModel(this.ollamaModel, prompt, imagePath);
  }

  public async checkOllamaAvailable(): Promise<boolean> {
    const provider = new OllamaProvider(this.ollamaUrl, this.ollamaModel);
    return provider.checkAvailable();
  }

  private async initializeOllamaModel(): Promise<void> {
    const provider = new OllamaProvider(this.ollamaUrl, this.ollamaModel);
    await provider.initializeModel();
    const resolvedModel = provider.getModel();
    if (resolvedModel) this.ollamaModel = resolvedModel;
  }

  public isUsingOllama(): boolean {
    return this.useOllama;
  }

  public async getOllamaModels(): Promise<string[]> {
    const provider = new OllamaProvider(this.ollamaUrl, this.ollamaModel);
    return provider.getModels();
  }

  public async forceRestartOllama(): Promise<boolean> {
    const provider = new OllamaProvider(this.ollamaUrl, this.ollamaModel);
    return provider.forceRestart();
  }

  private async * streamWithOllama(message: string, context?: string, systemPrompt: string = UNIVERSAL_SYSTEM_PROMPT, imagePath?: string): AsyncGenerator<string, void, unknown> {
    const provider = new OllamaProvider(this.ollamaUrl, this.ollamaModel);
    yield* provider.stream(message, context, systemPrompt, imagePath);
  }

  // ─── GEMINI PROVIDER DELEGATIONS ──────────────────────────────────

  public async generateWithPro(contents: any[]): Promise<string> {
    const provider = new GeminiProvider(this.client!);
    return provider.generateWithPro(contents);
  }

  public async generateWithFlash(contents: any[]): Promise<string> {
    const provider = new GeminiProvider(this.client!);
    return provider.generateWithFlash(contents);
  }

  public async generateContent(contents: any[]): Promise<string> {
    const provider = new GeminiProvider(this.client!);
    return provider.generateContent(contents, this.geminiModel);
  }

  // ─── GEMINI LLMHELPER METHODS (previously missed) ─────────────────

  public async extractProblemFromImages(imagePaths: string[]) {
    const parts: any[] = [];
    for (const imagePath of imagePaths) {
      const imageData = await fs.promises.readFile(imagePath);
      parts.push({
        inlineData: { data: imageData.toString("base64"), mimeType: "image/png" }
      });
    }
    const prompt = `${IMAGE_ANALYSIS_PROMPT}\n\nYou are a wingman. Please analyze these images and extract the following information in JSON format:\n{\n  "problem_statement": "...",\n  "context": "...",\n  "suggested_responses": ["..."],\n  "reasoning": "..."\n}\nImportant: Return ONLY the JSON object.`;
    parts.push({ text: prompt });
    const text = await this.generateWithFlash(parts);
    return JSON.parse(this.cleanJsonResponse(text));
  }

  public async generateSolution(problemInfo: any) {
    const prompt = `${IMAGE_ANALYSIS_PROMPT}\n\nGiven this problem or situation:\n${JSON.stringify(problemInfo, null, 2)}\n\nPlease provide your response in the following JSON format:\n{\n  "solution": {\n    "code": "...",\n    "problem_statement": "...",\n    "context": "...",\n    "suggested_responses": ["..."],\n    "reasoning": "..."\n  }\n}\nImportant: Return ONLY the JSON object.`;
    const text = await this.generateWithFlash([{ text: prompt }]);
    return JSON.parse(this.cleanJsonResponse(text));
  }

  public async debugSolutionWithImages(problemInfo: any, currentCode: string, debugImagePaths: string[]) {
    const parts: any[] = [];
    for (const imagePath of debugImagePaths) {
      const imageData = await fs.promises.readFile(imagePath);
      parts.push({
        inlineData: { data: imageData.toString("base64"), mimeType: "image/png" }
      });
    }
    const prompt = `${IMAGE_ANALYSIS_PROMPT}\n\nYou are a wingman. Given:\n1. The original problem or situation: ${JSON.stringify(problemInfo, null, 2)}\n2. The current response or approach: ${currentCode}\n3. The debug information in the provided images\n\nPlease analyze the debug information and provide feedback in this JSON format:\n{\n  "solution": {\n    "code": "...",\n    "problem_statement": "...",\n    "context": "...",\n    "suggested_responses": ["..."],\n    "reasoning": "..."\n  }\n}\nImportant: Return ONLY the JSON object.`;
    parts.push({ text: prompt });
    const text = await this.generateWithFlash(parts);
    return JSON.parse(this.cleanJsonResponse(text));
  }

  public async analyzeImageFile(imagePath: string) {
    const imageData = await fs.promises.readFile(imagePath);
    const prompt = `${HARD_SYSTEM_PROMPT}\n\nDescribe the content of this image in a short, concise answer. If it contains code or a problem, solve it. \n\n${IMAGE_ANALYSIS_PROMPT}`;
    const contents = [
      { text: prompt },
      { inlineData: { mimeType: "image/png", data: imageData.toString("base64") } }
    ];
    const text = await this.generateWithFlash(contents);
    return { text, timestamp: Date.now() };
  }

  public async generateSuggestion(context: string, lastQuestion: string): Promise<string> {
    const systemPrompt = `You are an expert interview coach...\nCONVERSATION:\n${context}\nQUESTION:\n${lastQuestion}\nANSWER DIRECTLY:`;
    if (this.useOllama) {
      return await this.callOllama(systemPrompt);
    } else if (this.client) {
      const text = await this.generateWithFlash([{ text: systemPrompt }]);
      return this.processResponse(text);
    } else {
      throw new Error("No LLM provider configured");
    }
  }

  // ─── MORE GEMINI STREAMS ──────────────────────────────────────────

  private async * streamWithGeminiMultimodal(userMessage: string, imagePath: string, model: string): AsyncGenerator<string, void, unknown> {
    const provider = new GeminiProvider(this.client!);
    yield* provider.streamMultimodal(userMessage, imagePath, model);
  }

  private async * streamWithGeminiModel(fullMessage: string, model: string): AsyncGenerator<string, void, unknown> {
    const provider = new GeminiProvider(this.client!);
    yield* provider.streamWithModel(fullMessage, model);
  }

  private async * streamWithGeminiParallelRace(fullMessage: string): AsyncGenerator<string, void, unknown> {
    const provider = new GeminiProvider(this.client!);
    yield* provider.streamParallelRace(fullMessage);
  }

  private async collectStreamResponse(fullMessage: string, model: string): Promise<string> {
    const provider = new GeminiProvider(this.client!);
    return provider.collectResponse(fullMessage, model);
  }

  public createRobustClient(realClient: GoogleGenAI): GoogleGenAI {
    const provider = new GeminiProvider(realClient);
    return provider.createRobustClient(realClient);
  }

  private async generateWithFallback(client: GoogleGenAI, args: any): Promise<any> {
    const provider = new GeminiProvider(client);
    return provider.generateWithFallback(client, args);
  }

  // ─── GROQ PROVIDER DELEGATIONS ────────────────────────────────────

  private async generateWithGroq(fullMessage: string): Promise<string> {
    const provider = new GroqProvider(this.groqClient!);
    return provider.generate(fullMessage);
  }

  private async * streamWithGroq(fullMessage: string): AsyncGenerator<string, void, unknown> {
    const provider = new GroqProvider(this.groqClient!);
    yield* provider.stream(fullMessage);
  }

  public async * streamWithGroqOrGemini(
    groqMessage: string,
    geminiMessage: string,
    config?: { temperature?: number; maxTokens?: number }
  ): AsyncGenerator<string, void, unknown> {
    const provider = new GroqProvider(this.groqClient!);
    yield* provider.streamWithGeminiFallback(
      groqMessage,
      geminiMessage,
      (msg, model) => this.streamWithGeminiModel(msg, model),
      config
    );
  }

  // ─── OPENAI-COMPAT PROVIDER DELEGATIONS ───────────────────────────

  private async generateWithOpenai(userMessage: string, systemPrompt?: string, imagePath?: string): Promise<string> {
    const provider = new OpenAICompatProvider(this.openaiClient!, OPENAI_MODEL, "OpenAI");
    return provider.generate(userMessage, systemPrompt, imagePath);
  }

  private async generateWithNvidia(userMessage: string, systemPrompt?: string): Promise<string> {
    const provider = new OpenAICompatProvider(this.nvidiaClient!, NVIDIA_MODEL, "NVIDIA");
    return provider.generate(userMessage, systemPrompt);
  }

  private async generateWithDeepseek(userMessage: string, systemPrompt?: string): Promise<string> {
    const provider = new OpenAICompatProvider(this.deepseekClient!, DEEPSEEK_MODEL, "DeepSeek");
    return provider.generate(userMessage, systemPrompt);
  }

  private async * streamWithOpenai(userMessage: string, systemPrompt?: string): AsyncGenerator<string, void, unknown> {
    const provider = new OpenAICompatProvider(this.openaiClient!, OPENAI_MODEL, "OpenAI");
    yield* provider.stream(userMessage, systemPrompt);
  }

  private async * streamWithNvidia(userMessage: string, systemPrompt?: string): AsyncGenerator<string, void, unknown> {
    const provider = new OpenAICompatProvider(this.nvidiaClient!, NVIDIA_MODEL, "NVIDIA");
    yield* provider.stream(userMessage, systemPrompt);
  }

  private async * streamWithDeepseek(userMessage: string, systemPrompt?: string): AsyncGenerator<string, void, unknown> {
    const provider = new OpenAICompatProvider(this.deepseekClient!, DEEPSEEK_MODEL, "DeepSeek");
    yield* provider.stream(userMessage, systemPrompt);
  }

  private async * streamWithOpenaiMultimodal(userMessage: string, imagePath: string, systemPrompt?: string): AsyncGenerator<string, void, unknown> {
    const provider = new OpenAICompatProvider(this.openaiClient!, OPENAI_MODEL, "OpenAI");
    yield* provider.streamMultimodal(userMessage, imagePath, systemPrompt);
  }

  // ─── CLAUDE PROVIDER DELEGATIONS ──────────────────────────────────

  private async generateWithClaude(userMessage: string, systemPrompt?: string, imagePath?: string): Promise<string> {
    const provider = new ClaudeProvider(this.claudeClient!);
    return provider.generate(userMessage, systemPrompt, imagePath);
  }

  private async * streamWithClaude(userMessage: string, systemPrompt?: string): AsyncGenerator<string, void, unknown> {
    const provider = new ClaudeProvider(this.claudeClient!);
    yield* provider.stream(userMessage, systemPrompt);
  }

  private async * streamWithClaudeMultimodal(userMessage: string, imagePath: string, systemPrompt?: string): AsyncGenerator<string, void, unknown> {
    const provider = new ClaudeProvider(this.claudeClient!);
    yield* provider.streamMultimodal(userMessage, imagePath, systemPrompt);
  }

  // ─── CUSTOM CURL PROVIDER DELEGATIONS ─────────────────────────────

  private async executeCustomProvider(
    combinedMessage: string,
    systemPrompt: string,
    rawUserMessage: string,
    context: string,
    imagePath?: string
  ): Promise<string> {
    const provider = new CustomCurlProvider(this.customProvider!);
    return provider.execute(combinedMessage, systemPrompt, rawUserMessage, context, imagePath);
  }

  private mapToCustomPrompt(prompt: string): string {
    if (!this.customProvider) return prompt;
    return CustomCurlProvider.mapToCustomPrompt(prompt);
  }

  private async * streamWithCustom(message: string, context?: string, imagePath?: string, systemPrompt: string = UNIVERSAL_SYSTEM_PROMPT): AsyncGenerator<string, void, unknown> {
    if (!this.customProvider) throw new Error("No custom provider configured");
    const provider = new CustomCurlProvider(this.customProvider!);
    yield* provider.stream(message, context, imagePath, systemPrompt);
  }

  // ─── CONNECTION TESTING ───────────────────────────────────────────

  public async testSpecificConnection(provider: string, apiKey: string): Promise<{ success: boolean; error?: string }> {
    try {
      switch (provider) {
        case 'gemini': {
          const client = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "v1alpha" } });
          const response = await client.models.generateContent({ model: GEMINI_FLASH_MODEL, contents: [{ role: 'user', parts: [{ text: 'Say "Hello"' }] }] });
          return response?.text ? { success: true } : { success: false, error: "Empty response" };
        }
        case 'groq': {
          const client = new Groq({ apiKey, dangerouslyAllowBrowser: true });
          const response = await client.chat.completions.create({ model: GROQ_MODEL, messages: [{ role: "user", content: "Say hello" }], max_tokens: 10 });
          return response?.choices?.[0]?.message?.content ? { success: true } : { success: false, error: "Empty response" };
        }
        case 'openai': {
          const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
          const response = await client.chat.completions.create({ model: OPENAI_MODEL, messages: [{ role: "user", content: "Say hello" }], max_tokens: 10 });
          return response?.choices?.[0]?.message?.content ? { success: true } : { success: false, error: "Empty response" };
        }
        case 'claude': {
          const client = new Anthropic({ apiKey });
          const response = await client.messages.create({ model: CLAUDE_MODEL, max_tokens: 10, messages: [{ role: "user", content: "Say hello" }] });
          const block = response?.content?.[0];
          return (block && 'text' in block && block.text) ? { success: true } : { success: false, error: "Empty response" };
        }
        case 'nvidia': {
          const client = new OpenAI({ apiKey, baseURL: 'https://integrate.api.nvidia.com/v1', dangerouslyAllowBrowser: true });
          const response = await client.chat.completions.create({ model: NVIDIA_MODEL, messages: [{ role: "user", content: "Say hello" }], max_tokens: 10 });
          return response?.choices?.[0]?.message?.content ? { success: true } : { success: false, error: "Empty response" };
        }
        case 'deepseek': {
          const client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com', dangerouslyAllowBrowser: true });
          const response = await client.chat.completions.create({ model: DEEPSEEK_MODEL, messages: [{ role: "user", content: "Say hello" }], max_tokens: 10 });
          return response?.choices?.[0]?.message?.content ? { success: true } : { success: false, error: "Empty response" };
        }
        case 'ollama': {
          const resp = await fetch(`${this.ollamaUrl}/api/tags`);
          return resp.ok ? { success: true } : { success: false, error: `HTTP ${resp.status}` };
        }
        default:
          return { success: false, error: `Unknown provider: ${provider}` };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  public async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      if (this.useOllama) {
        const available = await this.checkOllamaAvailable();
        if (!available) {
          return { success: false, error: `Ollama not available at ${this.ollamaUrl}` };
        }
        await this.callOllama("Hello");
        return { success: true };
      } else {
        if (!this.client) {
          return { success: false, error: "No Gemini client configured" };
        }
        const text = await this.generateContent([{ text: "Hello" }]);
        if (text) {
          return { success: true };
        } else {
          return { success: false, error: "Empty response from Gemini" };
        }
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // ─── SWItCHERS ────────────────────────────────────────────────────

  public async switchToOllama(model?: string, url?: string): Promise<void> {
    this.useOllama = true;
    if (url) this.ollamaUrl = url;

    if (model) {
      this.ollamaModel = model;
    } else {
      await this.initializeOllamaModel();
    }
  }

  public async switchToGemini(apiKey?: string, modelId?: string): Promise<void> {
    if (modelId) {
      this.geminiModel = modelId;
    }

    if (apiKey) {
      this.apiKey = apiKey;
      this.client = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: { apiVersion: "v1alpha" }
      });
    } else if (!this.client) {
      throw new Error("No Gemini API key provided and no existing client");
    }

    this.useOllama = false;
    this.customProvider = null;
  }

  public async switchToCustom(provider: CustomProvider): Promise<void> {
    this.customProvider = provider;
    this.useOllama = false;
    this.client = null;
    this.groqClient = null;
    this.openaiClient = null;
    this.claudeClient = null;
    console.log(`[LLMHelper] Switched to Custom Provider: ${provider.name}`);
  }

  // ─── GEMINI GENERATION HELPERS ────────────────────────────────────

  private async tryGenerateResponse(fullMessage: string, imagePath?: string): Promise<string> {
    let rawResponse: string;

    if (imagePath) {
      const imageData = await fs.promises.readFile(imagePath);
      const contents = [
        { text: fullMessage },
        { inlineData: { mimeType: "image/png", data: imageData.toString("base64") } }
      ];
      if (this.client) {
        rawResponse = await this.generateContent(contents);
      } else {
        throw new Error("No LLM provider configured");
      }
    } else {
      if (this.useOllama) {
        rawResponse = await this.callOllama(fullMessage);
      } else if (this.client) {
        rawResponse = await this.generateContent([{ text: fullMessage }]);
      } else {
        throw new Error("No LLM provider configured");
      }
    }

    return rawResponse || "";
  }

  // ─── CHAT ROUTING (NON-STREAMING) ─────────────────────────────────

  public async chatWithGemini(message: string, imagePath?: string, context?: string, skipSystemPrompt: boolean = false, alternateGroqMessage?: string): Promise<string> {
    try {
      const isMultimodal = !!imagePath;

      const buildMessage = (systemPrompt: string) => {
        if (skipSystemPrompt) {
          return context
            ? `CONTEXT:\n${context}\n\nUSER QUESTION:\n${message}`
            : message;
        }
        return context
          ? `${systemPrompt}\n\nCONTEXT:\n${context}\n\nUSER QUESTION:\n${message}`
          : `${systemPrompt}\n\n${message}`;
      };

      const userContent = context
        ? `CONTEXT:\n${context}\n\nUSER QUESTION:\n${message}`
        : message;

      const combinedMessages = {
        gemini: buildMessage(HARD_SYSTEM_PROMPT),
        groq: alternateGroqMessage || buildMessage(GROQ_SYSTEM_PROMPT),
      };

      const openaiSystemPrompt = skipSystemPrompt ? undefined : OPENAI_SYSTEM_PROMPT;
      const claudeSystemPrompt = skipSystemPrompt ? undefined : CLAUDE_SYSTEM_PROMPT;

      if (this.useOllama) {
        return await this.callOllama(combinedMessages.gemini);
      }

      if (this.customProvider) {
        const response = await this.executeCustomProvider(
          combinedMessages.gemini,
          skipSystemPrompt ? "" : HARD_SYSTEM_PROMPT,
          message,
          context || "",
          imagePath
        );
        return this.processResponse(response);
      }

      if (this.currentModelId === OPENAI_MODEL && this.openaiClient) {
        return await this.generateWithOpenai(userContent, openaiSystemPrompt, imagePath);
      }
      if (this.currentModelId === CLAUDE_MODEL && this.claudeClient) {
        return await this.generateWithClaude(userContent, claudeSystemPrompt, imagePath);
      }
      if (this.currentModelId === GROQ_MODEL && this.groqClient && !isMultimodal) {
        return await this.generateWithGroq(combinedMessages.groq);
      }
      if (this.currentModelId === NVIDIA_MODEL && this.nvidiaClient && !isMultimodal) {
        return await this.generateWithNvidia(userContent, openaiSystemPrompt);
      }
      if (this.currentModelId === DEEPSEEK_MODEL && this.deepseekClient && !isMultimodal) {
        return await this.generateWithDeepseek(userContent, openaiSystemPrompt);
      }

      type ProviderAttempt = { name: string; execute: () => Promise<string> };
      const providers: ProviderAttempt[] = [];

      if (isMultimodal) {
        if (this.client) {
          providers.push({ name: `Gemini Flash`, execute: () => this.tryGenerateResponse(combinedMessages.gemini, imagePath) });
        }
        if (this.openaiClient) {
          providers.push({ name: `OpenAI`, execute: () => this.generateWithOpenai(userContent, openaiSystemPrompt, imagePath) });
        }
        if (this.claudeClient) {
          providers.push({ name: `Claude`, execute: () => this.generateWithClaude(userContent, claudeSystemPrompt, imagePath) });
        }
      } else {
        if (this.claudeClient) {
          providers.push({ name: `Claude`, execute: () => this.generateWithClaude(userContent, claudeSystemPrompt) });
        }
        if (this.client) {
          providers.push({ name: `Gemini Flash`, execute: () => this.tryGenerateResponse(combinedMessages.gemini) });
        }
        if (this.nvidiaClient) {
          providers.push({ name: `NVIDIA`, execute: () => this.generateWithNvidia(userContent, openaiSystemPrompt) });
        }
        if (this.deepseekClient) {
          providers.push({ name: `DeepSeek`, execute: () => this.generateWithDeepseek(userContent, openaiSystemPrompt) });
        }
        if (this.groqClient) {
          providers.push({ name: `Groq`, execute: () => this.generateWithGroq(combinedMessages.groq) });
        }
        if (this.openaiClient) {
          providers.push({ name: `OpenAI`, execute: () => this.generateWithOpenai(userContent, openaiSystemPrompt) });
        }
        if (!this.useOllama) {
          providers.push({
            name: `Ollama`,
            execute: async () => {
              try {
                return await this.callOllama(combinedMessages.gemini);
              } catch (e) {
                throw new Error(`Ollama not available: ${(e as Error).message}`);
              }
            }
          });
        }
      }

      if (providers.length === 0) {
        return "No AI providers configured. Please add at least one API key in Settings.";
      }

      for (let rotation = 0; rotation < 3; rotation++) {
        if (rotation > 0) {
          await this.delay(1000 * rotation);
        }

        for (const provider of providers) {
          try {
            const rawResponse = await provider.execute();
            if (rawResponse && rawResponse.trim().length > 0) {
              return this.processResponse(rawResponse);
            }
          } catch (error: any) { }
        }
      }

      return "I apologize, but I couldn't generate a response. Please try again.";

    } catch (error: any) {
      if (error.message.includes("503") || error.message.includes("overloaded")) {
        return "The AI service is currently overloaded. Please try again in a moment.";
      }
      if (error.message.includes("API key")) {
        return "Authentication failed. Please check your API key in settings.";
      }
      return `I encountered an error: ${error.message || "Unknown error"}. Please try again.`;
    }
  }

  // ─── CHAT ROUTING (STREAMING W/ GEMINI FOCUS) ─────────────────────

  public async * streamChatWithGemini(userMessage: string, imagePath?: string, context?: string, skipSystemPrompt: boolean = false): AsyncGenerator<string, void, unknown> {
    const isMultimodal = !!imagePath;

    let fullMessage = skipSystemPrompt ? "" : UNIVERSAL_SYSTEM_PROMPT;
    if (context) fullMessage += `\n\nCONTEXT:\n${context}`;
    fullMessage += `\n\nUSER QUESTION:\n${userMessage}`;

    if (this.useOllama) {
      yield* this.streamWithOllama(userMessage, context, skipSystemPrompt ? "" : UNIVERSAL_SYSTEM_PROMPT, imagePath);
      return;
    }

    if (this.customProvider) {
      yield* this.streamWithCustom(userMessage, context, imagePath, skipSystemPrompt ? "" : UNIVERSAL_SYSTEM_PROMPT);
      return;
    }

    if (isMultimodal) {
      if (this.client) {
        yield* this.streamWithGeminiMultimodal(userMessage, imagePath!, GEMINI_FLASH_MODEL);
        return;
      }
      if (this.openaiClient) {
        yield* this.streamWithOpenaiMultimodal(userMessage, imagePath!, OPENAI_SYSTEM_PROMPT);
        return;
      }
      if (this.claudeClient) {
        yield* this.streamWithClaudeMultimodal(userMessage, imagePath!, CLAUDE_SYSTEM_PROMPT);
        return;
      }
      yield "Image analysis requires Gemini, OpenAI, or Claude. Please configure one of these providers.";
      return;
    }

    let primaryStream: (() => AsyncGenerator<string, void, unknown>)[] = [];

    if (this.currentModelId === CLAUDE_MODEL && this.claudeClient) {
      primaryStream.push(() => this.streamWithClaude(userMessage, CLAUDE_SYSTEM_PROMPT));
    } else if (this.currentModelId === OPENAI_MODEL && this.openaiClient) {
      primaryStream.push(() => this.streamWithOpenai(userMessage, OPENAI_SYSTEM_PROMPT));
    } else if (this.currentModelId === GROQ_MODEL && this.groqClient) {
      primaryStream.push(() => this.streamWithGroq(fullMessage));
    } else if (this.currentModelId === NVIDIA_MODEL && this.nvidiaClient) {
      primaryStream.push(() => this.streamWithNvidia(userMessage, OPENAI_SYSTEM_PROMPT));
    } else if (this.currentModelId === DEEPSEEK_MODEL && this.deepseekClient) {
      primaryStream.push(() => this.streamWithDeepseek(userMessage, OPENAI_SYSTEM_PROMPT));
    } else if (this.client) {
      primaryStream.push(() => this.streamWithGeminiParallelRace(fullMessage));
    }

    if (primaryStream.length > 0) {
      for (const streamFn of primaryStream) {
        try {
          const generator = streamFn();
          let hasContent = false;
          for await (const chunk of generator) {
            if (chunk) {
              hasContent = true;
              yield chunk;
            }
          }
          if (hasContent) return;
        } catch (e: any) {
          console.warn(`[LLMHelper] Primary stream failed: ${e.message}`);
        }
      }
    }

    if (this.client) {
      try {
        console.log(`[LLMHelper] Fallback: Streaming with Gemini Flash`);
        let hasContent = false;
        for await (const chunk of this.streamWithGeminiModel(fullMessage, GEMINI_FLASH_MODEL)) {
          if (chunk) {
            hasContent = true;
            yield chunk;
          }
        }
        if (hasContent) return;
      } catch (e: any) { }
    }

    yield "All AI providers failed to generate a response. Please try again.";
  }

  // ─── UNIVERSAL STREAM ROUTING ─────────────────────────────────────

  public async * streamChat(message: string, context?: string, imagePath?: string, systemPrompt: string = UNIVERSAL_SYSTEM_PROMPT): AsyncGenerator<string, void, unknown> {
    if (this.useOllama) {
      yield* this.streamWithOllama(message, context, systemPrompt, imagePath);
      return;
    }

    if (this.customProvider) {
      yield* this.streamWithCustom(message, context, imagePath, systemPrompt);
      return;
    }

    if (this.currentModelId === GROQ_MODEL && this.groqClient && !imagePath) {
      const fullMessage = context ? `${systemPrompt}\n\nCONTEXT:\n${context}\n\nUSER QUESTION:\n${message}` : `${systemPrompt}\n\n${message}`;
      yield* this.streamWithGroq(fullMessage);
      return;
    }

    if (this.currentModelId === NVIDIA_MODEL && this.nvidiaClient && !imagePath) {
      const userContent = context ? `CONTEXT:\n${context}\n\nUSER QUESTION:\n${message}` : message;
      yield* this.streamWithNvidia(userContent, OPENAI_SYSTEM_PROMPT);
      return;
    }

    if (this.currentModelId === DEEPSEEK_MODEL && this.deepseekClient && !imagePath) {
      const userContent = context ? `CONTEXT:\n${context}\n\nUSER QUESTION:\n${message}` : message;
      yield* this.streamWithDeepseek(userContent, OPENAI_SYSTEM_PROMPT);
      return;
    }

    if (this.currentModelId === CLAUDE_MODEL && this.claudeClient) {
      const userContent = context ? `CONTEXT:\n${context}\n\nUSER QUESTION:\n${message}` : message;
      if (imagePath) {
        yield* this.streamWithClaudeMultimodal(userContent, imagePath, CLAUDE_SYSTEM_PROMPT);
      } else {
        yield* this.streamWithClaude(userContent, CLAUDE_SYSTEM_PROMPT);
      }
      return;
    }

    if (this.currentModelId === OPENAI_MODEL && this.openaiClient) {
      const userContent = context ? `CONTEXT:\n${context}\n\nUSER QUESTION:\n${message}` : message;
      if (imagePath) {
        yield* this.streamWithOpenaiMultimodal(userContent, imagePath, OPENAI_SYSTEM_PROMPT);
      } else {
        yield* this.streamWithOpenai(userContent, OPENAI_SYSTEM_PROMPT);
      }
      return;
    }

    yield* this.streamChatWithGemini(message, imagePath, context, systemPrompt === UNIVERSAL_SYSTEM_PROMPT ? false : true);
  }

  // ─── MEETING SUMMARY LOGIC ────────────────────────────────────────

  public async generateMeetingSummary(systemPrompt: string, context: string, groqSystemPrompt?: string): Promise<string> {
    const estimateTokens = (text: string) => Math.ceil(text.length / 4);
    const tokenCount = estimateTokens(context);

    // 1: Groq (if text-only and within limits)
    if (this.groqClient && tokenCount < 100000) {
      try {
        const response = await this.withTimeout(
          this.groqClient.chat.completions.create({
            model: GROQ_MODEL,
            messages: [
              { role: "system", content: groqSystemPrompt || systemPrompt },
              { role: "user", content: `Context:\n${context}` }
            ],
            temperature: 0.3,
            max_tokens: 8192,
            stream: false
          }),
          45000,
          "Groq Summary"
        );
        const text = response.choices[0]?.message?.content || "";
        if (text.trim().length > 0) return this.processResponse(text);
      } catch (e: any) { }
    }

    // 2: Gemini Flash
    const contents = [{ text: `${systemPrompt}\n\nCONTEXT:\n${context}` }];
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const text = await this.withTimeout(
          this.generateWithFlash(contents),
          45000,
          `Gemini Flash Summary (Attempt ${attempt})`
        );
        if (text.trim().length > 0) return this.processResponse(text);
      } catch (e: any) {
        if (attempt < 3) await this.delay(1000 * attempt);
      }
    }

    // 3: Ollama local summarization fallback
    try {
      const response = await this.withTimeout(
        this.callOllamaWithModel(this.ollamaModel, `${systemPrompt}\n\nCONTEXT:\n${context}`),
        300000,
        "Ollama Summary"
      );
      if (response && response.trim().length > 0) return this.processResponse(response);
    } catch (e: any) { }

    throw new Error("Failed to generate summary after all fallback attempts.");
  }

  // ─── UNIVERSAL CHAT (NON-STREAMING) ───────────────────────────────

  public async chat(message: string, imagePath?: string, context?: string, systemPromptOverride?: string): Promise<string> {
    let fullResponse = "";
    try {
      const stream = this.streamChat(message, context, imagePath, systemPromptOverride || UNIVERSAL_SYSTEM_PROMPT);
      for await (const chunk of stream) {
        fullResponse += chunk;
      }
      return this.processResponse(fullResponse);
    } catch (error: any) {
      return this.chatWithGemini(message, imagePath, context, !!systemPromptOverride);
    }
  }
}