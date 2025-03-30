document.addEventListener('DOMContentLoaded', () => {
    const columnsContainer = document.getElementById('columnsContainer');
    let appData = { columns: [], cards: {} }; // { columns: [colId1, colId2], cards: {cardId: { ... }} }
    let draggedCardId = null;
    let dragIndicator = null;
    const MIN_COLUMNS = 3;
    const BASE_COLOR_HUE = 200; // Bluish base
    const BASE_COLOR_SATURATION = 30;
    const BASE_COLOR_LIGHTNESS = 90; // Start light
    const LIGHTNESS_STEP_DOWN = 7; // How much darker each level gets

    // --- Data Management ---

    function generateId() {
        // More robust ID: timestamp + longer random part
        return Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
    }

    function saveData() {
        try {
            localStorage.setItem('writingToolData', JSON.stringify(appData));
        } catch (e) {
            console.error("Error saving data to localStorage:", e);
            alert("Could not save data. LocalStorage might be full or disabled.");
        }
    }

    function loadData() {
        const savedData = localStorage.getItem('writingToolData');
        if (savedData) {
            try {
                const parsedData = JSON.parse(savedData);
                // Basic data validation/migration could go here
                if (!parsedData || typeof parsedData !== 'object' || !Array.isArray(parsedData.columns) || typeof parsedData.cards !== 'object') {
                    throw new Error("Invalid data structure");
                }
                appData = parsedData;
                // Ensure essential properties exist on loaded cards (simple migration)
                Object.values(appData.cards).forEach(card => {
                    if (card.order === undefined) card.order = Date.now();
                    if (!card.color) card.color = getColorForCard(card); // Recalc color if missing
                });

            } catch (e) {
                console.error("Error parsing data from localStorage:", e);
                alert("Could not load saved data. Resetting to default.");
                localStorage.removeItem('writingToolData'); // Clear corrupted data
                appData = { columns: [], cards: {} };
                initializeDefaultColumns();
            }
        } else {
            initializeDefaultColumns();
        }
        renderApp();
    }

    function initializeDefaultColumns() {
        appData.columns = [];
        appData.cards = {};
        for (let i = 0; i < MIN_COLUMNS; i++) {
            addColumnInternal(false); // Don't save until all defaults are added
        }
        saveData();
    }

    function getCard(id) {
        return appData.cards[id];
    }

    function getColumnIndex(columnElement) {
        if (!columnElement) return -1;
        return Array.from(columnsContainer.children).indexOf(columnElement);
    }

     function getColumnCards(columnIndex) {
        // Root cards in a specific column
        return Object.values(appData.cards)
               .filter(card => card.columnIndex === columnIndex && !card.parentId)
               .sort((a, b) => a.order - b.order); // Keep sorted
    }

    function getChildCards(parentId, targetColumnIndex = null) {
        // Child cards for a specific parent, optionally filtered by column index
        let children = Object.values(appData.cards)
                         .filter(card => card.parentId === parentId);
        if (targetColumnIndex !== null) {
            children = children.filter(card => card.columnIndex === targetColumnIndex);
        }
        return children.sort((a, b) => a.order - b.order); // Keep sorted
    }


    function getCardElement(cardId) {
        return document.getElementById(`card-${cardId}`);
    }

    function getGroupElement(parentId) {
         return document.getElementById(`group-${parentId}`);
    }

    function getColumnElementByIndex(index) {
        if (index < 0 || index >= columnsContainer.children.length) return null;
        return columnsContainer.children[index];
    }

    function getDescendantIds(cardId) {
        let descendants = [];
        const directChildren = Object.values(appData.cards).filter(card => card.parentId === cardId);
        directChildren.forEach(child => {
            descendants.push(child.id);
            descendants = descendants.concat(getDescendantIds(child.id));
        });
        return descendants;
    }


    function getAncestorIds(cardId) {
        let ancestors = [];
        let currentCard = getCard(cardId);
        while (currentCard && currentCard.parentId) {
            ancestors.push(currentCard.parentId);
            currentCard = getCard(currentCard.parentId);
        }
        return ancestors;
    }

    function getColorForCard(card) {
         if (!card) return `hsl(${BASE_COLOR_HUE}, ${BASE_COLOR_SATURATION}%, ${BASE_COLOR_LIGHTNESS}%)`; // Default fallback

         let level = 0;
         let current = card;
         while(current && current.parentId) {
             level++;
             current = getCard(current.parentId);
         }

         const lightness = Math.max(20, BASE_COLOR_LIGHTNESS - (level * LIGHTNESS_STEP_DOWN)); // Don't go too dark
         const saturation = Math.min(100, BASE_COLOR_SATURATION + (level * (LIGHTNESS_STEP_DOWN / 1.5))); // Increase saturation slightly

         return `hsl(${BASE_COLOR_HUE}, ${saturation}%, ${lightness}%)`;
    }

    function getHighlightColor(baseColor) {
        // Attempt to parse HSL and make it slightly darker/more saturated
        try {
            const match = baseColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
            if (match) {
                const [, h, s, l] = match.map(Number);
                const highlightL = Math.max(15, l - 15); // Darker
                const highlightS = Math.min(100, s + 15); // More saturated
                return `hsl(${h}, ${highlightS}%, ${highlightL}%)`;
            }
        } catch (e) { console.warn("Could not parse color for highlight:", baseColor); }
        // Fallback if parsing fails
        return 'rgba(0, 0, 0, 0.15)'; // Generic darker overlay idea
    }


    // --- DOM Manipulation & Rendering ---

    function createCardElement(card) {
        const cardEl = document.createElement('div');
        cardEl.id = `card-${card.id}`;
        cardEl.className = 'card';
        cardEl.draggable = true;
        cardEl.dataset.cardId = card.id;
        cardEl.style.backgroundColor = card.color;

        cardEl.innerHTML = `
            <div class="card-header">
                <span class="card-id">#${card.id.slice(-4)}</span>
                <div class="card-actions">
                    <button class="add-child-btn" title="Add Child Card">+</button>
                    <button class="delete-card-btn" title="Delete Card">×</button>
                </div>
            </div>
            <textarea class="card-content" placeholder="Enter text...">${card.content || ''}</textarea>
        `;

        // Add event listeners
        cardEl.addEventListener('dragstart', handleDragStart);
        cardEl.addEventListener('dragend', handleDragEnd);
        // Prevent drag over the card itself causing issues with indicator placement
        cardEl.addEventListener('dragenter', (e) => {
             if (e.target.closest('.card') === cardEl) {
                 e.stopPropagation(); // Stop propagating enter to parent containers if over self
             }
             handleDragEnter(e); // Still call general enter handler
        });
         cardEl.addEventListener('dragleave', handleDragLeave);


        const textarea = cardEl.querySelector('.card-content');
        textarea.addEventListener('blur', handleTextareaBlur);
        textarea.addEventListener('focus', handleTextareaFocus);
        textarea.addEventListener('input', autoResizeTextarea); // Auto-resize
        // Initial resize check
        requestAnimationFrame(() => autoResizeTextarea({ target: textarea }));


        cardEl.querySelector('.add-child-btn').addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent card focus/highlighting
            addCard(card.columnIndex + 1, card.id);
        });
        cardEl.querySelector('.delete-card-btn').addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent card focus/highlighting
             deleteCard(card.id);
        });

        return cardEl;
    }

    function createGroupElement(parentId) {
        const parentCard = getCard(parentId);
        if (!parentCard) return null; // Should not happen

        const groupEl = document.createElement('div');
        groupEl.id = `group-${parentId}`;
        groupEl.className = 'card-group';
        groupEl.dataset.parentId = parentId;

        groupEl.innerHTML = `
            <div class="group-header">Children of <strong>#${parentId.slice(-4)}</strong></div>
        `;
        // Cards will be appended here later by renderColumnContent

        // Add drop listeners for adding children directly to group
        groupEl.addEventListener('dragover', handleDragOver);
        groupEl.addEventListener('dragenter', handleDragEnter);
        groupEl.addEventListener('dragleave', handleDragLeave);
        groupEl.addEventListener('drop', handleDrop);


        return groupEl;
    }

    function createColumnElement(columnIndex) {
        const columnEl = document.createElement('div');
        columnEl.className = 'column';
        columnEl.dataset.columnIndex = columnIndex;

        columnEl.innerHTML = `
            <div class="column-toolbar">
                 <div class="toolbar-left">
                     <button class="add-card-btn">Add Card</button>
                 </div>
                 <div class="toolbar-right">
                     <button class="add-column-btn">Add Column</button>
                     <button class="delete-column-btn">Delete Column</button>
                 </div>
            </div>
            <div class="cards-container"></div>
        `;

        const cardsContainer = columnEl.querySelector('.cards-container');

        // Add event listeners
        columnEl.querySelector('.add-card-btn').addEventListener('click', () => addCard(columnIndex, null)); // Root card
        columnEl.querySelector('.add-column-btn').addEventListener('click', addColumn);
        columnEl.querySelector('.delete-column-btn').addEventListener('click', () => deleteColumn(columnIndex));

        // Double click to add card
        cardsContainer.addEventListener('dblclick', (e) => {
             // Ensure click is directly on the container background and it's the first column
             if (e.target === cardsContainer && columnIndex === 0) {
                 addCard(columnIndex, null);
             }
        });

        // Drag listeners for empty column space / reordering root cards
        cardsContainer.addEventListener('dragover', handleDragOver);
        cardsContainer.addEventListener('dragenter', handleDragEnter);
        cardsContainer.addEventListener('dragleave', handleDragLeave);
        cardsContainer.addEventListener('drop', handleDrop);


        return columnEl;
    }

    function renderColumnContent(columnEl, columnIndex) {
        const cardsContainer = columnEl.querySelector('.cards-container');
        cardsContainer.innerHTML = ''; // Clear existing content

        // --- Render Groups first (based on parents in the *previous* column) ---
        if (columnIndex > 0) {
            const potentialParentCards = Object.values(appData.cards)
                .filter(card => card.columnIndex === columnIndex - 1)
                .sort((a, b) => a.order - b.order); // Sort parents to maintain group order

            potentialParentCards.forEach(parentCard => {
                 const groupEl = createGroupElement(parentCard.id);
                 if (!groupEl) return;

                 const childCards = getChildCards(parentCard.id, columnIndex); // Get children *in this column*

                 childCards.forEach(childCard => {
                     const cardEl = createCardElement(childCard);
                     groupEl.appendChild(cardEl); // Append card to its group
                 });

                 cardsContainer.appendChild(groupEl); // Append the group (even if empty)
            });
        }

        // --- Render Root Cards for this column ---
        const rootCardsInColumn = getColumnCards(columnIndex); // Already sorted

        rootCardsInColumn.forEach(card => {
            const cardEl = createCardElement(card);
            cardsContainer.appendChild(cardEl);
        });


         updateToolbarButtons(columnEl, columnIndex);
    }

     function renderApp() {
        columnsContainer.innerHTML = ''; // Clear all columns

        // Ensure correct number of columns based on data
        let maxColumnIndex = MIN_COLUMNS - 1;
        Object.values(appData.cards).forEach(card => {
             maxColumnIndex = Math.max(maxColumnIndex, card.columnIndex);
        });

         // Ensure appData.columns array matches the required columns
         while (appData.columns.length <= maxColumnIndex) {
             addColumnInternal(false); // Add to data model without saving/rendering yet
         }
        // Optional: Trim excess columns from appData.columns if needed (currently implicit)

        // Determine the number of columns to actually render (at least MIN_COLUMNS)
        const columnsToRenderCount = Math.max(MIN_COLUMNS, appData.columns.length);

        for (let i = 0; i < columnsToRenderCount; i++) {
             const columnEl = createColumnElement(i);
             columnsContainer.appendChild(columnEl);
             // Render content AFTER the column element exists in the DOM
             renderColumnContent(columnEl, i);
        }

         // Ensure toolbars are correctly updated after initial render
         updateAllToolbarButtons();

        console.log("App rendered. Data:", JSON.parse(JSON.stringify(appData))); // Deep copy for logging
    }


     function updateToolbarButtons(columnEl, columnIndex) {
         const addCardBtn = columnEl.querySelector('.add-card-btn');
         const addColBtn = columnEl.querySelector('.add-column-btn');
         const delColBtn = columnEl.querySelector('.delete-column-btn');
         const numColumns = columnsContainer.children.length; // Use actual DOM columns count
         const isRightmost = columnIndex === numColumns - 1;

         // Add Card: Only in the first column
         addCardBtn.classList.toggle('hidden', columnIndex !== 0);

         // Add Column: Only in the rightmost column
         addColBtn.classList.toggle('hidden', !isRightmost);

         // Delete Column: Only rightmost, if > MIN_COLUMNS, and if column is empty
         const columnCards = Object.values(appData.cards).filter(card => card.columnIndex === columnIndex);
         const canDelete = isRightmost && numColumns > MIN_COLUMNS && columnCards.length === 0;
         delColBtn.classList.toggle('hidden', !canDelete);
         delColBtn.disabled = !canDelete; // Also disable visually
     }

    function autoResizeTextarea(event) {
        const textarea = event.target;
        // Temporarily shrink, then set to scroll height. Added max-height for sanity.
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.min(textarea.scrollHeight, 500)}px`; // Limit max height
    }

    // --- Event Handlers ---

    function handleTextareaBlur(event) {
        const textarea = event.target;
        const cardEl = textarea.closest('.card');
        if (!cardEl) return; // Card might have been deleted while editing
        const cardId = cardEl.dataset.cardId;
        const card = getCard(cardId);

        if (card && card.content !== textarea.value) {
            card.content = textarea.value;
            saveData();
            console.log(`Card ${cardId} content saved.`);
        }
        cardEl.classList.remove('editing');
        clearHighlights(); // Remove highlights when focus is lost
    }

     function handleTextareaFocus(event) {
         const textarea = event.target;
         const cardEl = textarea.closest('.card');
         const cardId = cardEl.dataset.cardId;

         cardEl.classList.add('editing');
         highlightHierarchy(cardId);
     }

     function highlightHierarchy(cardId) {
         clearHighlights(); // Clear previous highlights

         const targetCard = getCard(cardId);
         if (!targetCard) return;

         const ancestors = getAncestorIds(cardId);
         const descendants = getDescendantIds(cardId);

         const allToHighlight = [cardId, ...ancestors, ...descendants];

         allToHighlight.forEach(id => {
             const cardEl = getCardElement(id);
             if (cardEl) {
                 cardEl.classList.add('highlight');
                 const baseColor = cardEl.style.backgroundColor;
                 const highlightBg = getHighlightColor(baseColor);
                 cardEl.style.backgroundColor = highlightBg; // Apply directly
             }
             // Highlight the corresponding group header if it's a parent
              const groupEl = getGroupElement(id);
              if (groupEl) {
                  groupEl.classList.add('highlight'); // Maybe add specific style for group highlight
              }
         });
     }

     function clearHighlights() {
        document.querySelectorAll('.card.highlight, .card.editing, .card-group.highlight').forEach(el => {
            el.classList.remove('highlight', 'editing');
            if (el.classList.contains('card')) {
                 // Reset background color to original calculated color
                 const card = getCard(el.dataset.cardId);
                 if(card) el.style.backgroundColor = card.color;
                 else el.style.backgroundColor = ''; // Fallback remove inline style
            }
        });
     }

    function handleDragStart(event) {
        // Make sure we're dragging the card, not the textarea or buttons
        const cardEl = event.target.closest('.card');
        if (!cardEl || event.target.tagName === 'TEXTAREA' || event.target.tagName === 'BUTTON') {
            event.preventDefault(); // Prevent dragging from controls inside
            return;
        }

        draggedCardId = cardEl.dataset.cardId;
        event.dataTransfer.setData('text/plain', draggedCardId);
        event.dataTransfer.effectAllowed = 'move';

        // Delay adding class to avoid styling the ghost image
        requestAnimationFrame(() => {
            cardEl.classList.add('dragging');
        });

        // Create visual drag indicator element if it doesn't exist
        if (!dragIndicator) {
            dragIndicator = document.createElement('div');
            dragIndicator.className = 'drag-over-indicator';
            dragIndicator.style.display = 'none'; // Initially hidden
            document.body.appendChild(dragIndicator); // Append to body to avoid interference
        }
        console.log(`Drag Start: ${draggedCardId}`);
    }

    function handleDragEnd(event) {
        if (draggedCardId) {
            const cardEl = getCardElement(draggedCardId);
            if (cardEl) {
                cardEl.classList.remove('dragging');
            }
        }
        clearDragStyles(); // Clears indicator and visual styles
        draggedCardId = null;
        console.log("Drag End");
    }

    function handleDragOver(event) {
        event.preventDefault(); // *** CRITICAL: Allow drop ***
        event.dataTransfer.dropEffect = 'move';

        if (!draggedCardId) return;

        const targetElement = event.target;
        const targetCard = targetElement.closest('.card');
        const targetGroup = targetElement.closest('.card-group');
        const targetCardsContainer = targetElement.closest('.cards-container');

        clearDragStyles(false); // Clear previous styles but keep indicator instance

        let validDropTarget = false;
        let indicatorParent = null;
        let indicatorNextSibling = null;

        if (targetCard && targetCard.dataset.cardId !== draggedCardId) {
             // *** CONSTRAINT: Cannot drop relative to self ***
            // Hovering over another card (for reordering)
            const rect = targetCard.getBoundingClientRect();
            const midway = rect.top + rect.height / 2;
            const parentContainer = targetCard.parentNode; // cardsContainer or card-group

            targetCard.classList.add('drag-over-card'); // Highlight target card border

             if (event.clientY < midway) {
                 // Insert before targetCard
                 indicatorParent = parentContainer;
                 indicatorNextSibling = targetCard;
             } else {
                 // Insert after targetCard
                 indicatorParent = parentContainer;
                 indicatorNextSibling = targetCard.nextSibling;
             }
             validDropTarget = true;

        } else if (targetGroup) {
            // Hovering over a card group
             const groupParentId = targetGroup.dataset.parentId;
             // *** CONSTRAINT: Cannot drop into own child group ***
             if (groupParentId === draggedCardId) {
                 console.log("Cannot drop into own child group");
                 validDropTarget = false;
             } else {
                 targetGroup.classList.add('drag-over-group');
                 validDropTarget = true;

                 // Find nearest card within the group to determine position
                 const cardsInGroup = Array.from(targetGroup.querySelectorAll('.card'));
                 let closestCard = null;
                 let smallestDistance = Infinity;

                 cardsInGroup.forEach(card => {
                     const rect = card.getBoundingClientRect();
                     const dist = Math.abs(event.clientY - (rect.top + rect.height / 2));
                     if (dist < smallestDistance) {
                         smallestDistance = dist;
                         closestCard = card;
                     }
                 });

                 if (closestCard) {
                      const rect = closestCard.getBoundingClientRect();
                      if (event.clientY < rect.top + rect.height / 2) {
                           indicatorParent = targetGroup;
                           indicatorNextSibling = closestCard;
                      } else {
                           indicatorParent = targetGroup;
                           indicatorNextSibling = closestCard.nextSibling;
                      }
                 } else {
                      // Group is empty, place indicator inside
                      // Need to account for group header
                       const header = targetGroup.querySelector('.group-header');
                       indicatorParent = targetGroup;
                       indicatorNextSibling = header ? header.nextSibling : targetGroup.firstChild; // Place after header or at start
                 }
             }

        } else if (targetCardsContainer) {
            // Hovering over empty space in a column's card container
            const columnEl = targetCardsContainer.closest('.column');
            const columnIndex = getColumnIndex(columnEl);

             // Allow dropping as root card only in first column or if the dragged card was already a root card
            const draggedCardIsRoot = !getCard(draggedCardId)?.parentId;
            if (columnIndex === 0 || draggedCardIsRoot) {
                targetCardsContainer.classList.add('drag-over-empty');
                validDropTarget = true;

                 // Similar logic to groups: find nearest card/group to determine position
                 const children = Array.from(targetCardsContainer.children).filter(el => el.matches('.card, .card-group'));
                 let closestElement = null;
                 let smallestDistance = Infinity;

                 children.forEach(el => {
                     const rect = el.getBoundingClientRect();
                     const dist = Math.abs(event.clientY - (rect.top + rect.height / 2));
                     if (dist < smallestDistance) {
                         smallestDistance = dist;
                         closestElement = el;
                     }
                 });

                 if (closestElement) {
                     const rect = closestElement.getBoundingClientRect();
                     if (event.clientY < rect.top + rect.height / 2) {
                         indicatorParent = targetCardsContainer;
                         indicatorNextSibling = closestElement;
                     } else {
                         indicatorParent = targetCardsContainer;
                         indicatorNextSibling = closestElement.nextSibling;
                     }
                 } else {
                     // Container is empty, append indicator
                     indicatorParent = targetCardsContainer;
                     indicatorNextSibling = null; // Append
                 }

            } else {
                // Cannot drop into empty space of non-root columns unless it was already a root card
                validDropTarget = false;
                 console.log("Cannot drop non-root card into empty space of column > 0");
            }

        } else {
             validDropTarget = false;
        }

        // Position and show the indicator if it's a valid target
        if (validDropTarget && indicatorParent) {
             if(indicatorNextSibling) {
                 indicatorParent.insertBefore(dragIndicator, indicatorNextSibling);
             } else {
                 indicatorParent.appendChild(dragIndicator); // Append if no next sibling
             }
             dragIndicator.style.display = 'block';
        } else {
             // Hide indicator if not over a valid drop zone or invalid position
             if(dragIndicator) dragIndicator.style.display = 'none';
        }
    }

    function handleDragEnter(event) {
        event.preventDefault(); // Allow drop
        event.stopPropagation(); // Prevent container highlighting if entering a child

        // Basic highlight on container enter - dragOver handles specifics
        const targetGroup = event.target.closest('.card-group');
        const targetCardsContainer = event.target.closest('.cards-container');
         // *** CONSTRAINT: Cannot drop into own child group ***
         if (targetGroup && targetGroup.dataset.parentId !== draggedCardId) {
            targetGroup.classList.add('drag-over-group');
         } else if (targetCardsContainer) {
             targetCardsContainer.classList.add('drag-over-empty');
         }
    }

    function handleDragLeave(event) {
         event.stopPropagation();
        // More robust leave handling: only remove class if moving outside the element entirely
        const relatedTarget = event.relatedTarget; // Where the mouse is going
        const currentTarget = event.currentTarget; // The element firing the event

         // Check if the relatedTarget is outside the currentTarget
         if (currentTarget && (!relatedTarget || !currentTarget.contains(relatedTarget))) {
             currentTarget.classList.remove('drag-over-card', 'drag-over-group', 'drag-over-empty');

             // Hide indicator only if leaving a container where it was shown
              if (dragIndicator && dragIndicator.parentNode === currentTarget) {
                   dragIndicator.style.display = 'none';
              }
         }
    }

    function handleDrop(event) {
        event.preventDefault(); // *** CRITICAL: Allow drop ***
        event.stopPropagation(); // Prevent drop bubbling to parent containers

        console.log("Drop event fired");

        const droppedCardId = event.dataTransfer.getData('text/plain');
        // Ensure we have the card we started dragging
        if (!droppedCardId || !draggedCardId || droppedCardId !== draggedCardId) {
            console.warn("Drop aborted: Mismatched or missing card ID.", { droppedCardId, draggedCardId });
            clearDragStyles();
            draggedCardId = null; // Reset dragged card ID
            return;
        }

        const droppedCard = getCard(droppedCardId);
        if (!droppedCard) {
             console.error("Drop aborted: Dragged card data not found.");
             clearDragStyles();
             draggedCardId = null;
             return;
        }

        // Find where the indicator ended up - this is our drop location
        if (!dragIndicator || dragIndicator.style.display === 'none' || !dragIndicator.parentNode) {
            console.warn("Drop aborted: No valid drop indicator position found.");
            clearDragStyles();
            draggedCardId = null;
            return;
        }

        const indicatorParent = dragIndicator.parentNode;
        const insertBeforeElement = dragIndicator.nextElementSibling; // The element *after* the indicator

        let targetColumnIndex = -1;
        let newParentId = null;
        let insertBeforeCardId = null;

        const targetColumnEl = indicatorParent.closest('.column');
        if (!targetColumnEl) {
             console.warn("Drop aborted: Indicator not within a column.");
             clearDragStyles();
             draggedCardId = null;
             return;
        }
        targetColumnIndex = getColumnIndex(targetColumnEl);


        if (indicatorParent.classList.contains('card-group')) {
             // Dropped within a group
             newParentId = indicatorParent.dataset.parentId;
             // *** CONSTRAINT: Final check - cannot drop into own child group ***
             if (newParentId === droppedCardId) {
                 console.warn("Drop aborted: Cannot drop into own child group (final check).");
                 clearDragStyles();
                 draggedCardId = null;
                 return;
             }
        } else if (indicatorParent.classList.contains('cards-container')) {
             // Dropped directly into a column's main container
             if (targetColumnIndex === 0) {
                 newParentId = null; // Root card in the first column
             } else {
                 // If not column 0, assume it's becoming a root card in that column (if allowed)
                 // This case might need refinement based on exact desired behavior for non-col-0 root drops
                 newParentId = null;
                  console.log(`Card dropped as root in column ${targetColumnIndex}`);
             }
        } else {
            console.warn("Drop aborted: Indicator parent is neither group nor container.", indicatorParent);
            clearDragStyles();
            draggedCardId = null;
            return;
        }

        // Determine the ID of the card to insert before
        if (insertBeforeElement && insertBeforeElement.classList.contains('card')) {
            insertBeforeCardId = insertBeforeElement.dataset.cardId;
        } else if (insertBeforeElement && insertBeforeElement.classList.contains('card-group')) {
             // If dropping before a group, find the first card *within* that group, if any
             const firstCardInGroup = insertBeforeElement.querySelector('.card');
             insertBeforeCardId = firstCardInGroup ? firstCardInGroup.dataset.cardId : null;
             // If dropping before a group, it implies the card should logically come before all children of that group.
             // The moveCard logic needs to handle this ordering correctly.
             // Setting newParentId correctly is the most crucial part here.
        }
         else {
             insertBeforeCardId = null; // Append at the end of the list (group or root)
        }


        console.log(`Drop details: Card ${droppedCardId} -> Col ${targetColumnIndex}, Parent ${newParentId || 'root'}, Before ${insertBeforeCardId || 'end'}`);

        // --- Perform the Move ---
        moveCard(droppedCardId, targetColumnIndex, newParentId, insertBeforeCardId);
        clearDragStyles(); // Clean up indicator and styles AFTER move is processed
        draggedCardId = null; // Reset dragged card ID
    }

     function clearDragStyles(removeIndicatorInstance = true) {
         // Remove visual feedback classes
         document.querySelectorAll('.drag-over-card, .drag-over-group, .drag-over-empty').forEach(el => {
             el.classList.remove('drag-over-card', 'drag-over-group', 'drag-over-empty');
         });
         // Hide or remove the indicator
         if (dragIndicator) {
             dragIndicator.style.display = 'none';
             if (removeIndicatorInstance && dragIndicator.parentNode) {
                 dragIndicator.parentNode.removeChild(dragIndicator);
                 dragIndicator = null; // Allow it to be recreated on next drag
             }
         }
     }

    // --- Core Logic Functions ---

    function addCard(columnIndex, parentId = null) {
        // Ensure parent exists if specified
        if (parentId && !getCard(parentId)) {
            console.error(`Cannot add card: Parent ${parentId} not found.`);
            return;
        }
        // Ensure target column is valid (exists or is next logical column)
        const maxExistingColumn = columnsContainer.children.length - 1;
        if (columnIndex < 0 || columnIndex > maxExistingColumn + 1) {
             console.error(`Cannot add card: Invalid column index ${columnIndex}. Max is ${maxExistingColumn + 1}`);
             return;
        }


        const newCardId = generateId();
        const newCard = {
            id: newCardId,
            content: '',
            parentId: parentId,
            columnIndex: columnIndex,
            order: 0, // Will be set below
            color: '' // Will be calculated
        };

        // Calculate Color
        newCard.color = getColorForCard(newCard);

        appData.cards[newCardId] = newCard;

        // Determine initial order (append to the relevant list)
        let siblings;
        if (parentId) {
            siblings = getChildCards(parentId, columnIndex);
        } else {
            siblings = getColumnCards(columnIndex);
        }
        // Filter out the card itself if it somehow got included (shouldn't happen on add)
        siblings = siblings.filter(c => c.id !== newCardId);
        newCard.order = siblings.length > 0 ? Math.max(...siblings.map(c => c.order)) + 1 : 0;

        // Ensure the target column exists visually *before* rendering content
        while (columnsContainer.children.length <= columnIndex) {
             addColumn(); // This adds visually and updates data model
        }

        // Re-render the column where the card was added
        const targetColumnEl = getColumnElementByIndex(columnIndex);
        if (targetColumnEl) {
            renderColumnContent(targetColumnEl, columnIndex);
        } else {
             console.error("Failed to find target column element after adding column.");
             // Might need full re-render as fallback
             renderApp();
        }

        // Also re-render the *next* column to ensure the new card's group placeholder appears
         if (columnsContainer.children.length > columnIndex + 1) {
             const nextColumnEl = getColumnElementByIndex(columnIndex + 1);
             if (nextColumnEl) renderColumnContent(nextColumnEl, columnIndex + 1);
         }

        saveData();

        // Focus the new card's textarea after render completes
        requestAnimationFrame(() => {
             const newCardEl = getCardElement(newCardId);
             if (newCardEl) {
                 const textarea = newCardEl.querySelector('.card-content');
                  if(textarea) textarea.focus();
                  // Scroll into view slightly?
                  newCardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
             }
        });
        console.log(`Card ${newCardId} added to col ${columnIndex}, parent: ${parentId}, order: ${newCard.order}`);
    }

    function deleteCard(cardId) {
        const card = getCard(cardId);
        if (!card) return;

        const descendantIds = getDescendantIds(cardId);
        const allIdsToDelete = [cardId, ...descendantIds];
        const numDescendants = descendantIds.length; // Store count before modification

        if (!confirm(`Delete card #${cardId.slice(-4)} and its ${numDescendants} descendant(s)?`)) {
            return;
        }

        const affectedColumns = new Set();
        affectedColumns.add(card.columnIndex); // Card's own column
        // If card had children, the next column (where its group was) is also affected
        if (numDescendants > 0 && columnsContainer.children.length > card.columnIndex + 1) {
             affectedColumns.add(card.columnIndex + 1);
        }


        allIdsToDelete.forEach(id => {
            const c = getCard(id);
            if (c) {
                 affectedColumns.add(c.columnIndex); // Column of each descendant
                 // Also the column *after* the descendant if it had children itself (redundant but safe)
                  if (columnsContainer.children.length > c.columnIndex + 1) {
                     affectedColumns.add(c.columnIndex + 1);
                 }
                 delete appData.cards[id];
            }
        });

        // Re-render affected columns in order
        Array.from(affectedColumns).sort((a,b)=>a-b).forEach(colIndex => {
             const colEl = getColumnElementByIndex(colIndex);
             if (colEl) {
                 renderColumnContent(colEl, colIndex);
             }
        });

        // Check if we can now delete the rightmost column
        updateAllToolbarButtons();

        saveData();
        console.log(`Card ${cardId} and ${numDescendants} descendants deleted.`);
    }

    function addColumnInternal(doSave = true) {
        const newIndex = appData.columns.length; // Index will be the current length
        appData.columns.push({ id: `col-${generateId()}` }); // Store some minimal column data
        console.log("Internal add column, new count:", appData.columns.length);
        if (doSave) saveData();
        return newIndex; // Return the index of the added column
    }


    function addColumn() {
         const newIndex = addColumnInternal(); // Adds to appData and saves

         // Create and append the new column element
         const columnEl = createColumnElement(newIndex);
         columnsContainer.appendChild(columnEl);
         renderColumnContent(columnEl, newIndex); // Render its (empty) content

         // Update toolbars for the new and previous last column
         updateAllToolbarButtons(); // Refresh all toolbars is simplest

         console.log(`Column ${newIndex} added visually.`);
         // Scroll columns container to show the new column?
         columnsContainer.scrollLeft = columnsContainer.scrollWidth;
    }

    function deleteColumn(columnIndex) {
        const numColumns = columnsContainer.children.length;
        const columnEl = getColumnElementByIndex(columnIndex);
        // Re-check conditions precisely before deleting
        const isRightmost = columnIndex === numColumns - 1;
        const columnCards = Object.values(appData.cards).filter(card => card.columnIndex === columnIndex);
        const canDelete = isRightmost && numColumns > MIN_COLUMNS && columnCards.length === 0;


        if (!canDelete) {
            console.warn("Cannot delete column: Conditions not met.");
            alert("Cannot delete this column. It might not be the rightmost, the minimum number of columns hasn't been exceeded, or it's not empty.");
            return;
        }

        if (!confirm("Delete this empty column?")) {
            return;
        }

        // Remove from DOM
        if (columnEl && columnEl.parentNode === columnsContainer) {
            columnsContainer.removeChild(columnEl);
        } else {
            console.error("Could not find column element to remove from DOM.");
            // Attempt recovery by re-rendering?
            renderApp();
            return;
        }


        // Remove from data model (assuming simple array structure)
        if(appData.columns.length > columnIndex) { // Sanity check
             appData.columns.splice(columnIndex, 1); // Remove the element at the index
        } else {
             console.error("Column index out of bounds for appData.columns");
        }


        // Update toolbar of the new rightmost column
        updateAllToolbarButtons(); // Refresh all

        saveData();
        console.log(`Column ${columnIndex} deleted.`);
    }

     function moveCard(cardId, targetColumnIndex, newParentId, insertBeforeCardId) {
        const card = getCard(cardId);
        if (!card) {
             console.error("MoveCard failed: Card not found", cardId);
             return;
        }

        const originalColumnIndex = card.columnIndex;
        const originalParentId = card.parentId;
        const originalOrder = card.order;

        // Prevent dragging a card to be its own descendant
        let tempParentId = newParentId;
        while(tempParentId) {
            if (tempParentId === cardId) {
                console.warn("Move Aborted: Cannot move card inside itself or its descendants.");
                return; // Abort the move
            }
            tempParentId = getCard(tempParentId)?.parentId;
        }

        // --- Update the card itself ---
        card.columnIndex = targetColumnIndex;
        card.parentId = newParentId;
        card.color = getColorForCard(card); // Recalculate color based on new hierarchy

        // --- Calculate new order ---
        let siblings;
        if (newParentId) {
            siblings = getChildCards(newParentId, targetColumnIndex).filter(c => c.id !== cardId); // Exclude self
        } else {
            siblings = getColumnCards(targetColumnIndex).filter(c => c.id !== cardId); // Exclude self
        }
        // siblings are already sorted by getChildCards/getColumnCards

        let newOrder;
        if (insertBeforeCardId) {
            const insertBeforeCard = getCard(insertBeforeCardId);
            if (insertBeforeCard && insertBeforeCard.id !== cardId) { // Ensure it's not itself
                 const insertBeforeOrder = insertBeforeCard.order;
                 // Find the order of the card *immediately* before the insert point in the *current* siblings list
                 let prevOrder = -1; // Default if inserting at the beginning
                 const insertBeforeIndex = siblings.findIndex(c => c.id === insertBeforeCardId);
                 if (insertBeforeIndex > 0) {
                     prevOrder = siblings[insertBeforeIndex - 1].order;
                 } else if (insertBeforeIndex === -1) {
                      // insertBeforeCardId not found among siblings (maybe it's in a different group/level?)
                      // This indicates an issue in drop logic - fall back to appending?
                      console.warn(`insertBeforeCardId ${insertBeforeCardId} not found among siblings of new parent ${newParentId}. Appending instead.`);
                      newOrder = siblings.length > 0 ? Math.max(...siblings.map(c => c.order)) + 1 : 0;
                 }

                 // Calculate order only if insertBeforeCardId was valid among siblings
                 if (insertBeforeIndex !== -1) {
                     newOrder = (prevOrder + insertBeforeOrder) / 2.0; // Average order
                 }

            } else {
                 // insertBeforeCardId provided but invalid? Append to end.
                 console.warn(`Invalid insertBeforeCardId ${insertBeforeCardId}. Appending instead.`);
                 newOrder = siblings.length > 0 ? Math.max(...siblings.map(c => c.order)) + 1 : 0;
            }
        } else {
            // Append to the end
            newOrder = siblings.length > 0 ? Math.max(...siblings.map(c => c.order)) + 1 : 0;
        }
        card.order = newOrder;


        // --- Update descendants recursively ---
        const columnDiff = targetColumnIndex - originalColumnIndex;
        const affectedDescendants = []; // Keep track for rendering
        if (columnDiff !== 0) {
            const descendants = getDescendantIds(cardId);
            descendants.forEach(descId => {
                const descCard = getCard(descId);
                if (descCard) {
                    descCard.columnIndex += columnDiff;
                    descCard.color = getColorForCard(descCard); // Update descendant colors
                    affectedDescendants.push(descCard);
                }
            });
        }

        // --- Ensure enough columns exist ---
        let maxCol = targetColumnIndex;
        affectedDescendants.forEach(desc => { maxCol = Math.max(maxCol, desc.columnIndex); });
        while (columnsContainer.children.length <= maxCol) {
             addColumn(); // Adds column visually and updates data model, triggers save
        }

        // --- Determine Columns to Re-render ---
        const columnsToRender = new Set();
        // Original location
        columnsToRender.add(originalColumnIndex);
        if (originalParentId) {
             const originalParent = getCard(originalParentId);
             if (originalParent) columnsToRender.add(originalParent.columnIndex + 1); // Column where original group was
        }
        // New location
        columnsToRender.add(targetColumnIndex);
        if (newParentId) {
             const newParent = getCard(newParentId);
              if (newParent) columnsToRender.add(newParent.columnIndex + 1); // Column where new group is
        }
        // Columns of moved descendants
         affectedDescendants.forEach(desc => {
             columnsToRender.add(desc.columnIndex); // New column index
             columnsToRender.add(desc.columnIndex - columnDiff); // Original column index
             // Also columns where their groups might appear/disappear
             const descParent = getCard(desc.parentId);
             if (descParent) {
                  columnsToRender.add(descParent.columnIndex + 1);
             }
         });
        // Also the column *after* the moved card's original and new positions
        if (columnsContainer.children.length > originalColumnIndex + 1) columnsToRender.add(originalColumnIndex + 1);
        if (columnsContainer.children.length > targetColumnIndex + 1) columnsToRender.add(targetColumnIndex + 1);


        // --- Perform the render after all data changes ---
        console.log("Re-rendering columns after move:", Array.from(columnsToRender).sort((a,b)=>a-b));
        Array.from(columnsToRender).sort((a,b)=>a-b).forEach(index => {
            if (index >= 0) { // Ensure index is valid
                const colEl = getColumnElementByIndex(index);
                if (colEl) {
                    renderColumnContent(colEl, index);
                } else {
                     console.warn(`Attempted to re-render non-existent column at index ${index}`);
                     // If a column somehow disappeared, a full re-render might be needed
                     // renderApp(); // Use cautiously - can be slow
                }
            }
        });

        updateAllToolbarButtons(); // Update button states
        saveData(); // Save the changes
        console.log(`Card ${cardId} moved SUCCESS -> Col ${targetColumnIndex}, Parent: ${newParentId || 'root'}, Order: ${card.order}`);
    }

    function updateAllToolbarButtons() {
        Array.from(columnsContainer.children).forEach((col, idx) => {
            updateToolbarButtons(col, idx);
        });
    }


    // --- Initial Load ---
    loadData(); // Load data and perform initial render

    // --- Global Event Listener for focus out (alternative to per-textarea blur) ---
    // document.addEventListener('focusout', (event) => {
    //     if (event.target.classList.contains('card-content')) {
    //         handleTextareaBlur(event); // Reuse existing handler logic
    //     }
    // });


}); // End DOMContentLoaded