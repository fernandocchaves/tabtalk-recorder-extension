// Transcription service using Google Gemini API
// Simple, reliable, and accurate transcription
// Requires a Gemini API key (free tier available!)

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
      const result = await chrome.storage.local.get('gemini_api_key');
      this.apiKey = result.gemini_api_key;

      if (!this.apiKey) {
        // Prompt user for API key
        this.apiKey = prompt(
          'Enter your Google Gemini API key:\n\n' +
          '1. Go to https://aistudio.google.com/app/apikey\n' +
          '2. Click "Create API key"\n' +
          '3. Paste it here (it will be saved)\n\n' +
          'FREE tier: 15 requests per minute\n' +
          'Paid tier available for higher usage'
        );

        if (!this.apiKey) {
          throw new Error('API key required for transcription');
        }

        // Save API key for future use
        await chrome.storage.local.set({ gemini_api_key: this.apiKey });
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

      // Convert data URL to base64
      const base64Audio = audioDataUrl.split(',')[1];

      if (onProgress) onProgress('Sending to Gemini...');

      // Use Gemini's multimodal API with audio
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [
                {
                  text: 'Please transcribe the audio in this file. Return only the transcription text, nothing else.'
                },
                {
                  inline_data: {
                    mime_type: 'audio/webm',
                    data: base64Audio
                  }
                }
              ]
            }],
            generationConfig: {
              temperature: 0.1,
              topK: 1,
              topP: 0.95,
              maxOutputTokens: 8192,
            }
          })
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `API request failed: ${response.status}`);
      }

      if (onProgress) onProgress('Transcribing...');

      const data = await response.json();

      // Extract transcription from Gemini response
      const transcription = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!transcription || transcription.trim() === '') {
        throw new Error('No speech detected in audio');
      }

      // Clean up the transcription (remove any extra formatting Gemini might add)
      let cleanedTranscription = transcription.trim();

      // Remove common prefixes that Gemini might add
      const prefixes = [
        'Transcription:',
        'Here is the transcription:',
        'The transcription is:',
        'Audio transcription:',
      ];

      for (const prefix of prefixes) {
        if (cleanedTranscription.toLowerCase().startsWith(prefix.toLowerCase())) {
          cleanedTranscription = cleanedTranscription.substring(prefix.length).trim();
        }
      }

      // Remove markdown code blocks if present
      cleanedTranscription = cleanedTranscription
        .replace(/^```[\s\S]*?\n/, '')
        .replace(/\n```$/, '')
        .trim();

      return cleanedTranscription;

    } catch (error) {
      console.error('Transcription error:', error);

      // If API key is invalid, clear it
      if (error.message.includes('API') ||
          error.message.includes('Unauthorized') ||
          error.message.includes('Invalid API key') ||
          error.message.includes('403')) {
        await chrome.storage.local.remove('gemini_api_key');
        this.isReady = false;
        this.apiKey = null;
      }

      throw new Error('Transcription failed: ' + error.message);
    }
  }

  async clearApiKey() {
    await chrome.storage.local.remove('gemini_api_key');
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
