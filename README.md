# Chrome Audio Recorder Extension

A powerful Chrome extension that simultaneously records tab audio and microphone input with AI-powered transcription capabilities.

## Features

### Recording
- **Dual Audio Capture**: Records both tab audio and microphone simultaneously
- **Advanced Audio Processing**: Noise suppression, echo cancellation, automatic gain control
- **Background Recording**: Continue recording when popup is closed
- **WebM Format**: High-quality audio recording
- **Modern UI**: Clean, gradient-based interface with smooth animations

### AI Transcription
- **Powered by Google Gemini API**
- **FREE Tier Available**: 15 requests/min, 1500 requests/day
- **Excellent Accuracy**: Uses Gemini 2.5 Flash model
- **Fast Processing**: Transcription completes in seconds
- **Easy to Use**: One-click transcription with API key saved locally
- **Copy to Clipboard**: Quick copy functionality

### History Management
- **Audio Playback**: Built-in player with progress tracking
- **Auto-Organization**: Recordings sorted by date with timestamps
- **Quick Actions**: Play, download, delete, and transcribe recordings
- **Beautiful Interface**: Modern design with intuitive controls

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (top right toggle)
4. Click "Load unpacked" and select the extension directory
5. Pin the extension icon to your toolbar for easy access

## Quick Start

### Recording Audio

1. Click the extension icon in your toolbar
2. Navigate to any webpage (not chrome:// system pages)
3. Click "Start Recording"
4. Both tab audio and microphone will be recorded
5. Click "Stop Recording" when finished
6. Recording is automatically saved to history

### Transcription Setup (2 minutes)

1. **Get FREE Gemini API Key**
   - Visit: https://aistudio.google.com/app/apikey
   - Click "Create API key" (no credit card required)
   - Copy the key

2. **Start Transcribing**
   - Click "View History" in the popup
   - Click the transcription button (document icon) on any recording
   - Paste your API key when prompted (saved automatically)
   - View transcription results in seconds

## Technical Details

### Architecture
- **Manifest V3**: Modern Chrome extension APIs
- **Service Worker**: Manages extension lifecycle and state
- **Offscreen Document**: Handles audio capture with MediaRecorder API
- **Chrome Storage**: Stores recordings and settings locally
- **Web Audio API**: Advanced audio mixing and processing

### Transcription
- **Service**: Google Gemini 2.5 Flash API
- **Free Tier**: 15 requests/min, 1500 requests/day
- **Privacy**: API key stored locally in browser
- **Format Support**: Handles all audio formats (WebM, MP3, WAV)

### File Structure
```
chrome-recorder-extension/
├── manifest.json              # Extension configuration
├── popup.html/js/css         # Main extension popup
├── history.html/js/css       # Recording history page
├── offscreen.html/js         # Audio capture context
├── service-worker.js         # Background service worker
├── permission.html/js        # Microphone permission handler
├── transcription-service-gemini.js  # AI transcription service
├── icons/                    # Extension icons
└── fontawesome/             # Icon library
```

## Permissions Required

- **tabCapture**: For capturing tab audio
- **storage**: For saving recordings and settings
- **activeTab**: For accessing current tab information
- **offscreen**: For background recording capability
- **host_permissions**: For all URLs to enable recording

## Browser Support

- Chrome 116+ (required)
- Edge 116+ (Chromium-based, should work but untested)

## Limitations

- Cannot record on Chrome system pages (chrome://, chrome-extension://)
- Transcription requires internet connection for API calls
- Free tier has rate limits (15/min, 1500/day)
- Recordings stored locally consume browser storage quota
- Microphone permission required for recording

## Troubleshooting

### Transcription Issues

**"Enter your Google Gemini API key"**
- Get a FREE key from https://aistudio.google.com/app/apikey
- No credit card required for free tier

**"API request failed"**
- Check internet connection
- Verify API key is valid
- Check if rate limit exceeded (15/min, 1500/day)

**"No speech detected"**
- Ensure recording contains clear speech
- Test audio playback first
- Check microphone was active during recording

### Recording Issues

**No audio captured**
- Grant microphone permission
- Ensure tab has audio playing
- Avoid chrome:// system pages

**Extension not working**
- Reload extension in chrome://extensions/
- Check console for errors
- Verify all files are present

### Clear API Key
Open browser console on History page:
```javascript
chrome.storage.local.remove('gemini_api_key');
location.reload();
```

## Development

### Adding Features
- **UI changes**: Edit HTML/CSS files
- **Recording logic**: Modify [offscreen.js](offscreen.js)
- **Storage**: Update [service-worker.js](service-worker.js)
- **Transcription**: Enhance [transcription-service-gemini.js](transcription-service-gemini.js)

### Code Quality
The extension follows modern best practices:
- Clean separation of concerns
- Modular architecture
- Comprehensive error handling
- User-friendly notifications

See [DEVELOPMENT.md](DEVELOPMENT.md) for detailed development notes.

## Credits

- **Gemini API**: Google AI
- **Icons**: Font Awesome 6.5.1
- **UI Design**: Custom gradient-based modern design

## License

See LICENSE file for details.

## Support

For issues or questions:
1. Check the Troubleshooting section above
2. Review [DEVELOPMENT.md](DEVELOPMENT.md) for technical details
3. Open an issue on GitHub

---

**Made with Chrome Extension APIs** | **Powered by Google Gemini**
