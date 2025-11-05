# Chrome Audio Recorder Extension

A powerful Chrome extension that simultaneously records tab audio and microphone input with advanced audio processing and AI-powered transcription.

## Overview

This extension allows you to record audio from both the current browser tab and your microphone simultaneously, with the ability to transcribe recordings using AI. It's perfect for:

- Creating voiceovers for web content
- Recording commentary while browsing
- Capturing both system audio and voice input
- Transcribing interviews, podcasts, or any audio content
- Creating searchable text from audio recordings

## Features

### Recording
- **Dual Audio Capture**: Records both tab audio and microphone simultaneously
- **Advanced Audio Processing**:
  - Noise suppression for microphone input
  - Echo cancellation
  - Automatic gain control
  - Customizable volume levels (1.0x for tab, 1.5x for mic)
- **Background Recording**: Continue recording even when popup is closed
- **Visual Status**: Recording indicator and status updates
- **WebM Format**: High-quality audio recording

### Transcription (NEW!)
- **AI-Powered**: Uses Whisper.cpp WASM for accurate speech-to-text
- **Runs in Browser**: No server needed, everything runs locally in Chrome
- **100% Private**: All processing happens on your computer, audio never uploaded
- **Completely Free**: No API costs, unlimited transcriptions
- **High Quality**: Professional-grade transcription (OpenAI Whisper model)
- **Offline**: Works without internet after initial setup
- **Real-time Progress**: Shows loading and transcription status
- **Copy to Clipboard**: Easy one-click copy of transcription text

### History Management
- **Beautiful UI**: Modern, gradient-based interface with smooth animations
- **Audio Playback**: Built-in player with progress bar and time display
- **Recording Organization**: Automatically sorted by date with formatted timestamps
- **Quick Actions**: Download, delete, transcribe, and play recordings

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory
5. The extension icon will appear in your toolbar
6. Pin the extension for easy access

## Usage

### Recording Audio

1. Click the extension icon in your toolbar
2. Navigate to any regular webpage (not Chrome system pages)
3. Click "Start Recording" in the popup
4. The extension will record both:
   - Tab audio (what's playing on the page)
   - Microphone input (your voice)
5. Click "Stop Recording" when finished
6. Recording is automatically saved to your history

### Viewing History

1. Click "View History" in the popup
2. See all your recordings with timestamps
3. Click the play button to listen to recordings
4. Progress bar shows current playback position
5. Use download button to save recordings locally

### Setting Up Transcription

**Whisper WASM Setup (One-Time, ~10 minutes)**

The extension uses Whisper.cpp compiled to WebAssembly for in-browser transcription:

```bash
# 1. Install Emscripten (if not installed)
cd ~
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh

# 2. Build Whisper.cpp WASM
cd /tmp
git clone https://github.com/ggerganov/whisper.cpp
cd whisper.cpp/examples/whisper.wasm
make

# 3. Download model
cd ../..
bash ./models/download-ggml-model.sh base

# 4. Copy to extension
EXTENSION_DIR="/path/to/chrome-recorder-extension"
mkdir -p "$EXTENSION_DIR/whisper-wasm"
cp examples/whisper.wasm/libmain.js "$EXTENSION_DIR/whisper-wasm/"
cp models/ggml-base.bin "$EXTENSION_DIR/whisper-wasm/"

# 5. Reload extension in Chrome
```

**For detailed setup instructions, see [SETUP_WHISPER_WASM.md](SETUP_WHISPER_WASM.md)**

**What you'll need:**
- `libmain.js` (~8MB) - WASM module
- `ggml-base.bin` (~142MB) - Whisper model

After setup, transcription works completely offline in your browser!

### Transcribing Audio

1. Open the History page
2. Click the transcription button (document icon) on any recording
3. Wait for transcription to complete (usually 10-30 seconds)
4. View the transcription text below the recording
5. Click "Copy" to copy transcription to clipboard
6. Click the transcription button again to hide/show transcription

**Note**: If you haven't configured an API key, you'll see instructions on how to set it up.

## Technical Details

### Architecture
- **Manifest V3**: Uses modern Chrome extension APIs
- **Service Worker**: Manages extension lifecycle and icon updates
- **Offscreen Document**: For audio capture with MediaRecorder API
- **Chrome Storage**: Stores recordings as data URLs
- **Web Audio API**: Advanced audio mixing and processing
- **WebAssembly**: For running Whisper.cpp in the browser

### Transcription Technology
- **Model**: OpenAI Whisper (base model) via WASM
- **Processing**: Entirely in-browser using WebAssembly
- **Privacy**: Audio processed locally, never leaves your computer
- **Audio Format**: Automatically converts WebM to 16kHz PCM
- **Languages**: Currently configured for English (auto-detection supported)
- **Cost**: FREE (no API, no server)

### File Structure
- `manifest.json` - Extension configuration
- `popup.html/js/css` - Main extension popup UI
- `history.html/js/css` - Recording history page
- `transcription-service.js` - Whisper transcription service
- `offscreen.html/js` - Audio recording context
- `service-worker.js` - Background service worker
- `fontawesome/` - Icon library

## Permissions Required

- **tabCapture**: For capturing tab audio
- **storage**: For saving recordings
- **activeTab**: For accessing current tab information
- **offscreen**: For background recording capability
- **host_permissions**: For all URLs (`*://*/*`)

## Performance Notes

- **Recording**: No performance impact during recording
- **Transcription**: 10-30 seconds depending on audio length and CPU
- **Memory usage**:
  - Extension: Minimal
  - WASM transcription: ~200-500MB RAM while running
- **Storage**:
  - Recordings: Chrome local storage (as data URLs)
  - WASM files: ~150MB (libmain.js + model)
- **Costs**: FREE (no API, runs locally)

## Browser Support

- Chrome 116+ (required)
- Edge 116+ (Chromium-based, untested)

## Limitations

- Cannot record on Chrome system pages (`chrome://`, `chrome-extension://`)
- Transcription requires WASM setup (one-time, ~10 minutes)
- WASM files are large (~150MB total)
- Transcription requires ~200-500MB RAM while running
- Audio limited to ~2 minutes for transcription (browser memory limits)
- Currently configured for English (multilingual supported)
- Recordings stored locally consume browser storage quota

## Development

### Modifying Transcription

**Use different Whisper model:**

Edit `transcription-service.js` line 87:
```javascript
const modelPath = chrome.runtime.getURL('whisper-wasm/ggml-tiny.bin'); // Change model
```

Available models:
- `ggml-tiny.bin` (~75MB) - Fastest
- `ggml-base.bin` (~142MB) - Recommended
- `ggml-small.bin` (~466MB) - Best quality for browser

**Multilingual transcription:**

Whisper WASM automatically detects language. No code changes needed for multilingual support.

### Adding Features

The extension is modular:
- **UI changes**: Edit HTML/CSS files
- **Recording logic**: Modify `offscreen.js`
- **Storage**: Update `service-worker.js`
- **Transcription**: Enhance `transcription-service.js`

## Troubleshooting

### Transcription not working

**"Whisper WASM module not found"**
- WASM files not in `whisper-wasm/` directory
- Follow setup steps in [SETUP_WHISPER_WASM.md](SETUP_WHISPER_WASM.md)
- Verify `libmain.js` exists in `whisper-wasm/`
- Reload extension after adding files

**"Model file not found"**
- Model not downloaded or in wrong location
- Verify `ggml-base.bin` exists in `whisper-wasm/`
- Check file size (~142MB for base model)
- Re-download if corrupted

**Slow transcription**
- Normal: 10-30 seconds depending on audio length
- Use tiny model for faster transcription (lower quality)
- Close other browser tabs to free up CPU
- Audio longer than 2 minutes may be very slow

**Poor transcription quality**
- Ensure audio has clear speech
- Check audio isn't too quiet or distorted
- Try small model for better quality (see setup guide)
- Reduce background noise in recordings

**Out of memory errors**
- Browser running out of memory
- Use tiny model instead of base
- Close other tabs
- Restart browser
- Transcribe shorter audio clips

**Browser compatibility**
- Requires Chrome 116+ with WASM SIMD support
- Check chrome://gpu to verify WASM support
- Try latest Chrome version

## Credits

- **Whisper Model**: OpenAI
- **Whisper.cpp**: Georgi Gerganov and contributors
- **Icons**: Font Awesome 6.5.1
- **UI Design**: Custom gradient-based modern design

## License

See LICENSE file for details.
