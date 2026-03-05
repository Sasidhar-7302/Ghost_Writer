# Changelog

All notable changes to Ghost Writer are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/).

---

## [2.1.0] - 2026-03-02

### 🛡️ Production Hardening & Audio Robustness

#### Added
- **Native Audio Fallback System** — Automatic, seamless transition to Web Audio API (`getDisplayMedia`) if the Rust native loopback module fails or is unavailable.
- **Hardware-Aware Status Reporting** — Real-time GPU detection with performance tiering (High/Medium/Low) and VRAM reporting directly in the Settings UI.
- **IPC Audio Streaming** — High-performance bridge for piping raw PCM data from renderer capture back to the STT engines.
- **Audio Troubleshooting Guide** — Comprehensive documentation for common WASAPI errors and device access issues.
- **Enhanced Unit Testing** — New test suites for fallback logic and audio routing.
- **Performance Benchmarking** — Diagnostic tools to compare processing overhead between native and fallback capture paths.

#### Fixed
- **STT Private Access** — Resolved TypeScript lint errors by exposing STT engines through safe public getters.
- **IPC Reliability** — Hardened the bridge for streaming large buffers of raw audio data without UI blocking.

---

## [2.0.1] - 2026-03-01

### 🍎 MacBook Compatibility Overhaul

#### Added
- **macOS System Audio Capture** — Integrated Apple's **ScreenCaptureKit** for driver-less, high-quality system audio loopback on macOS.
- **Apple Silicon (M1/M2/M3) Optimization** — Native support for Metal and CoreML acceleration in the Whisper engine for near-instant transcription.
- **Universal Darwin Build** — Native module cross-compilation for both Intel (x64) and Apple Silicon (arm64) architectures.
- **Automated Release Pipeline** — Expanded CI/CD to automatically generate and release Windows `.exe` and macOS `.dmg` installers.
- **macOS Professional Assets** — Full 1024px icon set and optimized distribution configuration.
- **macOS Security Entitlements** — Configured sandbox entitlements for microphone and ScreenCaptureKit permissions.

#### Fixed
- **Version Reporting** — Resolved an issue where the app reported the Electron framework version instead of the application version (`2.0.1`) to Supabase.
- **Platform Awareness** — Sanitized all core services to remove hardcoded `.exe` suffixes, ensuring cross-platform stability.

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
