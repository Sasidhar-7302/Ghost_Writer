#!/usr/bin/env bash
set -euo pipefail

REPO_OWNER="Sasidhar-7302"
REPO_NAME="Ghost_Writer"
MANIFEST_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest/download/release-manifest.json"
APP_NAME="Ghost Writer.app"
TARGET_DIR="${HOME}/Applications"
TARGET_APP_PATH="${TARGET_DIR}/${APP_NAME}"
TEMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "${TEMP_DIR}"
}
trap cleanup EXIT

log() {
  printf '[Ghost Writer] %s\n' "$1"
}

fail() {
  printf '[Ghost Writer] %s\n' "$1" >&2
  exit 1
}

ensure_supported_platform() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  if [[ "${os}" != "Darwin" ]]; then
    fail "This installer supports macOS only."
  fi

  if [[ "${arch}" != "arm64" && "${arch}" != "x86_64" ]]; then
    fail "Unsupported macOS architecture: ${arch}."
  fi
}

require_python() {
  command -v python3 >/dev/null 2>&1 || fail "python3 is required to parse the release manifest."
}

fetch_manifest() {
  log "Fetching release manifest..."
  curl -fsSL "${MANIFEST_URL}" -o "${TEMP_DIR}/release-manifest.json" || fail "Unable to download the release manifest."
}

read_manifest_value() {
  local expression="$1"
  python3 - "$expression" "${TEMP_DIR}/release-manifest.json" <<'PY'
import json
import sys

expr = sys.argv[1]
manifest_path = sys.argv[2]

with open(manifest_path, "r", encoding="utf-8") as handle:
    manifest = json.load(handle)

namespace = {"manifest": manifest}
value = eval(expr, {"__builtins__": {}}, namespace)
if value is None:
    sys.exit(1)
print(value)
PY
}

resolve_mac_asset() {
  local arch="$1"
  python3 - "${arch}" "${TEMP_DIR}/release-manifest.json" <<'PY'
import json
import sys

arch = sys.argv[1]
manifest_path = sys.argv[2]

with open(manifest_path, "r", encoding="utf-8") as handle:
    manifest = json.load(handle)

assets = manifest.get("assets", [])
matching = [
    asset for asset in assets
    if asset.get("platform") == "macos" and asset.get("kind") == "zip"
]

preferred = None
for asset in matching:
    if asset.get("arch") == arch:
        preferred = asset
        break

if preferred is None:
    for asset in matching:
        if asset.get("arch") == "universal":
            preferred = asset
            break

if preferred is None:
    sys.exit(1)

print(json.dumps(preferred))
PY
}

download_asset() {
  local url="$1"
  local target="$2"
  log "Downloading installer payload..."
  curl -fsSL "${url}" -o "${target}" || fail "Failed to download ${url}."
}

verify_checksum() {
  local target="$1"
  local expected="$2"
  log "Verifying checksum..."
  local actual
  actual="$(shasum -a 256 "${target}" | awk '{print $1}')"
  if [[ "${actual}" != "${expected}" ]]; then
    fail "Checksum mismatch detected. The installer payload was not used."
  fi
}

stop_running_app() {
  if pgrep -f "Ghost Writer.app" >/dev/null 2>&1; then
    log "Stopping running Ghost Writer process..."
    osascript -e 'tell application "Ghost Writer" to quit' >/dev/null 2>&1 || true
    pkill -f "Ghost Writer.app" >/dev/null 2>&1 || true
    sleep 1
  fi
}

install_zip_payload() {
  local zip_path="$1"

  mkdir -p "${TARGET_DIR}"
  rm -rf "${TEMP_DIR}/unzipped"
  mkdir -p "${TEMP_DIR}/unzipped"

  log "Extracting app bundle..."
  ditto -x -k "${zip_path}" "${TEMP_DIR}/unzipped"

  local source_app
  source_app="$(find "${TEMP_DIR}/unzipped" -maxdepth 2 -name "${APP_NAME}" -type d | head -n 1)"
  [[ -n "${source_app}" ]] || fail "The downloaded archive did not contain ${APP_NAME}."

  rm -rf "${TARGET_APP_PATH}"
  ditto "${source_app}" "${TARGET_APP_PATH}"
  xattr -dr com.apple.quarantine "${TARGET_APP_PATH}" >/dev/null 2>&1 || true
}

verify_install() {
  [[ -d "${TARGET_APP_PATH}" ]] || fail "Ghost Writer was not installed into ${TARGET_APP_PATH}."
  log "Install verified at ${TARGET_APP_PATH}"
}

main() {
  ensure_supported_platform
  require_python
  fetch_manifest

  local arch asset_json file_name latest_url checksum zip_path
  arch="$(uname -m)"
  asset_json="$(resolve_mac_asset "${arch}")" || fail "No macOS zip installer was published in the release manifest."

  file_name="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["fileName"])' "${asset_json}")"
  latest_url="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["latestUrl"])' "${asset_json}")"
  checksum="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["checksumSha256"])' "${asset_json}")"
  zip_path="${TEMP_DIR}/${file_name}"

  stop_running_app
  download_asset "${latest_url}" "${zip_path}"
  verify_checksum "${zip_path}" "${checksum}"
  install_zip_payload "${zip_path}"
  verify_install

  log "Install complete. Launch with: open \"${TARGET_APP_PATH}\""
}

main "$@"
