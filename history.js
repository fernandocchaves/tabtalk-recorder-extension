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
  const recordings = await chrome.storage.local.get(null);
  historyList.innerHTML = "";

  const recordingKeys = Object.keys(recordings).filter(key => key.startsWith("recording-"));

  if (recordingKeys.length === 0) {
    emptyState.style.display = "block";
    return;
  } else {
    emptyState.style.display = "none";
  }

  // Sort by timestamp (newest first)
  recordingKeys.sort((a, b) => {
    return recordings[b].timestamp - recordings[a].timestamp;
  });

  for (const key of recordingKeys) {
    const recording = recordings[key];
    const recordingCard = document.createElement("div");
    recordingCard.className = "recording-card";

    const fileName = formatDate(recording.timestamp);
    const recordingId = key.replace("recording-", "");

    recordingCard.innerHTML = `
      <div class="recording-card-main">
        <div class="recording-info">
          <div class="recording-icon">
            <i class="fas fa-microphone"></i>
          </div>
          <div class="recording-details">
            <div class="recording-name">${fileName}</div>
            <div class="recording-meta">
              <span class="duration" id="duration-${recordingId}">
                <i class="far fa-clock"></i>
                <span class="duration-text">Loading...</span>
              </span>
            </div>
          </div>
        </div>
        <div class="audio-player">
          <audio id="audio-${recordingId}" preload="metadata">
            <source src="${recording.data}" type="audio/webm">
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
        <div class="actions">
          <button class="action-btn transcribe-btn" data-key="${key}" data-recording-id="${recordingId}" title="Transcribe">
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

    // Setup audio element
    const audioElement = document.getElementById(`audio-${recordingId}`);
    audioElement.addEventListener('loadedmetadata', () => {
      const duration = audioElement.duration;
      const durationText = recordingCard.querySelector(`#duration-${recordingId} .duration-text`);
      if (durationText) {
        durationText.textContent = formatDuration(duration);
      }
      document.getElementById(`total-time-${recordingId}`).textContent = formatDuration(duration);
    });

    audioElement.addEventListener('timeupdate', () => {
      const progress = (audioElement.currentTime / audioElement.duration) * 100;
      document.getElementById(`progress-${recordingId}`).style.width = progress + '%';
      document.getElementById(`current-time-${recordingId}`).textContent = formatDuration(audioElement.currentTime);
    });

    audioElement.addEventListener('ended', () => {
      const playBtn = recordingCard.querySelector('.play-btn');
      playBtn.querySelector('.play-icon').style.display = 'inline';
      playBtn.querySelector('.pause-icon').style.display = 'none';
      playBtn.classList.remove('playing');
    });
  }
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
    const result = await chrome.storage.local.get(key);
    const recording = result[key];

    if (!recording || !recording.data) {
      throw new Error('Recording not found');
    }

    // Update status with progress
    const updateStatus = (message) => {
      transcriptionStatus.innerHTML = `
        <span class="status-badge status-transcribing">
          <i class="fas fa-spinner fa-spin"></i>
          ${message}
        </span>
      `;
    };

    updateStatus('Initializing...');

    // Wait for transcription service to be available
    let attempts = 0;
    while (!window.transcriptionService && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    if (!window.transcriptionService) {
      throw new Error('Transcription service not available');
    }

    // Transcribe the audio
    const transcriptionText = await window.transcriptionService.transcribe(
      recording.data,
      updateStatus
    );

    // Update status to completed
    transcriptionStatus.innerHTML = `
      <span class="status-badge status-completed">
        <i class="fas fa-check-circle"></i>
        Completed
      </span>
    `;

    // Show transcription text
    transcriptionContent.innerHTML = `
      <div class="transcription-text">${transcriptionText}</div>
      <div class="transcription-actions">
        <button class="transcription-copy-btn" data-recording-id="${recordingId}">
          <i class="fas fa-copy"></i>
          Copy
        </button>
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

    transcriptionContent.innerHTML = `
      <div style="padding: 20px; text-align: center; color: #c62828;">
        <i class="fas fa-exclamation-triangle" style="font-size: 32px; margin-bottom: 12px;"></i>
        <p><strong>Transcription failed</strong></p>
        <p style="font-size: 13px; margin-top: 8px;">${error.message}</p>
        <button class="transcription-copy-btn transcription-retry-btn" data-recording-id="${recordingId}" style="margin-top: 12px; background: #f44336;">
          <i class="fas fa-redo"></i>
          Retry
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
      // Check if already transcribed
      const transcriptionContent = document.getElementById(`transcription-content-${recordingId}`);
      if (transcriptionContent.querySelector('.transcription-text')) {
        // Already transcribed, just show it
        transcriptionSection.style.display = 'block';
      } else {
        // Start transcription
        await transcribeAudio(recordingId);
      }
    }
  } else if (target.classList.contains("transcription-retry-btn")) {
    const recordingId = target.dataset.recordingId;
    const transcribeBtn = document.querySelector(`.transcribe-btn[data-recording-id="${recordingId}"]`);

    // Click twice to close and reopen (which triggers retry)
    transcribeBtn.click();
    transcribeBtn.click();
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
    const result = await chrome.storage.local.get(key);
    const recording = result[key];

    const downloadLink = document.createElement("a");
    downloadLink.href = recording.data;
    downloadLink.download = `recording-${new Date(recording.timestamp).toISOString()}.webm`;
    downloadLink.click();
  } else if (target.classList.contains("delete-btn")) {
    if (confirm('Are you sure you want to delete this recording?')) {
      const key = target.dataset.key;
      await chrome.storage.local.remove(key);
      loadHistory();
    }
  }
});

// Initialize transcription service
document.addEventListener("DOMContentLoaded", async () => {
  loadHistory();

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
});
