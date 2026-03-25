#!/bin/bash

# Ghost Writer macOS Seamless Installer
# This script downloads the latest DMG, installs it, and fixes Gatekeeper "damaged" errors.

set -e

REPO="chintuai2026/Ghost_Writer"
APP_NAME="Ghost Writer"
INSTALL_DIR="/Applications"

echo "------------------------------------------"
echo "👻 Ghost Writer macOS Installer"
echo "------------------------------------------"

# 1. Detect Architecture
ARCH=$(uname -m)
if [ "$ARCH" == "arm64" ]; then
    FILE_PATTERN="arm64.dmg"
    echo "🔍 Architecture: Apple Silicon (M1/M2/M3)"
else
    FILE_PATTERN="x64.dmg"
    echo "🔍 Architecture: Intel Mac"
fi

# 2. Get Latest Release Info
echo "📡 Fetching latest release information..."
RELEASE_DATA=$(curl -s https://api.github.com/repos/$REPO/releases/latest)
DOWNLOAD_URL=$(echo "$RELEASE_DATA" | grep "browser_download_url.*$FILE_PATTERN" | cut -d '"' -f 4 | head -n 1)

if [ -z "$DOWNLOAD_URL" ]; then
    echo "❌ Error: Could not find the latest DMG for $ARCH."
    echo "Please check https://github.com/$REPO/releases"
    exit 1
fi

VERSION=$(echo "$RELEASE_DATA" | grep "tag_name" | cut -d '"' -f 4)
echo "✅ Found version $VERSION"

# 3. Download
TEMP_DMG="/tmp/GhostWriter_Install.dmg"
echo "📥 Downloading Ghost Writer..."
curl -L -# -o "$TEMP_DMG" "$DOWNLOAD_URL"

# 4. Mount
echo "📦 Mounting Disk Image..."
# We use a specific mount point to avoid confusion
MOUNT_DIR="/tmp/GW_MOUNT"
mkdir -p "$MOUNT_DIR"
hdiutil attach "$TEMP_DMG" -mountpoint "$MOUNT_DIR" -quiet

# 5. Install
echo "🚀 Copying to $INSTALL_DIR (you may be asked for your password)..."
# Use sudo for Applications folder if needed, but usually not required for user-owned dirs
if [ -d "$INSTALL_DIR/$APP_NAME.app" ]; then
    echo "⚠️ Removing previous version..."
    rm -rf "$INSTALL_DIR/$APP_NAME.app"
fi
cp -R "$MOUNT_DIR/$APP_NAME.app" "$INSTALL_DIR/"

# 6. Fix Quarantine (The "Damaged" fix)
echo "🛡️ Fixing macOS security permissions..."
xattr -cr "$INSTALL_DIR/$APP_NAME.app"

# 7. Cleanup
echo "🧹 Cleaning up..."
hdiutil detach "$MOUNT_DIR" -quiet
rm -rf "$MOUNT_DIR"
rm "$TEMP_DMG"

echo "------------------------------------------"
echo "✅ Successfully Installed Ghost Writer $VERSION!"
echo "🎉 You can find it in your Applications or Launchpad."
echo "------------------------------------------"

# 8. Launch
read -p "Do you want to launch Ghost Writer now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    open "$INSTALL_DIR/$APP_NAME.app"
fi
