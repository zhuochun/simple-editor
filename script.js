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
        return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
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
                appData = JSON.parse(savedData);
                // Basic data validation/migration could go here
                if (!appData.columns || !appData.cards) {
                    throw new Error("Invalid data structure");
                }
            } catch (e) {
                console.error("Error parsing data from localStorage:", e);
                alert("Could not load saved data. Starting fresh.");
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
            addColumnInternal();
        }
        saveData();
    }

    function getCard(id) {
        return appData.cards[id];
    }

    function getColumnIndex(columnElement) {
        return Array.from(columnsContainer.children).indexOf(columnElement);
    }

     function getColumnCards(columnIndex) {
        return Object.values(appData.cards).filter(card => card.columnIndex === columnIndex && !card.parentId);
    }

    function getChildCards(parentId) {
        return Object.values(appData.cards).filter(card => card.parentId === parentId);
    }

    function getCardElement(cardId) {
        return document.getElementById(`card-${cardId}`);
    }

    function getGroupElement(parentId) {
         return document.getElementById(`group-${parentId}`);
    }

    function getColumnElementByIndex(index) {
        return columnsContainer.children[index];
    }

    function getDescendantIds(cardId) {
        let descendants = [];
        const children = getChildCards(cardId);
        children.forEach(child => {
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
         const saturation = Math.min(100, BASE_COLOR_SATURATION + (level * (LIGHTNESS_STEP_DOWN / 2))); // Increase saturation slightly

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
        return 'rgba(0,0,0,0.1)'; // Generic darker overlay idea
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

        const textarea = cardEl.querySelector('.card-content');
        textarea.addEventListener('blur', handleTextareaBlur);
        textarea.addEventListener('focus', handleTextareaFocus);
        textarea.addEventListener('input', autoResizeTextarea); // Auto-resize
        // Initial resize check
        requestAnimationFrame(() => autoResizeTextarea({ target: textarea }));


        cardEl.querySelector('.add-child-btn').addEventListener('click', () => addCard(card.columnIndex + 1, card.id));
        cardEl.querySelector('.delete-card-btn').addEventListener('click', () => deleteCard(card.id));

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
             if (e.target === cardsContainer && columnIndex === 0) { // Only on empty space in first column
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

        // Get root cards for this column OR cards belonging to groups
        const rootCardsInColumn = Object.values(appData.cards)
            .filter(card => card.columnIndex === columnIndex && !card.parentId)
            .sort((a, b) => a.order - b.order); // Sort by order

        // Append root cards
        rootCardsInColumn.forEach(card => {
            const cardEl = createCardElement(card);
            cardsContainer.appendChild(cardEl);
        });

        // Find parent cards from the *previous* column to render their groups
        if (columnIndex > 0) {
            const potentialParentCards = Object.values(appData.cards)
                .filter(card => card.columnIndex === columnIndex - 1)
                .sort((a, b) => a.order - b.order); // Sort parents to maintain group order

            potentialParentCards.forEach(parentCard => {
                 const groupEl = createGroupElement(parentCard.id);
                 if (!groupEl) return;

                 const childCards = getChildCards(parentCard.id)
                                     .filter(card => card.columnIndex === columnIndex) // Ensure they are in *this* column
                                     .sort((a, b) => a.order - b.order); // Sort children

                 if (childCards.length > 0) {
                     childCards.forEach(childCard => {
                         const cardEl = createCardElement(childCard);
                         groupEl.appendChild(cardEl);
                     });
                      cardsContainer.appendChild(groupEl);
                 } else {
                      // Render empty group as a drop target
                      cardsContainer.appendChild(groupEl);
                 }
            });
        }
         updateToolbarButtons(columnEl, columnIndex);
    }

     function renderApp() {
        // Sort columns first if they have an order property (optional, using DOM order for now)
        columnsContainer.innerHTML = ''; // Clear all columns

        // Ensure correct number of columns based on max card depth
        let maxColumnIndex = MIN_COLUMNS - 1;
         Object.values(appData.cards).forEach(card => {
             if (card.columnIndex > maxColumnIndex) {
                 maxColumnIndex = card.columnIndex;
             }
         });

        // Ensure appData.columns array matches the required columns
        while (appData.columns.length <= maxColumnIndex) {
             addColumnInternal(false); // Add without saving immediately if during load
        }
        // Trim excess columns if necessary (more complex logic needed if we track col IDs)
        // For now, we rely on rendering based on maxColumnIndex

        for (let i = 0; i <= maxColumnIndex; i++) {
             const columnEl = createColumnElement(i);
             columnsContainer.appendChild(columnEl);
             renderColumnContent(columnEl, i); // Render content after appending
        }

        // Ensure at least MIN_COLUMNS are visible, even if empty
         while(columnsContainer.children.length < MIN_COLUMNS) {
              const i = columnsContainer.children.length;
              const columnEl = createColumnElement(i);
              columnsContainer.appendChild(columnEl);
              renderColumnContent(columnEl, i);
              if (!appData.columns[i]) { // Add to data model if missing
                   addColumnInternal(false);
              }
         }

         // Update all toolbars after full render
         Array.from(columnsContainer.children).forEach((col, idx) => updateToolbarButtons(col, idx));

        console.log("App rendered. Data:", JSON.parse(JSON.stringify(appData))); // Deep copy for logging
    }


     function updateToolbarButtons(columnEl, columnIndex) {
         const addCardBtn = columnEl.querySelector('.add-card-btn');
         const addColBtn = columnEl.querySelector('.add-column-btn');
         const delColBtn = columnEl.querySelector('.delete-column-btn');
         const numColumns = columnsContainer.children.length;
         const isRightmost = columnIndex === numColumns - 1;

         // Add Card: Only in the first column
         addCardBtn.classList.toggle('hidden', columnIndex !== 0);

         // Add Column: Only in the rightmost column
         addColBtn.classList.toggle('hidden', !isRightmost);

         // Delete Column: Only rightmost, if > MIN_COLUMNS, and if column is empty
         const columnCards = Object.values(appData.cards).filter(card => card.columnIndex === columnIndex);
         const canDelete = isRightmost && numColumns > MIN_COLUMNS && columnCards.length === 0;
         delColBtn.classList.toggle('hidden', !canDelete);
     }

    function autoResizeTextarea(event) {
        const textarea = event.target;
        textarea.style.height = 'auto'; // Temporarily shrink
        textarea.style.height = `${textarea.scrollHeight}px`; // Set to scroll height
    }

    // --- Event Handlers ---

    function handleTextareaBlur(event) {
        const textarea = event.target;
        const cardEl = textarea.closest('.card');
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
                 // Apply a stronger version of the base color if possible
                 // If not possible (e.g., parsing fails), the .highlight class provides a fallback
                 const highlightBg = getHighlightColor(baseColor);
                 if (highlightBg !== 'rgba(0,0,0,0.1)') { // Check if parsing worked
                     cardEl.style.setProperty('--highlight-bg', highlightBg); // Use CSS var
                      cardEl.style.backgroundColor = highlightBg; // Direct apply for simplicity here
                 }
             }
         });
     }

     function clearHighlights() {
        document.querySelectorAll('.card.highlight, .card.editing').forEach(el => {
            el.classList.remove('highlight', 'editing');
            // Reset background color to original calculated color
             const card = getCard(el.dataset.cardId);
             if(card) el.style.backgroundColor = card.color;
             else el.style.backgroundColor = ''; // Fallback remove inline style
        });
     }

    function handleDragStart(event) {
        const cardEl = event.target.closest('.card');
        if (!cardEl) return; // Ensure we're dragging a card

        draggedCardId = cardEl.dataset.cardId;
        event.dataTransfer.setData('text/plain', draggedCardId);
        event.dataTransfer.effectAllowed = 'move';

        // Delay adding class to avoid capturing the ghost image styling
        requestAnimationFrame(() => {
            cardEl.classList.add('dragging');
        });

        // Create visual drag indicator element
        if (!dragIndicator) {
            dragIndicator = document.createElement('div');
            dragIndicator.className = 'drag-over-indicator';
        }
    }

    function handleDragEnd(event) {
        if (draggedCardId) {
            const cardEl = getCardElement(draggedCardId);
            if (cardEl) {
                cardEl.classList.remove('dragging');
            }
        }
        clearDragStyles();
        draggedCardId = null;
    }

    function handleDragOver(event) {
        event.preventDefault(); // Necessary to allow drop
        event.dataTransfer.dropEffect = 'move';

        if (!draggedCardId) return; // Only react if we are dragging a known card

        const targetElement = event.target;
        const targetCard = targetElement.closest('.card');
        const targetGroup = targetElement.closest('.card-group');
        const targetCardsContainer = targetElement.closest('.cards-container');

        clearDragStyles(false); // Clear previous styles but keep indicator instance

        if (targetCard && targetCard.dataset.cardId !== draggedCardId) {
            // Hovering over another card (for reordering)
            const rect = targetCard.getBoundingClientRect();
            const midway = rect.top + rect.height / 2;
            const parent = targetCard.parentNode; // Could be cardsContainer or card-group

            targetCard.classList.add('drag-over-card'); // Highlight card slightly

            if (event.clientY < midway) {
                // Insert before targetCard
                parent.insertBefore(dragIndicator, targetCard);
            } else {
                // Insert after targetCard
                parent.insertBefore(dragIndicator, targetCard.nextSibling);
            }
             dragIndicator.style.display = 'block'; // Ensure visible
        } else if (targetGroup) {
             // Hovering over a card group (empty space or header)
             targetGroup.classList.add('drag-over-group');
             // Check if group is empty or hovering near top/bottom edge
             const groupCards = targetGroup.querySelectorAll('.card');
             if (groupCards.length === 0 || event.clientY < targetGroup.getBoundingClientRect().top + 35) { // Near header
                 // Insert at the beginning of the group
                 targetGroup.insertBefore(dragIndicator, targetGroup.firstChild.nextSibling); // After header
             } else {
                  // Insert at the end of the group
                 targetGroup.appendChild(dragIndicator);
             }
              dragIndicator.style.display = 'block'; // Ensure visible

        } else if (targetCardsContainer) {
             // Hovering over empty space in a column's card container
              targetCardsContainer.classList.add('drag-over-empty');
             // Append indicator at the end
             targetCardsContainer.appendChild(dragIndicator);
             dragIndicator.style.display = 'block'; // Ensure visible
        } else {
             // Hide indicator if not over a valid drop zone
              if(dragIndicator && dragIndicator.parentNode) {
                   dragIndicator.parentNode.removeChild(dragIndicator);
                   dragIndicator.style.display = 'none';
              }
        }
    }

    function handleDragEnter(event) {
        event.preventDefault();
        // Styling applied in dragOver
        const targetElement = event.target;
        const targetGroup = targetElement.closest('.card-group');
        const targetCardsContainer = targetElement.closest('.cards-container');

        if (targetGroup) targetGroup.classList.add('drag-over-group');
        else if (targetCardsContainer) targetCardsContainer.classList.add('drag-over-empty');
    }

    function handleDragLeave(event) {
        const targetElement = event.target;
        const targetGroup = targetElement.closest('.card-group');
        const targetCardsContainer = targetElement.closest('.cards-container');

        // Only remove class if the relatedTarget (where the mouse entered)
        // is *outside* the element we're leaving. Prevents flicker when moving over children.
         if (targetGroup && !targetGroup.contains(event.relatedTarget)) {
             targetGroup.classList.remove('drag-over-group');
         } else if (targetCardsContainer && !targetCardsContainer.contains(event.relatedTarget)) {
              targetCardsContainer.classList.remove('drag-over-empty');
              // Remove indicator only if leaving the main container without entering a valid child target
              if (dragIndicator && dragIndicator.parentNode === targetCardsContainer && !targetCardsContainer.querySelector('.card:hover, .card-group:hover')) {
                   targetCardsContainer.removeChild(dragIndicator);
                   dragIndicator.style.display = 'none';
              }
         }
        // Don't remove card highlight here, let dragOver handle it
    }

    function handleDrop(event) {
        event.preventDefault();
        event.stopPropagation(); // Prevent drop bubbling to parent containers

        const droppedCardId = event.dataTransfer.getData('text/plain');
        if (!droppedCardId || droppedCardId === draggedCardId) { // Ensure it's the card we started dragging
             clearDragStyles();
             return; // Dropped on itself or invalid data
        }

        const droppedCard = getCard(droppedCardId);
        if (!droppedCard) return;

        const targetElement = document.elementFromPoint(event.clientX, event.clientY); // Get element precisely under cursor
        const targetCardEl = targetElement.closest('.card');
        const targetGroupEl = targetElement.closest('.card-group');
        const targetColumnEl = targetElement.closest('.column');
        const targetCardsContainer = targetElement.closest('.cards-container');

        if (!targetColumnEl) { // Dropped outside any column
            clearDragStyles();
            return;
        }

        const targetColumnIndex = getColumnIndex(targetColumnEl);
        let newParentId = null;
        let insertBeforeCardId = null;
        let targetContainer = null;

        if (targetGroupEl) {
            // Dropped onto a card group
            newParentId = targetGroupEl.dataset.parentId;
            targetContainer = targetGroupEl;

             // Check if dropping relative to an existing card within the group
             const cardInGroup = targetElement.closest('.card');
             if (cardInGroup && cardInGroup.closest('.card-group') === targetGroupEl) {
                  const rect = cardInGroup.getBoundingClientRect();
                  if (event.clientY < rect.top + rect.height / 2) {
                       insertBeforeCardId = cardInGroup.dataset.cardId;
                  } else {
                       // Find the next card's ID to insert before it
                       const nextCard = cardInGroup.nextElementSibling;
                       insertBeforeCardId = nextCard ? nextCard.dataset.cardId : null; // If null, append at end
                  }
             } else {
                // Dropped in empty space of group or on header - determine position based on indicator
                if (dragIndicator && dragIndicator.parentNode === targetGroupEl) {
                     const nextEl = dragIndicator.nextElementSibling;
                     insertBeforeCardId = nextEl && nextEl.classList.contains('card') ? nextEl.dataset.cardId : null;
                 } else {
                     // Default to appending at the end if indicator logic failed
                     insertBeforeCardId = null;
                 }
             }


        } else if (targetCardEl && targetCardEl.dataset.cardId !== droppedCardId) {
            // Dropped onto another card (not group) -> reorder within the same parent/level
             const parentOfTarget = getCard(targetCardEl.dataset.cardId)?.parentId;
             newParentId = parentOfTarget; // Assume same parent unless target is a root card
             targetContainer = targetCardEl.parentNode; // Could be cardsContainer or group

             const rect = targetCardEl.getBoundingClientRect();
             if (event.clientY < rect.top + rect.height / 2) {
                 insertBeforeCardId = targetCardEl.dataset.cardId;
             } else {
                 const nextCard = targetCardEl.nextElementSibling;
                 insertBeforeCardId = nextCard ? nextCard.dataset.cardId : null;
             }

             // Special case: Dropping onto a root card in col 0
              if (targetColumnIndex === 0 && !newParentId) {
                 targetContainer = targetColumnEl.querySelector('.cards-container');
              }

        } else if (targetCardsContainer) {
            // Dropped onto the empty space in a column's cards container
            targetContainer = targetCardsContainer;
            if (targetColumnIndex === 0) {
                newParentId = null; // Root card
            } else {
                // Cannot drop into empty space of col > 0, must be in a group
                 console.warn("Cannot drop card into empty space of column > 0. Must target a group.");
                 clearDragStyles();
                 return;
            }
             // Determine position based on indicator
            if (dragIndicator && dragIndicator.parentNode === targetCardsContainer) {
                 const nextEl = dragIndicator.nextElementSibling;
                 // Check if nextEl is a card or a group
                 if (nextEl && nextEl.classList.contains('card')) {
                    insertBeforeCardId = nextEl.dataset.cardId;
                 } else if (nextEl && nextEl.classList.contains('card-group')) {
                     // If dropping before a group, find the first card *logically* after this position
                     // This is complex, for now, just append to the end of root cards if indicator is last
                     insertBeforeCardId = null; // Simplification: append if indicator is last
                 } else {
                     insertBeforeCardId = null; // Append at end
                 }
             } else {
                  insertBeforeCardId = null; // Append at end
             }
        } else {
            // Invalid drop target
            clearDragStyles();
            return;
        }

        // --- Perform the Move ---
        moveCard(droppedCardId, targetColumnIndex, newParentId, insertBeforeCardId);
        clearDragStyles();
    }

     function clearDragStyles(removeIndicator=true) {
         document.querySelectorAll('.drag-over-card, .drag-over-group, .drag-over-empty').forEach(el => {
             el.classList.remove('drag-over-card', 'drag-over-group', 'drag-over-empty');
         });
         if (removeIndicator && dragIndicator && dragIndicator.parentNode) {
             dragIndicator.parentNode.removeChild(dragIndicator);
              dragIndicator.style.display = 'none';
         }
     }

    // --- Core Logic Functions ---

    function addCard(columnIndex, parentId = null) {
        const newCardId = generateId();
        const newCard = {
            id: newCardId,
            content: '',
            parentId: parentId,
            columnIndex: columnIndex,
            order: Date.now(), // Use timestamp for initial order, will be updated on drop/reorder
            color: '' // Will be calculated
        };

        // Calculate Color
        newCard.color = getColorForCard(newCard);

        appData.cards[newCardId] = newCard;

        // Determine initial order (append to the relevant list)
        let siblings;
        if (parentId) {
            siblings = getChildCards(parentId).filter(c => c.columnIndex === columnIndex);
        } else {
            siblings = getColumnCards(columnIndex);
        }
        newCard.order = siblings.length > 0 ? Math.max(...siblings.map(c => c.order)) + 1 : 0;


        // Ensure the target column exists visually
         while (columnsContainer.children.length <= columnIndex) {
             addColumn(); // This might re-render, which is ok
         }

        // Re-render the affected column (and potentially the next one for the new group)
        renderColumnContent(getColumnElementByIndex(columnIndex), columnIndex);
        if (columnsContainer.children.length > columnIndex + 1) {
             renderColumnContent(getColumnElementByIndex(columnIndex + 1), columnIndex + 1); // Render next column to show new group
        } else {
            // If the next column doesn't exist yet, adding it will trigger its render
             addColumn(); // This seems redundant but ensures the new group's column is there
        }


        saveData();

        // Focus the new card's textarea
        const newCardEl = getCardElement(newCardId);
        if (newCardEl) {
            newCardEl.querySelector('.card-content').focus();
        }
        console.log(`Card ${newCardId} added to col ${columnIndex}, parent: ${parentId}`);
    }

    function deleteCard(cardId) {
        const card = getCard(cardId);
        if (!card) return;

        const descendantIds = getDescendantIds(cardId);
        const allIdsToDelete = [cardId, ...descendantIds];

        if (!confirm(`Delete card #${cardId.slice(-4)} and its ${descendantIds.length} descendant(s)?`)) {
            return;
        }

        const affectedColumns = new Set();
        affectedColumns.add(card.columnIndex); // Add the card's own column

        allIdsToDelete.forEach(id => {
            const c = getCard(id);
            if (c) {
                 affectedColumns.add(c.columnIndex); // Add column index of card being deleted
                 // Also need to potentially re-render the *next* column if a group is removed
                 if (columnsContainer.children.length > c.columnIndex + 1) {
                     affectedColumns.add(c.columnIndex + 1);
                 }
                 delete appData.cards[id];
            }
        });

        // Re-render affected columns
        affectedColumns.forEach(colIndex => {
             const colEl = getColumnElementByIndex(colIndex);
             if (colEl) {
                 renderColumnContent(colEl, colIndex);
             }
        });

        // Check if we can now delete the rightmost column
        updateAllToolbarButtons();

        saveData();
        console.log(`Card ${cardId} and descendants deleted.`);
    }

    function addColumnInternal(doSave = true) {
        const newIndex = appData.columns.length; // Index will be the current length
        appData.columns.push({ id: `col-${generateId()}` }); // Store some minimal column data if needed later
        console.log("Internal add column, new index:", newIndex);
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
         updateToolbarButtons(columnEl, newIndex);
         if (newIndex > 0) {
             updateToolbarButtons(getColumnElementByIndex(newIndex - 1), newIndex - 1);
         }
        updateAllToolbarButtons(); // Refresh all for safety
         console.log(`Column ${newIndex} added visually.`);
    }

    function deleteColumn(columnIndex) {
        const numColumns = columnsContainer.children.length;
        const columnEl = getColumnElementByIndex(columnIndex);
        const cardsInColumn = Object.values(appData.cards).filter(card => card.columnIndex === columnIndex);

        if (columnIndex !== numColumns - 1 || numColumns <= MIN_COLUMNS || cardsInColumn.length > 0) {
            console.warn("Cannot delete column: Not rightmost, less than min columns, or not empty.");
            return;
        }

        if (!confirm("Delete this empty column?")) {
            return;
        }

        // Remove from DOM
        columnsContainer.removeChild(columnEl);

        // Remove from data model (assuming simple array structure)
        appData.columns.pop(); // Remove the last element

        // Update toolbar of the new rightmost column
        if (numColumns - 2 >= 0) { // Check if there's a column left
            updateToolbarButtons(getColumnElementByIndex(numColumns - 2), numColumns - 2);
        }
        updateAllToolbarButtons(); // Refresh others

        saveData();
        console.log(`Column ${columnIndex} deleted.`);
    }

     function moveCard(cardId, targetColumnIndex, newParentId, insertBeforeCardId) {
        const card = getCard(cardId);
        if (!card) return;

        const originalColumnIndex = card.columnIndex;
        const originalParentId = card.parentId;

        // Prevent dragging a card to be its own descendant (or onto itself indirectly)
        let tempParentId = newParentId;
        while(tempParentId) {
            if (tempParentId === cardId) {
                console.warn("Cannot move card inside itself or its descendants.");
                return;
            }
            tempParentId = getCard(tempParentId)?.parentId;
        }

        // --- Update the card itself ---
        card.columnIndex = targetColumnIndex;
        card.parentId = newParentId;
        card.color = getColorForCard(card); // Recalculate color based on new hierarchy

        // --- Update order ---
        let siblings;
        if (newParentId) {
            siblings = getChildCards(newParentId).filter(c => c.columnIndex === targetColumnIndex && c.id !== cardId);
        } else {
            siblings = getColumnCards(targetColumnIndex).filter(c => c.id !== cardId);
        }
        siblings.sort((a, b) => a.order - b.order); // Ensure sorted before insertion logic

        if (insertBeforeCardId) {
             const insertBeforeCard = getCard(insertBeforeCardId);
             if(insertBeforeCard) {
                 const insertBeforeOrder = insertBeforeCard.order;
                 // Find the card immediately before the insertion point in the sorted list
                 let prevCardOrder = -1; // Start before the first possible order (0)
                 for(let i=0; i < siblings.length; i++) {
                      if(siblings[i].id === insertBeforeCardId) break; // Stop when we reach the target
                      prevCardOrder = siblings[i].order;
                 }
                 // Calculate new order: average between previous and target, or slightly before target
                 card.order = (prevCardOrder + insertBeforeOrder) / 2;

                 // Renumber siblings after insertion point to ensure distinct order if needed (optional, but good practice)
                 // For simplicity, we rely on floating point precision for now. A full renumbering might be better.
             } else {
                  // insertBeforeCardId provided but not found? Append to end.
                  card.order = siblings.length > 0 ? Math.max(...siblings.map(c => c.order)) + 1 : 0;
             }
        } else {
            // Append to the end
            card.order = siblings.length > 0 ? Math.max(...siblings.map(c => c.order)) + 1 : 0;
        }


        // --- Update descendants recursively ---
        const columnDiff = targetColumnIndex - originalColumnIndex;
        if (columnDiff !== 0) {
            const descendants = getDescendantIds(cardId);
            descendants.forEach(descId => {
                const descCard = getCard(descId);
                if (descCard) {
                    descCard.columnIndex += columnDiff;
                     descCard.color = getColorForCard(descCard); // Update descendant colors
                }
            });
        }

        // --- Ensure enough columns exist ---
        let maxCol = targetColumnIndex;
         Object.values(appData.cards).forEach(c => { maxCol = Math.max(maxCol, c.columnIndex); });
         while (columnsContainer.children.length <= maxCol) {
             addColumn(); // Add columns as needed, will trigger saves/renders
         }

        // --- Re-render involved columns ---
        const columnsToRender = new Set([originalColumnIndex, targetColumnIndex]);
        // Also render columns potentially affected by descendant moves
         const descendants = getDescendantIds(cardId);
          descendants.forEach(descId => {
                const descCard = getCard(descId);
                if (descCard) columnsToRender.add(descCard.columnIndex); // New column index
                // Need original column too if card moved *from* there
                const originalDescCol = originalColumnIndex + (descCard.columnIndex - targetColumnIndex); // Calculate where it was
                columnsToRender.add(originalDescCol);
          });
        // Also render columns next to affected columns (for group changes)
        const nextColumns = new Set();
        columnsToRender.forEach(cIdx => {
            if (columnsContainer.children.length > cIdx + 1) nextColumns.add(cIdx + 1);
            if (cIdx > 0) nextColumns.add(cIdx -1); // And previous column for parent group changes
        });
         nextColumns.forEach(cIdx => columnsToRender.add(cIdx));


        // Perform the render after all data changes
         console.log("Re-rendering columns:", Array.from(columnsToRender).sort((a,b)=>a-b));
        Array.from(columnsToRender).sort((a,b)=>a-b).forEach(index => {
            const colEl = getColumnElementByIndex(index);
            if (colEl) {
                renderColumnContent(colEl, index);
            }
        });

        updateAllToolbarButtons();
        saveData();
         console.log(`Card ${cardId} moved to col ${targetColumnIndex}, parent: ${newParentId}, order: ${card.order}`);
    }

    function updateAllToolbarButtons() {
        Array.from(columnsContainer.children).forEach((col, idx) => {
            updateToolbarButtons(col, idx);
        });
    }


    // --- Initial Load ---
    loadData(); // Load data and perform initial render

}); // End DOMContentLoaded