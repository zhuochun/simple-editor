# Basic Key Shortcut Support

Add key shortcuts support inside card's textarea to quickly navigate within and between cards without a mouse.

All cards share these functions, keep the logic in a new JS file.

`Ctrl+Enter`: Create a new card below, and focus to the new card's textarea.
    - Split the content of the current card at the cursor's position and move the subsequent text to a newly created card

`Alt+Enter`: Create a new child card in next column, and focus to the new card's textarea. Remember to scroll the card into view.
    - Split the content of the current card at the cursor's position and move the subsequent text to a newly created card

`Down`: When the cursor is on the last line of the textarea, pressing Down moves the focus to the beginning of the textarea in the next card in the same column, if one exists.

`Up`: When the cursor is on the first line of the textarea, pressing Up moves the focus to the end of the textarea in the previous card in the same column, if one exists.

`Alt+Up/Down`: Move the focus to the previous or next card's textarea in the same column, if one exists.

`Alt+Left/Right`: Move the focus to the parent card or the first child card's textarea, if one exists. Remember to scroll them into view.

`Backspace`: When the cursor is at the beginning of the textarea, pressing Backspace merges the current card's content with the previous sibling card. Children of the current card are reparented to the previous card. The current card is deleted, and focus moves to the merge point in the previous card.

`Delete`: When the cursor is at the end of the textarea, pressing Delete merges the next sibling card's content into the current card. Children of the next card are reparented to the current card. The next card is deleted, and focus remains at the merge point in the current card.
