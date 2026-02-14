<div align="center">
  <img src="assets/icon.png" width="150" alt="Ghost Writer Logo">

  # Ghost Writer – Open Source AI Meeting Copilot

  ![License](https://img.shields.io/badge/license-AGPL--3.0-blue)
  ![Platform](https://img.shields.io/badge/platform-Windows-lightgrey)
  ![Status](https://img.shields.io/badge/status-active-success)

  **Ghost Writer** is a real-time AI partner for high-stakes interviews and meetings. It listens to your audio, understands the conversation context, and provides instant, tailored suggestions—all while remaining completely invisible to screen-sharing software.

</div>

---

## 🚀 Key Features

- **Context-Aware Suggestions**: Uses real-time interim transcripts to provide answers before the interviewer even finishes their sentence.
- **Deep Grounding**: Inject your resume and the job description to get answers tailored specifically to your background.
- **Universal LLM Support**: Seamlessly switch between Claude, Gemini, Groq (Llama 3), DeepSeek, and local models (Ollama).
- **Zero-Latency**: Purpose-built for speed to ensure suggestions appear exactly when you need them.
- **Privacy First**: Fully local transcription options and undetectable by screen-sharing platforms.

## 📥 Installation Guide (Windows)

Follow these steps to install Ghost Writer as a standalone application on your system:

1. **Build the Installer**:
   Open your terminal in the project directory and run:
   ```bash
   npm run dist
   ```

2. **Run Setup**:
   Go to the `release/` folder and double-click the `Ghost Writer Setup 1.0.0.exe` file.

3. **Search & Launch**:
   Once installed, search for **"Ghost Writer"** in your Windows Start Menu. You can pin it to your taskbar for quick access.

---

## 📖 How to Use

### 1. Configure Your Brains
- Go to **Settings → AI Providers** and enter your API keys.
- Upload your **Resume** (PDF/Text) to ensure the AI knows your history.

### 2. Start a Session
- Click **Start Session** from the dashboard.
- A draggable "pill" widget will appear. This widget is **invisible** to others during screen sharing.
- Use `Ctrl + B` to toggle visibility.

### 3. During the Interview
- **What to Answer**: Click this the moment the interviewer finishes a question to get a real-time punchy response.
- **Shorten**: If a response is too long, hit this to get a concise 1-sentence recap.
- **Answer (Manual)**: Type specific questions you want the AI to reason about based on the current context.

---

## 🛠 Developer Setup

If you want to run the app in development mode:

```bash
# Install dependencies
npm install

# Build the native audio module
npm run build:native

# Start the dev environment
npm start
```

---

## ⚖️ License

Ghost Writer is open-source software licensed under the **AGPL-3.0 License**.
