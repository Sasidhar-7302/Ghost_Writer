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
│  │ Microphone Capture │  │ System Audio Loopback (WASAPI)    │ │
│  │ (WASAPI, 48kHz)    │  │ (Speaker → PCM capture)          │ │
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
- `native-module/src/microphone.rs` — WASAPI microphone capture
- `native-module/src/speaker/windows.rs` — WASAPI loopback capture (system audio)
- `electron/audio/MicrophoneCapture.ts` — TypeScript wrapper for mic
- `electron/audio/SystemAudioCapture.ts` — TypeScript wrapper for loopback

**DSP Pipeline (Rust):**
1. **Capture** — WASAPI exclusive/shared mode at native sample rate (typically 48kHz)
2. **Resample** — Linear interpolation from 48kHz → 16kHz (Whisper's expected input)
3. **Silence Suppression** — RMS threshold with hangover period to avoid cutting off speech
4. **Emit** — Sends 16kHz PCM chunks to JavaScript via N-API callbacks

### 2. Whisper STT (`LocalWhisperSTT.ts`)

The speech-to-text engine uses `whisper.cpp` for GPU-accelerated transcription.

**Two modes of operation:**

| Mode | How it works | Latency | When used |
|------|-------------|---------|-----------|
| **Server Mode** | Persistent `whisper-server.exe` HTTP process on port 8178 | ~1-2s | Default (when server starts OK) |
| **CLI Fallback** | Spawns `whisper-cli.exe` per chunk | ~15s | If server fails to start |

**Server lifecycle:**
1. `start()` → Spawns `whisper-server.exe` with model path
2. Polls `http://127.0.0.1:8178/` until the server responds (model loaded in VRAM)
3. `transcribeViaServer()` → HTTP POST multipart WAV to `/inference`
4. `stop()` → Kills server process, releases GPU VRAM

**Shared server:** Multiple `LocalWhisperSTT` instances (mic + system audio) share one server via reference counting.

### 3. LLM Pipeline

The LLM pipeline processes transcription text through multiple stages:

```
Transcript → Intent Classifier → Prompt Builder → LLM Call → Post-Processor → UI
```

**Components:**
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

### 5. Hardware-Aware Intelligence Engine

Ghost Writer features a sophisticated hardware-aware model management layer that optimizes for local GPU resources (e.g., dedicated GPUs with 8GB+ VRAM).

**Key Capabilities:**
- **Tiered Optimization**: Automatically detects VRAM and assigns performance profiles. "High Tier" (>=10GB VRAM) enables 32k context windows and 8-thread processing.
- **Background Pre-loading**: Uses an `EventEmitter` pattern to signal model loading states. Triggered upon model selection to "warm up" VRAM before use.
- **Smart Task Switching**: In `LLMHelper.generateMeetingSummary`, the system detects if the active model is Vision-heavy (e.g., `llava`) and automatically switches to a high-speed text model (e.g., `qwen2.5:7b`) for summarization to avoid context hangs.

### 6. Database Layer

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

Ghost Writer uses a hybrid approach for enterprise-grade management:

- **Licensing Engine**: `LicenseManager.ts` coordinates between local state, Supabase `checkout_sessions`, and Gumroad's API.
- **Pulse Analytics**: A 5-minute heartbeat loop (`AnalyticsManager.ts`) synchronizes usage metrics (active time, launch counts) to Supabase.
- **Edge Orchestration**: The `gumroad-webhook` Edge Function handles server-to-server notifications from Gumroad to instantly unlock clients via Supabase Realtime.

---

## Data Flow

### Meeting Recording Flow

```
1. User clicks "Start Meeting"
2. MicrophoneCapture.start() → Rust WASAPI capture begins
3. SystemAudioCapture.start() → Rust loopback capture begins
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
| Whisper transcription (server mode) | ~1-2s per chunk |
| Whisper transcription (CLI fallback) | ~15s per chunk |
| LLM response (Groq/Flash) | ~0.5s - 1s |
| LLM response (Local 8b GPU) | ~1-2s (8GB+ VRAM) |
| VRAM warm-up (Cold start) | ~10-15s (Model pre-loading) |
| Memory usage (idle) | ~150MB |
| Memory usage (recording) | ~400MB + model size |
| GPU VRAM (whisper small) | ~500MB |
| GPU VRAM (llama 8b) | ~5-6GB |
