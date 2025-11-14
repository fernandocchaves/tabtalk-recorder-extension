// Transcription service using Google Gemini API
// Simple, reliable, and accurate transcription with FREE tier

class GeminiTranscriptionService extends BaseTranscriptionService {
  constructor() {
    super();
    this.apiKey = null;
    this.model = "gemini-2.5-flash"; // Default model
  }

  getInfo() {
    return {
      name: 'Google Gemini API',
      requiresApiKey: true,
      requiresInternet: true,
      cost: 'FREE tier: 15/min, 1500/day',
      accuracy: 'Excellent',
      model: 'Gemini 2.5 Flash'
    };
  }

  async initialize(onProgress) {
    if (this.isReady) return true;

    try {
      if (onProgress) onProgress('Checking Gemini API configuration...');

      // Try to load API key and model from storage
      const result = await chrome.storage.local.get(['gemini_api_key', 'gemini_model']);
      this.apiKey = result.gemini_api_key;
      this.model = result.gemini_model || "gemini-2.5-flash";

      if (!this.apiKey) {
        // Show custom modal for API key
        if (typeof window !== 'undefined' && window.showApiKeyModal) {
          this.apiKey = await window.showApiKeyModal();
        } else {
          // Fallback to prompt if modal not available
          this.apiKey = prompt(
            'Enter your Google Gemini API key:\n\n' +
            '1. Go to https://aistudio.google.com/app/apikey\n' +
            '2. Click "Create API key"\n' +
            '3. Paste it here (it will be saved)\n\n' +
            'FREE tier: 15 requests per minute, 1500 per day\n' +
            'No credit card required!'
          );

          if (this.apiKey) {
            // Save API key for future use
            await chrome.storage.local.set({ gemini_api_key: this.apiKey });
          }
        }

        if (!this.apiKey) {
          throw new Error('Gemini API key required for transcription');
        }
      }

      this.isReady = true;
      if (onProgress) onProgress('Gemini API ready');
      return true;

    } catch (error) {
      console.error('Failed to initialize Gemini service:', error);
      throw new Error('Gemini initialization failed: ' + error.message);
    }
  }

  async transcribe(audioDataUrl, onProgress) {
    try {
      if (!this.isReady) {
        await this.initialize(onProgress);
      }

      if (onProgress) onProgress('Preparing audio...');

      // Convert data URL to base64
      const base64Audio = audioDataUrl.split(',')[1];

      if (onProgress) onProgress('Sending to Gemini...');

      // Use Gemini's multimodal API with audio (use configured model)
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [
                {
                  text: 'Transcribe the complete audio file accurately. Provide the full transcription in chronological order, avoiding any repetition. Return only the transcription text with proper paragraph breaks where natural pauses occur.'
                },
                {
                  inline_data: {
                    mime_type: 'audio/webm',
                    data: base64Audio
                  }
                }
              ]
            }],
            generationConfig: {
              temperature: 0.1,
              topK: 1,
              topP: 0.95,
              maxOutputTokens: 16384,
            }
          })
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `API request failed: ${response.status}`);
      }

      if (onProgress) onProgress('Transcribing...');

      const data = await response.json();

      // Extract transcription from Gemini response
      const transcription = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!transcription || transcription.trim() === '') {
        throw new Error('No speech detected in audio');
      }

      // Clean up the transcription
      let cleanedTranscription = this._cleanTranscription(transcription);

      return cleanedTranscription;

    } catch (error) {
      console.error('Gemini transcription error:', error);

      // If API key is invalid, clear it
      if (this._isAuthError(error)) {
        await chrome.storage.local.remove('gemini_api_key');
        this.isReady = false;
        this.apiKey = null;
      }

      throw new Error('Transcription failed: ' + error.message);
    }
  }

  _cleanTranscription(text) {
    let cleaned = text.trim();

    // Remove common prefixes that Gemini might add
    const prefixes = [
      'Transcription:',
      'Here is the transcription:',
      'The transcription is:',
      'Audio transcription:',
    ];

    for (const prefix of prefixes) {
      if (cleaned.toLowerCase().startsWith(prefix.toLowerCase())) {
        cleaned = cleaned.substring(prefix.length).trim();
      }
    }

    // Remove markdown code blocks if present
    cleaned = cleaned
      .replace(/^```[\s\S]*?\n/, '')
      .replace(/\n```$/, '')
      .trim();

    return cleaned;
  }

  _isAuthError(error) {
    const message = error.message.toLowerCase();
    return message.includes('api') ||
           message.includes('unauthorized') ||
           message.includes('invalid api key') ||
           message.includes('403');
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

      if (onProgress) onProgress('Processing transcription with AI...');

      // Replace {{TRANSCRIPTION}} placeholder in system prompt
      const processedPrompt = systemPrompt.replace(/\{\{TRANSCRIPTION\}\}/g, transcription);

      // Send to Gemini API
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [
                {
                  text: processedPrompt
                }
              ]
            }],
            generationConfig: {
              temperature: 0.3,
              topK: 40,
              topP: 0.95,
              maxOutputTokens: 8192,
            }
          })
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `API request failed: ${response.status}`);
      }

      if (onProgress) onProgress('Finalizing processed result...');

      const data = await response.json();

      // Extract processed text from Gemini response
      const processedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!processedText || processedText.trim() === '') {
        throw new Error('No processed output received');
      }

      return processedText.trim();

    } catch (error) {
      console.error('Gemini processing error:', error);

      // If API key is invalid, clear it
      if (this._isAuthError(error)) {
        await chrome.storage.local.remove('gemini_api_key');
        this.isReady = false;
        this.apiKey = null;
      }

      throw new Error('Processing failed: ' + error.message);
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

      // Get all chunks for this recording from IndexedDB
      const recordingChunks = await this._getRecordingChunks(recordingKey);

      if (!recordingChunks || recordingChunks.length === 0) {
        throw new Error('No audio chunks found for this recording');
      }

      // Group multiple 1-minute recording chunks into 5-minute transcription chunks
      const CHUNKS_PER_GROUP = 5; // 5 x 1-minute = 5 minutes per transcription
      const groupedChunks = this._groupChunks(recordingChunks, CHUNKS_PER_GROUP);
      const totalGroups = groupedChunks.length;
      const transcriptions = [];
      const RATE_LIMIT_DELAY = 4000; // 4 seconds between requests to stay under 15/min

      if (onProgress) {
        onProgress(`Starting transcription of ${totalGroups} segments (${recordingChunks.length} chunks)...`, 0, totalGroups);
      }

      // Process each group
      for (let i = 0; i < groupedChunks.length; i++) {
        const group = groupedChunks[i];

        if (onProgress) {
          onProgress(`Transcribing segment ${i + 1}/${totalGroups}...`, i, totalGroups);
        }

        try {
          // Merge chunks in this group and transcribe together
          const mergedAudio = await this._mergeAudioChunks(group);
          const groupTranscription = await this._transcribeSingleChunk(mergedAudio, i + 1);
          transcriptions.push(groupTranscription);

          // Save partial progress
          await this._saveTranscriptionProgress(recordingKey, i, groupTranscription);

          // Rate limiting: wait between requests (except for last group)
          if (i < groupedChunks.length - 1) {
            await this._sleep(RATE_LIMIT_DELAY);
          }

        } catch (error) {
          console.error(`Error transcribing segment ${i + 1}:`, error);

          // Save the error state
          await this._saveTranscriptionProgress(recordingKey, i, null, error.message);

          throw new Error(`Failed at segment ${i + 1}/${totalGroups}: ${error.message}`);
        }
      }

      // Merge all transcriptions
      const finalTranscription = transcriptions.join(' ');

      if (onProgress) {
        onProgress('Transcription complete!', totalGroups, totalGroups, finalTranscription);
      }

      return finalTranscription;

    } catch (error) {
      console.error('Chunked transcription error:', error);
      throw new Error('Chunked transcription failed: ' + error.message);
    }
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
        throw new Error('No transcription state found. Start a new transcription instead.');
      }

      const recordingChunks = await this._getRecordingChunks(recordingKey);
      const CHUNKS_PER_GROUP = 5;
      const groupedChunks = this._groupChunks(recordingChunks, CHUNKS_PER_GROUP);
      const totalGroups = groupedChunks.length;
      const transcriptions = [...state.completedTranscriptions];
      const startFromGroup = state.lastCompletedChunk + 1;
      const RATE_LIMIT_DELAY = 4000;

      if (onProgress) {
        onProgress(`Resuming from segment ${startFromGroup + 1}/${totalGroups}...`, startFromGroup, totalGroups);
      }

      // Process remaining groups
      for (let i = startFromGroup; i < groupedChunks.length; i++) {
        const group = groupedChunks[i];

        if (onProgress) {
          onProgress(`Transcribing segment ${i + 1}/${totalGroups}...`, i, totalGroups);
        }

        try {
          const mergedAudio = await this._mergeAudioChunks(group);
          const groupTranscription = await this._transcribeSingleChunk(mergedAudio, i + 1);
          transcriptions.push(groupTranscription);

          await this._saveTranscriptionProgress(recordingKey, i, groupTranscription);

          if (i < groupedChunks.length - 1) {
            await this._sleep(RATE_LIMIT_DELAY);
          }

        } catch (error) {
          console.error(`Error transcribing segment ${i + 1}:`, error);
          await this._saveTranscriptionProgress(recordingKey, i, null, error.message);
          throw new Error(`Failed at segment ${i + 1}/${totalGroups}: ${error.message}`);
        }
      }

      const finalTranscription = transcriptions.join(' ');

      if (onProgress) {
        onProgress('Transcription complete!', totalGroups, totalGroups, finalTranscription);
      }

      return finalTranscription;

    } catch (error) {
      console.error('Resume chunked transcription error:', error);
      throw new Error('Resume failed: ' + error.message);
    }
  }

  /**
   * Get recording chunks from IndexedDB
   * @private
   */
  async _getRecordingChunks(recordingKey) {
    const dbManager = await import('../utils/indexeddb.js').then(m => m.default);
    await dbManager.init();

    return new Promise((resolve, reject) => {
      const transaction = dbManager.db.transaction(['recordings'], 'readonly');
      const objectStore = transaction.objectStore('recordings');
      const index = objectStore.index('source');
      const request = index.getAll('recording-chunk');

      request.onsuccess = () => {
        const allChunks = request.result;
        // Filter chunks for this recording and sort by chunk number
        const recordingChunks = allChunks
          .filter(chunk => chunk.parentRecordingId === recordingKey)
          .sort((a, b) => a.chunkNumber - b.chunkNumber);
        resolve(recordingChunks);
      };

      request.onerror = () => reject(request.error);
    });
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
      const blobs = chunks.map(chunk => this._dataURLtoBlob(chunk.data));

      // Merge blobs
      const mergedBlob = new Blob(blobs, { type: 'audio/webm' });

      // Convert back to data URL
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(mergedBlob);
      });
    } catch (error) {
      console.error('Error merging audio chunks:', error);
      throw new Error('Failed to merge audio chunks');
    }
  }

  /**
   * Convert data URL to Blob without fetch (avoids CSP issues)
   * @private
   */
  _dataURLtoBlob(dataURL) {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
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
  async _transcribeSingleChunk(audioDataUrl, segmentNumber) {
    const base64Audio = audioDataUrl.split(',')[1];

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: `Transcribe this audio segment (part ${segmentNumber} of a longer recording). Provide the complete transcription of all spoken words in this segment. Return only the transcribed text without any prefixes, explanations, or meta-commentary. If this segment continues mid-sentence from a previous segment, start transcribing from where the audio begins.`
              },
              {
                inline_data: {
                  mime_type: 'audio/webm',
                  data: base64Audio
                }
              }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            topK: 1,
            topP: 0.95,
            maxOutputTokens: 8192,
          }
        })
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || `API request failed: ${response.status}`);
    }

    const data = await response.json();
    const transcription = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!transcription || transcription.trim() === '') {
      return ''; // Empty segment is okay
    }

    return this._cleanTranscription(transcription);
  }

  /**
   * Save transcription progress to chrome.storage.local
   * @private
   */
  async _saveTranscriptionProgress(recordingKey, chunkIndex, transcription, error = null) {
    const stateKey = `transcription_state_${recordingKey}`;

    let state = await chrome.storage.local.get(stateKey).then(r => r[stateKey] || {
      recordingKey,
      completedTranscriptions: [],
      lastCompletedChunk: -1,
      startedAt: Date.now()
    });

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

    await chrome.storage.local.set({ [stateKey]: state });
  }

  /**
   * Get transcription state
   * @private
   */
  async _getTranscriptionState(recordingKey) {
    const stateKey = `transcription_state_${recordingKey}`;
    const result = await chrome.storage.local.get(stateKey);
    return result[stateKey] || null;
  }

  /**
   * Clear transcription state (call after successful completion)
   */
  async clearTranscriptionState(recordingKey) {
    const stateKey = `transcription_state_${recordingKey}`;
    await chrome.storage.local.remove(stateKey);
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
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async clearApiKey() {
    await chrome.storage.local.remove('gemini_api_key');
    this.isReady = false;
    this.apiKey = null;
  }

  async destroy() {
    // No cleanup needed for API-based service
  }
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.GeminiTranscriptionService = GeminiTranscriptionService;
}
