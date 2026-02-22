// Recording Configuration Constants
// Edit these values to change recording behavior across the extension

const RECORDING_CONSTANTS = {
  // Transcription segment duration (in milliseconds)
  // Continuous recording is split into segments of this duration during transcription
  // Segments are created on-the-fly from continuous PCM data, not stored separately
  TRANSCRIPTION_CHUNK_INTERVAL_MS: 300000, // 300 seconds = 1 minute (prevents Gemini token limit issues)

  // Crash recovery data save interval (in milliseconds)
  // Raw audio data saved more frequently for crash recovery
  // Set to 0 to disable crash recovery chunks
  CRASH_RECOVERY_INTERVAL_MS: 60000, // 10 seconds

  // Maximum recording duration (in milliseconds)
  // Set to 0 for unlimited
  MAX_RECORDING_DURATION_MS: 0,

  // Audio quality settings (defaults - can be changed in settings page)
  AUDIO_SETTINGS: {
    TAB_GAIN: 1.0, // Default tab audio volume multiplier
    MIC_GAIN: 1.5, // Default microphone volume multiplier
    SAMPLE_RATE: 48000, // Default audio sample rate in Hz (user-configurable in settings)
  },

  // Storage limits
  STORAGE: {
    MAX_RECORDING_SIZE_MB: 5000, // Max size per recording in MB
    WARN_STORAGE_THRESHOLD_MB: 4000, // Warn user when storage reaches this
  },
};

// Make it available globally
if (typeof window !== "undefined") {
  window.RECORDING_CONSTANTS = RECORDING_CONSTANTS;
}

// For module exports (if needed)
if (typeof module !== "undefined" && module.exports) {
  module.exports = RECORDING_CONSTANTS;
}
