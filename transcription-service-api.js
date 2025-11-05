// Transcription service using OpenAI Whisper API
// Simple, reliable, and accurate transcription
// Requires an OpenAI API key (set in the code or via chrome.storage)

class TranscriptionService {
  constructor() {
    this.isReady = false;
    this.apiKey = null;
  }

  async initialize(onProgress) {
    if (this.isReady) return true;

    try {
      if (onProgress) onProgress('Checking API configuration...');

      // Try to load API key from storage
      const result = await chrome.storage.local.get('openai_api_key');
      this.apiKey = result.openai_api_key;

      if (!this.apiKey) {
        // Prompt user for API key
        this.apiKey = prompt(
          'Enter your OpenAI API key:\n\n' +
          '1. Go to https://platform.openai.com/api-keys\n' +
          '2. Create a new API key\n' +
          '3. Paste it here (it will be saved)\n\n' +
          'Cost: ~$0.006 per minute of audio'
        );

        if (!this.apiKey) {
          throw new Error('API key required for transcription');
        }

        // Save API key for future use
        await chrome.storage.local.set({ openai_api_key: this.apiKey });
      }

      this.isReady = true;
      if (onProgress) onProgress('Ready');
      return true;

    } catch (error) {
      console.error('Failed to initialize transcription service:', error);
      throw new Error('Failed to initialize: ' + error.message);
    }
  }

  async transcribe(audioDataUrl, onProgress) {
    try {
      if (!this.isReady) {
        await this.initialize(onProgress);
      }

      if (onProgress) onProgress('Preparing audio...');

      // Convert data URL to Blob
      const response = await fetch(audioDataUrl);
      const blob = await response.blob();

      // Convert webm to a format OpenAI accepts (if needed)
      // OpenAI accepts: mp3, mp4, mpeg, mpga, m4a, wav, webm
      const audioFile = new File([blob], 'audio.webm', { type: 'audio/webm' });

      if (onProgress) onProgress('Uploading to OpenAI...');

      // Create form data
      const formData = new FormData();
      formData.append('file', audioFile);
      formData.append('model', 'whisper-1');
      formData.append('response_format', 'text');

      // Send to OpenAI Whisper API
      const apiResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: formData
      });

      if (!apiResponse.ok) {
        const error = await apiResponse.json();
        throw new Error(error.error?.message || 'API request failed');
      }

      if (onProgress) onProgress('Transcribing...');

      const transcription = await apiResponse.text();

      if (!transcription || transcription.trim() === '') {
        throw new Error('No speech detected in audio');
      }

      return transcription.trim();

    } catch (error) {
      console.error('Transcription error:', error);

      // If API key is invalid, clear it
      if (error.message.includes('API') || error.message.includes('Unauthorized')) {
        await chrome.storage.local.remove('openai_api_key');
        this.isReady = false;
        this.apiKey = null;
      }

      throw new Error('Transcription failed: ' + error.message);
    }
  }

  async clearApiKey() {
    await chrome.storage.local.remove('openai_api_key');
    this.isReady = false;
    this.apiKey = null;
  }

  async destroy() {
    // No cleanup needed for API-based service
  }
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.TranscriptionService = TranscriptionService;
}
