#!/bin/bash

# Script to download pre-built whisper.cpp WASM files
# These are typically hosted in releases or you need to build them

set -e

echo "=== Whisper.cpp WASM Download Script ==="
echo ""

# Create directory for WASM files
WASM_DIR="whisper-wasm"
mkdir -p "$WASM_DIR"

echo "Whisper.cpp WASM files need to be built from source."
echo ""
echo "Option 1: Build from source (recommended)"
echo "=================================="
echo "1. Clone whisper.cpp:"
echo "   git clone https://github.com/ggerganov/whisper.cpp"
echo "   cd whisper.cpp"
echo ""
echo "2. Install Emscripten (if not already installed):"
echo "   https://emscripten.org/docs/getting_started/downloads.html"
echo ""
echo "3. Build WASM:"
echo "   cd examples/whisper.wasm"
echo "   make"
echo ""
echo "4. Copy the generated files to this directory:"
echo "   cp libmain.js libmain.worker.js /path/to/extension/whisper-wasm/"
echo ""
echo "5. Download a model (e.g., base model):"
echo "   cd ../../"
echo "   bash ./models/download-ggml-model.sh base"
echo "   cp models/ggml-base.bin /path/to/extension/whisper-wasm/"
echo ""
echo "Option 2: Use pre-built files (if available)"
echo "============================================"
echo "Check whisper.cpp releases for pre-built WASM binaries"
echo "https://github.com/ggerganov/whisper.cpp/releases"
echo ""
echo "Required files:"
echo "- libmain.js (main WASM module)"
echo "- libmain.worker.js (worker thread, may be embedded in libmain.js)"
echo "- ggml-base.bin (Whisper model)"
echo ""
