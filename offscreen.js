let recorder;
let data = [];
let activeStreams = [];

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target === "offscreen") {
    switch (message.type) {
      case "start-recording":
        startRecording(message.data);
        break;
      case "stop-recording":
        stopRecording();
        break;
      default:
        throw new Error("Unrecognized message:", message.type);
    }
  } else if (message.target === "storage-handler") {
    // Handle IndexedDB operations for service worker
    handleStorageOperation(message, sendResponse);
    return true; // Keep message channel open for async response
  }
});

// Handle storage operations from service worker
async function handleStorageOperation(message, sendResponse) {
  try {
    // Wait for StorageUtils to be available (loaded by utils/storage.js module)
    let attempts = 0;
    while (!window.StorageUtils && attempts < 100) {
      await new Promise(resolve => setTimeout(resolve, 50));
      attempts++;
    }

    if (!window.StorageUtils) {
      throw new Error('StorageUtils not available after waiting');
    }

    switch (message.type) {
      case 'indexeddb-save':
        const key = await window.StorageUtils.saveRecording(
          message.data.audioDataUrl,
          message.data.metadata
        );
        sendResponse({ success: true, key });
        break;

      case 'indexeddb-getall':
        const recordings = await window.StorageUtils.getAllRecordings();
        sendResponse({ success: true, recordings });
        break;

      case 'indexeddb-delete':
        await window.StorageUtils.deleteRecording(message.data.key);
        sendResponse({ success: true });
        break;

      default:
        sendResponse({ error: 'Unknown storage operation' });
    }
  } catch (error) {
    console.error('Storage operation failed:', error);
    sendResponse({ error: error.message });
  }
}

async function startRecording(streamId) {
  if (recorder?.state === "recording") {
    throw new Error("Called startRecording while recording is in progress.");
  }

  await stopAllStreams();

  try {
    // Get tab audio stream
    const tabStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      },
      video: false,
    });

    // Get microphone stream with noise cancellation
    const micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    activeStreams.push(tabStream, micStream);

    // Create audio context
    const audioContext = new AudioContext();

    // Create sources and destination
    const tabSource = audioContext.createMediaStreamSource(tabStream);
    const micSource = audioContext.createMediaStreamSource(micStream);
    const destination = audioContext.createMediaStreamDestination();

    // Create gain nodes
    const tabGain = audioContext.createGain();
    const micGain = audioContext.createGain();

    // Set gain values
    tabGain.gain.value = 1.0; // Normal tab volume
    micGain.gain.value = 1.5; // Slightly boosted mic volume

    // Connect tab audio to both speakers and recorder
    tabSource.connect(tabGain);
    tabGain.connect(audioContext.destination);
    tabGain.connect(destination);

    // Connect mic to recorder only (prevents echo)
    micSource.connect(micGain);
    micGain.connect(destination);

    // Start recording
    recorder = new MediaRecorder(destination.stream, {
      mimeType: "audio/webm",
    });
    recorder.ondataavailable = (event) => data.push(event.data);
    recorder.onstop = async () => {
      const blob = new Blob(data, { type: "audio/webm" });
      const reader = new FileReader();
      reader.onload = () => {
        chrome.runtime.sendMessage({
          type: "save-recording",
          target: "service-worker",
          data: reader.result,
        });
      };
      reader.readAsDataURL(blob);

      // Cleanup
      recorder = undefined;
      data = [];

      chrome.runtime.sendMessage({
        type: "recording-stopped",
        target: "service-worker",
      });
    };

    recorder.start();
    window.location.hash = "recording";

    chrome.runtime.sendMessage({
      type: "update-icon",
      target: "service-worker",
      recording: true,
    });
  } catch (error) {
    console.error("Error starting recording:", error);
    chrome.runtime.sendMessage({
      type: "recording-error",
      target: "popup",
      error: error.message,
    });
  }
}

async function stopRecording() {
  if (recorder && recorder.state === "recording") {
    recorder.stop();
  }

  await stopAllStreams();
  window.location.hash = "";

  chrome.runtime.sendMessage({
    type: "update-icon",
    target: "service-worker",
    recording: false,
  });
}

async function stopAllStreams() {
  activeStreams.forEach((stream) => {
    stream.getTracks().forEach((track) => {
      track.stop();
    });
  });

  activeStreams = [];
  await new Promise((resolve) => setTimeout(resolve, 100));
}
