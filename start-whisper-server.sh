#!/bin/bash

# Quick script to start the Whisper.cpp server
# Run this after completing setup-whisper-server.sh

WHISPER_DIR="whisper.cpp"
MODEL="models/ggml-base.bin"
PORT=8080

if [ ! -d "$WHISPER_DIR" ]; then
    echo "Error: whisper.cpp not found. Please run setup-whisper-server.sh first."
    exit 1
fi

if [ ! -f "$WHISPER_DIR/$MODEL" ]; then
    echo "Error: Model not found. Please run setup-whisper-server.sh first."
    exit 1
fi

echo "Starting Whisper.cpp server on port $PORT..."
echo "Press Ctrl+C to stop the server"
echo ""

cd "$WHISPER_DIR"
./server -m "$MODEL" --port "$PORT" --convert
