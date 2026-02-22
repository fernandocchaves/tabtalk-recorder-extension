// Base class for transcription services
// All transcription services must extend this class

class BaseTranscriptionService {
  constructor() {
    this.isReady = false;
  }

  /**
   * Initialize the transcription service
   * @param {Function} onProgress - Callback for progress updates
   * @returns {Promise<boolean>} - True if initialized successfully
   */
  async initialize(onProgress) {
    throw new Error('initialize() must be implemented by subclass');
  }

  /**
   * Transcribe audio from a data URL
   * @param {string} audioDataUrl - Audio data in data URL format
   * @param {Function} onProgress - Callback for progress updates
   * @returns {Promise<string>} - The transcribed text
   */
  async transcribe(audioDataUrl, onProgress) {
    throw new Error('transcribe() must be implemented by subclass');
  }

  /**
   * Clean up resources
   * @returns {Promise<void>}
   */
  async destroy() {
    // Override if cleanup needed
  }

  /**
   * Get service information
   * @returns {Object} - Service metadata
   */
  getInfo() {
    return {
      providerType: this.constructor.providerType || 'unknown',
      name: 'Unknown',
      requiresApiKey: false,
      requiresInternet: false,
      cost: 'Unknown',
      accuracy: 'Unknown'
    };
  }

  static get providerType() {
    return 'base';
  }
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.BaseTranscriptionService = BaseTranscriptionService;
}
