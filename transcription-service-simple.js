// Simple transcription service using Web Speech API (Chrome's built-in)
// This is the most reliable option for Chrome extensions
// No downloads, no WASM, works immediately

class TranscriptionService {
  constructor() {
    this.isReady = true; // Always ready - uses browser API
    this.recognition = null;
  }

  async initialize(onProgress) {
    if (onProgress) onProgress('Ready');
    return true;
  }

  async transcribe(audioDataUrl, onProgress) {
    return new Promise(async (resolve, reject) => {
      try {
        if (onProgress) onProgress('Processing audio...');

        // Check if Web Speech API is available
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
          throw new Error('Speech recognition not supported in this browser');
        }

        // Convert data URL to audio element for playback
        const audio = new Audio(audioDataUrl);

        // Set up speech recognition
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        let transcript = '';
        let lastUpdate = Date.now();

        recognition.onstart = () => {
          if (onProgress) onProgress('Listening to audio...');
        };

        recognition.onresult = (event) => {
          // Collect all results
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              transcript += event.results[i][0].transcript + ' ';
              lastUpdate = Date.now();
            }
          }

          if (onProgress) {
            const progress = Math.min(95, Math.round((audio.currentTime / audio.duration) * 100));
            onProgress(`Transcribing... ${progress}%`);
          }
        };

        recognition.onerror = (event) => {
          console.error('Speech recognition error:', event.error);
          audio.pause();

          // If we got some transcript before the error, return it
          if (transcript.trim()) {
            resolve(transcript.trim());
          } else {
            reject(new Error(`Speech recognition failed: ${event.error}`));
          }
        };

        recognition.onend = () => {
          audio.pause();

          // Wait a bit for any final results
          setTimeout(() => {
            if (transcript.trim()) {
              resolve(transcript.trim());
            } else {
              reject(new Error('No speech detected in audio'));
            }
          }, 500);
        };

        // Start recognition
        recognition.start();

        // Play the audio (recognition will pick it up)
        // Note: This works in Chrome extensions since audio plays through system
        audio.play();

        // Stop recognition when audio ends
        audio.onended = () => {
          setTimeout(() => {
            recognition.stop();
          }, 1000); // Wait 1 second after audio ends to catch final words
        };

        // Timeout after audio duration + 5 seconds
        setTimeout(() => {
          audio.pause();
          recognition.stop();

          if (!transcript.trim()) {
            reject(new Error('Transcription timeout - no speech detected'));
          }
        }, (audio.duration + 5) * 1000);

      } catch (error) {
        console.error('Transcription error:', error);
        reject(error);
      }
    });
  }

  async destroy() {
    if (this.recognition) {
      this.recognition.stop();
      this.recognition = null;
    }
  }
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.TranscriptionService = TranscriptionService;
}
