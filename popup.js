// Get button elements
const startButton = document.getElementById("startRecord");
const stopButton = document.getElementById("stopRecord");
const historyButton = document.getElementById("historyButton");

const notification = document.getElementById("notification");
const notificationText = notification.querySelector(".notification-text");
const notificationIcon = notification.querySelector(".notification-icon");
const notificationClose = notification.querySelector(".notification-close");
const statusDot = document.querySelector(".status-dot");
const statusText = document.querySelector(".status-text");

let notificationTimeout;

function showNotification(message, type = "error", duration = 5000) {
  notificationText.textContent = message;

  // Set icon based on type
  notification.className = `notification notification-${type}`;
  if (type === "error") {
    notificationIcon.className = "notification-icon fas fa-exclamation-circle";
  } else if (type === "warning") {
    notificationIcon.className = "notification-icon fas fa-exclamation-triangle";
  } else if (type === "success") {
    notificationIcon.className = "notification-icon fas fa-check-circle";
  } else {
    notificationIcon.className = "notification-icon fas fa-info-circle";
  }

  notification.style.display = "flex";

  // Clear any existing timeout
  if (notificationTimeout) {
    clearTimeout(notificationTimeout);
  }

  // Auto-hide after duration
  if (duration > 0) {
    notificationTimeout = setTimeout(() => {
      hideNotification();
    }, duration);
  }
}

function hideNotification() {
  notification.style.display = "none";
  if (notificationTimeout) {
    clearTimeout(notificationTimeout);
  }
}

function setStatus(status, text) {
  statusDot.className = `status-dot ${status}`;
  statusText.textContent = text;
}

// Close notification when clicking the X button
notificationClose.addEventListener("click", hideNotification);

async function checkMicrophonePermission() {
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    return true;
  } catch (error) {
    return false;
  }
}

// Check recording state when popup opens
async function checkRecordingState() {
  const hasPermission = await checkMicrophonePermission();
  if (!hasPermission) {
    chrome.tabs.create({ url: "permission.html" });
    return;
  }

  const contexts = await chrome.runtime.getContexts({});
  const offscreenDocument = contexts.find(
    (c) => c.contextType === "OFFSCREEN_DOCUMENT"
  );

  if (
    offscreenDocument &&
    offscreenDocument.documentUrl.endsWith("#recording")
  ) {
    stopButton.style.display = "flex";
    setTimeout(() => stopButton.classList.add("visible"), 10);
    setStatus("recording", "Recording...");
  } else {
    startButton.style.display = "flex";
    setTimeout(() => startButton.classList.add("visible"), 10);
    setStatus("", "Ready");
  }
}

// Call checkRecordingState when popup opens
document.addEventListener("DOMContentLoaded", checkRecordingState);

// Add button click listeners
startButton.addEventListener("click", async () => {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (
      !tab ||
      tab.url.startsWith("chrome://") ||
      tab.url.startsWith("chrome-extension://")
    ) {
      showNotification(
        "Cannot record Chrome system pages. Please try on a regular webpage.",
        "warning"
      );
      return;
    }

    // Create offscreen document if not exists
    const contexts = await chrome.runtime.getContexts({});
    const offscreenDocument = contexts.find(
      (c) => c.contextType === "OFFSCREEN_DOCUMENT"
    );

    if (!offscreenDocument) {
      await chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: ["USER_MEDIA"],
        justification: "Recording from chrome.tabCapture API",
      });
    }

    // Get stream ID and start recording
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tab.id,
    });

    chrome.runtime.sendMessage({
      type: "start-recording",
      target: "offscreen",
      data: streamId,
    });

    startButton.classList.remove("visible");
    setTimeout(() => {
      startButton.style.display = "none";
      stopButton.style.display = "flex";
      setTimeout(() => {
        stopButton.classList.add("visible");
        setStatus("recording", "Recording...");
      }, 10);
    }, 300);
  } catch (error) {
    showNotification("Failed to start recording: " + error.message, "error");
    setStatus("", "Ready");
  }
});

stopButton.addEventListener("click", () => {
  setTimeout(() => {
    chrome.runtime.sendMessage({
      type: "stop-recording",
      target: "offscreen",
    });
  }, 500);

  setStatus("", "Saving...");
  stopButton.classList.remove("visible");
  setTimeout(() => {
    stopButton.style.display = "none";
    startButton.style.display = "flex";
    setTimeout(() => {
      startButton.classList.add("visible");
      setStatus("", "Ready");
    }, 10);
  }, 300);
});

historyButton.addEventListener("click", () => {
  chrome.tabs.create({ url: "history.html" });
});

// Listen for messages from offscreen document and service worker
chrome.runtime.onMessage.addListener((message) => {
  if (message.target === "popup") {
    switch (message.type) {
      case "recording-error":
        showNotification(message.error, "error");
        startButton.style.display = "flex";
        stopButton.style.display = "none";
        setStatus("", "Ready");
        break;
      case "recording-stopped":
        startButton.style.display = "flex";
        stopButton.style.display = "none";
        setStatus("", "Ready");
        showNotification("Recording saved successfully!", "success", 3000);
        break;
    }
  }
});
