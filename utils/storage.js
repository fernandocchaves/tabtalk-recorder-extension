// Utility functions for Chrome storage operations

/**
 * Save a recording to storage
 * @param {string} audioDataUrl - Audio data in data URL format
 * @returns {Promise<string>} - Key of the saved recording
 */
async function saveRecording(audioDataUrl) {
  const timestamp = Date.now();
  const key = `recording-${timestamp}`;

  await chrome.storage.local.set({
    [key]: {
      audio: audioDataUrl,
      timestamp: timestamp,
      transcription: null
    }
  });

  return key;
}

/**
 * Get all recordings from storage
 * @returns {Promise<Array>} - Array of recording objects with keys
 */
async function getAllRecordings() {
  const data = await chrome.storage.local.get(null);
  const recordings = [];

  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith('recording-')) {
      recordings.push({ key, ...value });
    }
  }

  // Sort by timestamp (newest first)
  recordings.sort((a, b) => b.timestamp - a.timestamp);

  return recordings;
}

/**
 * Delete a recording from storage
 * @param {string} key - Recording key
 * @returns {Promise<void>}
 */
async function deleteRecording(key) {
  await chrome.storage.local.remove(key);
}

/**
 * Update transcription for a recording
 * @param {string} key - Recording key
 * @param {string} transcription - Transcription text
 * @returns {Promise<void>}
 */
async function updateTranscription(key, transcription) {
  const data = await chrome.storage.local.get(key);
  if (data[key]) {
    data[key].transcription = transcription;
    await chrome.storage.local.set({ [key]: data[key] });
  }
}

/**
 * Get storage usage information
 * @returns {Promise<Object>} - Object with bytesInUse and quota information
 */
async function getStorageInfo() {
  return new Promise((resolve) => {
    chrome.storage.local.getBytesInUse(null, (bytesInUse) => {
      // Chrome local storage quota is approximately 10MB
      const quota = 10 * 1024 * 1024;
      resolve({
        bytesInUse,
        quota,
        percentUsed: (bytesInUse / quota) * 100
      });
    });
  });
}

/**
 * Clear all recordings from storage
 * @returns {Promise<void>}
 */
async function clearAllRecordings() {
  const data = await chrome.storage.local.get(null);
  const recordingKeys = Object.keys(data).filter(key => key.startsWith('recording-'));
  await chrome.storage.local.remove(recordingKeys);
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.StorageUtils = {
    saveRecording,
    getAllRecordings,
    deleteRecording,
    updateTranscription,
    getStorageInfo,
    clearAllRecordings
  };
}
