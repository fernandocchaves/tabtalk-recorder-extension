# Privacy Policy for TabTalk Recorder

**Last Updated**: November 6, 2025

## Overview

TabTalk Recorder is committed to protecting your privacy. This privacy policy explains how our Chrome extension handles your data.

## Data Collection and Storage

### What We Collect
- **Audio Recordings**: When you record tab audio or microphone input, the audio is processed and stored locally in your browser using IndexedDB.
- **Transcriptions**: When you use the transcription feature, audio is sent to Google's Gemini API for processing.
- **Settings**: Your preferences, API key, and configuration settings are stored locally in your browser.

### What We DON'T Collect
- We do not collect, transmit, or store any personal information on external servers
- We do not track your browsing history
- We do not use analytics or tracking cookies
- We do not share your data with third parties (except Google Gemini API when you explicitly use transcription)

## How We Use Your Data

### Local Storage
- All recordings are stored locally in your browser's IndexedDB
- Your API key is stored locally using Chrome's storage API
- No data is sent to our servers (we don't have any servers)

### Third-Party Services
- **Google Gemini API**: When you choose to transcribe audio, the recording is sent to Google's Gemini API. This is governed by [Google's Privacy Policy](https://policies.google.com/privacy)
- Your API key is only sent directly to Google's API and is never transmitted through our servers

## Permissions Explained

TabTalk Recorder requires the following permissions:

- **tabCapture**: To capture audio from browser tabs
- **offscreen**: To process audio in the background
- **activeTab**: To access the current tab for recording
- **storage**: To save your recordings and settings locally
- **host_permissions**: To enable tab audio capture on any website

## Data Security

- All data is stored locally in your browser
- Your API key is stored securely using Chrome's storage API
- Recordings are never uploaded to external servers unless you explicitly use the transcription feature
- You can delete all recordings and data at any time from the extension

## Your Control

You have complete control over your data:
- Delete individual recordings from the History page
- Clear all data by removing the extension
- Your API key can be removed at any time from Settings
- Set maximum recording limits to automatically manage storage

## Children's Privacy

TabTalk Recorder does not knowingly collect any data from children under 13. The extension is designed for general use and does not target children.

## Changes to This Policy

We may update this privacy policy from time to time. Any changes will be reflected in the extension's repository and the Chrome Web Store listing.

## Open Source

TabTalk Recorder is open source. You can review the code at: https://github.com/syblock/tabtalk-recorder-extension

## Contact

If you have questions about this privacy policy or how we handle data, please open an issue on our GitHub repository:
https://github.com/syblock/tabtalk-recorder-extension/issues

## Compliance

This extension complies with:
- Chrome Web Store Developer Program Policies
- Google API Services User Data Policy
- General Data Protection Regulation (GDPR) principles

## Data Retention

- Recordings are kept indefinitely until you delete them
- You can set automatic cleanup limits in Settings
- Uninstalling the extension removes all locally stored data

---

By using TabTalk Recorder, you agree to this privacy policy.
