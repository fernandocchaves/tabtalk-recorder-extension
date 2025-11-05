// Constants used throughout the extension

/**
 * Recording states
 */
const RecordingState = {
  IDLE: 'idle',
  RECORDING: 'recording',
  PAUSED: 'paused',
  STOPPED: 'stopped'
};

/**
 * Audio processing constants
 */
const AudioConfig = {
  TAB_GAIN: 1.0,
  MIC_GAIN: 1.5,
  SAMPLE_RATE: 48000,
  CHANNEL_COUNT: 2,
  MIME_TYPE: 'audio/webm'
};

/**
 * Storage keys
 */
const StorageKeys = {
  RECORDING_PREFIX: 'recording-',
  TRANSCRIPTION_SERVICE: 'transcription_service_type',
  GEMINI_API_KEY: 'gemini_api_key',
  USER_SETTINGS: 'user_settings'
};

/**
 * Message types for chrome.runtime communication
 */
const MessageType = {
  START_RECORDING: 'start-recording',
  STOP_RECORDING: 'stop-recording',
  RECORDING_STARTED: 'recording-started',
  RECORDING_STOPPED: 'recording-stopped',
  GET_STATUS: 'get-status',
  STATUS_UPDATE: 'status-update',
  ERROR: 'error'
};

/**
 * Extension pages
 */
const Pages = {
  POPUP: 'popup.html',
  HISTORY: 'history.html',
  PERMISSION: 'permission.html',
  OFFSCREEN: 'offscreen.html'
};

/**
 * Error messages
 */
const ErrorMessages = {
  NO_TAB: 'No active tab found',
  NO_PERMISSION: 'Microphone permission required',
  RECORDING_FAILED: 'Failed to start recording',
  TRANSCRIPTION_FAILED: 'Transcription failed',
  STORAGE_FULL: 'Storage quota exceeded',
  INVALID_AUDIO: 'Invalid audio format'
};

/**
 * UI notification duration (ms)
 */
const NotificationDuration = {
  SHORT: 2000,
  MEDIUM: 3000,
  LONG: 5000
};

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.RecordingState = RecordingState;
  window.AudioConfig = AudioConfig;
  window.StorageKeys = StorageKeys;
  window.MessageType = MessageType;
  window.Pages = Pages;
  window.ErrorMessages = ErrorMessages;
  window.NotificationDuration = NotificationDuration;
}
