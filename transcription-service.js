// Transcription service using Whisper.cpp WASM
// Runs entirely in the browser - no server needed!
// Built with DYNAMIC_EXECUTION=0 to work in Chrome extensions

class TranscriptionService {
  constructor() {
    this.whisperModule = null;
    this.contextIndex = null;
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
      if (onProgress) onProgress('Loading Whisper WASM module...');

      // Load the Whisper WASM module
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('whisper-wasm/libmain.js');
      document.head.appendChild(script);

      // Wait for Module to be available and fully initialized
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Module load timeout')), 30000);

        const checkModule = setInterval(() => {
          if (typeof Module !== 'undefined') {
            clearInterval(checkModule);
            clearTimeout(timeout);

            // Wait for runtime initialization and FS to be available
            const waitForInit = () => {
              if (Module.calledRun && Module.FS) {
                resolve();
              } else if (Module.FS) {
                // FS exists but runtime not marked as ready, still resolve
                resolve();
              } else {
                // Set up callback for when runtime initializes
                Module.onRuntimeInitialized = () => {
                  // Wait a bit more for FS to be ready
                  setTimeout(() => {
                    if (Module.FS) {
                      resolve();
                    } else {
                      reject(new Error('Module FS not available after initialization'));
                    }
                  }, 100);
                };
              }
            };
            waitForInit();
          }
        }, 100);
      });

      this.whisperModule = Module;
      console.log('Whisper module loaded, FS available:', !!Module.FS);

      if (onProgress) onProgress('Loading model...');

      // Download the model
      const modelUrl = chrome.runtime.getURL('whisper-wasm/ggml-base.bin');
      const modelResponse = await fetch(modelUrl);
      if (!modelResponse.ok) {
        throw new Error('Model file not found. Please download ggml-base.bin to whisper-wasm/ directory');
      }

      const modelData = await modelResponse.arrayBuffer();

      if (onProgress) onProgress('Initializing model...');

      // Write model to WASM filesystem
      this.whisperModule.FS.writeFile('/ggml-base.bin', new Uint8Array(modelData));

      // Initialize Whisper context
      const modelPathPtr = this.whisperModule.allocateUTF8('/ggml-base.bin');
      this.contextIndex = this.whisperModule._init(modelPathPtr);
      this.whisperModule._free(modelPathPtr);

      if (this.contextIndex === 0) {
        throw new Error('Failed to initialize Whisper context');
      }

      this.isReady = true;
      if (onProgress) onProgress('Ready');
      return true;

    } catch (error) {
      console.error('Failed to initialize Whisper WASM:', error);
      this.isReady = false;
      throw new Error('Failed to initialize Whisper WASM: ' + error.message);
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

      // Decode audio to get PCM data
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      // Convert to 16kHz mono Float32Array (required by Whisper)
      const pcmData = await this.convertToPCM16kHz(audioBuffer);

      if (onProgress) onProgress('Transcribing...');

      // Allocate memory for audio
      const audioPtr = this.whisperModule._malloc(pcmData.length * 4);
      this.whisperModule.HEAPF32.set(pcmData, audioPtr / 4);

      // Allocate language string
      const langPtr = this.whisperModule.allocateUTF8('en');

      // Run transcription
      const result = this.whisperModule._full_default(
        this.contextIndex,
        audioPtr,
        pcmData.length,
        langPtr,
        4, // nthreads
        0  // translate: false
      );

      // Free memory
      this.whisperModule._free(audioPtr);
      this.whisperModule._free(langPtr);

      if (result !== 0) {
        throw new Error('Transcription failed with code: ' + result);
      }

      // Get transcription result
      const nSegments = this.whisperModule._whisper_full_n_segments(this.contextIndex);
      let transcription = '';
      for (let i = 0; i < nSegments; i++) {
        const textPtr = this.whisperModule._whisper_full_get_segment_text(this.contextIndex, i);
        const text = this.whisperModule.UTF8ToString(textPtr);
        transcription += text + ' ';
      }

      return transcription.trim();

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
    if (this.contextIndex && this.whisperModule) {
      this.whisperModule._free(this.contextIndex);
      this.contextIndex = null;
    }
    this.isReady = false;
  }
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.TranscriptionService = TranscriptionService;
}
