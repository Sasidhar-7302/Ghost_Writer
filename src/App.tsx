import React, { useState, useEffect } from "react" // forcing refresh
import { QueryClient, QueryClientProvider } from "react-query"
import { ToastProvider, ToastViewport } from "./components/ui/toast"
import GhostWriterInterface from "./components/GhostWriterInterface"
import SettingsPopup from "./components/SettingsPopup" // Keeping for legacy/specific window support if needed
import Launcher from "./components/Launcher"
import SettingsOverlay from "./components/SettingsOverlay"
import StartupSequence from "./components/StartupSequence"
import SetupWizard from "./components/SetupWizard"
import ModeSelectionModal from "./components/ModeSelectionModal"
import { AnimatePresence, motion } from "framer-motion"
import UpdateBanner from "./components/UpdateBanner"
import { analytics } from "./lib/analytics/analytics.service"
import { ErrorBoundary } from "./components/ErrorBoundary"

const queryClient = new QueryClient()

const App: React.FC = () => {
  const isSettingsWindow = new URLSearchParams(window.location.search).get('window') === 'settings';
  const isLauncherWindow = new URLSearchParams(window.location.search).get('window') === 'launcher';
  const isOverlayWindow = new URLSearchParams(window.location.search).get('window') === 'overlay';

  // Default to launcher if not specified (dev mode safety)
  const isDefault = !isSettingsWindow && !isOverlayWindow;

  // Initialize Analytics
  useEffect(() => {
    // Only init if we are in a main window context to avoid duplicate events from helper windows
    // Actually, we probably want to track app open from the main entry point.
    // Let's protect initialization to ensure single run per window.
    // The service handles single-init, but let's be thoughtful about WHICH window tracks "App Open".
    // Launcher is the main entry. Overlay is the "Assistant".

    analytics.initAnalytics();

    if (isLauncherWindow || isDefault) {
      analytics.trackAppOpen();
    }

    if (isOverlayWindow) {
      analytics.trackAssistantStart();
    }

    // Cleanup / Session End
    const handleUnload = () => {
      if (isOverlayWindow) {
        analytics.trackAssistantStop();
      }
      if (isLauncherWindow || isDefault) {
        analytics.trackAppClose();
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [isLauncherWindow, isOverlayWindow, isDefault]);

  // State
  const [showStartup, setShowStartup] = useState(true);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showModeSelection, setShowModeSelection] = useState(false);

  // Check for first run setup
  useEffect(() => {
    if (!showStartup) {
      const setupComplete = localStorage.getItem('setupComplete');
      if (!setupComplete && isLauncherWindow) {
        setShowSetupWizard(true);
      }
    }
  }, [showStartup, isLauncherWindow]);

  // Handlers
  const handleStartMeetingTrigger = () => {
    setShowModeSelection(true);
  };

  const handleStartMeeting = async () => {
    setShowModeSelection(false);
    try {
      const inputDeviceId = localStorage.getItem('preferredInputDeviceId');
      let outputDeviceId = localStorage.getItem('preferredOutputDeviceId');
      const useLegacyAudio = localStorage.getItem('useLegacyAudioBackend') === 'true';

      // Default to standard system audio
      outputDeviceId = "default";

      const result = await window.electronAPI.startMeeting({
        audio: { inputDeviceId, outputDeviceId }
      });
      if (result.success) {
        analytics.trackMeetingStarted();
        // Switch to Overlay Mode via IPC
        // The main process handles window switching, but we can reinforce it or just trust main.
        // Actually, main process startMeeting triggers nothing UI-wise unless we tell it to switch window
        // But we configured main.ts to not auto-switch?
        // Let's explicitly request mode change.
        await window.electronAPI.setWindowMode('overlay');
      } else {
        console.error("Failed to start meeting:", result.error);
      }
    } catch (err) {
      console.error("Failed to start meeting:", err);
    }
  };

  const handleEndMeeting = async () => {
    console.log("[App.tsx] handleEndMeeting triggered");
    analytics.trackMeetingEnded();
    try {
      await window.electronAPI.endMeeting();
      console.log("[App.tsx] endMeeting IPC completed");
      // Switch back to Native Launcher Mode
      await window.electronAPI.setWindowMode('launcher');
    } catch (err) {
      console.error("Failed to end meeting:", err);
      window.electronAPI.setWindowMode('launcher');
    }
  };

  // Render Logic
  if (isSettingsWindow) {
    return (
      <ErrorBoundary>
        <div className="h-full min-h-0 w-full">
          <QueryClientProvider client={queryClient}>
            <ToastProvider>
              <SettingsPopup />
              <ToastViewport />
            </ToastProvider>
          </QueryClientProvider>
        </div>
      </ErrorBoundary>
    );
  }

  // --- OVERLAY WINDOW (Meeting Interface) ---
  if (isOverlayWindow) {
    return (
      <ErrorBoundary>
        <div className="w-full relative bg-transparent">
          <QueryClientProvider client={queryClient}>
            <ToastProvider>
              <GhostWriterInterface
                onEndMeeting={handleEndMeeting}
              />
              <ToastViewport />
            </ToastProvider>
          </QueryClientProvider>
        </div>
      </ErrorBoundary>
    );
  }

  // --- LAUNCHER WINDOW (Default) ---
  // Renders if window=launcher OR no param
  return (
    <ErrorBoundary>
      <div className="h-full min-h-0 w-full relative">
        <AnimatePresence>
          {showStartup ? (
            <motion.div
              key="startup"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 1.1, pointerEvents: "none", transition: { duration: 0.6, ease: "easeInOut" } }}
            >
              <StartupSequence onComplete={() => setShowStartup(false)} />
            </motion.div>
          ) : showSetupWizard ? (
            <SetupWizard onComplete={() => setShowSetupWizard(false)} />
          ) : (
            <motion.div
              key="main"
              className="h-full w-full"
              initial={{ opacity: 0, scale: 0.98, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{
                duration: 0.8,
                ease: [0.19, 1, 0.22, 1],
                delay: 0.1
              }}
            >
              <QueryClientProvider client={queryClient}>
                <ToastProvider>
                  <Launcher
                    onStartMeeting={handleStartMeetingTrigger}
                    onOpenSettings={() => setIsSettingsOpen(true)}
                  />
                  <ModeSelectionModal 
                    isOpen={showModeSelection}
                    onClose={() => setShowModeSelection(false)}
                    onConfirm={handleStartMeeting}
                  />
                  <SettingsOverlay
                    isOpen={isSettingsOpen}
                    onClose={() => setIsSettingsOpen(false)}
                  />
                  <ToastViewport />
                </ToastProvider>
              </QueryClientProvider>
            </motion.div>
          )}
        </AnimatePresence>
        <UpdateBanner />
      </div>
    </ErrorBoundary>
  )
}

export default App
