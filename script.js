document.addEventListener('DOMContentLoaded', () => {
    const columnsContainer = document.getElementById('columnsContainer');
    let appData = { columns: [], cards: {} }; // { columns: [colId1, colId2], cards: {cardId: { ... }} }
    let draggedCardId = null;
    let dragIndicator = null;
    const MIN_COLUMNS = 3;
    const BASE_COLOR_HUE = 200; // Starting Hue for first root card
    const HUE_ROTATION_STEP = 30; // Degrees to shift hue for each subsequent root card
    const BASE_COLOR_SATURATION = 50; // Adjusted base saturation
    const BASE_COLOR_LIGHTNESS = 92; // Adjusted base lightness (very light)
    const LIGHTNESS_STEP_DOWN = 3; // How much darker each level gets
    const SATURATION_STEP_UP = 3; // How much more saturated each level gets

    // --- Data Management ---

    function generateId() {
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
                if (!parsedData || typeof parsedData !== 'object' || !Array.isArray(parsedData.columns) || typeof parsedData.cards !== 'object') {
                    throw new Error("Invalid data structure");
                }
                appData = parsedData;
                // Recalculate all colors on load to ensure consistency with current logic
                Object.values(appData.cards).forEach(card => {
                     // Temporarily remove color so getColorForCard recalculates based on hierarchy
                     delete card.color;
                });
                 Object.values(appData.cards).forEach(card => {
                     card.color = getColorForCard(card); // Recalculate and assign
                 });
                 // Ensure order exists
                 Object.values(appData.cards).forEach(card => {
                      if (card.order === undefined) card.order = Date.now() + Math.random(); // Assign order if missing
                 });

            } catch (e) {
                console.error("Error parsing data from localStorage:", e);
                alert("Could not load saved data. Resetting to default.");
                localStorage.removeItem('writingToolData');
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
            addColumnInternal(false);
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
        return Object.values(appData.cards)
               .filter(card => card.columnIndex === columnIndex && !card.parentId)
               .sort((a, b) => a.order - b.order);
    }

    function getChildCards(parentId, targetColumnIndex = null) {
        let children = Object.values(appData.cards)
                         .filter(card => card.parentId === parentId);
        if (targetColumnIndex !== null) {
            children = children.filter(card => card.columnIndex === targetColumnIndex);
        }
        return children.sort((a, b) => a.order - b.order);
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

    // --- Color Calculation (REVISED) ---
    function getColorForCard(card) {
        if (!card) return `hsl(${BASE_COLOR_HUE}, ${BASE_COLOR_SATURATION}%, ${BASE_COLOR_LIGHTNESS}%)`; // Default fallback

        if (card.columnIndex === 0 && !card.parentId) { // Is a Root Card?
            const rootCards = getColumnCards(0); // Sorted by order
            const rootIndex = rootCards.findIndex(c => c.id === card.id);
            const hue = (BASE_COLOR_HUE + (rootIndex >= 0 ? rootIndex : 0) * HUE_ROTATION_STEP) % 360; // Rotate hue
            return `hsl(${hue}, ${BASE_COLOR_SATURATION}%, ${BASE_COLOR_LIGHTNESS}%)`;

        } else if (card.parentId) { // Is a Child Card?
            const parentCard = getCard(card.parentId);
            if (!parentCard) {
                 console.warn(`Parent card ${card.parentId} not found for card ${card.id}. Using default color.`);
                 return `hsl(${BASE_COLOR_HUE}, ${BASE_COLOR_SATURATION}%, ${BASE_COLOR_LIGHTNESS - LIGHTNESS_STEP_DOWN}%)`;
            }

            // Get parent's calculated color (recalculate if missing, though it should exist)
            const parentColor = parentCard.color || getColorForCard(parentCard);

            try {
                const match = parentColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
                if (match) {
                    let [, h, s, l] = match.map(Number); // Keep parent's Hue (h)
                    // Darken and saturate relative to parent
                    const newLightness = Math.max(15, l - LIGHTNESS_STEP_DOWN); // Ensure minimum lightness
                    const newSaturation = Math.min(100, s + SATURATION_STEP_UP);
                    return `hsl(${h}, ${newSaturation}%, ${newLightness}%)`;
                } else {
                     console.warn(`Could not parse parent color ${parentColor}. Using fallback darkening.`);
                     // Fallback: Darken the default base color based on estimated level
                     let level = getCardDepth(card.id);
                     const lightness = Math.max(15, BASE_COLOR_LIGHTNESS - (level * LIGHTNESS_STEP_DOWN));
                     const saturation = Math.min(100, BASE_COLOR_SATURATION + (level * SATURATION_STEP_UP));
                     return `hsl(${BASE_COLOR_HUE}, ${saturation}%, ${lightness}%)`; // Use default hue
                }
            } catch (e) {
                 console.error("Error processing parent color:", e);
                 let level = getCardDepth(card.id);
                 const lightness = Math.max(15, BASE_COLOR_LIGHTNESS - (level * LIGHTNESS_STEP_DOWN));
                 const saturation = Math.min(100, BASE_COLOR_SATURATION + (level * SATURATION_STEP_UP));
                 return `hsl(${BASE_COLOR_HUE}, ${saturation}%, ${lightness}%)`;
            }
        } else {
             // Card in col > 0 but no parent? Should not happen.
             console.warn(`Card ${card.id} in column ${card.columnIndex} has no parent. Using default color.`);
             return `hsl(${BASE_COLOR_HUE}, ${BASE_COLOR_SATURATION}%, ${BASE_COLOR_LIGHTNESS}%)`;
        }
    }

    // Helper to get card depth for fallback color calculation
    function getCardDepth(cardId) {
         let level = 0;
         let currentCard = getCard(cardId);
         while (currentCard && currentCard.parentId) {
             level++;
             currentCard = getCard(currentCard.parentId);
         }
         return level;
    }


    function getHighlightColor(baseColor) {
        try {
            const match = baseColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
            if (match) {
                const [, h, s, l] = match.map(Number);
                const highlightL = Math.max(10, l - 5); // Darker
                const highlightS = Math.min(100, s + 5); // More saturated
                return `hsl(${h}, ${highlightS}%, ${highlightL}%)`;
            }
        } catch (e) { console.warn("Could not parse color for highlight:", baseColor); }
        return 'rgba(0, 0, 0, 0.15)'; // Fallback
    }


    // --- DOM Manipulation & Rendering ---

    // REVISED: Create Card Element - Drag handle limited to header
    function createCardElement(card) {
        const cardEl = document.createElement('div');
        cardEl.id = `card-${card.id}`;
        cardEl.className = 'card';
        // cardEl.draggable = false; // Card itself is NOT draggable
        cardEl.dataset.cardId = card.id;
        // Ensure color is calculated and applied
        card.color = card.color || getColorForCard(card); // Recalculate if missing
        cardEl.style.backgroundColor = card.color;

        cardEl.innerHTML = `
            <div class="card-header" draggable="true"> <!-- Header IS draggable -->
                <span class="card-id">#${card.id.slice(-4)}</span>
                <div class="card-actions">
                    <button class="add-child-btn" title="Add Child Card">+</button>
                    <button class="delete-card-btn" title="Delete Card">×</button>
                </div>
            </div>
            <textarea class="card-content" placeholder="Enter text...">${card.content || ''}</textarea>
        `;

        const headerEl = cardEl.querySelector('.card-header');
        const textarea = cardEl.querySelector('.card-content');

        // Drag listeners attached to HEADER
        headerEl.addEventListener('dragstart', handleDragStart);
        headerEl.addEventListener('dragend', handleDragEnd); // dragend fires on the source element

        // Drop-related listeners remain on the card element (as a drop target)
        cardEl.addEventListener('dragenter', (e) => {
             if (e.target.closest('.card') === cardEl) {
                 e.stopPropagation();
             }
             handleDragEnter(e);
        });
         cardEl.addEventListener('dragleave', handleDragLeave);
         // Note: 'drop' and 'dragover' are handled by parent containers (group/cards-container)

        // Other listeners
        textarea.addEventListener('blur', handleTextareaBlur);
        textarea.addEventListener('focus', handleTextareaFocus);
        textarea.addEventListener('input', autoResizeTextarea);
        requestAnimationFrame(() => autoResizeTextarea({ target: textarea }));

        headerEl.querySelector('.add-child-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            addCard(card.columnIndex + 1, card.id);
        });
        headerEl.querySelector('.delete-card-btn').addEventListener('click', (e) => {
            e.stopPropagation();
             deleteCard(card.id);
        });

        return cardEl;
    }

    function createGroupElement(parentId) {
        const parentCard = getCard(parentId);
        if (!parentCard) return null;

        const groupEl = document.createElement('div');
        groupEl.id = `group-${parentId}`;
        groupEl.className = 'card-group';
        groupEl.dataset.parentId = parentId;

        groupEl.innerHTML = `
            <div class="group-header">Children of <strong>#${parentId.slice(-4)}</strong></div>
        `;

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

        columnEl.querySelector('.add-card-btn').addEventListener('click', () => addCard(columnIndex, null));
        columnEl.querySelector('.add-column-btn').addEventListener('click', addColumn);
        columnEl.querySelector('.delete-column-btn').addEventListener('click', () => deleteColumn(columnIndex));

        cardsContainer.addEventListener('dblclick', (e) => {
             if (e.target === cardsContainer && columnIndex === 0) {
                 addCard(columnIndex, null);
             }
        });

        cardsContainer.addEventListener('dragover', handleDragOver);
        cardsContainer.addEventListener('dragenter', handleDragEnter);
        cardsContainer.addEventListener('dragleave', handleDragLeave);
        cardsContainer.addEventListener('drop', handleDrop);

        return columnEl;
    }

    function renderColumnContent(columnEl, columnIndex) {
        const cardsContainer = columnEl.querySelector('.cards-container');
        cardsContainer.innerHTML = '';

        // Render Groups first
        if (columnIndex > 0) {
            const potentialParentCards = Object.values(appData.cards)
                .filter(card => card.columnIndex === columnIndex - 1)
                .sort((a, b) => a.order - b.order);

            potentialParentCards.forEach(parentCard => {
                 const groupEl = createGroupElement(parentCard.id);
                 if (!groupEl) return;

                 const childCards = getChildCards(parentCard.id, columnIndex);

                 childCards.forEach(childCard => {
                     const cardEl = createCardElement(childCard); // Will ensure color is correct
                     groupEl.appendChild(cardEl);
                 });
                 cardsContainer.appendChild(groupEl);
            });
        }

        // Render Root Cards for this column
        const rootCardsInColumn = getColumnCards(columnIndex); // Already sorted

        rootCardsInColumn.forEach(card => {
            const cardEl = createCardElement(card); // Will ensure color is correct
            cardsContainer.appendChild(cardEl);
        });

        updateToolbarButtons(columnEl, columnIndex);
    }

    function renderApp() {
        columnsContainer.innerHTML = '';

        let maxColumnIndex = MIN_COLUMNS - 1;
        Object.values(appData.cards).forEach(card => {
             maxColumnIndex = Math.max(maxColumnIndex, card.columnIndex);
        });

        while (appData.columns.length <= maxColumnIndex) {
             addColumnInternal(false);
        }

        const columnsToRenderCount = Math.max(MIN_COLUMNS, appData.columns.length);

        for (let i = 0; i < columnsToRenderCount; i++) {
             const columnEl = createColumnElement(i);
             columnsContainer.appendChild(columnEl);
             renderColumnContent(columnEl, i);
        }

        updateAllToolbarButtons();
        console.log("App rendered.");
    }


    function updateToolbarButtons(columnEl, columnIndex) {
         const addCardBtn = columnEl.querySelector('.add-card-btn');
         const addColBtn = columnEl.querySelector('.add-column-btn');
         const delColBtn = columnEl.querySelector('.delete-column-btn');
         const numColumns = columnsContainer.children.length;
         const isRightmost = columnIndex === numColumns - 1;

         addCardBtn.classList.toggle('hidden', columnIndex !== 0);
         addColBtn.classList.toggle('hidden', !isRightmost);

         const columnCards = Object.values(appData.cards).filter(card => card.columnIndex === columnIndex);
         const canDelete = isRightmost && numColumns > MIN_COLUMNS && columnCards.length === 0;
         delColBtn.classList.toggle('hidden', !canDelete);
         delColBtn.disabled = !canDelete;
    }

    function autoResizeTextarea(event) {
        const textarea = event.target;
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.min(textarea.scrollHeight, 500)}px`;
    }

    // --- Event Handlers ---

    function handleTextareaBlur(event) {
        const textarea = event.target;
        const cardEl = textarea.closest('.card');
        if (!cardEl) return;
        const cardId = cardEl.dataset.cardId;
        const card = getCard(cardId);

        if (card && card.content !== textarea.value) {
            card.content = textarea.value;
            saveData();
            console.log(`Card ${cardId} content saved.`);
        }
        cardEl.classList.remove('editing');
        clearHighlights();
    }

    function handleTextareaFocus(event) {
         const textarea = event.target;
         const cardEl = textarea.closest('.card');
         const cardId = cardEl.dataset.cardId;

         cardEl.classList.add('editing');
         highlightHierarchy(cardId);
    }

    function highlightHierarchy(cardId) {
        clearHighlights(); // Clear previous highlights first

        const targetCard = getCard(cardId);
        if (!targetCard) return;

        const ancestors = getAncestorIds(cardId);
        const descendants = getDescendantIds(cardId);
        const allToHighlight = [cardId, ...ancestors, ...descendants];

        allToHighlight.forEach(id => {
            const cardEl = getCardElement(id);
            const cardData = getCard(id); // Get the card's data object

            if (cardEl && cardData) { // Ensure both the element and its data exist
                cardEl.classList.add('highlight');

                // *** CORRECTED PART ***
                // Always get the definitive base color, preferably from storage, fallback to calculation
                let baseColor = cardData.color;
                if (!baseColor) {
                    // If color isn't stored (shouldn't happen often after load/add/move), calculate and store it
                    baseColor = getColorForCard(cardData);
                    cardData.color = baseColor; // Store the calculated color
                    console.warn(`Recalculated and stored missing color for card ${id} during highlight.`);
                }

                // Calculate highlight color based *only* on the base color
                const highlightBg = getHighlightColor(baseColor);

                // Apply the calculated highlight color
                cardEl.style.backgroundColor = highlightBg;

                // Debugging log: Check baseColor and highlightBg
                // console.log(`Highlighting Card ${id}: Base='${baseColor}', Highlight='${highlightBg}'`);

            }

            // Highlight the corresponding group header if it's a parent/ancestor
            const groupEl = getGroupElement(id);
            if (groupEl) {
                groupEl.classList.add('highlight');
            }
        });
    }

    function clearHighlights() {
        document.querySelectorAll('.card.highlight, .card.editing, .card-group.highlight').forEach(el => {
            el.classList.remove('highlight', 'editing');
            if (el.classList.contains('card')) {
                const cardId = el.dataset.cardId;
                const card = getCard(cardId);
                // Restore the definitive base color from the card data
                if(card && card.color) {
                    el.style.backgroundColor = card.color;
                } else if (card) {
                    // Fallback if color somehow got removed from data - recalculate
                    el.style.backgroundColor = getColorForCard(card);
                } else {
                    // Fallback if card data is gone
                    el.style.backgroundColor = '';
                }
            }
            // No background color change needed for group headers, just remove class
        });
    }

    // REVISED: handleDragStart - Expects event target to be the header
    function handleDragStart(event) {
        // Ensure drag starts on the header, not internal elements like buttons
        if (event.target.tagName === 'BUTTON' || event.target.closest('button')) {
            event.preventDefault();
            return;
        }

        const headerEl = event.target.closest('.card-header');
        const cardEl = headerEl ? headerEl.closest('.card') : null;

        if (!cardEl) {
            event.preventDefault(); // Should not happen if listener is correct, but safeguard
            return;
        }

        draggedCardId = cardEl.dataset.cardId;
        event.dataTransfer.setData('text/plain', draggedCardId);
        event.dataTransfer.effectAllowed = 'move';

        requestAnimationFrame(() => {
            // Add dragging class to the *card* element for visual feedback
            cardEl.classList.add('dragging');
        });

        if (!dragIndicator) {
            dragIndicator = document.createElement('div');
            dragIndicator.className = 'drag-over-indicator';
            dragIndicator.style.display = 'none';
            document.body.appendChild(dragIndicator);
        }
        console.log(`Drag Start: ${draggedCardId}`);
    }

    // REVISED: handleDragEnd - Expects event target to be the header
    function handleDragEnd(event) {
        if (draggedCardId) {
            const cardEl = getCardElement(draggedCardId);
            if (cardEl) {
                // Remove dragging class from the *card* element
                cardEl.classList.remove('dragging');
            }
        }
        clearDragStyles();
        draggedCardId = null;
        console.log("Drag End");
    }

    // --- DragOver, DragEnter, DragLeave, Drop handlers remain largely the same ---
    // They operate on potential drop targets (cards, groups, containers)
    // and don't depend on where the drag *started* from initially.

    function handleDragOver(event) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';

        if (!draggedCardId) return;

        const targetElement = event.target;
        const targetCard = targetElement.closest('.card');
        const targetGroup = targetElement.closest('.card-group');
        const targetCardsContainer = targetElement.closest('.cards-container');

        clearDragStyles(false);

        let validDropTarget = false;
        let indicatorParent = null;
        let indicatorNextSibling = null;

        // Constraint: Cannot drop near the card being dragged
        if (targetCard && targetCard.dataset.cardId === draggedCardId) {
             validDropTarget = false; // Hovering over self, invalid drop zone
             // Optionally hide indicator explicitly here if needed
             if (dragIndicator) dragIndicator.style.display = 'none';
        }
        // Hovering over another card (for reordering)
        else if (targetCard) {
            const rect = targetCard.getBoundingClientRect();
            const midway = rect.top + rect.height / 2;
            const parentContainer = targetCard.parentNode;

            targetCard.classList.add('drag-over-card');

             if (event.clientY < midway) {
                 indicatorParent = parentContainer;
                 indicatorNextSibling = targetCard;
             } else {
                 indicatorParent = parentContainer;
                 indicatorNextSibling = targetCard.nextSibling;
             }
             validDropTarget = true;

        } else if (targetGroup) {
            // Hovering over a card group
            const groupParentId = targetGroup.dataset.parentId;
            // Constraint: Cannot drop into own child group
            if (groupParentId === draggedCardId) {
                 validDropTarget = false;
                 if (dragIndicator) dragIndicator.style.display = 'none';
            } else {
                 targetGroup.classList.add('drag-over-group');
                 validDropTarget = true;
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
                      const header = targetGroup.querySelector('.group-header');
                      indicatorParent = targetGroup;
                      indicatorNextSibling = header ? header.nextSibling : targetGroup.firstChild;
                 }
            }

        } else if (targetCardsContainer) {
            // Hovering over empty space in a column's card container
            const columnEl = targetCardsContainer.closest('.column');
            const columnIndex = getColumnIndex(columnEl);
            const draggedCardIsRoot = !getCard(draggedCardId)?.parentId;

            // Allow dropping as root card only in first column OR if moving an existing root card
            if (columnIndex === 0 || draggedCardIsRoot) {
                 targetCardsContainer.classList.add('drag-over-empty');
                 validDropTarget = true;
                 const children = Array.from(targetCardsContainer.children).filter(el => el.matches('.card, .card-group'));
                 let closestElement = null;
                 let smallestDistance = Infinity;

                 children.forEach(el => {
                     if(el.dataset.cardId === draggedCardId) return; // Skip self
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
                     indicatorParent = targetCardsContainer;
                     indicatorNextSibling = null; // Append
                 }
             } else {
                validDropTarget = false;
                 if (dragIndicator) dragIndicator.style.display = 'none';
             }
        } else {
            validDropTarget = false;
        }

        if (validDropTarget && indicatorParent) {
             if(indicatorNextSibling) {
                 indicatorParent.insertBefore(dragIndicator, indicatorNextSibling);
             } else {
                 indicatorParent.appendChild(dragIndicator);
             }
             dragIndicator.style.display = 'block';
        } else {
             if(dragIndicator) dragIndicator.style.display = 'none';
        }
    }

    function handleDragEnter(event) {
        event.preventDefault();
        event.stopPropagation();

        const targetGroup = event.target.closest('.card-group');
        const targetCardsContainer = event.target.closest('.cards-container');
        const targetCard = event.target.closest('.card');

        if (targetCard && targetCard.dataset.cardId === draggedCardId) return; // No highlight on self enter
        if (targetGroup && targetGroup.dataset.parentId === draggedCardId) return; // No highlight on own group enter


         if (targetGroup) {
            targetGroup.classList.add('drag-over-group');
         } else if (targetCardsContainer) {
             targetCardsContainer.classList.add('drag-over-empty');
         } else if (targetCard) {
             targetCard.classList.add('drag-over-card');
         }
    }

    function handleDragLeave(event) {
         event.stopPropagation();
        const relatedTarget = event.relatedTarget;
        const currentTarget = event.currentTarget; // Element the listener is attached to

        // Check if leaving the element the listener is on, or one of its valid drop target children
         const leavingValidTarget = currentTarget.classList.contains('card') ||
                                 currentTarget.classList.contains('card-group') ||
                                 currentTarget.classList.contains('cards-container');

        if (leavingValidTarget && (!relatedTarget || !currentTarget.contains(relatedTarget))) {
             currentTarget.classList.remove('drag-over-card', 'drag-over-group', 'drag-over-empty');

              // Hide indicator only if leaving a container where it was shown AND moving outside it
              if (dragIndicator && dragIndicator.parentNode === currentTarget && !currentTarget.contains(relatedTarget)) {
                   dragIndicator.style.display = 'none';
              }
        }
        // Also clear children if leaving container
         if (currentTarget.classList.contains('cards-container') || currentTarget.classList.contains('card-group')) {
            if (!currentTarget.contains(relatedTarget)) { // If mouse truly left the container
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
        if (!droppedCardId || !draggedCardId || droppedCardId !== draggedCardId) {
            console.warn("Drop aborted: Mismatched or missing card ID.");
            clearDragStyles();
            draggedCardId = null;
            return;
        }

        const droppedCard = getCard(droppedCardId);
        if (!droppedCard) {
             console.error("Drop aborted: Dragged card data not found.");
             clearDragStyles();
             draggedCardId = null;
             return;
        }

        if (!dragIndicator || dragIndicator.style.display === 'none' || !dragIndicator.parentNode) {
            console.warn("Drop aborted: No valid drop indicator position found.");
            clearDragStyles();
            draggedCardId = null;
            return;
        }

        const indicatorParent = dragIndicator.parentNode;
        const insertBeforeElement = dragIndicator.nextElementSibling;

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
             newParentId = indicatorParent.dataset.parentId;
             if (newParentId === droppedCardId) {
                 console.warn("Drop aborted: Cannot drop into own child group (final check).");
                 clearDragStyles();
                 draggedCardId = null;
                 return;
             }
        } else if (indicatorParent.classList.contains('cards-container')) {
            // Dropped directly into a column's main container
            newParentId = null; // Assume root unless specific logic dictates otherwise
            // Ensure this is allowed (col 0 or moving existing root)
            const draggedCardIsRoot = !droppedCard.parentId;
            if(targetColumnIndex > 0 && !draggedCardIsRoot) {
                 console.warn(`Drop aborted: Cannot drop non-root card into empty space of column ${targetColumnIndex}.`);
                 clearDragStyles();
                 draggedCardId = null;
                 return;
            }
        } else {
            console.warn("Drop aborted: Indicator parent is neither group nor container.", indicatorParent);
            clearDragStyles();
            draggedCardId = null;
            return;
        }

        if (insertBeforeElement && insertBeforeElement.classList.contains('card')) {
            insertBeforeCardId = insertBeforeElement.dataset.cardId;
        } else if (insertBeforeElement && insertBeforeElement.classList.contains('card-group')) {
             const firstCardInGroup = insertBeforeElement.querySelector('.card');
             insertBeforeCardId = firstCardInGroup ? firstCardInGroup.dataset.cardId : null;
        } else {
             insertBeforeCardId = null; // Append
        }

        // Final check: ensure we are not inserting relative to self if somehow indicator ended up there
        if (insertBeforeCardId === droppedCardId) {
             console.warn("Drop aborted: Attempting to insert relative to self.");
              clearDragStyles();
              draggedCardId = null;
              return;
        }

        console.log(`Drop details: Card ${droppedCardId} -> Col ${targetColumnIndex}, Parent ${newParentId || 'root'}, Before ${insertBeforeCardId || 'end'}`);

        moveCard(droppedCardId, targetColumnIndex, newParentId, insertBeforeCardId);
        clearDragStyles();
        draggedCardId = null;
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

    // --- Core Logic Functions ---

    function addCard(columnIndex, parentId = null) {
        if (parentId && !getCard(parentId)) {
            console.error(`Cannot add card: Parent ${parentId} not found.`);
            return;
        }
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
            order: 0, // Set below
            color: '' // Calculated below
        };

        appData.cards[newCardId] = newCard; // Add to data *before* calculating order/color

        // Determine order (append)
        let siblings;
        if (parentId) {
            siblings = getChildCards(parentId, columnIndex).filter(c => c.id !== newCardId);
        } else {
            siblings = getColumnCards(columnIndex).filter(c => c.id !== newCardId);
        }
        newCard.order = siblings.length > 0 ? Math.max(...siblings.map(c => c.order)) + 1 : 0;

        // Calculate Color (depends on order for root cards)
        newCard.color = getColorForCard(newCard);

        // If adding a root card, existing root card colors might need update if order affects hue
        if (columnIndex === 0 && !parentId) {
             const rootCards = getColumnCards(0);
             rootCards.forEach(rc => {
                  const newColor = getColorForCard(rc);
                  if (rc.color !== newColor) {
                      rc.color = newColor;
                      // Update element if already rendered (though we re-render below)
                      const rcEl = getCardElement(rc.id);
                      if (rcEl) rcEl.style.backgroundColor = rc.color;
                  }
             });
        }


        while (columnsContainer.children.length <= columnIndex) {
             addColumn();
        }

        // Re-render affected columns
        const targetColumnEl = getColumnElementByIndex(columnIndex);
        if (targetColumnEl) renderColumnContent(targetColumnEl, columnIndex);

        if (columnsContainer.children.length > columnIndex + 1) {
             const nextColumnEl = getColumnElementByIndex(columnIndex + 1);
             if (nextColumnEl) renderColumnContent(nextColumnEl, columnIndex + 1);
        }

        saveData();

        requestAnimationFrame(() => {
             const newCardEl = getCardElement(newCardId);
             if (newCardEl) {
                 const textarea = newCardEl.querySelector('.card-content');
                  if(textarea) textarea.focus();
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
        const numDescendants = descendantIds.length;
        const wasRoot = !card.parentId && card.columnIndex === 0;

        if (!confirm(`Delete card #${cardId.slice(-4)} and its ${numDescendants} descendant(s)?`)) {
            return;
        }

        const affectedColumns = new Set();
        affectedColumns.add(card.columnIndex);
        if (numDescendants > 0 && columnsContainer.children.length > card.columnIndex + 1) {
             affectedColumns.add(card.columnIndex + 1);
        }

        allIdsToDelete.forEach(id => {
            const c = getCard(id);
            if (c) {
                 affectedColumns.add(c.columnIndex);
                 if (columnsContainer.children.length > c.columnIndex + 1) {
                     affectedColumns.add(c.columnIndex + 1);
                 }
                 delete appData.cards[id];
            }
        });

         // If a root card was deleted, other root cards might need color updates
         let rootColorsNeedUpdate = wasRoot;

         // Re-render affected columns first
         Array.from(affectedColumns).sort((a,b)=>a-b).forEach(colIndex => {
             const colEl = getColumnElementByIndex(colIndex);
             if (colEl) {
                 renderColumnContent(colEl, colIndex);
             }
         });

        // Now, if needed, update root colors and re-render column 0
        if (rootColorsNeedUpdate) {
             const rootCards = getColumnCards(0);
             let updated = false;
             rootCards.forEach(rc => {
                  const newColor = getColorForCard(rc);
                  if (rc.color !== newColor) {
                      rc.color = newColor;
                      updated = true;
                  }
             });
             if (updated) {
                  const col0El = getColumnElementByIndex(0);
                  if (col0El) renderColumnContent(col0El, 0);
             }
        }

        updateAllToolbarButtons();
        saveData();
        console.log(`Card ${cardId} and ${numDescendants} descendants deleted.`);
    }

    function addColumnInternal(doSave = true) {
        const newIndex = appData.columns.length;
        appData.columns.push({ id: `col-${generateId()}` });
        console.log("Internal add column, new count:", appData.columns.length);
        if (doSave) saveData();
        return newIndex;
    }

    function addColumn() {
         const newIndex = addColumnInternal();
         const columnEl = createColumnElement(newIndex);
         columnsContainer.appendChild(columnEl);
         renderColumnContent(columnEl, newIndex);
         updateAllToolbarButtons();
         console.log(`Column ${newIndex} added visually.`);
         columnsContainer.scrollLeft = columnsContainer.scrollWidth;
    }

    function deleteColumn(columnIndex) {
        const numColumns = columnsContainer.children.length;
        const columnEl = getColumnElementByIndex(columnIndex);
        const isRightmost = columnIndex === numColumns - 1;
        const columnCards = Object.values(appData.cards).filter(card => card.columnIndex === columnIndex);
        const canDelete = isRightmost && numColumns > MIN_COLUMNS && columnCards.length === 0;

        if (!canDelete) {
            alert("Cannot delete this column. It might not be the rightmost, the minimum number of columns hasn't been exceeded, or it's not empty.");
            return;
        }
        if (!confirm("Delete this empty column?")) return;

        if (columnEl && columnEl.parentNode === columnsContainer) {
            columnsContainer.removeChild(columnEl);
        } else {
            renderApp(); return; // Failsafe
        }

        if(appData.columns.length > columnIndex) {
             appData.columns.splice(columnIndex, 1);
        }

        updateAllToolbarButtons();
        saveData();
        console.log(`Column ${columnIndex} deleted.`);
    }

    function moveCard(cardId, targetColumnIndex, newParentId, insertBeforeCardId) {
        const card = getCard(cardId);
        if (!card) return;

        const originalColumnIndex = card.columnIndex;
        const originalParentId = card.parentId;
        const wasRoot = !originalParentId && originalColumnIndex === 0;
        const isBecomingRoot = !newParentId && targetColumnIndex === 0;

        // Prevent dropping into self/descendant
        let tempParentId = newParentId;
        while(tempParentId) {
            if (tempParentId === cardId) {
                 console.warn("Move Aborted: Cannot move card inside itself or descendants.");
                 return;
            }
            tempParentId = getCard(tempParentId)?.parentId;
        }

        // --- Update card basic properties ---
        card.columnIndex = targetColumnIndex;
        card.parentId = newParentId;
        // Order and color calculated below, after siblings are known

        // --- Calculate new order ---
        let siblings;
        if (newParentId) {
            siblings = getChildCards(newParentId, targetColumnIndex).filter(c => c.id !== cardId);
        } else {
            siblings = getColumnCards(targetColumnIndex).filter(c => c.id !== cardId);
        }
        // siblings are already sorted

        let newOrder;
        if (insertBeforeCardId && insertBeforeCardId !== cardId) {
            const insertBeforeCard = getCard(insertBeforeCardId);
            if (insertBeforeCard) {
                 const insertBeforeOrder = insertBeforeCard.order;
                 let prevOrder = -1;
                 const insertBeforeIndex = siblings.findIndex(c => c.id === insertBeforeCardId);
                 if (insertBeforeIndex > 0) {
                     prevOrder = siblings[insertBeforeIndex - 1].order;
                 } else if (insertBeforeIndex === -1) {
                      console.warn(`insertBeforeCardId ${insertBeforeCardId} not found among siblings. Appending.`);
                      newOrder = siblings.length > 0 ? Math.max(...siblings.map(c => c.order)) + 1 : 0;
                 }
                 if (insertBeforeIndex !== -1) {
                     newOrder = (prevOrder + insertBeforeOrder) / 2.0;
                 }
            } else {
                 console.warn(`Invalid insertBeforeCardId ${insertBeforeCardId}. Appending.`);
                 newOrder = siblings.length > 0 ? Math.max(...siblings.map(c => c.order)) + 1 : 0;
            }
        } else {
            newOrder = siblings.length > 0 ? Math.max(...siblings.map(c => c.order)) + 1 : 0;
        }
        card.order = newOrder;

        // --- Update Color (must be after order is set for root cards) ---
        card.color = getColorForCard(card);

        // --- Update descendants recursively ---
        const columnDiff = targetColumnIndex - originalColumnIndex;
        const affectedDescendants = [];
        let maxDescendantCol = targetColumnIndex; // Track max column needed
        if (columnDiff !== 0) {
            const descendants = getDescendantIds(cardId);
            descendants.forEach(descId => {
                const descCard = getCard(descId);
                if (descCard) {
                    descCard.columnIndex += columnDiff;
                    descCard.color = getColorForCard(descCard); // Update descendant colors
                    affectedDescendants.push(descCard);
                    maxDescendantCol = Math.max(maxDescendantCol, descCard.columnIndex);
                }
            });
        } else {
             // If column didn't change, descendants might still need color update if parent color changed
             const descendants = getDescendantIds(cardId);
             descendants.forEach(descId => {
                 const descCard = getCard(descId);
                 if (descCard) {
                     descCard.color = getColorForCard(descCard);
                     affectedDescendants.push(descCard); // Track for potential re-render
                 }
             });
        }


        // --- Update colors of other root cards if hierarchy changed ---
        let rootColorsNeedUpdate = false;
        if (wasRoot !== isBecomingRoot || (isBecomingRoot && siblings.length > 0)) {
             // If a card became root, left root, or reordered among roots
             rootColorsNeedUpdate = true;
        }


        // --- Ensure enough columns exist ---
        while (columnsContainer.children.length <= maxDescendantCol) {
             addColumn();
        }

        // --- Determine Columns to Re-render ---
        const columnsToRender = new Set();
        columnsToRender.add(originalColumnIndex);
        columnsToRender.add(targetColumnIndex);
        if (originalParentId) columnsToRender.add(getCard(originalParentId)?.columnIndex + 1);
        if (newParentId) columnsToRender.add(getCard(newParentId)?.columnIndex + 1);
        affectedDescendants.forEach(desc => columnsToRender.add(desc.columnIndex));
        // Add columns next to original/target if they exist
        if (columnsContainer.children.length > originalColumnIndex + 1) columnsToRender.add(originalColumnIndex + 1);
        if (columnsContainer.children.length > targetColumnIndex + 1) columnsToRender.add(targetColumnIndex + 1);

        // Filter out invalid column indices (e.g., -1 if parent was missing)
        const validColumnsToRender = Array.from(columnsToRender).filter(idx => idx !== undefined && idx !== null && idx >= 0).sort((a, b) => a - b);

        // --- Update root colors if needed ---
        if (rootColorsNeedUpdate) {
             const rootCards = getColumnCards(0); // Get current roots
             rootCards.forEach(rc => {
                  rc.color = getColorForCard(rc); // Recalculate based on new order
             });
             validColumnsToRender.push(0); // Ensure column 0 is re-rendered
        }

        // --- Perform the render ---
        console.log("Re-rendering columns after move:", [...new Set(validColumnsToRender)].sort((a,b)=>a-b)); // Deduplicate and sort
        [...new Set(validColumnsToRender)].sort((a,b)=>a-b).forEach(index => {
            const colEl = getColumnElementByIndex(index);
            if (colEl) {
                renderColumnContent(colEl, index);
            } else {
                 console.warn(`Attempted to re-render non-existent column at index ${index}`);
            }
        });

        updateAllToolbarButtons();
        saveData();
        console.log(`Card ${cardId} moved SUCCESS -> Col ${targetColumnIndex}, Parent: ${newParentId || 'root'}, Order: ${card.order}`);
    }

    function updateAllToolbarButtons() {
        Array.from(columnsContainer.children).forEach((col, idx) => {
            updateToolbarButtons(col, idx);
        });
    }

    // --- Initial Load ---
    loadData();

}); // End DOMContentLoaded