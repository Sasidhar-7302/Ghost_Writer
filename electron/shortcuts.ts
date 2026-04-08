import { app, BrowserWindow, globalShortcut } from "electron";
import { AppState } from "./main";

type ShortcutDefinition = {
  accelerator: string;
  label: string;
  handler: () => void | Promise<void>;
};

export class ShortcutsHelper {
  private appState: AppState;
  private activeScreenshotShortcut = "CommandOrControl+H";
  private hasRegisteredShortcuts = false;
  private retryTimer: NodeJS.Timeout | null = null;

  constructor(appState: AppState) {
    this.appState = appState;

    app.on("will-quit", () => {
      if (this.retryTimer) {
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
      }
      globalShortcut.unregisterAll();
      this.hasRegisteredShortcuts = false;
    });
  }

  public getActiveScreenshotShortcut(): string {
    return this.activeScreenshotShortcut;
  }

  public registerGlobalShortcuts(): void {
    if (this.hasRegisteredShortcuts) {
      return;
    }

    if (!app.isReady()) {
      app.whenReady().then(() => this.registerGlobalShortcuts());
      return;
    }

    this.hasRegisteredShortcuts = true;
    this.performRegistration(false);
  }

  private performRegistration(logFailures: boolean): void {
    globalShortcut.unregisterAll();
    const failedLabels: string[] = [];

    const registerShortcut = ({
      accelerator,
      handler,
      label,
    }: ShortcutDefinition): boolean => {
      try {
        globalShortcut.register(accelerator, handler);
      } catch (error) {
        if (logFailures) {
          console.warn(`[Shortcuts] Error registering ${label} (${accelerator})`, error);
        }
      }

      const registered = globalShortcut.isRegistered(accelerator);
      if (!registered && logFailures) {
        console.warn(`[Shortcuts] Failed to register ${label} (${accelerator})`);
      }
      if (!registered) {
        failedLabels.push(label);
      }

      return registered;
    };

    this.registerPrimaryShortcuts(registerShortcut, logFailures);

    if (failedLabels.length > 0 && !logFailures) {
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.performRegistration(true);
      }, 1500);
    }
  }

  private registerPrimaryShortcuts(
    registerShortcut: (definition: ShortcutDefinition) => boolean,
    logFailures: boolean
  ): void {
    registerShortcut({
      accelerator: "CommandOrControl+Shift+Space",
      handler: () => this.appState.centerAndShowWindow(),
      label: "show window",
    });

    this.registerScreenshotShortcuts(registerShortcut, logFailures);

    registerShortcut({
      accelerator: "CommandOrControl+Enter",
      handler: async () => {
        await this.appState.processingHelper.processScreenshots();
      },
      label: "process screenshots",
    });

    registerShortcut({
      accelerator: "CommandOrControl+R",
      handler: () => this.handleResetSession(),
      label: "reset session",
    });

    registerShortcut({
      accelerator: "CommandOrControl+Left",
      handler: () => this.appState.moveWindowLeft(),
      label: "move window left",
    });

    registerShortcut({
      accelerator: "CommandOrControl+Right",
      handler: () => this.appState.moveWindowRight(),
      label: "move window right",
    });

    registerShortcut({
      accelerator: "CommandOrControl+Down",
      handler: () => this.appState.moveWindowDown(),
      label: "move window down",
    });

    registerShortcut({
      accelerator: "CommandOrControl+Up",
      handler: () => this.appState.moveWindowUp(),
      label: "move window up",
    });

    registerShortcut({
      accelerator: "CommandOrControl+B",
      handler: () => this.handleToggleVisibility(),
      label: "toggle visibility",
    });

    registerShortcut({
      accelerator: "Alt+G",
      handler: () => this.handleToggleVisibility(),
      label: "toggle visibility alias",
    });

    registerShortcut({
      accelerator: "F8",
      handler: async () => {
        await this.handleQuickAnswer();
      },
      label: "quick answer",
    });

    registerShortcut({
      accelerator: "CommandOrControl+J",
      handler: async () => {
        await this.handleQuickAnswer();
      },
      label: "quick answer alias",
    });

    registerShortcut({
      accelerator: "F9",
      handler: async () => {
        if (this.appState.getIsMeetingActive()) {
          await this.appState.endMeeting();
        } else {
          await this.appState.startMeeting();
        }
      },
      label: "toggle meeting",
    });

    registerShortcut({
      accelerator: "Alt+C",
      handler: () => this.handleResetSession(),
      label: "reset session alias",
    });
  }

  private registerScreenshotShortcuts(
    registerShortcut: (definition: ShortcutDefinition) => boolean,
    logFailures: boolean
  ): void {
    const screenshotHandler = async () => {
      console.log("[Shortcuts] Screenshot shortcut pressed - taking screenshot...");
      try {
        const screenshotPath = await this.appState.takeScreenshot();
        console.log("[Shortcuts] Screenshot saved:", screenshotPath);
        const preview = await this.appState.getImagePreview(screenshotPath);

        await new Promise((resolve) => setTimeout(resolve, 150));

        const windowHelper = this.appState.getWindowHelper();
        const windows = [
          windowHelper.getLauncherWindow(),
          windowHelper.getOverlayWindow(),
        ];

        let sent = 0;
        for (const window of windows) {
          if (window && !window.isDestroyed()) {
            window.webContents.send("screenshot-taken", { path: screenshotPath, preview });
            sent++;
          }
        }

        console.log(`[Shortcuts] screenshot-taken event sent to ${sent} window(s)`);
      } catch (error) {
        console.error("[Shortcuts] Error capturing screenshot:", error);
      }
    };

    const family = [
      "CommandOrControl+H",
      "CommandOrControl+Shift+H",
      "CommandOrControl+Alt+H",
    ];

    for (const accelerator of family) {
      if (registerShortcut({ accelerator, handler: screenshotHandler, label: "screenshot" })) {
        this.activeScreenshotShortcut = accelerator;
        if (accelerator === "CommandOrControl+H") {
          console.log("[Shortcuts] Ctrl+H registered as screenshot shortcut");
        } else if (logFailures) {
          console.warn(`[Shortcuts] Ctrl+H unavailable - registered ${accelerator} instead`);
        }
        return;
      }
    }

    this.activeScreenshotShortcut = "Unbound";
    if (logFailures) {
      console.error("[Shortcuts] Failed to register any screenshot shortcut (Ctrl+H family).");
    }
  }

  private async handleQuickAnswer(): Promise<void> {
    const windowHelper = this.appState.getWindowHelper();
    const candidateWindows = [
      windowHelper.getMainWindow(),
      windowHelper.getLauncherWindow(),
      windowHelper.getOverlayWindow(),
    ].filter((window, index, windows): window is BrowserWindow => {
      return !!window && !window.isDestroyed() && windows.indexOf(window) === index;
    });

    for (const window of candidateWindows) {
      window.webContents.send("quick-answer");
    }

    try {
      await this.appState.getIntelligenceManager().runWhatShouldISay();
    } catch (error) {
      console.error("[Shortcuts] Quick answer failed:", error);
    }
  }

  private handleToggleVisibility(): void {
    const windowHelper = this.appState.getWindowHelper();
    const overlayWindow = windowHelper.getOverlayWindow();
    const launcherWindow = windowHelper.getLauncherWindow();
    const currentMode = windowHelper.getCurrentWindowMode();
    const focusedWindow = BrowserWindow.getFocusedWindow();

    if (focusedWindow && launcherWindow && focusedWindow.id === launcherWindow.id) {
      launcherWindow.hide();
      return;
    }

    if (focusedWindow && overlayWindow && focusedWindow.id === overlayWindow.id) {
      overlayWindow.webContents.send("toggle-expand");
      return;
    }

    if (currentMode === "overlay" && overlayWindow) {
      if (!overlayWindow.isVisible()) {
        overlayWindow.show();
        overlayWindow.focus();
      }
      overlayWindow.webContents.send("toggle-expand");
    } else if (launcherWindow) {
      if (launcherWindow.isVisible()) {
        launcherWindow.hide();
      } else {
        launcherWindow.show();
        launcherWindow.focus();
      }
    }
  }

  private handleResetSession(): void {
    this.appState.processingHelper.cancelOngoingRequests();
    this.appState.clearQueues();
    this.appState.setView("queue");

    const mainWindow = this.appState.getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("reset-view");
    }
  }
}
