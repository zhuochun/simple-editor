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

// --- Constants ---
const NONE_TEXT = 'None';
const CARD_SEPARATOR = '\n\n---\n\n';

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

// --- Helper Function for Context Gathering ---

/**
 * Gathers context strings for a given card.
 * @param {object} card - The card object.
 * @returns {object} An object containing various context strings.
 */
function _getCardContext(card) {
    const context = {
        globalPrompt: data.getColumnData(0)?.prompt || NONE_TEXT,
        columnPrompt: data.getColumnData(card.columnIndex)?.prompt || NONE_TEXT,
        parentCardContent: NONE_TEXT,
        currentCardContent: card.content || '',
        precedingSiblingsContent: NONE_TEXT,
        followingSiblingsContent: NONE_TEXT,
        existingChildrenContent: NONE_TEXT,
        targetColumnPrompt: NONE_TEXT,
    };

    // Parent Context
    const parentCard = card.parentId ? data.getCard(card.parentId) : null;
    context.parentCardContent = parentCard?.content || `${NONE_TEXT} (This is a root card)`;

    // Sibling Context
    const siblings = data.getSiblingCards(card.id);
    const precedingSiblings = siblings.filter(c => c.order < card.order);
    const followingSiblings = siblings.filter(c => c.order > card.order);

    context.precedingSiblingsContent = precedingSiblings
        .filter(c => c.content && c.content.trim())
        .map(c => c.content.trim())
        .join(CARD_SEPARATOR) || NONE_TEXT;

    context.followingSiblingsContent = followingSiblings
        .filter(c => c.content && c.content.trim())
        .map(c => c.content.trim())
        .join(CARD_SEPARATOR) || NONE_TEXT;

    // Child Context
    const childCards = data.getChildCards(card.id, card.columnIndex + 1);
    context.existingChildrenContent = childCards
        .filter(c => c.content && c.content.trim())
        .map(c => c.content.trim())
        .join(CARD_SEPARATOR) || NONE_TEXT;

    // Target Column Prompt (for next column)
    context.targetColumnPrompt = data.getColumnData(card.columnIndex + 1)?.prompt || NONE_TEXT;

    return context;
}


// --- AI Generation Functions ---

function generateContinuation({ card, onChunk, onError, onDone }) {
    const messages = [{ role: "system", content: AI_SERVICE_CONFIG.AI_SYSTEM_PROMPT }];
    const context = _getCardContext(card);

    // Construct the prompt using fetched context
    let userPromptContent = `# Overall Document Context

${context.globalPrompt}

# Current Column Context

${context.columnPrompt}

# Hierarchical Context -- Parent Card Content

${context.parentCardContent}

# Sequence Context (Cards preceding the current one under the same parent) -- Preceding Sibling Cards Content

${context.precedingSiblingsContent}

# Anchor Card (The card to continue FROM) -- Current Card Content

${context.currentCardContent}

## Task

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

function generateBreakdown({ card, onChunk, onError, onDone }) {
    const messages = [{ role: "system", content: AI_SERVICE_CONFIG.AI_SYSTEM_PROMPT }];
    const context = _getCardContext(card);

    // Construct the prompt using fetched context
    let userPromptContent = `# Overall Document Context

${context.globalPrompt}

# Source Card's Column Context

${context.columnPrompt}

# Hierarchical Context -- Grandparent Card Content (Parent of the Source Card)

${context.parentCardContent}

# Source Card (The card to brainstorm FROM) -- Source Card Content

${context.currentCardContent}

# Existing Children Context (Current children of the Source Card) -- Existing Child Cards Content

${context.existingChildrenContent}

# Target Column Context (Where the new child cards will be placed)

${context.targetColumnPrompt}

# Task: Brainstorm Child Cards

Based on the "Source Card Content" and all provided context, brainstorm and generate the text content for **multiple distinct child cards**.

Focus on:
- **Elaboration/Decomposition:** Each generated child card should explore, detail, break down, or provide examples/evidence related to a specific aspect of the "Source Card Content".
- **Relevance & Coherence:** Ideas must be directly relevant to the Source Card and coherent with the Grandparent Card content and any specified Global/Column Prompts.
- **Novelty (Consider Existing Children):** Aim to generate *new* insights or directions that complement or logically follow any "Existing Child Cards Content", rather than repeating them. If no children exist, generate foundational ideas.
- **Adherence to Target Context:** Pay close attention to the "Target Column Prompt" if provided, as it may dictate the specific *purpose* or *type* of child cards required (e.g., arguments, steps, examples).
- **Writing Style:** Maintain a style consistent with the Source Card and any overarching style guides (Global/Column Prompts), unless the Target Column Prompt suggests a different style for the children.
- **Output Format:** Generate content for **each** proposed child card separately. Use "---" on a new line as a delimiter between the content for each distinct child card idea.
- **Direct Output:** Output *only* the text for the new cards, separated by "---". Do not include introductions or summaries.
`;

    messages.push({ role: "user", content: userPromptContent });

    streamChatCompletion({ messages, onChunk, onError, onDone });
}

function generateExpand({ card, onChunk, onError, onDone }) {
    const messages = [{ role: "system", content: AI_SERVICE_CONFIG.AI_SYSTEM_PROMPT }];
    const context = _getCardContext(card);

    // Construct the prompt using fetched context
    let userPromptContent = `# Overall Document Context

${context.globalPrompt}

# Current Column Context

${context.columnPrompt}

# Hierarchical Context (Upwards and Sideways)

## Parent Card Content

${context.parentCardContent}

## Preceding Sibling Cards Content

${context.precedingSiblingsContent}

## Following Sibling Cards Content

${context.followingSiblingsContent}

# Card to Enrich (The Original Content) -- Current Card Content (Original)

${context.currentCardContent}

# Hierarchical Context (Downwards) -- Existing Child Cards Content

${context.existingChildrenContent}

# Task: Enrich Current Card

Rewrite the "Current Card Content (Original)" to create a **significantly longer and more detailed version**. The goal is to enhance and expand upon the existing ideas within the scope of this single card.

Focus on:
- **Adding Depth:** Incorporate relevant supporting details, examples, explanations, descriptions, definitions, context, or narrative elements that elaborate on the original points.
- **Maintaining Focus:** Ensure all added content directly relates to and expands upon the core subject matter established in the "Current Card Content (Original)". Do not introduce entirely new, unrelated topics.
- **Coherence & Flow:** The enriched content must remain consistent with the "Parent Card Content" and the overall document context (Global/Column Prompts). It should also flow logically *from* the "Preceding Sibling Cards Content" and provide a smooth transition *towards* the "Following Sibling Cards Content" (if it exists).
- **Supporting Children:** If "Existing Child Cards Content" is provided, the enriched version should ideally provide a stronger foundation or smoother transition into those child topics.
- **Writing Style:** Analyze and maintain the established writing style (tone, voice, vocabulary, formality) evident in the surrounding context (Parent, Siblings, Original Content), unless specific style instructions exist in the prompts.
- **Direct Output:** Output *only* the complete, enriched text intended to replace the original content of the current card. Do not include introductions, summaries, or the original text unless it's part of the rewritten version.
`;

    messages.push({ role: "user", content: userPromptContent });

    streamChatCompletion({ messages, onChunk, onError, onDone });
}

function generateCustom({ card, userPrompt, onChunk, onError, onDone }) {
    const messages = [{ role: "system", content: AI_SERVICE_CONFIG.AI_SYSTEM_PROMPT }];
    const context = _getCardContext(card);

    // Construct the prompt using fetched context and the user's specific request
    let userPromptContent = `# Overall Document Context

${context.globalPrompt}

# Current Column Context

${context.columnPrompt}

# Hierarchical Context (Upwards and Sideways)

## Parent Card Content

${context.parentCardContent}

## Preceding Sibling Cards Content

${context.precedingSiblingsContent}

## Following Sibling Cards Content

${context.followingSiblingsContent}

# Primary Subject Card -- Current Card Content

${context.currentCardContent}

# Hierarchical Context (Downwards) -- Existing Child Cards Content

${context.existingChildrenContent}

# User's Custom Instruction

User Request:${userPrompt}

# Task: Execute Custom Instruction

Carefully analyze the "User Request" and execute it based on the "Current Card Content" and all the surrounding context provided.

Focus on:
- **Understanding Intent:** Interpret the "User Request" accurately within the provided context.
- **Applying Instruction:** Apply the instruction primarily to the "Current Card Content" unless the request clearly specifies otherwise (e.g., comparing it to siblings, summarizing children, generating new related cards).
- **Contextual Consistency:** Ensure the output remains coherent with the Parent, Siblings, Children, and Global/Column Prompts, *unless* the "User Request" explicitly requires deviation (e.g., "rewrite this in a completely different style," "find contradictions with the parent card").
- **Style Adherence:** Maintain the established writing style found in the context, unless the "User Request" specifies a change.
- **Output Format:**
    - Generate plain text only.
    - If the request implies modifying the current card (e.g., "rewrite," "shorten," "add examples to this"), output the complete new text intended to replace the "Current Card Content".
    - If the request asks for analysis, information, or suggestions *about* the card, provide that information directly.
    - If the request explicitly asks for *multiple new cards* (e.g., "generate 3 alternative versions," "break this down into steps as new cards"), use "---" on a new line to separate the content intended for each distinct card/output unit.
    - Follow any specific output formatting instructions within the "User Request".
- **Direct Output:** Avoid conversational wrappers unless the request specifically asks for a dialogue or explanation.
`;

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
