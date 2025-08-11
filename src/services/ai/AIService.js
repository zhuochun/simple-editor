export const AI_SERVICE_CONFIG = {
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

const NONE_TEXT = 'None';
const CARD_SEPARATOR = '\n\n---\n\n';

export default class AIService {
    constructor(dataService, initialSettings = { providerUrl: '', modelName: '', apiKey: '', temperature: '', isValid: false }) {
        this.dataService = dataService;
        this.aiSettings = initialSettings;
        this.uiElements = {};
    }

    // --- Settings Management ---
    loadAiSettings() {
        const storedSettings = localStorage.getItem(AI_SERVICE_CONFIG.STORAGE_KEY_AI_SETTINGS);
        if (storedSettings) {
            try {
                this.aiSettings = JSON.parse(storedSettings);
                this.aiSettings.providerUrl = this.aiSettings.providerUrl || '';
                this.aiSettings.modelName = this.aiSettings.modelName || '';
                this.aiSettings.apiKey = this.aiSettings.apiKey || '';
                this.aiSettings.temperature = this.aiSettings.temperature || '';
            } catch (e) {
                console.error("Error parsing AI settings from localStorage:", e);
                this.aiSettings = { providerUrl: '', modelName: '', apiKey: '', temperature: '' };
            }
        } else {
            this.aiSettings = { providerUrl: '', modelName: '', apiKey: '', temperature: '' };
        }
        this.aiSettings.isValid = !!(this.aiSettings.providerUrl && this.aiSettings.modelName && this.aiSettings.apiKey);
    }

    saveAiSettings() {
        localStorage.setItem(AI_SERVICE_CONFIG.STORAGE_KEY_AI_SETTINGS, JSON.stringify({
            providerUrl: this.aiSettings.providerUrl,
            modelName: this.aiSettings.modelName,
            apiKey: this.aiSettings.apiKey,
            temperature: this.aiSettings.temperature
        }));
        this.aiSettings.isValid = !!(this.aiSettings.providerUrl && this.aiSettings.modelName && this.aiSettings.apiKey);
        if (typeof this.uiElements.updateAiFeatureVisibilityCallback === 'function') {
            this.uiElements.updateAiFeatureVisibilityCallback(this.aiSettings.isValid);
        }
        this.updateAiSettingsUI();
    }

    updateAiSettingsUI() {
        if (!this.uiElements.providerUrlInput || !this.uiElements.modelNameInput || !this.uiElements.apiKeyInput || !this.uiElements.titleElement || !this.uiElements.temperatureInput) {
            console.warn("AI Settings UI elements not initialized.");
            return;
        }
        this.uiElements.providerUrlInput.dataset.value = this.aiSettings.providerUrl || '';
        this.uiElements.modelNameInput.dataset.value = this.aiSettings.modelName || '';
        this.uiElements.apiKeyInput.dataset.value = this.aiSettings.apiKey || '';
        if (this.uiElements.temperatureInput) {
            this.uiElements.temperatureInput.dataset.value = this.aiSettings.temperature || '';
            this.uiElements.temperatureInput.value = this.aiSettings.temperature || '';
        }

        this.uiElements.providerUrlInput.value = this.aiSettings.providerUrl ? '******' : '';
        this.uiElements.modelNameInput.value = this.aiSettings.modelName ? '******' : '';
        this.uiElements.apiKeyInput.value = this.aiSettings.apiKey ? '******' : '';
        this.uiElements.titleElement.classList.toggle('ready', this.aiSettings.isValid);
    }

    handleAiInputFocus(event) {
        const input = event.target;
        input.type = 'text';
        input.value = input.dataset.value || '';
    }

    handleAiInputBlur(event) {
        const input = event.target;
        const key = input.id === 'ai-provider-url' ? 'providerUrl'
            : input.id === 'ai-model-name' ? 'modelName'
            : input.id === 'ai-api-key' ? 'apiKey'
            : input.id === 'ai-temperature' ? 'temperature' : null;

        if (key) {
            this.aiSettings[key] = input.value;
            input.dataset.value = input.value;
        }

        if (input.id !== 'ai-temperature') {
            if (input.value) {
                input.type = 'password';
                input.value = '******';
            } else {
                input.type = 'text';
                input.value = '';
            }
        }
        this.saveAiSettings();
    }

    initializeAiSettings(elements) {
        this.uiElements = elements;
        this.loadAiSettings();
        this.updateAiSettingsUI();

        if (!this.uiElements.providerUrlInput || !this.uiElements.modelNameInput || !this.uiElements.apiKeyInput) {
            console.error("Missing AI input elements during initialization.");
            return;
        }

        this.uiElements.providerUrlInput.addEventListener('focus', this.handleAiInputFocus.bind(this));
        this.uiElements.providerUrlInput.addEventListener('blur', this.handleAiInputBlur.bind(this));
        this.uiElements.modelNameInput.addEventListener('focus', this.handleAiInputFocus.bind(this));
        this.uiElements.modelNameInput.addEventListener('blur', this.handleAiInputBlur.bind(this));
        this.uiElements.apiKeyInput.addEventListener('focus', this.handleAiInputFocus.bind(this));
        this.uiElements.apiKeyInput.addEventListener('blur', this.handleAiInputBlur.bind(this));
        if (this.uiElements.temperatureInput) {
            this.uiElements.temperatureInput.addEventListener('focus', this.handleAiInputFocus.bind(this));
            this.uiElements.temperatureInput.addEventListener('blur', this.handleAiInputBlur.bind(this));
        }

        if (typeof this.uiElements.updateAiFeatureVisibilityCallback === 'function') {
            this.uiElements.updateAiFeatureVisibilityCallback(this.aiSettings.isValid);
        }
    }

    areAiSettingsValid() {
        return this.aiSettings.isValid;
    }

    // --- Core API Call ---
    async streamChatCompletion({ messages, onChunk, onError, onDone }) {
        if (!this.aiSettings.isValid) {
            onError(new Error("AI settings are incomplete. Please configure them in the sidebar."));
            return;
        }
        try {
            const response = await fetch(this.aiSettings.providerUrl, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${this.aiSettings.apiKey}`,
                    "HTTP-Referer": AI_SERVICE_CONFIG.SITE_URL,
                    "X-Title": AI_SERVICE_CONFIG.SITE_NAME,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: this.aiSettings.modelName,
                    messages: messages,
                    stream: true,
                    ...(this.aiSettings.temperature ? { temperature: parseFloat(this.aiSettings.temperature) } : {})
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
            let contentAccumulator = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                let lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataStr = line.substring(6).trim();
                        if (dataStr === '[DONE]') {
                            break;
                        }
                        try {
                            const data = JSON.parse(dataStr);
                            const delta = data.choices?.[0]?.delta?.content;
                            if (delta) {
                                contentAccumulator += delta;
                                onChunk(delta);
                            }
                        } catch (e) {
                            console.warn("Error parsing stream chunk:", e, "Data:", dataStr);
                        }
                    }
                }
            }
            onDone(contentAccumulator);
        } catch (error) {
            console.error("AI Service Error:", error);
            onError(error);
        }
    }

    // --- Helper Function for Context Gathering ---
    _getCardContext(card) {
        const context = {
            globalPrompt: this.dataService.getGlobalPromptData() || NONE_TEXT,
            columnPrompt: this.dataService.getColumnData(card.columnIndex)?.prompt || NONE_TEXT,
            parentCardContent: NONE_TEXT,
            currentCardContent: card.content || '',
            precedingSiblingsContent: NONE_TEXT,
            followingSiblingsContent: NONE_TEXT,
            existingChildrenContent: NONE_TEXT,
            targetColumnPrompt: NONE_TEXT,
        };

        const parentCard = card.parentId ? this.dataService.getCard(card.parentId) : null;
        context.parentCardContent = parentCard?.content || `${NONE_TEXT} (This is a root card)`;

        const siblings = this.dataService.getSiblingCards(card.id);
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

        const childCards = this.dataService.getChildCards(card.id, card.columnIndex + 1);
        context.existingChildrenContent = childCards
            .filter(c => c.content && c.content.trim())
            .map(c => c.content.trim())
            .join(CARD_SEPARATOR) || NONE_TEXT;

        context.targetColumnPrompt = this.dataService.getColumnData(card.columnIndex + 1)?.prompt || NONE_TEXT;
        return context;
    }

    // --- AI Generation Functions ---
    generateContinuation({ card, onChunk, onError, onDone }) {
        const messages = [{ role: "system", content: AI_SERVICE_CONFIG.AI_SYSTEM_PROMPT }];
        const context = this._getCardContext(card);
        let userPromptContent = `# Overall Document Context

${context.globalPrompt}

# Current Column Context

${context.columnPrompt}

# Hierarchical Context (Upwards and Sideways)

## Parent Card Content

${context.parentCardContent}

## Preceding Sibling Cards Content

${context.precedingSiblingsContent}

# Anchor Card Content (The card to continue FROM)

${context.currentCardContent}

## Task: Generate Next Sibling Card

Based on all the provided context, generate the text content for the *single next card* that should logically follow the "Anchor Card Content". This new card will be placed immediately after the anchor card, within the same column and under the same parent (as its next sibling).

Focus on:
- **Direct Continuation:** Seamlessly continue the thought, narrative, argument, or sequence presented in the "Anchor Card Content".
- **Local Coherence:** Ensure the new card flows logically from the "Anchor Card Content" and maintains consistency with the "Preceding Sibling Cards Content".
- **Hierarchical Relevance:** The content should remain relevant to the "Parent Card Content".
- **Style Consistency:** Analyze and **strictly mimic the existing writing style** (considering tone, voice, vocabulary, sentence complexity, formality, pacing, etc.) evident in the Parent Card, Preceding Sibling Cards, and *especially* the Anchor Card Content. The goal is seamless stylistic integration.
- **Adherence to Guidelines:** Follow any specific instructions or constraints mentioned in the Global and Column Prompts.
- **Output:** Generate *only* the plain text content for the new card. Do not include any introductions, explanations, or formatting.`;
        messages.push({ role: "user", content: userPromptContent });
        this.streamChatCompletion({ messages, onChunk, onError, onDone });
    }

    generateSummary({ card, onChunk, onError, onDone }) {
        const messages = [{ role: "system", content: AI_SERVICE_CONFIG.AI_SYSTEM_PROMPT }];
        const context = this._getCardContext(card);
        let userPromptContent = `# Overall Document Context

${context.globalPrompt}

# Current Column Context

${context.columnPrompt}

# Hierarchical Context (Upwards and Sideways)

## Parent Card Content

${context.parentCardContent}

## Sibling Cards Content

${context.precedingSiblingsContent}

${context.followingSiblingsContent}

# Current Card Content (Target for Summary)

${context.currentCardContent}

# Task: Summarize Current Card

Provide a concise summary of the "Current Card Content" in plain text. Maintain coherence with the surrounding context.`;
        messages.push({ role: "user", content: userPromptContent });
        this.streamChatCompletion({ messages, onChunk, onError, onDone });
    }

    generateBreakdown({ card, onChunk, onError, onDone }) {
        const messages = [{ role: "system", content: AI_SERVICE_CONFIG.AI_SYSTEM_PROMPT }];
        const context = this._getCardContext(card);
        let userPromptContent = `# Overall Document Context

${context.globalPrompt}

# Current Column Context

${context.columnPrompt}

# Hierarchical Context (Upwards and Sideways)

## Parent Card Content

${context.parentCardContent}

## Existing Child Cards Content

${context.existingChildrenContent}

# Current Card Content (Topic to Break Down)

${context.currentCardContent}

# Task: Brainstorm Child Cards

Generate multiple distinct ideas or subtopics that expand on the "Current Card Content". Each idea should be suitable as the content of a new child card in the next column. Separate each idea with "---".`;
        messages.push({ role: "user", content: userPromptContent });
        this.streamChatCompletion({ messages, onChunk, onError, onDone });
    }

    generateExpand({ card, onChunk, onError, onDone }) {
        const messages = [{ role: "system", content: AI_SERVICE_CONFIG.AI_SYSTEM_PROMPT }];
        const context = this._getCardContext(card);
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

# Original Card Content (The card to enrich)

${context.currentCardContent}

# Existing Child Cards Content (of the Original Card)

${context.existingChildrenContent}

# Task: Enrich Original Card

Rewrite the "Original Card Content" to create a **significantly longer and more detailed version**. The goal is to enhance and expand upon the existing ideas within the scope of this single card.

Focus on:
- **Adding Depth:** Incorporate relevant supporting details, examples, explanations, descriptions, definitions, context, or narrative elements that elaborate on the original points.
- **Maintaining Focus:** Ensure all added content directly relates to and expands upon the core subject matter established in the "Original Card Content". Do not introduce entirely new, unrelated topics.
- **Coherence & Flow:** The enriched content must remain consistent with the "Parent Card Content" and the overall document context (Global/Column Prompts). It should also flow logically *from* the "Preceding Sibling Cards Content" and provide a smooth transition *towards* the "Following Sibling Cards Content" (if it exists).
- **Supporting Children:** If "Existing Child Cards Content" is provided, the enriched version should ideally provide a stronger foundation or smoother transition into those child topics.
- **Writing Style:** Analyze and maintain the established writing style (tone, voice, vocabulary, formality) evident in the surrounding context (Parent, Siblings, Original Content), unless specific style instructions exist in the prompts.
- **Direct Output:** Output *only* the complete, enriched text intended to replace the original content of the current card. Do not include introductions, summaries, or the original text unless it's part of the rewritten version.`;
        messages.push({ role: "user", content: userPromptContent });
        this.streamChatCompletion({ messages, onChunk, onError, onDone });
    }

    generateCustom({ card, userPrompt, onChunk, onError, onDone }) {
        const messages = [{ role: "system", content: AI_SERVICE_CONFIG.AI_SYSTEM_PROMPT }];
        const context = this._getCardContext(card);
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

# Current Card Content (Primary Subject Card)

${context.currentCardContent}

# Existing Child Cards Content

${context.existingChildrenContent}

# User's Custom Instruction

${userPrompt}

# Task: Execute Custom Instruction

Carefully analyze the "User's Custom Instruction" and execute it based on the "Current Card Content" and all the surrounding context provided.

Focus on:
- **Understanding Intent:** Interpret the "User's Custom Instruction" accurately within the provided context.
- **Applying Instruction:** Apply the instruction primarily to the "Current Card Content" unless the request clearly specifies otherwise (e.g., comparing it to siblings, summarizing children, generating new related cards).
- **Contextual Consistency:** Ensure the output remains coherent with the Parent, Siblings, Children, and Global/Column Prompts, *unless* the "User's Custom Instruction" explicitly requires deviation (e.g., "rewrite this in a completely different style," "find contradictions with the parent card").
- **Style Adherence:** Maintain the established writing style found in the context, unless the "User's Custom Instruction" specifies a change.
- **Output Format:**
    - Generate plain text only.
    - If the request implies modifying the current card (e.g., "rewrite," "shorten," "add examples to this"), output the complete new text intended to replace the "Current Card Content".
    - If the request asks for analysis, information, or suggestions *about* the card, provide that information directly.
    - If the request explicitly asks for *multiple new cards* (e.g., "generate 3 alternative versions," "break this down into steps as new cards"), use "---" on a new line to separate the content intended for each distinct card/output unit.
    - Follow any specific output formatting instructions within the "User's Custom Instruction".
- **Direct Output:** Avoid conversational wrappers unless the request specifically asks for a dialogue or explanation.`;
        messages.push({ role: "user", content: userPromptContent });
        this.streamChatCompletion({ messages, onChunk, onError, onDone });
    }
}
