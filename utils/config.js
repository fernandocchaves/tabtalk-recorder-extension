// Configuration management for user settings

/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
  // Audio settings
  tabGain: 1.0,
  micGain: 1.5,
  audioQuality: 48000, // Sample rate in Hz (16000, 22050, 32000, 44100, 48000)
  enableMicrophoneCapture: false, // Enable/disable microphone capture (default: false - tab audio only)
  enableTabVideoCapture: false, // Enable/disable tab video capture (records video/webm alongside PCM audio chunks)

  // Transcription settings
  transcriptionService: 'gemini',
  autoTranscribe: false,
  transcriptionChunkIntervalMs: 60000, // Segment duration for transcription (1 minute default)
  geminiTranscriptionMaxOutputTokens: 16384, // Max output tokens for Gemini transcription responses

  // UI settings
  showNotifications: true,
  darkMode: false,

  // Storage settings
  maxRecordings: 50,
  autoCleanup: false
};

/**
 * Configuration manager class
 */
class ConfigManager {
  constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this.loaded = false;
  }

  /**
   * Load configuration from storage
   * @returns {Promise<Object>} - Current configuration
   */
  async load() {
    try {
      // ALWAYS reset to defaults first to avoid stale data
      this.config = { ...DEFAULT_CONFIG };

      // Check if chrome API is available
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        // Silently use defaults - this is expected in some contexts
        this.loaded = true;
        return this.config;
      }

      // Check if StorageKeys is defined
      if (typeof StorageKeys === 'undefined') {
        this.loaded = true;
        return this.config;
      }

      const result = await chrome.storage.local.get(StorageKeys.USER_SETTINGS);

      if (result[StorageKeys.USER_SETTINGS]) {
        this.config = { ...DEFAULT_CONFIG, ...result[StorageKeys.USER_SETTINGS] };
      }
      this.loaded = true;
      return this.config;
    } catch (error) {
      console.error('Failed to load config:', error);
      return this.config;
    }
  }

  /**
   * Save configuration to storage
   * @returns {Promise<void>}
   */
  async save() {
    try {
      await chrome.storage.local.set({
        [StorageKeys.USER_SETTINGS]: this.config
      });
    } catch (error) {
      console.error('Failed to save config:', error);
      throw error;
    }
  }

  /**
   * Get a configuration value
   * @param {string} key - Configuration key
   * @returns {*} - Configuration value
   */
  get(key) {
    if (!this.loaded) {
      console.warn('Config not loaded yet, using defaults');
    }
    return this.config[key] !== undefined ? this.config[key] : DEFAULT_CONFIG[key];
  }

  /**
   * Set a configuration value
   * @param {string} key - Configuration key
   * @param {*} value - Configuration value
   * @param {boolean} autoSave - Automatically save to storage (default: true)
   * @returns {Promise<void>}
   */
  async set(key, value, autoSave = true) {
    this.config[key] = value;
    if (autoSave) {
      await this.save();
    }
  }

  /**
   * Update multiple configuration values
   * @param {Object} updates - Object with key-value pairs to update
   * @param {boolean} autoSave - Automatically save to storage (default: true)
   * @returns {Promise<void>}
   */
  async update(updates, autoSave = true) {
    this.config = { ...this.config, ...updates };
    if (autoSave) {
      await this.save();
    }
  }

  /**
   * Reset configuration to defaults
   * @param {boolean} autoSave - Automatically save to storage (default: true)
   * @returns {Promise<void>}
   */
  async reset(autoSave = true) {
    this.config = { ...DEFAULT_CONFIG };
    if (autoSave) {
      await this.save();
    }
  }

  /**
   * Get all configuration values
   * @returns {Object} - Complete configuration object
   */
  getAll() {
    return { ...this.config };
  }

  /**
   * Export configuration as JSON
   * @returns {string} - JSON string of configuration
   */
  export() {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * Import configuration from JSON
   * @param {string} jsonString - JSON string of configuration
   * @param {boolean} autoSave - Automatically save to storage (default: true)
   * @returns {Promise<void>}
   */
  async import(jsonString, autoSave = true) {
    try {
      const imported = JSON.parse(jsonString);
      // Validate imported config has valid keys
      const validKeys = Object.keys(DEFAULT_CONFIG);
      const filteredImport = {};

      for (const key of validKeys) {
        if (imported[key] !== undefined) {
          filteredImport[key] = imported[key];
        }
      }

      this.config = { ...DEFAULT_CONFIG, ...filteredImport };

      if (autoSave) {
        await this.save();
      }
    } catch (error) {
      console.error('Failed to import config:', error);
      throw new Error('Invalid configuration format');
    }
  }
}

// Create singleton instance
const configManager = new ConfigManager();

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.ConfigManager = ConfigManager;
  window.configManager = configManager;
  window.DEFAULT_CONFIG = DEFAULT_CONFIG;
}
