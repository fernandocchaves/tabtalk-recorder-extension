const historyList = document.getElementById("historyList");
const emptyState = document.getElementById("emptyState");
let currentlyPlayingAudio = null;
let currentlyPlayingButton = null;
let chunkPlaybackState = null; // Track sequential chunk playback
let userSettingsCache = null;
const EMPTY_AUDIO_DATA_URL = "data:audio/webm;base64,";

async function loadUserSettingsCache() {
  try {
    if (typeof window !== "undefined" && window.configManager) {
      await window.configManager.load();
      userSettingsCache = window.configManager.getAll();
    }
  } catch (error) {
    console.warn(
      "Failed to load user settings for history view, using defaults:",
      error,
    );
    userSettingsCache = null;
  }
}

function hasPersistedMediaPayload(payload) {
  return !!payload && !(typeof payload === "string" && payload === EMPTY_AUDIO_DATA_URL);
}

async function payloadToArrayBuffer(payload) {
  if (!payload) {
    throw new Error("No payload available");
  }
  if (payload instanceof ArrayBuffer) {
    return payload;
  }
  if (ArrayBuffer.isView(payload)) {
    return payload.buffer.slice(
      payload.byteOffset,
      payload.byteOffset + payload.byteLength,
    );
  }
  if (payload instanceof Blob) {
    return payload.arrayBuffer();
  }
  if (typeof payload === "string") {
    return dataURLtoBlob(payload).arrayBuffer();
  }
  throw new Error("Unsupported payload type");
}

// Helper function to get chunk duration from constants
function getChunkDurationSeconds() {
  const configuredMs = Number(userSettingsCache?.transcriptionChunkIntervalMs);
  const chunkIntervalMs =
    Number.isFinite(configuredMs) && configuredMs > 0
      ? configuredMs
      : window.RECORDING_CONSTANTS?.TRANSCRIPTION_CHUNK_INTERVAL_MS || 300000;
  return chunkIntervalMs / 1000;
}

// Helper function to play chunks sequentially
async function playChunksSequentially(recordingKey, audioElement, playButton) {
  // Get chunks (use transcription chunks - 'recording-chunk' source)
  const allRecordings = await window.StorageUtils.getAllRecordings();
  const chunks = allRecordings
    .filter(
      (r) =>
        r.source === "recording-chunk" && r.parentRecordingId === recordingKey,
    )
    .sort((a, b) => a.chunkNumber - b.chunkNumber);

  if (chunks.length === 0) {
    throw new Error("No chunks found");
  }

  console.log(`Starting sequential playback of ${chunks.length} chunks...`);

  // Pre-load actual durations for all chunks for accurate seeking
  console.log("Pre-loading chunk durations...");
  const chunkDurations = [];
  const tempAudio = new Audio();
  const tempBlobUrls = [];
  const fallbackDuration = getChunkDurationSeconds();

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const blob = dataURLtoBlob(chunk.data);
    const blobUrl = URL.createObjectURL(blob);
    tempBlobUrls.push(blobUrl);

    const duration = await new Promise((resolve) => {
      tempAudio.src = blobUrl;
      tempAudio.onloadedmetadata = () => {
        if (!isNaN(tempAudio.duration) && tempAudio.duration > 0) {
          resolve(tempAudio.duration);
        } else {
          // Fallback to chunk interval if can't determine
          resolve(fallbackDuration);
        }
      };
      tempAudio.onerror = () => {
        console.warn(
          `Could not load duration for chunk ${i + 1}, using estimate`,
        );
        resolve(fallbackDuration);
      };
      // Timeout fallback
      setTimeout(() => resolve(fallbackDuration), 2000);
    });

    chunkDurations.push(duration);
    console.log(`Chunk ${i + 1}/${chunks.length}: ${duration.toFixed(2)}s`);
  }

  // Clean up temp blob URLs
  tempBlobUrls.forEach((url) => URL.revokeObjectURL(url));

  const totalDuration = chunkDurations.reduce((sum, d) => sum + d, 0);
  console.log(
    `Total duration: ${totalDuration.toFixed(2)}s (${formatDuration(totalDuration)})`,
  );

  // Initialize playback state
  chunkPlaybackState = {
    chunks: chunks,
    currentIndex: 0,
    audioElement: audioElement,
    playButton: playButton,
    blobUrls: [],
    chunkDurations: chunkDurations,
    totalDuration: totalDuration,
    elapsedTime: 0, // Time played before current chunk
  };

  // Play first chunk
  playNextChunk();
}

function playNextChunk() {
  if (!chunkPlaybackState) return;

  const {
    chunks,
    currentIndex,
    audioElement,
    playButton,
    blobUrls,
    chunkDurations,
    elapsedTime,
  } = chunkPlaybackState;

  if (currentIndex >= chunks.length) {
    // All chunks played
    console.log("All chunks finished playing");
    cleanupChunkPlayback();

    const playIcon = playButton.querySelector(".play-icon");
    const pauseIcon = playButton.querySelector(".pause-icon");
    playIcon.style.display = "inline";
    pauseIcon.style.display = "none";
    playButton.classList.remove("playing");
    currentlyPlayingAudio = null;
    currentlyPlayingButton = null;
    return;
  }

  const chunk = chunks[currentIndex];
  console.log(`Playing chunk ${currentIndex + 1}/${chunks.length}`);

  // Convert data URL to blob URL
  const blob = dataURLtoBlob(chunk.data);
  const blobUrl = URL.createObjectURL(blob);
  blobUrls.push(blobUrl);

  // Set up audio element for this chunk
  audioElement.src = blobUrl;
  audioElement.load();

  // Update chunk duration once we know actual duration
  audioElement.onloadedmetadata = () => {
    if (chunkPlaybackState && !isNaN(audioElement.duration)) {
      // Update the actual duration for this chunk
      const actualDuration = audioElement.duration;
      const oldDuration = chunkPlaybackState.chunkDurations[currentIndex];
      chunkPlaybackState.chunkDurations[currentIndex] = actualDuration;
      chunkPlaybackState.totalDuration =
        chunkPlaybackState.totalDuration - oldDuration + actualDuration;
      console.log(
        `Chunk ${currentIndex + 1} actual duration: ${actualDuration.toFixed(2)}s, total: ${chunkPlaybackState.totalDuration.toFixed(2)}s`,
      );
    }
  };

  // Remove previous ended handler and add new one
  audioElement.onended = () => {
    // Update elapsed time with actual chunk duration
    if (chunkPlaybackState) {
      chunkPlaybackState.elapsedTime +=
        chunkPlaybackState.chunkDurations[currentIndex];
      chunkPlaybackState.currentIndex++;
    }
    playNextChunk();
  };

  audioElement.play().catch((err) => {
    console.error("Error playing chunk:", err);
    cleanupChunkPlayback();
  });
}

function cleanupChunkPlayback() {
  if (chunkPlaybackState && chunkPlaybackState.blobUrls) {
    chunkPlaybackState.blobUrls.forEach((url) => URL.revokeObjectURL(url));
  }
  chunkPlaybackState = null;
}

function stopChunkPlayback() {
  if (chunkPlaybackState) {
    chunkPlaybackState.audioElement.pause();
    chunkPlaybackState.audioElement.onended = null;
    cleanupChunkPlayback();
  }
}

function pauseChunkPlayback() {
  if (chunkPlaybackState) {
    chunkPlaybackState.audioElement.pause();
    // Don't clean up state - keep it for resuming or seeking
  }
}

function resumeChunkPlaybackAudio() {
  if (chunkPlaybackState) {
    chunkPlaybackState.audioElement.play().catch((err) => {
      console.error("Error resuming chunk playback:", err);
    });
  }
}

// Seek to a specific time in chunked playback
async function seekChunkedPlayback(targetTime) {
  if (!chunkPlaybackState) return;

  const { chunks, audioElement, playButton, chunkDurations, totalDuration } =
    chunkPlaybackState;

  // Convert target time to percentage of total duration
  const targetPercentage = targetTime / totalDuration;

  // Find which chunk contains the target time
  let accumulatedTime = 0;
  let targetChunkIndex = 0;
  let timeWithinChunk = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunkDuration = chunkDurations[i];
    if (accumulatedTime + chunkDuration > targetTime) {
      targetChunkIndex = i;
      timeWithinChunk = targetTime - accumulatedTime;
      break;
    }
    accumulatedTime += chunkDuration;
    // If we've gone through all chunks, target the last one
    if (i === chunks.length - 1) {
      targetChunkIndex = i;
      timeWithinChunk = Math.max(0, targetTime - accumulatedTime);
    }
  }

  console.log(
    `Seeking to ${targetTime.toFixed(2)}s (${(targetPercentage * 100).toFixed(1)}%) -> chunk ${targetChunkIndex + 1}/${chunks.length}, offset ${timeWithinChunk.toFixed(2)}s`,
  );

  // Update state - set elapsed time to the accumulated time before this chunk
  chunkPlaybackState.currentIndex = targetChunkIndex;
  chunkPlaybackState.elapsedTime = accumulatedTime;

  // Load and play the target chunk
  const chunk = chunks[targetChunkIndex];
  const blob = dataURLtoBlob(chunk.data);
  const blobUrl = URL.createObjectURL(blob);
  chunkPlaybackState.blobUrls.push(blobUrl);

  audioElement.src = blobUrl;

  // Wait for metadata to load, then seek within chunk
  return new Promise((resolve) => {
    audioElement.onloadedmetadata = () => {
      if (chunkPlaybackState && !isNaN(audioElement.duration)) {
        const actualDuration = audioElement.duration;
        const oldDuration = chunkPlaybackState.chunkDurations[targetChunkIndex];
        chunkPlaybackState.chunkDurations[targetChunkIndex] = actualDuration;
        chunkPlaybackState.totalDuration =
          chunkPlaybackState.totalDuration - oldDuration + actualDuration;

        // Recalculate elapsed time with actual duration
        let newElapsedTime = 0;
        for (let i = 0; i < targetChunkIndex; i++) {
          newElapsedTime += chunkPlaybackState.chunkDurations[i];
        }
        chunkPlaybackState.elapsedTime = newElapsedTime;

        // Seek within the chunk (clamp to valid range)
        const seekTime = Math.max(
          0,
          Math.min(timeWithinChunk, actualDuration - 0.1),
        );
        audioElement.currentTime = seekTime;

        console.log(
          `Chunk ${targetChunkIndex + 1} actual duration: ${actualDuration.toFixed(2)}s, seeking to ${seekTime.toFixed(2)}s within chunk`,
        );
      }
      resolve();
    };

    audioElement.load();
  })
    .then(() => {
      // Set up ended handler for next chunk
      audioElement.onended = () => {
        if (chunkPlaybackState) {
          chunkPlaybackState.elapsedTime +=
            chunkPlaybackState.chunkDurations[chunkPlaybackState.currentIndex];
          chunkPlaybackState.currentIndex++;
        }
        playNextChunk();
      };

      return audioElement.play();
    })
    .catch((err) => {
      console.error("Error seeking chunk:", err);
    });
}

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return (
      "Today, " +
      date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  } else if (diffDays === 1) {
    return (
      "Yesterday, " +
      date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  } else if (diffDays < 7) {
    return (
      date.toLocaleDateString([], { weekday: "long" }) +
      ", " +
      date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  } else {
    return (
      date.toLocaleDateString([], {
        month: "short",
        day: "numeric",
        year: "numeric",
      }) +
      ", " +
      date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  }
}

// Download recording (handles both single and chunked recordings)
async function downloadRecording(recordingKey, recordingId) {
  const allRecordings = await window.StorageUtils.getAllRecordings();
  const recording = allRecordings.find((r) => r.key === recordingKey);

  if (!recording) {
    throw new Error("Recording not found");
  }

  // Load user's quality settings
  let userSampleRate = 48000; // Default
  try {
    // Use the global singleton instance
    if (typeof window.configManager !== "undefined") {
      // Ensure config is loaded
      if (!window.configManager.loaded) {
        await window.configManager.load();
      }
      userSampleRate = window.configManager.get("audioQuality") || 48000;
      console.log(`User's configured audio quality: ${userSampleRate} Hz`);
    } else {
      console.warn("ConfigManager not available, using default 48kHz");
    }
  } catch (error) {
    console.warn("Failed to load user config, using default 48kHz:", error);
  }

  // Generate filename based on timestamp
  const date = new Date(recording.timestamp);
  const dateStr = date.toISOString().slice(0, 19).replace(/[T:]/g, "-");

  // Prefer original captured tab video when available
  if (recording.hasVideo && hasPersistedMediaPayload(recording.data)) {
    const blob = dataURLtoBlob(recording.data);
    const filename = `tabtalk-${dateStr}.webm`;
    downloadBlob(blob, filename);
    console.log(
      `Downloaded video: ${filename} (${(blob.size / 1024 / 1024).toFixed(2)} MB)`,
    );
    return;
  }

  // For PCM recordings, always convert to WAV (has proper duration)
  // For non-PCM recordings with WebM data, download WebM directly
  if (hasPersistedMediaPayload(recording.data) && !recording.isPcm) {
    // Download the WebM directly (old format, non-PCM continuous recording)
    const blob = dataURLtoBlob(recording.data);
    const filename = `tabtalk-${dateStr}.webm`;
    downloadBlob(blob, filename);
    console.log(
      `Downloaded: ${filename} (${(blob.size / 1024 / 1024).toFixed(2)} MB)`,
    );
    return;
  }

  // Check for PCM chunks
  if (recording.isChunked || recording.chunksCount > 0) {
    const chunks =
      await window.StorageUtils.getRecordingChunksWithData(recordingKey);

    if (chunks.length === 0) {
      throw new Error("No audio chunks found for this recording");
    }

    console.log(`Found ${chunks.length} chunks for conversion...`);

    // PCM format - convert to WAV (supports both Int16 and Float32)
    const isPcmFormat =
      chunks[0].format === "pcm-float32" || chunks[0].format === "pcm-int16";

    if (isPcmFormat) {
      // Convert PCM chunks to WAV using user's quality setting
      console.log("Converting PCM chunks to WAV...");
      const recordedSampleRate = recording.sampleRate || 48000;
      const wavBlob = await convertPcmChunksToWav(
        chunks,
        recordedSampleRate,
        recording.numberOfChannels || 1,
        userSampleRate, // Pass user's desired sample rate
      );
      const filename = `tabtalk-${dateStr}.wav`;
      downloadBlob(wavBlob, filename);
      console.log(
        `Downloaded: ${filename} (${(wavBlob.size / 1024 / 1024).toFixed(2)} MB) at ${userSampleRate} Hz`,
      );
    } else {
      // Old WebM chunk format - merge them
      console.log("Merging WebM chunks...");
      const mergedBlob = await mergeAudioChunks(chunks);
      const filename = `tabtalk-${dateStr}.wav`;
      downloadBlob(mergedBlob, filename);
      console.log(
        `Downloaded merged: ${filename} (${(mergedBlob.size / 1024 / 1024).toFixed(2)} MB)`,
      );
    }
  } else {
    throw new Error("No audio data available for download");
  }
}

// Convert PCM Float32 chunks to WAV file (memory-efficient streaming)
async function convertPcmChunksToWav(
  chunks,
  sampleRate,
  numberOfChannels,
  targetSampleRate = null,
) {
  const finalSampleRate = targetSampleRate || sampleRate;
  const totalSamples = chunks.reduce(
    (sum, chunk) => sum + (chunk.samplesCount || 0),
    0,
  );

  // Calculate final sample count after downsampling if needed
  const ratio = sampleRate / finalSampleRate;
  const finalSampleCount = Math.floor(totalSamples / ratio);

  // Detect format from first chunk (support both old Float32 and new Int16)
  const isInt16Format = chunks[0]?.format === "pcm-int16";
  console.log(
    `Converting ${chunks.length} ${isInt16Format ? "Int16" : "Float32"} PCM chunks (${totalSamples} samples @ ${sampleRate}Hz -> ${finalSampleCount} samples @ ${finalSampleRate}Hz) to WAV...`,
  );

  // Prepare WAV header
  const bytesPerSample = 2; // 16-bit output
  const blockAlign = numberOfChannels * bytesPerSample;
  const byteRate = finalSampleRate * blockAlign;
  const dataSize = finalSampleCount * bytesPerSample;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  // Write WAV header once
  writeString(view, 0, "RIFF");
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, finalSampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // 16-bit
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // Process chunks and write audio data directly to WAV (memory-efficient)
  let writeOffset = 44;
  let totalProcessedSamples = 0;

  for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
    const bytes = new Uint8Array(
      await payloadToArrayBuffer(chunks[chunkIdx].data),
    );

    // Parse based on format
    let pcmSamples;
    if (isInt16Format || chunks[chunkIdx].format === "pcm-int16") {
      // Int16 format - already in the right format for WAV
      pcmSamples = new Int16Array(bytes.buffer);
    } else {
      // Float32 format (legacy) - convert to Int16
      const float32Data = new Float32Array(bytes.buffer);
      pcmSamples = new Int16Array(float32Data.length);
      for (let i = 0; i < float32Data.length; i++) {
        const sample = Math.max(-1, Math.min(1, float32Data[i]));
        pcmSamples[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      }
    }

    // Write samples to WAV with optional downsampling
    if (targetSampleRate && targetSampleRate !== sampleRate) {
      // Downsample: for each chunk, determine which output samples to write
      const chunkStartSample = totalProcessedSamples;
      const chunkEndSample = totalProcessedSamples + pcmSamples.length;

      const outputStartIndex = Math.floor(chunkStartSample / ratio);
      const outputEndIndex = Math.floor(chunkEndSample / ratio);

      for (
        let outputIdx = outputStartIndex;
        outputIdx < outputEndIndex && outputIdx < finalSampleCount;
        outputIdx++
      ) {
        // Calculate source position in the original sample rate
        const sourcePosition = outputIdx * ratio - chunkStartSample;

        if (sourcePosition >= 0 && sourcePosition < pcmSamples.length - 1) {
          // Linear interpolation for Int16
          const index0 = Math.floor(sourcePosition);
          const index1 = Math.min(index0 + 1, pcmSamples.length - 1);
          const fraction = sourcePosition - index0;
          const sample =
            pcmSamples[index0] * (1 - fraction) + pcmSamples[index1] * fraction;

          view.setInt16(writeOffset, Math.round(sample), true);
          writeOffset += 2;
        }
      }

      totalProcessedSamples += pcmSamples.length;
    } else {
      // Direct write without downsampling
      for (let i = 0; i < pcmSamples.length; i++) {
        view.setInt16(writeOffset, pcmSamples[i], true);
        writeOffset += 2;
      }
      totalProcessedSamples += pcmSamples.length;
    }

    // Allow garbage collection between chunks
    if (chunkIdx % 5 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  console.log(
    `Completed WAV conversion: ${totalProcessedSamples} samples processed, ${writeOffset} bytes written`,
  );
  return new Blob([arrayBuffer], { type: "audio/wav" });
}

// Downsample PCM data from one sample rate to another
function downsamplePcm(pcmData, fromSampleRate, toSampleRate) {
  if (fromSampleRate === toSampleRate) {
    return pcmData;
  }

  const ratio = fromSampleRate / toSampleRate;
  const outputLength = Math.floor(pcmData.length / ratio);
  const downsampled = new Float32Array(outputLength);

  // Linear interpolation for downsampling
  for (let i = 0; i < outputLength; i++) {
    const sourceIndex = i * ratio;
    const index0 = Math.floor(sourceIndex);
    const index1 = Math.min(index0 + 1, pcmData.length - 1);
    const fraction = sourceIndex - index0;
    downsampled[i] =
      pcmData[index0] * (1 - fraction) + pcmData[index1] * fraction;
  }

  return downsampled;
}

// Convert Float32Array PCM data to WAV Blob
function pcmFloat32ToWav(pcmData, sampleRate, numberOfChannels) {
  const format = 1; // PCM
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numberOfChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmData.length * bytesPerSample;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  // WAV header
  writeString(view, 0, "RIFF");
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // Write PCM data (convert Float32 to Int16)
  let writeOffset = 44;
  for (let i = 0; i < pcmData.length; i++) {
    const sample = Math.max(-1, Math.min(1, pcmData[i]));
    const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    view.setInt16(writeOffset, int16, true);
    writeOffset += 2;
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

// Merge multiple audio chunks into a single WAV file (memory-efficient)
async function mergeAudioChunks(chunks) {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();

  // Decode first chunk to get metadata (sampleRate, channels)
  console.log(`Decoding first chunk to determine format...`);
  const firstBlob = dataURLtoBlob(chunks[0].data);
  const firstArrayBuffer = await firstBlob.arrayBuffer();
  const firstBuffer = await audioContext.decodeAudioData(firstArrayBuffer);

  const sampleRate = firstBuffer.sampleRate;
  const numberOfChannels = firstBuffer.numberOfChannels;

  // Calculate total length by decoding all chunks
  let totalLength = firstBuffer.length;
  console.log(`Chunk 1: ${firstBuffer.length} samples`);

  for (let i = 1; i < chunks.length; i++) {
    const blob = dataURLtoBlob(chunks[i].data);
    const arrayBuffer = await blob.arrayBuffer();
    try {
      const buffer = await audioContext.decodeAudioData(arrayBuffer);
      totalLength += buffer.length;
      console.log(`Chunk ${i + 1}: ${buffer.length} samples`);
    } catch (error) {
      console.error(`Failed to decode chunk ${i + 1}:`, error);
      throw new Error(`Failed to decode chunk ${i + 1}: ${error.message}`);
    }
  }

  console.log(
    `Merging ${chunks.length} buffers: ${totalLength} total samples, ${sampleRate}Hz, ${numberOfChannels} channels`,
  );

  // Prepare WAV header
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numberOfChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = totalLength * bytesPerSample;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  // Write WAV header
  writeString(view, 0, "RIFF");
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // 16-bit
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // Stream each chunk and write directly to WAV (memory-efficient)
  let writeOffset = 44;

  for (let i = 0; i < chunks.length; i++) {
    console.log(`Processing chunk ${i + 1}/${chunks.length}...`);

    const blob = dataURLtoBlob(chunks[i].data);
    const chunkArrayBuffer = await blob.arrayBuffer();

    try {
      const buffer = await audioContext.decodeAudioData(chunkArrayBuffer);

      // Write this chunk's data directly to WAV
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let j = 0; j < channelData.length; j++) {
          const sample = Math.max(-1, Math.min(1, channelData[j]));
          const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
          view.setInt16(writeOffset, int16, true);
          writeOffset += 2;
        }
      }
    } catch (error) {
      console.error(`Failed to process chunk ${i + 1}:`, error);
      audioContext.close();
      throw error;
    }

    // Allow garbage collection between chunks
    if (i % 5 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  audioContext.close();
  console.log(`Completed merging: ${writeOffset} bytes written`);
  return new Blob([arrayBuffer], { type: "audio/wav" });
}

// Convert AudioBuffer to WAV Blob
function audioBufferToWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = buffer.length * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  // WAV header
  writeString(view, 0, "RIFF");
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // Write audio data
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = Math.max(
        -1,
        Math.min(1, buffer.getChannelData(channel)[i]),
      );
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// Helper function to download a blob
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function loadHistory(skipRecovery = false) {
  // Use metadata-only query for fast loading (doesn't load audio data)
  let { recordings: finalRecordings, chunkMetadata: chunks } =
    await window.StorageUtils.getAllRecordingsMetadata();

  console.log(
    `Loaded ${finalRecordings.length} recordings, ${chunks.length} chunks`,
  );

  // Check for active recording from chrome.storage
  const storageData = await chrome.storage.local.get([
    "activeRecordingId",
    "recordingStartTime",
  ]);
  let activeRecordingId = storageData.activeRecordingId;
  const activeRecordingStartTime = storageData.recordingStartTime;

  // Verify if offscreen document actually exists and is recording
  let isActuallyRecording = false;
  if (activeRecordingId) {
    try {
      const contexts = await chrome.runtime.getContexts({});
      const offscreenDocument = contexts.find(
        (c) => c.contextType === "OFFSCREEN_DOCUMENT",
      );

      if (
        offscreenDocument &&
        offscreenDocument.documentUrl.endsWith("#recording")
      ) {
        isActuallyRecording = true;
      } else {
        // Don't show as actively recording, but don't clear yet - let recovery handle it
        activeRecordingId = null;
      }
    } catch (error) {
      console.error("Error checking offscreen document:", error);
    }
  }

  // Run recovery check if not actively recording and not skipping
  if (!skipRecovery && !isActuallyRecording) {
    const recoveredAny = await recoverIncompleteRecordings(
      finalRecordings,
      chunks,
    );
    if (recoveredAny) {
      // Reload data after recovery (only once)
      console.log("Recovery performed, reloading data...");
      const freshData = await window.StorageUtils.getAllRecordingsMetadata();
      finalRecordings = freshData.recordings;
      chunks = freshData.chunkMetadata;
      // Clear stale active recording state after recovery
      chrome.storage.local.remove(["activeRecordingId", "recordingStartTime"]);
    }
  }

  // Group chunks by parent recording ID
  const chunksByParent = {};
  for (const chunk of chunks) {
    if (!chunksByParent[chunk.parentRecordingId]) {
      chunksByParent[chunk.parentRecordingId] = [];
    }
    chunksByParent[chunk.parentRecordingId].push(chunk);
  }

  // Find incomplete recordings (have chunks but no final recording)
  const incompleteRecordings = [];
  const finalRecordingIds = new Set(finalRecordings.map((r) => r.key));

  // Check if there's an active recording that doesn't have chunks yet
  if (activeRecordingId && !finalRecordingIds.has(activeRecordingId)) {
    const hasChunks = chunksByParent[activeRecordingId];
    if (!hasChunks) {
      // Active recording with no chunks yet - show it anyway
      const timestamp =
        activeRecordingStartTime ||
        parseInt(activeRecordingId.replace("recording-", ""));
      incompleteRecordings.push({
        key: activeRecordingId,
        timestamp: timestamp,
        source: "recording",
        chunks: [],
        isIncomplete: true,
        chunkCount: 0,
      });
    }
  }

  for (const [parentId, parentChunks] of Object.entries(chunksByParent)) {
    if (!finalRecordingIds.has(parentId)) {
      // This is an active/incomplete recording with chunks
      parentChunks.sort((a, b) => a.chunkNumber - b.chunkNumber);
      const timestamp = parseInt(parentId.replace("recording-", ""));
      incompleteRecordings.push({
        key: parentId,
        timestamp: timestamp,
        source: "recording",
        chunks: parentChunks,
        isIncomplete: true,
        chunkCount: parentChunks.length,
      });
    }
  }

  // Attach chunks to final recordings as well (for transcription)
  const finalRecordingsWithChunks = finalRecordings.map((recording) => {
    const recordingChunks = chunksByParent[recording.key];
    if (recordingChunks && recordingChunks.length > 0) {
      recordingChunks.sort((a, b) => a.chunkNumber - b.chunkNumber);
      return {
        ...recording,
        chunks: recordingChunks,
        chunkCount: recordingChunks.length,
      };
    }
    return recording;
  });

  // Combine and sort all recordings by timestamp (newest first)
  const allDisplayRecordings = [
    ...finalRecordingsWithChunks,
    ...incompleteRecordings,
  ].sort((a, b) => b.timestamp - a.timestamp);

  console.log(
    `Displaying ${allDisplayRecordings.length} recordings (${incompleteRecordings.length} incomplete)`,
  );

  historyList.innerHTML = "";

  if (allDisplayRecordings.length === 0) {
    emptyState.style.display = "block";
    return;
  } else {
    emptyState.style.display = "none";
  }

  // Display all recordings
  for (const recording of allDisplayRecordings) {
    const key = recording.key;
    const recordingCard = document.createElement("div");
    recordingCard.className = "recording-card";

    const fileName = formatDate(recording.timestamp);
    const recordingId = key.replace("recording-", "");

    // Check if transcription exists for this recording
    const hasTranscription = recording.transcription ? "has-transcription" : "";
    const transcribeTitle = recording.transcription
      ? "View Transcription"
      : "Transcribe";

    // Check if this is an uploaded file or incomplete recording
    const isUploaded = recording.source === "upload";
    const isIncomplete = recording.isIncomplete || false;

    const displayName =
      isUploaded && recording.filename ? recording.filename : fileName;
    const iconClass = recording.hasVideo
      ? "fa-video"
      : isUploaded
        ? "fa-file-audio"
        : "fa-microphone";

    // Modern PCM recordings with chunks - convert to WAV on-demand
    // Note: Some old recordings may not have isPcm flag set, so we also check if it has chunks but no data
    const hasChunks = recording.chunksCount > 0 || recording.chunkCount > 0;
    const hasNoData = !hasPersistedMediaPayload(recording.data);
    const isPcmWithChunks =
      ((recording.isPcm && hasChunks) || (hasChunks && hasNoData && !isUploaded)) &&
      !recording.hasVideo;

    const hasSavedVideoMedia =
      recording.hasVideo &&
      (recording._dataStripped ||
        hasPersistedMediaPayload(recording.data));

    let audioSrc = null;
    let estimatedDuration = recording.duration || null;
    let needsWavConversion = false;

    if (hasSavedVideoMedia) {
      // Video recording saved with WebM preview/download payload - lazy load on play
      audioSrc = "pending-load";
      estimatedDuration = recording.duration;
    } else if (isPcmWithChunks) {
      // PCM recording with chunks - will convert to WAV on play
      audioSrc = null; // No preview, will convert on play
      needsWavConversion = true;
      estimatedDuration = recording.duration;
    } else if (
      recording._dataStripped ||
      hasPersistedMediaPayload(recording.data)
    ) {
      // Uploaded file or old recording with data - lazy-load on play
      audioSrc = "pending-load";
      estimatedDuration = recording.duration;
    }

    const hasAudio =
      hasSavedVideoMedia || isPcmWithChunks || recording._dataStripped || isUploaded;
    const mediaTag = hasSavedVideoMedia ? "video" : "audio";
    const mediaType = hasSavedVideoMedia
      ? recording.mimeType || "video/webm"
      : "audio/webm";
    const mediaClass = hasSavedVideoMedia ? ' class="recording-video-preview"' : "";
    const mediaExtraAttrs = hasSavedVideoMedia ? " playsinline" : "";
    const playerClass = hasSavedVideoMedia ? "audio-player has-video" : "audio-player";

    recordingCard.innerHTML = `
      <div class="recording-card-main">
        <div class="recording-info">
          <div class="recording-icon ${isUploaded ? "uploaded-icon" : isIncomplete ? "incomplete-recording-icon" : ""}">
            <i class="fas ${iconClass}"></i>
            ${isIncomplete ? '<span class="recording-pulse"></span>' : ""}
          </div>
          <div class="recording-details">
            <div class="recording-name">${displayName}${isIncomplete ? " (Recording...)" : ""}</div>
            <div class="recording-meta">
              <span class="duration" id="duration-${recordingId}">
                <i class="far fa-clock"></i>
                <span class="duration-text">Loading...</span>
              </span>
              ${isUploaded ? '<span class="upload-badge"><i class="fas fa-upload"></i> Uploaded</span>' : ""}
              ${isIncomplete ? `<span class="recording-badge"><i class="fas fa-circle"></i> Recording...</span>` : ""}
              ${recording.transcription ? '<span class="transcription-badge"><i class="fas fa-check-circle"></i> Transcribed</span>' : ""}
            </div>
          </div>
        </div>
        ${
          hasAudio && !isIncomplete
            ? `
        <div class="${playerClass}">
          <${mediaTag} id="audio-${recordingId}" preload="metadata"${mediaClass}${mediaExtraAttrs}
                 data-lazy-load="${audioSrc === "pending-load" ? "true" : "false"}"
                 data-recording-key="${key}"
                 ${needsWavConversion ? 'data-needs-wav-conversion="true"' : ""}>
            ${audioSrc && audioSrc !== "pending-load" ? `<source src="${audioSrc}" type="${mediaType}">` : ""}
          </${mediaTag}>
          <div class="player-controls">
            <button class="play-btn" data-key="${key}" data-audio-id="audio-${recordingId}">
              <span class="play-icon">
                <i class="fas fa-play"></i>
              </span>
              <span class="pause-icon" style="display: none;">
                <i class="fas fa-pause"></i>
              </span>
            </button>
            <div class="progress-container">
              <div class="progress-bar seekable" data-audio-id="audio-${recordingId}" data-recording-key="${key}" style="cursor: pointer;">
                <div class="progress-fill" id="progress-${recordingId}"></div>
              </div>
              <div class="time-display">
                <span id="current-time-${recordingId}">0:00</span>
                <span id="total-time-${recordingId}">0:00</span>
              </div>
            </div>
          </div>
        </div>
        `
            : `
        <div class="audio-player" style="display: flex; align-items: center; justify-content: center; opacity: 0.5;">
          <i class="fas fa-hourglass-half" style="margin-right: 8px;"></i>
          <span>Recording in progress...</span>
        </div>
        `
        }
        <div class="actions">
          <button class="action-btn transcribe-btn ${hasTranscription}" data-key="${key}" data-recording-id="${recordingId}" title="${transcribeTitle}" ${isIncomplete ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ""}>
            <i class="fas fa-file-alt"></i>
          </button>
          <button class="action-btn download-btn" data-key="${key}" data-recording-id="${recordingId}" title="Download" ${isIncomplete ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ""}>
            <i class="fas fa-download"></i>
          </button>
          <button class="action-btn delete-btn" data-key="${key}" title="Delete">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
      <div class="transcription-section" id="transcription-${recordingId}" style="display: none;">
        <div class="transcription-header">
          <h3>
            <i class="fas fa-align-left"></i>
            Transcription
          </h3>
          <div class="transcription-status" id="transcription-status-${recordingId}">
            <span class="status-badge status-transcribing">
              <i class="fas fa-spinner fa-spin"></i>
              Transcribing...
            </span>
          </div>
        </div>
        <div class="transcription-content" id="transcription-content-${recordingId}">
          <div class="transcription-placeholder">
            <i class="fas fa-circle-notch fa-spin"></i>
            <p>Processing audio...</p>
          </div>
        </div>
      </div>
    `;

    historyList.appendChild(recordingCard);

    // Setup audio element (only if it exists - incomplete recordings without audio won't have one)
    const audioElement = document.getElementById(`audio-${recordingId}`);
    if (audioElement) {
      // For incomplete recordings, set duration to "Recording..." immediately
      if (isIncomplete) {
        const durationText = recordingCard.querySelector(
          `#duration-${recordingId} .duration-text`,
        );
        if (durationText) {
          durationText.textContent = "Recording...";
        }
        // Set estimated total time for progress bar
        if (estimatedDuration) {
          const totalTimeElement = document.getElementById(
            `total-time-${recordingId}`,
          );
          if (totalTimeElement) {
            totalTimeElement.textContent = formatDuration(estimatedDuration);
          }
        }
      } else if (recording.duration) {
        // Use saved duration metadata if available
        const durationText = recordingCard.querySelector(
          `#duration-${recordingId} .duration-text`,
        );
        if (durationText) {
          durationText.textContent = formatDuration(recording.duration);
        }
        // Also set the total time in the progress bar
        const totalTimeElement = document.getElementById(
          `total-time-${recordingId}`,
        );
        if (totalTimeElement) {
          totalTimeElement.textContent = formatDuration(recording.duration);
        }
      }

      audioElement.addEventListener("loadedmetadata", () => {
        const duration = audioElement.duration;
        // Don't override "Recording..." for incomplete recordings or already set durations
        if (
          !isIncomplete &&
          duration &&
          !isNaN(duration) &&
          duration !== Infinity
        ) {
          const durationText = recordingCard.querySelector(
            `#duration-${recordingId} .duration-text`,
          );
          // Only set if it's still "Loading..." (meaning recording.duration wasn't available)
          if (durationText && durationText.textContent === "Loading...") {
            durationText.textContent = formatDuration(duration);
          }
          const totalTimeElement = document.getElementById(
            `total-time-${recordingId}`,
          );
          // Only set total time if it wasn't already set from recording.duration metadata
          if (totalTimeElement && totalTimeElement.textContent === "") {
            totalTimeElement.textContent = formatDuration(duration);
          }
        }
      });

      audioElement.addEventListener("error", (e) => {
        console.error(`Error loading audio for ${recordingId}:`, e);
        const durationText = recordingCard.querySelector(
          `#duration-${recordingId} .duration-text`,
        );
        if (durationText) {
          durationText.textContent = "Error";
        }
      });

      // Force load the metadata
      audioElement.load();

      audioElement.addEventListener("timeupdate", () => {
        // Check if this is part of chunk playback
        let totalCurrentTime = audioElement.currentTime;
        let totalDuration =
          recording.duration || estimatedDuration || audioElement.duration;

        if (
          chunkPlaybackState &&
          chunkPlaybackState.audioElement === audioElement
        ) {
          // Use total time across all chunks
          totalCurrentTime =
            chunkPlaybackState.elapsedTime + audioElement.currentTime;
          totalDuration = chunkPlaybackState.totalDuration;
        }

        // Handle case where duration is Infinity (continuous WebM recording)
        if (!isFinite(totalDuration) || totalDuration === 0) {
          totalDuration = recording.duration || estimatedDuration || 0;
        }

        const progress =
          totalDuration > 0 ? (totalCurrentTime / totalDuration) * 100 : 0;
        const progressElement = document.getElementById(
          `progress-${recordingId}`,
        );
        const currentTimeElement = document.getElementById(
          `current-time-${recordingId}`,
        );
        if (progressElement && !isNaN(progress) && isFinite(progress)) {
          progressElement.style.width = Math.min(100, progress) + "%";
        }
        if (currentTimeElement) {
          currentTimeElement.textContent = formatDuration(totalCurrentTime);
        }
      });

      // Data attributes are already set in the HTML template, no need to set them here again

      audioElement.addEventListener("ended", () => {
        // Playback ended
        const playBtn = recordingCard.querySelector(".play-btn");
        if (playBtn) {
          playBtn.querySelector(".play-icon").style.display = "inline";
          playBtn.querySelector(".pause-icon").style.display = "none";
          playBtn.classList.remove("playing");
        }
      });
    } else {
      // No audio yet - show "Recording..." in duration
      const durationText = recordingCard.querySelector(
        `#duration-${recordingId} .duration-text`,
      );
      if (durationText) {
        durationText.textContent = "Recording...";
      }
    }
  }
}

// Helper function to check if recording has chunks
async function recordingHasChunks(recordingKey) {
  const allRecordings = await window.StorageUtils.getAllRecordings();
  const chunks = allRecordings.filter(
    (r) =>
      r.source === "recording-chunk" && r.parentRecordingId === recordingKey,
  );
  console.log(`Checking chunks for ${recordingKey}:`, {
    totalRecordings: allRecordings.length,
    chunkRecordings: allRecordings.filter((r) => r.source === "recording-chunk")
      .length,
    matchingChunks: chunks.length,
    chunkKeys: chunks.map((c) => c.key),
    allChunkParents: allRecordings
      .filter((r) => r.source === "recording-chunk")
      .map((c) => c.parentRecordingId),
  });
  return chunks.length > 0;
}

// Real transcription function
async function transcribeAudio(recordingId) {
  const transcriptionSection = document.getElementById(
    `transcription-${recordingId}`,
  );
  const transcriptionStatus = document.getElementById(
    `transcription-status-${recordingId}`,
  );
  const transcriptionContent = document.getElementById(
    `transcription-content-${recordingId}`,
  );

  // Show transcription section with loading state
  transcriptionSection.style.display = "block";

  try {
    // Get the recording data
    const key = `recording-${recordingId}`;
    const recording = await window.StorageUtils.getRecording(key);

    if (!recording) {
      throw new Error("Recording not found");
    }

    // Check if this recording has chunks (PCM recordings don't have data field, only chunks)
    const hasChunks = await recordingHasChunks(key);

    // For non-chunked recordings, we need the data field
    if (!hasPersistedMediaPayload(recording.data) && !hasChunks) {
      throw new Error("Recording data not found");
    }

    // Wait for transcription service to be available
    let attempts = 0;
    while (!window.transcriptionService && attempts < 50) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      attempts++;
    }

    if (!window.transcriptionService) {
      throw new Error("Transcription service not available");
    }

    console.log(`Recording ${key} has chunks:`, hasChunks);
    let transcriptionText;

    if (hasChunks) {
      console.log("Using chunked transcription for recording:", key);

      // Use chunked transcription for recordings with chunks
      const updateStatus = (message, chunkIndex, totalChunks) => {
        const progress =
          totalChunks > 0
            ? Math.round(((chunkIndex + 1) / totalChunks) * 100)
            : 0;
        const showSegmentInfo =
          chunkIndex >= 0 &&
          totalChunks > 0 &&
          !isNaN(chunkIndex) &&
          !isNaN(totalChunks);

        // Update status badge and progress bar
        transcriptionStatus.innerHTML = `
          <span class="status-badge status-transcribing">
            <i class="fas fa-spinner fa-spin"></i>
            ${message}
            <div class="transcription-progress-bar" style="margin-top: 8px;">
              <div class="transcription-progress-fill" style="width: ${progress}%"></div>
            </div>
            ${showSegmentInfo ? `<span class="progress-indicator">${progress}% (${chunkIndex + 1}/${totalChunks})</span>` : ""}
          </span>
        `;
      };

      updateStatus("Initializing chunked transcription...", -1, 1);

      try {
        // Use chunked transcription
        transcriptionText = await window.transcriptionService.transcribeChunked(
          key,
          updateStatus,
        );

        // Clear transcription state after successful completion
        await window.transcriptionService.clearTranscriptionState(key);
      } catch (err) {
        console.error("Transcription error:", err);
        throw err;
      }
    } else {
      console.log("Using regular transcription for recording:", key);
      // Use regular transcription for single-file recordings
      const updateStatus = (message) => {
        transcriptionStatus.innerHTML = `
          <span class="status-badge status-transcribing">
            <i class="fas fa-spinner fa-spin"></i>
            ${message}
          </span>
        `;
      };

      updateStatus("Initializing...");

      transcriptionText = await window.transcriptionService.transcribe(
        recording.data,
        updateStatus,
      );
    }

    // Save transcription to storage
    await window.StorageUtils.updateTranscription(key, transcriptionText);

    // Update status to completed with retry button
    transcriptionStatus.innerHTML = `
      <span class="status-badge status-completed">
        <i class="fas fa-check-circle"></i>
        Completed
      </span>
      <button class="transcription-retry-btn" data-recording-id="${recordingId}">
        <i class="fas fa-redo"></i>
        Retry
      </button>
    `;

    // Escape HTML and preserve line breaks for transcription display
    const escapedText = transcriptionText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;")
      .replace(/\n/g, "<br>");

    // Show transcription text
    transcriptionContent.innerHTML = `
      <div class="transcription-text-container">
        <div class="transcription-text">${escapedText}</div>
      </div>
      <div class="transcription-actions">
        <button class="transcription-copy-btn" data-recording-id="${recordingId}">
          <i class="fas fa-copy"></i>
          Copy
        </button>
        <button class="transcription-process-btn" data-recording-id="${recordingId}">
          <i class="fas fa-magic"></i>
          AI Process
        </button>
      </div>
      <div class="post-processing-section" id="post-processing-${recordingId}" style="display: none;">
        <div class="post-processing-header">
          <h4><i class="fas fa-robot"></i> AI Post-Processing</h4>
        </div>
        <div class="post-processing-content" id="post-processing-content-${recordingId}">
          <!-- Will be populated dynamically -->
        </div>
      </div>
    `;
  } catch (error) {
    console.error("Transcription error:", error);

    // Show error status
    transcriptionStatus.innerHTML = `
      <span class="status-badge" style="background: #ffebee; color: #c62828;">
        <i class="fas fa-exclamation-circle"></i>
        Error
      </span>
    `;

    // Check if this was a chunked transcription that can be resumed
    const key = `recording-${recordingId}`;
    const hasChunks = await recordingHasChunks(key);
    const hasIncomplete =
      hasChunks &&
      (await window.transcriptionService.hasIncompleteTranscription(key));

    const resumeButton = hasIncomplete
      ? `
      <button class="transcription-copy-btn transcription-resume-btn" data-recording-id="${recordingId}" style="margin-top: 12px; background: #ff9800;">
        <i class="fas fa-play"></i>
        Resume Transcription
      </button>
    `
      : "";

    transcriptionContent.innerHTML = `
      <div style="padding: 20px; text-align: center; color: #c62828;">
        <i class="fas fa-exclamation-triangle" style="font-size: 32px; margin-bottom: 12px;"></i>
        <p><strong>Transcription failed</strong></p>
        <p style="font-size: 13px; margin-top: 8px;">${error.message}</p>
        <button class="transcription-copy-btn transcription-retry-btn" data-recording-id="${recordingId}" style="margin-top: 12px; background: #f44336;">
          <i class="fas fa-redo"></i>
          Retry
        </button>
        ${resumeButton}
      </div>
    `;
  }
}

// Resume chunked transcription function
async function resumeChunkedTranscription(recordingId) {
  const transcriptionSection = document.getElementById(
    `transcription-${recordingId}`,
  );
  const transcriptionStatus = document.getElementById(
    `transcription-status-${recordingId}`,
  );
  const transcriptionContent = document.getElementById(
    `transcription-content-${recordingId}`,
  );

  transcriptionSection.style.display = "block";

  try {
    const key = `recording-${recordingId}`;

    // Wait for transcription service to be available
    let attempts = 0;
    while (!window.transcriptionService && attempts < 50) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      attempts++;
    }

    if (!window.transcriptionService) {
      throw new Error("Transcription service not available");
    }

    const updateStatus = (message, chunkIndex, totalChunks) => {
      const progress =
        totalChunks > 0
          ? Math.round(((chunkIndex + 1) / totalChunks) * 100)
          : 0;
      const showSegmentInfo =
        chunkIndex >= 0 &&
        totalChunks > 0 &&
        !isNaN(chunkIndex) &&
        !isNaN(totalChunks);
      transcriptionStatus.innerHTML = `
        <span class="status-badge status-transcribing">
          <i class="fas fa-spinner fa-spin"></i>
          ${message}
          <div class="transcription-progress-bar" style="margin-top: 8px;">
            <div class="transcription-progress-fill" style="width: ${progress}%"></div>
          </div>
          ${showSegmentInfo ? `<span class="progress-indicator">${progress}% (${chunkIndex + 1}/${totalChunks} segments)</span>` : ""}
        </span>
      `;
    };

    updateStatus("Resuming transcription...", -1, 1);

    // Resume chunked transcription
    const transcriptionText =
      await window.transcriptionService.resumeChunkedTranscription(
        key,
        updateStatus,
      );

    // Save transcription to storage
    await window.StorageUtils.updateTranscription(key, transcriptionText);

    // Clear transcription state after successful completion
    await window.transcriptionService.clearTranscriptionState(key);

    // Update status to completed with retry button
    transcriptionStatus.innerHTML = `
      <span class="status-badge status-completed">
        <i class="fas fa-check-circle"></i>
        Completed
      </span>
      <button class="transcription-retry-btn" data-recording-id="${recordingId}">
        <i class="fas fa-redo"></i>
        Retry
      </button>
    `;

    // Escape HTML and preserve line breaks for transcription display
    const escapedText = transcriptionText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;")
      .replace(/\n/g, "<br>");

    // Show transcription text
    transcriptionContent.innerHTML = `
      <div class="transcription-text-container">
        <div class="transcription-text">${escapedText}</div>
      </div>
      <div class="transcription-actions">
        <button class="transcription-copy-btn" data-recording-id="${recordingId}">
          <i class="fas fa-copy"></i>
          Copy
        </button>
        <button class="transcription-process-btn" data-recording-id="${recordingId}">
          <i class="fas fa-magic"></i>
          AI Process
        </button>
      </div>
      <div class="post-processing-section" id="post-processing-${recordingId}" style="display: none;">
        <div class="post-processing-header">
          <h4><i class="fas fa-robot"></i> AI Post-Processing</h4>
        </div>
        <div class="post-processing-content" id="post-processing-content-${recordingId}">
          <!-- Will be populated dynamically -->
        </div>
      </div>
    `;
  } catch (error) {
    console.error("Resume transcription error:", error);

    transcriptionStatus.innerHTML = `
      <span class="status-badge" style="background: #ffebee; color: #c62828;">
        <i class="fas fa-exclamation-circle"></i>
        Error
      </span>
    `;

    transcriptionContent.innerHTML = `
      <div style="padding: 20px; text-align: center; color: #c62828;">
        <i class="fas fa-exclamation-triangle" style="font-size: 32px; margin-bottom: 12px;"></i>
        <p><strong>Resume failed</strong></p>
        <p style="font-size: 13px; margin-top: 8px;">${error.message}</p>
        <button class="transcription-copy-btn transcription-resume-btn" data-recording-id="${recordingId}" style="margin-top: 12px; background: #ff9800;">
          <i class="fas fa-play"></i>
          Try Again
        </button>
      </div>
    `;
  }
}

historyList.addEventListener("click", async (e) => {
  const target = e.target.closest("button");
  if (!target) return;

  if (target.classList.contains("transcribe-btn")) {
    const recordingId = target.dataset.recordingId;
    const transcriptionSection = document.getElementById(
      `transcription-${recordingId}`,
    );

    // Toggle transcription section
    if (transcriptionSection.style.display === "block") {
      transcriptionSection.style.display = "none";
    } else {
      // Check if transcription exists in storage
      const key = `recording-${recordingId}`;
      const recording = await window.StorageUtils.getRecording(key);

      if (recording && recording.transcription) {
        // Load existing transcription from storage
        const transcriptionStatus = document.getElementById(
          `transcription-status-${recordingId}`,
        );
        const transcriptionContent = document.getElementById(
          `transcription-content-${recordingId}`,
        );

        transcriptionStatus.innerHTML = `
          <span class="status-badge status-completed">
            <i class="fas fa-check-circle"></i>
            Completed
          </span>
          <button class="transcription-retry-btn" data-recording-id="${recordingId}">
            <i class="fas fa-redo"></i>
            Retry
          </button>
        `;

        // Escape HTML and preserve line breaks for existing transcription display
        const escapedText = recording.transcription
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;")
          .replace(/\n/g, "<br>");

        transcriptionContent.innerHTML = `
          <div class="transcription-text-container">
            <div class="transcription-text">${escapedText}</div>
          </div>
          <div class="transcription-actions">
            <button class="transcription-copy-btn" data-recording-id="${recordingId}">
              <i class="fas fa-copy"></i>
              Copy
            </button>
            <button class="transcription-process-btn" data-recording-id="${recordingId}">
              <i class="fas fa-magic"></i>
              AI Process
            </button>
          </div>
          <div class="post-processing-section" id="post-processing-${recordingId}" style="display: none;">
            <div class="post-processing-header">
              <h4><i class="fas fa-robot"></i> AI Post-Processing</h4>
            </div>
            <div class="post-processing-content" id="post-processing-content-${recordingId}">
              <!-- Will be populated dynamically -->
            </div>
          </div>
        `;

        // Load any existing processed transcriptions
        if (recording.processedTranscriptions) {
          loadProcessedTranscriptions(
            recordingId,
            recording.processedTranscriptions,
          );
        }

        transcriptionSection.style.display = "block";
      } else {
        // No existing transcription, start new transcription
        await transcribeAudio(recordingId);
      }
    }
  } else if (target.classList.contains("transcription-retry-btn")) {
    const recordingId = target.dataset.recordingId;
    const key = `recording-${recordingId}`;

    // Clear existing transcription
    await window.StorageUtils.updateTranscription(key, null);

    // Clear any transcription state
    if (
      window.transcriptionService &&
      window.transcriptionService.clearTranscriptionState
    ) {
      await window.transcriptionService.clearTranscriptionState(key);
    }

    const transcribeBtn = document.querySelector(
      `.transcribe-btn[data-recording-id="${recordingId}"]`,
    );

    // Click twice to close and reopen (which triggers retry)
    transcribeBtn.click();
    transcribeBtn.click();
  } else if (target.classList.contains("transcription-resume-btn")) {
    const recordingId = target.dataset.recordingId;
    await resumeChunkedTranscription(recordingId);
  } else if (target.classList.contains("transcription-copy-btn")) {
    const recordingId = target.dataset.recordingId;
    const transcriptionText = document.querySelector(
      `#transcription-content-${recordingId} .transcription-text`,
    );

    if (transcriptionText) {
      navigator.clipboard.writeText(transcriptionText.textContent);

      // Show feedback
      const originalHTML = target.innerHTML;
      target.innerHTML = '<i class="fas fa-check"></i> Copied!';
      setTimeout(() => {
        target.innerHTML = originalHTML;
      }, 2000);
    }
  } else if (target.classList.contains("play-btn")) {
    const audioId = target.dataset.audioId;
    const audioElement = document.getElementById(audioId);
    const playIcon = target.querySelector(".play-icon");
    const pauseIcon = target.querySelector(".pause-icon");

    console.log("Play button clicked:", {
      lazyLoad: audioElement.dataset.lazyLoad,
      needsWavConversion: audioElement.dataset.needsWavConversion,
      recordingKey: audioElement.dataset.recordingKey,
    });

    // Stop currently playing audio if different
    if (currentlyPlayingAudio && currentlyPlayingAudio !== audioElement) {
      stopChunkPlayback(); // Stop any chunk playback
      currentlyPlayingAudio.pause();
      currentlyPlayingAudio.currentTime = 0;
      if (currentlyPlayingButton) {
        currentlyPlayingButton.querySelector(".play-icon").style.display =
          "inline";
        currentlyPlayingButton.querySelector(".pause-icon").style.display =
          "none";
        currentlyPlayingButton.classList.remove("playing");
      }
    }

    // Check if audio needs lazy-loading (uploaded files with data)
    if (audioElement.dataset.lazyLoad === "true") {
      const recordingKey = audioElement.dataset.recordingKey;

      playIcon.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

      (async () => {
        try {
          console.log("Lazy-loading audio data for uploaded file...");
          const recording =
            await window.StorageUtils.getRecording(recordingKey);

          if (!recording || !hasPersistedMediaPayload(recording.data)) {
            throw new Error("No audio data available");
          }

          const blob = dataURLtoBlob(recording.data);
          const blobUrl = URL.createObjectURL(blob);

          audioElement.src = blobUrl;
          audioElement.load();

          await new Promise((resolve, reject) => {
            audioElement.addEventListener("loadedmetadata", resolve, {
              once: true,
            });
            audioElement.addEventListener("error", reject, { once: true });
            setTimeout(() => reject(new Error("Timeout loading audio")), 10000);
          });

          console.log("Audio loaded, duration:", audioElement.duration);
          delete audioElement.dataset.lazyLoad;

          audioElement.play();
          playIcon.innerHTML = '<i class="fas fa-play"></i>';
          playIcon.style.display = "none";
          pauseIcon.style.display = "inline";
          target.classList.add("playing");
          currentlyPlayingAudio = audioElement;
          currentlyPlayingButton = target;
        } catch (err) {
          console.error("Error loading audio:", err);
          alert("Error loading audio for playback: " + err.message);
          playIcon.innerHTML = '<i class="fas fa-play"></i>';
        }
      })();

      return;
    }

    // Check if audio needs WAV conversion (PCM recording for seekable playback)
    if (
      audioElement.dataset.needsWavConversion === "true" &&
      !audioElement.src.startsWith("blob:")
    ) {
      const recordingKey = audioElement.dataset.recordingKey;

      playIcon.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

      // Convert PCM chunks to WAV for seekable playback
      (async () => {
        try {
          console.log("Converting PCM to WAV for seekable playback...");
          const recording =
            await window.StorageUtils.getRecording(recordingKey);
          const chunks =
            await window.StorageUtils.getRecordingChunksWithData(recordingKey);

          if (chunks.length === 0) {
            throw new Error("No PCM chunks found");
          }

          const wavBlob = await convertPcmChunksToWav(
            chunks,
            recording.sampleRate || 48000,
            recording.numberOfChannels || 1,
          );

          const wavUrl = URL.createObjectURL(wavBlob);
          audioElement.src = wavUrl;
          audioElement.load();

          // Wait for metadata to load so we get proper duration
          await new Promise((resolve, reject) => {
            audioElement.addEventListener("loadedmetadata", resolve, {
              once: true,
            });
            audioElement.addEventListener("error", reject, { once: true });
            setTimeout(() => reject(new Error("Timeout loading audio")), 10000);
          });

          console.log(
            "WAV conversion complete, duration:",
            audioElement.duration,
          );

          // Store the duration for seeking if audioElement.duration is valid
          if (isFinite(audioElement.duration) && audioElement.duration > 0) {
            audioElement.dataset.actualDuration = audioElement.duration;
          } else if (recording.duration) {
            // Fallback to stored duration
            audioElement.dataset.actualDuration = recording.duration;
          }

          // Mark conversion as complete
          delete audioElement.dataset.needsWavConversion;
          audioElement.play();
          playIcon.innerHTML = '<i class="fas fa-play"></i>';
          playIcon.style.display = "none";
          pauseIcon.style.display = "inline";
          target.classList.add("playing");
          currentlyPlayingAudio = audioElement;
          currentlyPlayingButton = target;
        } catch (err) {
          console.error("Error converting PCM to WAV:", err);
          alert("Error preparing audio for playback: " + err.message);
          playIcon.innerHTML = '<i class="fas fa-play"></i>';
        }
      })();

      return;
    }

    // Normal playback for audio with source
    if (audioElement.paused) {
      audioElement.play();
      playIcon.style.display = "none";
      pauseIcon.style.display = "inline";
      target.classList.add("playing");
      currentlyPlayingAudio = audioElement;
      currentlyPlayingButton = target;
    } else {
      audioElement.pause();
      stopChunkPlayback(); // Stop chunk playback if active
      playIcon.style.display = "inline";
      pauseIcon.style.display = "none";
      target.classList.remove("playing");
    }
  } else if (target.classList.contains("download-btn")) {
    const key = target.dataset.key;
    const recordingId = target.dataset.recordingId;

    // Show loading state
    const originalIcon = target.innerHTML;
    target.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    target.disabled = true;

    try {
      await downloadRecording(key, recordingId);
    } catch (error) {
      console.error("Download failed:", error);
      alert("Download failed: " + error.message);
    } finally {
      target.innerHTML = originalIcon;
      target.disabled = false;
    }
  } else if (
    target.classList.contains("delete-btn") &&
    !target.classList.contains("delete-processed-btn")
  ) {
    const confirmed = await showDeleteConfirmModal(
      "Are you sure you want to delete this recording? This action cannot be undone.",
    );
    if (confirmed) {
      const key = target.dataset.key;

      // Delete the main recording
      await window.StorageUtils.deleteRecording(key);

      // Also delete all associated chunks
      const allRecordings = await window.StorageUtils.getAllRecordings();
      const chunks = allRecordings.filter(
        (r) => r.source === "recording-chunk" && r.parentRecordingId === key,
      );

      for (const chunk of chunks) {
        await window.StorageUtils.deleteRecording(chunk.key);
      }

      // Clear any transcription state for this recording
      if (
        window.transcriptionService &&
        window.transcriptionService.clearTranscriptionState
      ) {
        await window.transcriptionService.clearTranscriptionState(key);
      }

      console.log(
        `Deleted recording ${key} and ${chunks.length} associated chunks`,
      );
      loadHistory();
    }
  }
});

// Click on video preview area to toggle fullscreen (excluding controls)
historyList.addEventListener("click", async (e) => {
  const playerContainer = e.target.closest(".audio-player.has-video");
  if (!playerContainer) return;
  if (e.target.closest(".player-controls")) return;

  const videoElement = playerContainer.querySelector(".recording-video-preview");
  if (!videoElement) return;

  try {
    if (document.fullscreenElement) {
      if (document.fullscreenElement === videoElement) {
        await document.exitFullscreen?.();
      }
      return;
    }

    if (videoElement.requestFullscreen) {
      await videoElement.requestFullscreen();
    } else if (videoElement.webkitRequestFullscreen) {
      videoElement.webkitRequestFullscreen();
    } else if (videoElement.webkitEnterFullscreen) {
      videoElement.webkitEnterFullscreen();
    } else {
      throw new Error("Fullscreen API not supported");
    }
  } catch (error) {
    console.error("Fullscreen failed:", error);
    alert("Fullscreen failed: " + error.message);
  }
});

// Click handler for progress bar seeking
historyList.addEventListener("click", async (e) => {
  const progressBar = e.target.closest(".progress-bar.seekable");
  if (!progressBar) return;

  const audioId = progressBar.dataset.audioId;
  const recordingKey = progressBar.dataset.recordingKey;
  const audioElement = document.getElementById(audioId);

  if (!audioElement) return;

  // Calculate click position as percentage
  const rect = progressBar.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const percentage = Math.max(0, Math.min(1, clickX / rect.width));

  // Determine total duration
  let totalDuration;
  let recording = null;
  if (chunkPlaybackState && chunkPlaybackState.audioElement === audioElement) {
    totalDuration = chunkPlaybackState.totalDuration;
  } else {
    // Check if audio needs WAV conversion first (PCM recording)
    const srcIsValid =
      audioElement.src &&
      (audioElement.src.startsWith("blob:") ||
        audioElement.src.startsWith("data:"));
    if (audioElement.dataset.needsWavConversion === "true" && !srcIsValid) {
      // Audio not ready for seeking yet - silently ignore click
      return;
    }

    // Try to get duration from stored data attribute first (set after WAV conversion)
    if (audioElement.dataset.actualDuration) {
      totalDuration = parseFloat(audioElement.dataset.actualDuration);
      console.log("Using cached duration from dataset:", totalDuration);
    } else {
      totalDuration = audioElement.duration;
      console.log(
        "Audio duration from element:",
        totalDuration,
        "src:",
        audioElement.src ? audioElement.src.substring(0, 50) : "none",
      );
    }

    // Handle Infinity duration (continuous WebM recording) or NaN
    if (
      !isFinite(totalDuration) ||
      isNaN(totalDuration) ||
      totalDuration === 0
    ) {
      // Try to get duration from recording metadata
      try {
        recording = await window.StorageUtils.getRecording(recordingKey);
        console.log("Fetched recording for seek:", recording);
        if (
          recording &&
          typeof recording.duration === "number" &&
          recording.duration > 0
        ) {
          totalDuration = recording.duration;
          console.log("Using stored duration:", totalDuration);
        }
      } catch (err) {
        console.warn("Could not get recording duration:", err);
      }
    }
  }

  if (
    !totalDuration ||
    isNaN(totalDuration) ||
    !isFinite(totalDuration) ||
    totalDuration === 0
  ) {
    console.warn("Cannot seek: duration unknown or infinite", {
      totalDuration,
      recordingKey,
    });
    return;
  }

  const targetTime = percentage * totalDuration;
  console.log(`Seeking to ${percentage * 100}% = ${targetTime.toFixed(2)}s`);

  // Update progress bar immediately for visual feedback
  const progressFill = progressBar.querySelector(".progress-fill");
  if (progressFill) {
    progressFill.style.width = `${percentage * 100}%`;
  }

  // Handle chunked playback
  if (chunkPlaybackState && chunkPlaybackState.audioElement === audioElement) {
    await seekChunkedPlayback(targetTime);

    // Update play button UI since seeking auto-plays
    if (chunkPlaybackState && chunkPlaybackState.playButton) {
      const playIcon =
        chunkPlaybackState.playButton.querySelector(".play-icon");
      const pauseIcon =
        chunkPlaybackState.playButton.querySelector(".pause-icon");
      if (playIcon && pauseIcon) {
        playIcon.style.display = "none";
        pauseIcon.style.display = "inline";
        chunkPlaybackState.playButton.classList.add("playing");
      }
      currentlyPlayingAudio = audioElement;
      currentlyPlayingButton = chunkPlaybackState.playButton;
    }
  } else {
    // Regular audio seek
    console.log(
      `Setting audio currentTime to ${targetTime}, current src: ${audioElement.src ? "exists" : "none"}, readyState: ${audioElement.readyState}`,
    );

    // Ensure audio is loaded before seeking
    if (audioElement.readyState < 1) {
      console.warn("Audio not ready for seeking, loading first...");
      audioElement.load();
      await new Promise((resolve) => {
        audioElement.addEventListener("loadedmetadata", resolve, {
          once: true,
        });
        // Timeout fallback
        setTimeout(resolve, 2000);
      });
    }

    try {
      audioElement.currentTime = targetTime;
      console.log(
        `Seek completed, new currentTime: ${audioElement.currentTime}`,
      );

      // Update current time display
      const recordingId = audioId.replace("audio-", "");
      const currentTimeElement = document.getElementById(
        `current-time-${recordingId}`,
      );
      if (currentTimeElement) {
        currentTimeElement.textContent = formatDuration(targetTime);
      }
    } catch (err) {
      console.error("Error seeking:", err);
    }
  }
});

// Helper function to convert data URL to Blob without fetch (avoids CSP issues)
function dataURLtoBlob(dataURL) {
  if (dataURL instanceof Blob) {
    return dataURL;
  }
  if (dataURL instanceof ArrayBuffer) {
    return new Blob([dataURL], { type: "application/octet-stream" });
  }
  if (ArrayBuffer.isView(dataURL)) {
    return new Blob(
      [
        dataURL.buffer.slice(
          dataURL.byteOffset,
          dataURL.byteOffset + dataURL.byteLength,
        ),
      ],
      { type: "application/octet-stream" },
    );
  }
  if (typeof dataURL !== "string") {
    throw new Error("Unsupported payload type");
  }
  const base64Marker = ";base64,";
  const markerIndex = dataURL.indexOf(base64Marker);
  if (markerIndex === -1) {
    throw new Error("Invalid data URL format");
  }
  const header = dataURL.slice(0, markerIndex + ";base64".length);
  let base64Data = dataURL
    .slice(markerIndex + base64Marker.length)
    .replace(/\s/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const mime = header.match(/:(.*?);base64/)?.[1] || header.match(/:(.*?);/)?.[1];
  if (!mime) {
    throw new Error("Invalid data URL MIME type");
  }
  // Normalize missing padding for some persisted data URLs
  const padding = base64Data.length % 4;
  if (padding) {
    base64Data += "=".repeat(4 - padding);
  }
  const bstr = atob(base64Data);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

// Recover incomplete recordings from orphaned chunks
// Returns true if any recovery was performed (requires data reload)
async function recoverIncompleteRecordings(recordings, chunks) {
  try {
    if (chunks.length === 0) {
      return false;
    }

    // Find all parent recording IDs
    const finalRecordingIds = new Set(recordings.map((r) => r.key));

    // Group chunks by parent recording ID
    const chunksByParent = {};
    for (const chunk of chunks) {
      if (!chunksByParent[chunk.parentRecordingId]) {
        chunksByParent[chunk.parentRecordingId] = [];
      }
      chunksByParent[chunk.parentRecordingId].push(chunk);
    }

    let recoveredAny = false;

    // Find incomplete recordings (have chunks but no final recording)
    for (const [parentId, parentChunks] of Object.entries(chunksByParent)) {
      if (!finalRecordingIds.has(parentId)) {
        console.log(
          `Recovering incomplete recording ${parentId} (${parentChunks.length} chunks)...`,
        );

        try {
          // Sort chunks by chunk number
          parentChunks.sort((a, b) => a.chunkNumber - b.chunkNumber);

          // Get the original timestamp from the parent ID
          const timestamp = parseInt(parentId.replace("recording-", ""));

          // Calculate total samples and duration from actual audio data
          const totalSamples = parentChunks.reduce(
            (sum, chunk) => sum + (chunk.samplesCount || 0),
            0,
          );
          const sampleRate = parentChunks[0]?.sampleRate || 48000;
          const numberOfChannels = parentChunks[0]?.numberOfChannels || 1;

          // Duration from actual samples (most accurate)
          const estimatedDuration = Math.floor(totalSamples / sampleRate);

          const totalSize = parentChunks.reduce((sum, chunk) => {
            // Use chunkSize from metadata, fallback to samplesCount * bytes per sample
            const bytesPerSample = chunk.format === "pcm-int16" ? 2 : 4;
            const size =
              chunk.chunkSize ||
              (chunk.samplesCount ? chunk.samplesCount * bytesPerSample : 0);
            return sum + size;
          }, 0);

          // Save the recovered recording metadata (PCM format, no WebM data needed)
          const dbModule = await import("./utils/indexeddb.js").then(
            (m) => m.default,
          );
          await dbModule.init();

          await dbModule.saveRecording(parentId, {
            key: parentId, // Use same key as parent ID so chunks can be found
            source: "recording",
            timestamp: timestamp,
            duration: estimatedDuration,
            fileSize: totalSize,
            chunksCount: parentChunks.length,
            isChunked: true,
            isPcm: true, // PCM recording
            sampleRate: sampleRate,
            numberOfChannels: numberOfChannels,
            totalSamples: totalSamples,
            recovered: true,
          });

          console.log(
            `✓ Recovered ${parentId} (${(totalSize / 1024 / 1024).toFixed(2)} MB)`,
          );
          recoveredAny = true;
        } catch (error) {
          console.error(`Failed to recover recording ${parentId}:`, error);
        }
      }
    }

    return recoveredAny;
  } catch (error) {
    console.error("Error recovering incomplete recordings:", error);
    return false;
  }
}

// Initialize transcription service
document.addEventListener("DOMContentLoaded", async () => {
  // Run migration on first load
  const migrationDone = localStorage.getItem("indexeddb_migration_done");
  if (!migrationDone) {
    console.log("Running first-time migration to IndexedDB...");
    try {
      const result = await window.StorageUtils.migrateFromChromeStorage();
      console.log("Migration result:", result);
      localStorage.setItem("indexeddb_migration_done", "true");
      showNotification(
        "success",
        `Migrated ${result.migrated} recording(s) to IndexedDB!`,
      );
    } catch (error) {
      console.error("Migration failed:", error);
    }
  }

  await loadUserSettingsCache();

  // Load history - recovery check is now integrated to avoid double DB queries
  await loadHistory();

  // Auto-refresh removed - it causes page flickering
  // Users can manually refresh the page to see chunk updates

  // Listen for recording-stopped message to reload history
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "recording-stopped") {
      console.log("Recording stopped - reloading history");
      loadHistory();
    } else if (message.type === "transcription-updated") {
      console.log("Transcription updated - reloading history");
      loadHistory();
    }
  });

  // Create transcription service instance using factory
  if (typeof TranscriptionServiceFactory !== "undefined") {
    try {
      const serviceType =
        await TranscriptionServiceFactory.getConfiguredService();
      window.transcriptionService =
        TranscriptionServiceFactory.create(serviceType);
      console.log("Transcription service initialized:", serviceType);
    } catch (error) {
      console.error("Failed to initialize transcription service:", error);
    }
  } else {
    console.error("TranscriptionServiceFactory not found");
  }

  // Settings button
  const settingsButton = document.getElementById("settingsButton");
  if (settingsButton) {
    settingsButton.addEventListener("click", () => {
      chrome.tabs.create({ url: chrome.runtime.getURL("settings.html") });
    });
  }

  // API Key Modal handlers
  setupApiKeyModal();

  // File upload handlers
  setupFileUpload();
});

// API Key Modal functions
function setupApiKeyModal() {
  const modal = document.getElementById("apiKeyModal");
  const input = document.getElementById("modalApiKeyInput");
  const toggleBtn = document.getElementById("modalToggleApiKey");
  const saveBtn = document.getElementById("modalSaveBtn");
  const cancelBtn = document.getElementById("modalCancelBtn");

  // Toggle password visibility
  toggleBtn.addEventListener("click", () => {
    const icon = toggleBtn.querySelector("i");
    if (input.type === "password") {
      input.type = "text";
      icon.classList.remove("fa-eye");
      icon.classList.add("fa-eye-slash");
    } else {
      input.type = "password";
      icon.classList.remove("fa-eye-slash");
      icon.classList.add("fa-eye");
    }
  });

  // Save button
  saveBtn.addEventListener("click", async () => {
    const apiKey = input.value.trim();

    if (!apiKey) {
      alert("Please enter an API key");
      return;
    }

    if (!apiKey.startsWith("AIza")) {
      alert('Invalid API key format. Should start with "AIza"');
      return;
    }

    try {
      // Save to storage
      await chrome.storage.local.set({ gemini_api_key: apiKey });

      // Resolve the promise that's waiting for the API key
      if (window.apiKeyModalResolve) {
        window.apiKeyModalResolve(apiKey);
        window.apiKeyModalResolve = null;
      }

      // Close modal
      closeApiKeyModal();
    } catch (error) {
      console.error("Failed to save API key:", error);
      alert("Failed to save API key");
    }
  });

  // Cancel button
  cancelBtn.addEventListener("click", () => {
    if (window.apiKeyModalResolve) {
      window.apiKeyModalResolve(null);
      window.apiKeyModalResolve = null;
    }
    closeApiKeyModal();
  });

  // Close on backdrop click
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      if (window.apiKeyModalResolve) {
        window.apiKeyModalResolve(null);
        window.apiKeyModalResolve = null;
      }
      closeApiKeyModal();
    }
  });

  // Handle Enter key
  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      saveBtn.click();
    }
  });
}

function showApiKeyModal() {
  return new Promise((resolve) => {
    const modal = document.getElementById("apiKeyModal");
    const input = document.getElementById("modalApiKeyInput");

    // Store the resolve function globally so button handlers can access it
    window.apiKeyModalResolve = resolve;

    // Clear previous input
    input.value = "";
    input.type = "password";

    // Show modal
    modal.style.display = "flex";

    // Focus input after animation
    setTimeout(() => input.focus(), 300);
  });
}

// Expose globally for gemini-service.js
window.showApiKeyModal = showApiKeyModal;

function closeApiKeyModal() {
  const modal = document.getElementById("apiKeyModal");
  modal.style.display = "none";
}

// File Upload Functionality
function setupFileUpload() {
  const uploadButton = document.getElementById("uploadButton");
  const emptyUploadButton = document.getElementById("emptyUploadButton");
  const fileInput = document.getElementById("fileInput");
  const dropZone = document.getElementById("dropZone");

  // Upload button click
  if (uploadButton) {
    uploadButton.addEventListener("click", () => {
      fileInput.click();
    });
  }

  // Empty state upload button
  if (emptyUploadButton) {
    emptyUploadButton.addEventListener("click", () => {
      fileInput.click();
    });
  }

  // File input change
  fileInput.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files);
    await handleFiles(files);
    fileInput.value = ""; // Reset input
  });

  // Drag and drop on entire page
  document.body.addEventListener("dragenter", (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Only show drop zone if dragging files
    if (e.dataTransfer.types.includes("Files")) {
      dropZone.style.display = "block";
    }
  });

  document.body.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  document.body.addEventListener("dragleave", (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Hide drop zone only if leaving the body
    if (e.target === document.body) {
      dropZone.style.display = "none";
      dropZone.classList.remove("drag-over");
    }
  });

  document.body.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.style.display = "none";
    dropZone.classList.remove("drag-over");
  });

  // Drop zone specific events
  if (dropZone) {
    dropZone.addEventListener("click", () => {
      fileInput.click();
    });

    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add("drag-over");
    });

    dropZone.addEventListener("dragleave", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove("drag-over");
    });

    dropZone.addEventListener("drop", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove("drag-over");

      const files = Array.from(e.dataTransfer.files);

      if (files.length > 0) {
        await handleFiles(files);
      } else {
        alert("Please drop audio files only");
      }

      dropZone.style.display = "none";
    });
  }
}

// Check if file is an audio file
function isAudioFile(file) {
  // Check MIME type
  if (file.type.startsWith("audio/")) {
    return true;
  }

  // WEBM files might be detected as video/webm, check extension too
  const extension = file.name.split(".").pop().toLowerCase();
  const audioExtensions = [
    "mp3",
    "wav",
    "ogg",
    "webm",
    "m4a",
    "aac",
    "flac",
    "opus",
  ];

  return audioExtensions.includes(extension);
}

// Handle uploaded files
async function handleFiles(files) {
  if (files.length === 0) return;

  // Filter for audio files
  const audioFiles = files.filter((file) => isAudioFile(file));

  if (audioFiles.length === 0) {
    alert(
      "No audio files found. Please select audio files (MP3, WAV, OGG, WEBM, M4A).",
    );
    return;
  }

  if (audioFiles.length !== files.length) {
    alert(`${files.length - audioFiles.length} non-audio file(s) skipped.`);
  }

  // Show loading indicator
  showNotification("info", `Uploading ${audioFiles.length} file(s)...`);

  let successCount = 0;
  let errorCount = 0;

  for (const file of audioFiles) {
    try {
      await uploadAudioFile(file);
      successCount++;
    } catch (error) {
      console.error("Failed to upload file:", file.name, error);
      errorCount++;
    }
  }

  // Reload history to show new files
  await loadHistory();

  // Show result
  if (errorCount === 0) {
    showNotification(
      "success",
      `Successfully uploaded ${successCount} file(s)!`,
    );
  } else {
    showNotification(
      "warning",
      `Uploaded ${successCount} file(s), ${errorCount} failed.`,
    );
  }
}

// Upload a single audio file
async function uploadAudioFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const audioDataUrl = e.target.result;

        // Convert data URL to blob URL to avoid CSP issues
        const blob = dataURLtoBlob(audioDataUrl);
        const blobUrl = URL.createObjectURL(blob);

        // Get audio duration
        const audio = new Audio(blobUrl);
        await new Promise((res) => {
          audio.addEventListener("loadedmetadata", res);
        });

        // Clean up blob URL after getting duration
        URL.revokeObjectURL(blobUrl);

        // Create recording object
        const recording = {
          data: audioDataUrl,
          duration: audio.duration,
          timestamp: Date.now(),
          filename: file.name,
          fileSize: file.size,
          mimeType: file.type,
          source: "upload", // Mark as uploaded
        };

        // Save to storage using IndexedDB
        await window.StorageUtils.saveRecording(audioDataUrl, {
          duration: audio.duration,
          timestamp: recording.timestamp,
          filename: file.name,
          fileSize: file.size,
          mimeType: file.type,
          source: "upload",
        });

        resolve();
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error("Failed to read file"));
    };

    reader.readAsDataURL(file);
  });
}

// Show notification
function showNotification(type, message) {
  const notification = document.createElement("div");
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 16px 24px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    z-index: 10000;
    animation: slideInRight 0.3s ease-out;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    max-width: 400px;
  `;

  const colors = {
    success: { bg: "#d4edda", color: "#155724", border: "#c3e6cb" },
    error: { bg: "#f8d7da", color: "#721c24", border: "#f5c6cb" },
    info: { bg: "#d1ecf1", color: "#0c5460", border: "#bee5eb" },
    warning: { bg: "#fff3cd", color: "#856404", border: "#ffeaa7" },
  };

  const style = colors[type] || colors.info;
  notification.style.background = style.bg;
  notification.style.color = style.color;
  notification.style.border = `1px solid ${style.border}`;

  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = "slideOutRight 0.3s ease-out";
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Add slide animations
const uploadStyles = document.createElement("style");
uploadStyles.textContent = `
  @keyframes slideInRight {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes slideOutRight {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(400px);
      opacity: 0;
    }
  }
`;
document.head.appendChild(uploadStyles);

// ========================================
// AI Post-Processing Logic
// ========================================

let promptsManager;

// Initialize prompts manager
async function initPromptsManager() {
  const module = await import("./utils/prompts.js");
  promptsManager = module.default;
}

// Initialize on page load
initPromptsManager();

// Handle "AI Process" button clicks and processed result actions
historyList.addEventListener("click", async (e) => {
  const target = e.target.closest("button");
  if (!target) return;

  if (target.classList.contains("transcription-process-btn")) {
    const recordingId = target.dataset.recordingId;
    await showPostProcessingUI(recordingId);
  }

  // Handle expand/collapse toggle buttons
  if (target.classList.contains("expand-toggle")) {
    const uniqueId = target.dataset.uniqueId;
    if (uniqueId) {
      toggleExpandContent(uniqueId);
    }
  }

  // Handle copy button
  if (target.classList.contains("copy-processed-btn")) {
    const recordingId = target.dataset.recordingId;
    const promptId = target.dataset.promptId;
    await copyProcessedText(e, recordingId, promptId, target);
  }

  // Handle download button
  if (target.classList.contains("download-processed-btn")) {
    const recordingId = target.dataset.recordingId;
    const promptId = target.dataset.promptId;
    const promptName = target.dataset.promptName;
    downloadProcessedText(e, recordingId, promptId, promptName, target);
  }

  // Handle delete button
  if (target.classList.contains("delete-processed-btn")) {
    e.stopPropagation(); // Prevent event bubbling to other handlers
    const recordingId = target.dataset.recordingId;
    const promptId = target.dataset.promptId;
    await deleteProcessedText(recordingId, promptId);
  }
});

// Toggle expand/collapse for long content
function toggleExpandContent(uniqueId) {
  const contentDiv = document.getElementById(`processed-content-${uniqueId}`);
  const toggleBtn = document.getElementById(`toggle-${uniqueId}`);

  if (contentDiv && toggleBtn) {
    if (contentDiv.classList.contains("collapsed")) {
      contentDiv.classList.remove("collapsed");
      toggleBtn.innerHTML = '<i class="fas fa-chevron-up"></i> Show Less';
    } else {
      contentDiv.classList.add("collapsed");
      toggleBtn.innerHTML = '<i class="fas fa-chevron-down"></i> Show More';
    }
  }
}

// Show post-processing UI
async function showPostProcessingUI(recordingId) {
  const postProcessingSection = document.getElementById(
    `post-processing-${recordingId}`,
  );
  const postProcessingContent = document.getElementById(
    `post-processing-content-${recordingId}`,
  );

  if (!postProcessingSection || !postProcessingContent) return;

  // Toggle display
  if (postProcessingSection.style.display === "block") {
    postProcessingSection.style.display = "none";
    return;
  }

  // Load prompts and show UI
  try {
    const allPrompts = await promptsManager.getAllPrompts();
    const promptsArray = Object.values(allPrompts);

    if (promptsArray.length === 0) {
      postProcessingContent.innerHTML = `
        <div style="padding: 20px; text-align: center; color: #999;">
          <i class="fas fa-exclamation-circle" style="font-size: 32px; margin-bottom: 12px;"></i>
          <p>No prompts available. Please add custom prompts in Settings.</p>
          <button class="process-run-btn open-settings-btn" style="margin-top: 12px;">
            <i class="fas fa-cog"></i>
            Open Settings
          </button>
        </div>
      `;

      // Add event listener for the settings button
      const openSettingsBtn =
        postProcessingContent.querySelector(".open-settings-btn");
      if (openSettingsBtn) {
        openSettingsBtn.addEventListener("click", () => {
          chrome.tabs.create({ url: chrome.runtime.getURL("settings.html") });
        });
      }
      postProcessingSection.style.display = "block";
      return;
    }

    // Build prompt selector HTML
    let promptOptionsHTML = '<option value="">-- Select a prompt --</option>';
    const promptsByCategory = {};

    promptsArray.forEach((prompt) => {
      const category = prompt.category || "General";
      if (!promptsByCategory[category]) {
        promptsByCategory[category] = [];
      }
      promptsByCategory[category].push(prompt);
    });

    // Add prompts grouped by category
    Object.keys(promptsByCategory)
      .sort()
      .forEach((category) => {
        promptOptionsHTML += `<optgroup label="${category}">`;
        promptsByCategory[category].forEach((prompt) => {
          promptOptionsHTML += `<option value="${prompt.id}" data-description="${prompt.description || ""}">${prompt.name}</option>`;
        });
        promptOptionsHTML += "</optgroup>";
      });

    postProcessingContent.innerHTML = `
      <div class="prompt-selector">
        <label>Select AI Prompt</label>
        <select id="prompt-select-${recordingId}">
          ${promptOptionsHTML}
        </select>
        <div class="prompt-description" id="prompt-description-${recordingId}" style="display: none;"></div>
      </div>
      <div class="processing-actions">
        <button class="process-cancel-btn" data-recording-id="${recordingId}">
          <i class="fas fa-times"></i>
          Cancel
        </button>
        <button class="process-run-btn" data-recording-id="${recordingId}" disabled>
          <i class="fas fa-play"></i>
          Run Processing
        </button>
      </div>
      <div id="processing-results-${recordingId}"></div>
    `;

    // Show section
    postProcessingSection.style.display = "block";

    // Setup event listeners
    const promptSelect = document.getElementById(
      `prompt-select-${recordingId}`,
    );
    const promptDescription = document.getElementById(
      `prompt-description-${recordingId}`,
    );
    const runBtn = postProcessingContent.querySelector(".process-run-btn");
    const cancelBtn = postProcessingContent.querySelector(
      ".process-cancel-btn",
    );

    promptSelect.addEventListener("change", () => {
      const selectedOption = promptSelect.options[promptSelect.selectedIndex];
      const description = selectedOption.getAttribute("data-description");

      if (selectedOption.value) {
        runBtn.disabled = false;
        if (description) {
          promptDescription.textContent = description;
          promptDescription.style.display = "block";
        } else {
          promptDescription.style.display = "none";
        }
      } else {
        runBtn.disabled = true;
        promptDescription.style.display = "none";
      }
    });

    runBtn.addEventListener("click", () => runPostProcessing(recordingId));
    cancelBtn.addEventListener("click", () => {
      postProcessingSection.style.display = "none";
    });

    // Load existing processed transcriptions
    const key = `recording-${recordingId}`;
    const recording = await window.StorageUtils.getRecording(key);
    if (recording && recording.processedTranscriptions) {
      loadProcessedTranscriptions(
        recordingId,
        recording.processedTranscriptions,
      );
    }
  } catch (error) {
    console.error("Failed to load prompts:", error);
    postProcessingContent.innerHTML = `
      <div style="padding: 20px; text-align: center; color: #c62828;">
        <i class="fas fa-exclamation-triangle" style="font-size: 32px; margin-bottom: 12px;"></i>
        <p>Failed to load prompts: ${error.message}</p>
      </div>
    `;
    postProcessingSection.style.display = "block";
  }
}

// Run post-processing with selected prompt
async function runPostProcessing(recordingId) {
  const promptSelect = document.getElementById(`prompt-select-${recordingId}`);
  const selectedPromptId = promptSelect.value;

  if (!selectedPromptId) {
    alert("Please select a prompt");
    return;
  }

  const resultsDiv = document.getElementById(
    `processing-results-${recordingId}`,
  );

  // Show progress
  resultsDiv.innerHTML = `
    <div class="processing-progress">
      <i class="fas fa-spinner fa-spin"></i>
      <p>Processing with AI...</p>
    </div>
  `;

  try {
    // Get the recording and transcription
    const key = `recording-${recordingId}`;
    const recording = await window.StorageUtils.getRecording(key);

    if (!recording || !recording.transcription) {
      throw new Error("No transcription available. Please transcribe first.");
    }

    // Get the prompt
    const prompt = await promptsManager.getPrompt(selectedPromptId);
    if (!prompt) {
      throw new Error("Prompt not found");
    }

    // Apply transcription to prompt
    const processedPrompt = await promptsManager.applyTranscription(
      selectedPromptId,
      recording.transcription,
    );

    // Process with Gemini
    const updateProgress = (message) => {
      resultsDiv.innerHTML = `
        <div class="processing-progress">
          <i class="fas fa-spinner fa-spin"></i>
          <p>${message}</p>
        </div>
      `;
    };

    const processedText =
      await window.transcriptionService.processTranscription(
        recording.transcription,
        processedPrompt,
        updateProgress,
      );

    // Save processed transcription
    await window.StorageUtils.updateProcessedTranscription(
      key,
      processedText,
      selectedPromptId,
    );

    // Load and display all processed transcriptions
    const updatedRecording = await window.StorageUtils.getRecording(key);
    loadProcessedTranscriptions(
      recordingId,
      updatedRecording.processedTranscriptions,
    );

    // Show success message briefly
    resultsDiv.innerHTML = `
      <div style="padding: 20px; text-align: center; color: #2e7d32;">
        <i class="fas fa-check-circle" style="font-size: 32px; margin-bottom: 12px;"></i>
        <p><strong>Processing completed successfully!</strong></p>
      </div>
    `;

    setTimeout(() => {
      resultsDiv.innerHTML = "";
      loadProcessedTranscriptions(
        recordingId,
        updatedRecording.processedTranscriptions,
      );
    }, 1500);
  } catch (error) {
    console.error("Post-processing error:", error);
    resultsDiv.innerHTML = `
      <div style="padding: 20px; text-align: center; color: #c62828;">
        <i class="fas fa-exclamation-triangle" style="font-size: 32px; margin-bottom: 12px;"></i>
        <p><strong>Processing failed</strong></p>
        <p style="font-size: 13px; margin-top: 8px;">${error.message}</p>
      </div>
    `;
  }
}

// Load and display processed transcriptions
async function loadProcessedTranscriptions(
  recordingId,
  processedTranscriptions,
) {
  const resultsDiv = document.getElementById(
    `processing-results-${recordingId}`,
  );
  if (!resultsDiv || !processedTranscriptions) return;

  const processedArray = Object.values(processedTranscriptions);
  if (processedArray.length === 0) return;

  let resultsHTML = "";

  for (const processed of processedArray) {
    const prompt = await promptsManager.getPrompt(processed.promptId);
    const promptName = prompt ? prompt.name : "Unknown Prompt";
    const promptNameEscaped = promptName.replace(/'/g, "\\'");
    const timestamp = new Date(processed.timestamp).toLocaleString();
    const uniqueId = `${recordingId}-${processed.promptId}`;

    // Check if content is long (more than 500 characters)
    const isLongContent = processed.text.length > 500;
    const collapsedClass = isLongContent ? "collapsed" : "";

    resultsHTML += `
      <div class="processed-result" id="processed-result-${uniqueId}">
        <div class="processed-result-header">
          <div>
            <div class="processed-result-title">
              <i class="fas fa-check-circle"></i>
              ${promptName}
            </div>
            <small style="color: #999; font-size: 11px;">${timestamp}</small>
          </div>
          <div class="processed-result-actions">
            <button class="copy-processed-btn" data-recording-id="${recordingId}" data-prompt-id="${processed.promptId}" title="Copy to clipboard">
              <i class="fas fa-copy"></i> Copy
            </button>
            <button class="download-processed-btn" data-recording-id="${recordingId}" data-prompt-id="${processed.promptId}" data-prompt-name="${promptNameEscaped}" title="Download as file">
              <i class="fas fa-download"></i> Download
            </button>
            <button class="delete-processed-btn delete-btn" data-recording-id="${recordingId}" data-prompt-id="${processed.promptId}" title="Delete this result">
              <i class="fas fa-trash"></i> Delete
            </button>
          </div>
        </div>
        <div class="processed-result-content ${collapsedClass}" id="processed-content-${uniqueId}">
          ${processed.text}
        </div>
        ${
          isLongContent
            ? `
          <button class="expand-toggle" data-unique-id="${uniqueId}" id="toggle-${uniqueId}">
            <i class="fas fa-chevron-down"></i> Show More
          </button>
        `
            : ""
        }
      </div>
    `;
  }

  resultsDiv.innerHTML = resultsHTML;
}

// Copy processed text to clipboard
async function copyProcessedText(event, recordingId, promptId, button) {
  const uniqueId = `${recordingId}-${promptId}`;
  const contentDiv = document.getElementById(`processed-content-${uniqueId}`);

  if (contentDiv) {
    try {
      await navigator.clipboard.writeText(contentDiv.textContent);

      // Show feedback
      if (button) {
        const originalHTML = button.innerHTML;
        button.innerHTML = '<i class="fas fa-check"></i> Copied!';
        button.style.background = "#4caf50";

        setTimeout(() => {
          button.innerHTML = originalHTML;
          button.style.background = "";
        }, 2000);
      }
    } catch (error) {
      console.error("Failed to copy:", error);
      alert("Failed to copy to clipboard");
    }
  }
}

// Download processed text as file
function downloadProcessedText(
  event,
  recordingId,
  promptId,
  promptName,
  button,
) {
  console.log("Download called:", { recordingId, promptId, promptName });

  const uniqueId = `${recordingId}-${promptId}`;
  const contentDiv = document.getElementById(`processed-content-${uniqueId}`);

  console.log("Content div found:", !!contentDiv);

  if (contentDiv) {
    try {
      const text = contentDiv.textContent;
      console.log("Text length:", text.length);

      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${promptName}-${Date.now()}.txt`;

      console.log("Download link created:", a.download);

      document.body.appendChild(a);
      a.click();

      console.log("Click triggered");

      // Small delay before cleanup
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);

      // Show feedback
      if (button) {
        const originalHTML = button.innerHTML;
        button.innerHTML = '<i class="fas fa-check"></i> Downloaded!';
        button.style.background = "#4caf50";

        setTimeout(() => {
          button.innerHTML = originalHTML;
          button.style.background = "";
        }, 2000);
      }
    } catch (error) {
      console.error("Failed to download:", error);
      alert("Failed to download file: " + error.message);
    }
  } else {
    console.error(
      "Content div not found with id:",
      `processed-content-${uniqueId}`,
    );
    alert("Could not find content to download");
  }
}

// Show delete confirmation modal
function showDeleteConfirmModal(
  message = "Are you sure you want to delete this processed result? This action cannot be undone.",
) {
  return new Promise((resolve) => {
    const modal = document.getElementById("deleteConfirmModal");
    const messageElement = document.getElementById("deleteModalMessage");
    const cancelBtn = document.getElementById("deleteConfirmCancel");
    const okBtn = document.getElementById("deleteConfirmOk");

    // Set the message
    messageElement.textContent = message;

    // Show modal
    modal.style.display = "flex";

    // Handle cancel
    const handleCancel = () => {
      modal.style.display = "none";
      cancelBtn.removeEventListener("click", handleCancel);
      okBtn.removeEventListener("click", handleOk);
      modal.removeEventListener("click", handleBackdropClick);
      resolve(false);
    };

    // Handle confirm
    const handleOk = () => {
      modal.style.display = "none";
      cancelBtn.removeEventListener("click", handleCancel);
      okBtn.removeEventListener("click", handleOk);
      modal.removeEventListener("click", handleBackdropClick);
      resolve(true);
    };

    // Handle backdrop click
    const handleBackdropClick = (e) => {
      if (e.target === modal) {
        handleCancel();
      }
    };

    // Attach event listeners
    cancelBtn.addEventListener("click", handleCancel);
    okBtn.addEventListener("click", handleOk);
    modal.addEventListener("click", handleBackdropClick);
  });
}

// Delete processed text
async function deleteProcessedText(recordingId, promptId) {
  const confirmed = await showDeleteConfirmModal();
  if (!confirmed) {
    return;
  }

  try {
    // Get the recording
    const key = `recording-${recordingId}`;
    const recording = await window.StorageUtils.getRecording(key);

    if (!recording || !recording.processedTranscriptions) {
      throw new Error("Recording or processed transcriptions not found");
    }

    // Delete the specific processed transcription
    delete recording.processedTranscriptions[promptId];

    // Save the updated recording using the IndexedDB manager directly
    // We need to import it first
    const dbModule = await import("./utils/indexeddb.js");
    await dbModule.default.saveRecording(key, recording);

    // Remove from UI with animation
    const uniqueId = `${recordingId}-${promptId}`;
    const resultDiv = document.getElementById(`processed-result-${uniqueId}`);
    if (resultDiv) {
      resultDiv.style.animation = "fadeOut 0.3s ease-out";
      setTimeout(() => {
        resultDiv.remove();

        // Check if there are no more results
        const resultsDiv = document.getElementById(
          `processing-results-${recordingId}`,
        );
        if (resultsDiv && resultsDiv.children.length === 0) {
          resultsDiv.innerHTML = "";
        }
      }, 300);
    }

    // Show success feedback
    const notification = document.createElement("div");
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4caf50;
      color: white;
      padding: 12px 20px;
      border-radius: 6px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      z-index: 10000;
      font-size: 14px;
      animation: slideInRight 0.3s ease-out;
    `;
    notification.textContent = "Processed result deleted";
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = "slideOutRight 0.3s ease-out";
      setTimeout(() => notification.remove(), 300);
    }, 2000);
  } catch (error) {
    console.error("Failed to delete processed text:", error);
    alert("Failed to delete: " + error.message);
  }
}

// Auto-refresh mechanism for incomplete recordings
let refreshInterval = null;

async function checkForIncompleteRecordings() {
  // Check if there's an active recording in storage
  const storageData = await chrome.storage.local.get(["activeRecordingId"]);
  if (storageData.activeRecordingId) {
    console.log(
      "Active recording exists in storage:",
      storageData.activeRecordingId,
    );
    return true; // Always refresh if there's an active recording
  }

  const allRecordings = await window.StorageUtils.getAllRecordings();
  const finalRecordings = allRecordings.filter(
    (r) => r.source !== "recording-chunk",
  );
  const chunks = allRecordings.filter((r) => r.source === "recording-chunk");

  // Group chunks by parent recording ID
  const chunksByParent = {};
  for (const chunk of chunks) {
    if (!chunksByParent[chunk.parentRecordingId]) {
      chunksByParent[chunk.parentRecordingId] = [];
    }
    chunksByParent[chunk.parentRecordingId].push(chunk);
  }

  // Check if there are incomplete recordings
  const finalRecordingIds = new Set(finalRecordings.map((r) => r.key));
  const incompleteExists = Object.keys(chunksByParent).some(
    (parentId) => !finalRecordingIds.has(parentId),
  );

  console.log(
    "Incomplete recordings exist:",
    incompleteExists,
    "Chunks groups:",
    Object.keys(chunksByParent).length,
  );
  return incompleteExists;
}

async function startAutoRefresh() {
  // Check if there are incomplete recordings
  const hasIncompleteRecordings = await checkForIncompleteRecordings();

  if (hasIncompleteRecordings && !refreshInterval) {
    console.log("Starting auto-refresh for incomplete recordings");
    refreshInterval = setInterval(async () => {
      console.log("Auto-refreshing history...");
      // Reload history
      await loadHistory();

      // Check if we still have incomplete recordings
      const stillHasIncomplete = await checkForIncompleteRecordings();

      // Stop auto-refresh if no more incomplete recordings
      if (!stillHasIncomplete) {
        console.log("No more incomplete recordings, stopping auto-refresh");
        clearInterval(refreshInterval);
        refreshInterval = null;
      }
    }, 3000); // Refresh every 3 seconds
  } else if (!hasIncompleteRecordings && refreshInterval) {
    // Stop refresh if no incomplete recordings
    console.log("Stopping auto-refresh");
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

// List all recordings with their details (safe - doesn't delete anything)
// Call from console: listAllRecordings()
window.listAllRecordings = async function () {
  const { recordings } = await window.StorageUtils.getAllRecordingsMetadata();

  console.log("=== All Recordings ===");
  for (const recording of recordings) {
    const hasChunks = recording.chunksCount > 0 || recording.chunkCount > 0;
    console.log(`
Key: ${recording.key}
  isPcm: ${recording.isPcm}
  source: ${recording.source}
  hasChunks: ${hasChunks} (count: ${recording.chunksCount || recording.chunkCount || 0})
  duration: ${recording.duration}s
  timestamp: ${new Date(recording.timestamp).toLocaleString()}
  _dataStripped: ${recording._dataStripped}
    `);
  }

  return recordings;
};
