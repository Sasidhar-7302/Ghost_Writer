// Credential & Provider IPC Handlers
// Handles API key management, custom providers, and credential storage

import { ipcMain, dialog } from "electron";
import type { AppState } from "../main";
import { getFullPrivacyStatus } from "../utils/fullPrivacyMode";

let credentialHandlersInitialized = false;

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
      console.error(`Error saving API key [\${channel}]:`, error);
      return { success: false, error: error.message };
    }
  });
}

function mapCurrentModelToSelectionId(appState: AppState): string | undefined {
  const { CredentialsManager } = require('../services/CredentialsManager');
  const { GEMINI_PRO_MODEL } = require('../llm/prompts');
  const creds = CredentialsManager.getInstance();
  const storedPreference = creds.getModelPreference();
  if (storedPreference) {
    return storedPreference;
  }

  const llmHelper = appState.processingHelper.getLLMHelper();
  const provider = llmHelper.getCurrentProvider();
  const model = llmHelper.getCurrentModel();

  if (!model) {
    return undefined;
  }

  if (llmHelper.isUsingOllama()) {
    return `ollama-\${model}`;
  }

  if (provider === 'custom') {
    const customProvider = creds.getCustomProviders().find((entry: any) => entry.name === model || entry.id === model);
    return customProvider?.id;
  }

  switch (provider) {
    case 'gemini':
      return model === GEMINI_PRO_MODEL ? 'gemini-pro' : 'gemini';
    case 'openai':
      return 'gpt-4o';
    case 'claude':
      return 'claude';
    case 'groq':
      return 'llama';
    case 'nvidia':
      return 'nvidia';
    case 'deepseek':
      return 'deepseek';
    case 'openrouter':
      return 'openrouter';
    default:
      return undefined;
  }
}

export function registerCredentialHandlers(appState: AppState): void {
  if (credentialHandlersInitialized) return;
  credentialHandlersInitialized = true;

  const broadcastToWindows = (channel: string, payload?: unknown) => {
    const windowHelper = appState.getWindowHelper();
    const windows = [
      windowHelper.getMainWindow(),
      windowHelper.getLauncherWindow(),
      windowHelper.getOverlayWindow()
    ].filter((window, index, allWindows) => {
      return !!window && !window.isDestroyed() && allWindows.indexOf(window) === index;
    });

    for (const window of windows) {
      window.webContents.send(channel, payload);
    }
  };

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
      appState.getIntelligenceManager().initializeLLMs();

      const { CredentialsManager } = require('../services/CredentialsManager');
      const resolvedModel = llmHelper.getCurrentModel();
      if (resolvedModel) {
        CredentialsManager.getInstance().setOllamaModel(resolvedModel);
      }

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
      const { CredentialsManager } = require('../services/CredentialsManager');
      if (CredentialsManager.getInstance().getAirGapMode()) {
        return { success: false, error: "Full Privacy Mode is enabled. Disable it before switching to a cloud model." };
      }

      const llmHelper = appState.processingHelper.getLLMHelper();
      await llmHelper.switchToGemini(apiKey, modelId);
      appState.getIntelligenceManager().initializeLLMs();

      if (apiKey) {
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

  makeApiKeySetter(appState, "set-openrouter-api-key",
    (c, k) => c.setOpenrouterApiKey(k), (l, k) => l.setOpenrouterApiKey(k));

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
      if (CredentialsManager.getInstance().getAirGapMode()) {
        return { success: false, error: "Full Privacy Mode is enabled. Disable it before switching to a custom provider." };
      }

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
        hasOpenrouterKey: !!creds.openrouterApiKey,
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
        airGapMode: !!creds.airGapMode,
        telemetryEnabled: creds.telemetryEnabled ?? false,
      };
    } catch (error: any) {
      return { 
        hasGeminiKey: false, hasGroqKey: false, hasOpenaiKey: false, hasClaudeKey: false, 
        hasNvidiaKey: false, hasDeepseekKey: false, hasOpenrouterKey: false,
        googleServiceAccountPath: null, sttProvider: 'google', groqSttModel: 'whisper-large-v3-turbo', 
        hasSttGroqKey: false, hasSttOpenaiKey: false, hasDeepgramKey: false, hasElevenLabsKey: false, 
        hasAzureKey: false, azureRegion: 'eastus', hasIbmWatsonKey: false, ibmWatsonRegion: 'us-south', 
        hasResume: false, hasJobDescription: false, airGapMode: false, telemetryEnabled: false 
      };
    }
  });

  // ==========================================
  // Model Selection & Testing
  // ==========================================

  ipcMain.handle("set-model-preference", (_, type: "flash" | "pro") => {
    try {
      const { CredentialsManager } = require('../services/CredentialsManager');
      if (CredentialsManager.getInstance().getAirGapMode()) {
        return { success: false, error: "Full Privacy Mode is enabled. Choose a local Ollama model or disable Full Privacy Mode first." };
      }

      const { GEMINI_FLASH_MODEL, GEMINI_PRO_MODEL } = require('../llm/prompts');
      const im = appState.getIntelligenceManager();
      const model = type === 'pro' ? GEMINI_PRO_MODEL : GEMINI_FLASH_MODEL;

      CredentialsManager.getInstance().setModelPreference(model);

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
      const creds = CredentialsManager.getInstance();
      const isLocalOllama = modelId.startsWith('ollama-');

      if (creds.getAirGapMode() && !isLocalOllama) {
        return { success: false, error: "Full Privacy Mode is enabled. Choose a local Ollama model or disable Full Privacy Mode first." };
      }

      // Persist model selection to disk
      creds.setModelPreference(modelId);
      if (isLocalOllama) {
        creds.setOllamaModel(modelId.replace('ollama-', ''));
      }

      const customProviders = creds.getCustomProviders();
      llmHelper.setModel(modelId, customProviders);
      appState.getIntelligenceManager().initializeLLMs();
      broadcastToWindows('model-selected', { modelId });
      console.log(`[CredentialHandlers] Active model updated to: \${modelId}`);
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
      const msg = error?.response?.data?.error?.message || error?.response?.data?.message || error.message || 'Connection failed';
      console.error("LLM connection test failed:", msg);
      return { success: false, error: msg };
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

  ipcMain.handle("get-prompt-settings", async () => {
    try {
      const { CredentialsManager } = require('../services/CredentialsManager');
      return CredentialsManager.getInstance().getPromptSettings();
    } catch (error: any) {
      console.error("Error getting prompt settings:", error);
      return {};
    }
  });

  ipcMain.handle("update-prompt-settings", async (_, mode: string, patch: any) => {
    try {
      const { CredentialsManager } = require('../services/CredentialsManager');
      CredentialsManager.getInstance().updatePromptSetting(mode, patch);
      return { success: true };
    } catch (error: any) {
      console.error(`Error updating prompt settings for \${mode}:`, error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("get-default-prompt-templates", async () => {
    try {
      const { getDefaultPromptTemplates } = require('../llm/promptRegistry');
      return getDefaultPromptTemplates();
    } catch (error: any) {
      console.error("Error getting default prompt templates:", error);
      return {};
    }
  });

  ipcMain.handle("get-custom-prompts", async () => {
    try {
      const { CredentialsManager } = require('../services/CredentialsManager');
      const cm = CredentialsManager.getInstance();
      return {
        interviewPrompt: cm.getPromptSettings().whatToAnswer.fullOverride || null,
        meetingPrompt: cm.getPromptSettings().answer.fullOverride || null
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
        cm.updatePromptSetting('whatToAnswer', { fullOverride: prompt });
      } else {
        cm.updatePromptSetting('answer', { fullOverride: prompt });
      }
      return { success: true };
    } catch (error: any) {
      console.error(`Error setting custom \${type} prompt:`, error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("get-default-prompts", async () => {
    try {
      const { getDefaultPromptTemplates } = require('../llm/promptRegistry');
      const templates = getDefaultPromptTemplates();
      return {
        interviewPrompt: templates.whatToAnswer.prompt,
        meetingPrompt: templates.answer.prompt
      };
    } catch (error: any) {
      console.error("Error getting default prompts:", error);
      return { interviewPrompt: "", meetingPrompt: "" };
    }
  });

  // ==========================================
  // Telemetry
  // ==========================================

  ipcMain.handle("get-telemetry-settings", async () => {
    try {
      const { CredentialsManager } = require('../services/CredentialsManager');
      const enabled = CredentialsManager.getInstance().getTelemetryEnabled();
      return { enabled };
    } catch (error: any) {
      console.error("Error getting telemetry settings:", error);
      return { enabled: false };
    }
  });

  ipcMain.handle("set-telemetry-enabled", async (_, enabled: boolean) => {
    try {
      const { CredentialsManager } = require('../services/CredentialsManager');
      const { AnalyticsManager } = require('../services/AnalyticsManager');

      CredentialsManager.getInstance().setTelemetryEnabled(enabled);
      const analyticsManager = AnalyticsManager.getInstance();
      if (enabled) {
        analyticsManager.startTracking();
      } else {
        analyticsManager.stopTracking();
      }

      broadcastToWindows('telemetry-settings-changed', { enabled });
      return { success: true };
    } catch (error: any) {
      console.error("Error setting telemetry:", error);
      return { success: false, error: error.message };
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
  // Security & Stealth
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

  ipcMain.handle("get-full-privacy-status", async () => {
    try {
      return await getFullPrivacyStatus();
    } catch (error: any) {
      console.error("Error getting full privacy status:", error);
      return {
        enabled: false,
        localWhisperReady: false,
        localWhisperModelReady: false,
        ollamaReachable: false,
        localTextModelReady: false,
        localVisionModelReady: false,
        activeOllamaModel: "",
        errors: ["missing_whisper_runtime", "missing_whisper_model", "ollama_unreachable"]
      };
    }
  });

  ipcMain.handle("set-air-gap-mode", async (_, enabled: boolean) => {
    try {
      const { CredentialsManager } = require('../services/CredentialsManager');
      const creds = CredentialsManager.getInstance();
      const llmHelper = appState.processingHelper.getLLMHelper();
      const alreadyEnabled = creds.getAirGapMode();

      if (alreadyEnabled === enabled) {
        return { success: true, status: await getFullPrivacyStatus() };
      }

      if (enabled) {
        const previousSttProvider = creds.getSttProvider();
        if (previousSttProvider !== 'local-whisper') {
          creds.setFullPrivacyPreviousSttProvider(previousSttProvider);
        }

        const previousModelId = mapCurrentModelToSelectionId(appState);
        if (previousModelId && !previousModelId.startsWith('ollama-')) {
          creds.setFullPrivacyPreviousModel(previousModelId);
        }

        creds.setAirGapMode(true);
        creds.setSttProvider('local-whisper');
        llmHelper.setAirGapMode(true);

        const privacyStatus = await getFullPrivacyStatus();
        await llmHelper.switchToOllama(privacyStatus.activeOllamaModel || creds.getOllamaModel());

        const currentOllamaModel = llmHelper.getCurrentModel();
        if (currentOllamaModel) {
          creds.setOllamaModel(currentOllamaModel);
          const modelId = `ollama-\${currentOllamaModel}`;
          creds.setModelPreference(modelId);
          broadcastToWindows('model-selected', { modelId });
        }
      } else {
        const previousSttProvider = creds.getFullPrivacyPreviousSttProvider();
        const previousModelId = creds.getFullPrivacyPreviousModel();

        creds.setAirGapMode(false);
        llmHelper.setAirGapMode(false);

        if (previousSttProvider) {
          creds.setSttProvider(previousSttProvider);
        }

        if (previousModelId) {
          creds.setModelPreference(previousModelId);
          llmHelper.setModel(previousModelId, creds.getCustomProviders());
          broadcastToWindows('model-selected', { modelId: previousModelId });
        }

        creds.clearFullPrivacyBackups();
      }

      appState.getIntelligenceManager().initializeLLMs();
      await appState.reconfigureSttProvider();

      return { success: true, status: await getFullPrivacyStatus() };
    } catch (error: any) {
      console.error("Error setting air gap mode:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("get-remote-display-pin", async () => {
    try {
      const { CredentialsManager } = require("../services/CredentialsManager");
      return CredentialsManager.getInstance().getRemoteDisplayPin();
    } catch (error: any) {
      console.error("Error getting remote display pin:", error);
      return "0000";
    }
  });

  ipcMain.handle("set-remote-display-pin", async (_, pin: string) => {
    try {
      const { CredentialsManager } = require("../services/CredentialsManager");
      CredentialsManager.getInstance().setRemoteDisplayPin(pin);
      return { success: true };
    } catch (error: any) {
      console.error("Error setting remote display pin:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("get-remote-display-port", async () => {
    try {
      const { CredentialsManager } = require("../services/CredentialsManager");
      return CredentialsManager.getInstance().getRemoteDisplayPort();
    } catch (error: any) {
      console.error("Error getting remote display port:", error);
      return 4004;
    }
  });

  ipcMain.handle("set-remote-display-port", async (_, port: number) => {
    try {
      const { CredentialsManager } = require("../services/CredentialsManager");
      CredentialsManager.getInstance().setRemoteDisplayPort(port);
      return { success: true };
    } catch (error: any) {
      console.error("Error setting remote display port:", error);
      return { success: false, error: error.message };
    }
  });
}
