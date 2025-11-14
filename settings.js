// Settings page logic

// Model information
const MODEL_INFO = {
  "gemini-2.5-flash": {
    name: "Gemini 2.5 Flash",
    description:
      "The **fast and balanced workhorse**. Offers a great blend of speed, capability, and cost-efficiency. Best for most everyday and high-volume tasks.",
    speed: "Fast",
    accuracy: "Very Good",
    cost: "Standard tier",
  },
  "gemini-2.5-flash-lite": {
    name: "Gemini 2.5 Flash-Lite",
    description:
      "The **most cost-efficient and fastest** in the 2.5 lineup. Optimized for high-throughput, low-latency, and cost-sensitive applications.",
    speed: "Fastest",
    accuracy: "Good",
    cost: "Lowest tier",
  },
  "gemini-2.5-pro": {
    name: "Gemini 2.5 Pro",
    description:
      "Our **most advanced reasoning model**. Best for complex tasks, coding, and deep analysis. Features a large context window.",
    speed: "Moderate",
    accuracy: "Highest",
    cost: "Premium tier",
  },
};

// State
let currentConfig = {};
let unsavedChanges = false;

// DOM Elements
const elements = {
  // API Key
  apiKey: document.getElementById('apiKey'),
  toggleApiKey: document.getElementById('toggleApiKey'),
  saveApiKey: document.getElementById('saveApiKey'),
  clearApiKey: document.getElementById('clearApiKey'),
  testApiKey: document.getElementById('testApiKey'),
  apiKeyStatus: document.getElementById('apiKeyStatus'),

  // Model
  modelSelect: document.getElementById('modelSelect'),
  modelDescription: document.getElementById('modelDescription'),

  // Transcription
  autoTranscribe: document.getElementById('autoTranscribe'),

  // Audio
  tabGain: document.getElementById('tabGain'),
  tabGainValue: document.getElementById('tabGainValue'),
  micGain: document.getElementById('micGain'),
  micGainValue: document.getElementById('micGainValue'),

  // Storage
  maxRecordings: document.getElementById('maxRecordings'),
  clearAllData: document.getElementById('clearAllData'),

  // UI
  showNotifications: document.getElementById('showNotifications'),

  // Actions
  saveSettings: document.getElementById('saveSettings'),
  resetSettings: document.getElementById('resetSettings'),
  exportSettings: document.getElementById('exportSettings'),
  importSettings: document.getElementById('importSettings'),
  importFile: document.getElementById('importFile')
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupEventListeners();
  updateModelDescription();
});

// Load settings from storage
async function loadSettings() {
  try {
    // Load config
    await configManager.load();
    currentConfig = configManager.getAll();

    // Load API key
    const apiKeyResult = await chrome.storage.local.get('gemini_api_key');
    if (apiKeyResult.gemini_api_key) {
      elements.apiKey.value = apiKeyResult.gemini_api_key;
    }

    // Load transcription model
    const modelResult = await chrome.storage.local.get('gemini_model');
    if (modelResult.gemini_model) {
      elements.modelSelect.value = modelResult.gemini_model;
    }

    // Apply settings to UI
    elements.autoTranscribe.checked = currentConfig.autoTranscribe || false;
    elements.tabGain.value = currentConfig.tabGain || 1.0;
    elements.tabGainValue.textContent = `${currentConfig.tabGain || 1.0}x`;
    elements.micGain.value = currentConfig.micGain || 1.5;
    elements.micGainValue.textContent = `${currentConfig.micGain || 1.5}x`;
    elements.maxRecordings.value = currentConfig.maxRecordings || 50;
    elements.showNotifications.checked = currentConfig.showNotifications !== false;

  } catch (error) {
    console.error('Failed to load settings:', error);
    showStatus('error', 'Failed to load settings');
  }
}

// Setup event listeners
function setupEventListeners() {
  // Navigation
  document.getElementById('openHistory').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('history.html') });
  });

  // API Key
  elements.toggleApiKey.addEventListener('click', toggleApiKeyVisibility);
  elements.saveApiKey.addEventListener('click', saveApiKey);
  elements.clearApiKey.addEventListener('click', clearApiKey);
  elements.testApiKey.addEventListener('click', testApiKey);

  // Model selection
  elements.modelSelect.addEventListener('change', () => {
    updateModelDescription();
    unsavedChanges = true;
  });

  // Audio sliders
  elements.tabGain.addEventListener('input', (e) => {
    elements.tabGainValue.textContent = `${e.target.value}x`;
    unsavedChanges = true;
  });

  elements.micGain.addEventListener('input', (e) => {
    elements.micGainValue.textContent = `${e.target.value}x`;
    unsavedChanges = true;
  });

  // Other inputs
  elements.autoTranscribe.addEventListener('change', () => unsavedChanges = true);
  elements.maxRecordings.addEventListener('change', () => unsavedChanges = true);
  elements.showNotifications.addEventListener('change', () => unsavedChanges = true);

  // Actions
  elements.saveSettings.addEventListener('click', saveAllSettings);
  elements.resetSettings.addEventListener('click', resetSettings);
  elements.exportSettings.addEventListener('click', exportSettings);
  elements.importSettings.addEventListener('click', () => elements.importFile.click());
  elements.importFile.addEventListener('change', importSettings);
  elements.clearAllData.addEventListener('click', clearAllData);

  // Warn before leaving with unsaved changes
  window.addEventListener('beforeunload', (e) => {
    if (unsavedChanges) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

// Toggle API key visibility
function toggleApiKeyVisibility() {
  const input = elements.apiKey;
  const icon = elements.toggleApiKey.querySelector('i');

  if (input.type === 'password') {
    input.type = 'text';
    icon.classList.remove('fa-eye');
    icon.classList.add('fa-eye-slash');
  } else {
    input.type = 'password';
    icon.classList.remove('fa-eye-slash');
    icon.classList.add('fa-eye');
  }
}

// Save API key
async function saveApiKey() {
  const apiKey = elements.apiKey.value.trim();

  if (!apiKey) {
    showStatus('error', 'Please enter an API key', elements.apiKeyStatus);
    return;
  }

  if (!apiKey.startsWith('AIza')) {
    showStatus('error', 'Invalid API key format. Should start with "AIza"', elements.apiKeyStatus);
    return;
  }

  try {
    await chrome.storage.local.set({ gemini_api_key: apiKey });
    showStatus('success', 'API key saved successfully!', elements.apiKeyStatus);
  } catch (error) {
    console.error('Failed to save API key:', error);
    showStatus('error', 'Failed to save API key', elements.apiKeyStatus);
  }
}

// Clear API key
async function clearApiKey() {
  if (!confirm('Are you sure you want to clear your API key?')) {
    return;
  }

  try {
    await chrome.storage.local.remove('gemini_api_key');
    elements.apiKey.value = '';
    showStatus('success', 'API key cleared', elements.apiKeyStatus);
  } catch (error) {
    console.error('Failed to clear API key:', error);
    showStatus('error', 'Failed to clear API key', elements.apiKeyStatus);
  }
}

// Test API key
async function testApiKey() {
  const apiKey = elements.apiKey.value.trim();

  if (!apiKey) {
    showStatus('error', 'Please enter an API key first', elements.apiKeyStatus);
    return;
  }

  showStatus('info', 'Testing API key...', elements.apiKeyStatus);

  try {
    // Test with a simple request
    const model = elements.modelSelect.value;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: 'Test' }]
          }]
        })
      }
    );

    if (response.ok) {
      showStatus('success', 'API key is valid! ✓', elements.apiKeyStatus);
    } else {
      const error = await response.json();
      showStatus('error', `API key test failed: ${error.error?.message || response.statusText}`, elements.apiKeyStatus);
    }
  } catch (error) {
    console.error('API test error:', error);
    showStatus('error', 'Failed to test API key: ' + error.message, elements.apiKeyStatus);
  }
}

// Update model description
function updateModelDescription() {
  const selectedModel = elements.modelSelect.value;
  const info = MODEL_INFO[selectedModel];

  if (info) {
    elements.modelDescription.innerHTML = `
      <strong>${info.name}</strong><br>
      ${info.description}<br>
      <small>Speed: ${info.speed} | Accuracy: ${info.accuracy} | Cost: ${info.cost}</small>
    `;
  }
}

// Save all settings
async function saveAllSettings() {
  try {
    // Save transcription model
    await chrome.storage.local.set({
      gemini_model: elements.modelSelect.value
    });

    // Save config
    await configManager.update({
      autoTranscribe: elements.autoTranscribe.checked,
      tabGain: parseFloat(elements.tabGain.value),
      micGain: parseFloat(elements.micGain.value),
      maxRecordings: parseInt(elements.maxRecordings.value),
      showNotifications: elements.showNotifications.checked
    });

    unsavedChanges = false;
    showNotification('success', 'All settings saved successfully!');
  } catch (error) {
    console.error('Failed to save settings:', error);
    showNotification('error', 'Failed to save settings');
  }
}

// Reset settings
async function resetSettings() {
  if (!confirm('Are you sure you want to reset all settings to defaults? This will not delete your API key or recordings.')) {
    return;
  }

  try {
    await configManager.reset();
    await chrome.storage.local.remove('gemini_model');
    await loadSettings();
    unsavedChanges = false;
    showNotification('success', 'Settings reset to defaults');
  } catch (error) {
    console.error('Failed to reset settings:', error);
    showNotification('error', 'Failed to reset settings');
  }
}

// Export settings
async function exportSettings() {
  try {
    const settings = {
      config: configManager.getAll(),
      model: elements.modelSelect.value,
      version: '2.0.0',
      exportedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chrome-audio-recorder-settings-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showNotification('success', 'Settings exported successfully');
  } catch (error) {
    console.error('Failed to export settings:', error);
    showNotification('error', 'Failed to export settings');
  }
}

// Import settings
async function importSettings(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const settings = JSON.parse(text);

    if (!settings.config || !settings.model) {
      throw new Error('Invalid settings file format');
    }

    // Import config
    await configManager.update(settings.config);

    // Import model
    await chrome.storage.local.set({ gemini_model: settings.model });

    // Reload UI
    await loadSettings();
    unsavedChanges = false;

    showNotification('success', 'Settings imported successfully');
  } catch (error) {
    console.error('Failed to import settings:', error);
    showNotification('error', 'Failed to import settings: ' + error.message);
  }

  // Reset file input
  event.target.value = '';
}

// Clear all data
async function clearAllData() {
  const confirmText = 'DELETE';
  const userInput = prompt(
    `WARNING: This will delete ALL recordings and reset ALL settings!\n\n` +
    `Type "${confirmText}" to confirm:`
  );

  if (userInput !== confirmText) {
    showNotification('info', 'Clear data cancelled');
    return;
  }

  try {
    // Clear all recordings
    await StorageUtils.clearAllRecordings();

    // Clear API key
    await chrome.storage.local.remove(['gemini_api_key', 'gemini_model']);

    // Reset config
    await configManager.reset();

    // Reload UI
    await loadSettings();
    elements.apiKey.value = '';

    unsavedChanges = false;
    showNotification('success', 'All data cleared successfully');
  } catch (error) {
    console.error('Failed to clear data:', error);
    showNotification('error', 'Failed to clear data');
  }
}

// Show status message in specific element
function showStatus(type, message, element = null) {
  const statusElement = element || document.createElement('div');

  statusElement.className = `status-message ${type}`;
  statusElement.textContent = message;

  if (!element) {
    document.body.appendChild(statusElement);
    setTimeout(() => statusElement.remove(), 5000);
  }

  setTimeout(() => {
    statusElement.style.display = 'none';
  }, 5000);
}

// Show notification (floating)
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
    animation: slideIn 0.3s ease-out;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  `;

  if (type === 'success') {
    notification.style.background = '#d4edda';
    notification.style.color = '#155724';
    notification.style.border = '1px solid #c3e6cb';
  } else if (type === 'error') {
    notification.style.background = '#f8d7da';
    notification.style.color = '#721c24';
    notification.style.border = '1px solid #f5c6cb';
  } else {
    notification.style.background = '#d1ecf1';
    notification.style.color = '#0c5460';
    notification.style.border = '1px solid #bee5eb';
  }

  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes slideOut {
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
document.head.appendChild(style);

// ========================================
// Prompts Management
// ========================================

let promptsManager;
let currentEditingPromptId = null;

// Initialize prompts manager
async function initPromptsManager() {
  // Import dynamically
  const module = await import('./utils/prompts.js');
  promptsManager = module.default;

  await loadAllPrompts();
  setupPromptsEventListeners();
}

// Setup event listeners for prompts
function setupPromptsEventListeners() {
  const addCustomPrompt = document.getElementById('addCustomPrompt');
  const savePrompt = document.getElementById('savePrompt');
  const cancelPrompt = document.getElementById('cancelPrompt');
  const closePromptModal = document.getElementById('closePromptModal');
  const exportPrompts = document.getElementById('exportPrompts');
  const importPrompts = document.getElementById('importPrompts');
  const importPromptsFile = document.getElementById('importPromptsFile');

  if (addCustomPrompt) {
    addCustomPrompt.addEventListener('click', () => openPromptModal());
  }

  if (savePrompt) {
    savePrompt.addEventListener('click', saveCustomPrompt);
  }

  if (cancelPrompt) {
    cancelPrompt.addEventListener('click', closePromptModal);
  }

  if (closePromptModal) {
    closePromptModal.addEventListener('click', closePromptModal);
  }

  if (exportPrompts) {
    exportPrompts.addEventListener('click', exportCustomPrompts);
  }

  if (importPrompts) {
    importPrompts.addEventListener('click', () => importPromptsFile.click());
  }

  if (importPromptsFile) {
    importPromptsFile.addEventListener('change', importCustomPrompts);
  }

  // Close modal on background click
  const promptModal = document.getElementById('promptModal');
  if (promptModal) {
    promptModal.addEventListener('click', (e) => {
      if (e.target === promptModal) {
        closePromptModal();
      }
    });
  }
}

// Load and display all prompts
async function loadAllPrompts() {
  try {
    const allPrompts = await promptsManager.getAllPrompts();
    const builtinList = document.getElementById('builtinPromptsList');
    const customList = document.getElementById('customPromptsList');

    if (!builtinList || !customList) return;

    // Clear lists
    builtinList.innerHTML = '';
    customList.innerHTML = '';

    // Separate built-in and custom prompts
    const builtinPrompts = [];
    const customPrompts = [];

    Object.values(allPrompts).forEach(prompt => {
      if (prompt.isBuiltin) {
        builtinPrompts.push(prompt);
      } else {
        customPrompts.push(prompt);
      }
    });

    // Render built-in prompts
    builtinPrompts.forEach(prompt => {
      builtinList.appendChild(createPromptItem(prompt, false));
    });

    // Render custom prompts
    customPrompts.forEach(prompt => {
      customList.appendChild(createPromptItem(prompt, true));
    });

    // Show message if no custom prompts
    if (customPrompts.length === 0) {
      customList.innerHTML = '<p style="color: #999; font-style: italic; padding: 20px; text-align: center;">No custom prompts yet. Click "Add Custom Prompt" to create one.</p>';
    }

  } catch (error) {
    console.error('Failed to load prompts:', error);
    showNotification('error', 'Failed to load prompts');
  }
}

// Create a prompt item element
function createPromptItem(prompt, isCustom) {
  const item = document.createElement('div');
  item.className = 'prompt-item';

  const icon = document.createElement('div');
  icon.className = 'prompt-item-icon';
  icon.innerHTML = '<i class="fas fa-magic"></i>';

  const content = document.createElement('div');
  content.className = 'prompt-item-content';

  const header = document.createElement('div');
  header.className = 'prompt-item-header';

  const name = document.createElement('span');
  name.className = 'prompt-item-name';
  name.textContent = prompt.name;

  const badge = document.createElement('span');
  badge.className = `prompt-item-badge ${isCustom ? 'custom' : 'builtin'}`;
  badge.textContent = isCustom ? 'Custom' : 'Built-in';

  header.appendChild(name);
  header.appendChild(badge);

  const description = document.createElement('div');
  description.className = 'prompt-item-description';
  description.textContent = prompt.description;

  const category = document.createElement('div');
  category.className = 'prompt-item-category';
  category.innerHTML = `<i class="fas fa-tag"></i> ${prompt.category || 'General'}`;

  content.appendChild(header);
  content.appendChild(description);
  content.appendChild(category);

  const actions = document.createElement('div');
  actions.className = 'prompt-item-actions';

  // View button
  const viewBtn = document.createElement('button');
  viewBtn.className = 'btn btn-secondary';
  viewBtn.innerHTML = '<i class="fas fa-eye"></i> View';
  viewBtn.onclick = () => viewPrompt(prompt);
  actions.appendChild(viewBtn);

  // Edit and Delete buttons for custom prompts only
  if (isCustom) {
    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-secondary';
    editBtn.innerHTML = '<i class="fas fa-edit"></i> Edit';
    editBtn.onclick = () => openPromptModal(prompt);
    actions.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-danger';
    deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
    deleteBtn.onclick = () => deleteCustomPrompt(prompt.id);
    actions.appendChild(deleteBtn);
  }

  item.appendChild(icon);
  item.appendChild(content);
  item.appendChild(actions);

  return item;
}

// Open prompt modal for adding/editing
function openPromptModal(prompt = null) {
  const modal = document.getElementById('promptModal');
  const modalTitle = document.getElementById('promptModalTitle');
  const nameInput = document.getElementById('promptName');
  const categoryInput = document.getElementById('promptCategory');
  const descriptionInput = document.getElementById('promptDescription');
  const textInput = document.getElementById('promptText');

  if (!modal) return;

  if (prompt) {
    // Edit mode
    modalTitle.textContent = 'Edit Custom Prompt';
    nameInput.value = prompt.name;
    categoryInput.value = prompt.category || '';
    descriptionInput.value = prompt.description || '';
    textInput.value = prompt.systemPrompt || '';
    currentEditingPromptId = prompt.id;
  } else {
    // Add mode
    modalTitle.textContent = 'Add Custom Prompt';
    nameInput.value = '';
    categoryInput.value = '';
    descriptionInput.value = '';
    textInput.value = '';
    currentEditingPromptId = null;
  }

  modal.style.display = 'flex';
}

// Close prompt modal
function closePromptModal() {
  const modal = document.getElementById('promptModal');
  if (modal) {
    modal.style.display = 'none';
  }
  currentEditingPromptId = null;
}

// Save custom prompt
async function saveCustomPrompt() {
  const nameInput = document.getElementById('promptName');
  const categoryInput = document.getElementById('promptCategory');
  const descriptionInput = document.getElementById('promptDescription');
  const textInput = document.getElementById('promptText');

  const name = nameInput.value.trim();
  const category = categoryInput.value.trim();
  const description = descriptionInput.value.trim();
  const systemPrompt = textInput.value.trim();

  // Validation
  if (!name) {
    showNotification('error', 'Please enter a prompt name');
    nameInput.focus();
    return;
  }

  if (!systemPrompt) {
    showNotification('error', 'Please enter a system prompt');
    textInput.focus();
    return;
  }

  try {
    const promptId = currentEditingPromptId || `custom-${Date.now()}`;

    await promptsManager.savePrompt(promptId, {
      name,
      category: category || 'Custom',
      description: description || 'Custom prompt',
      systemPrompt
    });

    showNotification('success', currentEditingPromptId ? 'Prompt updated successfully' : 'Prompt added successfully');
    closePromptModal();
    await loadAllPrompts();

  } catch (error) {
    console.error('Failed to save prompt:', error);
    showNotification('error', 'Failed to save prompt: ' + error.message);
  }
}

// View prompt details
function viewPrompt(prompt) {
  const message = `
Name: ${prompt.name}
Category: ${prompt.category || 'General'}
Description: ${prompt.description}

System Prompt:
${prompt.systemPrompt}
  `.trim();

  alert(message);
}

// Delete custom prompt
async function deleteCustomPrompt(promptId) {
  if (!confirm('Are you sure you want to delete this custom prompt?')) {
    return;
  }

  try {
    await promptsManager.deletePrompt(promptId);
    showNotification('success', 'Prompt deleted successfully');
    await loadAllPrompts();
  } catch (error) {
    console.error('Failed to delete prompt:', error);
    showNotification('error', 'Failed to delete prompt: ' + error.message);
  }
}

// Export custom prompts
async function exportCustomPrompts() {
  try {
    const json = await promptsManager.exportPrompts();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `custom-prompts-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showNotification('success', 'Custom prompts exported successfully');
  } catch (error) {
    console.error('Failed to export prompts:', error);
    showNotification('error', 'Failed to export prompts');
  }
}

// Import custom prompts
async function importCustomPrompts(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    await promptsManager.importPrompts(text);
    await loadAllPrompts();
    showNotification('success', 'Prompts imported successfully');
  } catch (error) {
    console.error('Failed to import prompts:', error);
    showNotification('error', 'Failed to import prompts: ' + error.message);
  }

  // Reset file input
  event.target.value = '';
}

// Initialize prompts on page load
document.addEventListener('DOMContentLoaded', () => {
  initPromptsManager();
});
