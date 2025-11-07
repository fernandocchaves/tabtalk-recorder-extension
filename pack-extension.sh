#!/bin/bash

# TabTalk Recorder Extension Packing Script
# This script packages the extension for Chrome Web Store publishing

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}Starting TabTalk Recorder Extension packaging...${NC}"

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}Error: Not in a git repository${NC}"
    exit 1
fi

# Get version from manifest.json
VERSION=$(grep -o '"version": "[^"]*"' manifest.json | cut -d'"' -f4)
echo -e "${BLUE}Extension version: ${VERSION}${NC}"

# Create output directory
OUTPUT_DIR=".output"
if [ ! -d "$OUTPUT_DIR" ]; then
    mkdir -p "$OUTPUT_DIR"
    echo -e "${GREEN}Created output directory: ${OUTPUT_DIR}${NC}"
fi

# Create zip file name
ZIP_NAME="tabtalk-recorder-v${VERSION}.zip"
ZIP_PATH="${OUTPUT_DIR}/${ZIP_NAME}"

# Use git archive to package all tracked files (excluding .git, .gitignore, etc.)
echo -e "${BLUE}Packaging tracked files using git...${NC}"
git archive -o "$ZIP_PATH" HEAD

# Display results
FILE_SIZE=$(du -h "$ZIP_PATH" | cut -f1)
echo -e "${GREEN}✓ Extension packaged successfully!${NC}"
echo -e "${GREEN}  Output: ${ZIP_PATH}${NC}"
echo -e "${GREEN}  Size: ${FILE_SIZE}${NC}"
echo ""
echo -e "${BLUE}Package contents:${NC}"
unzip -l "$ZIP_PATH" | tail -n +4 | head -n -2

echo ""
echo -e "${GREEN}Ready for Chrome Web Store upload!${NC}"
