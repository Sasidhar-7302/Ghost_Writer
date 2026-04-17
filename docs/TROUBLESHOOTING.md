# Troubleshooting

## Install issues

### Windows installer fails

- Re-run the PowerShell install command from the README.
- Confirm that the release manifest and checksum files are reachable from GitHub Releases.
- Close any running Ghost Writer process before retrying.

### macOS install fails

- Re-run the bash install command from the README.
- Confirm you are on macOS and using a supported architecture.
- Make sure `python3`, `curl`, `ditto`, and `shasum` are available.

### Checksum mismatch

- Stop immediately and do not run the installer payload.
- Download the release again.
- Compare the file hash against the published `checksums.txt`.

## Runtime issues

### Full Privacy Mode is enabled but not usable

Full Privacy Mode requires:

- Local Whisper runtime
- Local Whisper model
- Ollama running locally
- At least one local text model
- A local vision-capable model if you want screenshot analysis

### No cloud responses

- Add and test the relevant provider API key in Settings.
- Confirm Full Privacy Mode is disabled if you want to use cloud providers.
- Review the active model selection in AI Models settings.

### Installer completed but app is missing

- Windows default path: `%LOCALAPPDATA%\Programs\Ghost Writer`
- macOS default path: `~/Applications/Ghost Writer.app`

## Remote Display issues

### Mobile viewer says "Not Connection" or "Server Offline"

- Ensure the **Server Status** in Settings > Remote Display is green. 
- Confirm your phone is on the **same Wi-Fi** as your computer.
- Disable any VPN on your phone or computer, as they often block local network discovery.
- Check that your computer's firewall is not blocking port `4004`.

### PIN authentication fails

- Verify the PIN in your PC Settings > Remote Display.
- Enter exactly 4 digits.
- The default PIN is `0000`.

### Mobile view not loading (Not Found)

- Restart Ghost Writer to ensure the server picks up the latest configuration.
- Check the terminal/console for error logs if running from source.

## Logs and support

- Use the app’s support and troubleshooting surfaces first.
- File issues at [GitHub Issues](https://github.com/Sasidhar-7302/Ghost_Writer/issues).
