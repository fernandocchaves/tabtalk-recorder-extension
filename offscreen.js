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
let autoTranscriptionTasks = new Map();

// Get constants from centralized config (loaded via constants.js)
const getChunkIntervalMs = () =>
  window.RECORDING_CONSTANTS?.TRANSCRIPTION_CHUNK_INTERVAL_MS || 300000;
const getCrashRecoveryIntervalMs = () =>
  window.RECORDING_CONSTANTS?.CRASH_RECOVERY_INTERVAL_MS || 10000;

function toBooleanSetting(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (
      normalized === "true" ||
      normalized === "1" ||
      normalized === "yes" ||
      normalized === "on"
    )
      return true;
    if (
      normalized === "false" ||
      normalized === "0" ||
      normalized === "no" ||
      normalized === "off"
    )
      return false;
  }
  if (typeof value === "number") return value !== 0;
  return Boolean(value);
}

async function storageBridgeGet(keys) {
  if (chrome?.storage?.local) {
    return chrome.storage.local.get(keys);
  }

  const response = await chrome.runtime.sendMessage({
    type: "storage-get",
    target: "service-worker-storage",
    keys,
  });

  if (!response?.success) {
    throw new Error(response?.error || "storage-get bridge failed");
  }

  return response.data || {};
}

async function loadOffscreenUserConfig() {
  const defaults =
    typeof window !== "undefined" && window.DEFAULT_CONFIG
      ? { ...window.DEFAULT_CONFIG }
      : {
          tabGain: 1.0,
          micGain: 1.5,
          audioQuality: 48000,
          enableMicrophoneCapture: false,
          autoTranscribe: false,
          transcriptionChunkIntervalMs: 60000,
          geminiTranscriptionMaxOutputTokens: 16384,
        };

  // Prefer direct read with literal key in offscreen context (more robust than relying on shared globals)
  try {
    const result = await storageBridgeGet("user_settings");
    if (result?.user_settings && typeof result.user_settings === "object") {
      return { ...defaults, ...result.user_settings };
    }
  } catch (error) {
    console.warn(
      "[CONFIG] Direct user_settings read failed in offscreen:",
      error,
    );
  }

  // Fallback to ConfigManager if available
  try {
    if (typeof ConfigManager !== "undefined") {
      const configManager = new ConfigManager();
      return await configManager.load();
    }
  } catch (error) {
    console.warn("[CONFIG] ConfigManager fallback failed in offscreen:", error);
  }

  return defaults;
}

async function getOffscreenTranscriptionService() {
  if (window.offscreenTranscriptionService) {
    return window.offscreenTranscriptionService;
  }

  if (typeof TranscriptionServiceFactory !== "undefined") {
    const serviceType =
      await TranscriptionServiceFactory.getConfiguredService();
    window.offscreenTranscriptionService =
      TranscriptionServiceFactory.create(serviceType);
    return window.offscreenTranscriptionService;
  }

  if (typeof GeminiTranscriptionService !== "undefined") {
    window.offscreenTranscriptionService = new GeminiTranscriptionService();
    return window.offscreenTranscriptionService;
  }

  throw new Error("No transcription service available in offscreen context");
}

async function runAutoTranscriptionIfEnabled(recordingKey) {
  if (!recordingKey) return;
  if (autoTranscriptionTasks.has(recordingKey))
    return autoTranscriptionTasks.get(recordingKey);

  const task = (async () => {
    try {
      const userConfig = await loadOffscreenUserConfig();

      if (!toBooleanSetting(userConfig.autoTranscribe, false)) {
        console.log("[AUTO TRANSCRIBE] Disabled in settings");
        return;
      }

      const { gemini_api_key: apiKey } =
        await storageBridgeGet("gemini_api_key");
      if (!apiKey) {
        console.warn(
          "[AUTO TRANSCRIBE] Skipped: Gemini API key not configured",
        );
        return;
      }

      console.log(`[AUTO TRANSCRIBE] Starting for ${recordingKey}`);
      const service = await getOffscreenTranscriptionService();
      const transcriptionText = await service.transcribeChunked(recordingKey);

      let attempts = 0;
      while (!window.StorageUtils && attempts < 100) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        attempts++;
      }

      if (!window.StorageUtils) {
        throw new Error("StorageUtils not available to save transcription");
      }

      await window.StorageUtils.updateTranscription(
        recordingKey,
        transcriptionText,
      );

      if (typeof service.clearTranscriptionState === "function") {
        await service.clearTranscriptionState(recordingKey);
      }

      console.log(
        `[AUTO TRANSCRIBE] Completed for ${recordingKey} (${transcriptionText.length} chars)`,
      );

      chrome.runtime.sendMessage({
        type: "transcription-updated",
        target: "history",
        data: { recordingKey },
      });
    } catch (error) {
      console.error(`[AUTO TRANSCRIBE] Failed for ${recordingKey}:`, error);
    } finally {
      autoTranscriptionTasks.delete(recordingKey);
    }
  })();

  autoTranscriptionTasks.set(recordingKey, task);
  return task;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target === "offscreen") {
    switch (message.type) {
      case "start-recording":
        startRecording(message.data);
        break;
      case "stop-recording":
        stopRecording();
        break;
      case "finalize-incomplete":
        // Handle incomplete recording finalization
        (async () => {
          try {
            console.log("Finalizing incomplete recording:", message.data);
            currentRecordingId = message.data.recordingId;
            recordingStartTime = message.data.recordingStartTime;

            // Set sample rate and channels (use defaults if not provided)
            sampleRate = message.data.sampleRate || 48000;
            numberOfChannels = message.data.numberOfChannels || 1;

            // Finalize the recording (this will save final entry with all chunks)
            await finalizeRecording();
            cleanup();

            console.log("Incomplete recording finalized successfully");
            sendResponse({ success: true });
          } catch (error) {
            console.error("Error finalizing incomplete recording:", error);
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true; // Keep channel open for async response
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
      await new Promise((resolve) => setTimeout(resolve, 50));
      attempts++;
    }

    if (!window.StorageUtils) {
      throw new Error("StorageUtils not available after waiting");
    }

    switch (message.type) {
      case "indexeddb-save":
        const key = await window.StorageUtils.saveRecording(
          message.data.audioDataUrl,
          message.data.metadata,
        );
        sendResponse({ success: true, key });
        break;

      case "indexeddb-getall":
        const recordings = await window.StorageUtils.getAllRecordings();
        sendResponse({ success: true, recordings });
        break;

      case "indexeddb-delete":
        await window.StorageUtils.deleteRecording(message.data.key);
        sendResponse({ success: true });
        break;

      default:
        sendResponse({ error: "Unknown storage operation" });
    }
  } catch (error) {
    console.error("Storage operation failed:", error);
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

    // Get microphone stream (if enabled in settings)
    let micStream = null;

    // Load full config for other settings (audio quality, gains, mic capture, etc)
    const userConfig = await loadOffscreenUserConfig();
    const enableMicrophoneCapture = toBooleanSetting(
      userConfig.enableMicrophoneCapture,
      false,
    );

    if (enableMicrophoneCapture) {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
        activeStreams.push(micStream);
        console.log("Microphone enabled");
      } catch (error) {
        console.warn("Failed to get microphone stream:", error.message);
        micStream = null;
      }
    } else {
      console.log("Recording tab audio only (microphone disabled)");
    }

    activeStreams.push(tabStream);

    // Get desired sample rate from already loaded config
    const desiredSampleRate = userConfig.audioQuality || 48000;

    // Create audio context with user-selected sample rate
    audioContext = new AudioContext({ sampleRate: desiredSampleRate });
    sampleRate = audioContext.sampleRate;
    numberOfChannels = 1; // Mono for simplicity

    console.log(
      `Audio context created with sample rate: ${sampleRate} Hz (requested: ${desiredSampleRate} Hz)`,
    );

    // Create sources
    const tabSource = audioContext.createMediaStreamSource(tabStream);
    const micSource = micStream
      ? audioContext.createMediaStreamSource(micStream)
      : null;
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

    // Connect mic to destination only (if mic stream exists)
    if (micSource) {
      micSource.connect(micGain);
      micGain.connect(destination);
    }

    // Set up PCM capture using ScriptProcessorNode
    // This captures raw audio data continuously without any encoding gaps
    const bufferSize = 4096;
    scriptProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1);

    // Sum tab + mic into one path for PCM capture (channel merger is not for mixing)
    const pcmMixNode = audioContext.createGain();
    tabGain.connect(pcmMixNode);
    if (micSource) {
      micGain.connect(pcmMixNode);
    }

    // Capture PCM data
    scriptProcessor.onaudioprocess = (event) => {
      const inputData = event.inputBuffer.getChannelData(0);
      // Clone the data since the buffer is reused
      const pcmData = new Float32Array(inputData);
      pcmChunks.push(pcmData);
    };

    pcmMixNode.connect(scriptProcessor);
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
      console.log("Recorder stopped. Finalizing...");
      await finalizeRecording();
      cleanup();
    };

    // Start continuous recording (no stopping/restarting)
    recorder.start(1000); // Get data every second for crash recovery
    window.location.hash = "recording";

    // Initialize recording session
    recordingStartTime = Date.now();
    currentRecordingId = `recording-${recordingStartTime}`;

    console.log("Recording started:", {
      recordingStartTime,
      activeRecordingId: currentRecordingId,
      sampleRate,
      numberOfChannels,
    });

    // Store recording state
    chrome.runtime.sendMessage({
      type: "set-recording-state",
      target: "service-worker",
      data: {
        recordingStartTime: recordingStartTime,
        activeRecordingId: currentRecordingId,
      },
    });

    // Set up periodic chunk saving (PCM data for crash recovery)
    const chunkIntervalMs = getCrashRecoveryIntervalMs();
    if (chunkIntervalMs > 0) {
      chunkSaveInterval = setInterval(() => {
        savePcmChunk();
      }, chunkIntervalMs);
      console.log("PCM chunk save interval set up:", chunkIntervalMs, "ms");
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
  // Skip if pcmChunks is not initialized (recovery scenario)
  if (!pcmChunks || pcmChunks.length === 0) {
    return;
  }

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

    // Convert Float32 to Int16 for storage (half the size)
    const int16Array = new Int16Array(totalLength);
    for (let i = 0; i < totalLength; i++) {
      const sample = concatenated[i];
      // Clamp to [-1, 1] and convert to Int16 range
      const clamped = Math.max(-1, Math.min(1, sample));
      int16Array[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    }

    // Convert to base64 for storage (process in chunks to avoid stack overflow)
    const uint8Array = new Uint8Array(int16Array.buffer);
    let binary = "";
    const chunkSize = 8192; // Process 8KB at a time
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(
        i,
        Math.min(i + chunkSize, uint8Array.length),
      );
      binary += String.fromCharCode.apply(null, chunk);
    }
    const base64 = btoa(binary);
    const dataUrl = `data:application/octet-stream;base64,${base64}`;

    const chunkNumber = await getNextChunkNumber();
    const chunkTimestamp = Date.now();

    console.log(
      `Saving PCM chunk ${chunkNumber} (${((totalLength * 2) / 1024).toFixed(2)} KB, ${newChunksCount} buffers)`,
    );

    let attempts = 0;
    while (!window.StorageUtils && attempts < 100) {
      await new Promise((r) => setTimeout(r, 50));
      attempts++;
    }

    if (!window.StorageUtils) {
      throw new Error("StorageUtils not available");
    }

    const chunkKey = `${currentRecordingId}-chunk-${chunkNumber}`;
    await window.StorageUtils.saveRecording(dataUrl, {
      key: chunkKey,
      source: "recording-chunk",
      parentRecordingId: currentRecordingId,
      chunkNumber: chunkNumber,
      chunkSize: totalLength * 2, // Int16 = 2 bytes per sample
      chunkTimestamp: chunkTimestamp,
      sampleRate: sampleRate,
      numberOfChannels: numberOfChannels,
      samplesCount: totalLength,
      format: "pcm-int16",
    });

    console.log(`PCM chunk ${chunkNumber} saved successfully`);
    lastSavedPcmIndex = pcmChunks.length;
  } catch (error) {
    console.error("Failed to save PCM chunk:", error);
  }
}

async function getNextChunkNumber() {
  try {
    if (!window.StorageUtils) {
      return 0;
    }

    const allRecordings = await window.StorageUtils.getAllRecordings();
    const chunks = allRecordings.filter(
      (r) =>
        r.source === "recording-chunk" &&
        r.parentRecordingId === currentRecordingId,
    );

    return chunks.length;
  } catch (error) {
    console.error("Error getting chunk number:", error);
    return 0;
  }
}

async function finalizeRecording() {
  try {
    console.log("Finalizing recording...");

    // Save any remaining PCM data
    await savePcmChunk();

    let attempts = 0;
    while (!window.StorageUtils && attempts < 100) {
      await new Promise((r) => setTimeout(r, 50));
      attempts++;
    }

    if (!window.StorageUtils) {
      throw new Error("StorageUtils not available");
    }

    // Get all chunks for this recording
    const allRecordings = await window.StorageUtils.getAllRecordings();
    const chunks = allRecordings
      .filter(
        (r) =>
          r.source === "recording-chunk" &&
          r.parentRecordingId === currentRecordingId,
      )
      .sort((a, b) => a.chunkNumber - b.chunkNumber);

    console.log(`Found ${chunks.length} PCM chunks to finalize`);

    if (chunks.length === 0) {
      console.error("No chunks found for recording");
      return;
    }

    // Calculate total size and duration
    const totalSamples = chunks.reduce(
      (sum, chunk) => sum + (chunk.samplesCount || 0),
      0,
    );
    const totalSize = totalSamples * 2; // Int16 = 2 bytes per sample
    const estimatedDuration = Math.floor(totalSamples / sampleRate);

    console.log(
      `PCM recording: ${chunks.length} chunks, ${totalSamples} samples, ${estimatedDuration}s`,
    );

    // Save the final recording metadata (no WebM data needed, PCM chunks are used for playback)
    const dbModule = await import("./utils/indexeddb.js").then(
      (m) => m.default,
    );
    await dbModule.init();

    await dbModule.saveRecording(currentRecordingId, {
      key: currentRecordingId,
      source: "recording",
      timestamp: recordingStartTime,
      duration: estimatedDuration,
      fileSize: totalSize,
      chunksCount: chunks.length,
      isChunked: true,
      isPcm: true, // Flag to indicate PCM chunks
      sampleRate: sampleRate,
      numberOfChannels: numberOfChannels,
      totalSamples: totalSamples,
    });

    const savedRecordingKey = currentRecordingId;
    console.log(
      `✓ Final recording saved: ${chunks.length} PCM chunks, ${estimatedDuration}s, ${(totalSize / 1024 / 1024).toFixed(2)} MB`,
    );
    console.log(
      `✓ Recording saved with key: ${savedRecordingKey}, isPcm: true, sampleRate: ${sampleRate} Hz`,
    );

    // Fire-and-forget auto transcription so recording stop UX is not blocked by API calls
    runAutoTranscriptionIfEnabled(savedRecordingKey);
  } catch (error) {
    console.error("❌ Error finalizing recording:", error);
    console.error("Stack trace:", error.stack);
  }
}
