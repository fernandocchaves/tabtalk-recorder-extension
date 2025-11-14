const historyList = document.getElementById("historyList");
const emptyState = document.getElementById("emptyState");
let currentlyPlayingAudio = null;
let currentlyPlayingButton = null;

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'Today, ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Yesterday, ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'long' }) + ', ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) + ', ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}

async function loadHistory() {
  const allRecordings = await window.StorageUtils.getAllRecordings();

  console.log('Total recordings:', allRecordings.length);

  // Check for active recording from chrome.storage
  const storageData = await chrome.storage.local.get(['activeRecordingId', 'recordingStartTime']);
  let activeRecordingId = storageData.activeRecordingId;
  const activeRecordingStartTime = storageData.recordingStartTime;

  console.log('Storage data:', storageData);
  console.log('Active recording from storage:', activeRecordingId);
  console.log('Recording start time from storage:', activeRecordingStartTime);

  // Verify if offscreen document actually exists and is recording
  // NOTE: We DON'T clear the activeRecordingId here yet - let recovery run first
  // Recovery will finalize incomplete chunks, then we can clear stale state
  let isActuallyRecording = false;
  if (activeRecordingId) {
    try {
      const contexts = await chrome.runtime.getContexts({});
      const offscreenDocument = contexts.find(
        (c) => c.contextType === "OFFSCREEN_DOCUMENT"
      );

      console.log('Offscreen document:', offscreenDocument);
      console.log('Document URL:', offscreenDocument?.documentUrl);

      if (offscreenDocument && offscreenDocument.documentUrl.endsWith("#recording")) {
        isActuallyRecording = true;
        console.log('Recording is ACTIVE - keeping activeRecordingId');
      } else {
        console.log('Active recording ID exists but no active offscreen recording - setting to null');
        // Don't show as actively recording, but don't clear yet - let recovery handle it
        activeRecordingId = null;
      }
    } catch (error) {
      console.error('Error checking offscreen document:', error);
    }
  }

  // Separate final recordings and chunks
  const finalRecordings = allRecordings.filter(r => r.source !== 'recording-chunk');
  const chunks = allRecordings.filter(r => r.source === 'recording-chunk');

  console.log('Final recordings:', finalRecordings.length);
  console.log('Final recording keys:', finalRecordings.map(r => r.key));
  console.log('Chunks:', chunks.length);
  if (chunks.length > 0) {
    console.log('Sample chunk:', chunks[0]);
    console.log('All chunk keys:', chunks.map(c => c.key));
    console.log('Chunk sources:', chunks.map(c => ({ key: c.key, source: c.source, parentId: c.parentRecordingId })));
  }

  // Group chunks by parent recording ID
  const chunksByParent = {};
  for (const chunk of chunks) {
    if (!chunksByParent[chunk.parentRecordingId]) {
      chunksByParent[chunk.parentRecordingId] = [];
    }
    chunksByParent[chunk.parentRecordingId].push(chunk);
  }

  console.log('Chunks by parent:', Object.keys(chunksByParent));

  // Find incomplete recordings (have chunks but no final recording)
  const incompleteRecordings = [];
  const finalRecordingIds = new Set(finalRecordings.map(r => r.key));

  console.log('Final recording IDs:', Array.from(finalRecordingIds));

  // Check if there's an active recording that doesn't have chunks yet
  if (activeRecordingId && !finalRecordingIds.has(activeRecordingId)) {
    const hasChunks = chunksByParent[activeRecordingId];
    console.log('Active recording check:', activeRecordingId, 'Has chunks?', !!hasChunks, 'Chunk count:', hasChunks?.length || 0);
    if (!hasChunks) {
      // Active recording with no chunks yet - show it anyway
      console.log('Adding active recording without chunks:', activeRecordingId);
      const timestamp = activeRecordingStartTime || parseInt(activeRecordingId.replace('recording-', ''));
      incompleteRecordings.push({
        key: activeRecordingId,
        timestamp: timestamp,
        source: 'recording',
        chunks: [],
        isIncomplete: true,
        chunkCount: 0
      });
    } else {
      console.log('Active recording has chunks, will be added in loop below');
    }
  }

  for (const [parentId, parentChunks] of Object.entries(chunksByParent)) {
    console.log('Checking parent ID:', parentId, 'Has final?', finalRecordingIds.has(parentId));
    if (!finalRecordingIds.has(parentId)) {
      // This is an active/incomplete recording with chunks
      parentChunks.sort((a, b) => a.chunkNumber - b.chunkNumber);
      const timestamp = parseInt(parentId.replace('recording-', ''));
      incompleteRecordings.push({
        key: parentId,
        timestamp: timestamp,
        source: 'recording',
        chunks: parentChunks,
        isIncomplete: true,
        chunkCount: parentChunks.length
      });
      console.log('Added incomplete recording:', parentId, 'with', parentChunks.length, 'chunks');
    }
  }

  console.log('Total incomplete recordings:', incompleteRecordings.length);

  // Combine and sort all recordings by timestamp (newest first)
  const allDisplayRecordings = [...finalRecordings, ...incompleteRecordings]
    .sort((a, b) => b.timestamp - a.timestamp);

  console.log('Final recordings to display:', finalRecordings.length);
  console.log('Incomplete recordings to display:', incompleteRecordings.length);
  console.log('Incomplete recordings detail:', incompleteRecordings.map(r => ({ key: r.key, chunkCount: r.chunkCount, isIncomplete: r.isIncomplete })));
  console.log('Total recordings to display:', allDisplayRecordings.length);

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
    const hasTranscription = recording.transcription ? 'has-transcription' : '';
    const transcribeTitle = recording.transcription ? 'View Transcription' : 'Transcribe';

    // Check if this is an uploaded file or incomplete recording
    const isUploaded = recording.source === 'upload';
    const isIncomplete = recording.isIncomplete || false;

    console.log(`Displaying recording ${key}: isIncomplete=${isIncomplete}, chunkCount=${recording.chunkCount || 0}, hasChunks=${!!recording.chunks}, duration=${recording.duration}, hasData=${!!recording.data}`);
    const displayName = isUploaded && recording.filename ? recording.filename : fileName;
    const iconClass = isUploaded ? 'fa-file-audio' : 'fa-microphone';

    // For incomplete recordings, create temporary merged audio for playback
    let audioSrc = null;
    const hasAudio = recording.data || (isIncomplete && recording.chunks && recording.chunks.length > 0);

    let estimatedDuration = null;
    if (isIncomplete && recording.chunks && recording.chunks.length > 0) {
      // Merge chunks for playback
      const blobs = recording.chunks.map(chunk => dataURLtoBlob(chunk.data));
      const mergedBlob = new Blob(blobs, { type: 'audio/webm' });
      audioSrc = URL.createObjectURL(mergedBlob);

      // Estimate duration from chunks (each chunk is ~60 seconds)
      const lastChunk = recording.chunks[recording.chunks.length - 1];
      if (lastChunk.chunkTimestamp && recording.timestamp) {
        estimatedDuration = Math.floor((lastChunk.chunkTimestamp - recording.timestamp) / 1000);
      } else {
        estimatedDuration = recording.chunks.length * 60; // 60 seconds per chunk
      }
    } else if (recording.data) {
      // Convert data URL to blob URL to avoid CSP issues
      const blob = dataURLtoBlob(recording.data);
      audioSrc = URL.createObjectURL(blob);
    }

    recordingCard.innerHTML = `
      <div class="recording-card-main">
        <div class="recording-info">
          <div class="recording-icon ${isUploaded ? 'uploaded-icon' : (isIncomplete ? 'incomplete-recording-icon' : '')}">
            <i class="fas ${iconClass}"></i>
            ${isIncomplete ? '<span class="recording-pulse"></span>' : ''}
          </div>
          <div class="recording-details">
            <div class="recording-name">${displayName}${isIncomplete ? ' (Recording...)' : ''}</div>
            <div class="recording-meta">
              <span class="duration" id="duration-${recordingId}">
                <i class="far fa-clock"></i>
                <span class="duration-text">Loading...</span>
              </span>
              ${isUploaded ? '<span class="upload-badge"><i class="fas fa-upload"></i> Uploaded</span>' : ''}
              ${isIncomplete ? `<span class="recording-badge"><i class="fas fa-circle"></i> ${recording.chunkCount} chunks</span>` : ''}
              ${recording.transcription ? '<span class="transcription-badge"><i class="fas fa-check-circle"></i> Transcribed</span>' : ''}
            </div>
          </div>
        </div>
        ${hasAudio ? `
        <div class="audio-player">
          <audio id="audio-${recordingId}" preload="metadata">
            <source src="${audioSrc}" type="audio/webm">
          </audio>
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
              <div class="progress-bar">
                <div class="progress-fill" id="progress-${recordingId}"></div>
              </div>
              <div class="time-display">
                <span id="current-time-${recordingId}">0:00</span>
                <span id="total-time-${recordingId}">0:00</span>
              </div>
            </div>
          </div>
        </div>
        ` : `
        <div class="audio-player" style="display: flex; align-items: center; justify-content: center; opacity: 0.5;">
          <i class="fas fa-hourglass-half" style="margin-right: 8px;"></i>
          <span>Recording in progress...</span>
        </div>
        `}
        <div class="actions">
          <button class="action-btn transcribe-btn ${hasTranscription}" data-key="${key}" data-recording-id="${recordingId}" title="${transcribeTitle}">
            <i class="fas fa-file-alt"></i>
          </button>
          <button class="action-btn download-btn" data-key="${key}" title="Download">
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
        const durationText = recordingCard.querySelector(`#duration-${recordingId} .duration-text`);
        if (durationText) {
          durationText.textContent = 'Recording...';
        }
        // Set estimated total time for progress bar
        if (estimatedDuration) {
          const totalTimeElement = document.getElementById(`total-time-${recordingId}`);
          if (totalTimeElement) {
            totalTimeElement.textContent = formatDuration(estimatedDuration);
          }
        }
      } else if (recording.duration) {
        // Use saved duration metadata if available
        const durationText = recordingCard.querySelector(`#duration-${recordingId} .duration-text`);
        if (durationText) {
          durationText.textContent = formatDuration(recording.duration);
        }
        // Also set the total time in the progress bar
        const totalTimeElement = document.getElementById(`total-time-${recordingId}`);
        if (totalTimeElement) {
          totalTimeElement.textContent = formatDuration(recording.duration);
        }
      }

      audioElement.addEventListener('loadedmetadata', () => {
        const duration = audioElement.duration;
        // Don't override "Recording..." for incomplete recordings or already set durations
        if (!isIncomplete && duration && !isNaN(duration) && duration !== Infinity) {
          const durationText = recordingCard.querySelector(`#duration-${recordingId} .duration-text`);
          // Only set if it's still "Loading..." (meaning recording.duration wasn't available)
          if (durationText && durationText.textContent === 'Loading...') {
            durationText.textContent = formatDuration(duration);
          }
          const totalTimeElement = document.getElementById(`total-time-${recordingId}`);
          // Only set total time if it wasn't already set from recording.duration metadata
          if (totalTimeElement && totalTimeElement.textContent === '') {
            totalTimeElement.textContent = formatDuration(duration);
          }
        }
      });

      audioElement.addEventListener('error', (e) => {
        console.error(`Error loading audio for ${recordingId}:`, e);
        const durationText = recordingCard.querySelector(`#duration-${recordingId} .duration-text`);
        if (durationText) {
          durationText.textContent = 'Error';
        }
      });

      // Force load the metadata
      audioElement.load();

      audioElement.addEventListener('timeupdate', () => {
        // Use the known duration (from metadata or estimated) instead of audioElement.duration
        const knownDuration = recording.duration || estimatedDuration || audioElement.duration;
        const progress = knownDuration ? (audioElement.currentTime / knownDuration) * 100 : 0;
        const progressElement = document.getElementById(`progress-${recordingId}`);
        const currentTimeElement = document.getElementById(`current-time-${recordingId}`);
        if (progressElement && !isNaN(progress)) {
          progressElement.style.width = progress + '%';
        }
        if (currentTimeElement) {
          currentTimeElement.textContent = formatDuration(audioElement.currentTime);
        }
      });

      audioElement.addEventListener('ended', () => {
        const playBtn = recordingCard.querySelector('.play-btn');
        if (playBtn) {
          playBtn.querySelector('.play-icon').style.display = 'inline';
          playBtn.querySelector('.pause-icon').style.display = 'none';
          playBtn.classList.remove('playing');
        }
      });
    } else {
      // No audio yet - show "Recording..." in duration
      const durationText = recordingCard.querySelector(`#duration-${recordingId} .duration-text`);
      if (durationText) {
        durationText.textContent = 'Recording...';
      }
    }
  }
}

// Helper function to check if recording has chunks
async function recordingHasChunks(recordingKey) {
  const allRecordings = await window.StorageUtils.getAllRecordings();
  const chunks = allRecordings.filter(
    r => r.source === 'recording-chunk' && r.parentRecordingId === recordingKey
  );
  return chunks.length > 0;
}

// Real transcription function
async function transcribeAudio(recordingId) {
  const transcriptionSection = document.getElementById(`transcription-${recordingId}`);
  const transcriptionStatus = document.getElementById(`transcription-status-${recordingId}`);
  const transcriptionContent = document.getElementById(`transcription-content-${recordingId}`);

  // Show transcription section with loading state
  transcriptionSection.style.display = 'block';

  try {
    // Get the recording data
    const key = `recording-${recordingId}`;
    const recording = await window.StorageUtils.getRecording(key);

    if (!recording || !recording.data) {
      throw new Error('Recording not found');
    }

    // Wait for transcription service to be available
    let attempts = 0;
    while (!window.transcriptionService && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    if (!window.transcriptionService) {
      throw new Error('Transcription service not available');
    }

    // Check if this recording has chunks (indicating it needs chunked transcription)
    const hasChunks = await recordingHasChunks(key);
    let transcriptionText;

    if (hasChunks) {
      // Use chunked transcription for recordings with chunks
      const updateStatus = (message, chunkIndex, totalChunks) => {
        const progress = totalChunks > 0 ? Math.round((chunkIndex / totalChunks) * 100) : 0;
        transcriptionStatus.innerHTML = `
          <span class="status-badge status-transcribing">
            <i class="fas fa-spinner fa-spin"></i>
            ${message}
            <span class="progress-indicator">${progress}%</span>
          </span>
        `;
      };

      updateStatus('Initializing chunked transcription...', 0, 1);

      // Use chunked transcription
      transcriptionText = await window.transcriptionService.transcribeChunked(
        key,
        updateStatus
      );

      // Clear transcription state after successful completion
      await window.transcriptionService.clearTranscriptionState(key);
    } else {
      // Use regular transcription for single-file recordings
      const updateStatus = (message) => {
        transcriptionStatus.innerHTML = `
          <span class="status-badge status-transcribing">
            <i class="fas fa-spinner fa-spin"></i>
            ${message}
          </span>
        `;
      };

      updateStatus('Initializing...');

      transcriptionText = await window.transcriptionService.transcribe(
        recording.data,
        updateStatus
      );
    }

    // Save transcription to storage
    await window.StorageUtils.updateTranscription(key, transcriptionText);

    // Update status to completed
    transcriptionStatus.innerHTML = `
      <span class="status-badge status-completed">
        <i class="fas fa-check-circle"></i>
        Completed
      </span>
    `;

    // Escape HTML and preserve line breaks for transcription display
    const escapedText = transcriptionText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/\n/g, '<br>');

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
    console.error('Transcription error:', error);

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
    const hasIncomplete = hasChunks && await window.transcriptionService.hasIncompleteTranscription(key);

    const resumeButton = hasIncomplete ? `
      <button class="transcription-copy-btn transcription-resume-btn" data-recording-id="${recordingId}" style="margin-top: 12px; background: #ff9800;">
        <i class="fas fa-play"></i>
        Resume Transcription
      </button>
    ` : '';

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
  const transcriptionSection = document.getElementById(`transcription-${recordingId}`);
  const transcriptionStatus = document.getElementById(`transcription-status-${recordingId}`);
  const transcriptionContent = document.getElementById(`transcription-content-${recordingId}`);

  transcriptionSection.style.display = 'block';

  try {
    const key = `recording-${recordingId}`;

    // Wait for transcription service to be available
    let attempts = 0;
    while (!window.transcriptionService && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    if (!window.transcriptionService) {
      throw new Error('Transcription service not available');
    }

    const updateStatus = (message, chunkIndex, totalChunks) => {
      const progress = totalChunks > 0 ? Math.round((chunkIndex / totalChunks) * 100) : 0;
      transcriptionStatus.innerHTML = `
        <span class="status-badge status-transcribing">
          <i class="fas fa-spinner fa-spin"></i>
          ${message}
          <span class="progress-indicator">${progress}%</span>
        </span>
      `;
    };

    updateStatus('Resuming transcription...', 0, 1);

    // Resume chunked transcription
    const transcriptionText = await window.transcriptionService.resumeChunkedTranscription(
      key,
      updateStatus
    );

    // Save transcription to storage
    await window.StorageUtils.updateTranscription(key, transcriptionText);

    // Clear transcription state after successful completion
    await window.transcriptionService.clearTranscriptionState(key);

    // Update status to completed
    transcriptionStatus.innerHTML = `
      <span class="status-badge status-completed">
        <i class="fas fa-check-circle"></i>
        Completed
      </span>
    `;

    // Escape HTML and preserve line breaks for transcription display
    const escapedText = transcriptionText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/\n/g, '<br>');

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
    console.error('Resume transcription error:', error);

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
  const target = e.target.closest('button');
  if (!target) return;

  if (target.classList.contains("transcribe-btn")) {
    const recordingId = target.dataset.recordingId;
    const transcriptionSection = document.getElementById(`transcription-${recordingId}`);

    // Toggle transcription section
    if (transcriptionSection.style.display === 'block') {
      transcriptionSection.style.display = 'none';
    } else {
      // Check if transcription exists in storage
      const key = `recording-${recordingId}`;
      const recording = await window.StorageUtils.getRecording(key);

      if (recording && recording.transcription) {
        // Load existing transcription from storage
        const transcriptionStatus = document.getElementById(`transcription-status-${recordingId}`);
        const transcriptionContent = document.getElementById(`transcription-content-${recordingId}`);

        transcriptionStatus.innerHTML = `
          <span class="status-badge status-completed">
            <i class="fas fa-check-circle"></i>
            Completed
          </span>
        `;

        // Escape HTML and preserve line breaks for existing transcription display
        const escapedText = recording.transcription
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;')
          .replace(/\n/g, '<br>');

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
          loadProcessedTranscriptions(recordingId, recording.processedTranscriptions);
        }

        transcriptionSection.style.display = 'block';
      } else {
        // No existing transcription, start new transcription
        await transcribeAudio(recordingId);
      }
    }
  } else if (target.classList.contains("transcription-retry-btn")) {
    const recordingId = target.dataset.recordingId;
    const transcribeBtn = document.querySelector(`.transcribe-btn[data-recording-id="${recordingId}"]`);

    // Click twice to close and reopen (which triggers retry)
    transcribeBtn.click();
    transcribeBtn.click();
  } else if (target.classList.contains("transcription-resume-btn")) {
    const recordingId = target.dataset.recordingId;
    await resumeChunkedTranscription(recordingId);
  } else if (target.classList.contains("transcription-copy-btn")) {
    const recordingId = target.dataset.recordingId;
    const transcriptionText = document.querySelector(`#transcription-content-${recordingId} .transcription-text`);

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
    const playIcon = target.querySelector('.play-icon');
    const pauseIcon = target.querySelector('.pause-icon');

    // Stop currently playing audio if different
    if (currentlyPlayingAudio && currentlyPlayingAudio !== audioElement) {
      currentlyPlayingAudio.pause();
      currentlyPlayingAudio.currentTime = 0;
      if (currentlyPlayingButton) {
        currentlyPlayingButton.querySelector('.play-icon').style.display = 'inline';
        currentlyPlayingButton.querySelector('.pause-icon').style.display = 'none';
        currentlyPlayingButton.classList.remove('playing');
      }
    }

    if (audioElement.paused) {
      audioElement.play();
      playIcon.style.display = 'none';
      pauseIcon.style.display = 'inline';
      target.classList.add('playing');
      currentlyPlayingAudio = audioElement;
      currentlyPlayingButton = target;
    } else {
      audioElement.pause();
      playIcon.style.display = 'inline';
      pauseIcon.style.display = 'none';
      target.classList.remove('playing');
    }
  } else if (target.classList.contains("download-btn")) {
    const key = target.dataset.key;
    const recording = await window.StorageUtils.getRecording(key);

    const downloadLink = document.createElement("a");
    downloadLink.href = recording.data;
    downloadLink.download = `recording-${new Date(recording.timestamp).toISOString()}.webm`;
    downloadLink.click();
  } else if (target.classList.contains("delete-btn") && !target.classList.contains("delete-processed-btn")) {
    const confirmed = await showDeleteConfirmModal('Are you sure you want to delete this recording? This action cannot be undone.');
    if (confirmed) {
      const key = target.dataset.key;
      await window.StorageUtils.deleteRecording(key);
      loadHistory();
    }
  }
});

// Helper function to convert data URL to Blob without fetch (avoids CSP issues)
function dataURLtoBlob(dataURL) {
  const arr = dataURL.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

// Recover incomplete recordings from orphaned chunks
async function recoverIncompleteRecordings() {
  try {
    console.log('Running recovery check for incomplete recordings...');
    const allRecordings = await window.StorageUtils.getAllRecordings();

    // Find all chunks
    const chunks = allRecordings.filter(r => r.source === 'recording-chunk');

    console.log(`Found ${chunks.length} chunks in storage`);

    if (chunks.length === 0) {
      console.log('No chunks to recover');
      return;
    }

    // Find all parent recording IDs
    const finalRecordingIds = new Set(
      allRecordings
        .filter(r => r.source === 'recording')
        .map(r => r.key)
    );

    // Group chunks by parent recording ID
    const chunksByParent = {};
    for (const chunk of chunks) {
      if (!chunksByParent[chunk.parentRecordingId]) {
        chunksByParent[chunk.parentRecordingId] = [];
      }
      chunksByParent[chunk.parentRecordingId].push(chunk);
    }

    console.log('Chunk groups by parent:', Object.keys(chunksByParent));
    console.log('Final recording IDs:', Array.from(finalRecordingIds));

    // Find incomplete recordings (have chunks but no final recording)
    for (const [parentId, parentChunks] of Object.entries(chunksByParent)) {
      if (!finalRecordingIds.has(parentId)) {
        console.log(`Found incomplete recording ${parentId} with ${parentChunks.length} chunks, attempting recovery...`);

        try {
          // Sort chunks by chunk number
          parentChunks.sort((a, b) => a.chunkNumber - b.chunkNumber);

          // Convert data URLs back to blobs and merge (without fetch to avoid CSP issues)
          const blobs = parentChunks.map(chunk => dataURLtoBlob(chunk.data));
          const mergedBlob = new Blob(blobs, { type: "audio/webm" });

          console.log(`Recovered ${parentChunks.length} chunks into ${(mergedBlob.size / 1024 / 1024).toFixed(2)} MB`);

          // Convert merged blob to data URL
          const reader = new FileReader();
          await new Promise((resolve, reject) => {
            reader.onload = async () => {
              try {
                // Get the original timestamp from the parent ID
                const timestamp = parseInt(parentId.replace('recording-', ''));

                // Calculate duration from chunks
                // Each chunk is approximately 60 seconds, use the last chunk's timestamp
                const lastChunk = parentChunks[parentChunks.length - 1];
                const estimatedDuration = lastChunk.chunkTimestamp
                  ? Math.floor((lastChunk.chunkTimestamp - timestamp) / 1000)
                  : parentChunks.length * 60; // Fallback: estimate 60 seconds per chunk

                // Save the recovered recording
                const finalKey = await window.StorageUtils.saveRecording(reader.result, {
                  source: 'recording',
                  timestamp: timestamp,
                  duration: estimatedDuration,
                  fileSize: mergedBlob.size,
                  mimeType: 'audio/webm',
                  chunksCount: parentChunks.length,
                  recovered: true
                });

                console.log('Recovered recording saved with key:', finalKey);

                // Delete all chunks to free up space
                for (const chunk of parentChunks) {
                  await window.StorageUtils.deleteRecording(chunk.key);
                }

                console.log('Recovery chunks cleaned up successfully');
                resolve();
              } catch (error) {
                console.error('Error saving recovered recording:', error);
                reject(error);
              }
            };
            reader.onerror = reject;
            reader.readAsDataURL(mergedBlob);
          });

        } catch (error) {
          console.error(`Failed to recover recording ${parentId}:`, error);
        }
      }
    }

    // Clean up any truly orphaned chunks (old chunks with no parent and no siblings)
    const orphanedChunks = chunks.filter(chunk => {
      const siblings = chunksByParent[chunk.parentRecordingId] || [];
      return siblings.length === 0 || !finalRecordingIds.has(chunk.parentRecordingId);
    });

    if (orphanedChunks.length > 0 && Object.keys(chunksByParent).length === 0) {
      console.log(`Found ${orphanedChunks.length} truly orphaned chunks, cleaning up...`);

      for (const chunk of orphanedChunks) {
        await window.StorageUtils.deleteRecording(chunk.key);
      }

      console.log('Orphaned chunks cleaned up successfully');
    }
  } catch (error) {
    console.error('Error recovering incomplete recordings:', error);
  }
}

// Initialize transcription service
document.addEventListener("DOMContentLoaded", async () => {
  // Run migration on first load
  const migrationDone = localStorage.getItem('indexeddb_migration_done');
  if (!migrationDone) {
    console.log('Running first-time migration to IndexedDB...');
    try {
      const result = await window.StorageUtils.migrateFromChromeStorage();
      console.log('Migration result:', result);
      localStorage.setItem('indexeddb_migration_done', 'true');
      showNotification('success', `Migrated ${result.migrated} recording(s) to IndexedDB!`);
    } catch (error) {
      console.error('Migration failed:', error);
    }
  }

  // Check if there's an active recording before running recovery
  // Don't recover chunks that are still being recorded!
  const storageCheck = await chrome.storage.local.get(['activeRecordingId']);
  let hasActiveRecording = false;

  if (storageCheck.activeRecordingId) {
    // Check if offscreen document actually exists and is recording
    try {
      const contexts = await chrome.runtime.getContexts({});
      const offscreenDocument = contexts.find(
        (c) => c.contextType === "OFFSCREEN_DOCUMENT"
      );

      if (offscreenDocument && offscreenDocument.documentUrl.endsWith("#recording")) {
        hasActiveRecording = true;
        console.log('Skipping recovery - recording is ACTUALLY active:', storageCheck.activeRecordingId);
      } else {
        console.log('activeRecordingId exists but no offscreen recording - will run recovery');
        // Clear stale state
        chrome.storage.local.remove(['activeRecordingId', 'recordingStartTime']);
      }
    } catch (error) {
      console.error('Error checking offscreen document:', error);
    }
  }

  if (!hasActiveRecording) {
    // Recover incomplete recordings on load if NO active recording
    await recoverIncompleteRecordings();
  }

  await loadHistory();

  // Auto-refresh removed - it causes page flickering
  // Users can manually refresh the page to see chunk updates

  // Create transcription service instance using factory
  if (typeof TranscriptionServiceFactory !== 'undefined') {
    try {
      const serviceType = await TranscriptionServiceFactory.getConfiguredService();
      window.transcriptionService = TranscriptionServiceFactory.create(serviceType);
      console.log('Transcription service initialized:', serviceType);
    } catch (error) {
      console.error('Failed to initialize transcription service:', error);
    }
  } else {
    console.error('TranscriptionServiceFactory not found');
  }

  // Settings button
  const settingsButton = document.getElementById('settingsButton');
  if (settingsButton) {
    settingsButton.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
    });
  }

  // API Key Modal handlers
  setupApiKeyModal();

  // File upload handlers
  setupFileUpload();
});

// API Key Modal functions
function setupApiKeyModal() {
  const modal = document.getElementById('apiKeyModal');
  const input = document.getElementById('modalApiKeyInput');
  const toggleBtn = document.getElementById('modalToggleApiKey');
  const saveBtn = document.getElementById('modalSaveBtn');
  const cancelBtn = document.getElementById('modalCancelBtn');

  // Toggle password visibility
  toggleBtn.addEventListener('click', () => {
    const icon = toggleBtn.querySelector('i');
    if (input.type === 'password') {
      input.type = 'text';
      icon.classList.remove('fa-eye');
      icon.classList.add('fa-eye-slash');
    } else {
      input.type = 'password';
      icon.classList.remove('fa-eye-slash');
      icon.classList.add('fa-eye');
    }
  });

  // Save button
  saveBtn.addEventListener('click', async () => {
    const apiKey = input.value.trim();

    if (!apiKey) {
      alert('Please enter an API key');
      return;
    }

    if (!apiKey.startsWith('AIza')) {
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
      console.error('Failed to save API key:', error);
      alert('Failed to save API key');
    }
  });

  // Cancel button
  cancelBtn.addEventListener('click', () => {
    if (window.apiKeyModalResolve) {
      window.apiKeyModalResolve(null);
      window.apiKeyModalResolve = null;
    }
    closeApiKeyModal();
  });

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      if (window.apiKeyModalResolve) {
        window.apiKeyModalResolve(null);
        window.apiKeyModalResolve = null;
      }
      closeApiKeyModal();
    }
  });

  // Handle Enter key
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveBtn.click();
    }
  });
}

function showApiKeyModal() {
  return new Promise((resolve) => {
    const modal = document.getElementById('apiKeyModal');
    const input = document.getElementById('modalApiKeyInput');

    // Store the resolve function globally so button handlers can access it
    window.apiKeyModalResolve = resolve;

    // Clear previous input
    input.value = '';
    input.type = 'password';

    // Show modal
    modal.style.display = 'flex';

    // Focus input after animation
    setTimeout(() => input.focus(), 300);
  });
}

// Expose globally for gemini-service.js
window.showApiKeyModal = showApiKeyModal;

function closeApiKeyModal() {
  const modal = document.getElementById('apiKeyModal');
  modal.style.display = 'none';
}

// File Upload Functionality
function setupFileUpload() {
  const uploadButton = document.getElementById('uploadButton');
  const emptyUploadButton = document.getElementById('emptyUploadButton');
  const fileInput = document.getElementById('fileInput');
  const dropZone = document.getElementById('dropZone');

  // Upload button click
  if (uploadButton) {
    uploadButton.addEventListener('click', () => {
      fileInput.click();
    });
  }

  // Empty state upload button
  if (emptyUploadButton) {
    emptyUploadButton.addEventListener('click', () => {
      fileInput.click();
    });
  }

  // File input change
  fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    await handleFiles(files);
    fileInput.value = ''; // Reset input
  });

  // Drag and drop on entire page
  document.body.addEventListener('dragenter', (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Only show drop zone if dragging files
    if (e.dataTransfer.types.includes('Files')) {
      dropZone.style.display = 'block';
    }
  });

  document.body.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  document.body.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Hide drop zone only if leaving the body
    if (e.target === document.body) {
      dropZone.style.display = 'none';
      dropZone.classList.remove('drag-over');
    }
  });

  document.body.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.style.display = 'none';
    dropZone.classList.remove('drag-over');
  });

  // Drop zone specific events
  if (dropZone) {
    dropZone.addEventListener('click', () => {
      fileInput.click();
    });

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('drag-over');

      const files = Array.from(e.dataTransfer.files);

      if (files.length > 0) {
        await handleFiles(files);
      } else {
        alert('Please drop audio files only');
      }

      dropZone.style.display = 'none';
    });
  }
}

// Check if file is an audio file
function isAudioFile(file) {
  // Check MIME type
  if (file.type.startsWith('audio/')) {
    return true;
  }

  // WEBM files might be detected as video/webm, check extension too
  const extension = file.name.split('.').pop().toLowerCase();
  const audioExtensions = ['mp3', 'wav', 'ogg', 'webm', 'm4a', 'aac', 'flac', 'opus'];

  return audioExtensions.includes(extension);
}

// Handle uploaded files
async function handleFiles(files) {
  if (files.length === 0) return;

  // Filter for audio files
  const audioFiles = files.filter(file => isAudioFile(file));

  if (audioFiles.length === 0) {
    alert('No audio files found. Please select audio files (MP3, WAV, OGG, WEBM, M4A).');
    return;
  }

  if (audioFiles.length !== files.length) {
    alert(`${files.length - audioFiles.length} non-audio file(s) skipped.`);
  }

  // Show loading indicator
  showNotification('info', `Uploading ${audioFiles.length} file(s)...`);

  let successCount = 0;
  let errorCount = 0;

  for (const file of audioFiles) {
    try {
      await uploadAudioFile(file);
      successCount++;
    } catch (error) {
      console.error('Failed to upload file:', file.name, error);
      errorCount++;
    }
  }

  // Reload history to show new files
  await loadHistory();

  // Show result
  if (errorCount === 0) {
    showNotification('success', `Successfully uploaded ${successCount} file(s)!`);
  } else {
    showNotification('warning', `Uploaded ${successCount} file(s), ${errorCount} failed.`);
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
          audio.addEventListener('loadedmetadata', res);
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
          source: 'upload' // Mark as uploaded
        };

        // Save to storage using IndexedDB
        await window.StorageUtils.saveRecording(audioDataUrl, {
          duration: audio.duration,
          timestamp: recording.timestamp,
          filename: file.name,
          fileSize: file.size,
          mimeType: file.type,
          source: 'upload'
        });

        resolve();
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsDataURL(file);
  });
}

// Show notification
function showNotification(type, message) {
  const notification = document.createElement('div');
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
    success: { bg: '#d4edda', color: '#155724', border: '#c3e6cb' },
    error: { bg: '#f8d7da', color: '#721c24', border: '#f5c6cb' },
    info: { bg: '#d1ecf1', color: '#0c5460', border: '#bee5eb' },
    warning: { bg: '#fff3cd', color: '#856404', border: '#ffeaa7' }
  };

  const style = colors[type] || colors.info;
  notification.style.background = style.bg;
  notification.style.color = style.color;
  notification.style.border = `1px solid ${style.border}`;

  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'slideOutRight 0.3s ease-out';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Add slide animations
const uploadStyles = document.createElement('style');
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
  const module = await import('./utils/prompts.js');
  promptsManager = module.default;
}

// Initialize on page load
initPromptsManager();

// Handle "AI Process" button clicks and processed result actions
historyList.addEventListener('click', async (e) => {
  const target = e.target.closest('button');
  if (!target) return;

  if (target.classList.contains('transcription-process-btn')) {
    const recordingId = target.dataset.recordingId;
    await showPostProcessingUI(recordingId);
  }

  // Handle expand/collapse toggle buttons
  if (target.classList.contains('expand-toggle')) {
    const uniqueId = target.dataset.uniqueId;
    if (uniqueId) {
      toggleExpandContent(uniqueId);
    }
  }

  // Handle copy button
  if (target.classList.contains('copy-processed-btn')) {
    const recordingId = target.dataset.recordingId;
    const promptId = target.dataset.promptId;
    await copyProcessedText(e, recordingId, promptId, target);
  }

  // Handle download button
  if (target.classList.contains('download-processed-btn')) {
    const recordingId = target.dataset.recordingId;
    const promptId = target.dataset.promptId;
    const promptName = target.dataset.promptName;
    downloadProcessedText(e, recordingId, promptId, promptName, target);
  }

  // Handle delete button
  if (target.classList.contains('delete-processed-btn')) {
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
    if (contentDiv.classList.contains('collapsed')) {
      contentDiv.classList.remove('collapsed');
      toggleBtn.innerHTML = '<i class="fas fa-chevron-up"></i> Show Less';
    } else {
      contentDiv.classList.add('collapsed');
      toggleBtn.innerHTML = '<i class="fas fa-chevron-down"></i> Show More';
    }
  }
}

// Show post-processing UI
async function showPostProcessingUI(recordingId) {
  const postProcessingSection = document.getElementById(`post-processing-${recordingId}`);
  const postProcessingContent = document.getElementById(`post-processing-content-${recordingId}`);

  if (!postProcessingSection || !postProcessingContent) return;

  // Toggle display
  if (postProcessingSection.style.display === 'block') {
    postProcessingSection.style.display = 'none';
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
          <button class="process-run-btn" style="margin-top: 12px;" onclick="chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') })">
            <i class="fas fa-cog"></i>
            Open Settings
          </button>
        </div>
      `;
      postProcessingSection.style.display = 'block';
      return;
    }

    // Build prompt selector HTML
    let promptOptionsHTML = '<option value="">-- Select a prompt --</option>';
    const promptsByCategory = {};

    promptsArray.forEach(prompt => {
      const category = prompt.category || 'General';
      if (!promptsByCategory[category]) {
        promptsByCategory[category] = [];
      }
      promptsByCategory[category].push(prompt);
    });

    // Add prompts grouped by category
    Object.keys(promptsByCategory).sort().forEach(category => {
      promptOptionsHTML += `<optgroup label="${category}">`;
      promptsByCategory[category].forEach(prompt => {
        promptOptionsHTML += `<option value="${prompt.id}" data-description="${prompt.description || ''}">${prompt.name}</option>`;
      });
      promptOptionsHTML += '</optgroup>';
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
    postProcessingSection.style.display = 'block';

    // Setup event listeners
    const promptSelect = document.getElementById(`prompt-select-${recordingId}`);
    const promptDescription = document.getElementById(`prompt-description-${recordingId}`);
    const runBtn = postProcessingContent.querySelector('.process-run-btn');
    const cancelBtn = postProcessingContent.querySelector('.process-cancel-btn');

    promptSelect.addEventListener('change', () => {
      const selectedOption = promptSelect.options[promptSelect.selectedIndex];
      const description = selectedOption.getAttribute('data-description');

      if (selectedOption.value) {
        runBtn.disabled = false;
        if (description) {
          promptDescription.textContent = description;
          promptDescription.style.display = 'block';
        } else {
          promptDescription.style.display = 'none';
        }
      } else {
        runBtn.disabled = true;
        promptDescription.style.display = 'none';
      }
    });

    runBtn.addEventListener('click', () => runPostProcessing(recordingId));
    cancelBtn.addEventListener('click', () => {
      postProcessingSection.style.display = 'none';
    });

    // Load existing processed transcriptions
    const key = `recording-${recordingId}`;
    const recording = await window.StorageUtils.getRecording(key);
    if (recording && recording.processedTranscriptions) {
      loadProcessedTranscriptions(recordingId, recording.processedTranscriptions);
    }

  } catch (error) {
    console.error('Failed to load prompts:', error);
    postProcessingContent.innerHTML = `
      <div style="padding: 20px; text-align: center; color: #c62828;">
        <i class="fas fa-exclamation-triangle" style="font-size: 32px; margin-bottom: 12px;"></i>
        <p>Failed to load prompts: ${error.message}</p>
      </div>
    `;
    postProcessingSection.style.display = 'block';
  }
}

// Run post-processing with selected prompt
async function runPostProcessing(recordingId) {
  const promptSelect = document.getElementById(`prompt-select-${recordingId}`);
  const selectedPromptId = promptSelect.value;

  if (!selectedPromptId) {
    alert('Please select a prompt');
    return;
  }

  const resultsDiv = document.getElementById(`processing-results-${recordingId}`);

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
      throw new Error('No transcription available. Please transcribe first.');
    }

    // Get the prompt
    const prompt = await promptsManager.getPrompt(selectedPromptId);
    if (!prompt) {
      throw new Error('Prompt not found');
    }

    // Apply transcription to prompt
    const processedPrompt = await promptsManager.applyTranscription(selectedPromptId, recording.transcription);

    // Process with Gemini
    const updateProgress = (message) => {
      resultsDiv.innerHTML = `
        <div class="processing-progress">
          <i class="fas fa-spinner fa-spin"></i>
          <p>${message}</p>
        </div>
      `;
    };

    const processedText = await window.transcriptionService.processTranscription(
      recording.transcription,
      processedPrompt,
      updateProgress
    );

    // Save processed transcription
    await window.StorageUtils.updateProcessedTranscription(key, processedText, selectedPromptId);

    // Load and display all processed transcriptions
    const updatedRecording = await window.StorageUtils.getRecording(key);
    loadProcessedTranscriptions(recordingId, updatedRecording.processedTranscriptions);

    // Show success message briefly
    resultsDiv.innerHTML = `
      <div style="padding: 20px; text-align: center; color: #2e7d32;">
        <i class="fas fa-check-circle" style="font-size: 32px; margin-bottom: 12px;"></i>
        <p><strong>Processing completed successfully!</strong></p>
      </div>
    `;

    setTimeout(() => {
      resultsDiv.innerHTML = '';
      loadProcessedTranscriptions(recordingId, updatedRecording.processedTranscriptions);
    }, 1500);

  } catch (error) {
    console.error('Post-processing error:', error);
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
async function loadProcessedTranscriptions(recordingId, processedTranscriptions) {
  const resultsDiv = document.getElementById(`processing-results-${recordingId}`);
  if (!resultsDiv || !processedTranscriptions) return;

  const processedArray = Object.values(processedTranscriptions);
  if (processedArray.length === 0) return;

  let resultsHTML = '';

  for (const processed of processedArray) {
    const prompt = await promptsManager.getPrompt(processed.promptId);
    const promptName = prompt ? prompt.name : 'Unknown Prompt';
    const promptNameEscaped = promptName.replace(/'/g, "\\'");
    const timestamp = new Date(processed.timestamp).toLocaleString();
    const uniqueId = `${recordingId}-${processed.promptId}`;

    // Check if content is long (more than 500 characters)
    const isLongContent = processed.text.length > 500;
    const collapsedClass = isLongContent ? 'collapsed' : '';

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
        ${isLongContent ? `
          <button class="expand-toggle" data-unique-id="${uniqueId}" id="toggle-${uniqueId}">
            <i class="fas fa-chevron-down"></i> Show More
          </button>
        ` : ''}
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
        button.style.background = '#4caf50';

        setTimeout(() => {
          button.innerHTML = originalHTML;
          button.style.background = '';
        }, 2000);
      }
    } catch (error) {
      console.error('Failed to copy:', error);
      alert('Failed to copy to clipboard');
    }
  }
}

// Download processed text as file
function downloadProcessedText(event, recordingId, promptId, promptName, button) {
  console.log('Download called:', { recordingId, promptId, promptName });

  const uniqueId = `${recordingId}-${promptId}`;
  const contentDiv = document.getElementById(`processed-content-${uniqueId}`);

  console.log('Content div found:', !!contentDiv);

  if (contentDiv) {
    try {
      const text = contentDiv.textContent;
      console.log('Text length:', text.length);

      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${promptName}-${Date.now()}.txt`;

      console.log('Download link created:', a.download);

      document.body.appendChild(a);
      a.click();

      console.log('Click triggered');

      // Small delay before cleanup
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);

      // Show feedback
      if (button) {
        const originalHTML = button.innerHTML;
        button.innerHTML = '<i class="fas fa-check"></i> Downloaded!';
        button.style.background = '#4caf50';

        setTimeout(() => {
          button.innerHTML = originalHTML;
          button.style.background = '';
        }, 2000);
      }
    } catch (error) {
      console.error('Failed to download:', error);
      alert('Failed to download file: ' + error.message);
    }
  } else {
    console.error('Content div not found with id:', `processed-content-${uniqueId}`);
    alert('Could not find content to download');
  }
}

// Show delete confirmation modal
function showDeleteConfirmModal(message = 'Are you sure you want to delete this processed result? This action cannot be undone.') {
  return new Promise((resolve) => {
    const modal = document.getElementById('deleteConfirmModal');
    const messageElement = document.getElementById('deleteModalMessage');
    const cancelBtn = document.getElementById('deleteConfirmCancel');
    const okBtn = document.getElementById('deleteConfirmOk');

    // Set the message
    messageElement.textContent = message;

    // Show modal
    modal.style.display = 'flex';

    // Handle cancel
    const handleCancel = () => {
      modal.style.display = 'none';
      cancelBtn.removeEventListener('click', handleCancel);
      okBtn.removeEventListener('click', handleOk);
      modal.removeEventListener('click', handleBackdropClick);
      resolve(false);
    };

    // Handle confirm
    const handleOk = () => {
      modal.style.display = 'none';
      cancelBtn.removeEventListener('click', handleCancel);
      okBtn.removeEventListener('click', handleOk);
      modal.removeEventListener('click', handleBackdropClick);
      resolve(true);
    };

    // Handle backdrop click
    const handleBackdropClick = (e) => {
      if (e.target === modal) {
        handleCancel();
      }
    };

    // Attach event listeners
    cancelBtn.addEventListener('click', handleCancel);
    okBtn.addEventListener('click', handleOk);
    modal.addEventListener('click', handleBackdropClick);
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
      throw new Error('Recording or processed transcriptions not found');
    }

    // Delete the specific processed transcription
    delete recording.processedTranscriptions[promptId];

    // Save the updated recording using the IndexedDB manager directly
    // We need to import it first
    const dbModule = await import('./utils/indexeddb.js');
    await dbModule.default.saveRecording(key, recording);

    // Remove from UI with animation
    const uniqueId = `${recordingId}-${promptId}`;
    const resultDiv = document.getElementById(`processed-result-${uniqueId}`);
    if (resultDiv) {
      resultDiv.style.animation = 'fadeOut 0.3s ease-out';
      setTimeout(() => {
        resultDiv.remove();

        // Check if there are no more results
        const resultsDiv = document.getElementById(`processing-results-${recordingId}`);
        if (resultsDiv && resultsDiv.children.length === 0) {
          resultsDiv.innerHTML = '';
        }
      }, 300);
    }

    // Show success feedback
    const notification = document.createElement('div');
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
    notification.textContent = 'Processed result deleted';
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'slideOutRight 0.3s ease-out';
      setTimeout(() => notification.remove(), 300);
    }, 2000);

  } catch (error) {
    console.error('Failed to delete processed text:', error);
    alert('Failed to delete: ' + error.message);
  }
};

// Auto-refresh mechanism for incomplete recordings
let refreshInterval = null;

async function checkForIncompleteRecordings() {
  // Check if there's an active recording in storage
  const storageData = await chrome.storage.local.get(['activeRecordingId']);
  if (storageData.activeRecordingId) {
    console.log('Active recording exists in storage:', storageData.activeRecordingId);
    return true; // Always refresh if there's an active recording
  }

  const allRecordings = await window.StorageUtils.getAllRecordings();
  const finalRecordings = allRecordings.filter(r => r.source !== 'recording-chunk');
  const chunks = allRecordings.filter(r => r.source === 'recording-chunk');

  // Group chunks by parent recording ID
  const chunksByParent = {};
  for (const chunk of chunks) {
    if (!chunksByParent[chunk.parentRecordingId]) {
      chunksByParent[chunk.parentRecordingId] = [];
    }
    chunksByParent[chunk.parentRecordingId].push(chunk);
  }

  // Check if there are incomplete recordings
  const finalRecordingIds = new Set(finalRecordings.map(r => r.key));
  const incompleteExists = Object.keys(chunksByParent).some(parentId => !finalRecordingIds.has(parentId));

  console.log('Incomplete recordings exist:', incompleteExists, 'Chunks groups:', Object.keys(chunksByParent).length);
  return incompleteExists;
}

async function startAutoRefresh() {
  // Check if there are incomplete recordings
  const hasIncompleteRecordings = await checkForIncompleteRecordings();

  if (hasIncompleteRecordings && !refreshInterval) {
    console.log('Starting auto-refresh for incomplete recordings');
    refreshInterval = setInterval(async () => {
      console.log('Auto-refreshing history...');
      // Reload history
      await loadHistory();

      // Check if we still have incomplete recordings
      const stillHasIncomplete = await checkForIncompleteRecordings();

      // Stop auto-refresh if no more incomplete recordings
      if (!stillHasIncomplete) {
        console.log('No more incomplete recordings, stopping auto-refresh');
        clearInterval(refreshInterval);
        refreshInterval = null;
      }
    }, 3000); // Refresh every 3 seconds
  } else if (!hasIncompleteRecordings && refreshInterval) {
    // Stop refresh if no incomplete recordings
    console.log('Stopping auto-refresh');
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}
