// ipcHandlers.ts — Coordinator
// Delegates to focused sub-handler modules in ./ipc/

import { app, ipcMain, shell, dialog } from "electron"
import { AppState } from "./main"
import { DatabaseManager } from "./db/DatabaseManager"
import { rateLimiter } from "./utils/rateLimiter"

import { ENGLISH_VARIANTS } from "./config/languages"
import { GEMINI_PRO_MODEL, GEMINI_FLASH_MODEL } from "./llm/prompts"

// Sub-handler modules
import { registerCredentialHandlers } from "./ipc/credentialHandlers"
import { registerSTTHandlers } from "./ipc/sttHandlers"
import { registerIntelligenceHandlers } from "./ipc/intelligenceHandlers"
import { registerRAGHandlers } from "./ipc/ragHandlers"
import { registerCalendarEmailHandlers } from "./ipc/calendarEmailHandlers"
import { registerCostHandlers } from "./ipc/costHandlers"
import { registerLicenseHandlers } from "./ipc/licenseHandlers"

let ipcHandlersInitialized = false;

import { setupSystemHandlers } from './ipc/systemHandlers';

export function initializeIpcHandlers(appState: AppState): void {
  setupSystemHandlers();
  if (ipcHandlersInitialized) {
    console.log('[IPC] Handlers already initialized, skipping');
    return;
  }
  ipcHandlersInitialized = true;

  // Safe handler registration
  const safeIpcHandle = (channel: string, handler: (...args: any[]) => any) => {
    try {
      ipcMain.handle(channel, handler);
    } catch (error: any) {
      if (error.message.includes('Attempted to register a second handler')) {
        console.log(`[IPC] Handler for '${channel}' already registered, skipping`);
      } else {
        console.error(`[IPC] Error registering handler for '${channel}':`, error);
      }
    }
  };
  // Register sub-handler modules
  registerCredentialHandlers(appState);
  registerSTTHandlers(appState);
  registerIntelligenceHandlers(appState);
  registerRAGHandlers(appState);
  registerCalendarEmailHandlers(appState);
  registerCostHandlers(appState);
  registerLicenseHandlers();

  // AI Runtime Extract Handlers
  safeIpcHandle("check-ai-runtime", async () => {
    const { AIRuntimeManager } = require('./services/AIRuntimeManager');
    return AIRuntimeManager.getInstance().isRuntimeInstalled();
  });

  safeIpcHandle("install-ai-runtime", async (event) => {
    try {
      const { AIRuntimeManager } = require('./services/AIRuntimeManager');
      const window = require('electron').BrowserWindow.fromWebContents(event.sender);
      if (window) {
        await AIRuntimeManager.getInstance().installRuntime(window);
      }
      return { success: true };
    } catch (error: any) {
      console.error("[IPC] Failed to install AI runtime:", error);
      return { success: false, error: error.message };
    }
  });
  safeIpcHandle("get-recognition-languages", async () => {
    return ENGLISH_VARIANTS;
  });
  safeIpcHandle(
    "update-content-dimensions",
    async (event, { width, height }: { width: number; height: number }) => {
      if (!width || !height) return

      const senderWebContents = event.sender
      const settingsWin = appState.settingsWindowHelper.getSettingsWindow()
      const overlayWin = appState.getWindowHelper().getOverlayWindow()
      const launcherWin = appState.getWindowHelper().getLauncherWindow()

      if (settingsWin && !settingsWin.isDestroyed() && settingsWin.webContents.id === senderWebContents.id) {
        appState.settingsWindowHelper.setWindowDimensions(settingsWin, width, height)
      } else if (
        overlayWin && !overlayWin.isDestroyed() && overlayWin.webContents.id === senderWebContents.id
      ) {
        // GhostWriterInterface logic - Resize ONLY the overlay window using dedicated method
        appState.getWindowHelper().setOverlayDimensions(width, height)
      }
    }
  )

  safeIpcHandle("set-window-mode", async (event, mode: 'launcher' | 'overlay') => {
    appState.getWindowHelper().setWindowMode(mode);
    return { success: true };
  })

  safeIpcHandle("delete-screenshot", async (event, path: string) => {
    return appState.deleteScreenshot(path)
  })

  safeIpcHandle("take-screenshot", async () => {
    try {
      console.log("[IPC] take-screenshot called")
      const screenshotPath = await appState.takeScreenshot()
      const preview = await appState.getImagePreview(screenshotPath)

      // Broadcast screenshot-taken event to ALL windows after a short delay
      // so the overlay is fully restored before it receives the event
      setTimeout(() => {
        const windowHelper = appState.getWindowHelper()
        const windows = [windowHelper.getLauncherWindow(), windowHelper.getOverlayWindow()]
        for (const win of windows) {
          if (win && !win.isDestroyed()) {
            win.webContents.send("screenshot-taken", { path: screenshotPath, preview })
          }
        }
        console.log("[IPC] screenshot-taken event broadcast to all windows")
      }, 150)

      return { path: screenshotPath, preview }
    } catch (error) {
      console.error("[IPC] Error taking screenshot:", error)
      throw error
    }
  })


  safeIpcHandle("get-screenshots", async () => {
    // console.log({ view: appState.getView() })
    try {
      let previews = []
      if (appState.getView() === "queue") {
        previews = await Promise.all(
          appState.getScreenshotQueue().map(async (path) => ({
            path,
            preview: await appState.getImagePreview(path)
          }))
        )
      } else {
        previews = await Promise.all(
          appState.getExtraScreenshotQueue().map(async (path) => ({
            path,
            preview: await appState.getImagePreview(path)
          }))
        )
      }
      // previews.forEach((preview: any) => console.log(preview.path))
      return previews
    } catch (error) {
      // console.error("Error getting screenshots:", error)
      throw error
    }
  })

  safeIpcHandle("get-image-preview", async (event, filepath: string) => {
    try {
      return await appState.getImagePreview(filepath);
    } catch (error) {
      throw error;
    }
  })

  safeIpcHandle("get-active-shortcut", async () => {
    return appState.shortcutsHelper.getActiveScreenshotShortcut();
  })

  safeIpcHandle("toggle-window", async () => {
    appState.toggleMainWindow()
  })

  safeIpcHandle("show-window", async () => {
    // Default show main window (Launcher usually)
    appState.showMainWindow()
  })

  safeIpcHandle("hide-window", async () => {
    appState.hideMainWindow()
  })

  safeIpcHandle("reset-queues", async () => {
    try {
      appState.clearQueues()
      // console.log("Screenshot queues have been cleared.")
      return { success: true }
    } catch (error: any) {
      // console.error("Error resetting queues:", error)
      return { success: false, error: error.message }
    }
  })

  // Context Management Handlers
  safeIpcHandle("save-resume-text", async (event, text: string) => {
    await appState.contextManager.saveResumeText(text);
    return { success: true };
  });

  safeIpcHandle("save-jd-text", async (event, text: string) => {
    await appState.contextManager.saveJDText(text);
    return { success: true };
  });

  safeIpcHandle("save-project-text", async (event, text: string) => {
    await appState.contextManager.saveProjectKnowledgeText(text);
    return { success: true };
  });

  safeIpcHandle("save-agenda-text", async (event, text: string) => {
    await appState.contextManager.saveAgendaText(text);
    return { success: true };
  });

  safeIpcHandle("upload-resume", async (event, filePath: string) => {
    const text = await appState.contextManager.processFile(filePath, 'resume');
    return { success: true, text };
  });

  safeIpcHandle("upload-jd", async (event, filePath: string) => {
    const text = await appState.contextManager.processFile(filePath, 'jd');
    return { success: true, text };
  });

  safeIpcHandle("upload-project", async (event, filePath: string) => {
    const text = await appState.contextManager.processFile(filePath, 'project');
    return { success: true, text };
  });

  safeIpcHandle("upload-agenda", async (event, filePath: string) => {
    const text = await appState.contextManager.processFile(filePath, 'agenda');
    return { success: true, text };
  });

  safeIpcHandle("get-context-documents", async () => {
    const resumeText = appState.contextManager.getResumeText();
    const jdText = appState.contextManager.getJDText();
    const projectText = appState.contextManager.getProjectKnowledgeText();
    const agendaText = appState.contextManager.getAgendaText();
    const isMeetingMode = appState.credentialsManager.getIsMeetingMode();
    return { resumeText, jdText, projectText, agendaText, isMeetingMode };
  });

  safeIpcHandle("set-meeting-mode", async (event, isMeeting: boolean) => {
    appState.credentialsManager.setIsMeetingMode(isMeeting);
    return { success: true };
  });

  safeIpcHandle("get-meeting-mode", async () => {
    return appState.credentialsManager.getIsMeetingMode();
  });

  safeIpcHandle("clear-resume", async () => {
    appState.contextManager.clearResume();
    return { success: true };
  });

  safeIpcHandle("clear-jd", async () => {
    appState.contextManager.clearJD();
    return { success: true };
  });

  safeIpcHandle("clear-project", async () => {
    appState.contextManager.clearProjectKnowledge();
    return { success: true };
  });

  safeIpcHandle("clear-agenda", async () => {
    appState.contextManager.clearAgenda();
    return { success: true };
  });


  // Generate suggestion from transcript - Ghost Writer style text-only reasoning
  safeIpcHandle("generate-suggestion", async (event, context: string, lastQuestion: string) => {
    try {
      const suggestion = await appState.processingHelper.getLLMHelper().generateSuggestion(context, lastQuestion)
      return { suggestion }
    } catch (error: any) {
      // console.error("Error generating suggestion:", error)
      throw error
    }
  })

  // IPC handler for analyzing image from file path
  safeIpcHandle("analyze-image-file", async (event, path: string) => {
    try {
      const result = await appState.processingHelper.getLLMHelper().analyzeImageFile(path)
      return result
    } catch (error: any) {
      // console.error("Error in analyze-image-file handler:", error)
      throw error
    }
  })

  safeIpcHandle("gemini-chat", async (event, message: string, imagePath?: string, context?: string, options?: { skipSystemPrompt?: boolean }) => {
    try {
      const result = await appState.processingHelper.getLLMHelper().chatWithGemini(message, imagePath, context, options?.skipSystemPrompt);

      console.log(`[IPC] gemini - chat response: `, result ? result.substring(0, 50) : "(empty)");

      // Don't process empty responses
      if (!result || result.trim().length === 0) {
        console.warn("[IPC] Empty response from LLM, not updating IntelligenceManager");
        return "I apologize, but I couldn't generate a response. Please try again.";
      }

      // Sync with IntelligenceManager so Follow-Up/Recap work
      const intelligenceManager = appState.getIntelligenceManager();

      // 1. Add user question to context (as 'user')
      // CRITICAL: Skip refinement check to prevent auto-triggering follow-up logic
      // The user's manual question is a NEW input, not a refinement of previous answer.
      intelligenceManager.addTranscript({
        text: message,
        speaker: 'user',
        timestamp: Date.now(),
        final: true
      }, true);

      // 2. Add assistant response and set as last message
      console.log(`[IPC] Updating IntelligenceManager with assistant message...`);
      intelligenceManager.addAssistantMessage(result);
      console.log(`[IPC] Updated IntelligenceManager.Last message: `, intelligenceManager.getLastAssistantMessage()?.substring(0, 50));

      // Log Usage
      intelligenceManager.logUsage('chat', message, result);

      return result;
    } catch (error: any) {
      // console.error("Error in gemini-chat handler:", error);
      throw error;
    }
  });

  // Streaming IPC Handler
  safeIpcHandle("gemini-chat-stream", async (event, message: string, imagePath?: string, context?: string, options?: { skipSystemPrompt?: boolean }) => {
    try {
      console.log("[IPC] gemini-chat-stream started using LLMHelper.streamChat");
      const llmHelper = appState.processingHelper.getLLMHelper();

      // Update IntelligenceManager with USER message immediately
      const intelligenceManager = appState.getIntelligenceManager();
      intelligenceManager.addTranscript({
        text: message,
        speaker: 'user',
        timestamp: Date.now(),
        final: true
      }, true);

      let fullResponse = "";

      // Context Injection for "Answer" button (100s rolling window)
      if (!context) {
        // User requested 100 seconds of context for the answer button
        // Logic: If no explicit context provided (like from manual override), auto-inject from IntelligenceManager
        try {
          const autoContext = intelligenceManager.getFormattedContext(100);
          if (autoContext && autoContext.trim().length > 0) {
            context = autoContext;
            console.log(`[IPC] Auto-injected 100s context for gemini-chat-stream (${context.length} chars)`);
          }
        } catch (ctxErr) {
          console.warn("[IPC] Failed to auto-inject context:", ctxErr);
        }
      }

      try {
        // USE streamChat which handles routing
        const stream = llmHelper.streamChat(message, imagePath, context, options?.skipSystemPrompt ? "" : undefined);

        for await (const token of stream) {
          event.sender.send("gemini-stream-token", token);
          fullResponse += token;
        }

        event.sender.send("gemini-stream-done");

        // Update IntelligenceManager with ASSISTANT message after completion
        if (fullResponse.trim().length > 0) {
          intelligenceManager.addAssistantMessage(fullResponse);
          // Log Usage for streaming chat
          intelligenceManager.logUsage('chat', message, fullResponse);
        }

      } catch (streamError: any) {
        console.error("[IPC] Streaming error:", streamError);
        event.sender.send("gemini-stream-error", streamError.message || "Unknown streaming error");
      }

      return null; // Return null as data is sent via events

    } catch (error: any) {
      console.error("[IPC] Error in gemini-chat-stream setup:", error);
      throw error;
    }
  });

  safeIpcHandle("quit-app", () => {
    app.quit()
  })

  safeIpcHandle("quit-and-install-update", () => {
    console.log('[IPC] quit-and-install-update handler called')
    appState.quitAndInstallUpdate()
  })

  safeIpcHandle("delete-meeting", async (_, id: string) => {
    return DatabaseManager.getInstance().deleteMeeting(id);
  });

  safeIpcHandle("check-for-updates", async () => {
    await appState.checkForUpdates()
  })

  safeIpcHandle("download-update", async () => {
    appState.downloadUpdate()
  })

  // Window movement handlers
  safeIpcHandle("move-window-left", async () => {
    appState.moveWindowLeft()
  })

  safeIpcHandle("move-window-right", async () => {
    appState.moveWindowRight()
  })

  safeIpcHandle("move-window-up", async () => {
    appState.moveWindowUp()
  })

  safeIpcHandle("move-window-down", async () => {
    appState.moveWindowDown()
  })

  safeIpcHandle("center-and-show-window", async () => {
    appState.centerAndShowWindow()
  })

  // Settings Window
  safeIpcHandle("toggle-settings-window", (event, { x, y } = {}) => {
    appState.settingsWindowHelper.toggleWindow(x, y)
  })

  safeIpcHandle("close-settings-window", () => {
    appState.settingsWindowHelper.closeWindow()
  })



  safeIpcHandle("set-undetectable", async (_, state: boolean) => {
    appState.setUndetectable(state)
    return { success: true }
  })

  safeIpcHandle("set-disguise", async (_, mode: 'terminal' | 'settings' | 'activity' | 'none') => {
    appState.setDisguise(mode)
    return { success: true }
  })

  safeIpcHandle("get-undetectable", async () => {
    return appState.getUndetectable()
  })

  safeIpcHandle("set-open-at-login", async (_, openAtLogin: boolean) => {
    app.setLoginItemSettings({
      openAtLogin,
      openAsHidden: false,
      path: app.getPath('exe') // Explicitly point to executable for production reliability
    });
    return { success: true };
  });

  safeIpcHandle("get-open-at-login", async () => {
    const settings = app.getLoginItemSettings();
    return settings.openAtLogin;
  });

  // Native Audio Service Handlers
  // Native Audio handlers removed as part of migration to driverless architecture
  safeIpcHandle("native-audio-status", async () => {
    // Always return true or pseudo-status since it's "driverless"
    return { connected: true };
  });

  // ==========================================
  // Meeting Lifecycle Handlers
  // ==========================================

  // ==========================================
  // Meeting Lifecycle Handlers
  // ==========================================

  // Custom Provider Handlers
  safeIpcHandle("get-custom-providers", async () => {
    try {
      const { CredentialsManager } = require('./services/CredentialsManager');
      return CredentialsManager.getInstance().getCustomProviders();
    } catch (error: any) {
      console.error("Error getting custom providers:", error);
      return [];
    }
  });

  safeIpcHandle("save-custom-provider", async (_, provider: any) => {
    try {
      const { CredentialsManager } = require('./services/CredentialsManager');
      CredentialsManager.getInstance().saveCustomProvider(provider);
      return { success: true };
    } catch (error: any) {
      console.error("Error saving custom provider:", error);
      return { success: false, error: error.message };
    }
  });

  safeIpcHandle("delete-custom-provider", async (_, id: string) => {
    try {
      const { CredentialsManager } = require('./services/CredentialsManager');
      CredentialsManager.getInstance().deleteCustomProvider(id);
      return { success: true };
    } catch (error: any) {
      console.error("Error deleting custom provider:", error);
      return { success: false, error: error.message };
    }
  });

  safeIpcHandle("switch-to-custom-provider", async (_, providerId: string) => {
    try {
      const { CredentialsManager } = require('./services/CredentialsManager');
      const provider = CredentialsManager.getInstance().getCustomProviders().find((p: any) => p.id === providerId);

      if (!provider) {
        throw new Error("Provider not found");
      }

      const llmHelper = appState.processingHelper.getLLMHelper();
      await llmHelper.switchToCustom(provider);

      // Re-init IntelligenceManager (optional, but good for consistency)
      appState.getIntelligenceManager().initializeLLMs();

      return { success: true };
    } catch (error: any) {
      console.error("Error switching to custom provider:", error);
      return { success: false, error: error.message };
    }
  });

  // Get stored API keys (masked for UI display)
  safeIpcHandle("get-stored-credentials", async () => {
    try {
      const { CredentialsManager } = require('./services/CredentialsManager');
      const creds = CredentialsManager.getInstance().getAllCredentials();

      // Return masked versions for security (just indicate if set)
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
        hasProject: !!appState.contextManager.getProjectKnowledgeText(),
        hasAgenda: !!appState.contextManager.getAgendaText(),
      };
    } catch (error: any) {
      return { hasGeminiKey: false, hasGroqKey: false, hasOpenaiKey: false, hasClaudeKey: false, hasNvidiaKey: false, hasDeepseekKey: false, googleServiceAccountPath: null, sttProvider: 'google', groqSttModel: 'whisper-large-v3-turbo', hasSttGroqKey: false, hasSttOpenaiKey: false, hasDeepgramKey: false, hasElevenLabsKey: false, hasAzureKey: false, azureRegion: 'eastus', hasIbmWatsonKey: false, ibmWatsonRegion: 'us-south', hasResume: false, hasJobDescription: false, hasProject: false, hasAgenda: false };
    }
  });

  // ==========================================
  // STT Provider Management Handlers
  // ==========================================

  safeIpcHandle("set-stt-provider", async (_, provider: 'google' | 'groq' | 'openai' | 'deepgram' | 'elevenlabs' | 'azure' | 'ibmwatson') => {
    try {
      const { CredentialsManager } = require('./services/CredentialsManager');
      CredentialsManager.getInstance().setSttProvider(provider);

      // Reconfigure the audio pipeline to use the new STT provider
      await appState.reconfigureSttProvider();

      return { success: true };
    } catch (error: any) {
      console.error("Error setting STT provider:", error);
      return { success: false, error: error.message };
    }
  });

  safeIpcHandle("get-stt-provider", async () => {
    try {
      const { CredentialsManager } = require('./services/CredentialsManager');
      return CredentialsManager.getInstance().getSttProvider();
    } catch (error: any) {
      return 'google';
    }
  });

  // ==========================================
  // Local Whisper Setup Handlers
  // ==========================================

  safeIpcHandle("get-whisper-status", async () => {
    try {
      const { WhisperModelManager } = require('./audio/WhisperModelManager');
      const { CredentialsManager } = require('./services/CredentialsManager');
      const manager = WhisperModelManager.getInstance();
      const status = manager.getStatus();

      // Add custom paths and correct "ready" status based on manager
      // processingHelper might need to be re-checked if paths changed
      const creds = CredentialsManager.getInstance();

      return {
        ...status,
        customBinaryPath: creds.getLocalWhisperBinaryPath(),
        customModelPath: creds.getLocalWhisperModelPath()
      };
    } catch (error: any) {
      return { hasBinary: false, hasModel: false, isDownloading: false, selectedModel: 'small' };
    }
  });

  safeIpcHandle("setup-whisper", async (_, model?: string) => {
    try {
      const { WhisperModelManager } = require('./audio/WhisperModelManager');
      const manager = WhisperModelManager.getInstance();

      if (model) {
        manager.setModel(model);
      }

      const ready = await manager.ensureReady();

      if (ready) {
        // Reconfigure STT to pick up local whisper
        await appState.reconfigureSttProvider();
      }

      return { success: ready, status: manager.getStatus() };
    } catch (error: any) {
      console.error("Error setting up whisper:", error);
      return { success: false, error: error.message };
    }
  });

  safeIpcHandle("set-local-whisper-model", async (_, model: string) => {
    try {
      const { WhisperModelManager } = require('./audio/WhisperModelManager');
      const manager = WhisperModelManager.getInstance();
      manager.setModel(model);
      // If already ready (i.e. model exists), we might want to ensure it? 
      // But usually we just set the preference. The user might need to download it.
      // Let's return the status so UI updates.
      return { success: true, status: manager.getStatus() };
    } catch (error: any) {
      console.error("Error setting local whisper model:", error);
      return { success: false, error: error.message };
    }
  });

  safeIpcHandle("set-local-whisper-paths", async (_, binaryPath: string, modelPath: string) => {
    try {
      const { CredentialsManager } = require('./services/CredentialsManager');
      // Only set if provided (allow partial updates if needed, though usually both or one)
      if (binaryPath !== undefined) CredentialsManager.getInstance().setLocalWhisperBinaryPath(binaryPath);
      if (modelPath !== undefined) CredentialsManager.getInstance().setLocalWhisperModelPath(modelPath);

      // Re-check status and reconfigure if ready
      const { WhisperModelManager } = require('./audio/WhisperModelManager');
      const manager = WhisperModelManager.getInstance();

      // Force check? ensureReady might verify paths
      // If we are ready now, reconfigure
      if (manager.isReady()) {
        await appState.reconfigureSttProvider();
      }

      return { success: true, status: manager.getStatus() };
    } catch (error: any) {
      console.error("Error setting local whisper paths:", error);
      return { success: false, error: error.message };
    }
  });

  safeIpcHandle("select-local-file", async (_, prompt: string, filters: any[]) => {
    const result = await dialog.showOpenDialog({
      title: prompt,
      properties: ['openFile'],
      filters: filters
    }) as any;

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  safeIpcHandle("set-groq-stt-api-key", async (_, apiKey: string) => {
    try {
      const { CredentialsManager } = require('./services/CredentialsManager');
      CredentialsManager.getInstance().setGroqSttApiKey(apiKey);
      return { success: true };
    } catch (error: any) {
      console.error("Error saving Groq STT API key:", error);
      return { success: false, error: error.message };
    }
  });

  safeIpcHandle("set-openai-stt-api-key", async (_, apiKey: string) => {
    try {
      const { CredentialsManager } = require('./services/CredentialsManager');
      CredentialsManager.getInstance().setOpenAiSttApiKey(apiKey);
      return { success: true };
    } catch (error: any) {
      console.error("Error saving OpenAI STT API key:", error);
      return { success: false, error: error.message };
    }
  });

  safeIpcHandle("set-deepgram-api-key", async (_, apiKey: string) => {
    try {
      const { CredentialsManager } = require('./services/CredentialsManager');
      CredentialsManager.getInstance().setDeepgramApiKey(apiKey);
      return { success: true };
    } catch (error: any) {
      console.error("Error saving Deepgram API key:", error);
      return { success: false, error: error.message };
    }
  });

  safeIpcHandle("set-groq-stt-model", async (_, model: string) => {
    try {
      const { CredentialsManager } = require('./services/CredentialsManager');
      CredentialsManager.getInstance().setGroqSttModel(model);

      // Reconfigure the audio pipeline to use the new model
      await appState.reconfigureSttProvider();

      return { success: true };
    } catch (error: any) {
      console.error("Error setting Groq STT model:", error);
      return { success: false, error: error.message };
    }
  });

  safeIpcHandle("set-elevenlabs-api-key", async (_, apiKey: string) => {
    try {
      const { CredentialsManager } = require('./services/CredentialsManager');
      CredentialsManager.getInstance().setElevenLabsApiKey(apiKey);
      return { success: true };
    } catch (error: any) {
      console.error("Error saving ElevenLabs API key:", error);
      return { success: false, error: error.message };
    }
  });

  safeIpcHandle("set-azure-api-key", async (_, apiKey: string) => {
    try {
      const { CredentialsManager } = require('./services/CredentialsManager');
      CredentialsManager.getInstance().setAzureApiKey(apiKey);
      return { success: true };
    } catch (error: any) {
      console.error("Error saving Azure API key:", error);
      return { success: false, error: error.message };
    }
  });

  safeIpcHandle("set-azure-region", async (_, region: string) => {
    try {
      const { CredentialsManager } = require('./services/CredentialsManager');
      CredentialsManager.getInstance().setAzureRegion(region);

      // Reconfigure the pipeline since region changes the endpoint URL
      await appState.reconfigureSttProvider();

      return { success: true };
    } catch (error: any) {
      console.error("Error setting Azure region:", error);
      return { success: false, error: error.message };
    }
  });

  safeIpcHandle("set-ibmwatson-api-key", async (_, apiKey: string) => {
    try {
      const { CredentialsManager } = require('./services/CredentialsManager');
      CredentialsManager.getInstance().setIbmWatsonApiKey(apiKey);
      return { success: true };
    } catch (error: any) {
      console.error("Error saving IBM Watson API key:", error);
      return { success: false, error: error.message };
    }
  });

  safeIpcHandle("test-stt-connection", async (_, provider: 'groq' | 'openai' | 'deepgram' | 'elevenlabs' | 'azure' | 'ibmwatson', apiKey: string, region?: string) => {
    try {
      if (provider === 'deepgram') {
        // Test Deepgram via WebSocket connection
        const WebSocket = require('ws');
        return await new Promise<{ success: boolean; error?: string }>((resolve) => {
          const url = 'wss://api.deepgram.com/v1/listen?model=nova-2&encoding=linear16&sample_rate=16000&channels=1';
          const ws = new WebSocket(url, {
            headers: { Authorization: `Token ${apiKey}` },
          });

          const timeout = setTimeout(() => {
            ws.close();
            resolve({ success: false, error: 'Connection timed out' });
          }, 15000);

          ws.on('open', () => {
            clearTimeout(timeout);
            try { ws.send(JSON.stringify({ type: 'CloseStream' })); } catch { }
            ws.close();
            resolve({ success: true });
          });

          ws.on('error', (err: any) => {
            clearTimeout(timeout);
            resolve({ success: false, error: err.message || 'Connection failed' });
          });
        });
      }

      const axios = require('axios');
      const FormData = require('form-data');

      // Generate a tiny silent WAV (0.5s of silence at 16kHz mono 16-bit)
      const numSamples = 8000;
      const pcmData = Buffer.alloc(numSamples * 2);
      const wavHeader = Buffer.alloc(44);
      wavHeader.write('RIFF', 0);
      wavHeader.writeUInt32LE(36 + pcmData.length, 4);
      wavHeader.write('WAVE', 8);
      wavHeader.write('fmt ', 12);
      wavHeader.writeUInt32LE(16, 16);
      wavHeader.writeUInt16LE(1, 20);
      wavHeader.writeUInt16LE(1, 22);
      wavHeader.writeUInt32LE(16000, 24);
      wavHeader.writeUInt32LE(32000, 28);
      wavHeader.writeUInt16LE(2, 32);
      wavHeader.writeUInt16LE(16, 34);
      wavHeader.write('data', 36);
      wavHeader.writeUInt32LE(pcmData.length, 40);
      const testWav = Buffer.concat([wavHeader, pcmData]);

      if (provider === 'elevenlabs') {
        // ElevenLabs: multipart with xi-api-key header
        const form = new FormData();
        form.append('file', testWav, { filename: 'test.wav', contentType: 'audio/wav' });
        form.append('model_id', 'scribe_v1');
        await axios.post('https://api.elevenlabs.io/v1/speech-to-text', form, {
          headers: { 'xi-api-key': apiKey, ...form.getHeaders() },
          timeout: 15000,
        });
      } else if (provider === 'azure') {
        // Azure: raw binary with subscription key
        const azureRegion = region || 'eastus';
        await axios.post(
          `https://${azureRegion}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US`,
          testWav,
          {
            headers: { 'Ocp-Apim-Subscription-Key': apiKey, 'Content-Type': 'audio/wav' },
            timeout: 15000,
          }
        );
      } else if (provider === 'ibmwatson') {
        // IBM Watson: raw binary with Basic auth
        const ibmRegion = region || 'us-south';
        await axios.post(
          `https://api.${ibmRegion}.speech-to-text.watson.cloud.ibm.com/v1/recognize`,
          testWav,
          {
            headers: {
              Authorization: `Basic ${Buffer.from(`apikey:${apiKey}`).toString('base64')}`,
              'Content-Type': 'audio/wav',
            },
            timeout: 15000,
          }
        );
      } else {
        // Groq / OpenAI: multipart FormData
        const endpoint = provider === 'groq'
          ? 'https://api.groq.com/openai/v1/audio/transcriptions'
          : 'https://api.openai.com/v1/audio/transcriptions';
        const model = provider === 'groq' ? 'whisper-large-v3-turbo' : 'whisper-1';

        const form = new FormData();
        form.append('file', testWav, { filename: 'test.wav', contentType: 'audio/wav' });
        form.append('model', model);

        await axios.post(endpoint, form, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            ...form.getHeaders(),
          },
          timeout: 15000,
        });
      }

      return { success: true };
    } catch (error: any) {
      const msg = error?.response?.data?.error?.message || error?.response?.data?.message || error.message || 'Connection failed';
      console.error("STT connection test failed:", msg);
      return { success: false, error: msg };
    }
  });

  // LLM and STT Handlers are now primarily managed in focused modules:
  // - electron/ipc/credentialHandlers.ts
  // - electron/ipc/sttHandlers.ts
  // - electron/ipc/intelligenceHandlers.ts

  // Native Audio Service Handlers
  // Native Audio handlers removed as part of migration to driverless architecture
  safeIpcHandle("native-audio-status", async () => {
    // Always return true or pseudo-status since it's "driverless"
    return { connected: true };
  });

  // ==========================================
  // Meeting Lifecycle Handlers
  // ==========================================

  safeIpcHandle("start-meeting", async (event, metadata?: any) => {
    try {
      await appState.startMeeting(metadata);
      return { success: true };
    } catch (error: any) {
      console.error("Error starting meeting:", error);
      return { success: false, error: error.message };
    }
  });

  safeIpcHandle("end-meeting", async () => {
    try {
      await appState.endMeeting();
      return { success: true };
    } catch (error: any) {
      console.error("Error ending meeting:", error);
      return { success: false, error: error.message };
    }
  });

  safeIpcHandle("get-recent-meetings", async () => {
    // Fetch from SQLite (limit 50)
    return DatabaseManager.getInstance().getRecentMeetings(50);
  });

  safeIpcHandle("get-meeting-details", async (event, id) => {
    // Helper to fetch full details
    return DatabaseManager.getInstance().getMeetingDetails(id);
  });

  safeIpcHandle("update-meeting-title", async (_, { id, title }: { id: string; title: string }) => {
    return DatabaseManager.getInstance().updateMeetingTitle(id, title);
  });

  safeIpcHandle("update-meeting-summary", async (_, { id, updates }: { id: string; updates: any }) => {
    return DatabaseManager.getInstance().updateMeetingSummary(id, updates);
  });

  safeIpcHandle("seed-demo", async () => {
    DatabaseManager.getInstance().seedDemoMeeting();

    // Trigger RAG processing for the new demo meeting
    const ragManager = appState.getRAGManager();
    if (ragManager && ragManager.isReady()) {
      ragManager.reprocessMeeting('demo-meeting').catch(console.error);
    }

    return { success: true };
  });

  safeIpcHandle("flush-database", async () => {
    const result = DatabaseManager.getInstance().clearAllData();
    return { success: result };
  });

  safeIpcHandle("open-external", async (event, url: string) => {
    try {
      const parsed = new URL(url);
      if (['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
        await shell.openExternal(url);
      } else {
        console.warn(`[IPC] Blocked potentially unsafe open-external: ${url}`);
      }
    } catch {
      console.warn(`[IPC] Invalid URL in open-external: ${url}`);
    }
  });

  // ==========================================
  // Theme System Handlers
  // ==========================================

  safeIpcHandle("theme:get-mode", () => {
    const tm = appState.getThemeManager();
    return {
      mode: tm.getMode(),
      resolved: tm.getResolvedTheme()
    };
  });

  safeIpcHandle("theme:set-mode", (_, mode: 'system' | 'light' | 'dark') => {
    appState.getThemeManager().setMode(mode);
    return { success: true };
  });

}
