import { globalShortcut, app, BrowserWindow } from "electron"
import { AppState } from "./main" // Adjust the import path if necessary

export class ShortcutsHelper {
  private appState: AppState

  constructor(appState: AppState) {
    this.appState = appState
  }

  public registerGlobalShortcuts(): void {
    // Add global shortcut to show/center window
    globalShortcut.register("CommandOrControl+Shift+Space", () => {
      // console.log("Show/Center window shortcut pressed...")
      this.appState.centerAndShowWindow()
    })

    globalShortcut.register("CommandOrControl+H", async () => {
      const mainWindow = this.appState.getMainWindow()
      if (mainWindow) {
        // Taking screenshot
        try {
          const screenshotPath = await this.appState.takeScreenshot()
          // Screenshot captured
          const preview = await this.appState.getImagePreview(screenshotPath)
          // Preview generated
          mainWindow.webContents.send("screenshot-taken", {
            path: screenshotPath,
            preview
          })
        } catch (error) {
          console.error("[Shortcuts] Error capturing screenshot:", error)
        }
      } else {
        console.warn("[Shortcuts] Ctrl+H pressed, but no mainWindow found!")
      }
    })

    // Selective screenshot (latent context)
    globalShortcut.register("CommandOrControl+Shift+H", async () => {
      const mainWindow = this.appState.getMainWindow()
      if (mainWindow) {
        try {
          const screenshotPath = await this.appState.takeSelectiveScreenshot()
          const preview = await this.appState.getImagePreview(screenshotPath)
          // Emitting 'screenshot-attached' means NO auto-analysis
          mainWindow.webContents.send("screenshot-attached", {
            path: screenshotPath,
            preview
          })
        } catch (error) {
          // console.error("Error capturing selective screenshot:", error)
        }
      }
    })

    globalShortcut.register("CommandOrControl+Enter", async () => {
      await this.appState.processingHelper.processScreenshots()
    })

    globalShortcut.register("CommandOrControl+R", () => {
      // console.log(
      //   "Command + R pressed. Canceling requests and resetting queues..."
      // )

      // Cancel ongoing API requests
      this.appState.processingHelper.cancelOngoingRequests()

      // Clear both screenshot queues
      this.appState.clearQueues()

      // console.log("Cleared queues.")

      // Update the view state to 'queue'
      this.appState.setView("queue")

      // Notify renderer process to switch view to 'queue'
      const mainWindow = this.appState.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("reset-view")
      }
    })

    // New shortcuts for moving the window
    globalShortcut.register("CommandOrControl+Left", () => {
      // console.log("Command/Ctrl + Left pressed. Moving window left.")
      this.appState.moveWindowLeft()
    })

    globalShortcut.register("CommandOrControl+Right", () => {
      // console.log("Command/Ctrl + Right pressed. Moving window right.")
      this.appState.moveWindowRight()
    })
    globalShortcut.register("CommandOrControl+Down", () => {
      // console.log("Command/Ctrl + down pressed. Moving window down.")
      this.appState.moveWindowDown()
    })
    globalShortcut.register("CommandOrControl+Up", () => {
      // console.log("Command/Ctrl + Up pressed. Moving window Up.")
      this.appState.moveWindowUp()
    })

    globalShortcut.register("CommandOrControl+B", () => {
      this.handleToggleVisibility();
    });

    // Alt+G: Alias for Toggle Visibility
    globalShortcut.register("Alt+G", () => {
      this.handleToggleVisibility();
    });

    // F8: "What to answer" / Ask AI
    globalShortcut.register("F8", async () => {
      await this.handleQuickAnswer();
    });

    // Ctrl+J: Legacy alias for Quick Answer
    globalShortcut.register("CommandOrControl+J", async () => {
      await this.handleQuickAnswer();
    });

    // F9: Start/Stop transcription (Toggle Meeting)
    globalShortcut.register("F9", async () => {
      if (this.appState.getIsMeetingActive()) {
        await this.appState.endMeeting();
      } else {
        await this.appState.startMeeting();
      }
    });

    // Alt+C: Reset/Cancel (Alias for Cmd+R)
    globalShortcut.register("Alt+C", () => {
      this.handleResetSession();
    });

    // Unregister shortcuts when quitting
    app.on("will-quit", () => {
      globalShortcut.unregisterAll()
    })
  }

  private async handleQuickAnswer(): Promise<void> {
    const overlayWindow = this.appState.getWindowHelper().getOverlayWindow();
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('quick-answer');
    }
    try {
      await this.appState.getIntelligenceManager().runWhatShouldISay();
    } catch (err) {
      console.error('[Shortcuts] Quick answer failed:', err);
    }
  }

  private handleToggleVisibility(): void {
    const windowHelper = this.appState.getWindowHelper()
    const overlayWindow = windowHelper.getOverlayWindow()
    const launcherWindow = windowHelper.getLauncherWindow()
    const currentMode = windowHelper.getCurrentWindowMode()
    const focusedWindow = BrowserWindow.getFocusedWindow()

    if (focusedWindow && launcherWindow && focusedWindow.id === launcherWindow.id) {
      launcherWindow.hide()
      return
    }

    if (focusedWindow && overlayWindow && focusedWindow.id === overlayWindow.id) {
      overlayWindow.webContents.send('toggle-expand')
      return
    }

    if (currentMode === 'overlay' && overlayWindow) {
      overlayWindow.webContents.send('toggle-expand')
    } else if (launcherWindow) {
      if (launcherWindow.isVisible()) {
        launcherWindow.hide()
      } else {
        launcherWindow.show()
        launcherWindow.focus()
      }
    }
  }

  private handleResetSession(): void {
    this.appState.processingHelper.cancelOngoingRequests()
    this.appState.clearQueues()
    this.appState.setView("queue")
    const mainWindow = this.appState.getMainWindow()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("reset-view")
    }
  }
}
