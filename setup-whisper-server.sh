#!/bin/bash

# Whisper.cpp Local Server Setup Script
# This script downloads, compiles, and runs whisper.cpp with a local HTTP server

set -e

echo "=== Whisper.cpp Local Server Setup ==="
echo ""

# Configuration
WHISPER_DIR="whisper.cpp"
MODEL_NAME="base"
PORT=8080

# Check for required dependencies
echo "Checking dependencies..."
if ! command -v git &> /dev/null; then
    echo "Error: git is not installed. Please install git first."
    exit 1
fi

if ! command -v make &> /dev/null; then
    echo "Error: make is not installed. Please install build-essential."
    exit 1
fi

# Clone whisper.cpp if not already present
if [ ! -d "$WHISPER_DIR" ]; then
    echo "Cloning whisper.cpp repository..."
    git clone https://github.com/ggerganov/whisper.cpp.git
else
    echo "whisper.cpp directory already exists, skipping clone..."
fi

cd "$WHISPER_DIR"

# Build whisper.cpp
echo "Building whisper.cpp..."
make clean
make

# Download the base model if not present
MODEL_FILE="models/ggml-${MODEL_NAME}.bin"
if [ ! -f "$MODEL_FILE" ]; then
    echo "Downloading ${MODEL_NAME} model..."
    bash ./models/download-ggml-model.sh "$MODEL_NAME"
else
    echo "Model already downloaded: $MODEL_FILE"
fi

# Build the server
echo "Building whisper.cpp server..."
make server

echo ""
echo "=== Setup Complete! ==="
echo ""
echo "To start the Whisper server, run:"
echo "  cd $WHISPER_DIR && ./server -m models/ggml-${MODEL_NAME}.bin --port $PORT"
echo ""
echo "Or use the quick start script:"
echo "  ./start-whisper-server.sh"
echo ""
