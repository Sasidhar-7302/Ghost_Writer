# Privacy

Ghost Writer v1.0.0 ships as a desktop beta with local-first behavior and optional cloud providers.

## What stays local

- Stored meeting history
- Local transcripts
- Context documents you attach
- Local Whisper runtime and local model configuration
- Ollama model selection and local-only routing state

## What can leave the device

- Prompts and transcript context sent to a cloud LLM provider that you explicitly configure
- Cloud STT traffic if you choose a cloud transcription provider instead of Local Whisper
- Optional telemetry metadata if you enable telemetry in Settings or onboarding

## Telemetry

Telemetry is disabled by default for v1.0.0.

If enabled, Ghost Writer can send:

- anonymous install activity
- app heartbeat metadata
- AI interaction metadata such as provider, model, token counts, and duration
- business events such as checkout flow attempts

Telemetry is intended for launch-quality monitoring and does not, by itself, enable cloud providers.

## Secrets and credentials

- API keys and license keys are stored using Electron `safeStorage` when encryption is available on the machine.
- Ghost Writer no longer falls back to plaintext secret storage if secure storage is unavailable.
- If secure storage is unavailable, saving secrets is blocked instead of silently downgrading storage security.

## Uninstall behavior

- Removing the app bundle or uninstalling the Windows app removes the app itself.
- User data may remain in the app data directory unless you explicitly remove it.

## Support

Questions and issues: [GitHub Issues](https://github.com/Sasidhar-7302/Ghost_Writer/issues)
