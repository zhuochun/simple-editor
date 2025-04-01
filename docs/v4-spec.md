# Basic Key Shortcut Support

Add key shortcuts support inside card's textarea to quickly navigate within and between cards without a mouse.

All cards share these functions, keep the logic in a new JS file.

`Ctrl+Enter`: Create a new card below, and focus to the new card's textarea.

`Alt+Enter`: Create a new child card in next column, and focus to the new card's textarea. Remember to scroll the card into view.

`Down`: When the cursor is on the last line of the textarea, pressing Down moves the focus to the beginning of the textarea in the next card in the same column, if one exists.

`Up`: When the cursor is on the first line of the textarea, pressing Up moves the focus to the end of the textarea in the previous card in the same column, if one exists.

`Alt+Up/Down`: Move the focus to the previous or next card's textarea in the same column, if one exists.

`Alt+Left/Right`: Move the focus to the parent card or the first child card's textarea, if one exists. Remember to scroll them into view.