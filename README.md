# TabTalk Recorder

> Record browser tab audio and microphone simultaneously with AI-powered transcription and post-processing

[![Chrome Web Store](https://img.shields.io/badge/Chrome-Web%20Store-blue?logo=google-chrome)](https://chrome.google.com/webstore)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## What is TabTalk Recorder?

TabTalk Recorder is a Chrome extension that lets you capture audio from both your browser tabs and microphone at the same time. Get instant AI transcriptions powered by Google Gemini, then enhance them with custom AI post-processing prompts.

**Key Features:**
- Dual audio recording (tab + microphone)
- AI transcription with Google Gemini
- Custom AI post-processing with built-in & custom prompts
- Unlimited local storage via IndexedDB
- Privacy-focused - all data stays on your device

## Features

### Recording & Transcription
- Record tab audio and microphone simultaneously
- AI transcription with Google Gemini (free tier available)
- Multiple model options (Flash, Flash-Lite, Pro)
- Auto-transcribe option for hands-free workflow

### AI Post-Processing
- **Built-in Prompts**: Meeting Minutes, Summary, Action Items, Key Points, Q&A Extraction
- **Custom Prompts**: Create and manage your own AI processing templates
- **Meeting Minutes Parser**: Automatically converts meetings into structured JSON with tasks, decisions, attendees, timelines, and more
- **Import/Export**: Share custom prompts with your team
- **Multiple Results**: Store different processed versions per recording

### User Experience
- Built-in audio player and recording history
- Drag-and-drop file upload support
- Audio enhancements (noise suppression, echo cancellation)
- Adjustable volume controls
- One-click copy/download for transcriptions and processed results
- Collapsible long content with "Show More/Less" functionality
- Custom styled modals for better UX

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

**For Long Recordings:**
- **Live recordings**: Automatically saved in 60-second chunks, then grouped into 5-minute segments for transcription
- **Uploaded files**: Transcribed as single file (Gemini handles files up to ~2 hours well)
- 4-second delays between segment requests keep you under Gemini's 15 requests/minute limit
- Progress displayed as percentage for chunked transcriptions (e.g., "Transcribing segment 5/24... 21%")
- If chunked transcription fails, use the **Resume Transcription** button to continue from where it stopped
- For a 2-hour live recording: 24 segments × 4 seconds = ~2 minutes total transcription time

### AI Post-Processing

1. After transcribing, click **AI Process** in the transcription section
2. Select a prompt from the dropdown (built-in or custom)
3. Click **Process** to generate AI-enhanced output
4. View, copy, download, or delete processed results
5. Process the same transcription with multiple prompts

### Managing Custom Prompts

1. Open **Settings** from the extension popup
2. Scroll to **AI Post-Processing Prompts**
3. Click **Add Custom Prompt** to create new templates
4. Use `{{TRANSCRIPTION}}` as a placeholder in your prompt text
5. Export/Import prompts to share with others

## Settings

Access settings by clicking the gear icon:

### Transcription Settings
- **API Key**: Add your Google Gemini API key for transcription
- **Model Selection**: Choose between Gemini 2.5 Flash, Flash-Lite, or Pro models
- **Auto-Transcribe**: Automatically transcribe after recording

### Audio Settings
- **Tab Audio Volume**: Adjust volume of audio from browser tabs (0-2x)
- **Microphone Volume**: Adjust microphone input volume (0-3x)

### AI Post-Processing Prompts
- **Built-in Prompts**: View pre-configured prompts for common tasks
- **Custom Prompts**: Create, edit, and delete your own prompts
- **Import/Export**: Share prompts as JSON files

### Storage Settings
- **Maximum Recordings**: Set storage limits for auto-cleanup (5-100)
- **Clear All Data**: Delete all recordings and reset settings

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

**Long recording lost or incomplete?**
- The extension now saves recordings in chunks every 60 seconds
- If a recording fails to save, chunks are preserved
- Open the history page to automatically recover incomplete recordings
- Check browser console for recovery logs

**Extension not working?**
- Reload extension at `chrome://extensions/`
- Check that all files are present
- Clear browser cache and reload the extension

## Technical Details

### Storage
- **IndexedDB**: All recordings, transcriptions, and processed results stored locally
- **Chrome Storage**: Settings and API keys stored locally
- **No size limits**: Unlike chrome.storage.local (5MB limit), IndexedDB supports large audio files
- **Chunked Recording**: Recordings are saved in 60-second chunks during recording to prevent data loss
- **Auto-Recovery**: Automatically recovers incomplete recordings from chunks on page load
- **Chunked Transcription**: Long recordings are transcribed chunk-by-chunk to avoid API limits and improve accuracy
- **Resume Capability**: Failed transcriptions can be resumed from the last successful chunk

### Architecture
- **Modular Design**: Separate services for transcription, storage, and prompts management
- **CSP Compliant**: No inline scripts, all event handlers use delegation
- **ES6 Modules**: Modern JavaScript with import/export syntax

### Built-in Prompts
1. **Meeting Minutes Parser**: Structured JSON output with tasks, decisions, attendees, timelines
2. **Summary**: Concise overview of main points
3. **Action Items**: Extracted tasks with assignees and deadlines
4. **Key Points**: Important highlights and takeaways
5. **Q&A Extraction**: Questions and answers formatted as pairs

## Privacy

- All recordings stored locally in your browser (IndexedDB)
- API key stored locally, only sent to Google's API
- Transcription data sent to Google Gemini API for processing
- No data collection or third-party tracking
- Open source - audit the code yourself

## Credits

This project builds upon [chrome-recorder-extension](https://github.com/shebisabeen/chrome-recorder-extension) by [shebisabeen](https://github.com/shebisabeen).

Powered by Google Gemini API.

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

If you find this extension useful, please star the repository!
