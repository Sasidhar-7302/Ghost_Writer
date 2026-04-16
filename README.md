# Ghost Writer

<div align="center">
  <img src="assets/docs/hero_banner.png" width="100%" alt="Ghost Writer hero banner">

  <br>

  [![License](https://img.shields.io/badge/license-PROPRIETARY-red?style=for-the-badge)](LICENSE)
  [![Release](https://img.shields.io/badge/release-v1.0.0-0ea5e9?style=for-the-badge)](https://github.com/chintuai2026/Ghost_Writer/releases)
  [![Platform](https://img.shields.io/badge/platform-Windows%20x64%20%7C%20macOS%20arm64-111827?style=for-the-badge)](https://github.com/chintuai2026/Ghost_Writer/releases)
  [![Launch Mode](https://img.shields.io/badge/launch-desktop%20beta-10b981?style=for-the-badge)](https://github.com/chintuai2026/Ghost_Writer/releases)

  Ghost Writer is a desktop beta for high-fidelity meeting and interview assistance.
  It combines live transcription, screenshot-aware answering, local privacy options, and multi-provider LLM routing in a direct-download Electron app.

  [Releases](https://github.com/chintuai2026/Ghost_Writer/releases) · [Architecture](docs/ARCHITECTURE.md) · [Privacy](docs/PRIVACY.md) · [Troubleshooting](docs/TROUBLESHOOTING.md)
</div>

---

## What It Does

- **Real-time Assistance**: Get instant answers during meetings via high-fidelity overlays.
- **Stealth Remote Sync**: Stream character-by-character intelligence to any mobile device on your Wi-Fi, allowing you to hide all overlays on your primary PC.
- **Privacy First**: Local Whisper and Ollama support for zero-cloud workflows.
- **Screenshot Intelligent**: AI that reads your screen to provide context-aware answers.
- **Semantic Memory**: RAG-powered retrieval over your entire meeting history and documents.

## Project Structure

Ghost Writer is organized to separate the desktop application, the product landing page, and the secure remote viewer:

```text
Ghost_Writer/
├── docs/                 # Product Website & Technical Docs
│   ├── index.html        # Landing Page (sasidhar-7302.github.io)
│   └── ARCHITECTURE.md   # System Design & Data Flow
├── electron/             # Main Process (Source)
│   ├── services/
│   │   └── remote-display # Mobile Viewer Logic & Server
│   └── main.ts           # App Entry Point
├── src/                  # Desktop UI (React Frontend)
├── scripts/              # Internal & Developer Scripts
└── index.html            # Desktop App Entry (Vite)
```

## Supported Platforms

- Windows x64
- macOS arm64
- **Mobile Viewer**: Any smartphone on the same Wi-Fi network (via browser)

## Install

### One-command install

Windows PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/Sasidhar-7302/Ghost_Writer/main/platform/install/install.ps1 | iex"
```

macOS:

```bash
curl -fsSL https://raw.githubusercontent.com/Sasidhar-7302/Ghost_Writer/main/platform/install/install.sh | bash
```

The scripts download the latest release manifest, verify checksums, and install Ghost Writer into a user-local location. Re-running the same command upgrades an existing install in place.

### Manual install

1. Download the latest installer from [GitHub Releases](https://github.com/chintuai2026/Ghost_Writer/releases).
2. Verify the published SHA256 checksum from `checksums.txt`.
3. Run the installer.
4. Complete the onboarding flow on first launch.

## Data And Privacy

- API keys and license data are stored with Electron `safeStorage` when available.
- Telemetry is optional and disabled by default for v1.0.0.
- Full Privacy Mode blocks cloud STT and cloud LLM routing until local dependencies are ready.
- Local transcripts, meeting history, and context files stay on-device unless you explicitly use a cloud provider.

More detail: [Privacy](docs/PRIVACY.md)

## Current Launch Posture

- Version: `1.0.0`
- Distribution: unsigned direct-download desktop beta
- Monetization: disabled for the v1.0.0 beta launch
- Primary install path: terminal one-liners plus manual downloads as fallback

## Known Limitations

- Unsigned installers can still trigger OS trust warnings until code signing is added.
- macOS support is currently focused on Apple Silicon.
- Local-only mode requires both Local Whisper and Ollama to be installed and healthy.
- Some advanced workflows depend on third-party provider API keys that you supply.

## Development

Install dependencies:

```bash
npm ci
```

Build the renderer:

```bash
npm run build
```

Build the desktop app:

```bash
npm run build:desktop
```

Create release artifacts:

```bash
npm run dist
```

Run key verification scripts:

```bash
node tests/test_smoke.js
node tests/meeting_summary_routing.test.js
node tests/prompt_settings.test.js
```

## Support

- Issues: [GitHub Issues](https://github.com/chintuai2026/Ghost_Writer/issues)
- Troubleshooting: [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)
- Privacy notes: [docs/PRIVACY.md](docs/PRIVACY.md)

## License

This software is proprietary. Redistribution and unauthorized commercial reuse are not permitted. See [LICENSE](LICENSE).
