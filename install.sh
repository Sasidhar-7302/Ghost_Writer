#!/bin/bash

# ==========================================
# Ghost Writer: Professional Installation Script
# ==========================================

# Colors for terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Ghost Writer Enterprise: Initializing Installation...${NC}"

# Detect OS
OS="$(uname)"
if [ "$OS" != "Darwin" ]; then
  echo -e "${RED}This script currently supports macOS. For Windows, use the professional .exe installer.${NC}"
  exit 1
fi

# Detect Architecture
ARCH=$(uname -m)
if [ "$ARCH" == "arm64" ]; then
    DMG_NAME="Ghost.Writer.arm64.dmg"
else
    DMG_NAME="Ghost.Writer.x64.dmg"
fi

REPO="Sasidhar-7302/Ghost_Writer"
LATEST_RELEASE_URL="https://github.com/$REPO/releases/latest/download/$DMG_NAME"

echo -e "${BLUE}Downloading $DMG_NAME from $REPO...${NC}"

# Create temp directory
TEMP_DIR=$(mktemp -d)
curl -L -o "$TEMP_DIR/$DMG_NAME" "$LATEST_RELEASE_URL"

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to download the installer. Please check your internet connection.${NC}"
    exit 1
fi

echo -e "${GREEN}Download complete. Mounting disk image...${NC}"
hdiutil attach "$TEMP_DIR/$DMG_NAME" -mountpoint "$TEMP_DIR/mount"

echo -e "${BLUE}Installing Ghost Writer to /Applications...${NC}"
cp -R "$TEMP_DIR/mount/Ghost Writer.app" "/Applications/"

hdiutil detach "$TEMP_DIR/mount"

echo -e "${BLUE}Bypassing macOS gatekeeper for enterprise readiness...${NC}"
xattr -d com.apple.quarantine "/Applications/Ghost Writer.app" 2>/dev/null

echo -e "${GREEN}Installation successful! Ghost Writer Enterprise is now in your Applications folder.${NC}"
rm -rf "$TEMP_DIR"
