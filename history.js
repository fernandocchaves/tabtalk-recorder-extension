const historyList = document.getElementById("historyList");

async function loadHistory() {
  const recordings = await chrome.storage.local.get(null);
  historyList.innerHTML = "";

  for (const key in recordings) {
    if (key.startsWith("recording-")) {
      const recording = recordings[key];
      const listItem = document.createElement("li");

      const fileName = new Date(recording.timestamp).toLocaleString();
      listItem.innerHTML = `
        <span>${fileName}</span>
        <div class="actions">
          <button class="download-btn" data-key="${key}">Download</button>
          <button class="delete-btn" data-key="${key}">Delete</button>
        </div>
      `;

      historyList.appendChild(listItem);
    }
  }
}

historyList.addEventListener("click", async (e) => {
  if (e.target.classList.contains("download-btn")) {
    const key = e.target.dataset.key;
    const result = await chrome.storage.local.get(key);
    const recording = result[key];

    const downloadLink = document.createElement("a");
    downloadLink.href = recording.data;
    downloadLink.download = `${new Date(recording.timestamp).toISOString()}.webm`;
    downloadLink.click();
  } else if (e.target.classList.contains("delete-btn")) {
    const key = e.target.dataset.key;
    await chrome.storage.local.remove(key);
    loadHistory();
  }
});

document.addEventListener("DOMContentLoaded", loadHistory);
