// Intelligence Mode IPC Handlers
// Handles all AI intelligence modes: assist, what-to-say, follow-up, recap, manual questions

import { ipcMain } from "electron";
import type { AppState } from "../main";
import { rateLimiter } from "../utils/rateLimiter";

export function registerIntelligenceHandlers(appState: AppState): void {
  // MODE 1: Assist (Passive observation)
  ipcMain.handle("generate-assist", async () => {
    return rateLimiter.wrap('generate-assist', async () => {
      const intelligenceManager = appState.getIntelligenceManager();
      const insight = await intelligenceManager.runAssistMode();
      return { insight };
    });
  });

  // MODE 2: What Should I Say (Primary auto-answer)
  ipcMain.handle("generate-what-to-say", async (_, question?: string, imagePath?: string) => {
    return rateLimiter.wrap('generate-what-to-say', async () => {
      const intelligenceManager = appState.getIntelligenceManager();
      const answer = await intelligenceManager.runWhatShouldISay(question, 0.8, imagePath);
      return { answer, question: question || 'inferred from context' };
    }).catch((error: any) => {
      // Return graceful fallback for rate limit or other errors
      console.warn(`[IPC] generate-what-to-say: ${error.message}`);
      return { question: question || 'unknown' };
    });
  });

  // MODE 3: Follow-Up (Refinement)
  ipcMain.handle("generate-follow-up", async (_, intent: string, userRequest?: string) => {
    return rateLimiter.wrap('generate-follow-up', async () => {
      const intelligenceManager = appState.getIntelligenceManager();
      const refined = await intelligenceManager.runFollowUp(intent, userRequest);
      return { refined, intent };
    });
  });

  // MODE 4: Recap (Summary)
  ipcMain.handle("generate-recap", async () => {
    return rateLimiter.wrap('generate-recap', async () => {
      const intelligenceManager = appState.getIntelligenceManager();
      const summary = await intelligenceManager.runRecap();
      return { summary };
    });
  });

  // MODE 6: Follow-Up Questions
  ipcMain.handle("generate-follow-up-questions", async () => {
    return rateLimiter.wrap('generate-follow-up-questions', async () => {
      const intelligenceManager = appState.getIntelligenceManager();
      const questions = await intelligenceManager.runFollowUpQuestions();
      return { questions };
    });
  });

  // MODE 5: Manual Answer (Fallback)
  ipcMain.handle("submit-manual-question", async (_, question: string) => {
    return rateLimiter.wrap('submit-manual-question', async () => {
      const intelligenceManager = appState.getIntelligenceManager();
      const answer = await intelligenceManager.runManualAnswer(question);
      return { answer, question };
    });
  });

  // Get current intelligence context
  ipcMain.handle("get-intelligence-context", async () => {
    try {
      const intelligenceManager = appState.getIntelligenceManager();
      return {
        context: intelligenceManager.getFormattedContext(),
        lastAssistantMessage: intelligenceManager.getLastAssistantMessage(),
        activeMode: intelligenceManager.getActiveMode()
      };
    } catch (error: any) {
      throw error;
    }
  });

  // Reset intelligence state
  ipcMain.handle("reset-intelligence", async () => {
    try {
      const intelligenceManager = appState.getIntelligenceManager();
      intelligenceManager.reset();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}

