# Global Prompt and Column Prompt Separation

Building upon the v3 specification, the Global Prompt is now a project level field instead of being tied to column 0.

- **Global Prompt Button:** Column 0's toolbar displays a new `Global Prompt` button before the column prompt button. Clicking it opens a modal to edit the project wide prompt.
- **Column Prompts:** Every column still has its own prompt. Column 0 now uses its own column prompt distinct from the global prompt.
- **Storage:** Each project saves the global prompt under `project.data.globalPrompt`. Column prompts remain within their respective column objects.
- **AI Service:** `aiService.js` retrieves the global prompt using `data.getGlobalPromptData()` and the column prompt via `data.getColumnData(card.columnIndex)?.prompt`.
