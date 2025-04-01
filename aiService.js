const AI_SERVICE_CONFIG = {
    SITE_URL: "https://www.bicrement.com/simple-editor/", // Or your deployed URL
    SITE_NAME: "Bicrement Writing Tool",
    STORAGE_KEY_AI_SETTINGS: 'writingToolAiSettings',
    AI_SYSTEM_PROMPT: `You are an AI writing assistant embedded in a column-based, hierarchical writing app where content is organized in discrete cards.
Each card represents a unit of content that can be independently created, expanded, or rearranged.
Your role is to help users brainstorm, structure, enrich, refine, and review their writing by generating content that fits within this card-based framework.
Always output in plain text (no markdow format) and output the card content directly without unnecessary explanations or introductions.
When creating multiple cards, clearly separate the cards using "---" as a delimiter.
Stick to the card-based structure and maintain clarity, coherence, and consistency in your responses.`
};

// --- State ---
let aiSettings = { providerUrl: '', modelName: '', apiKey: '', isValid: false }; // Local cache
let uiElements = {}; // To store references to UI elements

// --- Settings Management ---

function loadAiSettings() {
    const storedSettings = localStorage.getItem(AI_SERVICE_CONFIG.STORAGE_KEY_AI_SETTINGS);
    if (storedSettings) {
        try {
            aiSettings = JSON.parse(storedSettings);
            // Ensure structure compatibility
            aiSettings.providerUrl = aiSettings.providerUrl || '';
            aiSettings.modelName = aiSettings.modelName || '';
            aiSettings.apiKey = aiSettings.apiKey || '';
        } catch (e) {
            console.error("Error parsing AI settings from localStorage:", e);
            aiSettings = { providerUrl: '', modelName: '', apiKey: '' };
        }
    } else {
        aiSettings = { providerUrl: '', modelName: '', apiKey: '' };
    }
    aiSettings.isValid = !!(aiSettings.providerUrl && aiSettings.modelName && aiSettings.apiKey);
    console.log("AI Settings Loaded:", aiSettings);
}

function saveAiSettings() {
    // Read directly from cached values updated by blur handler
    localStorage.setItem(AI_SERVICE_CONFIG.STORAGE_KEY_AI_SETTINGS, JSON.stringify({
        providerUrl: aiSettings.providerUrl,
        modelName: aiSettings.modelName,
        apiKey: aiSettings.apiKey
    }));
    aiSettings.isValid = !!(aiSettings.providerUrl && aiSettings.modelName && aiSettings.apiKey);
    // Notify the main script to update UI visibility
    if (typeof uiElements.updateAiFeatureVisibilityCallback === 'function') {
        uiElements.updateAiFeatureVisibilityCallback(aiSettings.isValid);
    }
    // Also update the settings UI itself (specifically the title checkmark)
    updateAiSettingsUI();
    console.log("AI Settings Saved.");
}

function updateAiSettingsUI() {
    if (!uiElements.providerUrlInput || !uiElements.modelNameInput || !uiElements.apiKeyInput || !uiElements.titleElement) {
        console.warn("AI Settings UI elements not initialized.");
        return;
    }
    // Store actual value in data attribute, display masked value
    uiElements.providerUrlInput.dataset.value = aiSettings.providerUrl || '';
    uiElements.modelNameInput.dataset.value = aiSettings.modelName || '';
    uiElements.apiKeyInput.dataset.value = aiSettings.apiKey || '';

    uiElements.providerUrlInput.value = aiSettings.providerUrl ? '******' : '';
    uiElements.modelNameInput.value = aiSettings.modelName ? '******' : '';
    uiElements.apiKeyInput.value = aiSettings.apiKey ? '******' : '';

    // Update title checkmark
    uiElements.titleElement.classList.toggle('ready', aiSettings.isValid);
}

function handleAiInputFocus(event) {
    const input = event.target;
    input.type = 'text'; // Show actual value
    input.value = input.dataset.value || '';
}

function handleAiInputBlur(event) {
    const input = event.target;
    const key = input.id === 'ai-provider-url' ? 'providerUrl' :
                input.id === 'ai-model-name' ? 'modelName' :
                input.id === 'ai-api-key' ? 'apiKey' : null;

    if (key) {
        aiSettings[key] = input.value; // Update local cache
        input.dataset.value = input.value; // Update data-value
    }

    if (input.value) {
        input.type = 'password'; // Mask if not empty
        input.value = '******';
    } else {
        input.type = 'text'; // Keep as text if empty
        input.value = '';
    }
    saveAiSettings(); // Save on blur
}

function initializeAiSettings(elements) {
    uiElements = elements; // Store references { providerUrlInput, modelNameInput, apiKeyInput, titleElement, updateAiFeatureVisibilityCallback }

    loadAiSettings();
    updateAiSettingsUI();

    if (!uiElements.providerUrlInput || !uiElements.modelNameInput || !uiElements.apiKeyInput) {
         console.error("Missing AI input elements during initialization.");
         return;
    }

    uiElements.providerUrlInput.addEventListener('focus', handleAiInputFocus);
    uiElements.providerUrlInput.addEventListener('blur', handleAiInputBlur);
    uiElements.modelNameInput.addEventListener('focus', handleAiInputFocus);
    uiElements.modelNameInput.addEventListener('blur', handleAiInputBlur);
    uiElements.apiKeyInput.addEventListener('focus', handleAiInputFocus);
    uiElements.apiKeyInput.addEventListener('blur', handleAiInputBlur);

    // Initial visibility update
    if (typeof uiElements.updateAiFeatureVisibilityCallback === 'function') {
        uiElements.updateAiFeatureVisibilityCallback(aiSettings.isValid);
    }
}

function areAiSettingsValid() {
    // Check the locally cached settings object after loading/saving
    return aiSettings.isValid;
}

// --- Core API Call ---

async function streamChatCompletion({ messages, onChunk, onError, onDone }) {
    if (!aiSettings.isValid) {
        onError(new Error("AI settings are incomplete. Please configure them in the sidebar."));
        return;
    }

    try {
        // Use the module-level aiSettings cache
        const response = await fetch(aiSettings.providerUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${aiSettings.apiKey}`,
                "HTTP-Referer": AI_SERVICE_CONFIG.SITE_URL,
                "X-Title": AI_SERVICE_CONFIG.SITE_NAME,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: aiSettings.modelName,
                messages: messages,
                stream: true // Enable streaming
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: { message: response.statusText } }));
            throw new Error(`API Error (${response.status}): ${errorData.error?.message || 'Unknown error'}`);
        }

        if (!response.body) {
            throw new Error("Response body is null");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let contentAccumulator = ''; // Accumulate content across chunks

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });

            // Process line by line for SSE
            let lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep the last partial line in buffer

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const dataStr = line.substring(6).trim();
                    if (dataStr === '[DONE]') {
                        break; // Stream finished signal
                    }
                    try {
                        const data = JSON.parse(dataStr);
                        const delta = data.choices?.[0]?.delta?.content;
                        if (delta) {
                            contentAccumulator += delta;
                            onChunk(delta); // Send only the new part
                        }
                    } catch (e) {
                        console.warn("Error parsing stream chunk:", e, "Data:", dataStr);
                        // Continue processing other lines/chunks
                    }
                }
            }
        }
        onDone(contentAccumulator); // Pass the full accumulated content when done

    } catch (error) {
        console.error("AI Service Error:", error);
    onError(error);
    }
}

// --- AI Generation Functions ---

function generateContinuation({ contextText, columnPrompt, onChunk, onError, onDone }) {
    const messages = [{ role: "system", content: AI_SERVICE_CONFIG.AI_SYSTEM_PROMPT }];
    let userPrompt = '';
    if (columnPrompt) {
        userPrompt += `## Author Provided Context\n\n${columnPrompt}`;
    }
    userPrompt += `\n\n## Existing Cards\n\n${contextText}`;
    userPrompt += `\n\n## Instruction\n\nGiven the above context and existing cards, create the next card that logically continues and expands on the sequence.
Ensure continuity, coherence, and clarity in content and structure.`;
    messages.push({ role: "user", content: userPrompt });

    streamChatCompletion({ messages, onChunk, onError, onDone });
}

function generateBreakdown({ cardContent, onChunk, onError, onDone }) {
    const messages = [{ role: "system", content: AI_SERVICE_CONFIG.AI_SYSTEM_PROMPT }];
    messages.push({
        role: "user",
        content: `## Current Card\n\n${cardContent}\n\n## Instruction\n\nExpand the current card by brainstorming multiple child cards.
Each child card should build on the ideas in the current card, remain consistent with the overall context, and offer new insights or directions.
Please clearly separate each card using "---" as a delimiter.`
    });

    streamChatCompletion({ messages, onChunk, onError, onDone });
}

function generateExpand({ cardContent, onChunk, onError, onDone }) {
    const messages = [{ role: "system", content: AI_SERVICE_CONFIG.AI_SYSTEM_PROMPT }];
    messages.push({
        role: "user",
        content: `## Current Card\n\n${cardContent}\n\n## Instruction\n\nEnrich and expand the details of the current card by writing a longer, more detailed version.
Include additional context, descriptive elements, and insights that deepen the narrative while staying true to the overall context.`
    });

    streamChatCompletion({ messages, onChunk, onError, onDone });
}

function generateCustom({ cardContent, userPrompt, onChunk, onError, onDone }) {
    const messages = [{ role: "system", content: AI_SERVICE_CONFIG.AI_SYSTEM_PROMPT }];
    messages.push({
        role: "user",
        content: `## Current Card\n\n${cardContent}\n\n## Instruction\n\n${userPrompt}`
    });

    streamChatCompletion({ messages, onChunk, onError, onDone });
}


// Export functions or the service object if preferred
const aiService = {
    initializeAiSettings,
    areAiSettingsValid,
    generateContinuation,
    generateBreakdown,
    generateExpand,
    generateCustom
};
