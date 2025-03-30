document.addEventListener('DOMContentLoaded', () => {
    const columnsContainer = document.getElementById('columns-container');
    const STORAGE_KEY = 'canvasWriterData';

    // --- Data Management ---
    let cardData = {}; // { id: {id, content, parentId, columnIndex, order, color, baseHue?} }
    let columnOrder = []; // [columnIndex1, columnIndex2, ...]
    let assignedRootHues = new Set(); // Track used base hues for root cards
    const HUE_STEP = 30; // Degrees to step for new root colors
    let nextRootHue = 210; // Starting hue (blue)

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }

    // --- Color Management ---

    function assignNewRootHue() {
        let attempts = 0;
        // Cycle through hues until an unused one is found (max attempts to prevent infinite loop)
        while (assignedRootHues.has(nextRootHue) && attempts < 360 / HUE_STEP) {
            nextRootHue = (nextRootHue + HUE_STEP) % 360;
            attempts++;
        }
        const assignedHue = nextRootHue;
        assignedRootHues.add(assignedHue);
        // Set next hue for the *next* card immediately
        nextRootHue = (nextRootHue + HUE_STEP) % 360;
        return assignedHue;
    }

    function releaseRootHue(hue) {
        assignedRootHues.delete(hue);
    }

    function findRootAncestorAndDepth(cardId) {
        let currentCard = cardData[cardId];
        let depth = 0;
        const maxDepth = 20; // Safety break

        while (currentCard && currentCard.parentId && depth < maxDepth) {
            const parentCard = cardData[currentCard.parentId];
            if (!parentCard) break; // Parent deleted or data inconsistency
            currentCard = parentCard;
            depth++;
        }

        // currentCard is now the root ancestor (or the card itself if it was root)
        return { rootCard: currentCard, depth: depth };
    }


    function calculateCardColor(cardId) {
        const card = cardData[cardId];
        if (!card) return '#FFFFFF'; // Default white if card not found

        const { rootCard, depth } = findRootAncestorAndDepth(cardId);

        if (!rootCard) return '#FFFFFF'; // Should not happen if data is consistent

        const baseHue = rootCard.baseHue !== undefined ? rootCard.baseHue : 210; // Use stored hue or default blue
        const baseSaturation = 50; // Keep saturation consistent
        const initialLightness = 95; // Lightness of root cards
        const lightnessStep = 4; // Decrease lightness slightly per level
        const minLightness = 50; // Prevent colors from becoming too dark

        const finalLightness = Math.max(minLightness, initialLightness - (depth * lightnessStep));

        return `hsl(${baseHue}, ${baseSaturation}%, ${finalLightness}%)`;
    }

    // Update existing cards' colors if their hierarchy changes
    function updateColorRecursively(cardId) {
        const card = cardData[cardId];
        if (!card) return;

        card.color = calculateCardColor(cardId);

        const children = getChildren(cardId);
        children.forEach(child => updateColorRecursively(child.id));
    }


    // --- Data Saving/Loading ---

    function saveData() {
        try {
            // Prune assignedRootHues based on *current* root cards before saving
             const currentRootHues = new Set();
             Object.values(cardData).forEach(card => {
                 if (!card.parentId && card.baseHue !== undefined) {
                     currentRootHues.add(card.baseHue);
                 }
             });
             assignedRootHues = currentRootHues; // Keep only hues of existing roots

            const dataToSave = {
                cards: cardData,
                columns: columnOrder,
                nextRootHue: nextRootHue, // Save the next hue state
                assignedRootHues: Array.from(assignedRootHues) // Save assigned hues
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
            console.log("Data saved.");
        } catch (e) {
            console.error("Error saving data to localStorage:", e);
            alert("Could not save data. LocalStorage might be full or disabled.");
        }
        updateToolbarStates(); // Update delete buttons after save
    }

    function loadData() {
        const loadedData = localStorage.getItem(STORAGE_KEY);
        let needsSave = false; // Flag if data needs migration/cleanup on load

        if (loadedData) {
            try {
                const parsedData = JSON.parse(loadedData);
                cardData = parsedData.cards || {};
                columnOrder = parsedData.columns || [];
                nextRootHue = parsedData.nextRootHue !== undefined ? parsedData.nextRootHue : 210;
                 // Load assigned hues, converting back to a Set
                assignedRootHues = new Set(parsedData.assignedRootHues || []);


                 // --- Data Migration & Cleanup ---
                 let maxColIndex = -1;
                 const existingHues = new Set();

                 Object.values(cardData).forEach(card => {
                    // Ensure baseHue exists for root cards (assign if missing)
                    if (!card.parentId && card.baseHue === undefined) {
                         console.warn(`Assigning missing baseHue to root card ${card.id}`);
                         card.baseHue = assignNewRootHue();
                         needsSave = true;
                    }
                    if (!card.parentId && card.baseHue !== undefined) {
                        existingHues.add(card.baseHue);
                    }
                    // Ensure color is calculated (assign if missing)
                    if (!card.color) {
                        card.color = calculateCardColor(card.id); // Calculate color on load
                        needsSave = true;
                    }
                    // Track max column index used by cards
                    if (card.columnIndex > maxColIndex) {
                        maxColIndex = card.columnIndex;
                    }
                 });

                // Ensure assignedRootHues matches actual root card hues
                 if (!setsAreEqual(assignedRootHues, existingHues)) {
                    console.warn("Mismatch between assignedRootHues and actual root hues. Rebuilding assigned set.");
                    assignedRootHues = existingHues;
                    needsSave = true; // Save the corrected set
                 }


                // Ensure minimum columns
                if (!Array.isArray(columnOrder) || columnOrder.length === 0) {
                   columnOrder = [0, 1, 2];
                   needsSave = true;
                } else {
                     // Ensure columns up to maxColIndex exist if cards reference them
                     for (let i = 0; i <= maxColIndex; i++) {
                         if (!columnOrder.includes(i)) {
                            // Add missing column indices in order
                             const insertIndex = columnOrder.findIndex(idx => idx > i);
                             if (insertIndex === -1) columnOrder.push(i);
                             else columnOrder.splice(insertIndex, 0, i);
                             console.warn(`Added missing column index ${i} during load.`);
                             needsSave = true;
                         }
                     }
                     // Ensure at least 3 columns exist
                     while(columnOrder.length < 3) {
                         const nextAvailableIndex = (columnOrder.length > 0 ? Math.max(...columnOrder) : -1) + 1;
                         columnOrder.push(nextAvailableIndex);
                         needsSave = true;
                     }
                }

                console.log("Data loaded.");

                 // Ensure consistency: Remove cards referencing non-existent columns or parents
                const validColumnIndices = new Set(columnOrder);
                const validCardIds = new Set(Object.keys(cardData));
                let inconsistencyFound = false;
                for (const cardId in cardData) {
                    const card = cardData[cardId];
                    if (!validColumnIndices.has(card.columnIndex) ||
                        (card.parentId && !validCardIds.has(card.parentId))) {
                        console.warn(`Removing inconsistent card ${cardId} referencing col ${card.columnIndex} or parent ${card.parentId}`);
                        // If it was a root card, release its hue
                        if (!card.parentId && card.baseHue !== undefined) {
                            releaseRootHue(card.baseHue);
                        }
                        delete cardData[cardId];
                        inconsistencyFound = true;
                    }
                }
                 if (inconsistencyFound) needsSave = true;


            } catch (e) {
                console.error("Error parsing data from localStorage:", e);
                // Initialize default if parsing fails
                cardData = {};
                columnOrder = [0, 1, 2];
                assignedRootHues = new Set();
                nextRootHue = 210;
                needsSave = true; // Save the default state
            }
        } else {
            // Initialize default state if no data found
            cardData = {};
            columnOrder = [0, 1, 2];
            assignedRootHues = new Set();
            nextRootHue = 210;
            console.log("No saved data found, initialized default state.");
            needsSave = true; // Save the initial default state
        }

        if (needsSave) {
            console.log("Performing initial save after load/migration.");
            saveData();
        }
    }

    // Helper to compare sets
    function setsAreEqual(setA, setB) {
        if (setA.size !== setB.size) return false;
        for (const item of setA) {
            if (!setB.has(item)) return false;
        }
        return true;
    }


    // --- Card Operations ---

    function createCard(columnIndex, parentId = null, content = 'New Note') {
        // Restriction: Only allow creating root cards (parentId=null) in the first column
        if (parentId === null && columnOrder.indexOf(columnIndex) !== 0) {
            console.warn("Attempted to create root card outside the first column. Operation cancelled.");
            alert("Root cards can only be created in the first column.");
            return null; // Indicate failure
        }

        const id = generateId();
        let baseHue = undefined;

        // Assign a unique hue only if it's a root card
        if (parentId === null) {
            baseHue = assignNewRootHue();
        }

        // Calculate initial order based on siblings (or all cards if root in first col)
         const siblings = parentId
            ? getChildren(parentId).filter(c => c.columnIndex === columnIndex)
            : getCardsInColumn(columnIndex).filter(c => !c.parentId); // Root cards in the first column

        const order = siblings.length > 0 ? Math.max(...siblings.map(c => c.order)) + 1 : 0;

        const newCard = {
            id,
            content,
            parentId,
            columnIndex,
            order,
            baseHue: baseHue, // Store baseHue if it's a root card
            color: '#FFFFFF' // Placeholder, will be calculated next
        };
        cardData[id] = newCard;

        // Calculate color *after* adding to cardData so hierarchy lookup works
        newCard.color = calculateCardColor(id);

        saveData();
        renderColumn(columnIndex); // Re-render the affected column

        // Optional: Scroll new card into view?
        // const newCardElement = findColumnElement(columnIndex)?.querySelector(`.card[data-id="${id}"]`);
        // newCardElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        return newCard;
    }

     function deleteCard(cardId) {
        const cardToDelete = cardData[cardId];
        if (!cardToDelete) return;

        // If deleting a root card, release its hue
        if (!cardToDelete.parentId && cardToDelete.baseHue !== undefined) {
            releaseRootHue(cardToDelete.baseHue);
        }

        const columnsToRerender = new Set();

        // Find all descendant cards recursively and add their columns to the rerender set
        let idsToDelete = [cardId];
        let queue = getChildren(cardId).map(c => c.id);
        while (queue.length > 0) {
            const currentId = queue.shift();
            const currentCard = cardData[currentId];
            if(currentCard) {
                idsToDelete.push(currentId);
                columnsToRerender.add(currentCard.columnIndex);
                // Release hues of any root cards being deleted in the cascade (shouldn't happen with structure)
                // if (!currentCard.parentId && currentCard.baseHue !== undefined) {
                //     releaseRootHue(currentCard.baseHue);
                // }
                queue.push(...getChildren(currentId).map(c => c.id));
            }
        }

         // Add the column of the initially deleted card
         columnsToRerender.add(cardToDelete.columnIndex);

        // Delete the card and all descendants from data
        idsToDelete.forEach(id => {
            delete cardData[id];
        });


        saveData();
        columnsToRerender.forEach(colIndex => {
            // Check if column still exists before rendering
            if (columnOrder.includes(colIndex)) {
                 renderColumn(colIndex);
            }
        });
    }

    function updateCardContent(cardId, newHTMLContent) {
        if (cardData[cardId]) {
            // Store the raw HTML content to preserve formatting like line breaks (<br>, <div>)
            // WARNING: This allows basic HTML. For security in a real app, sanitize this input.
            cardData[cardId].content = newHTMLContent;
            saveData(); // Save immediately on blur
        }
    }

    function getChildren(parentId) {
        return Object.values(cardData).filter(card => card.parentId === parentId);
    }

    // --- Column Operations ---

    function addColumn() {
        // This function is now only callable from the last column's button implicitly
        const nextIndex = columnOrder.length > 0 ? Math.max(...columnOrder) + 1 : 0;
        columnOrder.push(nextIndex);
        saveData();
        renderColumns(); // Re-render all columns to add the new one
    }

    function deleteColumn(columnIndex) {
         // This function is now only callable from the last column's button implicitly
        const indexToRemove = columnOrder.indexOf(columnIndex);
        if (indexToRemove === -1) return; // Column not found

        // Check conditions: > 3 columns and column is empty and is the last column
        const cardsInColumn = getCardsInColumn(columnIndex);
         const isLastColumn = indexToRemove === columnOrder.length - 1;

        if (!isLastColumn) {
             alert("Columns can only be deleted from the right end.");
             return;
         }
        if (columnOrder.length <= 3) {
             alert("Cannot delete column: minimum 3 columns required.");
             return;
         }
        if (cardsInColumn.length > 0) {
            alert("Cannot delete column: column is not empty.");
            return;
        }


        columnOrder.splice(indexToRemove, 1);

        saveData();
        renderColumns(); // Re-render columns
    }

    // --- Rendering ---

    function renderCard(card) {
        const cardElement = document.createElement('div');
        cardElement.classList.add('card');
        cardElement.dataset.id = card.id;
        cardElement.dataset.columnIndex = card.columnIndex;
        cardElement.draggable = false; // Card itself is NOT draggable
        cardElement.style.backgroundColor = card.color || '#FFFFFF'; // Apply calculated color

        const header = document.createElement('div');
        header.draggable = true; // Header IS draggable
        header.classList.add('card-header');

        // Display last 5 chars of ID
        const idPrefix = document.createElement('span');
        idPrefix.classList.add('card-id-prefix');
        idPrefix.textContent = card.id.slice(-5); // Use slice(-5) for last 5 chars
        idPrefix.title = `Card ID: ${card.id}`; // Show full ID on hover
        header.appendChild(idPrefix);


        const controls = document.createElement('div');
        controls.classList.add('controls');

        const addChildBtn = document.createElement('button');
        addChildBtn.textContent = 'Add Child';
        addChildBtn.title = 'Add a child card in the next column';
        addChildBtn.onclick = (e) => {
            e.stopPropagation(); // Prevent triggering drag
            const nextColumnIndex = card.columnIndex + 1;

            // Check if the next column exists *within the tracked order*
            if (columnOrder.includes(nextColumnIndex)) {
                 const newChild = createCard(nextColumnIndex, card.id);
                 if (newChild) {
                    // Optional: Scroll the *parent* card's column to ensure parent is visible
                    // cardElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    // Optional: Scroll the *new child* card into view in the next column
                    const childElement = findColumnElement(nextColumnIndex)?.querySelector(`.card[data-id="${newChild.id}"]`);
                    childElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                 }
            } else {
                alert('Please add a column to the right first using the button on the last column.');
            }
        };

        const deleteCardBtn = document.createElement('button');
        deleteCardBtn.textContent = 'Delete';
        deleteCardBtn.title = 'Delete this card and its children';
        deleteCardBtn.onclick = (e) => {
             e.stopPropagation();
            if (confirm('Are you sure you want to delete this card and all its children?')) {
                deleteCard(card.id);
            }
        };

        controls.appendChild(addChildBtn);
        controls.appendChild(deleteCardBtn);
        header.appendChild(controls);

        const contentArea = document.createElement('div');
        contentArea.classList.add('card-content');
        contentArea.contentEditable = true;
        // Use innerHTML to set initial value to preserve formatting
        contentArea.innerHTML = card.content || ''; // Use innerHTML and handle potential null/undefined
        // On blur, update data with innerHTML to preserve formatting
        contentArea.onblur = () => {
            updateCardContent(card.id, contentArea.innerHTML); // Read innerHTML
        };
        // Focus scrolling behavior
         contentArea.onfocus = () => {
            handleFocusScroll(card.id);
        };


        cardElement.appendChild(header);
        cardElement.appendChild(contentArea);

        // --- Drag and Drop Event Listeners for Cards (attached to header) ---
        header.addEventListener('dragstart', handleDragStart); // Attach to header
        header.addEventListener('dragend', handleDragEnd);   // Attach to header
        // dragover and drop are handled by the container, groups, and other cards

        return cardElement;
    }

    function renderColumn(columnIndex) {
         const columnElement = findColumnElement(columnIndex);
         if (!columnElement) {
             console.error(`Column element for index ${columnIndex} not found during render.`);
             return;
         }
         const cardsContainer = columnElement.querySelector('.cards-container');
         if (!cardsContainer) {
              console.error(`Cards container for column index ${columnIndex} not found.`);
              return;
         }

        // Clear existing cards/groups in this specific column
        cardsContainer.innerHTML = '';

        // Get cards for this column
        const cardsInColumn = getCardsInColumn(columnIndex);

         // --- Grouping Logic ---
         const isFirstColumn = columnOrder.indexOf(columnIndex) === 0;

         if (isFirstColumn) {
             // First column: Render root cards directly, sorted by order
             const rootCards = cardsInColumn.filter(c => !c.parentId).sort((a, b) => a.order - b.order);
             rootCards.forEach(card => {
                 const cardElement = renderCard(card);
                 cardsContainer.appendChild(cardElement);
             });
         } else {
             // Subsequent columns: Group cards by parentId
             const cardsByParent = {};
             cardsInColumn.forEach(card => {
                 const parentId = card.parentId || 'orphaned'; // Group orphans separately if needed
                 if (!cardsByParent[parentId]) {
                     cardsByParent[parentId] = [];
                 }
                 cardsByParent[parentId].push(card);
             });

             // Get parents from the *previous* column to determine group order (optional but logical)
              const prevColIndex = columnOrder[columnOrder.indexOf(columnIndex) - 1];
              const potentialParents = getCardsInColumn(prevColIndex).sort((a, b) => a.order - b.order);
              const parentOrder = potentialParents.map(p => p.id);

              // Render groups based on parent order, then any remaining groups
              const renderedParentIds = new Set();

              // Render groups based on the order of parents in the previous column.
              // Always create a group, even if it has no children yet.
              parentOrder.forEach(parentId => {
                  const childrenForThisParent = cardsByParent[parentId] || []; // Get children or empty array
                  renderGroup(cardsContainer, parentId, childrenForThisParent);
                  renderedParentIds.add(parentId); // Mark this parent's group as rendered
              });

              // Render groups for any cards in this column whose parent is NOT in the previous column
              // (e.g., orphans, or if parent was moved/deleted). This part might be less critical
              // if the structure is enforced, but good for robustness.
              Object.keys(cardsByParent).forEach(parentId => {
                 if (!renderedParentIds.has(parentId)) {
                    // Check if the parent actually exists in cardData before rendering orphan group
                    if (cardData[parentId]) {
                         console.warn(`Rendering group for parent ${parentId} whose parent is not in the immediate previous column.`);
                         renderGroup(cardsContainer, parentId, cardsByParent[parentId]);
                    } else {
                         console.warn(`Skipping render for group with non-existent parent ID: ${parentId}`);
                         // Optionally, handle orphaned cards differently (e.g., display them directly)
                    }
                 }
              });
         }

        // Update toolbar state for this column
        updateColumnToolbarState(columnElement, columnIndex);
    }

     // Helper function to render a group of child cards
     function renderGroup(container, parentId, cards) {
        const groupElement = document.createElement('div');
        groupElement.classList.add('child-group');
        groupElement.dataset.parentId = parentId; // Store parent ID on the group

        // --- Set Group Background Color based on Parent ---
        const parentCard = cardData[parentId];
        if (parentCard && parentCard.color) {
            // Use a slightly modified version of the parent color for the group background
            // Example: slightly desaturate or lighten the parent color
            // For simplicity here, we'll just use the parent color directly for background
            groupElement.style.backgroundColor = parentCard.color;
        } else {
            groupElement.style.backgroundColor = '#f0f0f0'; // Default background if parent not found
        }
        // ---

        // --- Add Group Header with Parent ID Prefix ---
        const groupHeader = document.createElement('div');
        groupHeader.classList.add('group-header');
        const parentIdPrefix = document.createElement('span');
        parentIdPrefix.classList.add('group-parent-id-prefix');
        parentIdPrefix.textContent = `Parent: ${parentId.slice(-5)}`; // Use slice(-5) for last 5 chars
        parentIdPrefix.title = `Parent Card ID: ${parentId}`;
        groupHeader.appendChild(parentIdPrefix);
        groupElement.appendChild(groupHeader); // Add header to the group
        // ---

         // Add drag listeners to the group itself to allow dropping *into* an empty/specific group
         groupElement.addEventListener('dragover', handleDragOver);
         groupElement.addEventListener('dragleave', handleDragLeave);
         // Note: Drop is still handled by the main container listener, but it checks the target

        // Sort cards within the group by their order
        cards.sort((a, b) => a.order - b.order);

        // Render and append cards to the group
        cards.forEach(card => {
            const cardElement = renderCard(card);
            groupElement.appendChild(cardElement);
        });

        // Append the group to the main cards container
        container.appendChild(groupElement);
     }


     function renderColumns() {
        columnsContainer.innerHTML = ''; // Clear all existing columns
        const firstColumnIndex = columnOrder.length > 0 ? columnOrder[0] : -1; // Get the actual first column index

        // Create and append column elements based on columnOrder
        columnOrder.forEach((colIndex, arrayIndex) => { // Use arrayIndex to check position
            const columnElement = document.createElement('div');
            columnElement.classList.add('column');
            columnElement.dataset.columnIndex = colIndex;

            // Create Toolbar
            const toolbar = document.createElement('div');
            toolbar.classList.add('column-toolbar');
            toolbar.innerHTML = `
                <button class="add-card-btn" title="Add new root card to this column">Add Card</button>
                <button class="delete-column-btn" title="Delete this column">Del Col</button>
                <button class="add-column-right-btn" title="Add new column to the right">Add Col Right</button>
            `;
            // Add Card Button Logic (Only works for first column)
            toolbar.querySelector('.add-card-btn').onclick = () => {
                if (colIndex === firstColumnIndex) {
                    createCard(colIndex, null); // Create root card
                } else {
                    alert("New cards in this column must be added as children from the previous column.");
                }
            };
            toolbar.querySelector('.delete-column-btn').onclick = () => deleteColumn(colIndex);
            toolbar.querySelector('.add-column-right-btn').onclick = addColumn;

            // Create Cards Container
            const cardsContainer = document.createElement('div');
            cardsContainer.classList.add('cards-container');

            // Double-click to add card (Only works for first column)
            cardsContainer.ondblclick = (e) => {
                if (e.target === cardsContainer && colIndex === firstColumnIndex) {
                    createCard(colIndex, null); // Create root card
                } else if (e.target === cardsContainer && colIndex !== firstColumnIndex) {
                    alert("New cards here must be children. Use 'Add Child' on a card in the previous column.");
                }
            };

            // --- Drag and Drop Event Listeners for Column Container ---
             // These listeners handle drops *outside* of cards/groups within the column
             cardsContainer.addEventListener('dragover', handleDragOver);
             cardsContainer.addEventListener('dragleave', handleDragLeave);
             cardsContainer.addEventListener('drop', handleDrop);


            columnElement.appendChild(toolbar);
            columnElement.appendChild(cardsContainer);
            columnsContainer.appendChild(columnElement);

             // Initial render of cards for this newly created column structure
            renderColumn(colIndex); // Render cards/groups into the container
        });
        updateToolbarStates(); // Update all toolbars after columns are created
    }

    function getCardsInColumn(columnIndex) {
        return Object.values(cardData).filter(card => card.columnIndex === columnIndex);
    }

    function findColumnElement(columnIndex) {
         return columnsContainer.querySelector(`.column[data-column-index="${columnIndex}"]`);
    }

     function updateToolbarStates() {
        const totalColumns = columnOrder.length;
        const firstColumnIndex = columnOrder.length > 0 ? columnOrder[0] : -1;
        const lastColumnIndex = columnOrder.length > 0 ? columnOrder[columnOrder.length - 1] : -1;

        columnOrder.forEach((colIndex, arrayIndex) => {
            const columnElement = findColumnElement(colIndex);
            if(columnElement) {
                updateColumnToolbarState(columnElement, colIndex, totalColumns, firstColumnIndex, lastColumnIndex);
            }
        });
    }

    function updateColumnToolbarState(columnElement, columnIndex, totalColumns = columnOrder.length, firstColumnIndex = columnOrder[0], lastColumnIndex = columnOrder[columnOrder.length-1]) {
        const addCardBtn = columnElement.querySelector('.add-card-btn');
        const deleteColBtn = columnElement.querySelector('.delete-column-btn');
        const addColRightBtn = columnElement.querySelector('.add-column-right-btn');

         // Add Card Button: Enabled only for the first column
        if (addCardBtn) {
            const isFirst = columnIndex === firstColumnIndex;
            addCardBtn.disabled = !isFirst;
            addCardBtn.title = isFirst ? 'Add new root card to this column' : 'Cannot add root cards here (use Add Child)';
        }

        // Add Column Right Button: Enabled only for the last column
        if (addColRightBtn) {
            const isLast = columnIndex === lastColumnIndex;
            addColRightBtn.disabled = !isLast;
            addColRightBtn.title = isLast ? 'Add new column to the right' : 'Can only add columns from the last column';
        }

         // Delete Column Button: Enabled only for the last column, if > 3 cols exist, and if it's empty
        if (deleteColBtn) {
            const isLast = columnIndex === lastColumnIndex;
            const cardsInCol = getCardsInColumn(columnIndex);
            const canDelete = isLast && totalColumns > 3 && cardsInCol.length === 0;
            deleteColBtn.disabled = !canDelete;
             if (!isLast) {
                deleteColBtn.title = 'Can only delete the last column';
            } else if (totalColumns <= 3) {
                deleteColBtn.title = 'Cannot delete column (minimum 3 columns required)';
            } else if (cardsInCol.length > 0) {
                deleteColBtn.title = 'Cannot delete column (column is not empty)';
            } else {
                deleteColBtn.title = 'Delete this empty column';
            }
        }
     }


    // --- Focus Scrolling Logic ---
    function handleFocusScroll(focusedCardId) {
        const focusedCard = cardData[focusedCardId];
        if (!focusedCard) return;

         // Find the next column in the defined order
         const currentOrderIndex = columnOrder.indexOf(focusedCard.columnIndex);
         if (currentOrderIndex === -1 || currentOrderIndex + 1 >= columnOrder.length) return; // No next column
         const nextColumnIndex = columnOrder[currentOrderIndex + 1];


        // Find children in that specific next column
        const childCards = getChildren(focusedCardId)
                             .filter(c => c.columnIndex === nextColumnIndex)
                             .sort((a, b) => a.order - b.order);

        if (childCards.length > 0) {
            const firstChildId = childCards[0].id;
            const firstChildElement = document.querySelector(`.card[data-id="${firstChildId}"]`);

            if (firstChildElement) {
                 // Scroll the container of the child card's column
                 const childColumnElement = findColumnElement(nextColumnIndex);
                 const childCardsContainer = childColumnElement?.querySelector('.cards-container');
                 if (childCardsContainer) {
                     // Scroll child into view first, then potentially scroll the group if it exists
                     firstChildElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    // Optional: Scroll the group containing the child if needed
                    // const groupElement = firstChildElement.closest('.child-group');
                    // groupElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                 }
            }
        }
    }


    // --- Drag & Drop Handlers ---
    let draggedCardId = null;
    let placeholder = null; // Placeholder element for visual feedback

    function createPlaceholder() {
        const ph = document.createElement('div');
        ph.classList.add('drag-placeholder');
        return ph;
    }

    function handleDragStart(e) {
        // Listener is on the HEADER element.
        const headerElement = e.target; // The header itself
        const cardElement = headerElement.closest('.card'); // Find the parent card

        if (!cardElement) {
             console.error("Drag start failed: could not find parent card element from header.");
             e.preventDefault();
             return;
        }

        // Proceed with drag setup using the card's ID.
        draggedCardId = cardElement.dataset.id;
        e.dataTransfer.setData('text/plain', draggedCardId);
        e.dataTransfer.effectAllowed = 'move';

        setTimeout(() => {
            cardElement.classList.add('dragging');
        }, 0);
         placeholder = createPlaceholder();
         console.log(`Drag Start: ${draggedCardId}`);
    }

    function handleDragEnd(e) {
         // Listener is on the HEADER element.
         const headerElement = e.target;
         const cardElement = headerElement.closest('.card'); // Find the parent card

         if (cardElement) {
            cardElement.classList.remove('dragging'); // Remove class from the card
         } else {
             // Fallback: try finding the card by the stored ID if target somehow got detached
             const potentiallyDetachedCard = document.querySelector(`.card[data-id="${draggedCardId}"]`);
             potentiallyDetachedCard?.classList.remove('dragging');
             console.warn("DragEnd: Could not find card from header target, used ID fallback.");
         }


         // Clear the global draggedCardId *before* removing placeholder
         const endedDragId = draggedCardId; // Store temporarily if needed for logging
         draggedCardId = null; // Clear the ID

        if (placeholder && placeholder.parentNode) {
            placeholder.parentNode.removeChild(placeholder);
        }
        placeholder = null;
        cleanupDragOverIndicators();
        // Note: We clear draggedCardId *again* here, which is redundant but harmless.
        // Consider removing one of the null assignments if desired.
        draggedCardId = null;
         console.log("Drag End");
         // Force toolbar update in case a column became empty
         updateToolbarStates();
    }

    function handleDragOver(e) {
        e.preventDefault(); // Necessary to allow drop

        if (!draggedCardId) return;

         const draggingCard = cardData[draggedCardId];
         if (!draggingCard) return; // Data inconsistency

        const targetColumnElement = e.target.closest('.column');
        if (!targetColumnElement) {
            e.dataTransfer.dropEffect = 'none'; // Not over a column
            return;
        }
        const targetColumnIndex = parseInt(targetColumnElement.dataset.columnIndex);
        const originalColumnIndex = draggingCard.columnIndex;
         const firstColumnIndex = columnOrder[0];

        // --- Drag Restrictions ---
        // 1. Can only move *within* the same column OR *to* the first column.
        if (targetColumnIndex !== originalColumnIndex && targetColumnIndex !== firstColumnIndex) {
             e.dataTransfer.dropEffect = 'none';
             cleanupDragOverIndicators(); // Remove any indicators if moving over invalid col
             if (placeholder && placeholder.parentNode) placeholder.parentNode.removeChild(placeholder); // Remove placeholder
             return; // Disallow drop
        } else {
             e.dataTransfer.dropEffect = 'move'; // Allow drop
        }

        // --- Placeholder Logic ---
        const targetContainer = e.target.closest('.cards-container');
        const targetGroup = e.target.closest('.child-group');
        const targetCardElement = e.target.closest('.card:not(.dragging)'); // Don't target self

        let dropTargetElement = null; // The element placeholder should be inserted before
         let parentDropContainer = null; // Where the placeholder should be inserted (group or main container)

         if (targetGroup) {
            parentDropContainer = targetGroup;
            // Find card within the group to insert before
             if (targetCardElement && targetGroup.contains(targetCardElement)) {
                 dropTargetElement = targetCardElement;
             }
         } else if (targetContainer) {
            parentDropContainer = targetContainer;
            // Find card *directly within* the container (not in a group) or target card itself
             if (targetCardElement && targetContainer.contains(targetCardElement) && !targetCardElement.closest('.child-group')) {
                 dropTargetElement = targetCardElement;
             } else if (targetCardElement && targetContainer.contains(targetCardElement)) {
                  // If over a card inside a group, but target isn't the group itself,
                  // place placeholder relative to the group instead.
                  const groupOfTargetCard = targetCardElement.closest('.child-group');
                  if (groupOfTargetCard) {
                    // Decide whether to place before or after the group based on mouse Y? Simpler: place before.
                     dropTargetElement = groupOfTargetCard;
                     parentDropContainer = targetContainer; // Ensure insertion is in main container
                  }
             }
         }

         // If we found a valid container, manage the placeholder
         if (parentDropContainer) {
             if (dropTargetElement) {
                 parentDropContainer.insertBefore(placeholder, dropTargetElement);
             } else {
                 // Append to end of group or container if no specific element found
                 parentDropContainer.appendChild(placeholder);
             }
         } else {
             // Dragged somewhere invalid within the allowed column (e.g., toolbar)
             if (placeholder && placeholder.parentNode) {
                 placeholder.parentNode.removeChild(placeholder);
             }
         }

        cleanupDragOverIndicators(); // Optional: remove other visual cues if needed
    }

    function handleDragLeave(e) {
       // Minimal dragleave handling - rely on dragover on the new element
       // or dragend/drop for final placeholder cleanup.
        cleanupDragOverIndicators(e.target.closest('.card')); // Example if using card indicators
    }

    function handleDrop(e) {
        e.preventDefault();
        if (!placeholder || !placeholder.parentNode || !draggedCardId) {
            console.log("Drop cancelled: No valid placeholder or dragged card ID.");
            handleDragEnd(e); // Clean up visuals
            return;
        }

        const droppedCard = cardData[draggedCardId];
        if (!droppedCard) {
             console.error("Dropped card data not found!");
             handleDragEnd(e); // Clean up visuals
             return;
        }

        const targetColumnElement = placeholder.closest('.column');
        const targetColumnIndex = parseInt(targetColumnElement.dataset.columnIndex);
        const originalColumnIndex = droppedCard.columnIndex;
        const firstColumnIndex = columnOrder[0];
        const movedColumns = originalColumnIndex !== targetColumnIndex;

         // --- Verify Drop Target Validity (redundant check based on dragOver logic) ---
         if (movedColumns && targetColumnIndex !== firstColumnIndex) {
             console.error("Drop rejected: Cannot drop into this column.");
             handleDragEnd(e); // Clean up visuals
             return;
         }

        // --- Determine New Parent and Container ---
        const targetGroupElement = placeholder.closest('.child-group');
        const targetCardsContainer = placeholder.closest('.cards-container');
        let newParentId = droppedCard.parentId; // Assume parent stays same initially
        let needsColorUpdate = false;

        if (targetColumnIndex === firstColumnIndex) {
            // Moved to the first column: Becomes a root card.
            if (droppedCard.parentId !== null) {
                newParentId = null;
                 // Assign a new base hue if it didn't have one (should always happen unless already root)
                 if (droppedCard.baseHue === undefined) {
                    droppedCard.baseHue = assignNewRootHue();
                 } else {
                     // It was already a root, hue remains. Check if it's still valid?
                     // Safety: Ensure its hue is in the assigned set.
                     assignedRootHues.add(droppedCard.baseHue);
                 }
                 needsColorUpdate = true; // Color and children's colors will change

                // --- Policy: Detach/Delete children when moved TO first column ---
                 const children = getChildren(droppedCard.id);
                 if (children.length > 0) {
                     if (confirm(`Making this card a root card in the first column will delete its ${children.length} child card(s) and descendants. Continue?`)) {
                         let idsToDelete = [];
                         let queue = children.map(c => c.id);
                         const columnsToUpdate = new Set(); // Track columns needing re-render due to deletion

                         while (queue.length > 0) {
                             const currentId = queue.shift();
                             const childCard = cardData[currentId];
                             if (childCard) {
                                 idsToDelete.push(currentId);
                                 columnsToUpdate.add(childCard.columnIndex);
                                 // Recursively find children
                                 queue.push(...getChildren(currentId).map(c => c.id));
                             }
                         }
                         idsToDelete.forEach(id => delete cardData[id]);

                         // Re-render columns where children were deleted (excluding target/original cols handled later)
                         columnsToUpdate.forEach(colIdx => {
                              if (colIdx !== targetColumnIndex && colIdx !== originalColumnIndex && columnOrder.includes(colIdx)) {
                                 renderColumn(colIdx);
                              }
                         });

                     } else {
                         // User cancelled the move due to child deletion warning
                         console.log("Move to first column cancelled by user.");
                         handleDragEnd(e); // Clean up visuals
                         return; // Abort the drop operation
                     }
                 }
            }
        } else if (targetGroupElement) {
            // Dropped inside a child group in the same column
            const groupParentId = targetGroupElement.dataset.parentId;
            if (droppedCard.parentId !== groupParentId) {
                newParentId = groupParentId;
                needsColorUpdate = true; // Hierarchy changed, update colors
                // If it was a root card moved into a group (shouldn't happen with rules), release hue.
                if (droppedCard.parentId === null && droppedCard.baseHue !== undefined) {
                    releaseRootHue(droppedCard.baseHue);
                    delete droppedCard.baseHue;
                 }
            }
        } else if (targetCardsContainer && targetColumnIndex !== firstColumnIndex) {
             // Dropped directly into container (not group) in a non-root column.
             // Policy: Keep existing parent. If it was root, make it orphan? No, keep parent.
             // Essentially, this allows reordering groups or moving cards between groups' vertical space.
             // Check if it was dragged out of a group
             const originalGroup = findColumnElement(originalColumnIndex)?.querySelector(`.child-group[data-parent-id="${droppedCard.parentId}"]`);
             if (!originalGroup || !originalGroup.contains(placeholder.previousElementSibling) && !originalGroup.contains(placeholder.nextElementSibling)) {
                 // It seems to have been dragged outside its original group context
                 // For simplicity, let's maintain its parentId. Reordering happens below.
             }
             // If it was a root card (e.g., moved from col 0 then back), it keeps its parentId (null).
             // We need ensure it doesn't retain a baseHue if not root.
             if (newParentId !== null && droppedCard.baseHue !== undefined) {
                  releaseRootHue(droppedCard.baseHue);
                  delete droppedCard.baseHue;
                  needsColorUpdate = true;
             } else if (newParentId === null && droppedCard.baseHue === undefined) {
                 // Became root but has no hue (should only happen on move to col 0)
                 // This case is handled by the col 0 logic above.
             }
        }


        // --- Update Card Data ---
        droppedCard.columnIndex = targetColumnIndex;
        const oldParentId = droppedCard.parentId;
        droppedCard.parentId = newParentId;


        // --- Update Order ---
         // Determine the container where ordering needs to happen (group or main container)
         const orderingContainer = targetGroupElement || targetCardsContainer;
         const itemsInOrder = Array.from(orderingContainer.children)
                                    .filter(el => el.classList.contains('card') || el.classList.contains('drag-placeholder') || el.classList.contains('child-group')); // Include groups for ordering if in main container

         let currentOrder = 0;
         itemsInOrder.forEach(el => {
             if (el === placeholder) {
                 // This is where the dropped card goes
                 droppedCard.order = currentOrder++;
             } else if (el.classList.contains('card')) {
                 const cardId = el.dataset.id;
                 const card = cardData[cardId];
                  // Only update order if it's a sibling (same parent in the target context)
                 if (card && card.parentId === newParentId) {
                     card.order = currentOrder++;
                 }
             } else if (el.classList.contains('child-group') && !targetGroupElement) {
                  // If ordering in the main container, assign order to child groups as well
                  // Need a way to store group order? Or maybe just order the root cards/groups?
                  // Let's simplify: only re-order cards with the *same parent* as the dropped card.
                  // This means we need to iterate through *all* cards with `newParentId` in this column.

             }
         });
        // --- Refined Order Update ---
         // Get all siblings (cards with the same parent in the target column)
         const siblings = Object.values(cardData).filter(c =>
             c.columnIndex === targetColumnIndex && c.parentId === newParentId
         );

         // Get the DOM elements of these siblings + the placeholder in their final order
         const siblingElements = [];
         const finalContainer = targetGroupElement || targetCardsContainer;
         Array.from(finalContainer.children).forEach(el => {
             if (el === placeholder) {
                 siblingElements.push({ id: droppedCard.id, element: el }); // Represent placeholder by dropped card ID
             } else if (el.classList.contains('card')) {
                 const cardId = el.dataset.id;
                 if (siblings.some(s => s.id === cardId)) {
                      siblingElements.push({ id: cardId, element: el });
                 }
             }
             // If we are in the root container, we might encounter child-group elements
             // We need to handle order relative to them if parentId is null
              else if (el.classList.contains('child-group') && newParentId === null && targetColumnIndex === firstColumnIndex) {
                    // How to order cards relative to groups? Treat groups like items?
                    // Simplification: For now, ignore groups when calculating order - only order cards relative to other cards with same parent.
              }
         });

          // Assign new order based on DOM position within the sibling group
         siblingElements.forEach((item, index) => {
             const card = cardData[item.id];
             if (card) {
                 card.order = index;
             }
         });


        // Update colors if hierarchy or root status changed
        if (needsColorUpdate) {
             updateColorRecursively(droppedCard.id); // Update self and any potential children (if move didn't delete them)
        } else {
             // Ensure own color is up-to-date even if hierarchy didn't change
             // (e.g., parent color might have changed previously)
             droppedCard.color = calculateCardColor(droppedCard.id);
        }

        saveData();

        // --- Re-render ---
        const columnsToUpdate = new Set();
        columnsToUpdate.add(targetColumnIndex); // Always update the target column

        if (movedColumns && originalColumnIndex !== targetColumnIndex && columnOrder.includes(originalColumnIndex)) {
            columnsToUpdate.add(originalColumnIndex); // Update original if different and exists
        } else if (oldParentId !== newParentId && !movedColumns && columnOrder.includes(originalColumnIndex)) {
             // If parent changed but column didn't, still might need to re-render original column
             // if card was moved out of a group that needs updating.
             columnsToUpdate.add(originalColumnIndex);
        }

        // --- Refresh All Subsequent Columns if Parent Order Potentially Changed ---
        // If a drop happened in a column, the order of cards within that column might
        // have changed. This affects the group order in the next column, which in turn
        // affects the group order in the column after that, and so on.
        // Therefore, we need to re-render *all* columns subsequent to the target column.
        const targetOrderIndex = columnOrder.indexOf(targetColumnIndex);
        if (targetOrderIndex !== -1) {
            for (let i = targetOrderIndex + 1; i < columnOrder.length; i++) {
                const subsequentColIndex = columnOrder[i];
                if (!columnsToUpdate.has(subsequentColIndex)) { // Avoid adding if already present
                    columnsToUpdate.add(subsequentColIndex);
                    console.log(`Parent order potentially changed in Col ${columnOrder[i-1]}, triggering re-render of child groups in Col ${subsequentColIndex}`);
                }
            }
        }
        // ---

        // Perform re-rendering
        columnsToUpdate.forEach(colIdx => {
            if (columnOrder.includes(colIdx)) { // Ensure column still exists
                renderColumn(colIdx);
            }
        });


        // Final cleanup handled by dragend
         console.log(`Drop: ${droppedCardId} into Col ${targetColumnIndex}, Parent: ${newParentId}`);
    }

     function cleanupDragOverIndicators(exceptElement = null) {
        // Placeholder handles visual indication, so this might not be needed
        // unless adding extra CSS classes for hover states.
     }

    // --- Initialization ---
    function init() {
        loadData(); // Load, migrate, clean up data
        renderColumns(); // Render UI based on final data state
    }

    init(); // Start the application
});
