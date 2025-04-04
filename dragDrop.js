// --- State ---
let draggedCardId = null;
let dragIndicator = null;

// --- DOM Helpers (to be passed in) ---
let getCardElement = (id) => null;
let getColumnIndex = (el) => -1;

// --- Data Helpers (to be passed in) ---
let getCardData = (id) => null;
let moveCardData = (cardId, targetColumnIndex, newParentId, insertBeforeCardId) => ({ success: false });

// --- Drag Indicator Management ---
function ensureDragIndicator() {
    if (!dragIndicator) {
        dragIndicator = document.createElement('div');
        dragIndicator.className = 'drag-over-indicator';
        dragIndicator.style.display = 'none';
        document.body.appendChild(dragIndicator);
    }
}

function clearDragStyles(removeIndicatorInstance = true) {
    document.querySelectorAll('.drag-over-card, .drag-over-group, .drag-over-empty').forEach(el => {
        el.classList.remove('drag-over-card', 'drag-over-group', 'drag-over-empty');
    });
    if (dragIndicator) {
        dragIndicator.style.display = 'none';
        if (removeIndicatorInstance && dragIndicator.parentNode) {
            dragIndicator.parentNode.removeChild(dragIndicator);
            dragIndicator = null;
        }
    }
}

// --- Event Handlers ---

function handleDragStart(event) {
    // Prevent dragging buttons within the header
    if (event.target.tagName === 'BUTTON' || event.target.closest('button')) {
        event.preventDefault();
        return;
    }
    const headerEl = event.target.closest('.card-header');
    const cardEl = headerEl ? headerEl.closest('.card') : null;
    if (!cardEl) {
        event.preventDefault();
        return;
    }

    const cardId = cardEl.dataset.cardId;
    // Check if the card actually exists in the current project's data before proceeding
    if (!getCardData(cardId)) {
         console.warn(`DragStart aborted: Card ${cardId} data not found.`);
         event.preventDefault();
         draggedCardId = null;
         return;
    }

    draggedCardId = cardId;
    event.dataTransfer.setData('text/plain', draggedCardId);
    event.dataTransfer.effectAllowed = 'move';
    requestAnimationFrame(() => cardEl.classList.add('dragging'));
    ensureDragIndicator(); // Create indicator instance if needed
    console.log(`Drag Start: ${draggedCardId}`);
}

function handleDragEnd(event) {
    if (draggedCardId) {
        const cardEl = getCardElement(draggedCardId);
        if (cardEl) cardEl.classList.remove('dragging');
    }
    clearDragStyles(true); // Remove indicator instance
    draggedCardId = null;
    console.log("Drag End");
}

function handleDragOver(event) {
    event.preventDefault();
    if (!draggedCardId) return; // Ensure a drag is in progress

    event.dataTransfer.dropEffect = 'move';
    ensureDragIndicator(); // Make sure it exists

    const targetElement = event.target;
    const targetCard = targetElement.closest('.card');
    const targetGroup = targetElement.closest('.card-group');
    const targetCardsContainer = targetElement.closest('.cards-container');

    clearDragStyles(false); // Don't remove indicator instance yet

    let validDropTarget = false;
    let indicatorParent = null;
    let indicatorNextSibling = null;

    // --- Drop Target Logic ---
    if (targetCard && targetCard.dataset.cardId === draggedCardId) {
         // Cannot drop on self
         validDropTarget = false;
    } else if (targetCard) {
        // Hovering over another card
        const rect = targetCard.getBoundingClientRect();
        const midway = rect.top + rect.height / 2;
        indicatorParent = targetCard.parentNode;
        indicatorNextSibling = (event.clientY < midway) ? targetCard : targetCard.nextSibling;
        targetCard.classList.add('drag-over-card');
        validDropTarget = true;
    } else if (targetGroup) {
        // Hovering over a group container
        const groupParentId = targetGroup.dataset.parentId;
        if (groupParentId === draggedCardId) {
            // Cannot drop into own descendants group
            validDropTarget = false;
        } else {
            targetGroup.classList.add('drag-over-group');
            validDropTarget = true;
            const cardsInGroup = Array.from(targetGroup.querySelectorAll(':scope > .card')); // Direct children only
            let closestCard = null;
            let smallestDistance = Infinity;

            // Find closest card within the group to determine insertion point
            cardsInGroup.forEach(card => {
                const rect = card.getBoundingClientRect();
                const dist = Math.abs(event.clientY - (rect.top + rect.height / 2));
                if (dist < smallestDistance) { smallestDistance = dist; closestCard = card; }
            });

            indicatorParent = targetGroup; // Indicator goes inside the group div
            if (closestCard) {
                 const rect = closestCard.getBoundingClientRect();
                 indicatorNextSibling = (event.clientY < rect.top + rect.height / 2) ? closestCard : closestCard.nextSibling;
            } else {
                 // If group is empty or hovering over header, insert at the beginning (after header)
                 const header = targetGroup.querySelector('.group-header');
                 indicatorNextSibling = header ? header.nextSibling : targetGroup.firstChild;
            }
        }
    } else if (targetCardsContainer) {
        // Hovering over the empty space in a column's card container
        const columnEl = targetCardsContainer.closest('.column');
        const columnIndex = getColumnIndex(columnEl); // Use DOM helper
        const draggedCardData = getCardData(draggedCardId); // Use data helper
        const draggedCardIsRoot = draggedCardData && !draggedCardData.parentId;

        // Allow dropping as root card only in first column OR if moving an existing root card
        if (draggedCardData && (columnIndex === 0 || draggedCardIsRoot)) {
             targetCardsContainer.classList.add('drag-over-empty');
             validDropTarget = true;
             // Find closest element (card or group) to determine insertion point
             const children = Array.from(targetCardsContainer.children).filter(el => el.matches('.card, .card-group'));
             let closestElement = null;
             let smallestDistance = Infinity;
             children.forEach(el => {
                 // Skip self or own group if dragging a parent card
                 if(el.dataset.cardId === draggedCardId || el.dataset.parentId === draggedCardId) return;
                 const rect = el.getBoundingClientRect();
                 const dist = Math.abs(event.clientY - (rect.top + rect.height / 2));
                 if (dist < smallestDistance) { smallestDistance = dist; closestElement = el; }
             });

             indicatorParent = targetCardsContainer; // Indicator goes inside the cards container
             if (closestElement) {
                 const rect = closestElement.getBoundingClientRect();
                 indicatorNextSibling = (event.clientY < rect.top + rect.height / 2) ? closestElement : closestElement.nextSibling;
             } else {
                 indicatorNextSibling = null; // Append to end if container is empty or hovering below all elements
             }
         } else {
            // Cannot drop non-root card into empty space of non-first column
            validDropTarget = false;
         }
    } else {
        // Hovering over something else (column toolbar, etc.)
        validDropTarget = false;
    }

    // --- Position Indicator ---
    if (validDropTarget && indicatorParent && dragIndicator) {
         if(indicatorNextSibling) {
             indicatorParent.insertBefore(dragIndicator, indicatorNextSibling);
         } else {
             indicatorParent.appendChild(dragIndicator);
         }
         dragIndicator.style.display = 'block';
    } else if (dragIndicator) {
         dragIndicator.style.display = 'none';
    }
}

function handleDragEnter(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!draggedCardId) return; // Ignore if not dragging

    const targetGroup = event.target.closest('.card-group');
    const targetCardsContainer = event.target.closest('.cards-container');
    const targetCard = event.target.closest('.card');

    // Don't highlight self or own group
    if (targetCard && targetCard.dataset.cardId === draggedCardId) return;
    if (targetGroup && targetGroup.dataset.parentId === draggedCardId) return;

    // Add highlight class to the direct target container
     if (targetGroup) targetGroup.classList.add('drag-over-group');
     else if (targetCardsContainer) targetCardsContainer.classList.add('drag-over-empty');
     else if (targetCard) targetCard.classList.add('drag-over-card');
}

function handleDragLeave(event) {
     event.stopPropagation();
     if (!draggedCardId) return;

    const relatedTarget = event.relatedTarget; // Element being entered
    const currentTarget = event.currentTarget; // Element being left
    const leavingValidTarget = currentTarget.matches('.card, .card-group, .cards-container');

    // Only remove highlight if moving outside the current target element entirely
    if (leavingValidTarget && (!relatedTarget || !currentTarget.contains(relatedTarget))) {
         currentTarget.classList.remove('drag-over-card', 'drag-over-group', 'drag-over-empty');
          // Hide indicator if leaving the container it's currently in
          if (dragIndicator && dragIndicator.parentNode === currentTarget) {
               dragIndicator.style.display = 'none';
          }
    }
    // Clean up highlights within nested containers if leaving them
     if (currentTarget.matches('.cards-container, .card-group')) {
        if (!currentTarget.contains(relatedTarget)) {
            currentTarget.querySelectorAll('.drag-over-card, .drag-over-group, .drag-over-empty')
                .forEach(el => el.classList.remove('drag-over-card', 'drag-over-group', 'drag-over-empty'));
        }
     }
}

function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    console.log("Drop event fired");

    const droppedCardId = event.dataTransfer.getData('text/plain');
    // Final validation checks
    if (!droppedCardId || !draggedCardId || droppedCardId !== draggedCardId) {
        console.warn("Drop aborted: Mismatched or missing card ID.");
        clearDragStyles(true); draggedCardId = null; return;
    }
    const droppedCardData = getCardData(droppedCardId); // Check data exists
    if (!droppedCardData) {
         console.error("Drop aborted: Dragged card data not found.");
         clearDragStyles(true); draggedCardId = null; return;
    }
    if (!dragIndicator || dragIndicator.style.display === 'none' || !dragIndicator.parentNode) {
        console.warn("Drop aborted: No valid drop indicator position.");
        clearDragStyles(true); draggedCardId = null; return;
    }

    // --- Determine Drop Location ---
    const indicatorParent = dragIndicator.parentNode;
    const insertBeforeElement = dragIndicator.nextElementSibling; // Element the indicator is before

    let targetColumnIndex = -1;
    let newParentId = null;
    let insertBeforeCardId = null; // ID of the card to insert before

    const targetColumnEl = indicatorParent.closest('.column');
    if (!targetColumnEl) {
         console.warn("Drop aborted: Indicator not within a column.");
         clearDragStyles(true); draggedCardId = null; return;
    }
    targetColumnIndex = getColumnIndex(targetColumnEl); // Use DOM helper

    // Determine parent based on indicator's container
    if (indicatorParent.classList.contains('card-group')) {
         newParentId = indicatorParent.dataset.parentId;
         // Final check: cannot drop into own child group
         if (newParentId === droppedCardId) {
             console.warn("Drop aborted: Cannot drop into own child group (final check).");
             clearDragStyles(true); draggedCardId = null; return;
         }
    } else if (indicatorParent.classList.contains('cards-container')) {
        // Dropped into empty column space
             newParentId = null; // Target is to become a root card (or stay root)
             const draggedCardIsRoot = !droppedCardData.parentId;
             // Final checks:
             // 1. Non-root card cannot be dropped into empty space of non-first column.
             if (targetColumnIndex > 0 && !draggedCardIsRoot) {
                 console.warn(`Drop aborted: Cannot drop non-root card into empty space of column ${targetColumnIndex}.`);
                 clearDragStyles(true); draggedCardId = null; return;
             }
             // 2. Root card cannot be dropped into empty space of non-first column.
             if (targetColumnIndex > 0 && draggedCardIsRoot) {
                 console.warn(`Drop aborted: Cannot drop root card into empty space of column ${targetColumnIndex}.`);
                 clearDragStyles(true); draggedCardId = null; return;
             }
         } else {
        // Should not happen if dragOver logic is correct
        console.warn("Drop aborted: Indicator parent is not group or container.", indicatorParent);
        clearDragStyles(true); draggedCardId = null; return;
    }

    // Determine the card ID to insert before, if any
    if (insertBeforeElement && insertBeforeElement.classList.contains('card')) {
        // Indicator is before a card
        insertBeforeCardId = insertBeforeElement.dataset.cardId;
    } else if (insertBeforeElement && insertBeforeElement.classList.contains('card-group')) {
        // Indicator is before a group, means insert before the *first card* in that group
         const firstCardInGroup = insertBeforeElement.querySelector('.card');
         insertBeforeCardId = firstCardInGroup ? firstCardInGroup.dataset.cardId : null;
         // If inserting before an empty group, treat as appending to the element before the group
         // This case needs careful handling in moveCardData based on sibling orders.
         // For simplicity here, we pass the ID of the first card if it exists.
    } else {
         // Indicator is at the end of the container (or container is empty)
         insertBeforeCardId = null; // Append
    }

    // Final check: cannot insert relative to self
    if (insertBeforeCardId === droppedCardId) {
         console.warn("Drop aborted: Attempting to insert relative to self.");
         clearDragStyles(true); draggedCardId = null; return;
    }

    console.log(`Drop details: Card ${droppedCardId} -> Col ${targetColumnIndex}, Parent ${newParentId || 'root'}, Before ${insertBeforeCardId || 'end'}`);

    // --- Call Data Layer ---
    // moveCardData should handle all data updates (order, parent, column, descendants, colors)
    // It should return information needed for the UI layer to re-render efficiently.
    const moveResult = moveCardData(droppedCardId, targetColumnIndex, newParentId, insertBeforeCardId);

    // --- Trigger UI Update (Responsibility of script.js) ---
    // The main script will need to observe the result of moveCardData
    // and call render functions for the affected columns.
    // Example (pseudo-code, actual call happens in script.js):
    // if (moveResult.success) {
    //     renderAffectedColumns(moveResult.affectedColumns);
    //     if (moveResult.rootColorsUpdated) {
    //         renderColumn(0); // Ensure root column is re-rendered if colors changed
    //     }
    //     updateAllToolbarButtons();
    //     saveProjectsData(); // Save after successful move and render
    // }

    clearDragStyles(true); // Clean up UI
    draggedCardId = null; // Reset state
}


// --- Initialization ---

/**
 * Initializes drag and drop functionality.
 * @param {HTMLElement} columnsContainerEl - The main container holding the columns.
 * @param {object} dataHelpers - Object containing functions to interact with data { getCard, moveCardData }.
 * @param {object} domHelpers - Object containing functions to interact with DOM { getCardElement, getColumnIndex }.
 */
function initializeDragDrop(columnsContainerEl, dataHelpers, domHelpers) {
    // Store helpers
    getCardData = dataHelpers.getCard;
    moveCardData = dataHelpers.moveCardData;
    getCardElement = domHelpers.getCardElement;
    getColumnIndex = domHelpers.getColumnIndex;

    // Use event delegation on the main container
    columnsContainerEl.addEventListener('dragstart', handleDragStart);
    columnsContainerEl.addEventListener('dragend', handleDragEnd);
    columnsContainerEl.addEventListener('dragover', handleDragOver);
    columnsContainerEl.addEventListener('dragenter', handleDragEnter);
    columnsContainerEl.addEventListener('dragleave', handleDragLeave);
    columnsContainerEl.addEventListener('drop', handleDrop);

    console.log("Drag and drop initialized.");
}

export { initializeDragDrop };
