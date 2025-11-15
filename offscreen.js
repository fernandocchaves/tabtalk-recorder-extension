let recorder;
let data = [];
let activeStreams = [];
let recordingStartTime = null;
let chunkSaveInterval = null;
let currentRecordingId = null;
let audioContext = null;
let destination = null;
let pcmChunks = []; // Store PCM Float32Array chunks
let scriptProcessor = null;
let lastSavedPcmIndex = 0; // Track which PCM chunks we've saved
let sampleRate = 48000;
let numberOfChannels = 1;

// Get constants from centralized config (loaded via constants.js)
const getChunkIntervalMs = () =>
  window.RECORDING_CONSTANTS?.TRANSCRIPTION_CHUNK_INTERVAL_MS || 60000;
const getCrashRecoveryIntervalMs = () =>
  window.RECORDING_CONSTANTS?.CRASH_RECOVERY_INTERVAL_MS || 10000;

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
    handleStorageOperation(message, sendResponse);
    return true;
  }
});

async function handleStorageOperation(message, sendResponse) {
  try {
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

    // Load user settings for audio quality and gain
    const configManager = new ConfigManager();
    const userConfig = await configManager.load();
    const desiredSampleRate = userConfig.audioQuality || 48000;

    // Create audio context with user-selected sample rate
    audioContext = new AudioContext({ sampleRate: desiredSampleRate });
    sampleRate = audioContext.sampleRate;
    numberOfChannels = 1; // Mono for simplicity

    console.log(`Audio context created with sample rate: ${sampleRate} Hz (requested: ${desiredSampleRate} Hz)`);

    // Create sources
    const tabSource = audioContext.createMediaStreamSource(tabStream);
    const micSource = audioContext.createMediaStreamSource(micStream);
    destination = audioContext.createMediaStreamDestination();

    // Create gain nodes with user settings
    const tabGain = audioContext.createGain();
    const micGain = audioContext.createGain();

    tabGain.gain.value = userConfig.tabGain || 1.0;
    micGain.gain.value = userConfig.micGain || 1.5;

    // Connect tab audio to speakers and destination
    tabSource.connect(tabGain);
    tabGain.connect(audioContext.destination);
    tabGain.connect(destination);

    // Connect mic to destination only
    micSource.connect(micGain);
    micGain.connect(destination);

    // Set up PCM capture using ScriptProcessorNode
    // This captures raw audio data continuously without any encoding gaps
    const bufferSize = 4096;
    scriptProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1);

    // Mix tab and mic into single channel for PCM capture
    const merger = audioContext.createChannelMerger(2);
    tabGain.connect(merger, 0, 0);
    micGain.connect(merger, 0, 0);

    // Capture PCM data
    scriptProcessor.onaudioprocess = (event) => {
      const inputData = event.inputBuffer.getChannelData(0);
      // Clone the data since the buffer is reused
      const pcmData = new Float32Array(inputData);
      pcmChunks.push(pcmData);
    };

    merger.connect(scriptProcessor);
    scriptProcessor.connect(audioContext.destination);

    // Also set up MediaRecorder for WebM output (for playback preview)
    recorder = new MediaRecorder(destination.stream, {
      mimeType: "audio/webm",
    });

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        data.push(event.data);
      }
    };

    recorder.onstop = async () => {
      console.log('Recorder stopped. Finalizing...');
      await finalizeRecording();
      cleanup();
    };

    // Start continuous recording (no stopping/restarting)
    recorder.start(1000); // Get data every second for crash recovery
    window.location.hash = "recording";

    // Initialize recording session
    recordingStartTime = Date.now();
    currentRecordingId = `recording-${recordingStartTime}`;

    console.log('Recording started:', {
      recordingStartTime,
      activeRecordingId: currentRecordingId,
      sampleRate,
      numberOfChannels
    });

    // Store recording state
    chrome.runtime.sendMessage({
      type: "set-recording-state",
      target: "service-worker",
      data: {
        recordingStartTime: recordingStartTime,
        activeRecordingId: currentRecordingId
      }
    });

    // Set up periodic chunk saving (PCM data for crash recovery)
    const chunkIntervalMs = getCrashRecoveryIntervalMs();
    if (chunkIntervalMs > 0) {
      chunkSaveInterval = setInterval(() => {
        savePcmChunk();
      }, chunkIntervalMs);
      console.log('PCM chunk save interval set up:', chunkIntervalMs, 'ms');
    }

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

function cleanup() {
  if (chunkSaveInterval) {
    clearInterval(chunkSaveInterval);
    chunkSaveInterval = null;
  }

  if (scriptProcessor) {
    scriptProcessor.disconnect();
    scriptProcessor = null;
  }

  recorder = undefined;
  data = [];
  pcmChunks = [];
  lastSavedPcmIndex = 0;
  recordingStartTime = null;
  currentRecordingId = null;
  audioContext = null;
  destination = null;

  chrome.runtime.sendMessage({
    type: "clear-recording-state",
    target: "service-worker",
  });

  chrome.runtime.sendMessage({
    type: "recording-stopped",
    target: "service-worker",
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

// Save PCM chunk for crash recovery (incremental, concatenatable)
async function savePcmChunk() {
  const newChunksCount = pcmChunks.length - lastSavedPcmIndex;

  if (newChunksCount <= 0) {
    return;
  }

  const newChunks = pcmChunks.slice(lastSavedPcmIndex);

  try {
    // Concatenate PCM chunks into single Float32Array
    const totalLength = newChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const concatenated = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of newChunks) {
      concatenated.set(chunk, offset);
      offset += chunk.length;
    }

    // Convert to base64 for storage (process in chunks to avoid stack overflow)
    const uint8Array = new Uint8Array(concatenated.buffer);
    let binary = '';
    const chunkSize = 8192; // Process 8KB at a time
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
      binary += String.fromCharCode.apply(null, chunk);
    }
    const base64 = btoa(binary);
    const dataUrl = `data:application/octet-stream;base64,${base64}`;

    const chunkNumber = await getNextChunkNumber();
    const chunkTimestamp = Date.now();

    console.log(`Saving PCM chunk ${chunkNumber} (${(totalLength * 4 / 1024).toFixed(2)} KB, ${newChunksCount} buffers)`);

    let attempts = 0;
    while (!window.StorageUtils && attempts < 100) {
      await new Promise(r => setTimeout(r, 50));
      attempts++;
    }

    if (!window.StorageUtils) {
      throw new Error('StorageUtils not available');
    }

    const chunkKey = `${currentRecordingId}-chunk-${chunkNumber}`;
    await window.StorageUtils.saveRecording(dataUrl, {
      key: chunkKey,
      source: 'recording-chunk',
      parentRecordingId: currentRecordingId,
      chunkNumber: chunkNumber,
      chunkSize: totalLength * 4, // Float32 = 4 bytes per sample
      chunkTimestamp: chunkTimestamp,
      sampleRate: sampleRate,
      numberOfChannels: numberOfChannels,
      samplesCount: totalLength,
      format: 'pcm-float32'
    });

    console.log(`PCM chunk ${chunkNumber} saved successfully`);
    lastSavedPcmIndex = pcmChunks.length;

  } catch (error) {
    console.error('Failed to save PCM chunk:', error);
  }
}

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

async function finalizeRecording() {
  try {
    console.log('Finalizing recording...');

    // Save any remaining PCM data
    await savePcmChunk();

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

    console.log(`Found ${chunks.length} PCM chunks to finalize`);

    if (chunks.length === 0) {
      console.error('No chunks found for recording');
      return;
    }

    // Calculate total size and duration
    const totalSamples = chunks.reduce((sum, chunk) => sum + (chunk.samplesCount || 0), 0);
    const totalSize = totalSamples * 4; // Float32 = 4 bytes
    const estimatedDuration = Math.floor(totalSamples / sampleRate);

    // Also save the WebM data for quick playback preview
    let webmDataUrl = 'data:audio/webm;base64,';
    console.log(`WebM data chunks collected: ${data.length} blobs`);
    if (data.length > 0) {
      const webmBlob = new Blob(data, { type: 'audio/webm' });
      console.log(`WebM blob size: ${(webmBlob.size / 1024).toFixed(2)} KB`);
      const reader = new FileReader();
      webmDataUrl = await new Promise((resolve) => {
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(webmBlob);
      });
      console.log(`WebM data URL length: ${webmDataUrl.length} chars (${(webmDataUrl.length / 1024).toFixed(2)} KB)`);
    } else {
      console.warn('No WebM data collected - recording may not have playback preview');
    }

    // Save the final recording metadata
    const dbModule = await import('./utils/indexeddb.js').then(m => m.default);
    await dbModule.init();

    await dbModule.saveRecording(currentRecordingId, {
      key: currentRecordingId,
      data: webmDataUrl, // WebM for quick playback
      source: 'recording',
      timestamp: recordingStartTime,
      duration: estimatedDuration,
      fileSize: totalSize,
      mimeType: 'audio/webm',
      chunksCount: chunks.length,
      isChunked: true,
      isPcm: true, // Flag to indicate PCM chunks
      sampleRate: sampleRate,
      numberOfChannels: numberOfChannels,
      totalSamples: totalSamples
    });

    console.log(`✓ Final recording saved: ${chunks.length} PCM chunks, ${estimatedDuration}s, ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`✓ Recording saved with key: ${currentRecordingId}, isPcm: true, sampleRate: ${sampleRate} Hz`);

  } catch (error) {
    console.error('❌ Error finalizing recording:', error);
    console.error('Stack trace:', error.stack);
  }
}
