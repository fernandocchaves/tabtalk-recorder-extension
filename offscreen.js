let recorder;
let data = [];
let activeStreams = [];
let recordingStartTime = null;
let chunkInterval = null;
let currentRecordingId = null;
const CHUNK_INTERVAL_MS = 60000; // Save chunks every 60 seconds

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
      // Clear chunk interval
      if (chunkInterval) {
        clearInterval(chunkInterval);
        chunkInterval = null;
      }

      // Save final chunk if there's data
      if (data.length > 0) {
        await saveChunk(true); // true = final chunk
      } else {
        // No new data, just finalize the existing chunks
        await finalizeRecording();
      }

      // Cleanup
      recorder = undefined;
      data = [];
      recordingStartTime = null;
      currentRecordingId = null;

      // Clear active recording from storage via service worker
      chrome.runtime.sendMessage({
        type: "clear-recording-state",
        target: "service-worker",
      });

      chrome.runtime.sendMessage({
        type: "recording-stopped",
        target: "service-worker",
      });
    };

    // Start recording with timeslice to get data periodically
    recorder.start();
    window.location.hash = "recording";

    // Initialize recording session
    recordingStartTime = Date.now();
    currentRecordingId = `recording-${recordingStartTime}`;

    console.log('Sending recording state to service worker:', {
      recordingStartTime,
      activeRecordingId: currentRecordingId
    });

    // Store start time and recording ID via service worker
    chrome.runtime.sendMessage({
      type: "set-recording-state",
      target: "service-worker",
      data: {
        recordingStartTime: recordingStartTime,
        activeRecordingId: currentRecordingId
      }
    });

    // Set up periodic chunk saving
    chunkInterval = setInterval(async () => {
      if (recorder && recorder.state === "recording") {
        // Request data from recorder to trigger ondataavailable
        recorder.requestData();

        // Wait a bit for ondataavailable to fire
        await new Promise(resolve => setTimeout(resolve, 100));

        if (data.length > 0) {
          await saveChunk(false); // false = intermediate chunk
        } else {
          console.log('No data available yet for chunk save');
        }
      }
    }, CHUNK_INTERVAL_MS);

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

// Save a chunk of recorded data
async function saveChunk(isFinal = false) {
  if (data.length === 0) {
    console.log('No data to save in chunk');
    return;
  }

  try {
    const blob = new Blob(data, { type: "audio/webm" });
    const chunkNumber = await getNextChunkNumber();

    console.log(`Saving chunk ${chunkNumber} (${(blob.size / 1024 / 1024).toFixed(2)} MB)${isFinal ? ' - FINAL' : ''}`);

    const reader = new FileReader();

    await new Promise((resolve, reject) => {
      reader.onload = async () => {
        try {
          // Wait for StorageUtils to be available
          let attempts = 0;
          while (!window.StorageUtils && attempts < 100) {
            await new Promise(r => setTimeout(r, 50));
            attempts++;
          }

          if (!window.StorageUtils) {
            throw new Error('StorageUtils not available');
          }

          // Save chunk to IndexedDB with chunk metadata
          const chunkKey = `${currentRecordingId}-chunk-${chunkNumber}`;
          await window.StorageUtils.saveRecording(reader.result, {
            key: chunkKey, // Use custom key for chunks
            source: 'recording-chunk',
            parentRecordingId: currentRecordingId,
            chunkNumber: chunkNumber,
            isFinal: isFinal,
            chunkSize: blob.size,
            chunkTimestamp: Date.now()
          });

          console.log(`Chunk ${chunkNumber} saved successfully`);

          // If this is the final chunk, merge all chunks
          if (isFinal) {
            await finalizeRecording();
          }

          resolve();
        } catch (error) {
          console.error('Error saving chunk:', error);
          reject(error);
        }
      };

      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    // Clear the data array after successful save
    data = [];

  } catch (error) {
    console.error('Failed to save chunk:', error);
    // Don't clear data on error - keep it for retry
  }
}

// Get the next chunk number for the current recording
async function getNextChunkNumber() {
  try {
    if (!window.StorageUtils) {
      return 0;
    }

    const allRecordings = await window.StorageUtils.getAllRecordings();
    const chunks = allRecordings.filter(r =>
      r.source === 'recording-chunk' &&
      r.parentRecordingId === currentRecordingId
    );

    return chunks.length;
  } catch (error) {
    console.error('Error getting chunk number:', error);
    return 0;
  }
}

// Finalize recording by merging all chunks
async function finalizeRecording() {
  try {
    console.log('Finalizing recording...');

    // Wait for StorageUtils to be available
    let attempts = 0;
    while (!window.StorageUtils && attempts < 100) {
      await new Promise(r => setTimeout(r, 50));
      attempts++;
    }

    if (!window.StorageUtils) {
      throw new Error('StorageUtils not available');
    }

    // Get all chunks for this recording
    const allRecordings = await window.StorageUtils.getAllRecordings();
    const chunks = allRecordings.filter(r =>
      r.source === 'recording-chunk' &&
      r.parentRecordingId === currentRecordingId
    ).sort((a, b) => a.chunkNumber - b.chunkNumber);

    console.log(`Found ${chunks.length} chunks to merge`);

    if (chunks.length === 0) {
      console.error('No chunks found for recording');
      return;
    }

    // Convert data URLs back to blobs and merge (without fetch to avoid CSP issues)
    const blobs = chunks.map((chunk) => {
      const arr = chunk.data.split(',');
      const mime = arr[0].match(/:(.*?);/)[1];
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new Blob([u8arr], { type: mime });
    });

    const mergedBlob = new Blob(blobs, { type: "audio/webm" });

    console.log(`Merged ${chunks.length} chunks into ${(mergedBlob.size / 1024 / 1024).toFixed(2)} MB`);

    // Convert merged blob to data URL
    const reader = new FileReader();
    await new Promise((resolve, reject) => {
      reader.onload = async () => {
        try {
          // Save the final merged recording
          const finalKey = await window.StorageUtils.saveRecording(reader.result, {
            source: 'recording',
            duration: Math.floor((Date.now() - recordingStartTime) / 1000),
            fileSize: mergedBlob.size,
            mimeType: 'audio/webm',
            chunksCount: chunks.length
          });

          console.log('Final recording saved with key:', finalKey);

          // Delete all chunks to free up space
          for (const chunk of chunks) {
            await window.StorageUtils.deleteRecording(chunk.key);
          }

          console.log('Chunks cleaned up successfully');
          resolve();
        } catch (error) {
          console.error('Error saving final recording:', error);
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(mergedBlob);
    });

  } catch (error) {
    console.error('Error finalizing recording:', error);
    // Even if finalization fails, chunks are saved and can be manually recovered
  }
}
