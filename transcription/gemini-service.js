// Transcription service using Google Gemini API
// Simple, reliable, and accurate transcription with FREE tier

class GeminiTranscriptionService extends BaseTranscriptionService {
  constructor() {
    super();
    this.apiKey = null;
    this.model = "gemini-2.5-flash"; // Default model
  }

  _isDebugLoggingEnabled() {
    return Boolean(window?.RECORDING_CONSTANTS?.DEBUG_TRANSCRIPTION_LOGS);
  }

  _debugLog(...args) {
    if (this._isDebugLoggingEnabled()) {
      console.log(...args);
    }
  }

  async _storageGet(keys) {
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

  async _storageSet(items) {
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

  async _storageRemove(keys) {
    if (chrome?.storage?.local) {
      return chrome.storage.local.remove(keys);
    }

    const response = await chrome.runtime.sendMessage({
      type: "storage-remove",
      target: "service-worker-storage",
      keys,
    });

    if (!response?.success) {
      throw new Error(response?.error || "storage-remove bridge failed");
    }
  }

  async _getUserConfig() {
    try {
      const result = await this._storageGet("user_settings");
      if (result?.user_settings && typeof result.user_settings === "object") {
        const defaults =
          typeof window !== "undefined" && window.DEFAULT_CONFIG
            ? window.DEFAULT_CONFIG
            : {};
        return { ...defaults, ...result.user_settings };
      }
    } catch (error) {
      console.warn(
        "Direct user_settings read failed for Gemini settings, trying ConfigManager:",
        error,
      );
    }

    try {
      if (typeof window !== "undefined" && window.configManager) {
        await window.configManager.load();
        return window.configManager.getAll();
      }

      if (typeof ConfigManager !== "undefined") {
        const configManager = new ConfigManager();
        return await configManager.load();
      }
    } catch (error) {
      console.warn(
        "Failed to load user config for Gemini settings, using defaults:",
        error,
      );
    }

    return {};
  }

  _sanitizeTranscriptionChunkIntervalMs(value) {
    const fallback =
      window.RECORDING_CONSTANTS?.TRANSCRIPTION_CHUNK_INTERVAL_MS || 300000;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(600000, Math.max(15000, Math.round(numeric)));
  }

  _sanitizeGeminiTranscriptionMaxOutputTokens(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 16384;
    return Math.min(65536, Math.max(1024, Math.round(numeric)));
  }

  async _getTranscriptionRuntimeSettings() {
    const userConfig = await this._getUserConfig();
    return {
      chunkIntervalMs: this._sanitizeTranscriptionChunkIntervalMs(
        userConfig.transcriptionChunkIntervalMs,
      ),
      maxOutputTokens: this._sanitizeGeminiTranscriptionMaxOutputTokens(
        userConfig.geminiTranscriptionMaxOutputTokens,
      ),
    };
  }

  getInfo() {
    return {
      name: "Google Gemini API",
      requiresApiKey: true,
      requiresInternet: true,
      cost: "FREE tier: 15/min, 1500/day",
      accuracy: "Excellent",
      model: "Gemini 2.5 Flash",
    };
  }

  async initialize(onProgress) {
    if (this.isReady) return true;

    try {
      if (onProgress) onProgress("Checking Gemini API configuration...");

      // Try to load API key and model from storage
      const result = await this._storageGet(["gemini_api_key", "gemini_model"]);
      this.apiKey = result.gemini_api_key;
      this.model = result.gemini_model || "gemini-2.5-flash";

      if (!this.apiKey) {
        // Show custom modal for API key
        if (typeof window !== "undefined" && window.showApiKeyModal) {
          this.apiKey = await window.showApiKeyModal();
        } else {
          // Fallback to prompt if modal not available
          this.apiKey = prompt(
            "Enter your Google Gemini API key:\n\n" +
              "1. Go to https://aistudio.google.com/app/apikey\n" +
              '2. Click "Create API key"\n' +
              "3. Paste it here (it will be saved)\n\n" +
              "FREE tier: 15 requests per minute, 1500 per day\n" +
              "No credit card required!",
          );

          if (this.apiKey) {
            // Save API key for future use
            await this._storageSet({ gemini_api_key: this.apiKey });
          }
        }

        if (!this.apiKey) {
          throw new Error("Gemini API key required for transcription");
        }
      }

      this.isReady = true;
      if (onProgress) onProgress("Gemini API ready");
      return true;
    } catch (error) {
      console.error("Failed to initialize Gemini service:", error);
      throw new Error("Gemini initialization failed: " + error.message);
    }
  }

  async transcribe(audioDataUrl, onProgress) {
    try {
      if (!this.isReady) {
        await this.initialize(onProgress);
      }

      if (onProgress) onProgress("Preparing audio...");

      // Convert data URL to base64
      const base64Audio = audioDataUrl.split(",")[1];
      const { maxOutputTokens } = await this._getTranscriptionRuntimeSettings();

      if (onProgress) onProgress("Sending to Gemini...");

      // Use Gemini's multimodal API with audio (use configured model)
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: "Transcribe the complete audio file accurately. Provide the full transcription in chronological order, avoiding any repetition. Return only the transcription text with proper paragraph breaks where natural pauses occur.",
                  },
                  {
                    inline_data: {
                      mime_type: "audio/webm",
                      data: base64Audio,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              topK: 1,
              topP: 0.95,
              maxOutputTokens,
            },
          }),
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error?.message || `API request failed: ${response.status}`,
        );
      }

      if (onProgress) onProgress("Transcribing...");

      const data = await response.json();

      // Extract transcription from Gemini response
      const transcription = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!transcription || transcription.trim() === "") {
        throw new Error("No speech detected in audio");
      }

      // Clean up the transcription
      let cleanedTranscription = this._cleanTranscription(transcription);

      return cleanedTranscription;
    } catch (error) {
      console.error("Gemini transcription error:", error);

      // If API key is invalid, clear it
      if (this._isAuthError(error)) {
        await this._storageRemove("gemini_api_key");
        this.isReady = false;
        this.apiKey = null;
      }

      throw new Error("Transcription failed: " + error.message);
    }
  }

  _cleanTranscription(text) {
    let cleaned = text.trim();

    // Remove common prefixes that Gemini might add
    const prefixes = [
      "Transcription:",
      "Here is the transcription:",
      "The transcription is:",
      "Audio transcription:",
    ];

    for (const prefix of prefixes) {
      if (cleaned.toLowerCase().startsWith(prefix.toLowerCase())) {
        cleaned = cleaned.substring(prefix.length).trim();
      }
    }

    // Remove markdown code blocks if present
    cleaned = cleaned
      .replace(/^```[\s\S]*?\n/, "")
      .replace(/\n```$/, "")
      .trim();

    // Check if output is just timestamps (common error when no speech detected)
    // Pattern: lines that are only timestamps like "00:00", "00:01", etc.
    const lines = cleaned
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l);
    const timestampPattern = /^\d{2}:\d{2}(:\d{2})?$/;
    const allTimestamps =
      lines.length > 0 && lines.every((line) => timestampPattern.test(line));

    if (allTimestamps) {
      // Model output only timestamps, likely no speech detected
      return "";
    }

    // Fix hallucination loops - detect and remove excessive repetitions
    // This handles cases where the model gets stuck repeating the same phrase
    cleaned = this._removeExcessiveRepetitions(cleaned);

    return cleaned;
  }

  /**
   * Remove excessive repetitions caused by model hallucination
   * Detects when a word or phrase is repeated more than 10 times consecutively
   * @private
   */
  _removeExcessiveRepetitions(text) {
    // Pattern to match any word/phrase repeated more than 10 times consecutively
    // This regex finds sequences where the same token appears 10+ times in a row
    let result = text;

    // Handle word-level repetitions (e.g., "ماشین رو ماشین رو ماشین رو...")
    // Match any sequence of characters followed by space, repeated 10+ times
    const wordRepeatPattern = /(\S+(?:\s+\S+){0,3})\s+(?:\1\s+){9,}/g;
    result = result.replace(wordRepeatPattern, "$1 ");

    // Handle single word repetitions without spaces (e.g., "نه نه نه نه...")
    const singleWordPattern = /(\S+)\s+(?:\1\s+){9,}/g;
    result = result.replace(singleWordPattern, "$1 ");

    // Clean up multiple spaces
    result = result.replace(/\s+/g, " ").trim();

    return result;
  }

  _isAuthError(error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("api") ||
      message.includes("unauthorized") ||
      message.includes("invalid api key") ||
      message.includes("403")
    );
  }

  /**
   * Strip markdown code fences from text
   * Removes ```json, ```, or similar code fence markers
   * @param {string} text - Text to clean
   * @returns {string} - Cleaned text
   */
  _stripCodeFences(text) {
    if (!text) return text;

    let cleaned = text.trim();

    // Remove opening code fence (```json, ```javascript, ``` etc.)
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, "");

    // Remove closing code fence
    cleaned = cleaned.replace(/\n?```$/, "");

    return cleaned.trim();
  }

  /**
   * Process transcription with custom system prompt
   * @param {string} transcription - Original transcription text
   * @param {string} systemPrompt - Custom system prompt
   * @param {function} onProgress - Progress callback
   * @returns {Promise<string>} - Processed transcription
   */
  async processTranscription(transcription, systemPrompt, onProgress) {
    try {
      if (!this.isReady) {
        await this.initialize(onProgress);
      }

      if (onProgress) onProgress("Processing transcription with AI...");

      // Replace {{TRANSCRIPTION}} placeholder in system prompt
      const processedPrompt = systemPrompt.replace(
        /\{\{TRANSCRIPTION\}\}/g,
        transcription,
      );

      // Send to Gemini API
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: processedPrompt,
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.3,
              topK: 40,
              topP: 0.95,
              maxOutputTokens: 8192,
            },
          }),
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error?.message || `API request failed: ${response.status}`,
        );
      }

      if (onProgress) onProgress("Finalizing processed result...");

      const data = await response.json();

      // Extract processed text from Gemini response
      let processedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!processedText || processedText.trim() === "") {
        throw new Error("No processed output received");
      }

      // Strip markdown code fences if present (```json ... ``` or ``` ... ```)
      processedText = this._stripCodeFences(processedText);

      return processedText.trim();
    } catch (error) {
      console.error("Gemini processing error:", error);

      // If API key is invalid, clear it
      if (this._isAuthError(error)) {
        await this._storageRemove("gemini_api_key");
        this.isReady = false;
        this.apiKey = null;
      }

      throw new Error("Processing failed: " + error.message);
    }
  }

  /**
   * Transcribe audio chunks separately and merge results
   * Optimized for long recordings to avoid API token limits
   * @param {string} recordingKey - Recording key to get chunks from IndexedDB
   * @param {function} onProgress - Progress callback (chunkIndex, totalChunks, partialText)
   * @returns {Promise<string>} - Complete merged transcription
   */
  async transcribeChunked(recordingKey, onProgress) {
    try {
      if (!this.isReady) {
        await this.initialize(onProgress);
      }

      // Get recording metadata to check if it's PCM format
      const metadata = await this._getRecordingMetadata(recordingKey);

      // Get all chunks for this recording from IndexedDB
      const rawChunks = await this._getRecordingChunks(recordingKey);

      this._debugLog(
        `[CHUNKED TRANSCRIPTION] Found ${rawChunks.length} chunks for ${recordingKey}`,
      );

      if (!rawChunks || rawChunks.length === 0) {
        throw new Error("No audio chunks found for this recording");
      }

      // Check if chunks are PCM format (new continuous recording system)
      let recordingChunks;
      const isPcmFormat =
        rawChunks[0]?.format === "pcm-float32" ||
        rawChunks[0]?.format === "pcm-int16" ||
        metadata?.isPcm;

      this._debugLog(
        `[CHUNKED TRANSCRIPTION] Format detection: rawChunks[0].format="${rawChunks[0]?.format}", metadata.isPcm=${metadata?.isPcm}, isPcmFormat=${isPcmFormat}`,
      );

      if (isPcmFormat) {
        this._debugLog(
          `[CHUNKED TRANSCRIPTION] ✓ Detected PCM format, using streaming transcription`,
        );
        // Use streaming transcription for PCM (memory-efficient)
        return await this._transcribePcmStreaming(
          recordingKey,
          rawChunks,
          metadata,
          onProgress,
        );
      } else {
        // Use WebM chunks directly (legacy format)
        this._debugLog(
          `[CHUNKED TRANSCRIPTION] ⚠ Legacy WebM format detected - using old chunking (not time-based)`,
        );
        recordingChunks = rawChunks;

        // Transcribe WebM chunks individually
        const totalChunks = recordingChunks.length;
        const transcriptions = [];
        const RATE_LIMIT_DELAY = 4000;
        const { maxOutputTokens } =
          await this._getTranscriptionRuntimeSettings();

        this._debugLog(
          `[CHUNKED TRANSCRIPTION] Will transcribe ${totalChunks} WebM chunks individually`,
        );

        if (onProgress) {
          onProgress(
            `Starting transcription of ${totalChunks} segments...`,
            0,
            totalChunks,
          );
        }

        for (let i = 0; i < recordingChunks.length; i++) {
          const chunk = recordingChunks[i];
          const requestStartTime = Date.now();

          if (onProgress) {
            onProgress(
              `Transcribing segment ${i + 1}/${totalChunks}...`,
              i,
              totalChunks,
            );
          }

          try {
            const mimeType = "audio/webm";
            const sizeInMB = (chunk.data.length / (1024 * 1024)).toFixed(2);
            this._debugLog(
              `[CHUNKED TRANSCRIPTION] Segment ${i + 1}: size=${sizeInMB} MB, format=${mimeType}`,
            );
            const chunkTranscription = await this._transcribeSingleChunk(
              chunk.data,
              i + 1,
              mimeType,
              maxOutputTokens,
            );
            this._debugLog(
              `[CHUNKED TRANSCRIPTION] Segment ${i + 1} transcription length: ${chunkTranscription.length} chars`,
            );
            transcriptions.push(chunkTranscription);

            await this._saveTranscriptionProgress(
              recordingKey,
              i,
              chunkTranscription,
            );

            if (i < recordingChunks.length - 1) {
              const elapsedTime = Date.now() - requestStartTime;
              const remainingDelay = Math.max(
                0,
                RATE_LIMIT_DELAY - elapsedTime,
              );
              if (remainingDelay > 0) {
                this._debugLog(
                  `[CHUNKED TRANSCRIPTION] Waiting ${remainingDelay}ms before next request`,
                );
                await this._sleep(remainingDelay);
              }
            }
          } catch (error) {
            console.error(`Error transcribing segment ${i + 1}:`, error);
            await this._saveTranscriptionProgress(
              recordingKey,
              i,
              null,
              error.message,
            );
            throw new Error(
              `Failed at segment ${i + 1}/${totalChunks}: ${error.message}`,
            );
          }
        }

        const finalTranscription = transcriptions.join(" ");
        if (onProgress) {
          onProgress(
            "Transcription complete!",
            totalChunks,
            totalChunks,
            finalTranscription,
          );
        }
        return finalTranscription;
      }
    } catch (error) {
      console.error("Chunked transcription error:", error);
      throw new Error("Chunked transcription failed: " + error.message);
    }
  }

  /**
   * Streaming transcription for PCM format (memory-efficient)
   * Generates and transcribes segments one at a time instead of preparing all upfront
   * @private
   */
  async _transcribePcmStreaming(recordingKey, pcmChunks, metadata, onProgress) {
    const originalSampleRate = metadata.sampleRate || 48000;
    const numberOfChannels = metadata.numberOfChannels || 1;

    const { chunkIntervalMs, maxOutputTokens } =
      await this._getTranscriptionRuntimeSettings();
    const originalSamplesPerSegment = Math.floor(
      (chunkIntervalMs / 1000) * originalSampleRate,
    );
    const RATE_LIMIT_DELAY = 4000;

    this._debugLog(
      `[PCM STREAMING] Processing ${pcmChunks.length} storage chunks into streaming transcription segments`,
    );
    this._debugLog(
      `[PCM STREAMING] Segment size: ${originalSamplesPerSegment} samples (${chunkIntervalMs}ms)`,
    );

    // Calculate total segments for progress tracking
    const totalSamples = pcmChunks.reduce(
      (sum, chunk) => sum + (chunk.samplesCount || 0),
      0,
    );
    const totalSegments = Math.ceil(totalSamples / originalSamplesPerSegment);

    this._debugLog(
      `[PCM STREAMING] Estimated ${totalSegments} segments from ${totalSamples} samples`,
    );

    const transcriptions = [];
    let currentSegmentData = [];
    let currentSegmentSamples = 0;
    let segmentNumber = 0;
    let storageChunkIdx = 0;
    let pcmData = null;
    let sampleOffset = 0;

    // Process storage chunks and create/transcribe segments on-the-fly
    while (
      storageChunkIdx < pcmChunks.length ||
      currentSegmentSamples > 0 ||
      (pcmData && sampleOffset < pcmData.length)
    ) {
      // Load next storage chunk if needed
      if (!pcmData || sampleOffset >= pcmData.length) {
        if (storageChunkIdx >= pcmChunks.length) {
          // No more chunks to load - check if we have remaining data to process
          if (currentSegmentSamples > 0) {
            this._debugLog(
              `[PCM STREAMING] Processing final segment with ${currentSegmentSamples} samples`,
            );
            pcmData = null;
          } else {
            break; // Nothing left to process
          }
        } else {
          this._debugLog(
            `[PCM STREAMING] Loading storage chunk ${storageChunkIdx + 1}/${pcmChunks.length}`,
          );
          const chunk = pcmChunks[storageChunkIdx];

          // Decode PCM data (supports both Int16 and Float32 formats)
          pcmData = this._decodePcmChunk(chunk);
          sampleOffset = 0;
          storageChunkIdx++;

          // Allow garbage collection
          await this._sleep(10);
        }
      }

      // Fill current segment from loaded PCM data (skip if no more data to load)
      if (pcmData) {
        const samplesToTake = Math.min(
          pcmData.length - sampleOffset,
          originalSamplesPerSegment - currentSegmentSamples,
        );

        currentSegmentData.push(
          pcmData.slice(sampleOffset, sampleOffset + samplesToTake),
        );
        currentSegmentSamples += samplesToTake;
        sampleOffset += samplesToTake;
      }

      // If segment is complete, transcribe it immediately
      if (
        currentSegmentSamples >= originalSamplesPerSegment ||
        (storageChunkIdx >= pcmChunks.length &&
          (!pcmData || sampleOffset >= pcmData.length) &&
          currentSegmentSamples > 0)
      ) {
        const requestStartTime = Date.now();

        // Concatenate segment parts
        const concatenated = new Float32Array(currentSegmentSamples);
        let segmentOffset = 0;
        for (const part of currentSegmentData) {
          concatenated.set(part, segmentOffset);
          segmentOffset += part.length;
        }

        this._debugLog(
          `[PCM STREAMING] Segment ${segmentNumber + 1}: ${concatenated.length} samples (${(concatenated.length / originalSampleRate).toFixed(2)}s)`,
        );

        if (onProgress) {
          onProgress(
            `Transcribing segment ${segmentNumber + 1}/${totalSegments}...`,
            segmentNumber,
            totalSegments,
          );
        }

        // Convert to WAV data URL and transcribe immediately
        const wavDataUrl = this._pcmFloat32ToWavDataUrl(
          concatenated,
          originalSampleRate,
          numberOfChannels,
        );
        const sizeInMB = (wavDataUrl.length / (1024 * 1024)).toFixed(2);
        this._debugLog(
          `[PCM STREAMING] Segment ${segmentNumber + 1} WAV size: ${sizeInMB} MB`,
        );

        try {
          const transcription = await this._transcribeSingleChunk(
            wavDataUrl,
            segmentNumber + 1,
            "audio/wav",
            maxOutputTokens,
          );
          this._debugLog(
            `[PCM STREAMING] Segment ${segmentNumber + 1} transcription: ${transcription.length} chars`,
          );
          if (transcription.length === 0) {
            console.warn(
              `[PCM STREAMING] WARNING: Segment ${segmentNumber + 1} returned empty transcription!`,
            );
          } else {
            this._debugLog(
              `[PCM STREAMING] Segment ${segmentNumber + 1} preview: "${transcription.substring(0, 100)}..."`,
            );
          }
          transcriptions.push(transcription);

          // Save progress
          await this._saveTranscriptionProgress(
            recordingKey,
            segmentNumber,
            transcription,
          );

          // Rate limiting
          if (segmentNumber < totalSegments - 1) {
            const elapsedTime = Date.now() - requestStartTime;
            const remainingDelay = Math.max(0, RATE_LIMIT_DELAY - elapsedTime);
            if (remainingDelay > 0) {
              this._debugLog(
                `[PCM STREAMING] Waiting ${remainingDelay}ms before next segment`,
              );
              await this._sleep(remainingDelay);
            }
          }
        } catch (error) {
          console.error(
            `[PCM STREAMING] Error transcribing segment ${segmentNumber + 1}:`,
            error,
          );
          await this._saveTranscriptionProgress(
            recordingKey,
            segmentNumber,
            null,
            error.message,
          );
          throw new Error(
            `Failed at segment ${segmentNumber + 1}/${totalSegments}: ${error.message}`,
          );
        }

        // Reset for next segment
        currentSegmentData = [];
        currentSegmentSamples = 0;
        segmentNumber++;
      }
    }

    const finalTranscription = transcriptions.join(" ");
    this._debugLog(
      `[PCM STREAMING] Completed: ${segmentNumber} segments transcribed, ${finalTranscription.length} total characters`,
    );

    if (onProgress) {
      onProgress(
        "Transcription complete!",
        segmentNumber,
        segmentNumber,
        finalTranscription,
      );
    }

    return finalTranscription;
  }

  /**
   * Resume incomplete chunked transcription
   * @param {string} recordingKey - Recording key
   * @param {function} onProgress - Progress callback
   * @returns {Promise<string>} - Complete merged transcription
   */
  async resumeChunkedTranscription(recordingKey, onProgress) {
    try {
      if (!this.isReady) {
        await this.initialize(onProgress);
      }

      // Get transcription state
      const state = await this._getTranscriptionState(recordingKey);

      if (!state) {
        throw new Error(
          "No transcription state found. Start a new transcription instead.",
        );
      }

      // Get recording metadata to check if it's PCM format
      const metadata = await this._getRecordingMetadata(recordingKey);

      // Get all chunks for this recording from IndexedDB
      const rawChunks = await this._getRecordingChunks(recordingKey);

      // Check if chunks are PCM format (new continuous recording system)
      let recordingChunks;
      const isPcmFormat =
        rawChunks[0]?.format === "pcm-float32" ||
        rawChunks[0]?.format === "pcm-int16" ||
        metadata?.isPcm;

      if (isPcmFormat) {
        this._debugLog(
          `[RESUME TRANSCRIPTION] Detected PCM format, converting to WAV segments`,
        );
        if (onProgress) {
          onProgress("Converting PCM audio to transcription segments...", 0, 1);
        }
        // Convert PCM chunks to time-based WAV segments for transcription
        recordingChunks = await this._preparePcmTranscriptionSegments(
          recordingKey,
          rawChunks,
          metadata,
        );
      } else {
        // Use WebM chunks directly (legacy format)
        recordingChunks = rawChunks;
      }

      const totalChunks = recordingChunks.length;
      const transcriptions = [...state.completedTranscriptions];
      const startFromChunk = state.lastCompletedChunk + 1;
      const RATE_LIMIT_DELAY = 4000;
      const { maxOutputTokens } = await this._getTranscriptionRuntimeSettings();

      if (onProgress) {
        onProgress(
          `Resuming from segment ${startFromChunk + 1}/${totalChunks}...`,
          startFromChunk,
          totalChunks,
        );
      }

      // Process remaining chunks individually
      for (let i = startFromChunk; i < recordingChunks.length; i++) {
        const chunk = recordingChunks[i];
        const requestStartTime = Date.now();

        if (onProgress) {
          onProgress(
            `Transcribing segment ${i + 1}/${totalChunks}...`,
            i,
            totalChunks,
          );
        }

        try {
          const mimeType = isPcmFormat ? "audio/wav" : "audio/webm";
          const chunkTranscription = await this._transcribeSingleChunk(
            chunk.data,
            i + 1,
            mimeType,
            maxOutputTokens,
          );
          transcriptions.push(chunkTranscription);

          await this._saveTranscriptionProgress(
            recordingKey,
            i,
            chunkTranscription,
          );

          // Rate limiting: ensure at least RATE_LIMIT_DELAY between request starts
          if (i < recordingChunks.length - 1) {
            const elapsedTime = Date.now() - requestStartTime;
            const remainingDelay = Math.max(0, RATE_LIMIT_DELAY - elapsedTime);
            if (remainingDelay > 0) {
              this._debugLog(
                `[RESUME TRANSCRIPTION] Waiting ${remainingDelay}ms before next request`,
              );
              await this._sleep(remainingDelay);
            }
          }
        } catch (error) {
          console.error(`Error transcribing segment ${i + 1}:`, error);
          await this._saveTranscriptionProgress(
            recordingKey,
            i,
            null,
            error.message,
          );
          throw new Error(
            `Failed at segment ${i + 1}/${totalChunks}: ${error.message}`,
          );
        }
      }

      const finalTranscription = transcriptions.join(" ");

      if (onProgress) {
        onProgress(
          "Transcription complete!",
          totalChunks,
          totalChunks,
          finalTranscription,
        );
      }

      return finalTranscription;
    } catch (error) {
      console.error("Resume chunked transcription error:", error);
      throw new Error("Resume failed: " + error.message);
    }
  }

  /**
   * Get recording chunks from IndexedDB
   * @private
   */
  async _getRecordingChunks(recordingKey) {
    const dbManager = await import("../utils/indexeddb.js").then(
      (m) => m.default,
    );
    await dbManager.init();

    return new Promise((resolve, reject) => {
      const transaction = dbManager.db.transaction(["recordings"], "readonly");
      const objectStore = transaction.objectStore("recordings");
      const index = objectStore.index("source");
      const request = index.getAll("recording-chunk");

      request.onsuccess = () => {
        const allChunks = request.result;
        // Filter chunks for this recording and sort by chunk number
        const recordingChunks = allChunks
          .filter((chunk) => chunk.parentRecordingId === recordingKey)
          .sort((a, b) => a.chunkNumber - b.chunkNumber);
        resolve(recordingChunks);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get recording metadata from IndexedDB
   * @private
   */
  async _getRecordingMetadata(recordingKey) {
    const dbManager = await import("../utils/indexeddb.js").then(
      (m) => m.default,
    );
    await dbManager.init();

    return new Promise((resolve, reject) => {
      const transaction = dbManager.db.transaction(["recordings"], "readonly");
      const objectStore = transaction.objectStore("recordings");
      const request = objectStore.get(recordingKey);

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Prepare transcription segments from PCM chunks
   * Groups PCM data into time-based segments suitable for transcription
   * @private
   */
  async _preparePcmTranscriptionSegments(recordingKey, pcmChunks, metadata) {
    const originalSampleRate = metadata.sampleRate || 48000;
    const numberOfChannels = metadata.numberOfChannels || 1;
    const targetSampleRate = 16000; // Always downsample to 16kHz for transcription

    const { chunkIntervalMs } = await this._getTranscriptionRuntimeSettings();

    // Calculate samples per segment based on original sample rate
    const originalSamplesPerSegment = Math.floor(
      (chunkIntervalMs / 1000) * originalSampleRate,
    );

    this._debugLog(
      `[PCM TRANSCRIPTION] Original rate: ${originalSampleRate} Hz, Target rate: ${targetSampleRate} Hz`,
    );
    this._debugLog(`[PCM TRANSCRIPTION] Chunk interval: ${chunkIntervalMs}ms`);
    this._debugLog(
      `[PCM TRANSCRIPTION] Samples per segment: ${originalSamplesPerSegment}`,
    );

    // Process chunks on-the-fly instead of concatenating everything at once (prevents memory issues for large files)
    const segments = [];
    let currentSegmentData = [];
    let currentSegmentSamples = 0;
    let segmentNumber = 0;
    let totalProcessedSamples = 0;

    this._debugLog(
      `[PCM TRANSCRIPTION] Processing ${pcmChunks.length} storage chunks into transcription segments...`,
    );

    for (let chunkIdx = 0; chunkIdx < pcmChunks.length; chunkIdx++) {
      const chunk = pcmChunks[chunkIdx];

      // Decode PCM data (supports both Int16 and Float32 formats)
      const pcmData = this._decodePcmChunk(chunk);

      this._debugLog(
        `[PCM TRANSCRIPTION] Loaded storage chunk ${chunkIdx + 1}/${pcmChunks.length}: ${pcmData.length} samples`,
      );

      // Process this chunk's data into segments
      let sampleOffset = 0;
      while (sampleOffset < pcmData.length) {
        const samplesToTake = Math.min(
          pcmData.length - sampleOffset,
          originalSamplesPerSegment - currentSegmentSamples,
        );

        // Add samples to current segment
        currentSegmentData.push(
          pcmData.slice(sampleOffset, sampleOffset + samplesToTake),
        );
        currentSegmentSamples += samplesToTake;
        totalProcessedSamples += samplesToTake;

        // Check if segment is full
        if (currentSegmentSamples >= originalSamplesPerSegment) {
          // Concatenate all parts of this segment and convert to WAV
          const concatenated = new Float32Array(currentSegmentSamples);
          let segmentOffset = 0;
          for (const part of currentSegmentData) {
            concatenated.set(part, segmentOffset);
            segmentOffset += part.length;
          }

          const wavDataUrl = this._pcmFloat32ToWavDataUrl(
            concatenated,
            originalSampleRate,
            numberOfChannels,
          );

          segments.push({
            data: wavDataUrl,
            chunkNumber: segmentNumber,
            samplesCount: concatenated.length,
            duration: concatenated.length / originalSampleRate,
          });

          this._debugLog(
            `[PCM TRANSCRIPTION] Segment ${segmentNumber}: ${concatenated.length} samples (${(concatenated.length / originalSampleRate).toFixed(2)}s), total processed: ${totalProcessedSamples}`,
          );

          // Reset for next segment
          currentSegmentData = [];
          currentSegmentSamples = 0;
          segmentNumber++;
        }

        sampleOffset += samplesToTake;
      }

      // Allow garbage collection between chunks
      if (chunkIdx % 5 === 0) {
        await this._sleep(10);
      }
    }

    // Handle any remaining data
    if (currentSegmentSamples > 0) {
      const concatenated = new Float32Array(currentSegmentSamples);
      let segmentOffset = 0;
      for (const part of currentSegmentData) {
        concatenated.set(part, segmentOffset);
        segmentOffset += part.length;
      }

      const wavDataUrl = this._pcmFloat32ToWavDataUrl(
        concatenated,
        originalSampleRate,
        numberOfChannels,
      );

      segments.push({
        data: wavDataUrl,
        chunkNumber: segmentNumber,
        samplesCount: concatenated.length,
        duration: concatenated.length / originalSampleRate,
      });

      this._debugLog(
        `[PCM TRANSCRIPTION] Final segment ${segmentNumber}: ${concatenated.length} samples (${(concatenated.length / originalSampleRate).toFixed(2)}s)`,
      );
    }

    this._debugLog(
      `[PCM TRANSCRIPTION] Created ${segments.length} transcription segments from ${pcmChunks.length} storage chunks`,
    );
    return segments;
  }

  /**
   * Convert PCM Float32 data to WAV data URL
   * Always downsamples to 16kHz for smaller file size (optimal for speech transcription)
   * @private
   */
  _pcmFloat32ToWavDataUrl(pcmData, sampleRate, numberOfChannels) {
    // Always use 16kHz for transcription regardless of recording quality
    // This reduces file size significantly while maintaining speech quality
    const targetSampleRate = 16000;
    const downsampledData = this._downsample(
      pcmData,
      sampleRate,
      targetSampleRate,
    );

    this._debugLog(
      `[WAV CONVERSION] Original sample rate: ${sampleRate} Hz, Target: ${targetSampleRate} Hz, Samples: ${pcmData.length} -> ${downsampledData.length}`,
    );

    const bytesPerSample = 2; // 16-bit audio
    const blockAlign = numberOfChannels * bytesPerSample;
    const byteRate = targetSampleRate * blockAlign;
    const dataSize = downsampledData.length * bytesPerSample;
    const headerSize = 44;
    const totalSize = headerSize + dataSize;

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);

    // RIFF header
    this._writeString(view, 0, "RIFF");
    view.setUint32(4, totalSize - 8, true);
    this._writeString(view, 8, "WAVE");

    // fmt chunk
    this._writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true); // chunk size
    view.setUint16(20, 1, true); // audio format (PCM)
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, targetSampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bytesPerSample * 8, true); // bits per sample

    // data chunk
    this._writeString(view, 36, "data");
    view.setUint32(40, dataSize, true);

    // Write PCM samples (convert Float32 to Int16)
    let writeOffset = 44;
    for (let i = 0; i < downsampledData.length; i++) {
      const sample = Math.max(-1, Math.min(1, downsampledData[i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(writeOffset, int16, true);
      writeOffset += 2;
    }

    // Convert to base64 data URL
    const uint8Array = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    const base64 = btoa(binary);

    return `data:audio/wav;base64,${base64}`;
  }

  /**
   * Decode PCM chunk data to Float32Array (supports both Int16 and Float32 formats)
   * @private
   */
  _decodePcmChunk(chunk) {
    const base64Data = chunk.data.split(",")[1];
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Check format and convert to Float32Array
    if (chunk.format === "pcm-int16") {
      // Int16 format - convert to Float32 for processing
      const int16Data = new Int16Array(bytes.buffer);
      const float32Data = new Float32Array(int16Data.length);
      for (let i = 0; i < int16Data.length; i++) {
        // Convert Int16 [-32768, 32767] to Float32 [-1, 1]
        float32Data[i] = int16Data[i] / (int16Data[i] < 0 ? 0x8000 : 0x7fff);
      }
      return float32Data;
    } else {
      // Float32 format (legacy)
      return new Float32Array(bytes.buffer);
    }
  }

  /**
   * Downsample audio data using simple linear interpolation
   * @private
   */
  _downsample(pcmData, fromSampleRate, toSampleRate) {
    if (fromSampleRate === toSampleRate) {
      return pcmData;
    }

    const ratio = fromSampleRate / toSampleRate;
    const outputLength = Math.floor(pcmData.length / ratio);
    const downsampled = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const sourceIndex = i * ratio;
      const index0 = Math.floor(sourceIndex);
      const index1 = Math.min(index0 + 1, pcmData.length - 1);
      const fraction = sourceIndex - index0;

      // Linear interpolation
      downsampled[i] =
        pcmData[index0] * (1 - fraction) + pcmData[index1] * fraction;
    }

    return downsampled;
  }

  /**
   * Write string to DataView
   * @private
   */
  _writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  /**
   * Group chunks into larger segments
   * @private
   */
  _groupChunks(chunks, chunksPerGroup) {
    const groups = [];
    for (let i = 0; i < chunks.length; i += chunksPerGroup) {
      groups.push(chunks.slice(i, i + chunksPerGroup));
    }
    return groups;
  }

  /**
   * Merge multiple audio chunks into a single data URL
   * @private
   */
  async _mergeAudioChunks(chunks) {
    if (chunks.length === 1) {
      return chunks[0].data;
    }

    try {
      // Convert data URLs to blobs (without fetch to avoid CSP issues)
      const blobs = chunks.map((chunk) => this._dataURLtoBlob(chunk.data));

      // Merge blobs
      const mergedBlob = new Blob(blobs, { type: "audio/webm" });

      // Convert back to data URL
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(mergedBlob);
      });
    } catch (error) {
      console.error("Error merging audio chunks:", error);
      throw new Error("Failed to merge audio chunks");
    }
  }

  /**
   * Convert data URL to Blob without fetch (avoids CSP issues)
   * @private
   */
  _dataURLtoBlob(dataURL) {
    const base64Marker = ";base64,";
    const markerIndex = dataURL.indexOf(base64Marker);
    if (markerIndex === -1) {
      throw new Error("Invalid data URL format");
    }
    const header = dataURL.slice(0, markerIndex + ";base64".length);
    let base64Data = dataURL
      .slice(markerIndex + base64Marker.length)
      .replace(/\s/g, "")
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const mime =
      header.match(/:(.*?);base64/)?.[1] || header.match(/:(.*?);/)?.[1];
    if (!mime) {
      throw new Error("Invalid data URL MIME type");
    }
    const padding = base64Data.length % 4;
    if (padding) {
      base64Data += "=".repeat(4 - padding);
    }
    const bstr = atob(base64Data);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  }

  /**
   * Transcribe a single audio segment (may contain multiple merged chunks)
   * @private
   */
  async _transcribeSingleChunk(
    audioDataUrl,
    segmentNumber,
    mimeType = "audio/webm",
    configuredMaxOutputTokens = null,
  ) {
    const base64Audio = audioDataUrl.split(",")[1];
    const maxOutputTokens =
      configuredMaxOutputTokens ??
      (await this._getTranscriptionRuntimeSettings()).maxOutputTokens;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Transcribe the audio exactly as spoken. This is segment ${segmentNumber} from a longer recording that has been split into 1-minute chunks. Transcribe ONLY what is actually said in this audio segment - do not add commentary, explanations, or make assumptions about missing context. If the segment starts mid-word or mid-sentence, transcribe from exactly where it begins. Return only the raw transcription text.`,
                },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Audio,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            topK: 1,
            topP: 0.95,
            maxOutputTokens,
          },
        }),
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        error.error?.message || `API request failed: ${response.status}`,
      );
    }

    const data = await response.json();

    // Check if response was truncated due to token limit
    const finishReason = data.candidates?.[0]?.finishReason;
    if (finishReason === "MAX_TOKENS") {
      console.error(
        `[TRANSCRIPTION] Segment ${segmentNumber} hit MAX_TOKENS limit! Response was truncated.`,
      );
      console.error(
        "[TRANSCRIPTION] Consider reducing the transcription chunk interval in Settings or increasing Gemini Transcription Max Output Tokens.",
      );
    }

    const transcription = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!transcription || transcription.trim() === "") {
      console.warn(
        `[TRANSCRIPTION] Segment ${segmentNumber} returned empty transcription. FinishReason: ${finishReason}`,
      );
      return ""; // Empty segment is okay
    }

    return this._cleanTranscription(transcription);
  }

  /**
   * Save transcription progress to chrome.storage.local
   * @private
   */
  async _saveTranscriptionProgress(
    recordingKey,
    chunkIndex,
    transcription,
    error = null,
  ) {
    const stateKey = `transcription_state_${recordingKey}`;

    let state = await this._storageGet(stateKey).then(
      (r) =>
        r[stateKey] || {
          recordingKey,
          completedTranscriptions: [],
          lastCompletedChunk: -1,
          startedAt: Date.now(),
        },
    );

    if (transcription !== null) {
      state.completedTranscriptions[chunkIndex] = transcription;
      state.lastCompletedChunk = chunkIndex;
      state.lastUpdated = Date.now();
      delete state.error;
    } else if (error) {
      state.error = error;
      state.failedChunk = chunkIndex;
      state.lastUpdated = Date.now();
    }

    await this._storageSet({ [stateKey]: state });
  }

  /**
   * Get transcription state
   * @private
   */
  async _getTranscriptionState(recordingKey) {
    const stateKey = `transcription_state_${recordingKey}`;
    const result = await this._storageGet(stateKey);
    return result[stateKey] || null;
  }

  /**
   * Clear transcription state (call after successful completion)
   */
  async clearTranscriptionState(recordingKey) {
    const stateKey = `transcription_state_${recordingKey}`;
    await this._storageRemove(stateKey);
  }

  /**
   * Check if recording has incomplete transcription
   */
  async hasIncompleteTranscription(recordingKey) {
    const state = await this._getTranscriptionState(recordingKey);
    return state !== null;
  }

  /**
   * Sleep utility
   * @private
   */
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async clearApiKey() {
    await this._storageRemove("gemini_api_key");
    this.isReady = false;
    this.apiKey = null;
  }

  async destroy() {
    // No cleanup needed for API-based service
  }
}

// Export for use in other scripts
if (typeof window !== "undefined") {
  window.GeminiTranscriptionService = GeminiTranscriptionService;
}
