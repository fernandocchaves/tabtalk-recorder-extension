// Utility functions for IndexedDB storage operations
import dbManager from './indexeddb.js';

/**
 * Save a recording to IndexedDB
 * @param {string} audioDataUrl - Audio data in data URL format
 * @param {Object} metadata - Optional metadata (source, filename, fileSize, mimeType, duration, key)
 * @returns {Promise<string>} - Key of the saved recording
 */
async function saveRecording(audioDataUrl, metadata = {}) {
  const timestamp = metadata.timestamp || Date.now();
  const key = metadata.key || `recording-${timestamp}`;

  const recordingData = {
    data: audioDataUrl,
    timestamp: timestamp,
    transcription: null,
    ...metadata
  };

  // Remove 'key' from recordingData if it was in metadata to avoid duplication
  delete recordingData.key;

  await dbManager.saveRecording(key, recordingData);

  return key;
}

/**
 * Get all recordings from IndexedDB
 * @returns {Promise<Array>} - Array of recording objects with keys
 */
async function getAllRecordings() {
  return await dbManager.getAllRecordings();
}

/**
 * Get a specific recording by key
 * @param {string} key - Recording key
 * @returns {Promise<Object|null>} - Recording object or null
 */
async function getRecording(key) {
  return await dbManager.getRecording(key);
}

/**
 * Delete a recording from IndexedDB
 * @param {string} key - Recording key
 * @returns {Promise<void>}
 */
async function deleteRecording(key) {
  await dbManager.deleteRecording(key);
}

/**
 * Update transcription for a recording
 * @param {string} key - Recording key
 * @param {string} transcription - Transcription text
 * @returns {Promise<void>}
 */
async function updateTranscription(key, transcription) {
  await dbManager.updateTranscription(key, transcription);
}

/**
 * Update processed transcription for a recording
 * @param {string} key - Recording key
 * @param {string} processedTranscription - Processed transcription text
 * @param {string} promptId - ID of the prompt used for processing
 * @returns {Promise<void>}
 */
async function updateProcessedTranscription(key, processedTranscription, promptId) {
  await dbManager.updateProcessedTranscription(key, processedTranscription, promptId);
}

/**
 * Get storage usage information
 * @returns {Promise<Object>} - Object with count, sizeInMB, and totalBytes
 */
async function getStorageInfo() {
  const info = await dbManager.getStorageInfo();

  // IndexedDB has much larger quota (typically 50% of available disk space)
  // For display purposes, we'll show the actual usage
  return {
    count: info.count,
    bytesInUse: info.totalBytes,
    sizeInMB: info.sizeInMB,
    // IndexedDB quota is dynamic, but much larger than chrome.storage.local
    quota: null, // Not a fixed quota
    percentUsed: null // Can't calculate without knowing actual quota
  };
}

/**
 * Clear all recordings from IndexedDB
 * @returns {Promise<void>}
 */
async function clearAllRecordings() {
  await dbManager.clearAllRecordings();
}

/**
 * Migrate data from chrome.storage.local to IndexedDB
 * This function should be called once to migrate existing data
 * @returns {Promise<Object>} - Migration results
 */
async function migrateFromChromeStorage() {
  console.log('Starting migration from chrome.storage.local to IndexedDB...');

  const data = await chrome.storage.local.get(null);
  const recordingKeys = Object.keys(data).filter(key => key.startsWith('recording-'));

  let migrated = 0;
  let failed = 0;

  for (const key of recordingKeys) {
    try {
      const recording = data[key];
      await dbManager.saveRecording(key, {
        data: recording.audio,
        timestamp: recording.timestamp,
        transcription: recording.transcription,
        source: recording.source || 'recording',
        filename: recording.filename || null,
        fileSize: recording.fileSize || null,
        mimeType: recording.mimeType || null,
        duration: recording.duration || null
      });
      migrated++;
      console.log(`Migrated ${key}`);
    } catch (error) {
      console.error(`Failed to migrate ${key}:`, error);
      failed++;
    }
  }

  // After successful migration, optionally clear old data
  if (migrated > 0) {
    console.log(`Migration complete: ${migrated} recordings migrated, ${failed} failed`);
    // Uncomment to remove old data after migration:
    // await chrome.storage.local.remove(recordingKeys);
  }

  return { migrated, failed, total: recordingKeys.length };
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.StorageUtils = {
    saveRecording,
    getAllRecordings,
    getRecording,
    deleteRecording,
    updateTranscription,
    updateProcessedTranscription,
    getStorageInfo,
    clearAllRecordings,
    migrateFromChromeStorage
  };
}
