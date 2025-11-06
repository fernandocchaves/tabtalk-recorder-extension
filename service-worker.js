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

      case "recording-stopped":
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
            if (response && response.success) {
              console.log('Recording saved successfully with key:', response.key);
            } else {
              console.error('Failed to save recording:', response?.error);
            }
          });
        } catch (error) {
          console.error('Error saving recording:', error);
        }
        break;
    }
  }
});
