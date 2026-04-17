import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell } from "electron"
import path from "path"
import fs from "fs"

const APP_NAME = "Ghost Writer";
const LEGACY_USER_DATA_NAME = "Electron";

function copyIfMissing(sourcePath: string, targetPath: string): void {
  if (!fs.existsSync(sourcePath) || fs.existsSync(targetPath)) {
    return;
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.cpSync(sourcePath, targetPath, { recursive: true });
}

function normalizeUserDataPath(): void {
  try {
    app.setName(APP_NAME);
    const appDataPath = app.getPath("appData");
    const desiredUserDataPath = path.join(appDataPath, APP_NAME);
    const legacyUserDataPath = path.join(appDataPath, LEGACY_USER_DATA_NAME);

    if (app.getPath("userData") !== desiredUserDataPath) {
      app.setPath("userData", desiredUserDataPath);
    }

    // Check if we've already migrated to avoid expensive fs calls
    const migrationFlag = path.join(desiredUserDataPath, ".migrated");
    if (fs.existsSync(migrationFlag)) {
      return;
    }

    if (!fs.existsSync(legacyUserDataPath) || legacyUserDataPath === desiredUserDataPath) {
      if (!fs.existsSync(desiredUserDataPath)) fs.mkdirSync(desiredUserDataPath, { recursive: true });
      fs.writeFileSync(migrationFlag, "done");
      return;
    }

    const entriesToMigrate = [
      "credentials.enc",
      "calendar_tokens.enc",
      "ghost-writer.db",
      "theme-config.json",
      "install_id.txt",
      "install_ping_sent.txt",
      "context_documents",
      "whisper",
      "ai-runtime",
      "logs"
    ];

    for (const entry of entriesToMigrate) {
      copyIfMissing(
        path.join(legacyUserDataPath, entry),
        path.join(desiredUserDataPath, entry)
      );
    }

    // Mark migration as complete
    if (!fs.existsSync(desiredUserDataPath)) fs.mkdirSync(desiredUserDataPath, { recursive: true });
    fs.writeFileSync(migrationFlag, "done");
  } catch {
    // Path normalization is best-effort and should never block app startup.
  }
}

normalizeUserDataPath();

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  console.log("[Main] Another instance is already running. Signals sent to focus it. Exiting.");
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, we should focus our window.
    const state = AppState.getInstance();
    if (state) {
      const win = state.getMainWindow();
      if (win) {
        if (win.isMinimized()) win.restore();
        win.show(); // Handles both hidden windows and bringing to front
        win.focus();
      }
    }
  });
}

import { autoUpdater } from "electron-updater"
require('dotenv').config({ quiet: true });

// Handle stdout/stderr errors at the process level to prevent EIO crashes
// This is critical for Electron apps that may have their terminal detached
process.stdout?.on?.('error', () => { });
process.stderr?.on?.('error', () => { });

// Structured logging - replaces ad-hoc console overrides
import { logger, installConsoleOverrides } from "./utils/logger";
logger.init();
installConsoleOverrides();

// Global process-level error handlers — catch unhandled errors before they crash the app
const processLog = logger.createChild('Process');

process.on('uncaughtException', (error: Error) => {
  processLog.fatal('Uncaught exception', error);
  // Don't quit — Electron apps should try to recover
});

process.on('unhandledRejection', (reason: unknown) => {
  processLog.error('Unhandled promise rejection', reason instanceof Error ? reason : new Error(String(reason)));
});

const isDev = process.env.NODE_ENV === "development";

import { initializeIpcHandlers } from "./ipcHandlers"
import { WindowHelper } from "./WindowHelper"
import { SettingsWindowHelper } from "./SettingsWindowHelper"
import { ScreenshotHelper } from "./ScreenshotHelper"
import { ShortcutsHelper } from "./shortcuts"
import { ProcessingHelper } from "./ProcessingHelper"

import { IntelligenceManager } from "./IntelligenceManager"
import { SystemAudioCapture } from "./audio/SystemAudioCapture"
import { MicrophoneCapture } from "./audio/MicrophoneCapture"
import { GoogleSTT } from "./audio/GoogleSTT"
import { RestSTT } from "./audio/RestSTT"
import { DeepgramStreamingSTT } from "./audio/DeepgramStreamingSTT"
import { ThemeManager } from "./ThemeManager"
import { RAGManager } from "./rag/RAGManager"
import { RemoteServer } from "./services/RemoteServer"
import { DatabaseManager } from "./db/DatabaseManager"
import { CredentialsManager } from "./services/CredentialsManager"
import { LocalWhisperSTT } from "./audio/LocalWhisperSTT"
import { WhisperModelManager } from "./audio/WhisperModelManager"
import { ISTT, STTFactory } from "./audio/STTFactory"
import { cleanupOrphanedServers } from "./audio/LocalWhisperSTT";
import {
  isLikelyEchoTranscript,
  pruneTranscriptEchoCandidates,
  TranscriptEchoCandidate
} from "./audio/echoSuppression";

import { ContextDocumentManager } from "./services/ContextDocumentManager"
import { AnalyticsManager } from "./services/AnalyticsManager"

export class AppState {
  private static instance: AppState | null = null

  private windowHelper: WindowHelper
  public settingsWindowHelper: SettingsWindowHelper
  private screenshotHelper: ScreenshotHelper
  public shortcutsHelper: ShortcutsHelper
  public processingHelper: ProcessingHelper

  private intelligenceManager: IntelligenceManager
  private themeManager: ThemeManager
  private ragManager: RAGManager | null = null
  public contextManager: ContextDocumentManager // Added Context Manager
  public credentialsManager: CredentialsManager // Added Credentials Manager
  private analyticsManager: AnalyticsManager // Added Analytics Manager
  public remoteServer: RemoteServer // Added Remote Server
  private tray: Tray | null = null
  private updateAvailable: boolean = false
  private disguiseMode: 'terminal' | 'settings' | 'activity' | 'none' = 'none'

  // View management
  private view: "queue" | "solutions" = "queue"
  private isUndetectable: boolean = false

  private problemInfo: {
    problem_statement: string
    input_format: Record<string, any>
    output_format: Record<string, any>
    constraints: Array<Record<string, any>>
    test_cases: Array<Record<string, any>>
  } | null = null // Allow null

  private hasDebugged: boolean = false
  private isMeetingActive: boolean = false; // Guard for session state leaks
  private recentInterviewerTranscripts: TranscriptEchoCandidate[] = [];

  // Processing events
  public readonly PROCESSING_EVENTS = {
    //global states
    UNAUTHORIZED: "procesing-unauthorized",
    NO_SCREENSHOTS: "processing-no-screenshots",

    //states for generating the initial solution
    INITIAL_START: "initial-start",
    PROBLEM_EXTRACTED: "problem-extracted",
    SOLUTION_SUCCESS: "solution-success",
    INITIAL_SOLUTION_ERROR: "solution-error",

    //states for processing the debugging
    DEBUG_START: "debug-start",
    DEBUG_SUCCESS: "debug-success",
    DEBUG_ERROR: "debug-error"
  } as const

  constructor() {
    // Initialize WindowHelper with this
    this.windowHelper = new WindowHelper(this)
    this.settingsWindowHelper = new SettingsWindowHelper()

    // Initialize ScreenshotHelper
    this.screenshotHelper = new ScreenshotHelper(this.view)

    // Initialize ProcessingHelper
    this.processingHelper = new ProcessingHelper(this)

    // Initialize ShortcutsHelper
    this.shortcutsHelper = new ShortcutsHelper(this)


    // Initialize IntelligenceManager with LLMHelper
    this.intelligenceManager = new IntelligenceManager(this.processingHelper.getLLMHelper())

    // Pre-requisites
    this.credentialsManager = CredentialsManager.getInstance();
    this.themeManager = ThemeManager.getInstance();
    this.contextManager = ContextDocumentManager.getInstance();
    this.remoteServer = RemoteServer.getInstance();
    this.remoteServer.start();

    // Native Detection
    this.isNativeAudioAvailable = SystemAudioCapture.isAvailable() && MicrophoneCapture.isAvailable();
    if (!this.isNativeAudioAvailable) {
      console.warn('[AppState] Native Audio Module not available. Web Audio Fallback enabled.');
    }

    // Initialize RAG
    this.initializeRAGManager();

    this.setupIntelligenceEvents()

    // Cleanup any orphaned whisper-server processes from a previous crash
    cleanupOrphanedServers().catch(() => { });

    // Setup Ollama IPC

    // --- NEW SYSTEM AUDIO PIPELINE (SOX + NODE GOOGLE STT) ---
    // LAZY INIT: Do not setup pipeline here to prevent launch volume surge.
    // this.setupSystemAudioPipeline()

    // Initialize Auto-Updater (Deferred)
    setImmediate(() => {
      this.setupAutoUpdater();
      
      // Initialize Analytics
      this.analyticsManager = AnalyticsManager.getInstance();
      this.analyticsManager.startTracking();

      // Seed demo meeting if database is empty to provide immediate user value
      try {
        const db = DatabaseManager.getInstance();
        const recent = db.getRecentMeetings(1);
        if (recent.length === 0) {
          processLog.info("No meetings found, seeding demo meeting.");
          db.seedDemoMeeting();
        }
      } catch (e) {
        processLog.error("Failed to seed demo meeting", e);
      }
    });
  }

  private initializeRAGManager(): void {
    try {
      const db = DatabaseManager.getInstance();
      // @ts-ignore - accessing private db for RAGManager
      const sqliteDb = db['db'];

      if (sqliteDb) {
        this.ragManager = new RAGManager({ db: sqliteDb });
        this.ragManager.setLLMHelper(this.processingHelper.getLLMHelper());
        console.log('[AppState] RAGManager initialized');
      }
    } catch (error) {
      console.error('[AppState] Failed to initialize RAGManager:', error);
    }
  }

  private setupAutoUpdater(): void {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false  // Manual install only via button

    autoUpdater.on("checking-for-update", () => {
      console.log("[AutoUpdater] Checking for update...")
      this.getMainWindow()?.webContents.send("update-checking")
    })

    autoUpdater.on("update-available", (info) => {
      console.log("[AutoUpdater] Update available:", info.version)
      this.updateAvailable = true
      // Notify renderer that an update is available (for optional UI signal)
      this.getMainWindow()?.webContents.send("update-available", info)
    })

    autoUpdater.on("update-not-available", (info) => {
      console.log("[AutoUpdater] Update not available:", info.version)
      this.getMainWindow()?.webContents.send("update-not-available", info)
    })

    autoUpdater.on("error", (err) => {
      console.error("[AutoUpdater] Error:", err)
      this.getMainWindow()?.webContents.send("update-error", err.message)
    })

    autoUpdater.on("download-progress", (progressObj) => {
      let log_message = "Download speed: " + progressObj.bytesPerSecond
      log_message = log_message + " - Downloaded " + progressObj.percent + "%"
      log_message = log_message + " (" + progressObj.transferred + "/" + progressObj.total + ")"
      console.log("[AutoUpdater] " + log_message)
      this.getMainWindow()?.webContents.send("download-progress", progressObj)
    })

    autoUpdater.on("update-downloaded", (info) => {
      console.log("[AutoUpdater] Update downloaded:", info.version)
      // Notify renderer that update is ready to install
      this.getMainWindow()?.webContents.send("update-downloaded", info)
    })

    // Only skip the automatic check in development
    if (process.env.NODE_ENV === "development") {
      console.log("[AutoUpdater] Skipping automatic update check in development mode")
      return
    }

    // Start checking for updates
    autoUpdater.checkForUpdatesAndNotify().catch(err => {
      console.error("[AutoUpdater] Failed to check for updates:", err)
    })
  }


  public async quitAndInstallUpdate(): Promise<void> {
    console.log('[AutoUpdater] quitAndInstall called - applying update...')

    // Windows: use standard quitAndInstall directly
    setImmediate(() => {
      try {
        autoUpdater.quitAndInstall(false, true)
      } catch (err) {
        console.error('[AutoUpdater] quitAndInstall failed:', err)
        app.exit(0)
      }
    })
  }

  public async checkForUpdates(): Promise<void> {
    await autoUpdater.checkForUpdatesAndNotify()
  }

  public downloadUpdate(): void {
    autoUpdater.downloadUpdate()
  }

  // New Property for System Audio & Microphone
  private systemAudioCapture: SystemAudioCapture | null = null;
  private microphoneCapture: MicrophoneCapture | null = null;
  private audioTestCapture: MicrophoneCapture | null = null; // For audio settings test
  private googleSTT: ISTT | null = null; // Interviewer
  private googleSTT_User: ISTT | null = null; // User

  private isNativeAudioAvailable: boolean = true;
  private fallbackToWebAudio: boolean = false;

  private getBufferVolume(buf: Buffer): number {
    let sum = 0;
    for (let i = 0; i < buf.length; i += 2) {
      if (i + 1 < buf.length) {
        sum += Math.abs(buf.readInt16LE(i));
      }
    }
    return buf.length > 0 ? sum / (buf.length / 2) : 0;
  }

  private rememberInterviewerTranscript(text: string, timestamp: number, final: boolean): void {
    if (!text?.trim()) {
      return;
    }

    this.recentInterviewerTranscripts.push({ text, timestamp, final });
    this.recentInterviewerTranscripts = pruneTranscriptEchoCandidates(
      this.recentInterviewerTranscripts,
      timestamp
    );
  }

  private shouldSuppressUserEcho(text: string, timestamp: number): boolean {
    this.recentInterviewerTranscripts = pruneTranscriptEchoCandidates(
      this.recentInterviewerTranscripts,
      timestamp
    );

    return isLikelyEchoTranscript(text, this.recentInterviewerTranscripts, timestamp);
  }

  private async setupSystemAudioPipeline(): Promise<void> {

    if (!this.isNativeAudioAvailable) {
      console.log('[Main] Skipping native pipeline setup - Falling back to Web Audio');
      this.fallbackToWebAudio = true;
      // Notify renderer to start Web Audio capture
      this.getMainWindow()?.webContents.send('audio-capture-fallback', { reason: 'Native module missing' });
      return;
    }

    try {
      // 1. Initialize Captures if missing
      // If they already exist (e.g. from reconfigureAudio), they are already wired to write to this.googleSTT/User
      if (!this.systemAudioCapture) {
        this.systemAudioCapture = new SystemAudioCapture();
        // Wire Capture -> STT
        this.systemAudioCapture.on('data', (chunk: Buffer) => {
          this.googleSTT?.write(chunk);
        });
        this.systemAudioCapture.on('error', (err: Error) => {
          console.error('[Main] SystemAudioCapture Error:', err);
          // Mid-session production hardening: If native capture dies, trigger Web Audio fallback
          if (this.isMeetingActive && !this.fallbackToWebAudio) {
            console.warn('[Main] Native System Capture failed mid-meeting. Attempting Web Audio fallback...');
            this.fallbackToWebAudio = true;
            this.getMainWindow()?.webContents.send('audio-capture-fallback', { reason: 'Native capture error: ' + err.message });
          }
        });
      }

      if (!this.microphoneCapture) {
        this.microphoneCapture = new MicrophoneCapture();
        // Wire Capture -> STT
        this.microphoneCapture.on('data', (chunk: Buffer) => {
          this.googleSTT_User?.write(chunk);
        });
        this.microphoneCapture.on('error', (err: Error) => {
          console.error('[Main] MicrophoneCapture Error:', err);
        });
      }

      // 2. Initialize STT Services if missing
      if (!this.googleSTT) {
        this.googleSTT = await STTFactory.createSTT('interviewer');

        // Wire Transcript Events
        this.googleSTT.on('transcript', (segment: { text: string, isFinal: boolean, confidence: number }) => {
          if (!this.isMeetingActive) {
            return;
          }

          const timestamp = Date.now();
          this.rememberInterviewerTranscript(segment.text, timestamp, segment.isFinal);

          this.intelligenceManager.handleTranscript({
            speaker: 'interviewer',
            text: segment.text,
            timestamp,
            final: segment.isFinal,
            confidence: segment.confidence
          });

          const helper = this.getWindowHelper();
          const payload = {
            speaker: 'interviewer',
            text: segment.text,
            timestamp,
            final: segment.isFinal,
            confidence: segment.confidence
          };
          helper.getLauncherWindow()?.webContents.send('native-audio-transcript', payload);
          helper.getOverlayWindow()?.webContents.send('native-audio-transcript', payload);
        });

        this.googleSTT.on('error', (err: Error) => {
          console.error('[Main] STT (Interviewer) Error:', err);
        });
      }

      if (!this.googleSTT_User) {
        this.googleSTT_User = await STTFactory.createSTT('user');

        // Wire Transcript Events
        this.googleSTT_User.on('transcript', (segment: { text: string, isFinal: boolean, confidence: number }) => {
          if (!this.isMeetingActive) {
            return;
          }

          const timestamp = Date.now();
          if (this.shouldSuppressUserEcho(segment.text, timestamp)) {
            console.log('[Main] Suppressing likely interviewer echo from microphone channel:', segment.text);
            return;
          }

          this.intelligenceManager.handleTranscript({
            speaker: 'user',
            text: segment.text,
            timestamp,
            final: segment.isFinal,
            confidence: segment.confidence
          });

          const helper = this.getWindowHelper();
          const payload = {
            speaker: 'user',
            text: segment.text,
            timestamp,
            final: segment.isFinal,
            confidence: segment.confidence
          };
          helper.getLauncherWindow()?.webContents.send('native-audio-transcript', payload);
          helper.getOverlayWindow()?.webContents.send('native-audio-transcript', payload);
        });

        this.googleSTT_User.on('error', (err: Error) => {
          console.error('[Main] STT (User) Error:', err);
        });
      }

      // --- CRITICAL FIX: SYNC SAMPLE RATES ---
      // Always sync rates, even if just initialized, to ensure consistency

      // 1. Sync System Audio Rate
      const sysRate = this.systemAudioCapture?.getSampleRate() || 16000;
      console.log(`[Main] Configuring Interviewer STT to ${sysRate}Hz`);
      this.googleSTT?.setSampleRate(sysRate);
      if ('setAudioChannelCount' in this.googleSTT!) {
        (this.googleSTT as any).setAudioChannelCount(1);
      }

      // 2. Sync Mic Rate
      const micRate = this.microphoneCapture?.getSampleRate() || 16000;
      console.log(`[Main] Configuring User STT to ${micRate}Hz`);
      this.googleSTT_User?.setSampleRate(micRate);
      if ('setAudioChannelCount' in this.googleSTT_User!) {
        (this.googleSTT_User as any).setAudioChannelCount(1);
      }

      console.log('[Main] Full Audio Pipeline (System + Mic) Initialized (Ready)');

    } catch (err) {
      console.error('[Main] Failed to setup System Audio Pipeline:', err);
    }
  }
  private async reconfigureAudio(inputDeviceId?: string, outputDeviceId?: string): Promise<void> {
    console.log(`[Main] Reconfiguring Audio: Input=${inputDeviceId}, Output=${outputDeviceId}`);

    // 1. System Audio (Output Capture)
    if (this.systemAudioCapture) {
      this.systemAudioCapture.stop();
      this.systemAudioCapture = null;
    }

    try {
      console.log('[Main] Initializing SystemAudioCapture...');
      this.systemAudioCapture = new SystemAudioCapture(outputDeviceId || undefined);
      const rate = this.systemAudioCapture.getSampleRate();
      console.log(`[Main] SystemAudioCapture rate: ${rate}Hz`);
      this.googleSTT?.setSampleRate(rate);

      this.systemAudioCapture.on('data', (chunk: Buffer) => {
        this.googleSTT?.write(chunk);
      });
      this.systemAudioCapture.on('error', (err: Error) => {
        console.error('[Main] SystemAudioCapture Error:', err);
        // Auto-retry with default device if a specific device was requested
        if (outputDeviceId && outputDeviceId !== 'default') {
          console.log('[Main] Retrying SystemAudioCapture with default device...');
          try {
            this.systemAudioCapture?.stop();
            this.systemAudioCapture = new SystemAudioCapture();
            this.systemAudioCapture.on('data', (chunk: Buffer) => {
              this.googleSTT?.write(chunk);
            });
            this.systemAudioCapture.on('error', (err2: Error) => {
              console.error('[Main] SystemAudioCapture (Default) Error:', err2);
            });
            this.systemAudioCapture.start();
            console.log('[Main] SystemAudioCapture restarted with default device');
          } catch (retryErr) {
            console.error('[Main] SystemAudioCapture default device retry also failed:', retryErr);
          }
        }
      });
      console.log('[Main] SystemAudioCapture initialized.');
    } catch (err) {
      console.warn('[Main] Failed to initialize SystemAudioCapture with preferred ID. Falling back to default.', err);
      try {
        this.systemAudioCapture = new SystemAudioCapture(); // Default
        const rate = this.systemAudioCapture.getSampleRate();
        console.log(`[Main] SystemAudioCapture (Default) rate: ${rate}Hz`);
        this.googleSTT?.setSampleRate(rate);

        this.systemAudioCapture.on('data', (chunk: Buffer) => {
          this.googleSTT?.write(chunk);
        });
        this.systemAudioCapture.on('error', (err: Error) => {
          console.error('[Main] SystemAudioCapture (Default) Error:', err);
        });
      } catch (err2) {
        console.error('[Main] Failed to initialize SystemAudioCapture (Default):', err2);
      }
    }

    // 2. Microphone (Input Capture)
    if (this.microphoneCapture) {
      this.microphoneCapture.stop();
      this.microphoneCapture = null;
    }

    try {
      console.log('[Main] Initializing MicrophoneCapture...');
      this.microphoneCapture = new MicrophoneCapture(inputDeviceId || undefined);
      const rate = this.microphoneCapture.getSampleRate();
      console.log(`[Main] MicrophoneCapture rate: ${rate}Hz`);
      this.googleSTT_User?.setSampleRate(rate);

      this.microphoneCapture.on('data', (chunk: Buffer) => {
        this.googleSTT_User?.write(chunk);
      });
      this.microphoneCapture.on('error', (err: Error) => {
        console.error('[Main] MicrophoneCapture Error:', err);
        // Mid-session production hardening: If native capture dies, trigger Web Audio fallback
        if (this.isMeetingActive && !this.fallbackToWebAudio) {
          console.warn('[Main] Native Mic Capture failed mid-meeting. Attempting Web Audio fallback...');
          this.fallbackToWebAudio = true;
          this.getMainWindow()?.webContents.send('audio-capture-fallback', { reason: 'Native mic error: ' + err.message });
        }
      });
      console.log('[Main] MicrophoneCapture initialized.');
    } catch (err) {
      console.warn('[Main] Failed to initialize MicrophoneCapture with preferred ID. Falling back to default.', err);
      try {
        this.microphoneCapture = new MicrophoneCapture(); // Default
        const rate = this.microphoneCapture.getSampleRate();
        console.log(`[Main] MicrophoneCapture (Default) rate: ${rate}Hz`);
        this.googleSTT_User?.setSampleRate(rate);

        this.microphoneCapture.on('data', (chunk: Buffer) => {
          this.googleSTT_User?.write(chunk);
        });
        this.microphoneCapture.on('error', (err: Error) => {
          console.error('[Main] MicrophoneCapture (Default) Error:', err);
        });
      } catch (err2) {
        console.error('[Main] Failed to initialize MicrophoneCapture (Default):', err2);
      }
    }
  }

  /**
   * Create a LocalWhisperSTT instance if whisper.cpp binary and model are available
   * Returns null if not available (caller should fall back to GoogleSTT)
   */
  private createLocalWhisperSTT(): LocalWhisperSTT | null {
    try {
      const manager = WhisperModelManager.getInstance();
      const paths = manager.getPaths();

      if (paths.isReady) {
        const whisperSTT = new LocalWhisperSTT(paths.binaryPath, paths.modelPath);
        if (whisperSTT.getIsAvailable()) {
          return whisperSTT;
        }
      }

      console.log('[Main] Local Whisper not available (run whisper setup to download binary + model)');
      return null;
    } catch (err) {
      console.warn('[Main] Failed to create LocalWhisperSTT:', err);
      return null;
    }
  }

  /**
   * Reconfigure STT provider mid-session (called from IPC when user changes provider)
   * Destroys existing STT instances and recreates them with the new provider
   */
  public async reconfigureSttProvider(): Promise<void> {
    console.log('[Main] Reconfiguring STT Provider...');

    // Stop existing STT instances
    if (this.googleSTT) {
      await this.googleSTT.stop();
      this.googleSTT.removeAllListeners();
      this.googleSTT = null;
    }
    if (this.googleSTT_User) {
      await this.googleSTT_User.stop();
      this.googleSTT_User.removeAllListeners();
      this.googleSTT_User = null;
    }

    // Reinitialize the pipeline (will pick up the new provider from CredentialsManager)
    this.setupSystemAudioPipeline();

    // Start the new STT instances if a meeting is active
    if (this.isMeetingActive) {
      this.googleSTT?.start();
      this.googleSTT_User?.start();
    }

    console.log('[Main] STT Provider reconfigured');
  }


  public startAudioTest(deviceId?: string): void {
    console.log(`[Main] Starting Audio Test on device: ${deviceId || 'default'}`);
    this.stopAudioTest(); // Stop any existing test

    try {
      this.audioTestCapture = new MicrophoneCapture(deviceId || undefined);
      this.audioTestCapture.start();

      // Send to settings window if open, else main window
      const win = this.settingsWindowHelper.getSettingsWindow() || this.getMainWindow();

      this.audioTestCapture.on('data', (chunk: Buffer) => {
        // Calculate basic RMS for level meter
        if (!win || win.isDestroyed()) return;

        let sum = 0;
        const step = 10;
        const len = chunk.length;

        for (let i = 0; i < len; i += 2 * step) {
          const val = chunk.readInt16LE(i);
          sum += val * val;
        }

        const count = len / (2 * step);
        if (count > 0) {
          const rms = Math.sqrt(sum / count);
          // Normalize 0-1 (heuristic scaling, max comfortable mic input is around 10000-20000)
          const level = Math.min(rms / 10000, 1.0);
          win.webContents.send('audio-level', level);
        }
      });

      this.audioTestCapture.on('error', (err: Error) => {
        console.error('[Main] AudioTest Error:', err);
      });

    } catch (err) {
      console.error('[Main] Failed to start audio test:', err);
    }
  }

  public stopAudioTest(): void {
    if (this.audioTestCapture) {
      console.log('[Main] Stopping Audio Test');
      this.audioTestCapture.stop();
      this.audioTestCapture = null;
    }
  }

  public async startMeeting(metadata?: any): Promise<void> {
    if (this.isMeetingActive) {
      console.log('[Main] Meeting is already active. Ignoring duplicate start request.');
      return;
    }
    console.log('[Main] Starting Meeting...', metadata);

    this.isMeetingActive = true;
    this.recentInterviewerTranscripts = [];
    this.intelligenceManager.setMeetingMetadata(metadata || null);
    if (metadata) {
      // Check for audio configuration preference
      if (metadata.audio) {
        await this.reconfigureAudio(metadata.audio.inputDeviceId, metadata.audio.outputDeviceId);
      }
    }

    // Track meeting start
    this.analyticsManager.onMeetingStarted();

    // Emit session reset to clear UI state
    this.getWindowHelper().getOverlayWindow()?.webContents.send('session-reset');
    this.getWindowHelper().getLauncherWindow()?.webContents.send('session-reset');

    // LAZY INIT: Ensure pipeline is ready (if not reconfigured above)
    await this.setupSystemAudioPipeline();

    // 3. Start System Audio
    this.systemAudioCapture?.start();
    this.googleSTT?.start();

    // 4. Start Microphone
    this.microphoneCapture?.start();
    this.googleSTT_User?.start();
  }

  public async endMeeting(): Promise<void> {
    if (!this.isMeetingActive) {
      console.log('[Main] Meeting is already ended or not active. Ignoring duplicate end request.');
      return;
    }
    console.log('[Main] Ending Meeting...');
    this.isMeetingActive = false; // Block new data immediately
    this.recentInterviewerTranscripts = [];

    // Track meeting end
    this.analyticsManager.onMeetingEnded();

    // 3. Stop System Audio
    this.systemAudioCapture?.stop();
    await this.googleSTT?.stop();

    // 4. Stop Microphone
    this.microphoneCapture?.stop();
    await this.googleSTT_User?.stop();

    // 4. Reset Intelligence Context & Save
    await this.intelligenceManager.stopMeeting();

    // 5. Process meeting for RAG (embeddings)
    await this.processCompletedMeetingForRAG();
  }

  private async processCompletedMeetingForRAG(): Promise<void> {
    if (!this.ragManager) return;

    try {
      // Get the most recent meeting from database
      const meetings = DatabaseManager.getInstance().getRecentMeetings(1);
      if (meetings.length === 0) return;

      const meeting = DatabaseManager.getInstance().getMeetingDetails(meetings[0].id);
      if (!meeting || !meeting.transcript || meeting.transcript.length === 0) return;

      // Convert transcript to RAG format
      const segments = meeting.transcript.map(t => ({
        speaker: t.speaker,
        text: t.text,
        timestamp: t.timestamp
      }));

      // Generate summary from detailedSummary if available
      let summary: string | undefined;
      if (meeting.detailedSummary) {
        summary = [
          ...(meeting.detailedSummary.keyPoints || []),
          ...(meeting.detailedSummary.actionItems || []).map(a => `Action: ${a}`)
        ].join('. ');
      }

      // Process meeting for RAG
      const result = await this.ragManager.processMeeting(meeting.id, segments, summary);
      console.log(`[AppState] RAG processed meeting ${meeting.id}: ${result.chunkCount} chunks`);

    } catch (error) {
      console.error('[AppState] Failed to process meeting for RAG:', error);
    }
  }

  private setupIntelligenceEvents(): void {
    const mainWindow = this.getMainWindow.bind(this)

    // Forward intelligence events to renderer
    this.intelligenceManager.on('assist_update', (insight: string) => {
      // Send to both if both exist, though mostly overlay needs it
      const helper = this.getWindowHelper();
      helper.getLauncherWindow()?.webContents.send('intelligence-assist-update', { insight });
      helper.getOverlayWindow()?.webContents.send('intelligence-assist-update', { insight });
    })

    this.intelligenceManager.on('suggested_answer', (answer: string, question: string, confidence: number) => {
      const win = mainWindow()
      if (win) {
        win.webContents.send('intelligence-suggested-answer', { answer, question, confidence })
      }

      // Push to mobile
      this.remoteServer.pushAnswer(answer, question);
    })

    this.intelligenceManager.on('suggested_answer_token', (token: string, question: string, confidence: number) => {
      const win = mainWindow()
      if (win) {
        win.webContents.send('intelligence-suggested-answer-token', { token, question, confidence })
      }

      // Push to mobile
      this.remoteServer.pushToken(token, 'what_to_answer');
    })

    this.intelligenceManager.on('refined_answer_token', (token: string, intent: string) => {
      const win = mainWindow()
      if (win) {
        win.webContents.send('intelligence-refined-answer-token', { token, intent })
      }

      // Push to mobile
      this.remoteServer.pushToken(token, intent);
    })

    this.intelligenceManager.on('refined_answer', (answer: string, intent: string) => {
      const win = mainWindow()
      if (win) {
        win.webContents.send('intelligence-refined-answer', { answer, intent })
      }

      // Push to mobile
      this.remoteServer.pushAnswer(answer, intent);
    })

    this.intelligenceManager.on('recap', (summary: string) => {
      const win = mainWindow()
      if (win) {
        win.webContents.send('intelligence-recap', { summary })
      }
    })

    this.intelligenceManager.on('recap_token', (token: string) => {
      const win = mainWindow()
      if (win) {
        win.webContents.send('intelligence-recap-token', { token })
      }

      // Push to mobile
      this.remoteServer.pushToken(token, 'recap');
    })

    this.intelligenceManager.on('follow_up_questions_update', (questions: string) => {
      const win = mainWindow()
      if (win) {
        win.webContents.send('intelligence-follow-up-questions-update', { questions })
      }
    })

    this.intelligenceManager.on('follow_up_questions_token', (token: string) => {
      const win = mainWindow()
      if (win) {
        win.webContents.send('intelligence-follow-up-questions-token', { token })
      }

      // Push to mobile
      this.remoteServer.pushToken(token, 'follow_up_questions');
    })

    this.intelligenceManager.on('manual_answer_started', () => {
      const win = mainWindow()
      if (win) {
        win.webContents.send('intelligence-manual-started')
      }
    })

    this.intelligenceManager.on('manual_answer_result', (answer: string, question: string) => {
      const win = mainWindow()
      if (win) {
        win.webContents.send('intelligence-manual-result', { answer, question })
      }

      // Push to mobile
      this.remoteServer.pushAnswer(answer, question);
    })

    this.intelligenceManager.on('mode_changed', (mode: string) => {
      const win = mainWindow()
      if (win) {
        win.webContents.send('intelligence-mode-changed', { mode })
      }
    })

    this.intelligenceManager.on('error', (error: Error, mode: string) => {
      console.error(`[IntelligenceManager] Error in ${mode}:`, error)
      const win = mainWindow()
      if (win) {
        win.webContents.send('intelligence-error', { error: error.message, mode })
      }
    })

    this.intelligenceManager.on('model-status', (info) => {
      const win = mainWindow()
      if (win) {
        win.webContents.send('model-status', info)
      }
    })

    this.intelligenceManager.on('active-model', (info) => {
      const win = mainWindow()
      if (win) {
        win.webContents.send('active-model', info)
      }
    })
  }





  public updateGoogleCredentials(keyPath: string): void {
    console.log(`[AppState] Updating Google Credentials to: ${keyPath}`);
    // Set global environment variable so new instances pick it up
    process.env.GOOGLE_APPLICATION_CREDENTIALS = keyPath;

    if (this.googleSTT) {
      this.googleSTT.setCredentials(keyPath);
    }

    if (this.googleSTT_User) {
      this.googleSTT_User.setCredentials(keyPath);
    }
  }

  public setRecognitionLanguage(key: string): void {
    console.log(`[AppState] Setting recognition language to: ${key}`);
    this.googleSTT?.setRecognitionLanguage(key);
    this.googleSTT_User?.setRecognitionLanguage(key);
  }

  public static getInstance(): AppState {
    if (!AppState.instance) {
      AppState.instance = new AppState()
    }
    return AppState.instance
  }

  // Getters and Setters
  public getMainWindow(): BrowserWindow | null {
    return this.windowHelper.getMainWindow()
  }

  public getWindowHelper(): WindowHelper {
    return this.windowHelper
  }

  public getIntelligenceManager(): IntelligenceManager {
    return this.intelligenceManager
  }

  public getThemeManager(): ThemeManager {
    return this.themeManager
  }

  public getRAGManager(): RAGManager | null {
    return this.ragManager;
  }

  public getView(): "queue" | "solutions" {
    return this.view
  }

  public setView(view: "queue" | "solutions"): void {
    this.view = view
    this.screenshotHelper.setView(view)
  }

  public isVisible(): boolean {
    return this.windowHelper.isVisible()
  }

  public getScreenshotHelper(): ScreenshotHelper {
    return this.screenshotHelper
  }

  public getIsMeetingActive(): boolean {
    return this.isMeetingActive;
  }

  public getProblemInfo(): any {
    return this.problemInfo
  }

  public setProblemInfo(problemInfo: any): void {
    this.problemInfo = problemInfo
  }

  public getGoogleSTT() {
    return this.googleSTT;
  }

  public getGoogleSTTUser() {
    return this.googleSTT_User;
  }

  public getScreenshotQueue(): string[] {
    return this.screenshotHelper.getScreenshotQueue()
  }

  public getExtraScreenshotQueue(): string[] {
    return this.screenshotHelper.getExtraScreenshotQueue()
  }

  // Window management methods
  public setupOllamaIpcHandlers(): void {
    ipcMain.handle('get-ollama-models', async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000); // 2s timeout for detection

        const response = await fetch('http://localhost:11434/api/tags', {
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          // data.models is an array of objects: { name: "llama3:latest", ... }
          return data.models.map((m: any) => m.name);
        }
        return [];
      } catch (error) {
        // console.warn("Ollama detection failed:", error);
        return [];
      }
    });
  }

  public createWindow(): void {
    this.windowHelper.createWindow()
  }

  public hideMainWindow(): void {
    this.windowHelper.hideMainWindow()
  }

  public showMainWindow(): void {
    this.windowHelper.showMainWindow()
  }

  public toggleMainWindow(): void {
    console.log(
      "Screenshots: ",
      this.screenshotHelper.getScreenshotQueue().length,
      "Extra screenshots: ",
      this.screenshotHelper.getExtraScreenshotQueue().length
    )
    this.windowHelper.toggleMainWindow()
  }

  public setWindowDimensions(width: number, height: number): void {
    this.windowHelper.setWindowDimensions(width, height)
  }

  public clearQueues(): void {
    this.screenshotHelper.clearQueues()

    // Clear problem info
    this.problemInfo = null

    // Reset view to initial state
    this.setView("queue")
  }

  // Screenshot management methods
  public async takeScreenshot(): Promise<string> {
    if (!this.getMainWindow()) throw new Error("No main window available")

    const wasOverlayVisible = this.windowHelper.getOverlayWindow()?.isVisible() ?? false

    const screenshotPath = await this.screenshotHelper.takeScreenshot(
      () => this.hideMainWindow(),
      () => {
        if (wasOverlayVisible) {
          this.windowHelper.switchToOverlay()
        } else {
          this.showMainWindow()
        }
      }
    )

    if (this.isMeetingActive) {
      this.intelligenceManager.addMeetingScreenshot(screenshotPath);
    }

    return screenshotPath
  }

  public async takeSelectiveScreenshot(): Promise<string> {
    if (!this.getMainWindow()) throw new Error("No main window available")

    const wasOverlayVisible = this.windowHelper.getOverlayWindow()?.isVisible() ?? false

    const screenshotPath = await this.screenshotHelper.takeSelectiveScreenshot(
      () => this.hideMainWindow(),
      () => {
        if (wasOverlayVisible) {
          this.windowHelper.switchToOverlay()
        } else {
          this.showMainWindow()
        }
      }
    )

    if (this.isMeetingActive) {
      this.intelligenceManager.addMeetingScreenshot(screenshotPath);
    }

    return screenshotPath
  }

  public async getImagePreview(filepath: string): Promise<string> {
    return this.screenshotHelper.getImagePreview(filepath)
  }

  public async deleteScreenshot(
    path: string
  ): Promise<{ success: boolean; error?: string }> {
    return this.screenshotHelper.deleteScreenshot(path)
  }

  // New methods to move the window
  public moveWindowLeft(): void {
    this.windowHelper.moveWindowLeft()
  }

  public moveWindowRight(): void {
    this.windowHelper.moveWindowRight()
  }
  public moveWindowDown(): void {
    this.windowHelper.moveWindowDown()
  }
  public moveWindowUp(): void {
    this.windowHelper.moveWindowUp()
  }

  public centerAndShowWindow(): void {
    this.windowHelper.centerAndShowWindow()
  }

  public createTray(): void {
    this.showTray();
  }

  public showTray(): void {
    if (this.tray) return;

    const resourcesPath = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
    const defaultIconPath = app.isPackaged
      ? path.join(resourcesPath, 'assets/icons/win/icon.ico')
      : path.join(__dirname, '../assets/icons/win/icon.ico');

    let iconToUse = defaultIconPath;

    // macOS tray icons prefer template images; Windows should use the .ico directly.
    if (process.platform === 'darwin') {
      const templatePath = path.join(resourcesPath, 'assets', 'iconTemplate.png');

      try {
        if (require('fs').existsSync(templatePath)) {
          iconToUse = templatePath;
          console.log('[Tray] Using template icon:', templatePath);
        } else {
          const devTemplatePath = path.join(__dirname, '../src/components/iconTemplate.png');
          if (require('fs').existsSync(devTemplatePath)) {
            iconToUse = devTemplatePath;
            console.log('[Tray] Using dev template icon:', devTemplatePath);
          }
        }
      } catch (e) {
        console.error('[Tray] Error checking for icon:', e);
      }
    }

    const trayIcon = nativeImage.createFromPath(iconToUse).resize({ width: 16, height: 16 });
    // IMPORTANT: specific template settings for macOS if needed, but 'Template' in name usually suffices
    trayIcon.setTemplateImage(iconToUse.endsWith('Template.png'));

    this.tray = new Tray(trayIcon)

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show Ghost Writer',
        click: () => {
          this.centerAndShowWindow()
        }
      },
      {
        label: 'Toggle Window',
        click: () => {
          this.toggleMainWindow()
        }
      },
      {
        type: 'separator'
      },
      {
        label: 'Take Screenshot (Cmd+H)',
        click: async () => {
          try {
            const screenshotPath = await this.takeScreenshot()
            const preview = await this.getImagePreview(screenshotPath)
            const mainWindow = this.getMainWindow()
            if (mainWindow) {
              mainWindow.webContents.send("screenshot-taken", {
                path: screenshotPath,
                preview
              })
            }
          } catch (error) {
            console.error("Error taking screenshot from tray:", error)
          }
        }
      },
      {
        type: 'separator'
      },
      {
        label: 'Quit',
        accelerator: 'Command+Q',
        click: () => {
          app.quit()
        }
      }
    ])

    this.tray.setToolTip('Ghost Writer - Press Cmd+Shift+Space to show')
    this.tray.setContextMenu(contextMenu)

    // Double-click to show window
    this.tray.on('double-click', () => {
      this.centerAndShowWindow()
    })
  }

  public hideTray(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }

  public setHasDebugged(value: boolean): void {
    this.hasDebugged = value
  }

  public getHasDebugged(): boolean {
    return this.hasDebugged
  }

  public setUndetectable(state: boolean): void {
    this.isUndetectable = state
    this.windowHelper.setContentProtection(state)
    this.settingsWindowHelper.setContentProtection(state)

    // Broadcast change to all relevant windows
    const mainWindow = this.windowHelper.getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('undetectable-changed', state);
    }

    // Also broadcast to launcher explicitly if it exists and isn't the main window
    const launcher = this.windowHelper.getLauncherWindow();
    if (launcher && !launcher.isDestroyed() && launcher !== mainWindow) {
      launcher.webContents.send('undetectable-changed', state);
    }

    const settingsWin = this.settingsWindowHelper.getSettingsWindow();
    if (settingsWin && !settingsWin.isDestroyed()) {
      settingsWin.webContents.send('undetectable-changed', state);
    }

    // --- STEALTH MODE LOGIC ---
    // If True (Stealth Mode): Hide Dock, Hide Tray (or standard 'stealth' behavior)
    // If False (Visible Mode): Show Dock, Show Tray

    // Windows/macOS stealth mode
    if (state) {
      if (process.platform === 'darwin') {
        app.dock?.hide();
      }
      this.hideTray();
      this._applyDisguise(this.disguiseMode);
    } else {
      if (process.platform === 'darwin') {
        app.dock?.show();
        if (!app.isPackaged) {
          app.dock?.setIcon(path.resolve(__dirname, '../assets/icons/mac/icon.png'));
        }
      }
      this.showTray();
      this._applyDisguise('none');
    }
  }

  public getUndetectable(): boolean {
    return this.isUndetectable
  }

  public setDisguise(mode: 'terminal' | 'settings' | 'activity' | 'none'): void {
    this.disguiseMode = mode;

    // Only apply the disguise if we are currently in undetectable mode
    // Otherwise, just save the preference for later
    if (this.isUndetectable) {
      this._applyDisguise(mode);
    }
  }

  private _applyDisguise(mode: 'terminal' | 'settings' | 'activity' | 'none'): void {
    let appName = "Ghost Writer";
    let iconPath = "";
    const defaultIconPath = process.platform === 'win32'
      ? (app.isPackaged
        ? path.join(process.resourcesPath, "assets/icons/win/icon.ico")
        : path.resolve(__dirname, "../../assets/icons/win/icon.ico"))
      : (app.isPackaged
        ? path.join(process.resourcesPath, "assets/icons/mac/icon.png")
        : path.resolve(__dirname, "../../assets/icons/mac/icon.png"));

    switch (mode) {
      case 'terminal':
        appName = "Terminal ";
        iconPath = app.isPackaged
          ? path.join(process.resourcesPath, "assets/fakeicon/terminal.png")
          : path.resolve(__dirname, "../../assets/fakeicon/terminal.png");
        break;
      case 'settings':
        appName = "System Settings ";
        iconPath = app.isPackaged
          ? path.join(process.resourcesPath, "assets/fakeicon/settings.png")
          : path.resolve(__dirname, "../../assets/fakeicon/settings.png");
        break;
      case 'activity':
        appName = "Activity Monitor ";
        iconPath = app.isPackaged
          ? path.join(process.resourcesPath, "assets/fakeicon/activity.png")
          : path.resolve(__dirname, "../../assets/fakeicon/activity.png");
        break;
      case 'none':
        appName = "Ghost Writer";
        iconPath = defaultIconPath;
        break;
    }

    console.log(`[AppState] Applying disguise: ${mode} (${appName})`);

    // 1. Update process title and App Name (affects Task Manager / Taskbar)
    // DANGER: Changing process identity at runtime on macOS causes phantom dock icons!
    if (process.platform === 'win32') {
      process.title = appName;
      app.setName(appName);
      // 3. Update App User Model ID (Windows Taskbar grouping)
      app.setAppUserModelId(`${appName.trim()}-${mode}`);
    }

    // 4. Update Icons
    if (fs.existsSync(iconPath)) {
      const image = nativeImage.createFromPath(iconPath);

      // Windows: Update all window icons
      this.windowHelper.getLauncherWindow()?.setIcon(image);
      this.windowHelper.getOverlayWindow()?.setIcon(image);
      this.settingsWindowHelper.getSettingsWindow()?.setIcon(image);
    } else {
      console.warn(`[AppState] Disguise icon not found: ${iconPath}`);
    }

    // 5. Update Window Titles
    const launcher = this.windowHelper.getLauncherWindow();
    if (launcher && !launcher.isDestroyed()) {
      launcher.setTitle(appName.trim());
      launcher.webContents.send('disguise-changed', mode);
    }

    const overlay = this.windowHelper.getOverlayWindow();
    if (overlay && !overlay.isDestroyed()) {
      overlay.setTitle(appName.trim());
      overlay.webContents.send('disguise-changed', mode);
    }

    const settingsWin = this.settingsWindowHelper.getSettingsWindow();
    if (settingsWin && !settingsWin.isDestroyed()) {
      settingsWin.setTitle(appName.trim());
      settingsWin.webContents.send('disguise-changed', mode);
    }

    // Force periodic updates as seen in reference to ensure it sticks
    const forceUpdate = () => {
      if (process.platform === 'win32') {
        process.title = appName;
        app.setName(appName);
      }
    };

    setTimeout(forceUpdate, 200);
    setTimeout(forceUpdate, 1000);
    setTimeout(forceUpdate, 5000);
  }

  public getDisguise(): string {
    return this.disguiseMode;
  }
}

// Application initialization


let appInitialized = false;

async function initializeApp() {
  if (appInitialized) {
    console.log('[Main] App already initialized, skipping');
    return;
  }
  appInitialized = true;

  // CRITICAL: Set app name BEFORE any paths are resolved or services initialized
  app.setName(APP_NAME);
  console.log('[Main] App Name set to:', app.getName());

  console.log('[Main] initializeApp called at', new Date().toISOString());
  await app.whenReady()
  
  if (process.platform === 'darwin' && !app.isPackaged) {
    // Force the Dock icon in dev mode to show our new icon instead of Electron's
    // macOS dock.setIcon in dev mode prefers PNG over ICNS
    app.dock.setIcon(path.resolve(__dirname, '../assets/icons/mac/icon.png'));
  }

  // 1. Initialize Core Services (Singleton init)
  const { CredentialsManager } = require('./services/CredentialsManager');
  CredentialsManager.getInstance().init();

  const appState = AppState.getInstance()

  // 2. Load stored credentials into helpers early
  await appState.processingHelper.loadStoredCredentials();

  // 3. Initialize IPC handlers 
  initializeIpcHandlers(appState)

  // 4. Setup App Environment

  // Anonymous install ping - one-time, non-blocking
  const { sendAnonymousInstallPing } = require('./services/InstallPingManager');
  sendAnonymousInstallPing();

  // Load stored Google Service Account path (for Speech-to-Text)
  const storedServiceAccountPath = CredentialsManager.getInstance().getGoogleServiceAccountPath();
  if (storedServiceAccountPath) {
    console.log("[Init] Loading stored Google Service Account path");
    appState.updateGoogleCredentials(storedServiceAccountPath);
  }

  console.log("App is ready")

  // 5. UI and System Integration
  appState.createWindow()

  // Apply initial stealth state based on isUndetectable setting
  if (!appState.getUndetectable()) {
    appState.showTray();
  }

  // Register global shortcuts
  appState.shortcutsHelper.registerGlobalShortcuts()

  // Pre-create settings window in background 
  appState.settingsWindowHelper.preloadWindow()

  // Initialize CalendarManager
  try {
    const { CalendarManager, isGoogleCalendarConfigured } = require('./services/CalendarManager');
    if (isGoogleCalendarConfigured()) {
      const calMgr = CalendarManager.getInstance();
      calMgr.init();

      calMgr.on('start-meeting-requested', (event: any) => {
        console.log('[Main] Start meeting requested from calendar notification', event);
        appState.centerAndShowWindow();
        appState.startMeeting({
          title: event.title,
          calendarEventId: event.id,
          source: 'calendar'
        });
      });

      calMgr.on('open-requested', () => {
        appState.centerAndShowWindow();
      });

      console.log('[Main] CalendarManager initialized');
    } else {
      console.log('[Main] Calendar integration disabled (no Google OAuth credentials configured)');
    }
  } catch (e) {
    console.error('[Main] Failed to initialize CalendarManager:', e);
  }

  // Recover unprocessed meetings (persistence check)
  appState.getIntelligenceManager().recoverUnprocessedMeetings().catch(err => {
    console.error('[Main] Failed to recover unprocessed meetings:', err);
  });


  app.on("activate", () => {
    console.log("App activated")
    if (appState.getMainWindow() === null) {
      appState.createWindow()
    }
  })

  // Quit when all windows are closed
  app.on("window-all-closed", () => {
    app.quit()
  })



  app.commandLine.appendSwitch("disable-background-timer-throttling")
}

if (gotSingleInstanceLock) {
  app.on('second-instance', () => {
    try {
      const appState = AppState.getInstance();
      appState.centerAndShowWindow();
    } catch {
      // Ignore until the first instance is fully initialized.
    }
  });

  // Start the application
  initializeApp().catch(console.error);
}

// Ensure meeting is ended and saved when app is quitting
app.on('will-quit', async (event) => {
  const appState = AppState.getInstance();
  if (appState.getIsMeetingActive()) {
    console.log('[Main] App quitting during active meeting. Triggering save...');
    // We don't preventDefault here because endMeeting should be fast enough 
    // to snapshot data. However, for full reliability of generated summaries,
    // we might want to ensure processAndSaveMeeting finishes.
    // For now, at least snapshot the transcript.
    await appState.endMeeting();
  }
});
