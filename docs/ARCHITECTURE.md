# Architecture

> Technical deep-dive into Ghost Writer's system design and component interactions.

---

## System Overview

Ghost Writer is an Electron desktop application with a multi-layered architecture that separates concerns between audio capture, speech-to-text, AI processing, and UI rendering.

```
┌─────────────────────────────────────────────────────────────────┐
│                        React Frontend                           │
│  ┌────────────┐  ┌──────────────┐  ┌─────────────────────────┐  │
│  │ Overlay UI │  │ Settings     │  │ Setup Wizard            │  │
│  │ (5 modes)  │  │ Panels       │  │ (First-run onboarding)  │  │
│  └────────────┘  └──────────────┘  └─────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                   Electron IPC Bridge                           │
│              (Context-Isolated, Preload Script)                 │
├─────────────────────────────────────────────────────────────────┤
│                    Electron Main Process                        │
│  ┌──────────────┐  ┌──────────┐  ┌────────────────────────────┐│
│  │ LLM Pipeline │  │ RAG      │  │ Whisper STT               ││
│  │ (6 providers)│  │ Engine   │  │ (Server + CLI fallback)   ││
│  └──────────────┘  └──────────┘  └────────────────────────────┘│
│  ┌──────────────┐  ┌──────────┐  ┌────────────────────────────┐│
│  │ Audio Manager│  │ Database │  │ Services                  ││
│  │ (Rust NAPI)  │  │ (SQLite) │  │ (Licensing, Analytics, etc)││
│  └──────────────┘  └──────────┘  └────────────────────────────┘│
├─────────────────────────────────────────────────────────────────┤
│                   Cloud Infrastructure                          │
│  ┌──────────────┐  ┌──────────┐  ┌────────────────────────────┐│
│  │ Supabase DB  │  │ Edge     │  │ Gumroad                   ││
│  │ (Global State)│  │ Functions│  │ (Monetization Engine)      ││
│  └──────────────┘  └──────────┘  └────────────────────────────┘│
├─────────────────────────────────────────────────────────────────┤
│               Native Audio Module (Rust)                        │
│  ┌────────────────────┐  ┌────────────────────────────────────┐ │
│  │ Microphone Capture │  │ System Audio Loopback              │ │
│  │ (WASAPI/CoreAudio) │  │ (WASAPI/ScreenCaptureKit)          │ │
│  └────────────────────┘  └────────────────────────────────────┘ │
│  ┌────────────────────┐  ┌────────────────────────────────────┐ │
│  │ Streaming Resampler│  │ Silence Suppressor                │ │
│  │ (48kHz → 16kHz)    │  │ (Threshold + Hangover)            │ │
│  └────────────────────┘  └────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Audio Pipeline

The audio pipeline captures both microphone and system audio using a Rust native module compiled via N-API.

**Key files:**
- `native-module/src/microphone.rs` — Microphone capture (WASAPI/CoreAudio)
- `native-module/src/speaker/windows.rs` — Windows loopback capture (WASAPI)
- `native-module/src/speaker/macos.rs` — macOS loopback capture (ScreenCaptureKit)
- `electron/audio/MicrophoneCapture.ts` — TypeScript wrapper for mic
- `electron/audio/SystemAudioCapture.ts` — TypeScript wrapper for loopback

**DSP Pipeline (Rust):**
1. **Capture** — Platform-native capture at native sample rate (typically 48kHz)
2. **Resample** — Linear interpolation from 48kHz → 16kHz (Whisper's expected input)
3. **Silence Suppression** — RMS threshold with hangover period to avoid cutting off speech
4. **Emit** — Sends 16kHz PCM chunks to JavaScript via N-API callbacks
5. **Fallback Flow** — If N-API fails to initialize (e.g., missing dependencies, WASAPI access denied), `AppState` triggers the Web Audio Fallback system.

### 2. Audio Fallback Management (`WebAudioFallback.ts`)

When native capture is unavailable, the system switches to a renderer-side fallback:
- **System Audio**: Utilizes `navigator.mediaDevices.getDisplayMedia` with `systemAudio: 'include'`.
- **Microphone**: Utilizes `navigator.mediaDevices.getUserMedia(audio: true)`.
- **Processing**: PCM data is captured at 16kHz, converted from Float32 to Int16 in the renderer, and streamed to the main process via the `raw-audio-stream` IPC channel.
- **Integration**: The main process receives these buffers and writes them directly to the active STT engine, bypassing the native Rust loop.

### 3. Whisper STT (`LocalWhisperSTT.ts`)

The speech-to-text engine uses `whisper.cpp` for GPU-accelerated transcription.

**Two modes of operation:**

| Mode | How it works | Latency | When used |
|------|-------------|---------|-----------|
| **Server Mode** | Persistent `whisper-server` HTTP process | ~1-2s | Default (when server starts OK) |
| **CLI Fallback** | Spawns `whisper-cli` per chunk | ~15s | If server fails to start |

**Server lifecycle:**
1. `start()` → Spawns `whisper-server` with model path
2. Polls `http://127.0.0.1:8178/health` until the server responds (model loaded in VRAM)
3. `transcribeViaServer()` → HTTP POST multipart WAV to `/inference`
4. `stop()` → Kills server process, releases GPU/NPU VRAM

**Shared server:** Multiple `LocalWhisperSTT` instances (mic + system audio) share one server via reference counting.

### 3. LLM Pipeline

The LLM pipeline processes transcription text through multiple stages:

```
Transcript → Intent Classifier → Prompt Builder → LLM Call → Post-Processor → UI
```

**Components:**
- **LLMOrchestrator** — The central router and fallback manager processing all AI requests
- **Providers (`GroqProvider`, `OpenAIProvider`, `OllamaProvider`, etc.)** — Isolated API integrations handling specific network/inference protocols
- **IntentClassifier** — Categorizes questions (technical, behavioral, situational, leadership)
- **TemporalContextBuilder** — Prevents answer repetition by tracking recent responses
- **Prompt System** — Dynamic prompts with persona, resume context, and conversation history
- **PostProcessor** — Strips AI artifacts, meta-commentary, and formats responses
- **TranscriptCleaner** — Normalizes raw whisper output

### 4. RAG Engine

The RAG (Retrieval-Augmented Generation) engine provides semantic search over conversation history:

1. **Chunking** — Splits transcripts into overlapping segments
2. **Embedding** — Generates 384-dim vectors using `all-MiniLM-L6-v2` (runs locally)
3. **Storage** — SQLite-backed vector store with cosine similarity search
4. **Retrieval** — Top-K relevant chunks injected into LLM context

**Key files:**
- `electron/rag/RAGManager.ts` — Orchestrates the pipeline
- `electron/rag/EmbeddingPipeline.ts` — Batch embedding processor
- `electron/rag/VectorStore.ts` — SQLite vector storage
- `electron/rag/LocalEmbeddingManager.ts` — Transformer pipeline wrapper

- `electron/rag/LocalEmbeddingManager.ts` — Transformer pipeline wrapper

### 6. Hardware-Aware Status & Optimization

Ghost Writer features a sophisticated hardware-aware layer (`GPUHelper.ts`) that manages local resources:
- **Detection**: Uses `nvidia-smi` or DirectX/Metal queries to identify active GPUs.
- **Tiering**: Classifies hardware into High (>=10GB VRAM), Medium (>=6GB VRAM), and Low (CPU/Mobile) tiers.
- **Optimization**: Automatically adjusts `num_thread` and context windows based on target hardware tier.
- **Pre-loading**: Models are warmed in VRAM background upon selection to minimize start-up delay.

### 7. Database Layer

SQLite database (`ghost-writer.db`) with automatic migrations:

| Table | Purpose |
|-------|---------|
| `meetings` | Meeting metadata, transcripts, summaries |
| `segments` | Individual transcript segments with timestamps |
| `embeddings` | Vector embeddings for RAG retrieval |
| `credentials` | Encrypted API keys and settings |

### 6. Security Model

- **Context Isolation** — Renderer has no direct access to Node.js APIs
- **Preload Bridge** — Explicit allowlist of IPC methods via `contextBridge`
- **Encrypted Credentials** — API keys stored with OS-level encryption
- **Content Protection** — BrowserWindow flag prevents screen capture
- **Remote Kill Switch** — `is_service_active` flag in Supabase allows immediate remote application lockout.
- **License Hardening** — Hardware-bound Machine IDs prevent license sharing.

### 7. Cloud Integration Layer (Supabase + Gumroad)

Ghost Writer uses a hybrid approach for launch-grade desktop operations:

- **Licensing Engine**: `LicenseManager.ts` coordinates between local state, Supabase `checkout_sessions`, and Gumroad's API.
- **Pulse Analytics**: A 5-minute heartbeat loop (`AnalyticsManager.ts`) synchronizes usage metrics (active time, launch counts) to Supabase.
- **Edge Orchestration**: The `gumroad-webhook` Edge Function handles server-to-server notifications from Gumroad to instantly unlock clients via Supabase Realtime.

---

## Data Flow

### Meeting Recording Flow

```
1. User clicks "Start Meeting"
2. MicrophoneCapture.start() → Native capture begins
3. SystemAudioCapture.start() → Native loopback capture begins
4. Both emit 16kHz PCM chunks every ~20ms
5. LocalWhisperSTT buffers chunks for 800ms
6. Buffer → WAV file → whisper-server HTTP POST
7. Server returns transcript JSON
8. Transcript emitted as 'transcript' event
9. UI updates with real-time text
10. User clicks "What to Answer"
11. LLM Pipeline processes full conversation context
12. AI response displayed in overlay
```

### Dynamic Shortcut Fallbacks (`shortcuts.ts`)

Ghost Writer relies on global shortcuts (e.g., `Ctrl+H`) for rapid screenshot analysis. Because other robust applications often hook into the same keys, the system initializes an automatic fallback chain:
1. Try `Ctrl+H` (Primary)
2. Fallback `Ctrl+Shift+H` if Primary is claimed
3. Fallback `Ctrl+Alt+H` if both are claimed
4. `Unbound` (if all fail to register)

The successfully bound key is exposed over IPC (`get-active-shortcut`) so the React frontend dynamically renders the correct keys in the UI overlay tooltips.

### Whisper Server Flow

```
start() ──→ spawn(whisper-server.exe) ──→ poll /health
                                              │
                                     ┌────────┴────────┐
                                     │  Model loading   │
                                     │  (~15-20s)       │
                                     └────────┬────────┘
                                              │
                                     Server ready ✅
                                              │
transcribe() ──→ POST /inference ──→ ~1-2s ──→ JSON response
                 (multipart WAV)
```

---

## Build System

| Tool | Purpose |
|------|---------|
| **Vite** | Frontend bundling and dev server |
| **tsc** | TypeScript compilation for Electron main process |
| **napi-rs** | Rust → Node.js native addon compilation |
| **electron-builder** | Application packaging and installer creation |
| **ESLint** | Code quality and style enforcement |
| **GitHub Actions** | CI/CD pipeline for automated builds |

---

## Performance Characteristics

| Metric | Value |
|--------|-------|
| Startup time | ~3-5 seconds |
| Audio capture latency | <10ms (Rust WASAPI) |
| Whisper transcription (server mode) | ~1-2s per chunk | (optimized for CUDA/Metal) |
| Whisper transcription (CLI fallback) | ~15s per chunk | (cold boot per chunk) |
| LLM response (Groq/Flash) | ~0.5s - 1s |
| LLM response (Local 8b GPU) | ~1-2s (8GB+ VRAM) |
| VRAM warm-up (Cold start) | ~10-15s (Model pre-loading) |
| Memory usage (idle) | ~150MB |
| Memory usage (recording) | ~400MB + model size |
| GPU VRAM (whisper small) | ~500MB |
| GPU VRAM (llama 8b) | ~5-6GB |
