// Factory/registry for transcription service providers (LLM backends)
// Supports registering additional providers without modifying create() logic.

class TranscriptionServiceFactory {
  static STORAGE_KEYS = {
    providerType: "transcription_provider_type",
    legacyServiceType: "transcription_service_type",
  };

  static SERVICES = {
    GEMINI: "gemini",
    // Future providers:
    // OPENAI: "openai",
    // ANTHROPIC: "anthropic",
    // LOCAL: "local",
    // WHISPER_WASM: "whisper-wasm",
  };

  static _registry = new Map();
  static _bootstrapped = false;

  static async _storageGet(keys) {
    if (chrome?.storage?.local) {
      return chrome.storage.local.get(keys);
    }

    const response = await chrome.runtime.sendMessage({
      type: "storage-get",
      target: "service-worker-storage",
      keys,
    });

    if (!response?.success) {
      throw new Error(response?.error || "storage-get bridge failed");
    }

    return response.data || {};
  }

  static async _storageSet(items) {
    if (chrome?.storage?.local) {
      return chrome.storage.local.set(items);
    }

    const response = await chrome.runtime.sendMessage({
      type: "storage-set",
      target: "service-worker-storage",
      items,
    });

    if (!response?.success) {
      throw new Error(response?.error || "storage-set bridge failed");
    }
  }

  static _ensureBuiltInProvidersRegistered() {
    if (this._bootstrapped) return;

    if (typeof GeminiTranscriptionService !== "undefined") {
      this.registerProvider({
        type: this.SERVICES.GEMINI,
        create: () => new GeminiTranscriptionService(),
      });
    }

    this._bootstrapped = true;
  }

  /**
   * Register a provider factory.
   * @param {{type:string, create: function}} provider
   */
  static registerProvider(provider) {
    if (!provider || typeof provider.type !== "string") {
      throw new Error("Provider must include a string 'type'");
    }
    if (typeof provider.create !== "function") {
      throw new Error(`Provider '${provider.type}' must include a create() function`);
    }

    this._registry.set(provider.type, {
      type: provider.type,
      create: provider.create,
    });
  }

  /**
   * Backward-compatible alias for registration.
   */
  static register(provider) {
    this.registerProvider(provider);
  }

  static create(type = TranscriptionServiceFactory.SERVICES.GEMINI) {
    this._ensureBuiltInProvidersRegistered();
    const provider = this._registry.get(type);

    if (!provider) {
      throw new Error(`Unknown transcription service type: ${type}`);
    }

    return provider.create();
  }

  static getDefault() {
    return TranscriptionServiceFactory.SERVICES.GEMINI;
  }

  static getDefaultProviderType() {
    return this.getDefault();
  }

  static getAvailableServices() {
    this._ensureBuiltInProvidersRegistered();

    const services = [];
    for (const [type, provider] of this._registry.entries()) {
      try {
        const instance = provider.create();
        services.push({
          type,
          providerType: type,
          ...instance.getInfo(),
        });
      } catch (error) {
        console.warn(`Failed to instantiate transcription provider '${type}':`, error);
      }
    }

    return services;
  }

  static getAvailableProviders() {
    return this.getAvailableServices();
  }

  static async getConfiguredService() {
    this._ensureBuiltInProvidersRegistered();

    const result = await TranscriptionServiceFactory._storageGet([
      this.STORAGE_KEYS.providerType,
      this.STORAGE_KEYS.legacyServiceType,
    ]);

    const configuredType =
      result[this.STORAGE_KEYS.providerType] ||
      result[this.STORAGE_KEYS.legacyServiceType] ||
      TranscriptionServiceFactory.getDefault();

    return this._registry.has(configuredType)
      ? configuredType
      : TranscriptionServiceFactory.getDefault();
  }

  static async getConfiguredProvider() {
    return this.getConfiguredService();
  }

  static async setConfiguredService(type) {
    this._ensureBuiltInProvidersRegistered();

    if (!this._registry.has(type)) {
      throw new Error(`Invalid service type: ${type}`);
    }

    await TranscriptionServiceFactory._storageSet({
      [this.STORAGE_KEYS.providerType]: type,
      // Keep legacy key in sync for backward compatibility with older UI/code.
      [this.STORAGE_KEYS.legacyServiceType]: type,
    });
  }

  static async setConfiguredProvider(type) {
    return this.setConfiguredService(type);
  }
}

if (typeof window !== "undefined") {
  window.TranscriptionServiceFactory = TranscriptionServiceFactory;
}
