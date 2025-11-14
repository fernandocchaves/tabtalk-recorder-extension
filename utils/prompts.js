/**
 * Custom prompts manager for AI post-processing
 * Handles built-in and user-defined system prompts
 */

const BUILTIN_PROMPTS = {
  'meeting-minutes': {
    id: 'meeting-minutes',
    name: 'Meeting Minutes Parser',
    description: 'Converts meeting transcripts into structured JSON with tasks, decisions, and timelines',
    systemPrompt: `You are an expert meeting-minutes parser. Convert the following meeting transcript into a structured JSON object that is READY FOR STORAGE (machine-readable, no commentary). Follow these RULES STRICTLY:

LANGUAGE
- Use English for JSON keys.
- Preserve the original language of content (Persian/English) inside values when it appears in the transcript.

OUTPUT FORMAT (single JSON object only):
{
  "meeting_meta": {
    "title": "<short meeting title>",
    "date": "<YYYY-MM-DD if detectable, else null>",
    "time": "<HH:MM TZ or null>",
    "location": "<string or null>",
    "facilitator": "<name or null>",
    "scribe": "<name or null>"
  },
  "attendees": [
    {"name":"<full name or alias>", "role":"<role or null>", "present": true|false}
  ],
  "projects": [
    {
      "project_name": "<project>",
      "status": "<summary status in 1–2 sentences>",
      "highlights": ["<bullet 1>", "<bullet 2>", "..."],
      "decisions": ["<decision 1>", "..."],
      "risks": ["<risk 1>", "..."],
      "dependencies": ["<dependency 1>", "..."],
      "open_questions": ["<question 1>", "..."]
    }
  ],
  "actions": [
    {
      "title": "<action item>",
      "assignee": "<person or 'Unassigned'>",
      "project_name": "<related project or 'General'>",
      "priority": "High|Medium|Low",
      "status": "New|In Progress|Blocked|Done",
      "due_date": "<YYYY-MM-DD or null>",
      "notes": "<concise context>"
    }
  ],
  "people": [
    {
      "name": "<person>",
      "updates": ["<their reported updates, concise bullets>"],
      "blockers": ["<their blockers>"],
      "needs": ["<asks/requests>"],
      "TODO": [
        {
          "title": "<task phrased as an action>",
          "project_name": "<related project or 'General'>",
          "priority": "High|Medium|Low",
          "due_date": "<YYYY-MM-DD or null>",
          "status": "New|In Progress|Blocked|Done",
          "notes": "<extra context if needed>"
        }
      ]
    }
  ],
  "timeline": [
    {
      "milestone": "<name>",
      "project_name": "<project>",
      "target_date": "<YYYY-MM-DD or null>",
      "status": "On Track|At Risk|Off Track",
      "owner": "<person or team>"
    }
  ],
  "notes": ["<any extra minutes-worthy notes>"]
}

CONVERSION RULES
- Extract every explicit or implied task as an action. If a task is assigned verbally (e.g., "Shahab will…"), set assignee accordingly.
- If a task clearly belongs to a project, fill "project_name"; otherwise use "General".
- If no assignee is mentioned, set "assignee":"Unassigned".
- If urgency is implied by words like "today", "this week", "push now", set "priority":"High"; otherwise default to "Medium".
- Map status heuristically: promised/just planned → "New"; ongoing → "In Progress"; blocked by payment/approval → "Blocked"; explicitly finished → "Done".
- Normalize dates to YYYY-MM-DD when explicit; if only relative time is given (e.g., "today", "tomorrow"), keep null and echo the phrase in "notes".
- Keep decisions distinct from actions.
- Keep duplicate tasks merged (same assignee + project + identical intent). Combine their context into "notes".
- Do NOT invent information. If unclear, put null and add a brief note.

INPUT
<<<TRANSCRIPT_START
{{TRANSCRIPTION}}
TRANSCRIPT_END>>>

Now output ONLY the JSON object, nothing else.`,
    isBuiltin: true,
    category: 'Business'
  },
  'summary': {
    id: 'summary',
    name: 'Summarize',
    description: 'Creates a concise summary of the transcription',
    systemPrompt: `Please provide a clear and concise summary of the following transcription. Focus on the main points, key topics, and important details.

Transcription:
{{TRANSCRIPTION}}

Provide the summary in a well-structured format with bullet points or paragraphs as appropriate.`,
    isBuiltin: true,
    category: 'General'
  },
  'action-items': {
    id: 'action-items',
    name: 'Extract Action Items',
    description: 'Extracts all action items and tasks from the transcription',
    systemPrompt: `Extract all action items, tasks, and to-dos from the following transcription. For each action item, identify:
- The task description
- Who is responsible (if mentioned)
- Any deadlines or timeframes (if mentioned)
- Priority level (if mentioned or implied)

Transcription:
{{TRANSCRIPTION}}

Format the output as a numbered list with clear structure.`,
    isBuiltin: true,
    category: 'Productivity'
  },
  'key-points': {
    id: 'key-points',
    name: 'Key Points',
    description: 'Extracts the most important points and highlights',
    systemPrompt: `Identify and extract the key points, important highlights, and main takeaways from the following transcription. Focus on the most significant information that someone should know.

Transcription:
{{TRANSCRIPTION}}

Present the key points in a clear, bullet-point format organized by topic or theme.`,
    isBuiltin: true,
    category: 'General'
  },
  'questions-answers': {
    id: 'questions-answers',
    name: 'Q&A Extraction',
    description: 'Extracts questions asked and answers provided',
    systemPrompt: `Extract all questions and their corresponding answers from the following transcription. Format them as Q&A pairs.

Transcription:
{{TRANSCRIPTION}}

Format the output as:
Q: [Question]
A: [Answer]

Include any follow-up questions and clarifications.`,
    isBuiltin: true,
    category: 'General'
  }
};

class PromptsManager {
  constructor() {
    this.customPrompts = {};
  }

  /**
   * Load custom prompts from storage
   * @returns {Promise<Object>}
   */
  async loadCustomPrompts() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['custom_prompts'], (result) => {
        this.customPrompts = result.custom_prompts || {};
        resolve(this.customPrompts);
      });
    });
  }

  /**
   * Save custom prompts to storage
   * @returns {Promise<void>}
   */
  async saveCustomPrompts() {
    return new Promise((resolve) => {
      chrome.storage.local.set({ custom_prompts: this.customPrompts }, () => {
        console.log('Custom prompts saved');
        resolve();
      });
    });
  }

  /**
   * Get all prompts (built-in + custom)
   * @returns {Promise<Object>}
   */
  async getAllPrompts() {
    await this.loadCustomPrompts();
    return {
      ...BUILTIN_PROMPTS,
      ...this.customPrompts
    };
  }

  /**
   * Get a specific prompt by ID
   * @param {string} id - Prompt ID
   * @returns {Promise<Object|null>}
   */
  async getPrompt(id) {
    const allPrompts = await this.getAllPrompts();
    return allPrompts[id] || null;
  }

  /**
   * Add or update a custom prompt
   * @param {string} id - Prompt ID
   * @param {Object} promptData - Prompt data (name, description, systemPrompt, category)
   * @returns {Promise<void>}
   */
  async savePrompt(id, promptData) {
    if (BUILTIN_PROMPTS[id]) {
      throw new Error('Cannot modify built-in prompts');
    }

    await this.loadCustomPrompts();

    this.customPrompts[id] = {
      id,
      name: promptData.name,
      description: promptData.description,
      systemPrompt: promptData.systemPrompt,
      category: promptData.category || 'Custom',
      isBuiltin: false,
      createdAt: this.customPrompts[id]?.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    await this.saveCustomPrompts();
  }

  /**
   * Delete a custom prompt
   * @param {string} id - Prompt ID
   * @returns {Promise<void>}
   */
  async deletePrompt(id) {
    if (BUILTIN_PROMPTS[id]) {
      throw new Error('Cannot delete built-in prompts');
    }

    await this.loadCustomPrompts();
    delete this.customPrompts[id];
    await this.saveCustomPrompts();
  }

  /**
   * Get prompts organized by category
   * @returns {Promise<Object>}
   */
  async getPromptsByCategory() {
    const allPrompts = await this.getAllPrompts();
    const categories = {};

    Object.values(allPrompts).forEach(prompt => {
      const category = prompt.category || 'Uncategorized';
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(prompt);
    });

    return categories;
  }

  /**
   * Apply transcription to prompt template
   * @param {string} promptId - Prompt ID
   * @param {string} transcription - Transcription text
   * @returns {Promise<string>}
   */
  async applyTranscription(promptId, transcription) {
    const prompt = await this.getPrompt(promptId);
    if (!prompt) {
      throw new Error(`Prompt ${promptId} not found`);
    }

    return prompt.systemPrompt.replace(/\{\{TRANSCRIPTION\}\}/g, transcription);
  }

  /**
   * Export custom prompts as JSON
   * @returns {Promise<string>}
   */
  async exportPrompts() {
    await this.loadCustomPrompts();
    return JSON.stringify(this.customPrompts, null, 2);
  }

  /**
   * Import custom prompts from JSON
   * @param {string} jsonString - JSON string of prompts
   * @returns {Promise<void>}
   */
  async importPrompts(jsonString) {
    try {
      const importedPrompts = JSON.parse(jsonString);
      await this.loadCustomPrompts();

      // Merge imported prompts, avoiding built-in IDs
      Object.entries(importedPrompts).forEach(([id, prompt]) => {
        if (!BUILTIN_PROMPTS[id]) {
          this.customPrompts[id] = {
            ...prompt,
            id,
            isBuiltin: false,
            importedAt: Date.now()
          };
        }
      });

      await this.saveCustomPrompts();
    } catch (error) {
      throw new Error('Invalid prompts JSON: ' + error.message);
    }
  }
}

// Create singleton instance
const promptsManager = new PromptsManager();

export default promptsManager;
export { BUILTIN_PROMPTS };
