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

    // Check if transcription exists for this recording
    const hasTranscription = recording.transcription ? 'has-transcription' : '';
    const transcribeTitle = recording.transcription ? 'View Transcription' : 'Transcribe';

    // Check if this is an uploaded file
    const isUploaded = recording.source === 'upload';
    const displayName = isUploaded && recording.filename ? recording.filename : fileName;
    const iconClass = isUploaded ? 'fa-file-audio' : 'fa-microphone';

    recordingCard.innerHTML = `
      <div class="recording-card-main">
        <div class="recording-info">
          <div class="recording-icon ${isUploaded ? 'uploaded-icon' : ''}">
            <i class="fas ${iconClass}"></i>
          </div>
          <div class="recording-details">
            <div class="recording-name">${displayName}</div>
            <div class="recording-meta">
              <span class="duration" id="duration-${recordingId}">
                <i class="far fa-clock"></i>
                <span class="duration-text">Loading...</span>
              </span>
              ${isUploaded ? '<span class="upload-badge"><i class="fas fa-upload"></i> Uploaded</span>' : ''}
              ${recording.transcription ? '<span class="transcription-badge"><i class="fas fa-check-circle"></i> Transcribed</span>' : ''}
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

    // Save transcription to storage
    recording.transcription = transcriptionText;
    await chrome.storage.local.set({ [key]: recording });

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
      // Check if transcription exists in storage
      const key = `recording-${recordingId}`;
      const result = await chrome.storage.local.get(key);
      const recording = result[key];

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

        transcriptionContent.innerHTML = `
          <div class="transcription-text">${recording.transcription}</div>
          <div class="transcription-actions">
            <button class="transcription-copy-btn" data-recording-id="${recordingId}">
              <i class="fas fa-copy"></i>
              Copy
            </button>
          </div>
        `;

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

        // Get audio duration
        const audio = new Audio(audioDataUrl);
        await new Promise((res) => {
          audio.addEventListener('loadedmetadata', res);
        });

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

        // Save to storage
        const key = `recording-${recording.timestamp}`;
        await chrome.storage.local.set({ [key]: recording });

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
