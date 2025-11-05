// Configuration management for user settings

/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
  // Audio settings
  tabGain: 1.0,
  micGain: 1.5,

  // Transcription settings
  transcriptionService: 'gemini',
  autoTranscribe: false,

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
