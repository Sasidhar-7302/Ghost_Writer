// Calendar & Email IPC Handlers
// Handles calendar integration, follow-up email generation, and email utilities

import { ipcMain, shell } from "electron";
import type { AppState } from "../main";

function getCalendarModule() {
  return require('../services/CalendarManager') as {
    CalendarManager: { getInstance: () => any };
    isGoogleCalendarConfigured: () => boolean;
  };
}

function isCalendarEnabled(): boolean {
  return getCalendarModule().isGoogleCalendarConfigured();
}

export function registerCalendarEmailHandlers(appState: AppState): void {
  // ==========================================
  // Calendar Integration
  // ==========================================

  ipcMain.handle("calendar-connect", async () => {
    try {
      if (!isCalendarEnabled()) {
        return { success: false, error: 'Calendar integration is disabled until Google OAuth credentials are configured.' };
      }
      const { CalendarManager } = getCalendarModule();
      await CalendarManager.getInstance().startAuthFlow();
      return { success: true };
    } catch (error: any) {
      console.error("Calendar auth error:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("calendar-disconnect", async () => {
    if (!isCalendarEnabled()) {
      return { success: true };
    }
    const { CalendarManager } = getCalendarModule();
    await CalendarManager.getInstance().disconnect();
    return { success: true };
  });

  ipcMain.handle("get-calendar-status", async () => {
    if (!isCalendarEnabled()) {
      return { connected: false };
    }
    const { CalendarManager } = getCalendarModule();
    return CalendarManager.getInstance().getConnectionStatus();
  });

  ipcMain.handle("get-upcoming-events", async () => {
    if (!isCalendarEnabled()) {
      return [];
    }
    const { CalendarManager } = getCalendarModule();
    return CalendarManager.getInstance().getUpcomingEvents();
  });

  ipcMain.handle("calendar-refresh", async () => {
    if (!isCalendarEnabled()) {
      return { success: true, skipped: true };
    }
    const { CalendarManager } = getCalendarModule();
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

      const emailBody = await llmHelper.chatWithGemini({
        message: contextString,
        systemPrompt: FOLLOWUP_EMAIL_PROMPT,
        options: {
          alternateGroqMessage: `${GROQ_FOLLOWUP_EMAIL_PROMPT}\n\nMEETING DETAILS:\n${contextString}`
        }
      });

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
      if (!isCalendarEnabled()) {
        return [];
      }
      const { CalendarManager } = getCalendarModule();
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

