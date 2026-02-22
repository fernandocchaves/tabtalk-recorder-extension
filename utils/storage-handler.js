/**
 * Storage handler for service worker context
 * Since service workers have limited IndexedDB access, we use a message-passing system
 * to delegate storage operations to contexts that have full IndexedDB support
 */

// Check if we're in a service worker context
const isServiceWorker = typeof importScripts === 'function';

/**
 * Save a recording
 * In service worker: sends message to offscreen document
 * In other contexts: uses IndexedDB directly
 */
async function saveRecording(mediaPayload, metadata = {}) {
  if (isServiceWorker) {
    // Service worker: delegate to offscreen document or create storage context
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'indexeddb-save',
        target: 'storage-handler',
        data: {
          mediaPayload,
          metadata
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else if (response && response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response?.key);
        }
      });
    });
  } else {
    // Browser context: use IndexedDB directly
    if (window.StorageUtils) {
      return window.StorageUtils.saveRecording(mediaPayload, metadata);
    } else {
      throw new Error('StorageUtils not available');
    }
  }
}

/**
 * Get all recordings
 */
async function getAllRecordings() {
  if (isServiceWorker) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'indexeddb-getall',
        target: 'storage-handler'
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else if (response && response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response?.recordings || []);
        }
      });
    });
  } else {
    if (window.StorageUtils) {
      return window.StorageUtils.getAllRecordings();
    } else {
      throw new Error('StorageUtils not available');
    }
  }
}

/**
 * Delete a recording
 */
async function deleteRecording(key) {
  if (isServiceWorker) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'indexeddb-delete',
        target: 'storage-handler',
        data: { key }
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else if (response && response.error) {
          reject(new Error(response.error));
        } else {
          resolve();
        }
      });
    });
  } else {
    if (window.StorageUtils) {
      return window.StorageUtils.deleteRecording(key);
    } else {
      throw new Error('StorageUtils not available');
    }
  }
}

// For service worker, export as global
if (isServiceWorker) {
  self.StorageHandler = {
    saveRecording,
    getAllRecordings,
    deleteRecording
  };
}

// For browser context, export to window
if (typeof window !== 'undefined') {
  window.StorageHandler = {
    saveRecording,
    getAllRecordings,
    deleteRecording
  };
}
