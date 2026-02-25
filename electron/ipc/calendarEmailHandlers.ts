// Calendar & Email IPC Handlers
// Handles calendar integration, follow-up email generation, and email utilities

import { ipcMain, shell } from "electron";
import type { AppState } from "../main";

export function registerCalendarEmailHandlers(appState: AppState): void {
  // ==========================================
  // Calendar Integration
  // ==========================================

  ipcMain.handle("calendar-connect", async () => {
    try {
      const { CalendarManager } = require('../services/CalendarManager');
      await CalendarManager.getInstance().startAuthFlow();
      return { success: true };
    } catch (error: any) {
      console.error("Calendar auth error:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("calendar-disconnect", async () => {
    const { CalendarManager } = require('../services/CalendarManager');
    await CalendarManager.getInstance().disconnect();
    return { success: true };
  });

  ipcMain.handle("get-calendar-status", async () => {
    const { CalendarManager } = require('../services/CalendarManager');
    return CalendarManager.getInstance().getConnectionStatus();
  });

  ipcMain.handle("get-upcoming-events", async () => {
    const { CalendarManager } = require('../services/CalendarManager');
    return CalendarManager.getInstance().getUpcomingEvents();
  });

  ipcMain.handle("calendar-refresh", async () => {
    const { CalendarManager } = require('../services/CalendarManager');
    await CalendarManager.getInstance().refreshState();
    return { success: true };
  });

  // ==========================================
  // Follow-up Email Generation
  // ==========================================

  ipcMain.handle("generate-followup-email", async (_, input: any) => {
    try {
      const { FOLLOWUP_EMAIL_PROMPT, GROQ_FOLLOWUP_EMAIL_PROMPT } = require('../llm/prompts');
      const { buildFollowUpEmailPromptInput } = require('../utils/emailUtils');

      const llmHelper = appState.processingHelper.getLLMHelper();

      const contextString = buildFollowUpEmailPromptInput(input);

      const geminiPrompt = `${FOLLOWUP_EMAIL_PROMPT}\n\nMEETING DETAILS:\n${contextString}`;
      const groqPrompt = `${GROQ_FOLLOWUP_EMAIL_PROMPT}\n\nMEETING DETAILS:\n${contextString}`;

      const emailBody = await llmHelper.chatWithGemini(geminiPrompt, undefined, undefined, true, groqPrompt);

      return emailBody;
    } catch (error: any) {
      console.error("Error generating follow-up email:", error);
      throw error;
    }
  });

  ipcMain.handle("extract-emails-from-transcript", async (_, transcript: Array<{ text: string }>) => {
    try {
      const { extractEmailsFromTranscript } = require('../utils/emailUtils');
      return extractEmailsFromTranscript(transcript);
    } catch (error: any) {
      console.error("Error extracting emails:", error);
      return [];
    }
  });

  ipcMain.handle("get-calendar-attendees", async (_, eventId: string) => {
    try {
      const { CalendarManager } = require('../services/CalendarManager');
      const cm = CalendarManager.getInstance();

      const events = await cm.getUpcomingEvents();
      const event = events?.find((e: any) => e.id === eventId);

      if (event && event.attendees) {
        return event.attendees.map((a: any) => ({
          email: a.email,
          name: a.displayName || a.email?.split('@')[0] || ''
        })).filter((a: any) => a.email);
      }

      return [];
    } catch (error: any) {
      console.error("Error getting calendar attendees:", error);
      return [];
    }
  });

  ipcMain.handle("open-mailto", async (_, { to, subject, body }: { to: string; subject: string; body: string }) => {
    try {
      const { buildMailtoLink } = require('../utils/emailUtils');
      const mailtoUrl = buildMailtoLink(to, subject, body);
      await shell.openExternal(mailtoUrl);
      return { success: true };
    } catch (error: any) {
      console.error("Error opening mailto:", error);
      return { success: false, error: error.message };
    }
  });
}

