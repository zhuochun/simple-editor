# Simple Editor Test Cases

This document outlines test cases for the Simple Editor application, categorized by feature area.

## 1. Project Management

*   **TC-PROJ-001:** Add a new project with a default title ("New Project").
    *   Verify: Project appears in the sidebar list, becomes active, default columns/cards are rendered, data is saved to localStorage.
*   **TC-PROJ-002:** Add a new project with a custom title.
    *   Verify: Project appears with the custom title, becomes active, UI updates correctly.
*   **TC-PROJ-003:** Add a new project with an empty title (should use default).
    *   Verify: Project appears with the default title ("Untitled Project").
*   **TC-PROJ-004:** Add a new project with a title containing leading/trailing whitespace (should be trimmed).
    *   Verify: Project appears with the trimmed title.
*   **TC-PROJ-005:** Cancel adding a new project via the prompt.
    *   Verify: No new project is added, active project remains unchanged.
*   **TC-PROJ-006:** Switch between existing projects by clicking in the sidebar.
    *   Verify: Correct project data loads, UI renders the selected project, sidebar highlights the active project, `activeProjectId` is saved.
*   **TC-PROJ-007:** Attempt to switch to the already active project.
    *   Verify: No change occurs, no unnecessary re-renders.
*   **TC-PROJ-008:** Delete the currently active project when multiple projects exist.
    *   Verify: Confirmation prompt appears, project is removed from sidebar and data, the most recently modified *other* project becomes active, UI updates, data is saved.
*   **TC-PROJ-009:** Delete an inactive project.
    *   Verify: Confirmation prompt appears, project is removed from sidebar and data, the active project remains unchanged, data is saved.
*   **TC-PROJ-010:** Delete the only existing project.
    *   Verify: Confirmation prompt appears, project is removed, a new default project is automatically created and becomes active, UI updates, data is saved.
*   **TC-PROJ-011:** Cancel deleting a project via the confirmation prompt.
    *   Verify: Project is not deleted, application state remains unchanged.
*   **TC-PROJ-012:** Rename a project by double-clicking the title in the sidebar.
    *   Verify: Input field appears, new name is saved on blur/Enter, title updates in the sidebar, `lastModified` timestamp updates, data is saved.
*   **TC-PROJ-013:** Rename a project to an empty string (should revert or keep original).
    *   Verify: Title reverts to the original name after blur/Enter.
*   **TC-PROJ-014:** Cancel renaming a project by pressing Escape.
    *   Verify: Title reverts to the original name, data is not saved.
*   **TC-PROJ-015:** Export a project.
    *   Verify: A `.txt` file is downloaded containing the concatenated content of cards in traversal order (root cards first, then their children recursively), separated by double newlines. Filename includes project title and timestamp.
*   **TC-PROJ-016:** Export an empty project.
    *   Verify: An empty `.txt` file is downloaded.
*   **TC-PROJ-017:** Load application with existing projects and active project ID in localStorage.
    *   Verify: Correct projects are loaded, the specified active project is loaded and rendered.
*   **TC-PROJ-018:** Load application with existing projects but no/invalid active project ID in localStorage.
    *   Verify: Projects are loaded, the most recently modified project becomes active.
*   **TC-PROJ-019:** Load application with no projects in localStorage.
    *   Verify: A new default project is created, saved, and rendered.
*   **TC-PROJ-020:** Load application with corrupted project data in localStorage.
    *   Verify: Error is handled gracefully (e.g., console warning, reset), a new default project is created.

## 2. Column Management

*   **TC-COL-001:** Add a new column using the '+' button on the rightmost column.
    *   Verify: New column appears visually, toolbar buttons update (old rightmost loses '+', new one gains it), data is saved. Minimum column count is respected.
*   **TC-COL-002:** Delete the rightmost column when it's empty and minimum count is exceeded.
    *   Verify: Confirmation prompt appears, column is removed visually, toolbar buttons update, data is saved.
*   **TC-COL-003:** Attempt to delete a column that is not the rightmost.
    *   Verify: Delete button is hidden or disabled.
*   **TC-COL-004:** Attempt to delete the rightmost column when it contains cards.
    *   Verify: Delete button is hidden or disabled.
*   **TC-COL-005:** Attempt to delete a column when the minimum column count (3) is reached.
    *   Verify: Delete button is hidden or disabled.
*   **TC-COL-006:** Set a column prompt via the 'Prompt' button (requires valid AI settings).
    *   Verify: Modal appears, entering text and saving updates the column data, button text updates with indicator (📝), data is saved.
*   **TC-COL-007:** Clear an existing column prompt.
    *   Verify: Modal appears, clearing text and saving updates the column data, button indicator is removed, data is saved.
*   **TC-COL-008:** Cancel setting/clearing a column prompt.
    *   Verify: Prompt remains unchanged in data.
*   **TC-COL-009:** Verify column prompt button is disabled if AI settings are invalid.
    *   Verify: Button has `disabled` attribute.

## 3. Card Management

*   **TC-CARD-001:** Add a root card to the first column using the 'Add Card' button.
    *   Verify: New card appears in the first column, textarea is focused, data is saved (`parentId` is null).
*   **TC-CARD-002:** Add a root card by double-clicking empty space in the first column.
    *   Verify: New card appears, textarea is focused, data is saved.
*   **TC-CARD-003:** Add a child card using the '+' button on a parent card.
    *   Verify: New card appears in the *next* column within a group associated with the parent, textarea is focused, data is saved (`parentId` is set).
*   **TC-CARD-004:** Add a child card by double-clicking the group header area of a parent card.
    *   Verify: New card appears within that group in the same column as the group header, textarea is focused, data is saved.
*   **TC-CARD-005:** Edit card content and blur the textarea.
    *   Verify: Content is saved in data, `lastModified` timestamp of the project updates, data is saved to localStorage.
*   **TC-CARD-006:** Edit card content that is a parent (with no name) - verify group header updates.
    *   Verify: Group header text/title in the next column updates with new content preview.
*   **TC-CARD-007:** Delete a card with no children.
    *   Verify: Card is removed visually and from data, data is saved. (Confirmation might appear if content exists).
*   **TC-CARD-008:** Delete a card with children (requires confirmation).
    *   Verify: Confirmation prompt appears, card and all descendants are removed visually and from data, associated group headers are removed, data is saved.
*   **TC-CARD-009:** Cancel deleting a card with children.
    *   Verify: Card and descendants remain.
*   **TC-CARD-010:** Rename a card by double-clicking the name/ID area.
    *   Verify: Input appears, saving updates the card name in data, display updates, group header (if parent) updates, data is saved.
*   **TC-CARD-011:** Rename a card to an empty string.
    *   Verify: Name is set to null in data, display shows ID (`#xxxx`), group header (if parent) updates to use ID/preview, data is saved.
*   **TC-CARD-012:** Cancel renaming a card with Escape.
    *   Verify: Name reverts to original, data is not saved.
*   **TC-CARD-013:** Focus a card textarea.
    *   Verify: Hierarchy highlights (card, ancestors, descendants), view scrolls to center the card and relevant ancestors/descendant groups.
*   **TC-CARD-014:** Blur a card textarea.
    *   Verify: Highlights are cleared, 'editing' class is removed.
*   **TC-CARD-015:** Verify card background color calculation for root cards (different hues).
*   **TC-CARD-016:** Verify card background color calculation for child cards (inherits parent hue/saturation, steps down lightness).
*   **TC-CARD-017:** Verify card background color recalculation after adding/deleting/moving root cards.
*   **TC-CARD-018:** Verify card background color recalculation after moving child cards (changing parent or order within group).
*   **TC-CARD-019:** Verify group header text/title for parent cards *with* names.
*   **TC-CARD-020:** Verify group header text/title for parent cards *without* names (uses ID and content preview).
*   **TC-CARD-021:** Verify textarea auto-resizing on input and initial load.

## 4. Drag and Drop

*   **TC-DD-001:** Drag a card and drop it between two other cards in the same column/group.
    *   Verify: Card moves visually, data updates (order), colors recalculate if needed, data is saved.
*   **TC-DD-002:** Drag a card and drop it at the beginning of a column/group.
    *   Verify: Card moves visually, data updates (order), colors recalculate if needed, data is saved.
*   **TC-DD-003:** Drag a card and drop it at the end of a column/group.
    *   Verify: Card moves visually, data updates (order), colors recalculate if needed, data is saved.
*   **TC-DD-004:** Drag a root card from column 0 and drop it into column 1 (should not be allowed unless dropping into a group).
    *   Verify: Drop fails, card returns to original position. (Note: Current implementation might allow dropping root cards anywhere, needs verification). *Correction: Test dropping into empty space of col > 0.*
*   **TC-DD-005:** Drag a non-root card and drop it into the empty space of column 0.
    *   Verify: Card moves, becomes a root card (`parentId` becomes null), data updates, colors recalculate, data is saved.
*   **TC-DD-006:** Drag a card and drop it into a group header area in another column.
    *   Verify: Card moves into the target group, becomes a child of that group's parent, column index updates, order updates, colors recalculate, data is saved.
*   **TC-DD-007:** Drag a card and drop it onto itself.
    *   Verify: Drop fails, no change occurs.
*   **TC-DD-008:** Drag a parent card and attempt to drop it into its own child group in the next column.
    *   Verify: Drop fails, no change occurs.
*   **TC-DD-009:** Drag a card across different columns and groups, verifying visual indicator (`drag-over-indicator`) appears correctly.
*   **TC-DD-010:** Drag a card and press Escape during the drag.
    *   Verify: Drag operation cancels, card returns to original position, styles are cleared. (Note: Browser default behavior might handle this).
*   **TC-DD-011:** Drag a card with descendants and drop it elsewhere.
    *   Verify: Card moves, descendants maintain their relative column positions and parentage *to the dragged card*, colors update for card and descendants, data is saved.

## 5. AI Features (Requires Valid Setup)

*   **TC-AI-001:** Click 'Continue' (⬇️) on a card.
    *   Verify: Placeholder card appears below the current card in the same column/group, AI streams response into placeholder, content is saved on completion.
*   **TC-AI-002:** Click 'Continue' (⬇️) on a card with a column prompt set.
    *   Verify: AI response respects the column prompt.
*   **TC-AI-003:** Click 'Expand' (↕️) on a card.
    *   Verify: Placeholder card appears as a child in the next column, AI streams expanded content, content is saved.
*   **TC-AI-004:** Click 'Brainstorm' (🧠) on a card.
    *   Verify: Placeholder card appears as a child in the next column, AI streams multiple ideas separated by '---', placeholder is reused for the first idea, subsequent ideas create new sibling cards, content is saved.
*   **TC-AI-005:** Click 'Custom Prompt' (✨) on a card.
    *   Verify: Modal appears, entering a prompt and submitting creates placeholder child card in the next column, AI streams response (potentially multi-part), content is saved.
*   **TC-AI-006:** Attempt to use an AI feature when settings are invalid/incomplete.
    *   Verify: Buttons are disabled, or an alert/message informs the user to configure settings.
*   **TC-AI-007:** Handle AI API error during streaming.
    *   Verify: Error message is displayed in the target card, loading state stops, error content is saved.
*   **TC-AI-008:** Verify AI buttons are enabled/disabled correctly when settings validity changes.

## 6. Keyboard Shortcuts (within Textarea)

*   **TC-KBD-001:** Ctrl+Enter: Split card below cursor.
    *   Verify: Current card content truncated, new sibling card created below with remaining content, focus moves to new card.
*   **TC-KBD-002:** Alt+Enter: Split card as child below cursor.
    *   Verify: Current card content truncated, new child card created in next column with remaining content, focus moves to new card.
*   **TC-KBD-003:** Backspace (at start of content): Merge with previous sibling card.
    *   Verify: Content prepended to previous card, current card deleted, children (if any) reparented to previous card, focus moves to merge point in previous card.
*   **TC-KBD-004:** Delete (at end of content): Merge with next sibling card.
    *   Verify: Next card's content appended to current card, next card deleted, its children (if any) reparented to current card, focus remains in current card at merge point.
*   **TC-KBD-005:** ArrowDown (at end of last line): Move focus to start of next sibling card.
*   **TC-KBD-006:** ArrowUp (at start of first line): Move focus to end of previous sibling card.
*   **TC-KBD-007:** Alt+ArrowDown: Move focus to next sibling card (preserve cursor column).
*   **TC-KBD-008:** Alt+ArrowUp: Move focus to previous sibling card (preserve cursor column).
*   **TC-KBD-009:** Alt+ArrowLeft: Move focus to end of parent card (if exists).
*   **TC-KBD-010:** Alt+ArrowRight: Move focus to start of first child card in next column (if exists).
*   **TC-KBD-011:** Attempt merge (Backspace/Delete) when no previous/next sibling exists.
    *   Verify: No action occurs, default Backspace/Delete behavior happens.
*   **TC-KBD-012:** Attempt navigation (Arrows) when no target card exists (e.g., Alt+Left on root card).
    *   Verify: No action occurs.

## 7. UI / Miscellaneous

*   **TC-UI-001:** Collapse/Expand sidebar using the resizer handle.
    *   Verify: Sidebar collapses/expands, state is saved to localStorage and restored on reload.
*   **TC-UI-002:** AI Settings: Enter valid credentials.
    *   Verify: Inputs are masked on blur, checkmark appears on title, AI features become enabled, settings saved.
*   **TC-UI-003:** AI Settings: Clear credentials.
    *   Verify: Inputs become empty, checkmark disappears, AI features become disabled, settings saved.
*   **TC-UI-004:** AI Settings: Focus input fields.
    *   Verify: Actual value is shown.
*   **TC-UI-005:** Resize browser window.
    *   Verify: Layout adapts reasonably (columns might wrap or require horizontal scrolling).
