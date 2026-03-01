// Credential & Provider IPC Handlers
// Handles API key management, custom providers, and credential storage

import { ipcMain, dialog } from "electron";
import type { AppState } from "../main";

/**
 * Helper: Set an API key for a provider with standard pattern
 * - Save to CredentialsManager
 * - Update LLMHelper
 * - Re-init IntelligenceManager
 */
function makeApiKeySetter(
  appState: AppState,
  channel: string,
  credSetter: (creds: any, key: string) => void,
  llmSetter: (llm: any, key: string) => void
) {
  ipcMain.handle(channel, async (_, apiKey: string) => {
    try {
      const { CredentialsManager } = require('../services/CredentialsManager');
      credSetter(CredentialsManager.getInstance(), apiKey);

      const llmHelper = appState.processingHelper.getLLMHelper();
      llmSetter(llmHelper, apiKey);

      // Auto-switch to best model if currently on a weak fallback
      llmHelper.setModel(llmHelper.getBestAvailableModel());
      appState.getIntelligenceManager().initializeLLMs();

      return { success: true };
    } catch (error: any) {
      console.error(`Error saving API key [${channel}]:`, error);
      return { success: false, error: error.message };
    }
  });
}

export function registerCredentialHandlers(appState: AppState): void {
  // ==========================================
  // LLM Provider Config
  // ==========================================

  ipcMain.handle("get-current-llm-config", async () => {
    try {
      const llmHelper = appState.processingHelper.getLLMHelper();
      return {
        provider: llmHelper.getCurrentProvider(),
        model: llmHelper.getCurrentModel(),
        isOllama: llmHelper.isUsingOllama()
      };
    } catch (error: any) {
      throw error;
    }
  });

  ipcMain.handle("get-available-ollama-models", async () => {
    try {
      const llmHelper = appState.processingHelper.getLLMHelper();
      return await llmHelper.getOllamaModels();
    } catch (error: any) {
      throw error;
    }
  });

  ipcMain.handle("switch-to-ollama", async (_, model?: string, url?: string) => {
    try {
      const llmHelper = appState.processingHelper.getLLMHelper();
      await llmHelper.switchToOllama(model, url);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("force-restart-ollama", async () => {
    try {
      const llmHelper = appState.processingHelper.getLLMHelper();
      const success = await llmHelper.forceRestartOllama();
      return { success };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("switch-to-gemini", async (_, apiKey?: string, modelId?: string) => {
    try {
      const llmHelper = appState.processingHelper.getLLMHelper();
      await llmHelper.switchToGemini(apiKey, modelId);

      if (apiKey) {
        const { CredentialsManager } = require('../services/CredentialsManager');
        CredentialsManager.getInstance().setGeminiApiKey(apiKey);
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // ==========================================
  // API Key Setters (using DRY helper)
  // ==========================================

  makeApiKeySetter(appState, "set-gemini-api-key",
    (c, k) => c.setGeminiApiKey(k), (l, k) => l.setApiKey(k));

  makeApiKeySetter(appState, "set-groq-api-key",
    (c, k) => c.setGroqApiKey(k), (l, k) => l.setGroqApiKey(k));

  makeApiKeySetter(appState, "set-openai-api-key",
    (c, k) => c.setOpenaiApiKey(k), (l, k) => l.setOpenaiApiKey(k));

  makeApiKeySetter(appState, "set-claude-api-key",
    (c, k) => c.setClaudeApiKey(k), (l, k) => l.setClaudeApiKey(k));

  makeApiKeySetter(appState, "set-nvidia-api-key",
    (c, k) => c.setNvidiaApiKey(k), (l, k) => l.setNvidiaApiKey(k));

  makeApiKeySetter(appState, "set-deepseek-api-key",
    (c, k) => c.setDeepseekApiKey(k), (l, k) => l.setDeepseekApiKey(k));

  // ==========================================
  // Custom Provider Handlers
  // ==========================================

  ipcMain.handle("get-custom-providers", async () => {
    try {
      const { CredentialsManager } = require('../services/CredentialsManager');
      return CredentialsManager.getInstance().getCustomProviders();
    } catch (error: any) {
      console.error("Error getting custom providers:", error);
      return [];
    }
  });

  ipcMain.handle("save-custom-provider", async (_, provider: any) => {
    try {
      const { CredentialsManager } = require('../services/CredentialsManager');
      CredentialsManager.getInstance().saveCustomProvider(provider);
      return { success: true };
    } catch (error: any) {
      console.error("Error saving custom provider:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("delete-custom-provider", async (_, id: string) => {
    try {
      const { CredentialsManager } = require('../services/CredentialsManager');
      CredentialsManager.getInstance().deleteCustomProvider(id);
      return { success: true };
    } catch (error: any) {
      console.error("Error deleting custom provider:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("switch-to-custom-provider", async (_, providerId: string) => {
    try {
      const { CredentialsManager } = require('../services/CredentialsManager');
      const provider = CredentialsManager.getInstance().getCustomProviders().find((p: any) => p.id === providerId);

      if (!provider) {
        throw new Error("Provider not found");
      }

      const llmHelper = appState.processingHelper.getLLMHelper();
      await llmHelper.switchToCustom(provider);

      appState.getIntelligenceManager().initializeLLMs();

      return { success: true };
    } catch (error: any) {
      console.error("Error switching to custom provider:", error);
      return { success: false, error: error.message };
    }
  });

  // ==========================================
  // Stored Credentials (masked for UI)
  // ==========================================

  ipcMain.handle("get-stored-credentials", async () => {
    try {
      const { CredentialsManager } = require('../services/CredentialsManager');
      const creds = CredentialsManager.getInstance().getAllCredentials();

      return {
        hasGeminiKey: !!creds.geminiApiKey,
        hasGroqKey: !!creds.groqApiKey,
        hasOpenaiKey: !!creds.openaiApiKey,
        hasClaudeKey: !!creds.claudeApiKey,
        hasNvidiaKey: !!creds.nvidiaApiKey,
        hasDeepseekKey: !!creds.deepseekApiKey,
        googleServiceAccountPath: creds.googleServiceAccountPath || null,
        sttProvider: creds.sttProvider || 'google',
        groqSttModel: creds.groqSttModel || 'whisper-large-v3-turbo',
        hasSttGroqKey: !!creds.groqSttApiKey,
        hasSttOpenaiKey: !!creds.openAiSttApiKey,
        hasDeepgramKey: !!creds.deepgramApiKey,
        hasElevenLabsKey: !!creds.elevenLabsApiKey,
        hasAzureKey: !!creds.azureApiKey,
        azureRegion: creds.azureRegion || 'eastus',
        hasIbmWatsonKey: !!creds.ibmWatsonApiKey,
        ibmWatsonRegion: creds.ibmWatsonRegion || 'us-south',
        hasResume: !!creds.resumePath,
        hasJobDescription: !!creds.jobDescriptionText,
      };
    } catch (error: any) {
      return { hasGeminiKey: false, hasGroqKey: false, hasOpenaiKey: false, hasClaudeKey: false, hasNvidiaKey: false, hasDeepseekKey: false, googleServiceAccountPath: null, sttProvider: 'google', groqSttModel: 'whisper-large-v3-turbo', hasSttGroqKey: false, hasSttOpenaiKey: false, hasDeepgramKey: false, hasElevenLabsKey: false, hasAzureKey: false, azureRegion: 'eastus', hasIbmWatsonKey: false, ibmWatsonRegion: 'us-south', hasResume: false, hasJobDescription: false };
    }
  });

  // ==========================================
  // Model Selection & Testing
  // ==========================================

  ipcMain.handle("set-model-preference", (_, type: "flash" | "pro") => {
    try {
      const { GEMINI_FLASH_MODEL, GEMINI_PRO_MODEL } = require('../IntelligenceManager');
      const im = appState.getIntelligenceManager();
      const model = type === 'pro' ? GEMINI_PRO_MODEL : GEMINI_FLASH_MODEL;
      im.setModel(model);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("set-model", async (_, modelId: string) => {
    try {
      const llmHelper = appState.processingHelper.getLLMHelper();
      const { CredentialsManager } = require('../services/CredentialsManager');
      const customProviders = CredentialsManager.getInstance().getCustomProviders();
      llmHelper.setModel(modelId, customProviders);
      return { success: true };
    } catch (error: any) {
      console.error("Error setting model:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("test-llm-connection", async (_, provider?: string, apiKey?: string) => {
    try {
      const llmHelper = appState.processingHelper.getLLMHelper();
      if (provider && apiKey) {
        return await llmHelper.testSpecificConnection(provider, apiKey);
      }
      return await llmHelper.testConnection();
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Service Account Selection
  ipcMain.handle("select-service-account", async () => {
    try {
      const result: any = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'JSON', extensions: ['json'] }]
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, cancelled: true };
      }

      const filePath = result.filePaths[0];

      appState.updateGoogleCredentials(filePath);

      const { CredentialsManager } = require('../services/CredentialsManager');
      CredentialsManager.getInstance().setGoogleServiceAccountPath(filePath);

      return { success: true, path: filePath };
    } catch (error: any) {
      console.error("Error selecting service account:", error);
      return { success: false, error: error.message };
    }
  });

  // ==========================================
  // Customizable Prompts
  // ==========================================

  ipcMain.handle("get-custom-prompts", async () => {
    try {
      const { CredentialsManager } = require('../services/CredentialsManager');
      const cm = CredentialsManager.getInstance();
      return {
        interviewPrompt: cm.getInterviewPrompt() || null,
        meetingPrompt: cm.getMeetingPrompt() || null
      };
    } catch (error: any) {
      console.error("Error getting custom prompts:", error);
      return { interviewPrompt: null, meetingPrompt: null };
    }
  });

  ipcMain.handle("set-custom-prompt", async (_, type: 'interview' | 'meeting', prompt: string) => {
    try {
      const { CredentialsManager } = require('../services/CredentialsManager');
      const cm = CredentialsManager.getInstance();
      if (type === 'interview') {
        cm.setInterviewPrompt(prompt);
      } else {
        cm.setMeetingPrompt(prompt);
      }
      return { success: true };
    } catch (error: any) {
      console.error(`Error setting custom ${type} prompt:`, error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("get-default-prompts", async () => {
    try {
      const {
        UNIVERSAL_WHAT_TO_ANSWER_PROMPT,
        UNIVERSAL_ANSWER_PROMPT
      } = require('../llm/prompts');
      return {
        interviewPrompt: UNIVERSAL_WHAT_TO_ANSWER_PROMPT,
        meetingPrompt: UNIVERSAL_ANSWER_PROMPT
      };
    } catch (error: any) {
      console.error("Error getting default prompts:", error);
      return { interviewPrompt: "", meetingPrompt: "" };
    }
  });

  ipcMain.handle("get-meeting-mode", async () => {
    try {
      const { CredentialsManager } = require('../services/CredentialsManager');
      return CredentialsManager.getInstance().getIsMeetingMode();
    } catch (error: any) {
      console.error("Error getting meeting mode:", error);
      return false;
    }
  });

  ipcMain.handle("set-meeting-mode", async (_, isMeeting: boolean) => {
    try {
      const { CredentialsManager } = require('../services/CredentialsManager');
      CredentialsManager.getInstance().setIsMeetingMode(isMeeting);
      return { success: true };
    } catch (error: any) {
      console.error("Error setting meeting mode:", error);
      return { success: false, error: error.message };
    }
  });

  // ==========================================
  // Security
  // ==========================================

  ipcMain.handle("get-air-gap-mode", async () => {
    try {
      const { CredentialsManager } = require('../services/CredentialsManager');
      return CredentialsManager.getInstance().getAirGapMode();
    } catch (error: any) {
      console.error("Error getting air gap mode:", error);
      return false;
    }
  });

  ipcMain.handle("set-air-gap-mode", async (_, enabled: boolean) => {
    try {
      const { CredentialsManager } = require('../services/CredentialsManager');
      CredentialsManager.getInstance().setAirGapMode(enabled);
      return { success: true };
    } catch (error: any) {
      console.error("Error setting air gap mode:", error);
      return { success: false, error: error.message };
    }
  });
}

