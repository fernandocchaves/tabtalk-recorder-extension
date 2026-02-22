// Track the currently recording tab
let recordingTabId = null;

// On service worker startup, check for incomplete recordings and finalize them
chrome.runtime.onStartup.addListener(async () => {
  console.log('Service worker started, checking for incomplete recordings...');
  await checkAndFinalizeIncompleteRecordings();
});

// Also check when extension is installed or updated
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Extension installed/updated, checking for incomplete recordings...');
  await checkAndFinalizeIncompleteRecordings();
});

// Storage bridge for contexts that don't expose chrome.storage (e.g. offscreen)
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'service-worker-storage') {
    return false;
  }

  (async () => {
    try {
      switch (message.type) {
        case 'storage-get': {
          const data = await chrome.storage.local.get(message.keys);
          sendResponse({ success: true, data });
          break;
        }
        case 'storage-set': {
          await chrome.storage.local.set(message.items || {});
          sendResponse({ success: true });
          break;
        }
        case 'storage-remove': {
          await chrome.storage.local.remove(message.keys);
          sendResponse({ success: true });
          break;
        }
        default:
          sendResponse({ success: false, error: 'Unknown storage bridge operation' });
      }
    } catch (error) {
      console.error('Storage bridge error:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();

  return true;
});

// Helper function to check and finalize incomplete recordings
async function checkAndFinalizeIncompleteRecordings() {
  try {
    const { activeRecordingId, recordingStartTime } = await chrome.storage.local.get([
      'activeRecordingId',
      'recordingStartTime'
    ]);

    if (activeRecordingId && recordingStartTime) {
      console.log('Found incomplete recording:', activeRecordingId);

      // Ensure offscreen document exists before sending message
      const contexts = await chrome.runtime.getContexts({});
      const offscreenDocument = contexts.find(
        (c) => c.contextType === "OFFSCREEN_DOCUMENT"
      );

      if (!offscreenDocument) {
        console.log('Creating offscreen document to finalize recording...');
        await chrome.offscreen.createDocument({
          url: "offscreen.html",
          reasons: ["USER_MEDIA"],
          justification: "Finalizing incomplete recording",
        });
      }

      // Wait a bit for offscreen document to initialize
      await new Promise(resolve => setTimeout(resolve, 500));

      // Send message to offscreen document to finalize the recording
      chrome.runtime.sendMessage({
        type: 'finalize-incomplete',
        target: 'offscreen',
        data: {
          recordingId: activeRecordingId,
          recordingStartTime: recordingStartTime
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error finalizing incomplete recording:', chrome.runtime.lastError.message);
        } else {
          console.log('Incomplete recording finalized successfully');
        }
      });

      // Clear the recording state
      await chrome.storage.local.remove(['activeRecordingId', 'recordingStartTime']);

      // Reset icon to not-recording state
      chrome.action.setIcon({
        path: {
          "16": "icons/not-recording-16.png",
          "32": "icons/not-recording-32.png",
          "48": "icons/not-recording-48.png",
          "128": "icons/not-recording-128.png"
        }
      });
    }
  } catch (error) {
    console.error('Error checking for incomplete recordings:', error);
  }
}

chrome.runtime.onMessage.addListener(async (message) => {
  if (message.target === "service-worker") {
    switch (message.type) {
      case "request-recording":
        try {
          const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
          });

          // Check if we can record this tab
          if (
            !tab ||
            tab.url.startsWith("chrome://") ||
            tab.url.startsWith("chrome-extension://")
          ) {
            chrome.runtime.sendMessage({
              type: "recording-error",
              target: "offscreen",
              error:
                "Cannot record Chrome system pages. Please try on a regular webpage.",
            });
            return;
          }

          // Ensure we have access to the tab
          await chrome.tabs.update(tab.id, {});

          // Get a MediaStream for the active tab
          const streamId = await chrome.tabCapture.getMediaStreamId({
            targetTabId: tab.id,
          });

          // Store the tab ID we're recording from
          recordingTabId = tab.id;
          console.log('Started recording from tab:', recordingTabId);

          // Send the stream ID to the offscreen document to start recording
          chrome.runtime.sendMessage({
            type: "start-recording",
            target: "offscreen",
            data: streamId,
          });

          chrome.action.setIcon({
            path: {
              "16": "/icons/recording-16.png",
              "32": "/icons/recording-32.png",
              "48": "/icons/recording-48.png",
              "128": "/icons/recording-128.png"
            }
          });
        } catch (error) {
          chrome.runtime.sendMessage({
            type: "recording-error",
            target: "offscreen",
            error: error.message,
          });
        }
        break;

      case "recording-started":
        // Store the tab ID when recording starts
        recordingTabId = message.data.tabId;
        console.log('Recording started on tab:', recordingTabId);
        break;

      case "recording-stopped":
        // Clear the recording tab ID
        recordingTabId = null;
        console.log('Recording stopped, cleared tab ID');

        chrome.action.setIcon({
          path: {
            "16": "icons/not-recording-16.png",
            "32": "icons/not-recording-32.png",
            "48": "icons/not-recording-48.png",
            "128": "icons/not-recording-128.png"
          }
        });
        break;

      case "update-icon":
        chrome.action.setIcon({
          path: message.recording
            ? {
                "16": "icons/recording-16.png",
                "32": "icons/recording-32.png",
                "48": "icons/recording-48.png",
                "128": "icons/recording-128.png"
              }
            : {
                "16": "icons/not-recording-16.png",
                "32": "icons/not-recording-32.png",
                "48": "icons/not-recording-48.png",
                "128": "icons/not-recording-128.png"
              }
        });
        break;
      case "save-recording":
        // Delegate to offscreen document for IndexedDB storage
        (async () => {
          try {
            chrome.runtime.sendMessage({
              type: 'indexeddb-save',
              target: 'storage-handler',
              data: {
                audioDataUrl: message.data,
                metadata: {
                  source: 'recording'
                }
              }
            }, (response) => {
              if (chrome.runtime.lastError) {
                console.error('Error saving recording:', chrome.runtime.lastError.message);
              } else if (response && response.success) {
                console.log('Recording saved successfully with key:', response.key);
              } else {
                console.error('Failed to save recording:', response?.error || 'Unknown error');
              }
            });
          } catch (error) {
            console.error('Error saving recording:', error);
          }
        })();
        break;

      case "set-recording-state":
        // Store recording state in chrome.storage
        console.log('Setting recording state:', message.data);
        chrome.storage.local.set({
          recordingStartTime: message.data.recordingStartTime,
          activeRecordingId: message.data.activeRecordingId
        }, () => {
          console.log('Recording state saved to chrome.storage');
        });
        break;

      case "clear-recording-state":
        // Clear recording state from chrome.storage
        console.log('Clearing recording state');
        chrome.storage.local.remove(['activeRecordingId', 'recordingStartTime'], () => {
          console.log('Recording state cleared from chrome.storage');
        });
        break;

      case "finalize-incomplete-recording":
        // Forward to offscreen document to handle recovery
        console.log('Finalizing incomplete recording:', message.data.recordingId);
        chrome.runtime.sendMessage({
          type: 'finalize-incomplete',
          target: 'offscreen',
          data: message.data
        });
        break;
    }
  }
});

// Listen for tab close events to auto-stop recording
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  if (recordingTabId && tabId === recordingTabId) {
    console.log('Recording tab closed, stopping recording...');

    // Stop the recording
    chrome.runtime.sendMessage({
      type: "stop-recording",
      target: "offscreen"
    });

    // Clear the recording tab ID
    recordingTabId = null;

    // Update icon
    chrome.action.setIcon({
      path: {
        "16": "icons/not-recording-16.png",
        "32": "icons/not-recording-32.png",
        "48": "icons/not-recording-48.png",
        "128": "icons/not-recording-128.png"
      }
    });
  }
});
