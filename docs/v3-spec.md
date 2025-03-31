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

## AI on Columns

In the `column-toolbar`, add a button "Add Prompt" to the `toolbar-left`.

- When clicked, show a textbox pop-up modal in the center for user to enter a column-level prompt message.

Save the prompt per column together with the active project.

## AI on Cards

On each card, add the following AI buttons before the `card-actions` in `card-header`.

- Continue writing: Continue the content after this card, combine the column-level prompt (if any), the text content of all cards above it in the same column, and the text content of the current card, save the AI response as a new card after this card, same as the current card's `parentId`.
- Breakdown: Ask the AI to breakdown this card, breakdown splits by "---" delimiter, insert each part as a new children card in the next column.
- Expansion: Ask the AI to expand the content of this card, insert the AI response as a new child card in the next column.
- Custom: Show a textbox pop-up modal in the center for user to enter a one-time prompt, combine the user's custom prompt with the text content of the current card, send to AI, insert the AI response as a child card in the next column.

Change all the buttons in `card-header` to emoji icons.

## AI Interactions

When an AI action is triggered, a new card is created immediately, with a placeholder that "AI is thinking ...". When the streaming responses received, start to update the card.

When an error happens, fill in the error in the card text content.

Remember to save all the card data after AI responses.


## OpenRouter API

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
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "What is in this image?"
          }
        ]
      }
    ]
  })
});
```