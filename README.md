<div align="center">

<img src="assets/docs/hero_banner.png" width="100%" alt="Ghost Writer - AI Interview Copilot">

<br>

[![License](https://img.shields.io/badge/license-AGPL--3.0-blue?style=for-the-badge)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-0078D4?style=for-the-badge&logo=windows)](https://github.com/Sasidhar-7302/Ghost_Writer/releases)
[![Electron](https://img.shields.io/badge/Electron-29-47848F?style=for-the-badge&logo=electron)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react)](https://react.dev/)
[![Rust](https://img.shields.io/badge/Rust-Native-DEA584?style=for-the-badge&logo=rust)](https://www.rust-lang.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)

**Ghost Writer** is a production-ready AI copilot for high-stakes interviews and meetings.  
Real-time transcription, context-aware AI suggestions, and an invisible overlay — all running locally on your GPU.

[Download](https://github.com/Sasidhar-7302/Ghost_Writer/releases) · [Architecture](ARCHITECTURE.md) · [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

</div>

---

## ✨ Feature Highlights

<div align="center">
<img src="assets/docs/feature_showcase.png" width="90%" alt="Ghost Writer Feature Showcase">
</div>

<br>

<table>
<tr>
<td width="50%">

### 🎙️ Real-Time Transcription
- **GPU-Accelerated Whisper**: Local speech-to-text via `whisper.cpp` — no cloud API needed
- **Persistent Server Mode**: Model stays loaded in GPU VRAM for **~1-2s** latency
- **Dual Audio Capture**: Simultaneous microphone + system audio (loopback) via native Rust module
- **Smart Silence Detection**: Skips processing during silence to save GPU cycles

</td>
<td width="50%">

### 🧠 AI Intelligence Engine
- **5 AI Modes**: What to Answer, Shorten, Recap, Follow Up Questions, Manual Answer
- **Multi-Provider LLM**: Claude, GPT, Gemini, Groq, DeepSeek, Ollama (local)
- **RAG Pipeline**: Semantic search over conversation history using local embeddings
- **Document Grounding**: Upload resume + job description for personalized responses

</td>
</tr>
<tr>
<td width="50%">

### 👻 Invisible Overlay
- **Screen-Share Safe**: Transparent overlay that's undetectable during screen sharing
- **Always-On-Top**: Persistent floating window with keyboard shortcuts
- **Disguise Mode**: Masquerade as common utility apps (Terminal, etc.)
- **Content Protection**: Prevents screenshots and screen recording of the overlay

</td>
<td width="50%">

### 🏢 Enterprise-Grade
- **Cost Tracking**: Real-time API usage monitoring with breakdowns by provider/model
- **Structured Logging**: Production-grade logging with optional Sentry integration
- **Rate Limiting**: Prevents API overuse with intelligent debouncing
- **Setup Wizard**: Guided first-run onboarding for new users
- **CI/CD**: Automated testing and builds via GitHub Actions

</td>
</tr>
</table>

---

## 🏗️ Architecture

<div align="center">
<img src="assets/docs/architecture.png" width="85%" alt="Ghost Writer Architecture">
</div>

Ghost Writer uses a layered architecture with clear separation of concerns:

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 18 + Tailwind CSS + Framer Motion | Transparent overlay UI with animations |
| **IPC Bridge** | Electron IPC (context-isolated) | Secure communication between renderer and main process |
| **LLM Pipeline** | TypeScript | Intent classification, prompt engineering, post-processing |
| **RAG Engine** | all-MiniLM-L6-v2 + SQLite FTS | Local semantic search and conversation memory |
| **Whisper STT** | whisper.cpp server (CUDA) | GPU-accelerated speech-to-text with persistent model loading |
| **Audio Capture** | Rust (N-API) | Native microphone + system audio loopback with DSP pipeline |
| **Database** | SQLite (better-sqlite3) | Meeting history, embeddings, credentials (encrypted) |

> 📖 For detailed architecture documentation, see [ARCHITECTURE.md](ARCHITECTURE.md)

---

## 🚀 Quick Start

### Prerequisites

| Requirement | Version | Purpose |
|------------|---------|---------|
| Node.js | 18+ | JavaScript runtime |
| Rust | Latest stable | Native audio module compilation |
| NVIDIA GPU | CUDA-capable | Whisper transcription acceleration |
| Windows | 10/11 | Target platform |

### Installation

```bash
# Clone the repository
git clone https://github.com/Sasidhar-7302/Ghost_Writer.git
cd Ghost_Writer

# Install dependencies
npm install

# Build native audio module (Rust → N-API)
npm run build:native

# Launch in development mode
npm run app:dev
```

### First-Time Setup

1. **Setup Wizard** — The app automatically shows a guided onboarding wizard on first launch
2. **API Keys** — Enter at least one LLM provider key (Groq is free and recommended to start)
3. **Whisper Model** — The app auto-downloads the whisper binary and model (~500MB for small, ~1.5GB for medium)
4. **Audio Test** — Verify your microphone works with the built-in audio test
5. **Upload Context** — Add your resume and job description for personalized AI responses

---

## 🎯 Usage Guide

### During Interviews

| Button | Action | Best For |
|--------|--------|----------|
| **What to Answer** | Analyzes full conversation context and suggests the best response | Immediately after interviewer asks a question |
| **Shorten** | Condenses verbose answers to concise 1-2 sentence summaries | When you need a quick, punchy reply |
| **Recap** | Summarizes the entire conversation with key discussion points | Mid-interview to review what's been covered |
| **Follow Up** | Generates strategic questions to ask the interviewer | End of interview "Do you have questions?" |
| **Answer** | Manual query with full conversation context awareness | Specific questions you want help with |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` | Global Spotlight Search — instant AI chat |
| `Ctrl+Shift+H` | Toggle overlay visibility |
| `Ctrl+Shift+M` | Start/stop meeting |

---

## 🎙️ Speech-to-Text Engine

Ghost Writer uses a **persistent whisper-server** architecture for fast, GPU-accelerated transcription:

```
┌──────────────────────────────────────────────────┐
│                 Audio Pipeline                    │
│                                                   │
│  Microphone ──→ Rust DSP ──→ 16kHz PCM ──┐       │
│                  (NAPI)                   │       │
│                                           ▼       │
│  System Audio ──→ Rust DSP ──→ 16kHz PCM ──→ WAV  │
│   (Loopback)      (NAPI)                  │       │
│                                           ▼       │
│                              ┌─────────────────┐  │
│                              │ whisper-server   │  │
│                              │ (HTTP :8178)     │  │
│                              │                  │  │
│                              │ Model loaded     │  │
│                              │ in GPU VRAM      │  │
│                              │ (~1-2s/chunk)    │  │
│                              └────────┬────────┘  │
│                                       │           │
│                                       ▼           │
│                              Transcript text      │
│                              → LLM Pipeline       │
└──────────────────────────────────────────────────┘
```

### Model Comparison

| Model | Size | Accuracy | Speed (GPU) | Best For |
|-------|------|----------|-------------|----------|
| **Small** | 465 MB | ~85% | ~1.3s/chunk | Fast feedback, casual meetings |
| **Medium** | 1.5 GB | ~92% | ~1.6s/chunk* | High-stakes interviews |

> \* After initial model loading (~15-20s). The whisper-server keeps the model in VRAM, so subsequent chunks are near-instant.

---

## 🛠️ Development

### Commands Reference

| Command | Description |
|---------|-------------|
| `npm run app:dev` | Start full development environment (Vite + Electron) |
| `npm run build:native` | Compile Rust native audio module |
| `npm run build` | Build frontend for production |
| `npm run dist` | Create distributable installer |
| `npm run lint` | Run ESLint checks |
| `npm test` | Run all test suites |

### Project Structure

```
Ghost_Writer/
├── electron/                   # Electron main process
│   ├── audio/                  # Audio capture & transcription
│   │   ├── LocalWhisperSTT.ts  # Whisper server/CLI integration
│   │   ├── WhisperModelManager.ts  # Model download & management
│   │   ├── MicrophoneCapture.ts    # Native mic capture wrapper
│   │   └── SystemAudioCapture.ts   # System audio loopback wrapper
│   ├── llm/                    # LLM processing pipeline
│   │   ├── IntentClassifier.ts # Interview question type detection
│   │   ├── WhatToAnswerLLM.ts  # Core AI response generation
│   │   ├── prompts.ts          # System prompts & persona
│   │   ├── postProcessor.ts    # Response cleanup & formatting
│   │   └── transcriptCleaner.ts    # Transcript normalization
│   ├── rag/                    # Retrieval-Augmented Generation
│   │   ├── RAGManager.ts       # Chunk, embed, and store transcripts
│   │   ├── RAGRetriever.ts     # Semantic search over history
│   │   ├── VectorStore.ts      # SQLite-backed vector storage
│   │   ├── EmbeddingPipeline.ts    # Batch embedding processor
│   │   └── LocalEmbeddingManager.ts # all-MiniLM-L6-v2 pipeline
│   ├── ipc/                    # Modular IPC handlers
│   ├── services/               # Credentials, install management
│   ├── utils/                  # Logging, rate limiting, cost tracking
│   ├── db/                     # SQLite database management
│   ├── main.ts                 # Application entry point
│   └── preload.ts              # Context bridge (security boundary)
├── src/                        # React renderer (frontend)
│   ├── components/
│   │   ├── GhostWriterInterface.tsx  # Main overlay UI
│   │   ├── SettingsOverlay.tsx       # Settings panel
│   │   ├── SetupWizard.tsx           # First-run onboarding
│   │   └── settings/                 # Settings sub-panels
│   └── App.tsx                 # Root component
├── native-module/              # Rust native audio (N-API)
│   └── src/
│       ├── lib.rs              # Module entry point
│       ├── microphone.rs       # Mic capture with WASAPI
│       └── speaker/
│           └── windows.rs      # System audio loopback (WASAPI)
├── .github/workflows/          # CI/CD pipeline
├── assets/                     # Icons, images, docs
└── docs/                       # Additional documentation
```

### Environment Variables

```bash
# API Keys (can also be configured in the UI)
GROQ_API_KEY=your_groq_key
OPENAI_API_KEY=your_openai_key
CLAUDE_API_KEY=your_claude_key
GEMINI_API_KEY=your_gemini_key

# Development
NODE_ENV=development

# Logging
LOG_LEVEL=info
SENTRY_DSN=your_sentry_dsn     # Optional crash reporting
```

---

## 🔌 Supported Providers

### LLM Providers

| Provider | Models | Tier | Latency |
|----------|--------|------|---------|
| **Groq** | Llama-3.3-70b | Free | ⚡ ~0.5s |
| **Google** | Gemini 3 Flash/Pro | Free tier available | ⚡ ~1s |
| **Anthropic** | Claude Sonnet 4.5 | Paid | ~2s |
| **OpenAI** | GPT-5.2 | Paid | ~2s |
| **DeepSeek** | DeepSeek Chat | Affordable | ~1.5s |
| **Ollama** | Any local model | Free (local) | Varies |
| **Custom** | Any OpenAI-compatible API | Varies | Varies |

### Speech-to-Text Providers

| Provider | Type | Latency | Cost |
|----------|------|---------|------|
| **Local Whisper** (default) | GPU-accelerated local | ~1-2s | Free |
| **Groq STT** | Cloud API | ~0.5s | Free tier |
| **OpenAI Whisper** | Cloud API | ~2s | Paid |
| **Deepgram** | Cloud API | ~0.3s | Paid |
| **Azure Speech** | Cloud API | ~1s | Paid |

---

## 🐛 Troubleshooting

<details>
<summary><b>Audio not working</b></summary>

1. Check microphone permissions in Windows Settings → Privacy → Microphone
2. Use the built-in audio test (Settings → Audio → Test Microphone)
3. Ensure your audio device outputs 16-bit PCM at 44.1kHz or 48kHz
</details>

<details>
<summary><b>Whisper transcription is slow</b></summary>

1. Check logs for `✅ whisper-server ready` — if missing, the server failed to start
2. The first transcription after starting a meeting takes ~15-20s (model loading)
3. Subsequent transcriptions should be ~1-2s
4. Switch to the **Small** model in Settings for faster (but less accurate) transcription
5. Ensure you have an NVIDIA GPU with CUDA support
</details>

<details>
<summary><b>API errors or high latency</b></summary>

1. Verify your API keys are valid in Settings
2. Switch to **Groq** (free, fastest) or **Ollama** (local, free) for lower latency
3. Check Settings → Usage Statistics for cost and rate limit information
</details>

<details>
<summary><b>Build errors with native module</b></summary>

1. Ensure Rust toolchain is installed: `rustup show`
2. Run `npm run build:native` separately to see detailed errors
3. On Windows, ensure Visual Studio Build Tools are installed
</details>

---

## 📈 Roadmap

- [x] Real-time transcription with GPU acceleration
- [x] Multi-provider LLM support (6+ providers)
- [x] RAG pipeline with local embeddings
- [x] Whisper Server Mode (~1-2s latency)
- [x] Setup Wizard for onboarding
- [x] Cost tracking and analytics
- [ ] macOS support with CoreAudio loopback
- [ ] Multi-language transcription support
- [ ] Shareable meeting notes with polished exports
- [ ] Mobile companion app
- [ ] Custom LLM fine-tuning for interview patterns

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

**Quick overview:**
1. Fork the repository
2. Create a feature branch (`git checkout -b feat/amazing-feature`)
3. Commit your changes with [Conventional Commits](https://www.conventionalcommits.org/)
4. Push and open a Pull Request

---

## ⚖️ License

Ghost Writer is open-source software licensed under the **[AGPL-3.0 License](LICENSE)**.  
This ensures that any modifications to the codebase remain open source.

---

## 🙏 Acknowledgments

| Technology | Purpose |
|-----------|---------|
| [Electron](https://www.electronjs.org/) | Cross-platform desktop framework |
| [React](https://react.dev/) | UI component library |
| [Rust](https://www.rust-lang.org/) | High-performance native audio capture |
| [whisper.cpp](https://github.com/ggerganov/whisper.cpp) | Local speech-to-text engine |
| [Tailwind CSS](https://tailwindcss.com/) | Utility-first CSS framework |
| [Framer Motion](https://www.framer.com/motion/) | Animation library |
| [SQLite](https://www.sqlite.org/) | Embedded database |
| [all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) | Local sentence embeddings |

---

<div align="center">

**Built with ❤️ for professionals who want every edge.**

[⬆ Back to Top](#)

</div>
