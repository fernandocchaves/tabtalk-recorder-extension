// Factory for creating transcription service instances
// Supports multiple transcription backends

class TranscriptionServiceFactory {
  /**
   * Available service types
   */
  static get SERVICES() {
    return {
      GEMINI: 'gemini',
      // Future services can be added here:
      // OPENAI: 'openai',
      // LOCAL: 'local',
      // WHISPER_WASM: 'whisper-wasm',
    };
  }

  /**
   * Create a transcription service instance
   * @param {string} type - Service type from SERVICES
   * @returns {BaseTranscriptionService} - Service instance
   */
  static create(type = TranscriptionServiceFactory.SERVICES.GEMINI) {
    switch (type) {
      case TranscriptionServiceFactory.SERVICES.GEMINI:
        return new GeminiTranscriptionService();

      // Future services:
      // case TranscriptionServiceFactory.SERVICES.OPENAI:
      //   return new OpenAITranscriptionService();
      //
      // case TranscriptionServiceFactory.SERVICES.LOCAL:
      //   return new LocalTranscriptionService();

      default:
        throw new Error(`Unknown transcription service type: ${type}`);
    }
  }

  /**
   * Get the default service type
   * @returns {string} - Default service type
   */
  static getDefault() {
    return TranscriptionServiceFactory.SERVICES.GEMINI;
  }

  /**
   * Get information about all available services
   * @returns {Array} - Array of service info objects
   */
  static getAvailableServices() {
    const services = [];

    // Add Gemini
    const gemini = new GeminiTranscriptionService();
    services.push({
      type: TranscriptionServiceFactory.SERVICES.GEMINI,
      ...gemini.getInfo()
    });

    // Future: Add other services when implemented

    return services;
  }

  /**
   * Get the currently configured service type from storage
   * @returns {Promise<string>} - Configured service type
   */
  static async getConfiguredService() {
    const result = await chrome.storage.local.get('transcription_service_type');
    return result.transcription_service_type || TranscriptionServiceFactory.getDefault();
  }

  /**
   * Set the service type to use
   * @param {string} type - Service type from SERVICES
   * @returns {Promise<void>}
   */
  static async setConfiguredService(type) {
    if (!Object.values(TranscriptionServiceFactory.SERVICES).includes(type)) {
      throw new Error(`Invalid service type: ${type}`);
    }
    await chrome.storage.local.set({ transcription_service_type: type });
  }
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.TranscriptionServiceFactory = TranscriptionServiceFactory;
}
