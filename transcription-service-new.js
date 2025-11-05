// Transcription service using Transformers.js (Xenova/whisper-tiny)
// This is a simpler, more reliable approach that works in Chrome extensions

class TranscriptionService {
  constructor() {
    this.pipeline = null;
    this.isReady = false;
    this.isInitializing = false;
  }

  async initialize(onProgress) {
    if (this.isReady) return true;
    if (this.isInitializing) {
      // Wait for existing initialization
      while (this.isInitializing) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return this.isReady;
    }

    this.isInitializing = true;

    try {
      if (onProgress) onProgress('Loading Whisper model...');

      // Import transformers.js from CDN
      const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.10.0');

      // Configure to use local model cache
      env.allowLocalModels = false;
      env.useBrowserCache = true;

      if (onProgress) onProgress('Initializing speech recognition...');

      // Create the transcription pipeline with tiny model
      this.pipeline = await pipeline(
        'automatic-speech-recognition',
        'Xenova/whisper-tiny.en',
        {
          quantized: true, // Use quantized model for faster loading
          progress_callback: (progress) => {
            if (onProgress && progress.status === 'progress') {
              const percent = Math.round(progress.progress);
              onProgress(`Loading model: ${percent}%`);
            }
          }
        }
      );

      this.isReady = true;
      if (onProgress) onProgress('Ready');
      return true;

    } catch (error) {
      console.error('Failed to initialize Whisper:', error);
      this.isReady = false;
      throw new Error('Failed to initialize Whisper: ' + error.message);
    } finally {
      this.isInitializing = false;
    }
  }

  async transcribe(audioDataUrl, onProgress) {
    try {
      if (!this.isReady) {
        await this.initialize(onProgress);
      }

      if (onProgress) onProgress('Processing audio...');

      // Convert data URL to audio buffer
      const response = await fetch(audioDataUrl);
      const arrayBuffer = await response.arrayBuffer();

      // Decode audio
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      // Convert to mono Float32Array at 16kHz (required by Whisper)
      const pcmData = await this.convertToPCM16kHz(audioBuffer);

      if (onProgress) onProgress('Transcribing...');

      // Run transcription
      const result = await this.pipeline(pcmData, {
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: false
      });

      return result.text.trim();

    } catch (error) {
      console.error('Transcription error:', error);
      throw new Error('Transcription failed: ' + error.message);
    }
  }

  async convertToPCM16kHz(audioBuffer) {
    // Mix to mono if needed
    let monoData;
    if (audioBuffer.numberOfChannels > 1) {
      const left = audioBuffer.getChannelData(0);
      const right = audioBuffer.getChannelData(1);
      monoData = new Float32Array(left.length);
      for (let i = 0; i < left.length; i++) {
        monoData[i] = (left[i] + right[i]) / 2;
      }
    } else {
      monoData = audioBuffer.getChannelData(0);
    }

    // Resample to 16kHz if needed
    if (audioBuffer.sampleRate !== 16000) {
      const ratio = audioBuffer.sampleRate / 16000;
      const newLength = Math.floor(monoData.length / ratio);
      const resampled = new Float32Array(newLength);

      for (let i = 0; i < newLength; i++) {
        const srcIndex = i * ratio;
        const srcIndexFloor = Math.floor(srcIndex);
        const t = srcIndex - srcIndexFloor;

        const sample1 = monoData[srcIndexFloor] || 0;
        const sample2 = monoData[Math.min(srcIndexFloor + 1, monoData.length - 1)] || 0;

        resampled[i] = sample1 * (1 - t) + sample2 * t;
      }

      return resampled;
    }

    return monoData;
  }

  async destroy() {
    if (this.pipeline) {
      // Transformers.js doesn't require explicit cleanup
      this.pipeline = null;
    }
    this.isReady = false;
  }
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.TranscriptionService = TranscriptionService;
}
