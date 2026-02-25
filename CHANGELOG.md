# Changelog

All notable changes to Ghost Writer are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/).

---

## [2.0.0] - 2026-02-25

### 🚀 Major Release — Whisper Server & Enterprise Features

#### Added
- **Whisper Server Mode** — Persistent `whisper-server.exe` keeps model loaded in GPU VRAM for ~1-2s transcription latency (vs ~15s cold start)
- **Setup Wizard** — Guided first-run onboarding for API keys, audio test, and context upload
- **RAG Pipeline** — Local semantic search over conversation history using all-MiniLM-L6-v2 embeddings
- **Local Embedding Manager** — Runs transformer models locally for embedding generation
- **Cost Tracking** — Real-time API usage monitoring with breakdowns by provider and model
- **Rate Limiting** — Intelligent debouncing to prevent API overuse
- **Structured Logging** — Production-grade logging utility
- **Error Boundary** — React crash recovery component
- **IPC Modularization** — Separated IPC handlers into domain-specific modules
- **CI/CD Pipeline** — GitHub Actions workflow for automated testing and builds
- **ESLint Configuration** — Code quality enforcement

#### Changed
- **Audio DSP** — Silence suppression, streaming resampler, and DSP pipeline in native Rust module
- **Default Whisper Model** — Switched to medium for higher accuracy (server mode eliminates load time penalty)
- **Microphone Capture** — Improved WASAPI integration with better error handling
- **System Audio Capture** — Enhanced loopback capture with device selection

#### Fixed
- **Whisper CLI flags** — Removed unsupported `--flash-attn`, `--no-prints`, `--device cuda` flags that broke all local transcription
- **Corrupt model handling** — Added validation for whisper model file integrity
- **GPU detection** — Removed manual GPU detection; whisper.cpp auto-detects CUDA devices

#### Documentation
- Professional README with hero banner, architecture diagram, and feature showcase images
- ARCHITECTURE.md with detailed system design and component documentation
- CONTRIBUTING.md with development guidelines and PR checklist
- Updated project structure documentation

---

## [1.1.4] - 2026-02-12

### What's New
- **Custom LLM Providers** — Connect to any OpenAI-compatible API (OpenRouter, DeepSeek, commercial endpoints) via cURL command
- **Smart Local AI** — Enhanced Ollama integration with auto-detection of available local models
- **Refined Human Persona** — Updated system prompts for concise, conversational responses indistinguishable from a real candidate
- **Anti-Chatbot Logic** — Constraints to prevent AI-like lectures and over-explanation
- **Global Spotlight Search** — Access AI chat instantly with `Ctrl+K`
- **Masquerading Mode** — Disguise the app as common utility processes for discreet usage

---

## [1.0.0] - 2026-01-15

### Initial Release
- Real-time meeting transcription with Google Speech-to-Text
- 5 AI modes: What to Answer, Shorten, Recap, Follow Up, Manual Answer
- Multi-provider LLM support (Claude, GPT, Gemini, Groq, DeepSeek)
- Transparent overlay UI with screen-share protection
- Resume and job description integration
- SQLite database for meeting history
- Native Rust audio capture module
