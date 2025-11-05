#!/bin/bash

# Automated Whisper.cpp WASM Setup Script
# This script automates the entire setup process for Whisper transcription

set -e

EXTENSION_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMP_DIR="/tmp/whisper-setup-$$"
WHISPER_WASM_DIR="$EXTENSION_DIR/whisper-wasm"

echo "=== Whisper.cpp WASM Setup for Chrome Extension ==="
echo ""
echo "Extension directory: $EXTENSION_DIR"
echo "Temporary directory: $TEMP_DIR"
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo "Checking prerequisites..."
echo ""

# Check for git
if ! command_exists git; then
    echo "❌ Error: git is not installed"
    echo "   Install: sudo apt install git  (Ubuntu/Debian)"
    echo "           brew install git       (macOS)"
    exit 1
fi
echo "✓ git found"

# Check for make
if ! command_exists make; then
    echo "❌ Error: make is not installed"
    echo "   Install: sudo apt install build-essential  (Ubuntu/Debian)"
    echo "           xcode-select --install             (macOS)"
    exit 1
fi
echo "✓ make found"

# Check for Emscripten
if ! command_exists emcc; then
    echo "⚠️  Warning: Emscripten (emcc) not found"
    echo ""
    echo "Emscripten is required to build Whisper.cpp WASM."
    echo "Would you like to install it now? (y/n)"
    read -r response

    if [[ "$response" =~ ^[Yy]$ ]]; then
        echo ""
        echo "Installing Emscripten..."
        cd ~
        if [ ! -d "emsdk" ]; then
            git clone https://github.com/emscripten-core/emsdk.git
        fi
        cd emsdk
        ./emsdk install latest
        ./emsdk activate latest
        source ./emsdk_env.sh

        # Add to shell profile
        SHELL_RC="$HOME/.bashrc"
        if [ -n "$ZSH_VERSION" ]; then
            SHELL_RC="$HOME/.zshrc"
        fi

        if ! grep -q "emsdk_env.sh" "$SHELL_RC"; then
            echo "source ~/emsdk/emsdk_env.sh" >> "$SHELL_RC"
            echo "✓ Added Emscripten to $SHELL_RC"
        fi

        echo "✓ Emscripten installed"
    else
        echo ""
        echo "Please install Emscripten manually:"
        echo "  cd ~"
        echo "  git clone https://github.com/emscripten-core/emsdk.git"
        echo "  cd emsdk"
        echo "  ./emsdk install latest"
        echo "  ./emsdk activate latest"
        echo "  source ./emsdk_env.sh"
        echo ""
        echo "Then run this script again."
        exit 1
    fi
else
    echo "✓ Emscripten found ($(emcc --version | head -n1))"
fi

echo ""
echo "All prerequisites met! Starting setup..."
echo ""

# Create temporary directory
mkdir -p "$TEMP_DIR"
cd "$TEMP_DIR"

# Clone whisper.cpp
echo "Step 1/4: Cloning whisper.cpp repository..."
if [ ! -d "whisper.cpp" ]; then
    git clone https://github.com/ggerganov/whisper.cpp
else
    echo "  Already cloned, using existing directory"
fi
cd whisper.cpp

# Build WASM using the stream example which has a working JS API
echo ""
echo "Step 2/4: Building Whisper.cpp WASM (this may take 2-5 minutes)..."
cd examples/stream

# Build the stream example which provides a JS-compatible API
make stream.wasm

# Check if build succeeded
if [ ! -f "stream.wasm" ]; then
    echo "❌ Error: Build failed - stream.wasm not created"
    exit 1
fi
echo "✓ WASM build successful"

# Download model
echo ""
echo "Step 3/4: Downloading Whisper base model (~142MB)..."
cd ..
bash ./models/download-ggml-model.sh base

# Check if model downloaded
if [ ! -f "models/ggml-base.bin" ]; then
    echo "❌ Error: Model download failed"
    exit 1
fi
echo "✓ Model downloaded"

# Copy files to extension
echo ""
echo "Step 4/4: Copying files to extension directory..."
mkdir -p "$WHISPER_WASM_DIR"
cd ../..

echo "  Copying stream.wasm..."
cp examples/stream/stream.wasm "$WHISPER_WASM_DIR/"

echo "  Copying stream.js..."
cp examples/stream/stream.js "$WHISPER_WASM_DIR/"

echo "  Copying ggml-base.bin..."
cp models/ggml-base.bin "$WHISPER_WASM_DIR/"

# Verify files
echo ""
echo "Verifying installation..."
if [ -f "$WHISPER_WASM_DIR/stream.wasm" ] && [ -f "$WHISPER_WASM_DIR/stream.js" ] && [ -f "$WHISPER_WASM_DIR/ggml-base.bin" ]; then
    WASM_SIZE=$(du -h "$WHISPER_WASM_DIR/stream.wasm" | cut -f1)
    JS_SIZE=$(du -h "$WHISPER_WASM_DIR/stream.js" | cut -f1)
    MODEL_SIZE=$(du -h "$WHISPER_WASM_DIR/ggml-base.bin" | cut -f1)

    echo "✓ Installation successful!"
    echo ""
    echo "Files installed:"
    echo "  • stream.wasm ($WASM_SIZE)"
    echo "  • stream.js ($JS_SIZE)"
    echo "  • ggml-base.bin ($MODEL_SIZE)"
    echo ""
else
    echo "❌ Error: File copy failed"
    exit 1
fi

# Cleanup
echo "Cleaning up temporary files..."
cd "$EXTENSION_DIR"
rm -rf "$TEMP_DIR"

echo ""
echo "=== Setup Complete! ==="
echo ""
echo "Next steps:"
echo "1. Open Chrome and go to chrome://extensions/"
echo "2. Find your extension and click the reload icon ⟳"
echo "3. Go to the History page and try transcribing audio!"
echo ""
echo "The first transcription will load the model (~142MB) which takes a few seconds."
echo "After that, transcriptions will be much faster."
echo ""
echo "Enjoy your privacy-focused, free transcription! 🎉"
echo ""
