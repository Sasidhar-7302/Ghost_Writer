# Changelog

All notable changes to Ghost Writer are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/).

---

## [1.0.0] - 2026-04-18

### First Official Release

#### Included
- Real-time interview and meeting assistance with local and cloud model routing
- Screenshot-aware answering and multimodal context handling
- Local Whisper transcription with GPU-aware processing and cloud STT provider support
- Guided onboarding, demo meeting seeding, and persistent meeting history
- Packaged Windows installer and Apple Silicon macOS `.dmg` release flow

#### Hardened (Enterprise Ready)
- **Granular Usage Tracking**: Implemented mode-aware heartbeats to track "Meeting Minutes" vs. "Interview Minutes" separately in the cloud analytics dashboard.
- **User Identity Synchronization**: Integrated Name/Email profile syncing to Supabase for improved enterprise metrics and user support.
- **Cloud Infrastructure Alignment**: Synchronized Supabase schema with double-precision minute tracking and secure Row Level Security (RLS) policies.
- **Packaged Path Normalization**: App data now correctly uses the `Ghost Writer` user-data directory with legacy migration support.
- **Remote Orchestration**: Added remote kill-switch and maintenance alert capabilities via global configuration.
