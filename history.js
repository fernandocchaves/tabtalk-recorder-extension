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
        <button class="action-btn download-btn" data-key="${key}" title="Download">
          <i class="fas fa-download"></i>
        </button>
        <button class="action-btn delete-btn" data-key="${key}" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
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

historyList.addEventListener("click", async (e) => {
  const target = e.target.closest('button');
  if (!target) return;

  if (target.classList.contains("play-btn")) {
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

document.addEventListener("DOMContentLoaded", loadHistory);
