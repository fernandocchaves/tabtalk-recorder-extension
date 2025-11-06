# TabTalk Recorder

> Record browser tab audio and microphone simultaneously with AI-powered transcription

[![Chrome Web Store](https://img.shields.io/badge/Chrome-Web%20Store-blue?logo=google-chrome)](https://chrome.google.com/webstore)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## What is TabTalk Recorder?

TabTalk Recorder is a Chrome extension that lets you capture audio from both your browser tabs and microphone at the same time. Get instant AI transcriptions powered by Google Gemini with just one click.

**Key Features:**
- Dual audio recording (tab + microphone)
- AI transcription with Google Gemini
- Unlimited local storage
- Privacy-focused - all data stays on your device

## Features

- Record tab audio and microphone simultaneously
- AI transcription with Google Gemini (free tier available)
- Built-in audio player and recording history
- Drag-and-drop file upload support
- Audio enhancements (noise suppression, echo cancellation)
- Adjustable volume controls
- One-click copy transcriptions

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right corner)
4. Click **Load unpacked** and select the extension directory
5. Pin the extension icon to your toolbar

## How to Use

### Recording Audio

1. Click the TabTalk Recorder icon in your toolbar
2. Navigate to any webpage
3. Click **Start Recording**
4. Click **Stop Recording** when finished
5. Your recording is saved to history automatically

### Setting Up Transcription

1. Click the **gear icon** (Settings)
2. Get a free API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
3. Paste your API key and save

### Transcribing Recordings

1. Open **History** from the extension popup
2. Click the **transcribe** button on any recording
3. Copy or download your transcription

## Settings

Access settings by clicking the gear icon:

- **API Key**: Add your Google Gemini API key for transcription
- **Model Selection**: Choose between Flash, Flash-Lite, or Pro models
- **Audio Volume**: Adjust tab and microphone volume levels
- **Auto-Transcribe**: Automatically transcribe after recording
- **Maximum Recordings**: Set storage limits for auto-cleanup

## Getting Your Free API Key

1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click **Create API Key**
4. Copy and paste it in TabTalk Recorder settings

The free tier includes 15 requests/minute and 1,500 requests/day - no credit card required.

## Troubleshooting

**No audio captured?**
- Grant microphone permission
- Ensure tab has audio playing
- Avoid chrome:// system pages

**Transcription not working?**
- Check your API key in settings
- Verify internet connection
- Ensure recording has clear speech

**Extension not working?**
- Reload extension at `chrome://extensions/`
- Check that all files are present

## Privacy

- All recordings stored locally in your browser
- API key stored locally, only sent to Google's API
- No data collection or third-party tracking
- Open source

## Credits

This project builds upon [chrome-recorder-extension](https://github.com/shebisabeen/chrome-recorder-extension) by [shebisabeen](https://github.com/shebisabeen).

Powered by Google Gemini API.

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

If you find this extension useful, please star the repository!
