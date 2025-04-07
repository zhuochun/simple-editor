// --- Constants ---
const CSS_CLASSES = {
    DRAGGING: 'dragging',
    INDICATOR: 'drag-over-indicator',
    OVER_CARD: 'drag-over-card', // For insertion indicator relative to card
    OVER_GROUP: 'drag-over-group',
    OVER_EMPTY: 'drag-over-empty',
    OVER_PARENT: 'drag-over-parent' // For dropping onto a card as parent
};

// --- State ---
let draggedCardId = null;
let draggedElement = null; // Store the element being dragged
let dragIndicator = null;
let scrollIntervalId = null; // To store the interval ID for scrolling
let currentScrollContainer = null; // Track the container being scrolled
let scrollAnimationFrameId = null; // Track the requestAnimationFrame ID

// --- Constants ---
const SCROLL_SPEED = 10; // Pixels per frame
const SCROLL_TRIGGER_ZONE_HEIGHT = 50; // Pixels from top/bottom edge to trigger scroll

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
    // Also remove the new parent highlight class
    const classesToRemove = [
        CSS_CLASSES.OVER_CARD,
        CSS_CLASSES.OVER_GROUP,
        CSS_CLASSES.OVER_EMPTY,
        CSS_CLASSES.OVER_PARENT
    ];
    document.querySelectorAll(`.${classesToRemove.join(', .')}`).forEach(el => {
        el.classList.remove(...classesToRemove);
    });
    if (dragIndicator) {
        dragIndicator.style.display = 'none';
        if (removeIndicatorInstance && dragIndicator.parentNode) {
            dragIndicator.parentNode.removeChild(dragIndicator);
            dragIndicator = null;
        }
    }
}

// --- Auto-Scroll Helpers ---

function stopScrolling() {
    if (scrollAnimationFrameId) {
        cancelAnimationFrame(scrollAnimationFrameId);
        scrollAnimationFrameId = null;
    }
    currentScrollContainer = null; // Clear the reference
}

function startScrolling(container, direction) {
    // If already scrolling the same container in the same direction, do nothing
    if (currentScrollContainer === container && scrollAnimationFrameId) {
        // We might still need to update direction if the cursor moved from top to bottom edge quickly,
        // but for simplicity, we assume stop/start will handle this.
        return;
    }

    stopScrolling(); // Stop any previous scrolling first

    currentScrollContainer = container;

    const scroll = () => {
        if (!currentScrollContainer || currentScrollContainer !== container) {
             // Stop if the container changed or was cleared
             scrollAnimationFrameId = null;
             return;
        }

        const scrollAmount = direction === 'up' ? -SCROLL_SPEED : SCROLL_SPEED;
        currentScrollContainer.scrollTop += scrollAmount;

        // Continue scrolling as long as the container reference is set and matches
        scrollAnimationFrameId = requestAnimationFrame(scroll);
    };

    // Start the animation frame loop
    scrollAnimationFrameId = requestAnimationFrame(scroll);
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
    draggedElement = cardEl; // Store the actual element
    event.dataTransfer.setData('text/plain', draggedCardId);
    event.dataTransfer.effectAllowed = 'move';
    // Use rAF for potentially smoother visual start, checking element still exists
    requestAnimationFrame(() => {
        // Check if the drag is still associated with this element
        if (draggedElement === cardEl) {
             draggedElement.classList.add(CSS_CLASSES.DRAGGING);
        }
    });
    ensureDragIndicator(); // Create indicator instance if needed
    console.log(`Drag Start: ID = ${draggedCardId}`);
    // Add logging to confirm state *after* assignment
    console.log(`handleDragStart End: draggedCardId = ${draggedCardId}, draggedElement =`, draggedElement);
}

function handleDragEnd(event) {
    console.log("handleDragEnd called");
    console.log(`handleDragEnd Start: draggedCardId = ${draggedCardId}, draggedElement =`, draggedElement);

    // Prioritize using the stored element reference for cleanup
    if (draggedElement) {
        draggedElement.classList.remove(CSS_CLASSES.DRAGGING);
        console.log(`handleDragEnd: Removed '${CSS_CLASSES.DRAGGING}' class using stored draggedElement`, draggedElement);
    } else if (draggedCardId) {
        // Fallback: Try using the ID if the element reference was lost
        console.warn(`handleDragEnd: draggedElement was null, attempting fallback using ID: ${draggedCardId}`);
        const cardEl = getCardElement(draggedCardId);
        if (cardEl) {
            cardEl.classList.remove(CSS_CLASSES.DRAGGING);
            console.log(`handleDragEnd: Fallback - Removed '${CSS_CLASSES.DRAGGING}' class from element found via ID`, cardEl);
        } else {
            console.error(`handleDragEnd: Fallback failed - Could not find card element for ID ${draggedCardId}`);
        }
    } else {
        // If both are null, we can't do much
        console.error("handleDragEnd: Both draggedElement and draggedCardId are null. Cannot remove 'dragging' class.");
    }

    // Final cleanup
    stopScrolling(); // Ensure scrolling stops on drag end
    clearDragStyles(true); // Remove indicator instance and .drag-over-* styles
    draggedCardId = null; // Reset state
    draggedElement = null; // Reset state
    console.log("Drag End: State cleared.");
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
    const scrollContainer = targetCardsContainer || targetGroup?.closest('.cards-container'); // Find the scrollable parent

    clearDragStyles(false); // Don't remove indicator instance yet

    // --- Auto-Scroll Logic ---
    if (scrollContainer) {
        const containerRect = scrollContainer.getBoundingClientRect();
        const mouseY = event.clientY;

        if (mouseY < containerRect.top + SCROLL_TRIGGER_ZONE_HEIGHT) {
            // Near top edge
            startScrolling(scrollContainer, 'up');
        } else if (mouseY > containerRect.bottom - SCROLL_TRIGGER_ZONE_HEIGHT) {
            // Near bottom edge
            startScrolling(scrollContainer, 'down');
        } else {
            // Not near edges - stop scrolling *this specific container*
            if (currentScrollContainer === scrollContainer) {
                 stopScrolling();
            }
        }
        // Keep track of the container we are potentially scrolling, even if not actively scrolling now
        // This helps handleDragLeave know if it needs to stop scrolling for this container.
        // Note: We don't reset currentScrollContainer here if not scrolling, handleDragLeave needs it.
    } else {
        // Not hovering over a scrollable area or its children
        stopScrolling(); // Stop any scrolling if cursor moves outside all scrollable areas
    }
    // --- End Auto-Scroll Logic ---


    let validDropTarget = false;
    let indicatorParent = null;
    let indicatorNextSibling = null;
    let isOverParentTarget = false; // Flag for dropping onto a card

    // --- Drop Target Logic ---
    if (targetCard && targetCard.dataset.cardId === draggedCardId) {
         // Cannot drop on self
         validDropTarget = false;
    } else if (targetCard) {
        // Hovering directly over another card - potential parent drop
        targetCard.classList.add(CSS_CLASSES.OVER_PARENT); // Highlight target card itself
        isOverParentTarget = true;
        validDropTarget = true;
        // Hide the insertion indicator when targeting a card as parent
        if (dragIndicator) dragIndicator.style.display = 'none';
    } else if (targetGroup) {
        // Hovering over a group container (for insertion)
        const groupParentId = targetGroup.dataset.parentId;
        if (groupParentId === draggedCardId) {
            // Cannot drop into own descendants group
             validDropTarget = false;
         } else {
            targetGroup.classList.add(CSS_CLASSES.OVER_GROUP);
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
              targetCardsContainer.classList.add(CSS_CLASSES.OVER_EMPTY);
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

    // --- Position Indicator (Only if NOT dropping onto a card as parent) ---
    if (validDropTarget && !isOverParentTarget && indicatorParent && dragIndicator) {
         if(indicatorNextSibling) {
             indicatorParent.insertBefore(dragIndicator, indicatorNextSibling);
         } else {
             indicatorParent.appendChild(dragIndicator);
         }
         dragIndicator.style.display = 'block';
    } else if (!isOverParentTarget && dragIndicator) {
         // Hide indicator if not a valid target OR if it's a parent target
         dragIndicator.style.display = 'none';
    }
    // If it *is* a parent target, the indicator was already hidden earlier.
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
     // Removed class additions here. handleDragOver is now solely responsible
     // for adding the appropriate drag-over classes (.drag-over-parent,
     // .drag-over-group, .drag-over-empty) based on the precise hover target.
     // This prevents potential conflicts between handleDragEnter and handleDragOver.
     // if (targetGroup) targetGroup.classList.add(CSS_CLASSES.OVER_GROUP);
     // else if (targetCardsContainer) targetCardsContainer.classList.add(CSS_CLASSES.OVER_EMPTY);
     // else if (targetCard) targetCard.classList.add(CSS_CLASSES.OVER_CARD); // Avoids conflict with OVER_PARENT
  }

  function handleDragLeave(event) {
     event.stopPropagation();
     if (!draggedCardId) return;

    const relatedTarget = event.relatedTarget; // Element being entered
    const currentTarget = event.currentTarget; // Element being left
    const leavingValidTarget = currentTarget.matches('.card, .card-group, .cards-container');

    // Let handleDragOver manage clearing/setting hover styles as the cursor moves.
    // Let handleDragEnd / handleDrop handle the final cleanup.
    // We only need to potentially hide the indicator here if the cursor is truly leaving
    // the element that currently contains the indicator.
    const isLeavingIndicatorParent = dragIndicator && dragIndicator.parentNode === currentTarget;
    const isMovingToChild = relatedTarget && currentTarget.contains(relatedTarget);

    // Hide indicator if moving from the indicator's parent to somewhere outside of it.
    if (isLeavingIndicatorParent && !isMovingToChild && dragIndicator) {
        // handleDragOver will display it again if needed when entering a new valid parent.
        dragIndicator.style.display = 'none';
    }

    // --- Stop Scrolling on Leave ---
    // Check if we are leaving the container that is currently being scrolled (or was last hovered over)
    const leavingScrollContainer = currentScrollContainer === currentTarget;
    // Check if we are moving *into* a child of the container we are leaving
    const enteringChildOfScrollContainer = relatedTarget && currentTarget.contains(relatedTarget);

    // Stop scrolling only if we are truly leaving the scroll container area
    // (i.e., not just moving between elements *within* the same container).
    if (leavingScrollContainer && !enteringChildOfScrollContainer) {
        stopScrolling();
    }
    // --- End Stop Scrolling ---
}

function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    stopScrolling(); // Stop scrolling immediately on drop
    console.log("Drop event fired");

    const droppedCardId = event.dataTransfer.getData('text/plain');
    // Final validation checks
    if (!droppedCardId || !draggedCardId || droppedCardId !== draggedCardId) {
        console.warn("Drop aborted: Mismatched or missing card ID.");
        clearDragStyles(true); /* Let handleDragEnd clear state */ return;
    }
    const droppedCardData = getCardData(droppedCardId); // Check data exists
    if (!droppedCardData) {
         console.error("Drop aborted: Dragged card data not found.");
          clearDragStyles(true); /* Let handleDragEnd clear state */ return;
     }
     // Removed the initial broad indicator check here. It prevented valid drops onto parent cards
     // where the indicator is intentionally hidden. Indicator validity is checked in Scenario 2 below.

     let targetColumnIndex = -1; // Declare only once
     let newParentId = null;
     let insertBeforeCardId = null; // ID of the card to insert before (null means append or drop as child)

     // --- Determine Drop Target ---
     const directTargetElement = document.elementFromPoint(event.clientX, event.clientY);
    const targetCardElement = directTargetElement ? directTargetElement.closest('.card') : null;

    // Scenario 1: Dropped directly onto another card to make it a child
    if (targetCardElement && targetCardElement.dataset.cardId !== droppedCardId) {
        const targetCardId = targetCardElement.dataset.cardId;
        console.log(`Drop detected directly onto card ${targetCardId}`);
        newParentId = targetCardId;
        insertBeforeCardId = null; // Append as last child within the new parent

        const targetCardColumnEl = targetCardElement.closest('.column');
        if (!targetCardColumnEl) {
            console.error("Drop aborted: Target parent card not within a column.");
             clearDragStyles(true); /* Let handleDragEnd clear state */ return;
         }
         const parentColumnIndex = getColumnIndex(targetCardColumnEl); // Get parent's column index
         targetColumnIndex = parentColumnIndex + 1; // Set target column to be the *next* one

         // Add any necessary validation (e.g., prevent dropping root into non-root, etc.)
         // This might depend on your specific rules defined in moveCardData

    }
     // Scenario 2: Dropped between cards or into a group/empty space (using indicator)
     else if (dragIndicator && dragIndicator.parentNode) { // Check if indicator exists and has a parent
         // Now, specifically for indicator-based drops, check if it was visible/validly positioned
         if (dragIndicator.style.display === 'none') {
             console.warn("Drop aborted: Indicator was not visible for an insertion drop.");
             clearDragStyles(true); /* Let handleDragEnd clear state */ return;
         }

         console.log("Drop detected based on indicator position");
         const indicatorParent = dragIndicator.parentNode;
         const insertBeforeElement = dragIndicator.nextElementSibling; // Element the indicator is before

        const targetColumnEl = indicatorParent.closest('.column');
        if (!targetColumnEl) {
             console.warn("Drop aborted: Indicator not within a column.");
             clearDragStyles(true); /* Let handleDragEnd clear state */ return;
        }
        targetColumnIndex = getColumnIndex(targetColumnEl); // Use DOM helper

        // Determine parent based on indicator's container
        if (indicatorParent.classList.contains('card-group')) {
             newParentId = indicatorParent.dataset.parentId;
             // Final check: cannot drop into own child group
             if (newParentId === droppedCardId) {
                 console.warn("Drop aborted: Cannot drop into own child group (final check).");
                 clearDragStyles(true); /* Let handleDragEnd clear state */ return;
             }
        } else if (indicatorParent.classList.contains('cards-container')) {
            // Dropped into empty column space
                 newParentId = null; // Target is to become a root card (or stay root)
                 const draggedCardIsRoot = !droppedCardData.parentId;
                 // Final checks:
                 // 1. Non-root card cannot be dropped into empty space of non-first column.
                 if (targetColumnIndex > 0 && !draggedCardIsRoot) {
                     console.warn(`Drop aborted: Cannot drop non-root card into empty space of column ${targetColumnIndex}.`);
                     clearDragStyles(true); /* Let handleDragEnd clear state */ return;
                 }
                 // 2. Root card cannot be dropped into empty space of non-first column.
                 if (targetColumnIndex > 0 && draggedCardIsRoot) {
                     console.warn(`Drop aborted: Cannot drop root card into empty space of column ${targetColumnIndex}.`);
                     clearDragStyles(true); /* Let handleDragEnd clear state */ return;
                 }
             } else {
            // Should not happen if dragOver logic is correct
            console.warn("Drop aborted: Indicator parent is not group or container.", indicatorParent);
            clearDragStyles(true); /* Let handleDragEnd clear state */ return;
        }

        // Determine the card ID to insert before, if any (based on indicator)
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
             clearDragStyles(true); /* Let handleDragEnd clear state */ return;
        }

    }
    // Scenario 3: Invalid drop (no target card, no valid indicator)
    else {
        console.warn("Drop aborted: Invalid drop location (not on card, no valid indicator).");
        clearDragStyles(true); /* Let handleDragEnd clear state */ return;
    }


    // --- Call Data Layer ---
    // Ensure targetColumnIndex was set
    if (targetColumnIndex === -1) {
        console.error("Drop aborted: Target column index could not be determined.");
        clearDragStyles(true); /* Let handleDragEnd clear state */ return;
    }

    console.log(`Drop details: Card ${droppedCardId} -> Col ${targetColumnIndex}, Parent ${newParentId || 'root'}, Before ${insertBeforeCardId || 'end'}`);

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
    draggedElement = null; // Reset state
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
