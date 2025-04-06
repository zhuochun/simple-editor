# Support AI-assisted Writing

Integrate AI writing assistance features into the application. Use OpenAI compatible API directly, integration code snippet is provided at the end.

Keep the AI logic in a modular `aiService.js` file to improve code maintenance.

## AI Setting configuration

On the bottom of the left sidebar:

- Add a AI configuration section with title "OpenRouter", and text boxes to set the Provider, the Model name and the Authorization key.
  - All text boxes are always displayed as "******" to hide the secrets. Only when a text box is in focus, the actual values are filled for edit.
  - When all settings are filled, the title displays a checkbox emoji to indicate setting ready.

Store the AI settings in localStorage.

When all AI settings are filled (non-empty), then the following features become visible.

## AI Context Prompts

The AI utilizes several context prompts:

- **Global Prompt:** A general prompt for the entire document, associated with the first column (Column 0). (Handled by data module, used by `aiService.js`).
- **Column Prompt:** A specific prompt for the column the target card resides in. (Handled by data module, used by `aiService.js`).
- **Target Column Prompt:** A specific prompt for the column where new child cards (e.g., from Breakdown) will be placed. (Handled by data module, used by `aiService.js`).

## AI on Cards

On each card, add the following AI action buttons (using emoji icons) before the standard `card-actions` in the `card-header`. These actions leverage rich context including parent, siblings, existing children, and relevant prompts (`globalPrompt`, `columnPrompt`, `targetColumnPrompt`).

- **Continue:** Generate the content for the *next sibling card* based on the current card and its context (parent, preceding siblings, prompts). The AI is asked to mimic the existing writing style. The response populates a new card created immediately after the current one, under the same parent.
- **Breakdown:** Ask the AI to brainstorm and generate content for multiple *new child cards* (typically 3-5) that elaborate on or decompose the current card's content. The AI considers the `targetColumnPrompt` for guidance. The response should use "---" as a delimiter between content for each new child card. Each part populates a new child card created in the next column.
- **Expand:** Ask the AI to rewrite the *current card's content* to be significantly longer and more detailed, adding depth, examples, or explanations while maintaining focus and coherence with the surrounding context (parent, siblings, children, prompts). The response replaces the content of the existing card.
- **Summarize:** Ask the AI to generate a concise summary synthesizing the core information from the *current card and its existing direct child cards*. The response replaces the content of the existing card (or could be used elsewhere).
- **Custom:** Show a textbox pop-up modal for the user to enter a specific instruction. The AI executes this instruction using the current card and its full context.
  - Output can vary:
    - Modify the current card's content.
    - Provide analysis or information.
    - Generate multiple new cards (using "---" delimiter) if requested.
  - The response is handled based on the nature of the output (replace current card, insert new children, etc. - *needs clarification on default insertion behavior if not modifying*).

## AI Interactions

When an AI action is triggered, a new card is created immediately, with a placeholder that "AI is thinking ...". When the streaming responses received, start to update the card.

When an error happens, fill in the error in the card text content.

Remember to save all the card data after AI responses.

## AI API Interaction (OpenAI Compatible)

The `aiService.js` module handles communication with the AI provider using the Fetch API and expects an OpenAI-compatible streaming chat completions endpoint.

``` js
fetch("https://openrouter.ai/api/v1/chat/completions", { // From user's AI setting
  method: "POST",
  headers: {
    "Authorization": "Bearer <OPENROUTER_API_KEY>", // From user's AI Setting
    "HTTP-Referer": "<YOUR_SITE_URL>", // Site URL -- make it a constant in file for configuration
    "X-Title": "<YOUR_SITE_NAME>", // Site title -- make it a constant in file for configuration
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    "model": "google/gemini-2.5-pro-exp-03-25:free", // From user's AI setting
    "messages": [
       { "role": "system", "content": AI_SERVICE_CONFIG.AI_SYSTEM_PROMPT }, // System prompt from aiService.js
       { "role": "user", "content": "..." } // Dynamically constructed user prompt based on action and context
       // ... potentially more messages
    ],
    "stream": true // Streaming is enabled
  })
});
```

The service handles Server-Sent Events (SSE) for streaming responses.
