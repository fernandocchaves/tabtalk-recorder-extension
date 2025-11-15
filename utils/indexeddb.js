/**
 * IndexedDB utility for storing audio recordings and transcriptions
 * Provides better storage capacity than chrome.storage.local for large audio files
 */

const DB_NAME = 'ChromeRecorderDB';
const DB_VERSION = 1;
const RECORDINGS_STORE = 'recordings';

class IndexedDBManager {
  constructor() {
    this.db = null;
  }

  /**
   * Initialize the IndexedDB database
   * @returns {Promise<IDBDatabase>}
   */
  async init() {
    if (this.db) {
      return this.db;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('IndexedDB error:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('IndexedDB initialized successfully');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create recordings object store if it doesn't exist
        if (!db.objectStoreNames.contains(RECORDINGS_STORE)) {
          const objectStore = db.createObjectStore(RECORDINGS_STORE, { keyPath: 'key' });

          // Create indexes for efficient querying
          objectStore.createIndex('timestamp', 'timestamp', { unique: false });
          objectStore.createIndex('source', 'source', { unique: false });

          console.log('Created recordings object store with indexes');
        }
      };
    });
  }

  /**
   * Save a recording to IndexedDB
   * @param {string} key - Unique key for the recording
   * @param {Object} recordingData - Recording data object
   * @returns {Promise<void>}
   */
  async saveRecording(key, recordingData) {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([RECORDINGS_STORE], 'readwrite');
      const objectStore = transaction.objectStore(RECORDINGS_STORE);

      const recording = {
        key,
        ...recordingData,
        timestamp: recordingData.timestamp || Date.now()
      };

      const request = objectStore.put(recording);

      request.onsuccess = () => {
        console.log(`Recording ${key} saved to IndexedDB`);
        resolve();
      };

      request.onerror = () => {
        console.error('Error saving recording:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get a specific recording by key
   * @param {string} key - Recording key
   * @returns {Promise<Object|null>}
   */
  async getRecording(key) {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([RECORDINGS_STORE], 'readonly');
      const objectStore = transaction.objectStore(RECORDINGS_STORE);
      const request = objectStore.get(key);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        console.error('Error getting recording:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get all recordings sorted by timestamp (newest first)
   * @returns {Promise<Array>}
   */
  async getAllRecordings() {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([RECORDINGS_STORE], 'readonly');
      const objectStore = transaction.objectStore(RECORDINGS_STORE);
      const index = objectStore.index('timestamp');
      const request = index.openCursor(null, 'prev'); // 'prev' for descending order

      const recordings = [];

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const recording = cursor.value;

          // For chunk entries, strip the data to save memory
          if (recording.source === 'recording-chunk' && recording.data) {
            recordings.push({
              ...recording,
              data: null, // Strip chunk data for memory efficiency
              _hasData: true // Flag that data exists but was stripped
            });
          } else {
            recordings.push(recording);
          }

          cursor.continue();
        } else {
          console.log(`Retrieved ${recordings.length} recordings from IndexedDB (chunks data stripped)`);
          resolve(recordings);
        }
      };

      request.onerror = () => {
        console.error('Error getting all recordings:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get all recordings with metadata only (no chunk data) - ultra-fast for history display
   * @returns {Promise<{recordings: Array, chunkMetadata: Array}>}
   */
  async getAllRecordingsMetadata() {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([RECORDINGS_STORE], 'readonly');
      const objectStore = transaction.objectStore(RECORDINGS_STORE);
      const index = objectStore.index('timestamp');
      const request = index.openCursor(null, 'prev');

      const recordings = [];
      const chunkMetadata = [];

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const recording = cursor.value;

          if (recording.source === 'recording-chunk') {
            // For chunks, only store metadata (no audio data)
            chunkMetadata.push({
              key: recording.key,
              parentRecordingId: recording.parentRecordingId,
              chunkNumber: recording.chunkNumber,
              samplesCount: recording.samplesCount,
              timestamp: recording.timestamp,
              source: recording.source,
              format: recording.format
            });
          } else {
            // For main recordings, strip data field to save memory
            const {data, ...metadata} = recording;
            recordings.push({
              ...metadata,
              _dataStripped: !!data
            });
          }

          cursor.continue();
        } else {
          console.log(`Retrieved ${recordings.length} recordings and ${chunkMetadata.length} chunk metadata entries`);
          resolve({ recordings, chunkMetadata });
        }
      };

      request.onerror = () => {
        console.error('Error getting recordings metadata:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get chunks with actual data for a specific recording
   * @param {string} parentRecordingId - Parent recording ID
   * @returns {Promise<Array>}
   */
  async getRecordingChunksWithData(parentRecordingId) {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([RECORDINGS_STORE], 'readonly');
      const objectStore = transaction.objectStore(RECORDINGS_STORE);
      const request = objectStore.getAll();

      request.onsuccess = () => {
        const chunks = request.result
          .filter(r => r.source === 'recording-chunk' && r.parentRecordingId === parentRecordingId)
          .sort((a, b) => a.chunkNumber - b.chunkNumber);

        console.log(`Retrieved ${chunks.length} chunks with data for ${parentRecordingId}`);
        resolve(chunks);
      };

      request.onerror = () => {
        console.error('Error getting chunks:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Update transcription for a specific recording
   * @param {string} key - Recording key
   * @param {string} transcription - Transcription text
   * @returns {Promise<void>}
   */
  async updateTranscription(key, transcription) {
    await this.init();

    const recording = await this.getRecording(key);
    if (!recording) {
      throw new Error(`Recording ${key} not found`);
    }

    recording.transcription = transcription;
    return this.saveRecording(key, recording);
  }

  /**
   * Update processed transcription for a specific recording
   * @param {string} key - Recording key
   * @param {string} processedTranscription - Processed transcription text
   * @param {string} promptId - ID of the prompt used for processing
   * @returns {Promise<void>}
   */
  async updateProcessedTranscription(key, processedTranscription, promptId) {
    await this.init();

    const recording = await this.getRecording(key);
    if (!recording) {
      throw new Error(`Recording ${key} not found`);
    }

    if (!recording.processedTranscriptions) {
      recording.processedTranscriptions = {};
    }

    recording.processedTranscriptions[promptId] = {
      text: processedTranscription,
      timestamp: Date.now(),
      promptId: promptId
    };

    return this.saveRecording(key, recording);
  }

  /**
   * Delete a specific recording
   * @param {string} key - Recording key
   * @returns {Promise<void>}
   */
  async deleteRecording(key) {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([RECORDINGS_STORE], 'readwrite');
      const objectStore = transaction.objectStore(RECORDINGS_STORE);
      const request = objectStore.delete(key);

      request.onsuccess = () => {
        console.log(`Recording ${key} deleted from IndexedDB`);
        resolve();
      };

      request.onerror = () => {
        console.error('Error deleting recording:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Delete all recordings
   * @returns {Promise<void>}
   */
  async clearAllRecordings() {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([RECORDINGS_STORE], 'readwrite');
      const objectStore = transaction.objectStore(RECORDINGS_STORE);
      const request = objectStore.clear();

      request.onsuccess = () => {
        console.log('All recordings cleared from IndexedDB');
        resolve();
      };

      request.onerror = () => {
        console.error('Error clearing recordings:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get storage information (size and count)
   * @returns {Promise<Object>}
   */
  async getStorageInfo() {
    await this.init();

    const recordings = await this.getAllRecordings();

    let totalSize = 0;
    recordings.forEach(recording => {
      // Estimate size of the recording data
      if (recording.data) {
        // For data URLs, the base64 portion is the actual data
        totalSize += recording.data.length;
      }
      if (recording.transcription) {
        totalSize += recording.transcription.length * 2; // Rough estimate for string size
      }
    });

    // Convert to MB
    const sizeInMB = (totalSize / (1024 * 1024)).toFixed(2);

    return {
      count: recordings.length,
      sizeInMB: parseFloat(sizeInMB),
      totalBytes: totalSize
    };
  }

  /**
   * Get recordings count
   * @returns {Promise<number>}
   */
  async getRecordingsCount() {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([RECORDINGS_STORE], 'readonly');
      const objectStore = transaction.objectStore(RECORDINGS_STORE);
      const request = objectStore.count();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        console.error('Error counting recordings:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Close the database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('IndexedDB connection closed');
    }
  }
}

// Create a singleton instance
const dbManager = new IndexedDBManager();

export default dbManager;
