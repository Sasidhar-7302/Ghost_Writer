// STT (Speech-to-Text) & Audio IPC Handlers
// Handles STT provider management, Whisper setup, audio devices, and connection testing

import { ipcMain, dialog } from "electron";
import type { AppState } from "../main";
import { AudioDevices } from "../audio/AudioDevices";

let sttHandlersInitialized = false;

export function registerSTTHandlers(appState: AppState): void {
  if (sttHandlersInitialized) return;
  sttHandlersInitialized = true;

  // ==========================================
  // STT Provider Management
  // ==========================================

  ipcMain.handle("set-stt-provider", async (_, provider: 'google' | 'groq' | 'openai' | 'deepgram' | 'elevenlabs' | 'azure' | 'ibmwatson') => {
    try {
      const { CredentialsManager } = require('../services/CredentialsManager');
      CredentialsManager.getInstance().setSttProvider(provider);
      await appState.reconfigureSttProvider();
      return { success: true };
    } catch (error: any) {
      console.error("Error setting STT provider:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("get-stt-provider", async () => {
    try {
      const { CredentialsManager } = require('../services/CredentialsManager');
      return CredentialsManager.getInstance().getSttProvider();
    } catch (error: any) {
      return 'google';
    }
  });

  // ==========================================
  // Local Whisper Setup
  // ==========================================

  ipcMain.handle("get-whisper-status", async () => {
    try {
      const { WhisperModelManager } = require('../audio/WhisperModelManager');
      const { CredentialsManager } = require('../services/CredentialsManager');
      const manager = WhisperModelManager.getInstance();
      const status = manager.getStatus();
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

  ipcMain.handle("setup-whisper", async (_, model?: string) => {
    try {
      const { WhisperModelManager } = require('../audio/WhisperModelManager');
      const manager = WhisperModelManager.getInstance();

      if (model) {
        manager.setModel(model);
      }

      const ready = await manager.ensureReady();

      if (ready) {
        await appState.reconfigureSttProvider();
      }

      return { success: ready, status: manager.getStatus() };
    } catch (error: any) {
      console.error("Error setting up whisper:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("set-local-whisper-model", async (_, model: string) => {
    try {
      const { WhisperModelManager } = require('../audio/WhisperModelManager');
      const manager = WhisperModelManager.getInstance();
      manager.setModel(model);
      return { success: true, status: manager.getStatus() };
    } catch (error: any) {
      console.error("Error setting local whisper model:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("download-whisper-model", async (_, model: string) => {
    try {
      const { WhisperModelManager } = require('../audio/WhisperModelManager');
      const manager = WhisperModelManager.getInstance();
      const success = await manager.downloadSpecificModel(model);
      return { success, status: manager.getStatus() };
    } catch (error: any) {
      console.error("Error downloading whisper model:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("set-local-whisper-paths", async (_, binaryPath: string, modelPath: string) => {
    try {
      const { CredentialsManager } = require('../services/CredentialsManager');
      if (binaryPath !== undefined) CredentialsManager.getInstance().setLocalWhisperBinaryPath(binaryPath);
      if (modelPath !== undefined) CredentialsManager.getInstance().setLocalWhisperModelPath(modelPath);

      const { WhisperModelManager } = require('../audio/WhisperModelManager');
      const manager = WhisperModelManager.getInstance();

      if (manager.isReady()) {
        await appState.reconfigureSttProvider();
      }

      return { success: true, status: manager.getStatus() };
    } catch (error: any) {
      console.error("Error setting local whisper paths:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("select-local-file", async (_, prompt: string, filters: any[]) => {
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

  // ==========================================
  // STT API Key Setters
  // ==========================================

  ipcMain.handle("set-groq-stt-api-key", async (_, apiKey: string) => {
    try {
      const { CredentialsManager } = require('../services/CredentialsManager');
      CredentialsManager.getInstance().setGroqSttApiKey(apiKey);
      return { success: true };
    } catch (error: any) {
      console.error("Error saving Groq STT API key:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("set-openai-stt-api-key", async (_, apiKey: string) => {
    try {
      const { CredentialsManager } = require('../services/CredentialsManager');
      CredentialsManager.getInstance().setOpenAiSttApiKey(apiKey);
      return { success: true };
    } catch (error: any) {
      console.error("Error saving OpenAI STT API key:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("set-deepgram-api-key", async (_, apiKey: string) => {
    try {
      const { CredentialsManager } = require('../services/CredentialsManager');
      CredentialsManager.getInstance().setDeepgramApiKey(apiKey);
      return { success: true };
    } catch (error: any) {
      console.error("Error saving Deepgram API key:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("set-groq-stt-model", async (_, model: string) => {
    try {
      const { CredentialsManager } = require('../services/CredentialsManager');
      CredentialsManager.getInstance().setGroqSttModel(model);
      await appState.reconfigureSttProvider();
      return { success: true };
    } catch (error: any) {
      console.error("Error setting Groq STT model:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("set-elevenlabs-api-key", async (_, apiKey: string) => {
    try {
      const { CredentialsManager } = require('../services/CredentialsManager');
      CredentialsManager.getInstance().setElevenLabsApiKey(apiKey);
      return { success: true };
    } catch (error: any) {
      console.error("Error saving ElevenLabs API key:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("set-azure-api-key", async (_, apiKey: string) => {
    try {
      const { CredentialsManager } = require('../services/CredentialsManager');
      CredentialsManager.getInstance().setAzureApiKey(apiKey);
      return { success: true };
    } catch (error: any) {
      console.error("Error saving Azure API key:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("set-azure-region", async (_, region: string) => {
    try {
      const { CredentialsManager } = require('../services/CredentialsManager');
      CredentialsManager.getInstance().setAzureRegion(region);
      await appState.reconfigureSttProvider();
      return { success: true };
    } catch (error: any) {
      console.error("Error setting Azure region:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("set-ibmwatson-api-key", async (_, apiKey: string) => {
    try {
      const { CredentialsManager } = require('../services/CredentialsManager');
      CredentialsManager.getInstance().setIbmWatsonApiKey(apiKey);
      return { success: true };
    } catch (error: any) {
      console.error("Error saving IBM Watson API key:", error);
      return { success: false, error: error.message };
    }
  });

  // ==========================================
  // STT Connection Testing
  // ==========================================

  ipcMain.handle("test-stt-connection", async (_, provider: 'groq' | 'openai' | 'deepgram' | 'elevenlabs' | 'azure' | 'ibmwatson', apiKey: string, region?: string) => {
    try {
      if (provider === 'deepgram') {
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
        const form = new FormData();
        form.append('file', testWav, { filename: 'test.wav', contentType: 'audio/wav' });
        form.append('model_id', 'scribe_v1');
        await axios.post('https://api.elevenlabs.io/v1/speech-to-text', form, {
          headers: { 'xi-api-key': apiKey, ...form.getHeaders() },
          timeout: 15000,
        });
      } else if (provider === 'azure') {
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
        // Groq / OpenAI
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

  // ==========================================
  // Audio Device Handlers
  // ==========================================

  ipcMain.handle("get-input-devices", async () => {
    return AudioDevices.getInputDevices();
  });

  ipcMain.handle("get-output-devices", async () => {
    return AudioDevices.getOutputDevices();
  });

  ipcMain.handle("start-audio-test", async (event, deviceId?: string) => {
    appState.startAudioTest(deviceId);
    return { success: true };
  });

  ipcMain.handle("stop-audio-test", async () => {
    appState.stopAudioTest();
    return { success: true };
  });

  ipcMain.handle("set-recognition-language", async (_, key: string) => {
    appState.setRecognitionLanguage(key);
    return { success: true };
  });

  // ==========================================
  // Web Audio Fallback IPC
  // ==========================================

  ipcMain.on("raw-audio-stream", (event, buffer: Buffer) => {
    // Pipe this buffer to all active STT providers in AppState
    // This is the bridge between renderer capture and server-side STT
    const stt = appState.getGoogleSTT();
    const sttUser = appState.getGoogleSTTUser();

    if (stt) {
      stt.write(buffer);
    }
    if (sttUser) {
      sttUser.write(buffer);
    }
    // Deepgram, Azure, etc. usually use their own streaming logic or REST.
    // Here we ensure the core streaming engine receives the raw PCM.
  });
}
