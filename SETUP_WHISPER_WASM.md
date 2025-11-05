# Whisper WASM Setup Guide

This guide explains how to set up Whisper.cpp WASM for transcription in the Chrome extension.

## Overview

The extension uses Whisper.cpp compiled to WebAssembly (WASM) to run transcription entirely in your browser. This means:

- ✓ **Completely Free**: No API costs
- ✓ **100% Private**: Audio never leaves your computer
- ✓ **Offline**: Works without internet (after initial setup)
- ✓ **No Server**: Everything runs in the browser

## Prerequisites

- **Emscripten SDK**: For compiling C++ to WASM
- **Git**: For cloning repositories
- **Make**: For building
- **~1GB free disk space**: For whisper.cpp and models

## Step 1: Install Emscripten

Emscripten is required to compile whisper.cpp to WASM.

### Linux/macOS:

```bash
# Clone emsdk
cd ~
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk

# Install latest SDK
./emsdk install latest
./emsdk activate latest

# Add to PATH (add this to your ~/.bashrc or ~/.zshrc)
source ~/emsdk/emsdk_env.sh
```

### Verify installation:

```bash
emcc --version
# Should output something like: emcc (Emscripten gcc/clang-like replacement) 3.1.x
```

## Step 2: Build Whisper.cpp WASM

```bash
# Clone whisper.cpp
cd /tmp
git clone https://github.com/ggerganov/whisper.cpp
cd whisper.cpp

# Navigate to WASM example
cd examples/whisper.wasm

# Build WASM (this takes a few minutes)
make

# You should now have these files:
# - libmain.js (~8MB)
# - libmain.worker.js (may be embedded in libmain.js with newer Emscripten)
```

## Step 3: Download Whisper Model

```bash
# Go back to whisper.cpp root
cd ../..

# Download the base model (recommended)
bash ./models/download-ggml-model.sh base

# The model will be at: models/ggml-base.bin (~142MB)
```

### Available Models:

| Model  | Size   | Speed          | Quality |
|--------|--------|----------------|---------|
| tiny   | ~75MB  | Fastest        | Lower   |
| base   | ~142MB | Fast ← **Recommended** | Good    |
| small  | ~466MB | Moderate       | Better  |
| medium | ~1.5GB | Slower         | High    |

**Note**: The extension currently supports models up to `small` in the browser.

## Step 4: Copy Files to Extension

```bash
# Get your extension directory path
EXTENSION_DIR="/path/to/chrome-recorder-extension"

# Create whisper-wasm directory
mkdir -p "$EXTENSION_DIR/whisper-wasm"

# Copy WASM files
cp examples/whisper.wasm/libmain.js "$EXTENSION_DIR/whisper-wasm/"

# Copy worker file if it exists separately
if [ -f examples/whisper.wasm/libmain.worker.js ]; then
  cp examples/whisper.wasm/libmain.worker.js "$EXTENSION_DIR/whisper-wasm/"
fi

# Copy model
cp models/ggml-base.bin "$EXTENSION_DIR/whisper-wasm/"
```

## Step 5: Verify Files

Your extension directory should now have:

```
chrome-recorder-extension/
├── whisper-wasm/
│   ├── libmain.js          (~8MB)
│   ├── libmain.worker.js   (optional, may be embedded)
│   └── ggml-base.bin       (~142MB)
├── manifest.json
├── history.html
├── transcription-service.js
└── ...
```

## Step 6: Reload Extension

1. Open Chrome and go to `chrome://extensions/`
2. Find your extension
3. Click the reload icon ⟳
4. The extension is now ready to transcribe!

## Testing

1. Record some audio using the extension
2. Go to History page
3. Click the transcribe button
4. You should see:
   - "Loading Whisper WASM module..."
   - "Downloading model..."
   - "Transcribing..."
   - Transcription result!

## Troubleshooting

### "Whisper WASM module not found"

**Problem**: libmain.js not found or not accessible

**Solutions**:
- Verify `libmain.js` exists in `whisper-wasm/` directory
- Check file permissions (should be readable)
- Reload the extension
- Check browser console (F12) for specific errors

### "Model file not found"

**Problem**: ggml-base.bin not found

**Solutions**:
- Verify `ggml-base.bin` exists in `whisper-wasm/` directory
- Check the file size (~142MB for base model)
- Re-download the model if corrupted
- Make sure you copied the correct model file

### Transcription fails or returns empty text

**Possible causes**:
- Audio file is empty or corrupted
- Audio is too long (>120 seconds)
- Audio has no speech
- Model not loaded correctly

**Solutions**:
- Try with a shorter audio clip
- Ensure audio has clear speech
- Check browser console for errors
- Try reloading the extension

### "Out of memory" errors

**Problem**: Browser running out of memory

**Solutions**:
- Use a smaller model (tiny instead of base)
- Close other tabs
- Restart browser
- Use a computer with more RAM

### Build errors

**Emscripten not found**:
```bash
source ~/emsdk/emsdk_env.sh
emcc --version
```

**Make errors**:
- Ensure you're in `examples/whisper.wasm/` directory
- Check that Emscripten is activated
- Try `make clean` then `make` again

## Performance Tips

### Faster Transcription

1. **Use tiny model**: Faster but less accurate
   ```bash
   bash ./models/download-ggml-model.sh tiny
   cp models/ggml-tiny.bin "$EXTENSION_DIR/whisper-wasm/"
   ```
   Then update `transcription-service.js` line 87 to use `ggml-tiny.bin`

2. **Use modern browser**: Chrome/Edge with latest version

3. **Close other tabs**: Free up RAM and CPU

### Better Quality

1. **Use small model**: Better accuracy but slower
   ```bash
   bash ./models/download-ggml-model.sh small
   cp models/ggml-small.bin "$EXTENSION_DIR/whisper-wasm/"
   ```
   Then update `transcription-service.js` line 87 to use `ggml-small.bin`

2. **Record in quiet environment**: Less background noise

3. **Use good microphone**: Better input quality

## Advanced Configuration

### Using a Different Model

Edit `transcription-service.js` line 87:

```javascript
const modelPath = chrome.runtime.getURL('whisper-wasm/ggml-tiny.bin'); // Change model here
```

### Adjusting WASM Parameters

Edit `transcription-service.js` around line 173 to modify whisper parameters:

```javascript
// Change number of threads (if supported)
this.whisperModule.setValue(params + 0, 4, 'i32'); // n_threads = 4

// Enable translation instead of transcription
this.whisperModule.setValue(params + 8, 1, 'i32'); // translate = true
```

## Building from Latest Source

To get the latest whisper.cpp WASM:

```bash
cd whisper.cpp
git pull origin master
cd examples/whisper.wasm
make clean
make
```

Then copy the updated files to your extension.

## Alternative: Pre-built Binaries

Some developers share pre-built WASM files:

1. Check whisper.cpp releases: https://github.com/ggerganov/whisper.cpp/releases
2. Look for WASM builds or "web" builds
3. Download and extract to `whisper-wasm/` directory

**Note**: Always verify the source of pre-built binaries.

## File Sizes

Typical sizes:
- `libmain.js`: ~8-10MB
- `ggml-tiny.bin`: ~75MB
- `ggml-base.bin`: ~142MB
- `ggml-small.bin`: ~466MB

Total extension size with base model: **~150MB**

## Updating

To update whisper.cpp:

1. Pull latest changes: `cd whisper.cpp && git pull`
2. Rebuild WASM: `cd examples/whisper.wasm && make clean && make`
3. Copy new files to extension
4. Reload extension

Models don't need to be re-downloaded unless you want a different one.

## Resources

- [Whisper.cpp GitHub](https://github.com/ggerganov/whisper.cpp)
- [Whisper.cpp WASM Example](https://github.com/ggerganov/whisper.cpp/tree/master/examples/whisper.wasm)
- [Emscripten Documentation](https://emscripten.org/docs/getting_started/downloads.html)
- [OpenAI Whisper Paper](https://arxiv.org/abs/2212.04356)

## Support

If you encounter issues:

1. Check this troubleshooting guide
2. Check whisper.cpp issues: https://github.com/ggerganov/whisper.cpp/issues
3. Open an issue in the extension repository with:
   - Browser version
   - Error messages from console
   - Steps to reproduce
