const AI_SERVICE_CONFIG = {
    SITE_URL: "https://www.bicrement.com/simple-editor/", // Or your deployed URL
    SITE_NAME: "Bicrement Writing Tool",
    STORAGE_KEY_AI_SETTINGS: 'writingToolAiSettings',
    AI_SYSTEM_PROMPT: `You are an AI writing partner specialized for a column-based, hierarchical card writing tool. This tool uses a multi-column layout where users build complex documents by organizing text into discrete, editable cards.

Key Concepts You Must Understand:
- **Structure:** Content is a tree hierarchy. Cards are organized visually across columns. Column 1 contains root cards; subsequent columns contain children.
- **Cards:** Each card is a self-contained unit of text.
- **Relationships:** Cards have parents (in the previous column), children (in the next column), siblings (in the same group/column, sharing a parent), ancestors, and descendants.
- **Your Goal:** Generate text content specifically intended to populate one or more cards based on user prompts and the surrounding hierarchical context. Assist with brainstorming, drafting, expanding, or structuring ideas *within this card system*.

Operational Guidelines:
- **Card Focus:** Think in terms of modular content units. Your output should be directly usable as the text content of one or more cards.
- **Plain Text Output:** Generate only plain text. No bolding, italics, etc.
- **Direct Content:** Provide only the requested card content. Omit greetings, explanations, or conversational wrappers.
- **Multi-Card Separator:** If a response requires content for multiple cards, separate the content for each card with "---" on its own line. The content before the first "---" is for the first card, the content between the first and second "---" is for the second card, and so on.

Maintain clarity, coherence, and consistency, always respecting the discrete, card-based nature of the writing environment.`
};

import * as data from './data.js'; // Import data module

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

function generateContinuation({ card, onChunk, onError, onDone }) { // Accept card object
    const messages = [{ role: "system", content: AI_SERVICE_CONFIG.AI_SYSTEM_PROMPT }];

    // Card object is passed directly, no need to fetch
    if (!card) {
        onError(new Error(`Invalid card object provided for continuation.`));
        return;
    }

    const globalPrompt = data.getColumnData(0)?.prompt || 'None';
    const columnPrompt = data.getColumnData(card.columnIndex)?.prompt || 'None'; // Use card.columnIndex
    const parentCard = card.parentId ? data.getCard(card.parentId) : null; // Still need to fetch parent
    const parentCardContent = parentCard?.content || 'None (This is a root card)';
    const currentCardContent = card.content || ''; // Use card.content

    const siblings = data.getSiblingCards(card.id); // Use card.id
    const cardsAbove = siblings.filter(c => c.order < card.order); // Use card.order
    // Filter for non-empty trimmed content before mapping and joining
    const cardsAboveContent = cardsAbove
        .filter(c => c.content && c.content.trim())
        .map(c => c.content.trim())
        .join('\n\n---\n\n') || 'None';

    // Construct the prompt
    let userPromptContent = `## Overall Document Context\n\n${globalPrompt}\n\n`;
    userPromptContent += `## Current Column Context\n\n${columnPrompt}\n\n`;
    userPromptContent += `## Parent Card Content (Hierarchical Context)\n\n${parentCardContent}\n\n`;
    userPromptContent += `## Preceding Sibling Cards Content (Sequence Context)\n\n${cardsAboveContent}\n\n`;
    userPromptContent += `## Current Card Content (The anchor to continue from)\n\n${currentCardContent}\n\n`;
    userPromptContent += `## Task

Based on all the provided context, generate the text content for the *single next card* that should logically follow the "Current Card Content".
This new card will be placed immediately after the current card, within the same column and under the same parent (as the next sibling).

Focus on:
- Directly continuing the thought, topic, or sequence from the "Current Card Content".
- Maintaining coherence with the "Preceding Sibling Cards Content" and the "Parent Card Content".
- Adhere to any explicit style guidelines specified in the Global or Column Prompts. Crucially, analyze and **mimic the existing writing style** (considering aspects like tone, voice, vocabulary, sentence structure, formality, pacing, etc.) evident in the Parent Card, Preceding Sibling Cards, and *especially* the Current Card Content. The goal is seamless stylistic consistency.
- Adhering to any other relevant instructions in the Global and Column Prompts.
- Output *only* the text for the new card.
`;

    messages.push({ role: "user", content: userPromptContent });

    streamChatCompletion({ messages, onChunk, onError, onDone });
}

function generateBreakdown({ card, onChunk, onError, onDone }) { // Accept card object
    const messages = [{ role: "system", content: AI_SERVICE_CONFIG.AI_SYSTEM_PROMPT }];

    // Card object is passed directly, no need to fetch
    if (!card) {
        onError(new Error(`Invalid card object provided for breakdown.`));
        return;
    }

    const globalPrompt = data.getColumnData(0)?.prompt || 'None';
    const sourceColumnPrompt = data.getColumnData(card.columnIndex)?.prompt || 'None'; // Use card.columnIndex
    const parentCard = card.parentId ? data.getCard(card.parentId) : null; // Still need to fetch parent
    const parentCardContent = parentCard?.content || 'None (Source Card is a root card)';
    const currentCardContent = card.content || ''; // Use card.content

    const childCards = data.getChildCards(card.id, card.columnIndex + 1); // Use card.id, card.columnIndex
    // Filter for non-empty trimmed content before mapping and joining
    const existingChildrenContent = childCards
        .filter(c => c.content && c.content.trim())
        .map(c => c.content.trim())
        .join('\n\n---\n\n') || 'None';

    const targetColumnPrompt = data.getColumnData(card.columnIndex + 1)?.prompt || 'None'; // Use card.columnIndex

    // Construct the prompt
    let userPromptContent = `# Overall Document Context\nGlobal Prompt: ${globalPrompt}\n\n`;
    userPromptContent += `# Source Card's Column Context\nSource Column Prompt: ${sourceColumnPrompt}\n\n`;
    userPromptContent += `# Hierarchical Context\nGrandparent Card Content (Parent of the Source Card):\n${parentCardContent}\n\n`;
    userPromptContent += `# Source Card (The card to brainstorm FROM)\nSource Card Content:\n${currentCardContent}\n\n`;
    userPromptContent += `# Existing Children Context (Current children of the Source Card)\nExisting Child Cards Content:\n${existingChildrenContent}\n\n`;
    userPromptContent += `# Target Column Context (Where the new child cards will be placed)\nTarget Column Prompt: ${targetColumnPrompt}\n\n`;
    userPromptContent += `# Task\n\nBased on the "Source Card Content" and all the provided context, brainstorm and generate the text content for *multiple new child cards*. These new cards will be placed in the next column (Target Column) as direct children of the Source Card.\n\nFocus on:\n- Generating distinct ideas or sub-topics derived from the "Source Card Content".\n- Ensuring each new child card logically follows from the Source Card.\n- Maintaining coherence with the overall document structure and prompts (Global, Source Column, Target Column).\n- Considering the "Existing Child Cards Content" to avoid redundancy and potentially build upon them or explore different facets.\n- Adhering to any relevant style or content instructions in the prompts.\n- Output *only* the text for the new child cards. Separate the content for each new card with "---" on its own line.`;

    messages.push({ role: "user", content: userPromptContent });

    streamChatCompletion({ messages, onChunk, onError, onDone });
}

function generateExpand({ card, onChunk, onError, onDone }) { // Accept card object
    const messages = [{ role: "system", content: AI_SERVICE_CONFIG.AI_SYSTEM_PROMPT }];

    // Card object is passed directly
    if (!card) {
        onError(new Error(`Invalid card object provided for expand.`));
        return;
    }

    // Fetch context
    const globalPrompt = data.getColumnData(0)?.prompt || 'None';
    const columnPrompt = data.getColumnData(card.columnIndex)?.prompt || 'None';
    const parentCard = card.parentId ? data.getCard(card.parentId) : null;
    const parentCardContent = parentCard?.content || 'None (This is a root card)';
    const currentCardContent = card.content || '';

    const siblings = data.getSiblingCards(card.id);
    const precedingSiblings = siblings.filter(c => c.order < card.order);
    const followingSiblings = siblings.filter(c => c.order > card.order);

    const precedingSiblingsContent = precedingSiblings
        .filter(c => c.content && c.content.trim())
        .map(c => c.content.trim())
        .join('\n\n---\n\n') || 'None';

    const followingSiblingsContent = followingSiblings
        .filter(c => c.content && c.content.trim())
        .map(c => c.content.trim())
        .join('\n\n---\n\n') || 'None';

    const childCards = data.getChildCards(card.id, card.columnIndex + 1);
    const existingChildrenContent = childCards
        .filter(c => c.content && c.content.trim())
        .map(c => c.content.trim())
        .join('\n\n---\n\n') || 'None';

    // Construct the prompt
    let userPromptContent = `# Overall Document Context\nGlobal Prompt: ${globalPrompt}\n\n`;
    userPromptContent += `# Current Column Context\nColumn Prompt: ${columnPrompt}\n\n`;
    userPromptContent += `# Hierarchical Context (Upwards and Sideways)\nParent Card Content:\n${parentCardContent}\n\n`;
    userPromptContent += `Preceding Sibling Cards Content:\n${precedingSiblingsContent}\n\n`;
    userPromptContent += `Following Sibling Cards Content:\n${followingSiblingsContent}\n\n`;
    userPromptContent += `# Card to Enrich (The Original Content)\nCurrent Card Content (Original):\n${currentCardContent}\n\n`;
    userPromptContent += `# Hierarchical Context (Downwards)\nExisting Child Cards Content:\n${existingChildrenContent}\n\n`;
    userPromptContent += `# Task\n\nBased on the "Current Card Content (Original)" and all the surrounding context (prompts, parent, siblings, children), generate the text content for a *single new child card*. This new card should be a significantly enriched and expanded version of the "Current Card Content (Original)".\n\nFocus on:\n- Elaborating on the ideas presented in the original card.\n- Adding relevant details, examples, explanations, or descriptions.\n- Maintaining coherence with all provided context (parent, siblings, children, prompts).\n- Ensuring the new card logically follows as a detailed exploration of the original card's topic.\n- Adhering to any relevant style or content instructions in the prompts.\n- Output *only* the text for the new, expanded child card.`;

    messages.push({ role: "user", content: userPromptContent });

    streamChatCompletion({ messages, onChunk, onError, onDone });
}

function generateCustom({ cardContent, userPrompt, onChunk, onError, onDone }) {
    const messages = [{ role: "system", content: AI_SERVICE_CONFIG.AI_SYSTEM_PROMPT }];
    const userPromptContent = `## Current Card\n\n${cardContent}\n\n## Instruction\n\n${userPrompt}`;
    messages.push({ role: "user", content: userPromptContent });

    streamChatCompletion({ messages, onChunk, onError, onDone });
}


// Export functions or the service object if preferred
export const aiService = {
    initializeAiSettings,
    areAiSettingsValid,
    generateContinuation,
    generateBreakdown,
    generateExpand,
    generateCustom
};
