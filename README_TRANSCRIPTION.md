# Audio Transcription Feature - Gemini API

## Overview

This Chrome extension now includes audio transcription powered by **Google Gemini API** with a **FREE tier**!

## Quick Setup (2 minutes)

1. **Get FREE API Key**
   - Visit: https://aistudio.google.com/app/apikey
   - Click "Create API key"
   - Copy the key (no credit card needed!)

2. **Reload Extension**
   - Go to `chrome://extensions/`
   - Find "Simple Chrome Recorder"
   - Click reload ⟳

3. **Start Transcribing**
   - Open History page (click extension icon)
   - Click transcribe button (📄) on any recording
   - Paste your API key when prompted
   - Done!

## Features

✅ **FREE tier**: 15 requests/min, 1500 requests/day
✅ Excellent accuracy with Gemini 1.5 Flash
✅ Works with all audio formats (webm, mp3, wav, etc.)
✅ API key saved automatically
✅ Fast transcription (runs on Google's servers)
✅ No downloads or setup required

## Free Tier Limits

- **15 requests per minute**
- **1500 requests per day**
- Perfect for personal use!
- No credit card required

## How It Works

1. You record audio using the extension
2. Click "transcribe" button on any recording
3. Audio is sent to Google Gemini API
4. Transcription appears in seconds
5. Copy transcription to clipboard

## Cost Comparison

| Service | Free Tier | Paid Tier |
|---------|-----------|-----------|
| **Gemini** | ✅ 1500/day | Pay as you go |
| OpenAI Whisper | ❌ None | $0.006/min |
| Local WASM | ✅ Unlimited | Hardware cost |

## Files

- **[transcription-service-gemini.js](transcription-service-gemini.js)** - Main service
- **[history.html](history.html)** - Loads the service
- **[manifest.json](manifest.json)** - Allows Gemini API access

## Troubleshooting

### "Enter your Google Gemini API key"
→ Get FREE key: https://aistudio.google.com/app/apikey

### "API request failed"
→ Check internet connection
→ Verify API key is correct
→ Check if you hit rate limits (15/min, 1500/day)

### "No speech detected"
→ Ensure audio has clear speech
→ Test audio playback first

### Clear/Reset API Key
Open browser console on History page:
```javascript
chrome.storage.local.remove('gemini_api_key');
location.reload();
```

## Privacy

- Audio is sent to Google's servers for transcription
- API key stored locally in browser
- No data stored on our servers
- See Google's privacy policy for Gemini API

## Alternatives

### Want offline/free transcription?
Use local Whisper server:
- See `setup-whisper-server.sh`
- Runs on your computer
- No internet needed

### Prefer OpenAI Whisper?
- More accurate for some languages
- Costs $0.006/minute
- See `transcription-service-api.js`

## Support

- **Get API Key**: https://aistudio.google.com/app/apikey
- **Gemini Docs**: https://ai.google.dev/
- **Rate Limits**: https://ai.google.dev/pricing

## What Was Fixed

The original WASM-based transcription was stuck because the compiled whisper.cpp module didn't expose the needed JavaScript API. Switching to Gemini API provides:

- ✅ Simpler setup
- ✅ Better reliability
- ✅ FREE tier
- ✅ Faster processing
- ✅ No 142MB model download

Enjoy your working transcriptions! 🎉
