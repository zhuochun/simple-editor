# Specification: AI-assisted Writing (v3 - As Implemented)

Integrate AI writing assistance features into the application using an OpenAI-compatible API.

The core AI logic is encapsulated in `aiService.js` for modularity and maintenance.

## AI Setting Configuration

Located at the bottom of the left sidebar, within the element identified by `#ai-settings-container`.

- **Title:** The section is titled (likely "AI Settings" in the HTML, associated with the `#ai-settings-title` element).
- **Inputs:** Provides text inputs for:
    - AI Provider URL (`#ai-provider-url`)
    - AI Model Name (`#ai-model-name`)
    - AI API Key (`#ai-api-key`)
    - Temperature (`#ai-temperature`) – optional value between 0 and 2
- **Security:** Input values are masked (`******`) when not focused. The actual values are stored in `data-value` attributes and revealed for editing only when an input field receives focus.
- **Validation Indicator:** When the required settings (Provider URL, Model Name, API Key) are non-empty, the `#ai-settings-title` element gets the class `ready` (visually indicating readiness, e.g., with a checkmark via CSS).
- **Storage:** Settings are saved to `localStorage` under the key `writingToolAiSettings`.
- **Feature Activation:** When settings are valid (`aiService.areAiSettingsValid()` returns true), the `<body>` element gets the class `ai-ready`, and buttons within elements having the class `.ai-feature` are enabled. Otherwise, these buttons are disabled.

## AI on Columns

- **Prompt Button:** In the `.column-toolbar > .toolbar-left`, a button (`.add-prompt-btn.ai-feature`) allows setting a column-specific prompt.
    - **Indicator:** The button text includes a `📝` emoji (`Prompt 📝`) if a prompt has been set for that column.
    - **Modal:** Clicking the button opens a modal dialog for entering or editing the prompt text.
    - **Storage:** The prompt is saved as the `prompt` property within the column's data object in the active project's data structure (`projects[activeProjectId].data.columns[columnIndex].prompt`).
- **Usage:** The column prompt is retrieved by `getCardContextForContinue` and included in the context sent to the AI for the "Continue" action via `aiService.generateContinuation`.

## AI on Cards

Within each card's header (`.card-header`), AI action buttons are placed inside a `.card-ai-actions.ai-feature` container, before the standard `.card-actions`. These buttons use emoji icons:

- **Continue (`.ai-continue-btn` ⬇️):**
    - **Context:** Sends the column prompt (if any), the content of all sibling cards preceding the current card (in the same column and with the same parent), and the current card's content.
    - **Action:** Calls `aiService.generateContinuation`.
    - **Result:** Creates a new card immediately *after* the current card (same `columnIndex`, same `parentId`) with placeholder text. The AI's streaming response updates this new card's content.
- **Breakdown (`.ai-breakdown-btn` 🧠):**
    - **Context:** Sends the current card's content.
    - **Action:** Calls `aiService.generateBreakdown`.
    - **Result:** Creates a *single* temporary placeholder card as a *child* of the current card in the *next column* (`columnIndex + 1`). When the AI response arrives, it's split by `---`. The temporary card is reused for the first part, and new child cards are created in the next column for subsequent parts. The temporary card is removed if the AI returns no valid parts.
- **Expand (`.ai-expand-btn` 🪴):**
    - **Context:** Sends the current card's content.
    - **Action:** Calls `aiService.generateExpand`.
    - **Result:** Creates a new card as a *child* of the current card in the *next column* (`columnIndex + 1`) with placeholder text. The AI's streaming response updates this new card's content.
- **Custom (`.ai-custom-btn` ✨):**
    - **Interaction:** Shows a modal for the user to input a custom prompt.
    - **Context:** Sends the current card's content and the user's custom prompt.
    - **Action:** Calls `aiService.generateCustom`.
    - **Result:** Creates a new card as a *child* of the current card in the *next column* (`columnIndex + 1`) with placeholder text. The AI's streaming response updates this new card's content.

## AI Interactions & Service (`aiService.js`)

- **Placeholder:** When an AI action is triggered, the newly created card's textarea initially contains "AI is thinking..." and has the `ai-loading` class.
- **Streaming:** The `aiService.streamChatCompletion` function handles the API call.
    - It receives `messages`, `onChunk`, `onError`, and `onDone` callbacks.
    - It uses `fetch` with `stream: true`.
    - It processes Server-Sent Events (SSE) line by line (`data: ...`).
    - `onChunk(delta)` is called with incremental content updates.
    - `onDone(fullContent)` is called with the complete response text.
    - `onError(error)` is called if an API or network error occurs.
- **UI Update:** The `script.js` handlers update the target card's textarea content using the `onChunk` callback (clearing the placeholder on the first chunk) and apply `autoResizeTextarea`.
- **Error Handling:** If `onError` is called, the error message is written into the target card's textarea content.
- **Saving:** Card content (final response or error message) is saved to the project data via `saveProjectsData()` in the `onDone` and `onError` callbacks. The project's `lastModified` timestamp is also updated.
- **System Prompt:** `aiService.js` defines a constant `AI_SYSTEM_PROMPT` which is included in all AI requests to provide context about the application's structure and expected output format (plain text, `---` delimiter for multi-card responses).
- **Configuration Constants:** `aiService.js` uses constants for configuration:
    - `SITE_URL`: Used for the `HTTP-Referer` header.
    - `SITE_NAME`: Used for the `X-Title` header.
    - `STORAGE_KEY_AI_SETTINGS`: Key for localStorage.

## API Call Structure (`aiService.streamChatCompletion`)

The service makes requests to the user-configured `providerUrl` with the following structure:

```http
POST <providerUrl> HTTP/1.1
Authorization: Bearer <apiKey>
HTTP-Referer: <SITE_URL constant>
X-Title: <SITE_NAME constant>
Content-Type: application/json

{
  "model": "<modelName>",
  "messages": [
    { "role": "system", "content": "<AI_SYSTEM_PROMPT constant>" },
    { "role": "user", "content": "<Constructed prompt based on action>" }
    // Potentially more messages depending on future context needs
  ],
  "stream": true,
  "temperature": <optional number>
}
```

The service then processes the streaming response as described above.
