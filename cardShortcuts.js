// Helper function to calculate cursor line (0-based)
function getCursorLine(textarea) {
    const text = textarea.value;
    const selectionStart = textarea.selectionStart;
    let line = 0;
    for (let i = 0; i < selectionStart; i++) {
        if (text[i] === '\n') {
            line++;
        }
    }
    return line;
}

// Helper function to calculate total lines
function getTotalLines(textarea) {
    return textarea.value.split('\n').length;
}

// Main keyboard shortcut handler for card textareas
function handleCardTextareaKeydown(event, helpers) {
    const textarea = event.target;

    // Ensure the event target is a card textarea
    if (!textarea || !textarea.matches('textarea.card-content')) {
        return;
    }

    const cardEl = textarea.closest('.card');
    if (!cardEl) return;
    const cardId = cardEl.dataset.cardId;
    if (!cardId) return;

    const ctrlPressed = event.ctrlKey || event.metaKey; // Handle Cmd on Mac
    const altPressed = event.altKey;

    // --- Shortcut Definitions ---

    switch (event.key) {
        case 'Enter':
            // === Ctrl+Enter: Split Card Below ===
            if (ctrlPressed) {
                event.preventDefault();
                console.log(`Shortcut: Ctrl+Enter (Split Below) on card ${cardId}`);
                const currentCardData = helpers.getCard(cardId);
                if (!currentCardData) return;

                const selectionStart = textarea.selectionStart;
                const textBeforeCursor = textarea.value.substring(0, selectionStart);
                const textAfterCursor = textarea.value.substring(selectionStart);

                // Update current card content (assuming helper exists)
                helpers.updateCardContent(cardId, textBeforeCursor);
                // If helper doesn't exist, might need: textarea.value = textBeforeCursor; // followed by data update trigger

                // Find next sibling to insert before
                let insertBeforeCardId = null;
                let siblings;
                if (currentCardData.parentId) {
                    siblings = helpers.getChildCards(currentCardData.parentId, currentCardData.columnIndex);
                } else {
                    siblings = helpers.getColumnCards(currentCardData.columnIndex);
                }
                const currentIndex = siblings.findIndex(c => c.id === cardId);
                if (currentIndex !== -1 && currentIndex + 1 < siblings.length) {
                    insertBeforeCardId = siblings[currentIndex + 1].id;
                }

                // Add new card below with the remaining text (focus/scroll is handled by addCard)
                helpers.addCard(currentCardData.columnIndex, currentCardData.parentId, textAfterCursor, insertBeforeCardId);
            }
            // === Alt+Enter: Split Card as Child ===
            else if (altPressed) {
                event.preventDefault();
                console.log(`Shortcut: Alt+Enter (Split Child) on card ${cardId}`);
                const currentCardData = helpers.getCard(cardId);
                if (!currentCardData) return;

                const selectionStart = textarea.selectionStart;
                const textBeforeCursor = textarea.value.substring(0, selectionStart);
                const textAfterCursor = textarea.value.substring(selectionStart);

                 // Update current card content (assuming helper exists)
                helpers.updateCardContent(cardId, textBeforeCursor);
                 // If helper doesn't exist, might need: textarea.value = textBeforeCursor; // followed by data update trigger

                const targetColumnIndex = currentCardData.columnIndex + 1;
                // Add new card as child with the remaining text (focus/scroll is handled by addCard)
                helpers.addCard(targetColumnIndex, cardId, textAfterCursor);
            }
            break;

        // === Down Arrow: Move to Next Card (if on last line) ===
        case 'ArrowDown':
            if (!ctrlPressed && !altPressed) {
                const cursorLine = getCursorLine(textarea);
                const totalLines = getTotalLines(textarea);
                // Check if cursor is on the last line
                // Note: Simple check, doesn't account perfectly for wrapped lines but good enough
                if (cursorLine === totalLines - 1 && textarea.selectionStart === textarea.value.length) {
                    event.preventDefault(); // Prevent default cursor move
                    console.log(`Shortcut: Down (last line) on card ${cardId}`);
                    const currentCardData = helpers.getCard(cardId);
                    if (!currentCardData) return;

                    let siblings;
                    let currentIndex;
                    if (currentCardData.parentId) {
                        siblings = helpers.getChildCards(currentCardData.parentId, currentCardData.columnIndex);
                        // Go to next column card
                        currentIndex = siblings.findIndex(c => c.id === cardId);
                        if (currentIndex + 1 >= siblings.length) {
                            siblings = helpers.getColumnCards(currentCardData.columnIndex);
                        }
                    } else {
                        siblings = helpers.getColumnCards(currentCardData.columnIndex);
                    }
                    currentIndex = siblings.findIndex(c => c.id === cardId);
                    if (currentIndex !== -1 && currentIndex + 1 < siblings.length) {
                        const nextCardId = siblings[currentIndex + 1].id;
                        helpers.focusCardTextarea(nextCardId, 'start'); // Focus start of next card
                    }
                }
            }
            // === Alt+Down: Move Focus to Next Card ===
            else if (altPressed && !ctrlPressed) {
                event.preventDefault();
                console.log(`Shortcut: Alt+Down on card ${cardId}`);
                const currentCardData = helpers.getCard(cardId);
                if (!currentCardData) return;

                let siblings;
                let currentIndex;
                if (currentCardData.parentId) {
                    siblings = helpers.getChildCards(currentCardData.parentId, currentCardData.columnIndex);
                    // Go to next column card
                    currentIndex = siblings.findIndex(c => c.id === cardId);
                    if (currentIndex + 1 >= siblings.length) {
                        siblings = helpers.getColumnCards(currentCardData.columnIndex);
                    }
                } else {
                    siblings = helpers.getColumnCards(currentCardData.columnIndex);
                }
                currentIndex = siblings.findIndex(c => c.id === cardId);
                if (currentIndex !== -1 && currentIndex + 1 < siblings.length) {
                    const nextCardId = siblings[currentIndex + 1].id;
                    helpers.focusCardTextarea(nextCardId, 'preserve'); // Preserve position if possible, otherwise start
                }
            }
            break;

        // === Up Arrow: Move to Previous Card (if on first line) ===
        case 'ArrowUp':
             if (!ctrlPressed && !altPressed) {
                const cursorLine = getCursorLine(textarea);
                // Check if cursor is on the first line
                if (cursorLine === 0 && textarea.selectionStart === 0) {
                    event.preventDefault(); // Prevent default cursor move
                    console.log(`Shortcut: Up (first line) on card ${cardId}`);
                    const currentCardData = helpers.getCard(cardId);
                    if (!currentCardData) return;

                    let siblings;
                    let currentIndex;
                    if (currentCardData.parentId) {
                        siblings = helpers.getChildCards(currentCardData.parentId, currentCardData.columnIndex);
                        // Go to prev column card
                        currentIndex = siblings.findIndex(c => c.id === cardId);
                        if (currentIndex <= 0) {
                            siblings = helpers.getColumnCards(currentCardData.columnIndex);
                        }
                    } else {
                        siblings = helpers.getColumnCards(currentCardData.columnIndex);
                    }
                    currentIndex = siblings.findIndex(c => c.id === cardId);
                    if (currentIndex > 0) {
                        const prevCardId = siblings[currentIndex - 1].id;
                        helpers.focusCardTextarea(prevCardId, 'end'); // Focus end of previous card
                    }
                }
            }
            // === Alt+Up: Move Focus to Previous Card ===
            else if (altPressed && !ctrlPressed) {
                event.preventDefault();
                console.log(`Shortcut: Alt+Up on card ${cardId}`);
                const currentCardData = helpers.getCard(cardId);
                if (!currentCardData) return;

                let siblings;
                let currentIndex;
                if (currentCardData.parentId) {
                    siblings = helpers.getChildCards(currentCardData.parentId, currentCardData.columnIndex);
                    // Go to prev column card
                    currentIndex = siblings.findIndex(c => c.id === cardId);
                    if (currentIndex <= 0) {
                        siblings = helpers.getColumnCards(currentCardData.columnIndex);
                    }
                } else {
                    siblings = helpers.getColumnCards(currentCardData.columnIndex);
                }
                currentIndex = siblings.findIndex(c => c.id === cardId);
                if (currentIndex > 0) {
                    const prevCardId = siblings[currentIndex - 1].id;
                    helpers.focusCardTextarea(prevCardId, 'preserve'); // Preserve position if possible, otherwise end
                }
            }
            break;

        // === Alt+Left: Move Focus to Parent Card ===
        case 'ArrowLeft':
            if (altPressed && !ctrlPressed) {
                event.preventDefault();
                console.log(`Shortcut: Alt+Left on card ${cardId}`);
                const currentCardData = helpers.getCard(cardId);
                if (!currentCardData || !currentCardData.parentId) return; // Must have a parent

                helpers.focusCardTextarea(currentCardData.parentId, 'end'); // Focus end of parent card
            }
            break;

        // === Alt+Right: Move Focus to First Child Card ===
        case 'ArrowRight':
            if (altPressed && !ctrlPressed) {
                event.preventDefault();
                console.log(`Shortcut: Alt+Right on card ${cardId}`);
                const currentCardData = helpers.getCard(cardId);
                if (!currentCardData) return;

                const childColumnIndex = currentCardData.columnIndex + 1;
                const children = helpers.getChildCards(cardId, childColumnIndex); // Get children in next column

                if (children.length > 0) {
                    const firstChildId = children[0].id;
                    helpers.focusCardTextarea(firstChildId, 'start'); // Focus start of first child
                }
            }
            break;

        // === Backspace: Merge with Previous Card (if at start) ===
        case 'Backspace':
            if (!ctrlPressed && !altPressed && textarea.selectionStart === 0 && textarea.selectionEnd === 0) {
                event.preventDefault();
                console.log(`Shortcut: Backspace (start) on card ${cardId}`);
                const currentCardData = helpers.getCard(cardId);
                if (!currentCardData) return;

                let siblings;
                let currentIndex;
                if (currentCardData.parentId) {
                    siblings = helpers.getChildCards(currentCardData.parentId, currentCardData.columnIndex);
                } else {
                    siblings = helpers.getColumnCards(currentCardData.columnIndex);
                }
                currentIndex = siblings.findIndex(c => c.id === cardId);

                if (currentIndex > 0) {
                    const prevCardId = siblings[currentIndex - 1].id;
                    const prevCardData = helpers.getCard(prevCardId);
                    if (!prevCardData) return;

                    const currentContent = textarea.value;
                    const prevContent = prevCardData.content || ''; // Handle potentially undefined content
                    const mergedContent = prevContent + currentContent;
                    // Position cursor at the point of merge in the previous card
                    const newCursorPos = prevContent.length;

                    // 1. Update previous card content
                    helpers.updateCardContent(prevCardId, mergedContent);
                    // 2. Reparent children of current card to previous card
                    helpers.reparentChildren(cardId, prevCardId);
                    // 3. Delete *only* the current card (data and DOM)
                    helpers.deleteCardInternal(cardId); // Use internal delete
                    // 4. Focus previous card at the merge point
                    helpers.focusCardTextarea(prevCardId, newCursorPos);
                    // Re-rendering is handled by reparentChildren and deleteCardInternal indirectly
                }
            }
            break;

        // === Delete: Merge with Next Card (if at end) ===
        case 'Delete':
            if (!ctrlPressed && !altPressed && textarea.selectionStart === textarea.value.length && textarea.selectionEnd === textarea.value.length) {
                event.preventDefault();
                console.log(`Shortcut: Delete (end) on card ${cardId}`);
                const currentCardData = helpers.getCard(cardId);
                if (!currentCardData) return;

                let siblings;
                let currentIndex;
                 if (currentCardData.parentId) {
                    siblings = helpers.getChildCards(currentCardData.parentId, currentCardData.columnIndex);
                } else {
                    siblings = helpers.getColumnCards(currentCardData.columnIndex);
                }
                currentIndex = siblings.findIndex(c => c.id === cardId);

                if (currentIndex !== -1 && currentIndex + 1 < siblings.length) {
                    const nextCardId = siblings[currentIndex + 1].id;
                    const nextCardData = helpers.getCard(nextCardId);
                    if (!nextCardData) return;

                    const currentContent = textarea.value;
                    const nextContent = nextCardData.content || ''; // Handle potentially undefined content
                    const mergedContent = currentContent + nextContent;
                    const currentCursorPos = currentContent.length; // Cursor stays at the end of the original content

                    // 1. Update current card content
                    helpers.updateCardContent(cardId, mergedContent);
                    // 2. Reparent children of next card to current card
                    helpers.reparentChildren(nextCardId, cardId);
                    // 3. Delete *only* the next card (data and DOM)
                    helpers.deleteCardInternal(nextCardId); // Use internal delete
                    // 4. Focus current card at the merge point
                    helpers.focusCardTextarea(cardId, currentCursorPos);
                     // Re-rendering is handled by reparentChildren and deleteCardInternal indirectly
                }
            }
            break;
    }
}

// Make the handler available (e.g., attaching to window or exporting if using modules)
// Simple approach for now: attach to window
window.cardShortcuts = {
    handleCardTextareaKeydown
};
