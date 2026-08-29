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

// --- Constants ---
const NONE_TEXT = 'None';
const CARD_SEPARATOR = '\n\n---\n\n';
const REQUEST_TIMEOUT_MS = 60_000;
const REASONING_EFFORTS = new Set(['none', 'low', 'medium', 'high', 'xhigh', 'max']);
const PROVIDER_PRESETS = Object.freeze({
    openai: Object.freeze({
        label: 'OpenAI',
        protocol: 'responses',
        providerUrl: 'https://api.openai.com/v1/responses',
        modelName: 'gpt-5.6-sol'
    }),
    openrouter: Object.freeze({
        label: 'OpenRouter',
        protocol: 'chat-completions',
        providerUrl: 'https://openrouter.ai/api/v1/chat/completions',
        modelName: ''
    }),
    custom: Object.freeze({
        label: 'Custom',
        protocol: 'responses',
        providerUrl: '',
        modelName: ''
    })
});

function inferProvider(providerUrl = '') {
    if (!providerUrl) return 'openai';
    if (providerUrl.includes('api.openai.com')) return 'openai';
    if (providerUrl.includes('openrouter.ai')) return 'openrouter';
    return 'custom';
}

function getSettingsValidationError({ providerUrl, modelName, apiKey }) {
    if (!providerUrl) return 'Provider URL is required.';
    let parsedUrl;
    try {
        parsedUrl = new URL(providerUrl);
    } catch {
        return 'Provider URL must be a complete http:// or https:// URL.';
    }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return 'Provider URL must use http:// or https://.';
    }
    if (!modelName) return 'Model is required.';
    if (!apiKey) return 'API key is required.';
    return null;
}

function normalizeAiSettings(settings = {}) {
    const rawUrl = typeof settings.providerUrl === 'string' ? settings.providerUrl.trim() : '';
    const provider = PROVIDER_PRESETS[settings.provider] ? settings.provider : inferProvider(rawUrl);
    const preset = PROVIDER_PRESETS[provider];
    const protocol = settings.protocol === 'chat-completions' || settings.protocol === 'responses'
        ? settings.protocol
        : (provider === 'custom' && !rawUrl.includes('/responses') ? 'chat-completions' : preset.protocol);
    const providerUrl = provider === 'openai'
        ? PROVIDER_PRESETS.openai.providerUrl
        : (provider === 'openrouter' ? PROVIDER_PRESETS.openrouter.providerUrl : rawUrl);
    const modelName = typeof settings.modelName === 'string' && settings.modelName.trim()
        ? settings.modelName.trim()
        : preset.modelName;
    const apiKey = typeof settings.apiKey === 'string' ? settings.apiKey.trim() : '';
    const reasoningEffort = REASONING_EFFORTS.has(settings.reasoningEffort)
        ? settings.reasoningEffort
        : 'medium';
    const normalized = {
        provider,
        protocol: provider === 'openai' ? 'responses' : (provider === 'openrouter' ? 'chat-completions' : protocol),
        providerUrl,
        modelName,
        apiKey,
        reasoningEffort
    };
    return { ...normalized, isValid: getSettingsValidationError(normalized) === null };
}

function createAiError(message, code = 'provider-error') {
    const error = new Error(message);
    error.code = code;
    return error;
}

function buildRequest(settings, messages) {
    const headers = {
        'Authorization': `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json'
    };
    if (settings.provider === 'openrouter') {
        headers['HTTP-Referer'] = AI_SERVICE_CONFIG.SITE_URL;
        headers['X-Title'] = AI_SERVICE_CONFIG.SITE_NAME;
    }

    if (settings.protocol === 'responses') {
        const instructions = messages
            .filter(message => message.role === 'system')
            .map(message => message.content)
            .join('\n\n');
        const input = messages
            .filter(message => message.role !== 'system')
            .map(message => message.content)
            .join('\n\n');
        return {
            headers,
            body: {
                model: settings.modelName,
                instructions,
                input,
                reasoning: { effort: settings.reasoningEffort },
                store: false,
                stream: true
            }
        };
    }

    return {
        headers,
        body: {
            model: settings.modelName,
            messages,
            stream: true
        }
    };
}

function readProviderError(payload, fallback) {
    return payload?.error?.message
        || payload?.response?.error?.message
        || payload?.message
        || fallback;
}

function createAiService({
    storage = globalThis.localStorage,
    fetchImpl = globalThis.fetch,
    setTimeoutImpl = globalThis.setTimeout,
    clearTimeoutImpl = globalThis.clearTimeout,
    requestTimeoutMs = REQUEST_TIMEOUT_MS
} = {}) {
    let aiSettings = normalizeAiSettings();

    function getAiSettings() {
        return { ...aiSettings };
    }

    function getProviderPresets() {
        return Object.fromEntries(Object.entries(PROVIDER_PRESETS).map(([key, value]) => [key, { ...value }]));
    }

    function loadAiSettings() {
        let parsed = {};
        try {
            const storedSettings = storage?.getItem(AI_SERVICE_CONFIG.STORAGE_KEY_AI_SETTINGS);
            if (storedSettings) parsed = JSON.parse(storedSettings);
        } catch (error) {
            console.error('Could not read AI settings from browser storage:', error);
        }
        aiSettings = normalizeAiSettings(parsed);
        return getAiSettings();
    }

    function saveAiSettings(nextSettings) {
        const normalized = normalizeAiSettings(nextSettings);
        const validationError = getSettingsValidationError(normalized);
        if (validationError) throw createAiError(validationError, 'invalid-settings');
        const persisted = {
            provider: normalized.provider,
            protocol: normalized.protocol,
            providerUrl: normalized.providerUrl,
            modelName: normalized.modelName,
            apiKey: normalized.apiKey,
            reasoningEffort: normalized.reasoningEffort
        };
        storage?.setItem(AI_SERVICE_CONFIG.STORAGE_KEY_AI_SETTINGS, JSON.stringify(persisted));
        aiSettings = normalized;
        return getAiSettings();
    }

    function areAiSettingsValid() {
        return aiSettings.isValid;
    }

    function streamCompletion({ messages, settings = aiSettings, onChunk, onError, onDone }) {
        const normalized = normalizeAiSettings(settings);
        let cancellationReason = 'cancelled';
        let settled = false;
        const controller = new AbortController();

        const promise = (async () => {
            if (!normalized.isValid) {
                throw createAiError(
                    getSettingsValidationError(normalized) || 'AI settings are incomplete. Please configure them in the sidebar.',
                    'invalid-settings'
                );
            }
            if (typeof fetchImpl !== 'function') {
                throw createAiError('This browser cannot make AI requests.', 'transport-unavailable');
            }

            const request = buildRequest(normalized, messages);
            const response = await fetchImpl(normalized.providerUrl, {
                method: 'POST',
                headers: request.headers,
                body: JSON.stringify(request.body),
                signal: controller.signal
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => null);
                throw createAiError(
                    `API Error (${response.status}): ${readProviderError(payload, response.statusText || 'Unknown error')}`
                );
            }
            if (!response.body) throw createAiError('The provider returned no response stream.');

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let content = '';
            let streamFinished = false;

            const consumeLine = line => {
                const trimmed = line.trimEnd();
                if (!trimmed.startsWith('data:')) return;
                const dataText = trimmed.slice(5).trim();
                if (!dataText) return;
                if (dataText === '[DONE]') {
                    streamFinished = true;
                    return;
                }

                let event;
                try {
                    event = JSON.parse(dataText);
                } catch {
                    throw createAiError('The provider returned an invalid streaming event.', 'invalid-stream');
                }
                if (event.type === 'error' || event.type === 'response.failed' || event.type === 'response.incomplete') {
                    throw createAiError(readProviderError(event, 'The provider could not complete the response.'));
                }
                if (event.type === 'response.completed') streamFinished = true;
                const delta = normalized.protocol === 'responses'
                    ? (event.type === 'response.output_text.delta' ? event.delta : '')
                    : event.choices?.[0]?.delta?.content;
                if (typeof delta === 'string' && delta) {
                    content += delta;
                    onChunk?.(delta);
                }
            };

            while (!streamFinished) {
                const { done, value } = await reader.read();
                buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
                const lines = buffer.split(/\r?\n/);
                buffer = lines.pop() || '';
                for (const line of lines) consumeLine(line);
                if (done) break;
            }
            if (buffer.trim()) consumeLine(buffer);
            return content;
        })();

        const timeoutId = setTimeoutImpl?.(() => {
            cancellationReason = 'timeout';
            controller.abort();
        }, requestTimeoutMs);

        const observedPromise = promise.then(content => {
            if (settled) return content;
            settled = true;
            clearTimeoutImpl?.(timeoutId);
            onDone?.(content);
            return content;
        }).catch(error => {
            if (settled) throw error;
            settled = true;
            clearTimeoutImpl?.(timeoutId);
            const reported = error?.name === 'AbortError'
                ? createAiError(
                    cancellationReason === 'timeout'
                        ? 'The AI request timed out after 60 seconds.'
                        : 'The AI request was cancelled.',
                    cancellationReason
                )
                : error;
            onError?.(reported);
            throw reported;
        });
        observedPromise.catch(() => {});

        return {
            cancel() {
                if (!settled) controller.abort();
            },
            promise: observedPromise
        };
    }

    function testConnection(settings, callbacks = {}) {
        return streamCompletion({
            messages: [
                { role: 'system', content: 'Return only the word OK.' },
                { role: 'user', content: 'Connection test. Do not use external context.' }
            ],
            settings,
            ...callbacks
        });
    }

// --- Helper Function for Context Gathering ---

/**
 * Converts a project context snapshot into prompt-ready strings.
 * @param {object} snapshot - Context supplied by the project state owner.
 * @returns {object} Prompt-ready context strings.
 */
function _getCardContext(snapshot = {}) {
    const joinContent = value => Array.isArray(value)
        ? (value.join(CARD_SEPARATOR) || NONE_TEXT)
        : (value || NONE_TEXT);

    return {
        globalPrompt: snapshot.globalPrompt || NONE_TEXT,
        columnPrompt: snapshot.columnPrompt || NONE_TEXT,
        parentCardContent: snapshot.parentCardContent === null
            ? `${NONE_TEXT} (This is a root card)`
            : (snapshot.parentCardContent || NONE_TEXT),
        currentCardContent: snapshot.currentCardContent || '',
        precedingSiblingsContent: joinContent(snapshot.precedingSiblingsContent),
        followingSiblingsContent: joinContent(snapshot.followingSiblingsContent),
        existingChildrenContent: joinContent(snapshot.existingChildrenContent),
        targetColumnPrompt: snapshot.targetColumnPrompt || NONE_TEXT
    };
}

function getPlacementInstruction(placement = {}) {
    if (placement.targetKind === 'option') {
        return `The result will be saved as an immutable Option for an existing target Card. It will not create a new Card or overwrite Current.\n\n## Target Card Current Content\n\n${placement.targetCardContent || NONE_TEXT}`;
    }
    if (placement.targetKind === 'children') {
        return 'The result will be added as one or more new child Cards. Existing Cards remain unchanged.';
    }
    return 'The result will be added as one new Card. Existing Cards remain unchanged.';
}


// --- AI Generation Functions ---

function generateContinuation({ context: contextSnapshot, placement, onChunk, onError, onDone }) {
    const messages = [{ role: "system", content: AI_SERVICE_CONFIG.AI_SYSTEM_PROMPT }];
    const context = _getCardContext(contextSnapshot);

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

# Anchor Card Content (The card to continue FROM)

${context.currentCardContent}

## Result Placement

${getPlacementInstruction(placement)}

## Task: Generate the Next Logical Content Unit

Based on all the provided context, generate the single content unit that should logically follow the "Anchor Card Content". Follow the declared Result Placement exactly.

Focus on:
- **Direct Continuation:** Seamlessly continue the thought, narrative, argument, or sequence presented in the "Anchor Card Content".
- **Local Coherence:** Ensure the new card flows logically from the "Anchor Card Content" and maintains consistency with the "Preceding Sibling Cards Content".
- **Hierarchical Relevance:** The content should remain relevant to the "Parent Card Content".
- **Style Consistency:** Analyze and **strictly mimic the existing writing style** (considering tone, voice, vocabulary, sentence complexity, formality, pacing, etc.) evident in the Parent Card, Preceding Sibling Cards, and *especially* the Anchor Card Content. The goal is seamless stylistic integration.
- **Adherence to Guidelines:** Follow any specific instructions or constraints mentioned in the Global and Column Prompts.
- **Output:** Generate *only* the plain text result. Do not include any introductions, explanations, or formatting.
`;

    messages.push({ role: "user", content: userPromptContent });

    return streamCompletion({ messages, onChunk, onError, onDone });
}

function generateSummary({ context: contextSnapshot, placement, onChunk, onError, onDone }) {
    const messages = [{ role: "system", content: AI_SERVICE_CONFIG.AI_SYSTEM_PROMPT }];
    const context = _getCardContext(contextSnapshot);

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

# Content to Summarize

## Source Card Content (Parent of the content being summarized)

${context.currentCardContent}

## Existing Child Cards Content (Direct descendants to include in summary)

${context.existingChildrenContent}

# Result Placement

${getPlacementInstruction(placement)}

# Task: Generate a Following Summary

Based on all provided context, generate a **concise summary** that synthesizes the core information from *both* the "Source Card Content" and its "Existing Child Cards Content". Follow the declared Result Placement exactly and do not replace or modify the source.

Focus on:
- **Condensing Information:** Identify and extract the most critical points, arguments, or themes from the combined source and child content.
- **Synthesis:** Integrate the key information from the source card and its children into a coherent, unified summary. Do not simply list points separately.
- **Accuracy:** Ensure the summary accurately reflects the main ideas of the original content, without introducing misinterpretations.
- **Brevity:** The primary goal is length reduction while retaining essential meaning.
- **Contextual Coherence:** The summary should still make sense within the sequence (considering Parent, Preceding, and Following Siblings) and adhere to Global/Column prompts.
- **Writing Style:** Maintain the established writing style evident in the context (Source Card, Parent, Siblings), unless specific instructions dictate otherwise.
- **Direct Output:** Output *only* the generated summary text. Do not include introductions, explanations, or section titles.
 `;

    messages.push({ role: "user", content: userPromptContent });

    return streamCompletion({ messages, onChunk, onError, onDone });
}


function generateBreakdown({ context: contextSnapshot, onChunk, onError, onDone }) {
    const messages = [{ role: "system", content: AI_SERVICE_CONFIG.AI_SYSTEM_PROMPT }];
    const context = _getCardContext(contextSnapshot);

    // Construct the prompt using fetched context
    let userPromptContent = `# Overall Document Context

${context.globalPrompt}

# Source Card's Column Context

${context.columnPrompt}

# Hierarchical Context

## Parent Card Content (of the Source Card)

${context.parentCardContent}

# Source Card Content (The card to brainstorm FROM)

${context.currentCardContent}

# Target Column Context (Where the new child cards will be placed)

${context.targetColumnPrompt}

## Existing Child Cards Context (of the Source Card)

${context.existingChildrenContent}

# Task: Brainstorm Child Cards

Based on the "Source Card Content" and all provided context, brainstorm and generate the text content for **multiple distinct child cards** (around 3-5 cards).

Focus on:
- **Elaboration/Decomposition:** Each generated child card should explore, detail, break down, or provide examples/evidence related to a specific aspect of the "Source Card Content".
- **Relevance & Coherence:** Ideas must be directly relevant to the Source Card and coherent with the Parent Card content and any specified Global/Column Prompts.
- **Novelty (Consider Existing Children):** Aim to generate *new* insights or directions that complement or logically follow any "Existing Child Cards Content", rather than repeating them. If no children exist, generate foundational ideas.
- **Adherence to Target Context:** Pay close attention to the "Target Column Prompt" if provided, as it may dictate the specific *purpose* or *type* of child cards required (e.g., arguments, steps, examples).
- **Writing Style:** Maintain a style consistent with the Source Card and any overarching style guides (Global/Column Prompts), unless the Target Column Prompt suggests a different style for the children.
- **Output Format:** Generate content for **each** proposed child card separately. Use "---" on a new line as a delimiter between the content for each distinct child card idea.
- **Direct Output:** Output *only* the text for the new cards, separated by "---". Do not include introductions or summaries.
`;

    messages.push({ role: "user", content: userPromptContent });

    return streamCompletion({ messages, onChunk, onError, onDone });
}

function generateExpand({ context: contextSnapshot, onChunk, onError, onDone }) {
    const messages = [{ role: "system", content: AI_SERVICE_CONFIG.AI_SYSTEM_PROMPT }];
    const context = _getCardContext(contextSnapshot);

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

# Original Card Content (The card to enrich)

${context.currentCardContent}

# Existing Child Cards Content (of the Original Card)

${context.existingChildrenContent}

# Task: Generate Expansion Child Card

Generate a **significantly more detailed expansion** of the "Original Card Content" as one new child card. The new child elaborates on the source while leaving the source card and its existing children unchanged.

Focus on:
- **Adding Depth:** Incorporate relevant supporting details, examples, explanations, descriptions, definitions, context, or narrative elements that elaborate on the original points.
- **Maintaining Focus:** Ensure all added content directly relates to and expands upon the core subject matter established in the "Original Card Content". Do not introduce entirely new, unrelated topics.
- **Coherence & Flow:** The enriched content must remain consistent with the "Parent Card Content" and the overall document context (Global/Column Prompts). It should also flow logically *from* the "Preceding Sibling Cards Content" and provide a smooth transition *towards* the "Following Sibling Cards Content" (if it exists).
- **Complementing Children:** If "Existing Child Cards Content" is provided, add useful depth without merely repeating those child topics.
- **Writing Style:** Analyze and maintain the established writing style (tone, voice, vocabulary, formality) evident in the surrounding context (Parent, Siblings, Original Content), unless specific style instructions exist in the prompts.
- **Direct Output:** Output *only* the plain text for the new expansion child card. Do not include introductions, summaries, or placement instructions.
`;

    messages.push({ role: "user", content: userPromptContent });

    return streamCompletion({ messages, onChunk, onError, onDone });
}

function generateCustom({ context: contextSnapshot, userPrompt, placement, onChunk, onError, onDone }) {
    const messages = [{ role: "system", content: AI_SERVICE_CONFIG.AI_SYSTEM_PROMPT }];
    const context = _getCardContext(contextSnapshot);

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

# Current Card Content (Primary Subject Card)

${context.currentCardContent}

# Existing Child Cards Content

${context.existingChildrenContent}

# User's Custom Instruction

${userPrompt}

# Result Placement

${getPlacementInstruction(placement)}

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
- **Direct Output:** Avoid conversational wrappers unless the request specifically asks for a dialogue or explanation.
`;

    messages.push({ role: "user", content: userPromptContent });

    return streamCompletion({ messages, onChunk, onError, onDone });
}

    return {
        areAiSettingsValid,
        generateBreakdown,
        generateContinuation,
        generateCustom,
        generateExpand,
        generateSummary,
        getAiSettings,
        getProviderPresets,
        loadAiSettings,
        saveAiSettings,
        testConnection
    };
}

const aiService = createAiService();

export {
    AI_SERVICE_CONFIG,
    createAiService,
    normalizeAiSettings,
    aiService
};
