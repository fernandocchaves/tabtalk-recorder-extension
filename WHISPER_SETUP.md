# Local Whisper Server Setup Guide

This guide will help you set up a local Whisper.cpp server for transcription. This approach is:
- **Free**: No API costs
- **Private**: Audio never leaves your computer
- **Offline**: Works without internet (after initial setup)
- **Fast**: Model stays loaded in memory

## Prerequisites

Make sure you have the following installed:

- **Git**: `git --version`
- **Make & GCC**: `make --version && gcc --version`
- **Curl**: `curl --version`

### Installing Prerequisites

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install git build-essential curl
```

**macOS:**
```bash
# Install Xcode Command Line Tools
xcode-select --install

# Install Homebrew if not already installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

**Arch Linux:**
```bash
sudo pacman -S git base-devel curl
```

## Quick Setup (Automated)

The easiest way to set up the Whisper server:

```bash
# Navigate to the extension directory
cd /path/to/chrome-recorder-extension

# Run the setup script (downloads whisper.cpp, compiles it, downloads model)
./setup-whisper-server.sh

# Start the server
./start-whisper-server.sh
```

The server will start on `http://localhost:8080` and you're ready to transcribe!

## Manual Setup

If you prefer to set things up manually:

### 1. Clone whisper.cpp

```bash
git clone https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp
```

### 2. Build whisper.cpp

```bash
make
```

### 3. Download the Whisper Model

Download the base model (recommended for good balance of speed and accuracy):

```bash
bash ./models/download-ggml-model.sh base
```

**Available models** (larger = better quality but slower):
- `tiny`: Fastest, lowest quality (~75MB)
- `base`: Good balance (~142MB) **← Recommended**
- `small`: Better quality (~466MB)
- `medium`: High quality (~1.5GB)
- `large`: Best quality (~2.9GB)

### 4. Build the Server

```bash
make server
```

### 5. Start the Server

```bash
./server -m models/ggml-base.bin --port 8080 --convert
```

**Server options:**
- `-m`: Path to the model file
- `--port`: Port number (default: 8080)
- `--convert`: Automatically convert audio formats
- `-t`: Number of threads (default: 4)

## Using the Server

Once the server is running:

1. Open the Chrome extension
2. Go to History page
3. Click the transcribe button on any recording
4. The extension will automatically use the local server

## Configuration

### Custom Port

If you need to use a different port:

1. Start server with custom port:
   ```bash
   ./server -m models/ggml-base.bin --port 9000 --convert
   ```

2. Configure extension to use it:
   ```javascript
   // In browser console (F12)
   chrome.storage.local.set({ whisperServerUrl: 'http://localhost:9000' })
   ```

### Better Performance

For faster transcription, use more CPU threads:

```bash
./server -m models/ggml-base.bin --port 8080 --convert -t 8
```

Replace `8` with the number of CPU cores you want to use.

### GPU Acceleration (Advanced)

For NVIDIA GPUs with CUDA:

```bash
# Build with CUDA support
make clean
WHISPER_CUBLAS=1 make server

# Run with GPU
./server -m models/ggml-base.bin --port 8080 --convert
```

For Apple Silicon (M1/M2) with Metal:

```bash
# Build with Metal support
make clean
WHISPER_METAL=1 make server

# Run with Metal acceleration
./server -m models/ggml-base.bin --port 8080 --convert
```

## Running as a Background Service

### Using systemd (Linux)

Create a service file `/etc/systemd/system/whisper.service`:

```ini
[Unit]
Description=Whisper.cpp Transcription Server
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/path/to/whisper.cpp
ExecStart=/path/to/whisper.cpp/server -m models/ggml-base.bin --port 8080 --convert
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable whisper
sudo systemctl start whisper
sudo systemctl status whisper
```

### Using launchd (macOS)

Create `~/Library/LaunchAgents/com.whisper.server.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.whisper.server</string>
    <key>ProgramArguments</key>
    <array>
        <string>/path/to/whisper.cpp/server</string>
        <string>-m</string>
        <string>/path/to/whisper.cpp/models/ggml-base.bin</string>
        <string>--port</string>
        <string>8080</string>
        <string>--convert</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
```

Load the service:
```bash
launchctl load ~/Library/LaunchAgents/com.whisper.server.plist
```

## Troubleshooting

### Server won't start

**Error: "Cannot bind to port 8080"**
- Port is already in use
- Solution: Use a different port with `--port 8081`

**Error: "Model file not found"**
- Model wasn't downloaded
- Solution: Run `bash ./models/download-ggml-model.sh base`

**Error: "Permission denied"**
- Server binary not executable
- Solution: `chmod +x server`

### Extension can't connect

**Check if server is running:**
```bash
curl http://localhost:8080
```

Should return: `Whisper.cpp Server`

**Test transcription endpoint:**
```bash
curl -X POST http://localhost:8080/inference \
  -F "file=@test-audio.wav"
```

**CORS issues:**
- The whisper.cpp server should handle CORS automatically
- If issues persist, check browser console for specific errors

### Poor transcription quality

- Try a larger model (`small` or `medium`)
- Ensure audio has clear speech
- Check audio isn't too compressed or low quality

### Slow transcription

- Use more threads: `-t 8`
- Use GPU acceleration (CUDA/Metal)
- Use a smaller model (`tiny` or `base`)
- Ensure server isn't running other heavy processes

## API Reference

The local server provides these endpoints:

### POST /inference

Transcribe audio file.

**Request:**
- Form-data with `file` field containing audio
- Optional: `temperature` (0.0-1.0, default 0.0)
- Optional: `response_format` (json/text, default json)

**Response:**
```json
{
  "text": "Transcribed text appears here"
}
```

### GET /

Health check endpoint.

**Response:**
```
Whisper.cpp Server
```

## Updating

To update whisper.cpp to the latest version:

```bash
cd whisper.cpp
git pull
make clean
make
make server
```

Models don't need to be re-downloaded unless you want a different one.

## Uninstalling

```bash
# Stop the server (Ctrl+C or kill the process)

# Remove whisper.cpp directory
cd /path/to/chrome-recorder-extension
rm -rf whisper.cpp

# Remove systemd service if installed
sudo systemctl stop whisper
sudo systemctl disable whisper
sudo rm /etc/systemd/system/whisper.service
```

## Resources

- [whisper.cpp GitHub](https://github.com/ggerganov/whisper.cpp)
- [OpenAI Whisper](https://github.com/openai/whisper)
- [Extension Issues](https://github.com/your-repo/issues)

## Support

If you encounter issues:

1. Check this troubleshooting guide
2. Check whisper.cpp issues: https://github.com/ggerganov/whisper.cpp/issues
3. Open an issue in the extension repository
