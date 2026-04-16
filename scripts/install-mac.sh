#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if [[ -f "$SCRIPT_DIR/install.sh" ]]; then
    exec "$SCRIPT_DIR/install.sh" "$@"
fi

curl -fsSL "https://raw.githubusercontent.com/chintuai2026/Ghost_Writer/main/install.sh" | bash
