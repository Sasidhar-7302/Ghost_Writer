import { contextBridge, ipcRenderer } from "electron"

// Types for the exposed Electron API
interface ElectronAPI {
  updateContentDimensions: (dimensions: {
    width: number
    height: number
  }) => Promise<void>
  getRecognitionLanguages: () => Promise<Record<string, any>>
  getScreenshots: () => Promise<Array<{ path: string; preview: string }>>
  getImagePreview: (path: string) => Promise<string>
  deleteScreenshot: (
    path: string
  ) => Promise<{ success: boolean; error?: string }>
  getActiveShortcut: () => Promise<string>
  onScreenshotTaken: (
    callback: (data: { path: string; preview: string }) => void
  ) => () => void
  onScreenshotAttached: (
    callback: (data: { path: string; preview: string }) => void
  ) => () => void
  onSolutionsReady: (callback: (solutions: string) => void) => () => void
  onResetView: (callback: () => void) => () => void
  onSolutionStart: (callback: () => void) => () => void
  onDebugStart: (callback: () => void) => () => void
  onDebugSuccess: (callback: (data: any) => void) => () => void
  onDebugError: (callback: (error: string) => void) => () => void
  onSolutionError: (callback: (error: string) => void) => () => void
  onProcessingNoScreenshots: (callback: () => void) => () => void
  onProblemExtracted: (callback: (data: any) => void) => () => void
  onSolutionSuccess: (callback: (data: any) => void) => () => void

  onUnauthorized: (callback: () => void) => () => void
  takeScreenshot: () => Promise<void>
  moveWindowLeft: () => Promise<void>
  moveWindowRight: () => Promise<void>
  moveWindowUp: () => Promise<void>
  moveWindowDown: () => Promise<void>

  analyzeImageFile: (path: string) => Promise<void>
  quitApp: () => Promise<void>
  toggleWindow: () => Promise<void>
  showWindow: () => Promise<void>
  hideWindow: () => Promise<void>
  minimizeCurrentWindow: () => Promise<void>
  toggleAdvancedSettings: () => Promise<void>
  openExternal: (url: string) => Promise<void>
  setUndetectable: (state: boolean) => Promise<void>
  getUndetectable: () => Promise<boolean>
  onUndetectableChanged: (callback: (state: boolean) => void) => () => void
  setOpenAtLogin: (open: boolean) => Promise<void>
  getOpenAtLogin: () => Promise<boolean>
  setDisguise: (mode: 'terminal' | 'settings' | 'activity' | 'none') => Promise<void>
  onDisguiseChanged: (callback: (mode: 'terminal' | 'settings' | 'activity' | 'none') => void) => () => void
  onSettingsVisibilityChange: (callback: (isVisible: boolean) => void) => () => void
  onToggleExpand: (callback: () => void) => () => void
  onQuickAnswer: (callback: () => void) => () => void

  // LLM Model Management
  getCurrentLlmConfig: () => Promise<{ provider: "ollama" | "gemini"; model: string; isOllama: boolean }>
  getAvailableOllamaModels: () => Promise<string[]>
  switchToOllama: (model?: string, url?: string) => Promise<{ success: boolean; error?: string }>
  switchToGemini: (apiKey?: string, modelId?: string) => Promise<{ success: boolean; error?: string }>
  testLlmConnection: (provider?: string, apiKey?: string) => Promise<{ success: boolean; error?: string }>
  selectServiceAccount: () => Promise<{ success: boolean; path?: string; cancelled?: boolean; error?: string }>
  getGpuInfo: () => Promise<{ success: boolean; info?: any; error?: string }>
  checkOllamaStatus: () => Promise<{ success: boolean; running: boolean; models?: any[]; error?: string }>

  // API Key Management
  setGeminiApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>
  setGroqApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>
  setOpenaiApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>
  setClaudeApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>
  setNvidiaApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>
  setDeepseekApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>
  getStoredCredentials: () => Promise<any>

  // Context Management
  saveResumeText: (text: string) => Promise<{ success: boolean; error?: string }>
  saveJDText: (text: string) => Promise<{ success: boolean; error?: string }>
  uploadResume: (filePath: string) => Promise<{ success: boolean; error?: string }>
  uploadJD: (filePath: string) => Promise<{ success: boolean; error?: string }>
  getContextDocuments: () => Promise<any>
  clearResume: () => Promise<{ success: boolean; error?: string }>
  clearJD: () => Promise<{ success: boolean; error?: string }>
  saveProjectText: (text: string) => Promise<{ success: boolean; error?: string }>
  saveAgendaText: (text: string) => Promise<{ success: boolean; error?: string }>
  uploadProject: (filePath: string) => Promise<{ success: boolean; error?: string }>
  uploadAgenda: (filePath: string) => Promise<{ success: boolean; error?: string }>
  clearProject: () => Promise<{ success: boolean; error?: string }>
  clearAgenda: () => Promise<{ success: boolean; error?: string }>

  // STT Provider Management
  setSttProvider: (provider: string) => Promise<{ success: boolean; error?: string }>
  getSttProvider: () => Promise<string>
  getWhisperStatus: () => Promise<any>
  setupWhisper: (model?: string) => Promise<boolean>
  setLocalWhisperModel: (model: string) => Promise<{ success: boolean; status: any }>
  downloadWhisperModel: (model: string) => Promise<{ success: boolean; status: any }>
  onWhisperDownloadProgress: (callback: (data: any) => void) => () => void
  setLocalWhisperPaths: (binaryPath?: string, modelPath?: string) => Promise<{ success: boolean; status: any }>
  selectLocalFile: (prompt: string, filters: any[]) => Promise<string | null>
  setGroqSttApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>
  setOpenAiSttApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>
  setDeepgramApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>
  setElevenLabsApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>
  setAzureApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>
  setAzureRegion: (region: string) => Promise<{ success: boolean; error?: string }>
  setIbmWatsonApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>
  setGroqSttModel: (model: string) => Promise<{ success: boolean; error?: string }>
  testSttConnection: (provider: string, apiKey: string, region?: string) => Promise<{ success: boolean; error?: string }>

  // Native Audio Service Events
  onNativeAudioTranscript: (callback: (transcript: { speaker: string; text: string; final: boolean }) => void) => () => void
  onNativeAudioSuggestion: (callback: (suggestion: { context: string; lastQuestion: string; confidence: number }) => void) => () => void
  onNativeAudioConnected: (callback: () => void) => () => void
  onNativeAudioDisconnected: (callback: () => void) => () => void
  onSuggestionGenerated: (callback: (data: { question: string; suggestion: string; confidence: number }) => void) => () => void
  onSuggestionProcessingStart: (callback: () => void) => () => void
  onSuggestionError: (callback: (error: { error: string }) => void) => () => void
  generateSuggestion: (context: string, lastQuestion: string) => Promise<{ suggestion: string }>
  getNativeAudioStatus: () => Promise<any>
  getInputDevices: () => Promise<Array<{ id: string; name: string }>>
  getOutputDevices: () => Promise<Array<{ id: string; name: string }>>
  startAudioTest: (deviceId?: string) => Promise<{ success: boolean }>
  stopAudioTest: () => Promise<{ success: boolean }>
  onAudioLevel: (callback: (level: number) => void) => () => void
  setRecognitionLanguage: (key: string) => Promise<{ success: boolean; error?: string }>
  onSessionReset: (callback: () => void) => () => void
  onAudioCaptureFallback: (callback: (data: { reason: string }) => void) => () => void
  sendRawAudio: (data: Buffer) => void

  // Intelligence Mode IPC
  generateAssist: () => Promise<{ insight: string | null }>
  generateWhatToSay: (question?: string, imagePath?: string) => Promise<{ answer: string | null; question?: string; error?: string }>
  generateFollowUp: (intent: string, userRequest?: string, imagePath?: string) => Promise<{ refined: string | null; intent: string }>
  generateFollowUpQuestions: (imagePath?: string) => Promise<{ questions: string | null }>
  generateRecap: () => Promise<{ summary: string | null }>
  submitManualQuestion: (question: string) => Promise<{ answer: string | null; question: string }>
  getIntelligenceContext: () => Promise<{ context: string; lastAssistantMessage: string | null; activeMode: string }>
  resetIntelligence: () => Promise<{ success: boolean; error?: string }>

  // Meeting Lifecycle
  startMeeting: (metadata?: any) => Promise<{ success: boolean; error?: string }>
  endMeeting: () => Promise<{ success: boolean; error?: string }>
  getRecentMeetings: () => Promise<Array<{ id: string; title: string; date: string; duration: string; summary: string }>>
  getMeetingDetails: (id: string) => Promise<any>
  regenerateMeetingSummary: (id: string) => Promise<any>
  updateMeetingTitle: (id: string, title: string) => Promise<boolean>
  updateMeetingSummary: (id: string, updates: any) => Promise<boolean>
  deleteMeeting: (id: string) => Promise<boolean>
  getGlobalStats: () => Promise<{ totalMeetings: number; totalTokens: number }>
  onMeetingsUpdated: (callback: () => void) => () => void

  // Intelligence Mode Events
  onIntelligenceAssistUpdate: (callback: (data: { insight: string }) => void) => () => void
  onIntelligenceSuggestedAnswerToken: (callback: (data: any) => void) => () => void
  onIntelligenceSuggestedAnswer: (callback: (data: any) => void) => () => void
  onIntelligenceRefinedAnswerToken: (callback: (data: any) => void) => () => void
  onIntelligenceRefinedAnswer: (callback: (data: any) => void) => () => void
  onIntelligenceRecapToken: (callback: (data: any) => void) => () => void
  onIntelligenceRecap: (callback: (data: any) => void) => () => void
  onIntelligenceFollowUpQuestionsToken: (callback: (data: any) => void) => () => void
  onIntelligenceFollowUpQuestionsUpdate: (callback: (data: any) => void) => () => void
  onIntelligenceManualStarted: (callback: () => void) => () => void
  onIntelligenceManualResult: (callback: (data: any) => void) => () => void
  onIntelligenceModeChanged: (callback: (data: any) => void) => () => void
  onIntelligenceError: (callback: (data: any) => void) => () => void
  onLicenseStatusUpdated: (callback: (state: any) => void) => () => void

  // Security
  getAirGapMode: () => Promise<boolean>
  setAirGapMode: (enabled: boolean) => Promise<{ success: boolean; error?: string }>
  onAirGapChanged: (callback: (enabled: boolean) => void) => () => void
  getFullPrivacyStatus: () => Promise<any>

  // Theme API
  getThemeMode: () => Promise<any>
  setThemeMode: (mode: 'system' | 'light' | 'dark') => Promise<void>
  onThemeChanged: (callback: (data: any) => void) => () => void

  // Calendar
  calendarConnect: () => Promise<{ success: boolean; error?: string }>
  calendarDisconnect: () => Promise<{ success: boolean; error?: string }>
  getCalendarStatus: () => Promise<any>
  getUpcomingEvents: () => Promise<any[]>
  calendarRefresh: () => Promise<{ success: boolean; error?: string }>

  // Auto-Update
  onUpdateAvailable: (callback: (info: any) => void) => () => void
  onUpdateDownloaded: (callback: (info: any) => void) => () => void
  onUpdateChecking: (callback: () => void) => () => void
  onUpdateNotAvailable: (callback: (info: any) => void) => () => void
  onUpdateError: (callback: (err: string) => void) => () => void
  onDownloadProgress: (callback: (progressObj: any) => void) => () => void
  restartAndInstall: () => Promise<void>
  checkForUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>

  // RAG API
  ragQueryMeeting: (meetingId: string, query: string) => Promise<any>
  ragQueryGlobal: (query: string) => Promise<any>
  ragCancelQuery: (options: any) => Promise<any>
  ragIsMeetingProcessed: (meetingId: string) => Promise<boolean>
  ragGetQueueStatus: () => Promise<any>
  ragRetryEmbeddings: () => Promise<any>
  onRAGStreamChunk: (callback: (data: any) => void) => () => void
  onRAGStreamComplete: (callback: (data: any) => void) => () => void
  onRAGStreamError: (callback: (data: any) => void) => () => void

  // Remote Display
  getRemoteDisplayUrl: () => Promise<{ url: string; port: number; isActive: boolean }>
  restartRemoteServer: () => Promise<{ success: boolean; url: string }>
  getRemoteDisplayPin: () => Promise<string>
  setRemoteDisplayPin: (pin: string) => Promise<{ success: boolean; error?: string }>

  // Custom Prompts (Legacy)
  getCustomPrompts: () => Promise<{ interviewPrompt: string | null; meetingPrompt: string | null }>
  setCustomPrompt: (type: 'interview' | 'meeting', prompt: string) => Promise<{ success: boolean; error?: string }>
  getDefaultPrompts: () => Promise<{ interviewPrompt: string; meetingPrompt: string }>
  getMeetingMode: () => Promise<boolean>
  setMeetingMode: (isMeeting: boolean) => Promise<{ success: boolean; error?: string }>

  invoke: (channel: string, ...args: any[]) => Promise<any>
  on: (channel: string, callback: (...args: any[]) => void) => () => void
}

export const PROCESSING_EVENTS = {
  UNAUTHORIZED: "procesing-unauthorized",
  NO_SCREENSHOTS: "processing-no-screenshots",
  INITIAL_START: "initial-start",
  PROBLEM_EXTRACTED: "problem-extracted",
  SOLUTION_SUCCESS: "solution-success",
  INITIAL_SOLUTION_ERROR: "solution-error",
  DEBUG_START: "debug-start",
  DEBUG_SUCCESS: "debug-success",
  DEBUG_ERROR: "debug-error"
} as const

// Expose the Electron API to the renderer process
contextBridge.exposeInMainWorld("electronAPI", {
  updateContentDimensions: (dimensions: { width: number; height: number }) =>
    ipcRenderer.invoke("update-content-dimensions", dimensions),
  getRecognitionLanguages: () => ipcRenderer.invoke("get-recognition-languages"),
  takeScreenshot: () => ipcRenderer.invoke("take-screenshot"),
  getScreenshots: () => ipcRenderer.invoke("get-screenshots"),
  getImagePreview: (path: string) => ipcRenderer.invoke("get-image-preview", path),
  getActiveShortcut: () => ipcRenderer.invoke("get-active-shortcut"),
  deleteScreenshot: (path: string) => ipcRenderer.invoke("delete-screenshot", path),

  onScreenshotTaken: (callback: any) => {
    const sub = (_: any, data: any) => callback(data)
    ipcRenderer.on("screenshot-taken", sub)
    return () => ipcRenderer.removeListener("screenshot-taken", sub)
  },
  onScreenshotAttached: (callback: any) => {
    const sub = (_: any, data: any) => callback(data)
    ipcRenderer.on("screenshot-attached", sub)
    return () => ipcRenderer.removeListener("screenshot-attached", sub)
  },
  onSolutionsReady: (callback: any) => {
    const sub = (_: any, data: any) => callback(data)
    ipcRenderer.on("solutions-ready", sub)
    return () => ipcRenderer.removeListener("solutions-ready", sub)
  },
  onResetView: (callback: any) => {
    const sub = () => callback()
    ipcRenderer.on("reset-view", sub)
    return () => ipcRenderer.removeListener("reset-view", sub)
  },
  onSolutionStart: (callback: any) => {
    const sub = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.INITIAL_START, sub)
    return () => ipcRenderer.removeListener(PROCESSING_EVENTS.INITIAL_START, sub)
  },
  onDebugStart: (callback: any) => {
    const sub = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.DEBUG_START, sub)
    return () => ipcRenderer.removeListener(PROCESSING_EVENTS.DEBUG_START, sub)
  },
  onDebugSuccess: (callback: any) => {
    const sub = (_: any, data: any) => callback(data)
    ipcRenderer.on("debug-success", sub)
    return () => ipcRenderer.removeListener("debug-success", sub)
  },
  onDebugError: (callback: any) => {
    const sub = (_: any, data: any) => callback(data)
    ipcRenderer.on(PROCESSING_EVENTS.DEBUG_ERROR, sub)
    return () => ipcRenderer.removeListener(PROCESSING_EVENTS.DEBUG_ERROR, sub)
  },
  onSolutionError: (callback: any) => {
    const sub = (_: any, data: any) => callback(data)
    ipcRenderer.on(PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR, sub)
    return () => ipcRenderer.removeListener(PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR, sub)
  },
  onProcessingNoScreenshots: (callback: any) => {
    const sub = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.NO_SCREENSHOTS, sub)
    return () => ipcRenderer.removeListener(PROCESSING_EVENTS.NO_SCREENSHOTS, sub)
  },
  onProblemExtracted: (callback: any) => {
    const sub = (_: any, data: any) => callback(data)
    ipcRenderer.on(PROCESSING_EVENTS.PROBLEM_EXTRACTED, sub)
    return () => ipcRenderer.removeListener(PROCESSING_EVENTS.PROBLEM_EXTRACTED, sub)
  },
  onSolutionSuccess: (callback: any) => {
    const sub = (_: any, data: any) => callback(data)
    ipcRenderer.on(PROCESSING_EVENTS.SOLUTION_SUCCESS, sub)
    return () => ipcRenderer.removeListener(PROCESSING_EVENTS.SOLUTION_SUCCESS, sub)
  },
  onUnauthorized: (callback: any) => {
    const sub = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.UNAUTHORIZED, sub)
    return () => ipcRenderer.removeListener(PROCESSING_EVENTS.UNAUTHORIZED, sub)
  },

  moveWindowLeft: () => ipcRenderer.invoke("move-window-left"),
  moveWindowRight: () => ipcRenderer.invoke("move-window-right"),
  moveWindowUp: () => ipcRenderer.invoke("move-window-up"),
  moveWindowDown: () => ipcRenderer.invoke("move-window-down"),
  analyzeImageFile: (path: string) => ipcRenderer.invoke("analyze-image-file", path),
  quitApp: () => ipcRenderer.invoke("quit-app"),
  toggleWindow: () => ipcRenderer.invoke("toggle-window"),
  showWindow: () => ipcRenderer.invoke("show-window"),
  hideWindow: () => ipcRenderer.invoke("hide-window"),
  minimizeCurrentWindow: () => ipcRenderer.invoke("minimize-current-window"),
  toggleAdvancedSettings: () => ipcRenderer.invoke("toggle-advanced-settings"),
  openExternal: (url: string) => ipcRenderer.invoke("open-external", url),
  setUndetectable: (state: boolean) => ipcRenderer.invoke("set-undetectable", state),
  getUndetectable: () => ipcRenderer.invoke("get-undetectable"),
  onUndetectableChanged: (callback: any) => {
    const sub = (_: any, state: any) => callback(state)
    ipcRenderer.on('undetectable-changed', sub)
    return () => ipcRenderer.removeListener('undetectable-changed', sub)
  },
  setOpenAtLogin: (open: boolean) => ipcRenderer.invoke("set-open-at-login", open),
  getOpenAtLogin: () => ipcRenderer.invoke("get-open-at-login"),
  setDisguise: (mode: any) => ipcRenderer.invoke("set-disguise", mode),
  onDisguiseChanged: (callback: any) => {
    const sub = (_: any, mode: any) => callback(mode)
    ipcRenderer.on('disguise-changed', sub)
    return () => ipcRenderer.removeListener('disguise-changed', sub)
  },
  onSettingsVisibilityChange: (callback: any) => {
    const sub = (_: any, vis: any) => callback(vis)
    ipcRenderer.on("settings-visibility-changed", sub)
    return () => ipcRenderer.removeListener("settings-visibility-changed", sub)
  },
  onToggleExpand: (callback: any) => {
    const sub = () => callback()
    ipcRenderer.on("toggle-expand", sub)
    return () => ipcRenderer.removeListener("toggle-expand", sub)
  },
  onQuickAnswer: (callback: any) => {
    const sub = () => callback()
    ipcRenderer.on("quick-answer", sub)
    return () => ipcRenderer.removeListener("quick-answer", sub)
  },

  // LLM Model Management
  getCurrentLlmConfig: () => ipcRenderer.invoke("get-current-llm-config"),
  getAvailableOllamaModels: () => ipcRenderer.invoke("get-available-ollama-models"),
  switchToOllama: (model?: string, url?: string) => ipcRenderer.invoke("switch-to-ollama", model, url),
  switchToGemini: (apiKey?: string, modelId?: string) => ipcRenderer.invoke("switch-to-gemini", apiKey, modelId),
  testLlmConnection: (provider?: string, apiKey?: string) => ipcRenderer.invoke("test-llm-connection", provider, apiKey),
  selectServiceAccount: () => ipcRenderer.invoke("select-service-account"),
  getGpuInfo: () => ipcRenderer.invoke("get-gpu-info"),
  checkOllamaStatus: () => ipcRenderer.invoke("check-ollama-status"),

  // API Key Management
  setGeminiApiKey: (apiKey: string) => ipcRenderer.invoke("set-gemini-api-key", apiKey),
  setGroqApiKey: (apiKey: string) => ipcRenderer.invoke("set-groq-api-key", apiKey),
  setOpenaiApiKey: (apiKey: string) => ipcRenderer.invoke("set-openai-api-key", apiKey),
  setClaudeApiKey: (apiKey: string) => ipcRenderer.invoke("set-claude-api-key", apiKey),
  setNvidiaApiKey: (apiKey: string) => ipcRenderer.invoke("set-nvidia-api-key", apiKey),
  setDeepseekApiKey: (apiKey: string) => ipcRenderer.invoke("set-deepseek-api-key", apiKey),
  getStoredCredentials: () => ipcRenderer.invoke("get-stored-credentials"),

  // Context Management
  saveResumeText: (text: string) => ipcRenderer.invoke('save-resume-text', text),
  saveJDText: (text: string) => ipcRenderer.invoke('save-jd-text', text),
  uploadResume: (filePath: string) => ipcRenderer.invoke('upload-resume', filePath),
  uploadJD: (filePath: string) => ipcRenderer.invoke('upload-jd', filePath),
  getContextDocuments: () => ipcRenderer.invoke('get-context-documents'),
  clearResume: () => ipcRenderer.invoke('clear-resume'),
  clearJD: () => ipcRenderer.invoke('clear-jd'),
  saveProjectText: (text: string) => ipcRenderer.invoke('save-project-text', text),
  saveAgendaText: (text: string) => ipcRenderer.invoke('save-agenda-text', text),
  uploadProject: (filePath: string) => ipcRenderer.invoke('upload-project', filePath),
  uploadAgenda: (filePath: string) => ipcRenderer.invoke('upload-agenda', filePath),
  clearProject: () => ipcRenderer.invoke('clear-project'),
  clearAgenda: () => ipcRenderer.invoke('clear-agenda'),

  // STT Provider Management
  setSttProvider: (provider: string) => ipcRenderer.invoke("set-stt-provider", provider),
  getSttProvider: () => ipcRenderer.invoke("get-stt-provider"),
  getWhisperStatus: () => ipcRenderer.invoke("get-whisper-status"),
  setupWhisper: (model?: string) => ipcRenderer.invoke("setup-whisper", model),
  setLocalWhisperModel: (model: string) => ipcRenderer.invoke("set-local-whisper-model", model),
  downloadWhisperModel: (model: string) => ipcRenderer.invoke("download-whisper-model", model),
  onWhisperDownloadProgress: (callback: any) => {
    const handler = (_: any, data: any) => callback(data)
    ipcRenderer.on('whisper-download-progress', handler)
    return () => ipcRenderer.removeListener('whisper-download-progress', handler)
  },
  setLocalWhisperPaths: (bin?: string, mod?: string) => ipcRenderer.invoke("set-local-whisper-paths", bin, mod),
  selectLocalFile: (prompt: string, filters: any[]) => ipcRenderer.invoke("select-local-file", prompt, filters),
  setGroqSttApiKey: (key: string) => ipcRenderer.invoke("set-groq-stt-api-key", key),
  setOpenAiSttApiKey: (key: string) => ipcRenderer.invoke("set-openai-stt-api-key", key),
  setDeepgramApiKey: (key: string) => ipcRenderer.invoke("set-deepgram-api-key", key),
  setElevenLabsApiKey: (key: string) => ipcRenderer.invoke("set-elevenlabs-api-key", key),
  setAzureApiKey: (key: string) => ipcRenderer.invoke("set-azure-api-key", key),
  setAzureRegion: (reg: string) => ipcRenderer.invoke("set-azure-region", reg),
  setIbmWatsonApiKey: (key: string) => ipcRenderer.invoke("set-ibmwatson-api-key", key),
  setGroqSttModel: (mod: string) => ipcRenderer.invoke("set-groq-stt-model", mod),
  testSttConnection: (prov: string, key: string, reg?: string) => ipcRenderer.invoke("test-stt-connection", prov, key, reg),

  // Native Audio Service Events
  onNativeAudioTranscript: (callback: any) => {
    const sub = (_: any, data: any) => callback(data)
    ipcRenderer.on("native-audio-transcript", sub)
    return () => ipcRenderer.removeListener("native-audio-transcript", sub)
  },
  onNativeAudioSuggestion: (callback: any) => {
    const sub = (_: any, data: any) => callback(data)
    ipcRenderer.on("native-audio-suggestion", sub)
    return () => ipcRenderer.removeListener("native-audio-suggestion", sub)
  },
  onNativeAudioConnected: (callback: any) => {
    const sub = () => callback()
    ipcRenderer.on("native-audio-connected", sub)
    return () => ipcRenderer.removeListener("native-audio-connected", sub)
  },
  onNativeAudioDisconnected: (callback: any) => {
    const sub = () => callback()
    ipcRenderer.on("native-audio-disconnected", sub)
    return () => ipcRenderer.removeListener("native-audio-disconnected", sub)
  },
  onSuggestionGenerated: (callback: any) => {
    const sub = (_: any, data: any) => callback(data)
    ipcRenderer.on("suggestion-generated", sub)
    return () => ipcRenderer.removeListener("suggestion-generated", sub)
  },
  onSuggestionProcessingStart: (callback: any) => {
    const sub = () => callback()
    ipcRenderer.on("suggestion-processing-start", sub)
    return () => ipcRenderer.removeListener("suggestion-processing-start", sub)
  },
  onSuggestionError: (callback: any) => {
    const sub = (_: any, data: any) => callback(data)
    ipcRenderer.on("suggestion-error", sub)
    return () => ipcRenderer.removeListener("suggestion-error", sub)
  },
  generateSuggestion: (ctx: string, lastQ: string) => ipcRenderer.invoke("generate-suggestion", ctx, lastQ),
  getNativeAudioStatus: () => ipcRenderer.invoke("native-audio-status"),
  getInputDevices: () => ipcRenderer.invoke("get-input-devices"),
  getOutputDevices: () => ipcRenderer.invoke("get-output-devices"),
  startAudioTest: (id?: string) => ipcRenderer.invoke("start-audio-test", id),
  stopAudioTest: () => ipcRenderer.invoke("stop-audio-test"),
  onAudioLevel: (callback: any) => {
    const sub = (_: any, lvl: number) => callback(lvl)
    ipcRenderer.on('audio-level', sub)
    return () => ipcRenderer.removeListener('audio-level', sub)
  },
  setRecognitionLanguage: (key: string) => ipcRenderer.invoke("set-recognition-language", key),
  onSessionReset: (callback: any) => {
    const sub = () => callback()
    ipcRenderer.on("session-reset", sub)
    return () => ipcRenderer.removeListener("session-reset", sub)
  },
  onAudioCaptureFallback: (callback: any) => {
    const sub = (_: any, data: any) => callback(data)
    ipcRenderer.on("audio-capture-fallback", sub)
    return () => ipcRenderer.removeListener("audio-capture-fallback", sub)
  },
  sendRawAudio: (data: Buffer) => ipcRenderer.send("raw-audio-stream", data),

  // Intelligence Mode IPC
  generateAssist: () => ipcRenderer.invoke("generate-assist"),
  generateWhatToSay: (q?: string, img?: string) => ipcRenderer.invoke("generate-what-to-say", q, img),
  generateFollowUp: (intent: string, req?: string, img?: string) => ipcRenderer.invoke("generate-follow-up", intent, req, img),
  generateFollowUpQuestions: (img?: string) => ipcRenderer.invoke("generate-follow-up-questions", img),
  generateRecap: () => ipcRenderer.invoke("generate-recap"),
  submitManualQuestion: (q: string) => ipcRenderer.invoke("submit-manual-question", q),
  getIntelligenceContext: () => ipcRenderer.invoke("get-intelligence-context"),
  resetIntelligence: () => ipcRenderer.invoke("reset-intelligence"),

  // Meeting Lifecycle
  startMeeting: (meta?: any) => ipcRenderer.invoke("start-meeting", meta),
  endMeeting: () => ipcRenderer.invoke("end-meeting"),
  getRecentMeetings: () => ipcRenderer.invoke("get-recent-meetings"),
  getMeetingDetails: (id: string) => ipcRenderer.invoke("get-meeting-details", id),
  regenerateMeetingSummary: (id: string) => ipcRenderer.invoke("regenerate-meeting-summary", id),
  updateMeetingTitle: (id: string, title: string) => ipcRenderer.invoke("update-meeting-title", { id, title }),
  updateMeetingSummary: (id: string, updates: any) => ipcRenderer.invoke("update-meeting-summary", { id, updates }),
  deleteMeeting: (id: string) => ipcRenderer.invoke("delete-meeting", id),
  getGlobalStats: () => ipcRenderer.invoke("get-global-stats"),
  onMeetingsUpdated: (callback: any) => {
    const sub = () => callback()
    ipcRenderer.on("meetings-updated", sub)
    return () => ipcRenderer.removeListener("meetings-updated", sub)
  },

  // Intelligence Mode Events
  onIntelligenceAssistUpdate: (callback: any) => {
    const sub = (_: any, data: any) => callback(data)
    ipcRenderer.on("intelligence-assist-update", sub)
    return () => ipcRenderer.removeListener("intelligence-assist-update", sub)
  },
  onIntelligenceSuggestedAnswerToken: (callback: any) => {
    const sub = (_: any, data: any) => callback(data)
    ipcRenderer.on("intelligence-suggested-answer-token", sub)
    return () => ipcRenderer.removeListener("intelligence-suggested-answer-token", sub)
  },
  onIntelligenceSuggestedAnswer: (callback: any) => {
    const sub = (_: any, data: any) => callback(data)
    ipcRenderer.on("intelligence-suggested-answer", sub)
    return () => ipcRenderer.removeListener("intelligence-suggested-answer", sub)
  },
  onIntelligenceRefinedAnswerToken: (callback: any) => {
    const sub = (_: any, data: any) => callback(data)
    ipcRenderer.on("intelligence-refined-answer-token", sub)
    return () => ipcRenderer.removeListener("intelligence-refined-answer-token", sub)
  },
  onIntelligenceRefinedAnswer: (callback: any) => {
    const sub = (_: any, data: any) => callback(data)
    ipcRenderer.on("intelligence-refined-answer", sub)
    return () => ipcRenderer.removeListener("intelligence-refined-answer", sub)
  },
  onIntelligenceRecapToken: (callback: any) => {
    const sub = (_: any, data: any) => callback(data)
    ipcRenderer.on("intelligence-recap-token", sub)
    return () => ipcRenderer.removeListener("intelligence-recap-token", sub)
  },
  onIntelligenceRecap: (callback: any) => {
    const sub = (_: any, data: any) => callback(data)
    ipcRenderer.on("intelligence-recap", sub)
    return () => ipcRenderer.removeListener("intelligence-recap", sub)
  },
  onIntelligenceFollowUpQuestionsToken: (callback: any) => {
    const sub = (_: any, data: any) => callback(data)
    ipcRenderer.on("intelligence-follow-up-questions-token", sub)
    return () => ipcRenderer.removeListener("intelligence-follow-up-questions-token", sub)
  },
  onIntelligenceFollowUpQuestionsUpdate: (callback: any) => {
    const sub = (_: any, data: any) => callback(data)
    ipcRenderer.on("intelligence-follow-up-questions-update", sub)
    return () => ipcRenderer.removeListener("intelligence-follow-up-questions-update", sub)
  },
  onIntelligenceManualStarted: (callback: any) => {
    const sub = () => callback()
    ipcRenderer.on("intelligence-manual-started", sub)
    return () => ipcRenderer.removeListener("intelligence-manual-started", sub)
  },
  onIntelligenceManualResult: (callback: any) => {
    const sub = (_: any, data: any) => callback(data)
    ipcRenderer.on("intelligence-manual-result", sub)
    return () => ipcRenderer.removeListener("intelligence-manual-result", sub)
  },
  onIntelligenceModeChanged: (callback: any) => {
    const sub = (_: any, mode: any) => callback(mode)
    ipcRenderer.on("intelligence-mode-changed", sub)
    return () => ipcRenderer.removeListener("intelligence-mode-changed", sub)
  },
  onIntelligenceError: (callback: any) => {
    const sub = (_: any, data: any) => callback(data)
    ipcRenderer.on("intelligence-error", sub)
    return () => ipcRenderer.removeListener("intelligence-error", sub)
  },
  onLicenseStatusUpdated: (callback: any) => {
    const sub = (_: any, state: any) => callback(state)
    ipcRenderer.on("license-status-updated", sub)
    return () => ipcRenderer.removeListener("license-status-updated", sub)
  },

  // Security
  getAirGapMode: () => ipcRenderer.invoke("get-air-gap-mode"),
  setAirGapMode: (enabled: boolean) => ipcRenderer.invoke("set-air-gap-mode", enabled),
  onAirGapChanged: (callback: any) => {
    const sub = (_: any, b: any) => callback(b)
    ipcRenderer.on('air-gap-changed', sub)
    return () => ipcRenderer.removeListener('air-gap-changed', sub)
  },
  getFullPrivacyStatus: () => ipcRenderer.invoke("get-full-privacy-status"),

  // Theme API
  getThemeMode: () => ipcRenderer.invoke('theme:get-mode'),
  setThemeMode: (mode: any) => ipcRenderer.invoke('theme:set-mode', mode),
  onThemeChanged: (callback: any) => {
    const sub = (_: any, data: any) => callback(data)
    ipcRenderer.on('theme:changed', sub)
    return () => ipcRenderer.removeListener('theme:changed', sub)
  },

  // Calendar
  calendarConnect: () => ipcRenderer.invoke('calendar-connect'),
  calendarDisconnect: () => ipcRenderer.invoke('calendar-disconnect'),
  getCalendarStatus: () => ipcRenderer.invoke('get-calendar-status'),
  getUpcomingEvents: () => ipcRenderer.invoke('get-upcoming-events'),
  calendarRefresh: () => ipcRenderer.invoke('calendar-refresh'),

  // Auto-Update
  onUpdateAvailable: (callback: any) => {
    const sub = (_: any, i: any) => callback(i)
    ipcRenderer.on("update-available", sub)
    return () => ipcRenderer.removeListener("update-available", sub)
  },
  onUpdateDownloaded: (callback: any) => {
    const sub = (_: any, i: any) => callback(i)
    ipcRenderer.on("update-downloaded", sub)
    return () => ipcRenderer.removeListener("update-downloaded", sub)
  },
  onUpdateChecking: (callback: any) => {
    const sub = () => callback()
    ipcRenderer.on("update-checking", sub)
    return () => ipcRenderer.removeListener("update-checking", sub)
  },
  onUpdateNotAvailable: (callback: any) => {
    const sub = (_: any, i: any) => callback(i)
    ipcRenderer.on("update-not-available", sub)
    return () => ipcRenderer.removeListener("update-not-available", sub)
  },
  onUpdateError: (callback: any) => {
    const sub = (_: any, e: any) => callback(e)
    ipcRenderer.on("update-error", sub)
    return () => ipcRenderer.removeListener("update-error", sub)
  },
  onDownloadProgress: (callback: any) => {
    const sub = (_: any, p: any) => callback(p)
    ipcRenderer.on("download-progress", sub)
    return () => ipcRenderer.removeListener("download-progress", sub)
  },
  restartAndInstall: () => ipcRenderer.invoke("quit-and-install-update"),
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  downloadUpdate: () => ipcRenderer.invoke("download-update"),

  // RAG API
  ragQueryMeeting: (id: string, q: string) => ipcRenderer.invoke('rag:query-meeting', { meetingId: id, query: q }),
  ragQueryGlobal: (q: string) => ipcRenderer.invoke('rag:query-global', { query: q }),
  ragCancelQuery: (opts: any) => ipcRenderer.invoke('rag:cancel-query', opts),
  ragIsMeetingProcessed: (id: string) => ipcRenderer.invoke('rag:is-meeting-processed', id),
  ragGetQueueStatus: () => ipcRenderer.invoke('rag:get-queue-status'),
  ragRetryEmbeddings: () => ipcRenderer.invoke('rag:retry-embeddings'),
  onRAGStreamChunk: (callback: any) => {
    const sub = (_: any, d: any) => callback(d)
    ipcRenderer.on('rag:stream-chunk', sub)
    return () => ipcRenderer.removeListener('rag:stream-chunk', sub)
  },
  onRAGStreamComplete: (callback: any) => {
    const sub = (_: any, d: any) => callback(d)
    ipcRenderer.on('rag:stream-complete', sub)
    return () => ipcRenderer.removeListener('rag:stream-complete', sub)
  },
  onRAGStreamError: (callback: any) => {
    const sub = (_: any, d: any) => callback(d)
    ipcRenderer.on('rag:stream-error', sub)
    return () => ipcRenderer.removeListener('rag:stream-error', sub)
  },

  // Remote Display
  getRemoteDisplayUrl: () => ipcRenderer.invoke("get-remote-display-url"),
  restartRemoteServer: () => ipcRenderer.invoke("restart-remote-server"),
  getRemoteDisplayPin: () => ipcRenderer.invoke("get-remote-display-pin"),
  setRemoteDisplayPin: (pin: string) => ipcRenderer.invoke("set-remote-display-pin", pin),

  // Custom Prompts (Legacy)
  getCustomPrompts: () => ipcRenderer.invoke("get-custom-prompts"),
  setCustomPrompt: (t: any, p: string) => ipcRenderer.invoke("set-custom-prompt", t, p),
  getDefaultPrompts: () => ipcRenderer.invoke("get-default-prompts"),
  getMeetingMode: () => ipcRenderer.invoke("get-meeting-mode"),
  setMeetingMode: (b: boolean) => ipcRenderer.invoke("set-meeting-mode", b),

  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, callback: any) => {
    const sub = (_: any, ...a: any[]) => callback(...a)
    ipcRenderer.on(channel, sub)
    return () => ipcRenderer.removeListener(channel, sub)
  }
})
