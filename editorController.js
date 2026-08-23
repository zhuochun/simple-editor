import * as data from './projectState.js';
import { initializeDragDrop } from './dragDrop.js';
import { aiService } from './aiService.js';
import { handleCardTextareaKeydown } from './cardShortcuts.js'; // Import the handler
import { createProjectTransfer } from './projectTransfer.js';
import { createEditorDom } from './editorDom.js';

function initializeEditorApp() {
    // --- DOM Elements ---
    const sidebar = document.getElementById('sidebar');
    const resizer = document.getElementById('resizer');
    const mainContent = document.getElementById('main-content');
    const columnsContainer = document.getElementById('columnsContainer');
    const addProjectBtn = document.getElementById('add-project-btn');
    const importProjectBtn = document.getElementById('import-project-btn'); // Added
    const projectListContainer = document.getElementById('project-list');

    // AI Settings Elements (Passed to aiService)
    const aiSettingsTitle = document.getElementById('ai-settings-title');
    const aiProviderUrlInput = document.getElementById('ai-provider-url');
    const aiModelNameInput = document.getElementById('ai-model-name');
    const aiApiKeyInput = document.getElementById('ai-api-key');
    const aiTemperatureInput = document.getElementById('ai-temperature');

    // --- Constants --- (UI/Rendering related)
    const GROUP_HEADER_PREVIEW_LENGTH = 60; // Max chars for content preview in group header
    const CARD_NAME_MAX_LENGTH = 50;
    const AI_PLACEHOLDER_TEXT = "AI is thinking..."; // Keep UI constant here
    const AI_RESPONSE_SEPARATOR = '---'; // Keep UI constant here
    const SIDEBAR_COLLAPSED_KEY = 'sidebarCollapsed';
    const STORAGE_KEY_ONBOARDING = 'onboardingComplete';
    const DEFAULT_ONBOARDING_PROJECT_URL = 'examples/new-onboarding.json'; // Relative path if served

    // --- State ---
    let isAiActionInProgress = false; // Flag to prevent concurrent conflicting actions
    const projectTransfer = createProjectTransfer({
        projectState: data,
        onProjectImported: handleSwitchProject
    });
    const {
        autoResizeTextarea,
        clearHighlights,
        createModal,
        focusCardTextarea,
        getCardElement,
        getColumnElementByIndex,
        getColumnIndex,
        getGroupElement,
        highlightHierarchy,
        scrollHierarchy,
        scrollIntoViewIfNeeded,
        updateGroupHeaderDisplay
    } = createEditorDom({
        projectState: data,
        columnsContainer,
        cardNameMaxLength: CARD_NAME_MAX_LENGTH,
        groupHeaderPreviewLength: GROUP_HEADER_PREVIEW_LENGTH
    });

     // --- Action Locking Helpers ---

     function disableConflictingActions() {
        console.log("Disabling conflicting actions...");
        isAiActionInProgress = true;
        document.body.classList.add('ai-busy'); // Add class for potential global styling/cursor changes

        // Disable buttons that modify structure/content significantly
        columnsContainer.querySelectorAll('.add-card-btn, .delete-card-btn, .add-child-btn, .add-column-btn, .delete-column-btn').forEach(btn => {
            btn.disabled = true;
            btn.classList.add('disabled-by-ai'); // Add a specific class for targeted re-enabling
        });

        // Disable drag handles (card headers)
        columnsContainer.querySelectorAll('.card-header').forEach(header => {
            header.draggable = false;
            header.classList.add('disabled-by-ai');
        });
         // Disable project deletion/switching
         projectListContainer.querySelectorAll('.delete-project-btn, .project-item').forEach(el => {
             if (el.classList.contains('project-item')) {
                 el.style.pointerEvents = 'none'; // Prevent switching
             } else {
                 el.disabled = true;
             }
             el.classList.add('disabled-by-ai');
         });
         addProjectBtn.disabled = true;
         addProjectBtn.classList.add('disabled-by-ai');
    }

    function enableConflictingActions() {
        console.log("Enabling conflicting actions...");
        isAiActionInProgress = false;
        document.body.classList.remove('ai-busy');

        // Re-enable specifically disabled elements
        document.querySelectorAll('.disabled-by-ai').forEach(el => {
            if (el.tagName === 'BUTTON') {
                // Re-enable button, but respect original disabled state for delete column
                if (!(el.classList.contains('delete-column-btn') && el.classList.contains('hidden'))) {
                     el.disabled = false;
                }
            } else if (el.classList.contains('card-header')) {
                el.draggable = true;
            } else if (el.classList.contains('project-item')) {
                 el.style.pointerEvents = ''; // Restore switching
            }
            el.classList.remove('disabled-by-ai');
        });

        // Explicitly re-check delete column button state
        updateAllToolbarButtons();
    }


    // --- Rendering Functions ---

    function createCardElement(cardData) {
        const cardEl = document.createElement('div');
        cardEl.id = `card-${cardData.id}`;
        cardEl.className = 'card';
        cardEl.dataset.cardId = cardData.id;

        // Color should be pre-calculated by the project-state owner.
        cardEl.style.backgroundColor = cardData.color || data.getColorForCard(cardData); // Fallback just in case

        const displayName = cardData.name ? cardData.name : `#${cardData.id.slice(-4)}`;
        const truncatedDisplayName = displayName.length > CARD_NAME_MAX_LENGTH ? displayName.substring(0, CARD_NAME_MAX_LENGTH) + '...' : displayName;
        const aiReady = aiService.areAiSettingsValid();

        cardEl.innerHTML = `
            <div class="card-header" draggable="true">
                <span class="card-name-display" title="${displayName}">${truncatedDisplayName}</span>
                <div class="card-ai-actions ai-feature">
                     <button class="ai-continue-btn" title="Continue as next sibling" ${!aiReady ? 'disabled' : ''}>⬇️</button>
                      <button class="ai-expand-btn" title="Elaborate as child" ${!aiReady ? 'disabled' : ''}>↕️</button>
                      <button class="ai-summarize-btn" title="Create summary after card" ${!aiReady ? 'disabled' : ''}>⏪</button>
                      <button class="ai-breakdown-btn" title="Brainstorm as children" ${!aiReady ? 'disabled' : ''}>🧠</button>
                      <button class="ai-custom-btn" title="Custom response as children" ${!aiReady ? 'disabled' : ''}>✨</button>
                 </div>
                 <div class="card-actions">
                     <button class="add-child-btn" title="Add Child Card (to next column)">➕</button>
                    <button class="delete-card-btn" title="Delete Card">🗑️</button>
                </div>
            </div>
            <textarea class="card-content" placeholder="Enter text...">${cardData.content || ''}</textarea>
        `;

        // --- Add Event Listeners ---
        // Note: Drag listeners are handled by initializeDragDrop via delegation

        const textarea = cardEl.querySelector('.card-content');
        const nameDisplaySpan = cardEl.querySelector('.card-name-display');

        nameDisplaySpan.addEventListener('dblclick', () => makeCardNameEditable(cardData.id, cardEl));

        textarea.addEventListener('blur', handleTextareaBlur);
        textarea.addEventListener('focus', handleTextareaFocus);
        textarea.addEventListener('input', autoResizeTextarea);
        requestAnimationFrame(() => autoResizeTextarea({ target: textarea })); // Initial resize

        // Standard Actions
        cardEl.querySelector('.add-child-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            handleAddChildCard(cardData.id); // Use specific handler
        });
        cardEl.querySelector('.delete-card-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            handleDeleteCard(cardData.id); // Use specific handler
        });

        // AI Actions
        cardEl.querySelector('.ai-continue-btn').addEventListener('click', (e) => { e.stopPropagation(); handleAiContinue(cardData.id); });
        cardEl.querySelector('.ai-breakdown-btn').addEventListener('click', (e) => { e.stopPropagation(); handleAiBreakdown(cardData.id); });
        cardEl.querySelector('.ai-expand-btn').addEventListener('click', (e) => { e.stopPropagation(); handleAiExpand(cardData.id); });
        cardEl.querySelector('.ai-summarize-btn').addEventListener('click', (e) => { e.stopPropagation(); handleAiSummarize(cardData.id); });
        cardEl.querySelector('.ai-custom-btn').addEventListener('click', (e) => { e.stopPropagation(); handleAiCustom(cardData.id); });

        return cardEl;
    }

    function createGroupElement(parentId) {
        const parentCardData = data.getCard(parentId);
        if (!parentCardData) return null;

        const groupEl = document.createElement('div');
        let groupHeaderText = '';
        let groupHeaderTitle = '';

        if (parentCardData.name) {
            const truncatedParentName = parentCardData.name.length > CARD_NAME_MAX_LENGTH ? parentCardData.name.substring(0, CARD_NAME_MAX_LENGTH) + '...' : parentCardData.name;
            groupHeaderText = `>> ${truncatedParentName}`;
            groupHeaderTitle = `Children of ${parentCardData.name}`;
         } else {
             const idPart = `#${parentId.slice(-4)}`;
             const contentPreview = parentCardData.content?.trim().substring(0, GROUP_HEADER_PREVIEW_LENGTH) || '';
             const ellipsis = (parentCardData.content?.trim().length || 0) > GROUP_HEADER_PREVIEW_LENGTH ? '...' : '';
             const previewText = contentPreview ? `: ${contentPreview}${ellipsis}` : '';
             groupHeaderText = `>> ${idPart}${previewText}`;
             groupHeaderTitle = `Children of ${idPart}${contentPreview ? `: ${parentCardData.content?.trim()}` : ''}`;
        }

        groupEl.id = `group-${parentId}`;
        groupEl.className = 'card-group';
        groupEl.dataset.parentId = parentId;
        groupEl.innerHTML = `<div class="group-header" title="${groupHeaderTitle}">${groupHeaderText}</div>`;

        // Add double-click listener to create a child card in this group
        groupEl.addEventListener('dblclick', (e) => {
            // Ignore dblclick if it's inside the textarea or any part of a card within the group
            if (e.target.closest('textarea.card-content') || e.target.closest('.card')) {
                return;
            }
            e.stopPropagation();
            const parentId = groupEl.dataset.parentId;
            const columnEl = groupEl.closest('.column');
            if (parentId && columnEl) {
                const columnIndex = parseInt(columnEl.dataset.columnIndex, 10);
                if (!isNaN(columnIndex)) {
                    handleAddCard(columnIndex, parentId); // Add child card
                }
            }
        });
        // Note: Drag listeners handled by delegation

        return groupEl;
    }

    function createColumnElement(columnIndex) {
        const columnEl = document.createElement('div');
        columnEl.className = 'column';
        columnEl.dataset.columnIndex = columnIndex;
        const aiReady = aiService.areAiSettingsValid();
        const columnData = data.getColumnData(columnIndex); // Use data helper
        const promptIndicator = columnData?.prompt ? '📝' : '';
        const globalPromptIndicator = data.getGlobalPromptData() ? '📝' : '';
        const globalPromptButton = columnIndex === 0 ?
            `<button class="global-prompt-btn ai-feature" title="Set Global Prompt" ${!aiReady ? 'disabled' : ''}>Global Prompt ${globalPromptIndicator}</button>`
            : '';

        columnEl.innerHTML = `
            <div class="column-toolbar">
                 <div class="toolbar-left">
                     <button class="add-card-btn">Add Card</button>
                     ${globalPromptButton}
                     <button class="add-prompt-btn ai-feature" title="Set Column Prompt" ${!aiReady ? 'disabled' : ''}>Prompt ${promptIndicator}</button>
                 </div>
                 <div class="toolbar-right">
                     <button class="add-column-btn">Add Column</button>
                     <button class="delete-column-btn">Delete Column</button>
                 </div>
            </div>
            <div class="cards-container"></div>
        `;

        const cardsContainer = columnEl.querySelector('.cards-container');

        // Add Listeners
        columnEl.querySelector('.add-card-btn').addEventListener('click', () => handleAddCard(columnIndex, null)); // Add root card
        columnEl.querySelector('.add-column-btn').addEventListener('click', handleAddColumn);
        columnEl.querySelector('.delete-column-btn').addEventListener('click', () => handleDeleteColumn(columnIndex));
        columnEl.querySelector('.add-prompt-btn').addEventListener('click', () => handleSetColumnPrompt(columnIndex));
        if (columnIndex === 0) {
            const gpBtn = columnEl.querySelector('.global-prompt-btn');
            if (gpBtn) gpBtn.addEventListener('click', handleSetGlobalPrompt);
        }

        // Double-click on empty space in first column adds root card
        cardsContainer.addEventListener('dblclick', (e) => {
             // Ignore dblclick if it's inside the textarea
             if (e.target.closest('textarea.card-content')) {
                 return;
             }
             if (e.target === cardsContainer && columnIndex === 0) {
                 handleAddCard(columnIndex, null);
             }
        });
        // Note: Drag listeners handled by delegation

        return columnEl;
    }

    /**
     * Renders the content (cards or groups) within a specific column element.
     * Clears existing content and rebuilds based on the current project data.
     * @param {HTMLElement} columnEl - The DOM element of the column to render into.
     * @param {number} columnIndex - The index of the column being rendered.
     */
    function renderColumnContent(columnEl, columnIndex) {
        const cardsContainer = columnEl.querySelector('.cards-container');
        if (!cardsContainer) {
            console.error(`Cards container not found in column element for index ${columnIndex}`);
            return;
        }
        cardsContainer.innerHTML = ''; // Clear previous content before rendering new content

        if (columnIndex === 0) {
            // --- Render Root Cards (Column 0) ---
            // Column 0 only contains root cards (cards with no parentId).
            const rootCards = data.getColumnCards(0).filter(c => !c.parentId);
            // Cards are assumed to be sorted by 'order' by the data.getColumnCards function.
            rootCards.forEach(cardData => {
                const cardEl = createCardElement(cardData); // Create the card DOM element
                cardsContainer.appendChild(cardEl); // Add it to the container
            });
        } else {
            // --- Render Groups and Child Cards (Columns > 0) ---
            // Columns after the first display cards grouped by their parent from the *previous* column.
            // Get all cards from the previous column; these are the potential parents for groups in this column.
            const parentCards = data.getColumnCards(columnIndex - 1); // Sorted by order

            parentCards.forEach(parentCardData => {
                // Create a group header element for *each* potential parent card from the previous column.
                // This ensures a group container exists even if it currently has no children in this column.
                const groupEl = createGroupElement(parentCardData.id);
                if (!groupEl) {
                    // This might happen if the parent card data is inconsistent or removed unexpectedly.
                    console.warn(`Failed to create group element for parent ${parentCardData.id} in column ${columnIndex}`);
                    return; // Skip rendering this group if creation failed
                }

                // Get the children of this specific parent *that belong in the current column*.
                const childCards = data.getChildCards(parentCardData.id, columnIndex); // Sorted by order

                // If this parent has children in the current column, create and append their card elements.
                if (childCards.length > 0) {
                    childCards.forEach(childCardData => {
                        const cardEl = createCardElement(childCardData); // Create child card element
                        groupEl.appendChild(cardEl); // Append card *inside* the group element
                    });
                }
                // If childCards.length is 0, the group element remains empty, acting as a visual container.

                // Append the complete group element (header + any child cards) to the column's container.
                cardsContainer.appendChild(groupEl);
            });
        }

        // After rendering content, update the state of toolbar buttons for this specific column.
        updateToolbarButtons(columnEl, columnIndex);
    }

    /**
     * Renders the entire application structure (all columns and their content).
     * Clears the main columns container and rebuilds it based on the active project's data.
     */
    function renderApp() {
        // Clear the main container holding all columns.
        columnsContainer.innerHTML = '';
        const projectData = data.getActiveProjectData(); // Get data for the currently active project

        // Handle cases where no project is active or data is missing/corrupted.
        if (!projectData) {
            columnsContainer.innerHTML = '<p style="padding: 20px; text-align: center;">Error: No project selected or data corrupted.</p>';
            console.error("renderApp called with no active project data.");
            return;
        }

        // Determine how many columns need to be rendered in the DOM.
        // This is the maximum of the minimum required columns (data.MIN_COLUMNS)
        // and the actual number of columns defined in the project data.
        const columnsToRenderCount = Math.max(data.MIN_COLUMNS, projectData.columns.length);

        // Loop through the required number of columns.
        for (let i = 0; i < columnsToRenderCount; i++) {
             // Create the basic structure (toolbar, container) for each column.
             const columnEl = createColumnElement(i);
             columnsContainer.appendChild(columnEl); // Add the column structure to the main container.

             // Check if data actually exists for this column index in the project data.
             if (i < projectData.columns.length) {
                 // If data exists, render the cards/groups within this column.
                 renderColumnContent(columnEl, i);
             } else {
                 // If rendering a column beyond what's in the data (due to MIN_COLUMNS),
                 // it will be an empty column structure. Just update its toolbar buttons.
                 // This scenario should be less common if addColumnData ensures data exists.
                 updateToolbarButtons(columnEl, i);
             }
        }

        // After all columns are created and potentially rendered, update all toolbar buttons
        // across all columns to ensure correct states (e.g., enable/disable delete/add column).
        updateAllToolbarButtons();
        console.log(`App rendered for project: ${data.getProject(data.getActiveProjectId())?.title}`);
    }

    function updateToolbarButtons(columnEl, columnIndex) {
        const addCardBtn = columnEl.querySelector('.add-card-btn');
        const addColBtn = columnEl.querySelector('.add-column-btn');
        const delColBtn = columnEl.querySelector('.delete-column-btn');
        const addPromptBtn = columnEl.querySelector('.add-prompt-btn');
        const globalPromptBtn = columnEl.querySelector('.global-prompt-btn');

        const projectData = data.getActiveProjectData();
        if (!projectData) return; // Should not happen if renderApp checks

        const numColumnsInData = projectData.columns.length;
        const isRightmost = columnIndex === numColumnsInData - 1;

        addCardBtn.classList.toggle('hidden', columnIndex !== 0); // Only show on first column
        addColBtn.classList.toggle('hidden', !isRightmost); // Only show on last column

        const columnCards = data.getColumnCards(columnIndex); // Use data helper
        const canDelete = isRightmost && numColumnsInData > data.MIN_COLUMNS && columnCards.length === 0;
        delColBtn.classList.toggle('hidden', !canDelete);
        delColBtn.disabled = !canDelete;

        if (addPromptBtn) {
            const columnData = data.getColumnData(columnIndex); // Use data helper
            const promptIndicator = columnData?.prompt ? '📝' : '';
            addPromptBtn.textContent = `Prompt ${promptIndicator}`;
            addPromptBtn.disabled = !aiService.areAiSettingsValid();
        }
        if (globalPromptBtn && columnIndex === 0) {
            const globalPromptIndicator = data.getGlobalPromptData() ? '📝' : '';
            globalPromptBtn.textContent = `Global Prompt ${globalPromptIndicator}`;
            globalPromptBtn.disabled = !aiService.areAiSettingsValid();
        }
    }

    function updateAllToolbarButtons() {
        Array.from(columnsContainer.children).forEach((col, idx) => {
            updateToolbarButtons(col, idx);
        });
    }

    // --- Project Sidebar Rendering & Interactions ---

    function renderProjectList() {
        projectListContainer.innerHTML = '';
        const sortedProjects = data.getProjects().sort((a, b) => b.lastModified - a.lastModified);

        sortedProjects.forEach(project => {
            const item = document.createElement('div');
            item.className = 'project-item';
            item.dataset.projectId = project.id;
            if (project.id === data.getActiveProjectId()) {
                item.classList.add('active');
            }

            item.innerHTML = `
                <span class="project-title" title="${project.title}">${project.title}</span>
                <div class="project-actions">
                    <button class="export-project-btn" title="Export Project">📤</button>
                    <button class="delete-project-btn" title="Delete Project">🗑️</button>
                </div>
            `;

            item.addEventListener('click', (e) => {
                if (!e.target.closest('button') && !e.target.closest('.project-title-input')) {
                    handleSwitchProject(project.id); // Use handler
                }
            });

            const titleSpan = item.querySelector('.project-title');
            titleSpan.addEventListener('dblclick', () => makeProjectTitleEditable(project.id, item));

            item.querySelector('.export-project-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                projectTransfer.handleExportProject(project.id, e);
            });
            item.querySelector('.delete-project-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                handleDeleteProject(project.id); // Use handler
            });

            projectListContainer.appendChild(item);
        });
    }

     function makeProjectTitleEditable(projectId, projectItemElement) {
        const titleSpan = projectItemElement.querySelector('.project-title');
        const currentTitle = data.getProject(projectId).title;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentTitle;
        input.className = 'project-title-input';

        titleSpan.replaceWith(input);
        input.focus();
        input.select();

        const finishEditing = (saveChanges) => {
            const newTitle = input.value.trim();
            let updated = false;
            if (saveChanges && newTitle && newTitle !== currentTitle) {
                // Call data function to update title and lastModified
                if (data.updateProjectTitle(projectId, newTitle)) {
                    titleSpan.textContent = newTitle;
                    titleSpan.title = newTitle;
                    updated = true;
                }
            }
            if (!updated) {
                // Restore original if cancelled, empty, or no change
                titleSpan.textContent = currentTitle;
            }
            input.replaceWith(titleSpan);
            // Re-render list only if title changed (might affect sorting later)
            // if (updated) renderProjectList(); // Avoid re-render for now unless order changes
        };

        input.addEventListener('blur', () => finishEditing(true));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); finishEditing(true); }
            else if (e.key === 'Escape') { e.preventDefault(); finishEditing(false); }
        });
    }

    // --- Action Handlers (Orchestration) ---

    function handleAddProject() {
        const title = prompt("Enter a title for the new project:", "New Project");
        if (title === null) return;

        const newProject = data.addProjectData(title); // Use data function
        handleSwitchProject(newProject.id); // Switch to the new project
        // renderProjectList() will be called by handleSwitchProject's renderApp
    }

    function handleDeleteProject(projectIdToDelete) {
        const projectTitle = data.getProject(projectIdToDelete)?.title;
        if (!projectTitle) return;

        if (!confirm(`Are you sure you want to delete the project "${projectTitle}" and all its content? This cannot be undone.`)) {
            return;
        }

        const originalActiveId = data.getActiveProjectId(); // Store the ID *before* deletion
        const deleteResult = data.deleteProjectData(projectIdToDelete); // Use data function

        if (deleteResult.deleted) {

            // Check if the *original* active project was the one deleted
            if (originalActiveId === projectIdToDelete) {
                 // Active project *was* deleted, load the new one
                 console.log(`Active project ${projectIdToDelete} deleted. Rendering new active project: ${data.getActiveProjectId()}`);
                 renderApp(); // Render the new active project
                 renderProjectList(); // Update sidebar highlighting and active state
            } else {
                 // Active project didn't change, just update list
                 console.log(`Non-active project ${projectIdToDelete} deleted. Updating project list.`);
                 renderProjectList();
            }
        }
    }

    function handleSwitchProject(newProjectId) {
        if (data.switchActiveProject(newProjectId)) { // Use data function
            renderApp(); // Render the new project
            renderProjectList(); // Update sidebar highlighting
            const activeProject = data.getProject(data.getActiveProjectId());
            console.log(`Switched to project: ${activeProject.title} (${activeProject.id})`);
        }
    }

    // --- Card and Column Actions ---

    function handleAddCard(columnIndex, parentId = null, initialContent = '', insertBeforeCardId = null) {
        const newCardData = data.addCardData(columnIndex, parentId, initialContent, insertBeforeCardId); // Use data function

        if (newCardData) {
            // --- DOM Update ---
            const newCardEl = createCardElement(newCardData);
            let targetContainer;
            let insertBeforeEl = null;

            if (parentId) {
                targetContainer = getGroupElement(parentId);
                if (!targetContainer) { // Group might not exist yet
                    const parentCardData = data.getCard(parentId);
                    if(parentCardData) {
                        const parentColEl = getColumnElementByIndex(parentCardData.columnIndex);
                        if (parentColEl) renderColumnContent(parentColEl, parentCardData.columnIndex); // Re-render parent column to create group
                        targetContainer = getGroupElement(parentId); // Try getting group again
                    }
                }
            } else {
                const columnEl = getColumnElementByIndex(columnIndex);
                if (columnEl) targetContainer = columnEl.querySelector('.cards-container');
            }

            if (targetContainer) {
                if (insertBeforeCardId) {
                     insertBeforeEl = getCardElement(insertBeforeCardId);
                     // Adjust targetContainer if insertBeforeEl is in a different group (shouldn't happen with correct logic)
                     if(insertBeforeEl && parentId && !targetContainer.contains(insertBeforeEl)) {
                          targetContainer = insertBeforeEl.closest('.card-group') || targetContainer;
                     }
                }

                if (insertBeforeEl && targetContainer.contains(insertBeforeEl)) {
                     targetContainer.insertBefore(newCardEl, insertBeforeEl);
                } else {
                     // Append, respecting order within the container
                     const siblingsInDOM = Array.from(targetContainer.querySelectorAll(`:scope > .card[data-card-id]`));
                     let inserted = false;
                     for(const siblingEl of siblingsInDOM) {
                         const siblingCard = data.getCard(siblingEl.dataset.cardId);
                         if(siblingCard && newCardData.order < siblingCard.order) {
                             targetContainer.insertBefore(newCardEl, siblingEl);
                             inserted = true;
                             break;
                         }
                     }
                     if(!inserted) targetContainer.appendChild(newCardEl);
                }

                // Re-render next column if a group might need to be created/updated for the new card
                 const nextColumnEl = getColumnElementByIndex(columnIndex + 1);
                 if (nextColumnEl) renderColumnContent(nextColumnEl, columnIndex + 1);

                 // Re-render column 0 if root colors were updated
                 if (columnIndex === 0 && !parentId) {
                      const col0El = getColumnElementByIndex(0);
                      if (col0El) renderColumnContent(col0El, 0);
                 }

            } else {
                 console.error("Target container not found for new card. Re-rendering app.");
                 renderApp(); // Fallback
            }


            requestAnimationFrame(() => {
                const textarea = newCardEl.querySelector('.card-content');
                if (textarea && initialContent.includes(AI_PLACEHOLDER_TEXT)) {
                    textarea.classList.add('ai-loading');
                }
                // Call the dedicated focus function instead
                if (newCardEl && textarea && !initialContent.includes(AI_PLACEHOLDER_TEXT)) {
                    focusCardTextarea(newCardData.id, 'start'); // Use dedicated function, focus at start
                } else if (newCardEl) {
                    // Still scroll even if not focusing (e.g., AI placeholder)
                    scrollIntoViewIfNeeded(newCardEl);
                }
            });
            return newCardData.id; // Return ID
        }
        return null; // Return null if card creation failed
    }

    function handleAddChildCard(parentId) {
        const parentCardData = data.getCard(parentId);
        if (parentCardData) {
            handleAddCard(parentCardData.columnIndex + 1, parentId);
        }
    }

    function handleDeleteCard(cardId) {
        const card = data.getCard(cardId);
        if (!card) return;

        const descendantIds = data.getDescendantIds(cardId);
        const projectData = data.getActiveProjectData(); // Need this for content check
        const numDescendantsWithContent = descendantIds.filter(id => projectData.cards[id]?.content?.trim()).length;
        const hasContent = card.content?.trim() !== '';
        const shouldConfirm = numDescendantsWithContent > 0 || (hasContent && descendantIds.length > 0);
        const confirmMessage = `Delete card #${cardId.slice(-4)} ${hasContent ? 'with content ' : ''}and its ${descendantIds.length} descendant(s) (${numDescendantsWithContent} with content) from project "${data.getProject(data.getActiveProjectId()).title}"?`;

        if (isAiActionInProgress) {
            alert("Please wait for the current AI action to complete before deleting cards.");
            return;
        }

        if (shouldConfirm && !confirm(confirmMessage)) {
            return;
        }

        // --- Determine card to scroll to *before* deletion ---
        let targetIdToScroll = null;
        let originalParentId = card.parentId; // Use initial 'card' object
        const siblings = data.getSiblingCards(cardId);
        const deletedIndex = siblings.findIndex(c => c.id === cardId);
        let adjacentSiblingId = null;
        if (deletedIndex !== -1) {
            const nextSibling = siblings[deletedIndex + 1];
            const prevSibling = siblings[deletedIndex - 1];
            adjacentSiblingId = nextSibling ? nextSibling.id : (prevSibling ? prevSibling.id : null);
        }
        targetIdToScroll = adjacentSiblingId || originalParentId; // Prioritize sibling, fallback to parent
        // --- End scroll target determination ---

        const originalColumnIndex = card.columnIndex; // Use initial 'card' object
        const deleteResult = data.deleteCardData(cardId); // Use data function

        if (deleteResult.deletedIds.length > 0) {
            // Remove card elements from DOM
            deleteResult.deletedIds.forEach(id => {
                getCardElement(id)?.remove();
                getGroupElement(id)?.remove(); // Remove associated group header if it was a parent
            });

            // Remove empty group container if the deleted card was the last child
            if (originalParentId) {
                const remainingChildren = data.getChildCards(originalParentId, originalColumnIndex);
                if (remainingChildren.length === 0) {
                    getGroupElement(originalParentId)?.remove();
                }
            }

            // Re-render affected columns
            const validColumnsToRender = Array.from(deleteResult.affectedColumns)
                .filter(idx => idx >= 0 && idx < (data.getActiveProjectData()?.columns.length || 0))
                .sort((a, b) => a - b);

            validColumnsToRender.forEach(colIndex => {
                const colEl = getColumnElementByIndex(colIndex);
                if (colEl) renderColumnContent(colEl, colIndex);
            });

            updateAllToolbarButtons();
            console.log(`Card ${cardId} and descendants deleted.`);

            // --- Scroll to adjacent card or parent using scrollHierarchy ---
            if (targetIdToScroll) {
                // Use existing scrollHierarchy to handle scrolling logic
                scrollHierarchy(targetIdToScroll);
                console.log(`Scrolled hierarchy based on target: ${targetIdToScroll}`);
            }
            // --- End scroll logic ---
        }
    }

    function handleAddColumn() {
         if (isAiActionInProgress) {
             alert("Please wait for the current AI action to complete before adding columns.");
             return;
         }
         const newIndex = data.addColumnData(false); // Add data first, don't save yet
         if (newIndex === -1) return;

         const columnEl = createColumnElement(newIndex);
         columnsContainer.appendChild(columnEl);
         renderColumnContent(columnEl, newIndex); // Should be empty
         updateAllToolbarButtons();
         columnsContainer.scrollLeft = columnsContainer.scrollWidth;

         console.log(`Column ${newIndex} added visually.`);
    }

    function handleDeleteColumn(columnIndex) {
        if (isAiActionInProgress) {
            alert("Please wait for the current AI action to complete before deleting columns.");
            return;
        }
        const projectTitle = data.getProject(data.getActiveProjectId())?.title;
        // Confirmation uses data layer checks via deleteColumnData
         if (!confirm(`Delete this empty column from project "${projectTitle}"?`)) return;

         if (data.deleteColumnData(columnIndex)) { // Use data function (checks conditions)
             const columnEl = getColumnElementByIndex(columnIndex);
             if (columnEl) {
                 columnsContainer.removeChild(columnEl);
             } else {
                  console.warn("Column element not found for deletion, re-rendering.");
                  renderApp(); // Failsafe
             }
             updateAllToolbarButtons();
             console.log(`Column ${columnIndex} deleted.`);
         } else {
              alert("Cannot delete this column. It might not be the rightmost, the minimum number of columns hasn't been exceeded, or it's not empty.");
         }
     }

    function handleSetColumnPrompt(columnIndex) {
        const columnData = data.getColumnData(columnIndex);
        if (!columnData) return;
         const currentPrompt = columnData.prompt || '';

         // Use the createModal helper
         const modalTitle = `Set Prompt for Column ${columnIndex + 1}`;
         const modalContent = `
             <p>This prompt guides AI 'Continue' actions within this column.</p>
             <textarea id="modal-column-prompt-input" placeholder="e.g., Write in the style of a pirate.">${currentPrompt}</textarea>
         `; // Use a unique ID for the textarea

         createModal(modalTitle, modalContent, "Save Prompt",
             (modalElement) => { // onSubmit callback
                 const promptInput = modalElement.querySelector('#modal-column-prompt-input');
                 const newPrompt = promptInput.value.trim();
                 // Use data function to update
                 if (data.setColumnPromptData(columnIndex, newPrompt)) {
                     // Update button indicator
                     const columnEl = getColumnElementByIndex(columnIndex);
                     if (columnEl) updateToolbarButtons(columnEl, columnIndex);
                     console.log(`Column ${columnIndex} prompt updated.`);
                 }
             }
             // No specific onCancel action needed beyond closing the modal
        );
    }

    function handleSetGlobalPrompt() {
        const currentPrompt = data.getGlobalPromptData();
        const modalTitle = `Set Global Prompt`;
        const modalContent = `
            <p>This prompt applies to the entire document.</p>
            <textarea id="modal-global-prompt-input" placeholder="e.g., Overall writing instructions">${currentPrompt}</textarea>
        `;
        createModal(modalTitle, modalContent, "Save Prompt",
            (modalElement) => {
                const promptInput = modalElement.querySelector('#modal-global-prompt-input');
                const newPrompt = promptInput.value.trim();
                if (data.setGlobalPromptData(newPrompt)) {
                    const colEl = getColumnElementByIndex(0);
                    if (colEl) updateToolbarButtons(colEl, 0);
                    console.log('Global prompt updated.');
                }
            }
        );
    }

     // --- Textarea and Focus Handlers ---

    function handleTextareaBlur(event) {
        const textarea = event.target;
        const cardEl = textarea.closest('.card');
        if (!cardEl) return;
        const cardId = cardEl.dataset.cardId;

        // If it was loading, clear the loading state visually
        textarea.classList.remove('ai-loading');

        // Update data via data function
        const updated = data.updateCardContentData(cardId, textarea.value);

        if (updated) {
            console.log(`Card ${cardId} content saved.`);
            // Update the group header display for this card (if it acts as a parent)
            updateGroupHeaderDisplay(cardId);
        }
        cardEl.classList.remove('editing');
        clearHighlights();
    }

    function handleTextareaFocus(event) {
         const textarea = event.target;
         const cardEl = textarea.closest('.card');
         const cardId = cardEl.dataset.cardId;
         cardEl.classList.add('editing');
         scrollHierarchy(cardId);
         highlightHierarchy(cardId);
    }

    // --- Card Name Editing ---
    function makeCardNameEditable(cardId, cardEl) {
        const nameDisplaySpan = cardEl.querySelector('.card-name-display');
        const header = cardEl.querySelector('.card-header');
        if (!nameDisplaySpan || !header || header.querySelector('.card-name-input')) return;

        const cardData = data.getCard(cardId);
        if (!cardData) return;

        const currentName = cardData.name || '';
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentName;
        input.className = 'card-name-input';
        input.maxLength = CARD_NAME_MAX_LENGTH;
        input.placeholder = `#${cardId.slice(-4)}`;

        nameDisplaySpan.style.display = 'none';
        const aiActionsDiv = header.querySelector('.card-ai-actions');
        const actionsDiv = header.querySelector('.card-actions');
        const insertBeforeTarget = aiActionsDiv || actionsDiv;
        if (insertBeforeTarget) header.insertBefore(input, insertBeforeTarget);
        else header.appendChild(input);

        input.focus();
        input.select();

        const finishEditing = (saveChanges) => {
            const newNameRaw = input.value;
            const newName = newNameRaw.trim() === '' ? null : newNameRaw.trim().substring(0, CARD_NAME_MAX_LENGTH);
            let nameChanged = false;

            if (saveChanges) {
                // Update data via data function
                if (data.updateCardNameData(cardId, newName)) {
                    nameChanged = true;
                    console.log(`Card ${cardId} name updated to "${newName}".`);
                }
            }

            // Update display span content and title based on potentially updated data
            const finalCardData = data.getCard(cardId); // Get potentially updated data
            const displayName = finalCardData.name ? finalCardData.name : `#${cardId.slice(-4)}`;
            const truncatedDisplayName = displayName.length > CARD_NAME_MAX_LENGTH ? displayName.substring(0, CARD_NAME_MAX_LENGTH) + '...' : displayName;
            nameDisplaySpan.textContent = truncatedDisplayName;
            nameDisplaySpan.title = displayName;

            // Update the group header display for this card (if it acts as a parent)
            updateGroupHeaderDisplay(cardId);

            input.remove();
            nameDisplaySpan.style.display = '';
        };

        input.addEventListener('blur', () => finishEditing(true));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); finishEditing(true); }
            else if (e.key === 'Escape') { e.preventDefault(); finishEditing(false); }
         });
      }

     // --- AI Action Helper ---

     /**
      * Processes AI responses that might contain multiple parts separated by AI_RESPONSE_SEPARATOR.
      * Updates the initial placeholder card with the first part and creates new cards for subsequent parts.
      * Handles data updates, DOM manipulation, saving, and focusing.
      *
      * @param {string} fullResponse - The complete response string from the AI service.
      * @param {string} placeholderCardId - The ID of the initially created placeholder card.
      * @param {HTMLTextAreaElement} placeholderTextarea - The textarea element of the placeholder card.
      * @param {string} originalCardId - The ID of the card that triggered the AI action.
      * @param {number} targetColumnIndex - The column index where new cards should be created.
      * @param {string} parentIdForNewCards - The parent ID for the new cards.
      */
     function processMultiPartResponse(fullResponse, placeholderCardId, placeholderTextarea, originalCardId, targetColumnIndex, parentIdForNewCards) {
         const parts = fullResponse.split(AI_RESPONSE_SEPARATOR).map(p => p.trim()).filter(p => p.length > 0);
         let lastCardId = null; // Keep track of the last card created/updated

         if (parts.length > 0) {
             // --- Part 1: Reuse Placeholder Card ---
             const firstPartContent = parts[0];
             if (data.updateCardContentData(placeholderCardId, firstPartContent)) {
                 if (placeholderTextarea) {
                     placeholderTextarea.value = firstPartContent;
                     placeholderTextarea.classList.remove('ai-loading');
                     autoResizeTextarea({ target: placeholderTextarea });
                 }
                 lastCardId = placeholderCardId;
                 console.log(`AI Multi-Part: Reused placeholder ${placeholderCardId} for first part.`);
             } else {
                 console.error("Could not update placeholder card data for multi-part response (maybe deleted?).");
                 handleDeleteCard(placeholderCardId); // Attempt cleanup
             }

             // --- Parts 2+: Create New Cards ---
             if (parts.length > 1 && lastCardId) {
                 let insertAfterCardId = lastCardId;
                 parts.slice(1).forEach((partContent) => {
                     let insertBeforeId = null;
                     const insertAfterCard = data.getCard(insertAfterCardId);
                     if (insertAfterCard) {
                         const siblings = data.getSiblingCards(insertAfterCardId);
                         const currentIndex = siblings.findIndex(c => c.id === insertAfterCardId);
                         if (currentIndex !== -1 && currentIndex + 1 < siblings.length) {
                             insertBeforeId = siblings[currentIndex + 1].id;
                         }
                     }
                     const newChildId = handleAddCard(targetColumnIndex, parentIdForNewCards, partContent, insertBeforeId);
                     if (newChildId) {
                         lastCardId = newChildId;
                         insertAfterCardId = newChildId;
                     }
                 });
             }
         } else {
             // --- No Valid Parts ---
             console.log("AI Multi-Part: No valid parts returned, deleting placeholder.");
             handleDeleteCard(placeholderCardId);
         }

         // --- Final Steps ---
         // Update the group header display for the *original* parent card.
         updateGroupHeaderDisplay(parentIdForNewCards); // Use parentIdForNewCards (which is originalCardId for breakdown/custom)
         console.log(`AI Multi-Part processing completed for original card ${originalCardId}. Last created/updated card: ${lastCardId}`);

         // Focus the first card created/updated, if it exists.
         const firstCardIdToFocus = (parts.length > 0 && placeholderCardId === lastCardId) ? placeholderCardId : lastCardId;
         if (firstCardIdToFocus && data.getCard(firstCardIdToFocus)) {
             requestAnimationFrame(() => {
                 focusCardTextarea(firstCardIdToFocus, 'start');
             });
         }
     }


     /**
      * Generic helper function to execute an AI action.
      * Handles common logic like checks, UI locking, placeholder creation,
      * AI service calls, and basic callback handling.
      *
      * @param {string} cardId - The ID of the source card.
      * @param {string} aiServiceMethodName - The name of the method to call on aiService (e.g., 'generateSummary').
      * @param {object} options - Configuration options.
      * @param {number} options.targetColumnIndex - The column index for the new card(s).
      * @param {string | null} options.parentIdForNewCards - The parent ID for the new card(s).
      * @param {string | null} options.insertBeforeId - The ID of the card before which the new card should be inserted.
      * @param {boolean} [options.requiresContentCheck=false] - Whether the source card must have content.
      * @param {string} [options.userPrompt] - Optional user prompt (for custom actions).
      * @param {boolean} [options.useMultiPartResponseHandler=false] - Whether to use processMultiPartResponse in onDone.
      */
     async function executeAiAction(cardId, aiServiceMethodName, options) {
         const {
             targetColumnIndex,
             parentIdForNewCards,
             insertBeforeId,
             requiresContentCheck = false,
             userPrompt = null, // Only used by generateCustom
             useMultiPartResponseHandler = false
         } = options;

         // 1. --- Prerequisite Checks ---
         if (!aiService.areAiSettingsValid()) {
             alert("Please configure AI settings first.");
             return;
         }
         if (isAiActionInProgress) {
             alert("Please wait for the current AI action to complete.");
             return;
         }
         const card = data.getCard(cardId);
         if (!card) {
             console.error(`executeAiAction: Card data not found for ID ${cardId}`);
             return;
         }
         if (requiresContentCheck && !card.content?.trim()) {
             alert(`Card #${cardId.slice(-4)} has no content for this action.`);
             return;
         }
         const projectContext = data.getCardContextData(cardId);
         if (!projectContext) {
             console.error(`executeAiAction: Context not found for card ${cardId}`);
             return;
         }

         // 2. --- Lock UI ---
         disableConflictingActions();

         // 3. --- Create Placeholder Card ---
         // Note: Even for multi-part responses, we start with one placeholder.
         // The multi-part handler will reuse it for the first part.
         const placeholderCardId = handleAddCard(targetColumnIndex, parentIdForNewCards, AI_PLACEHOLDER_TEXT, insertBeforeId);
         if (!placeholderCardId) {
             console.error(`executeAiAction: Failed to create placeholder card for action ${aiServiceMethodName}`);
             enableConflictingActions(); // Unlock UI if placeholder creation failed
             return;
         }

         const placeholderCardEl = getCardElement(placeholderCardId);
         const placeholderTextarea = placeholderCardEl?.querySelector('.card-content');
         if (!placeholderTextarea) {
             console.error(`executeAiAction: Could not find textarea for placeholder card ${placeholderCardId}`);
             // Attempt to clean up data if UI element is missing
             data.updateCardContentData(placeholderCardId, "Error: Could not find card textarea.");
             enableConflictingActions(); // Unlock UI
             return;
         }

         // 4. --- Call AI Service ---
         try {
              const aiServiceArgs = {
                  context: projectContext,
                 onChunk: (delta) => {
                     if (placeholderTextarea.value === AI_PLACEHOLDER_TEXT) {
                         placeholderTextarea.value = ''; // Clear placeholder on first chunk
                     }
                     placeholderTextarea.value += delta;
                     autoResizeTextarea({ target: placeholderTextarea });
                 },
                 onError: (error) => {
                     console.error(`AI Error (${aiServiceMethodName} for card ${cardId}):`, error);
                     placeholderTextarea.value = `AI Error: ${error.message}`;
                     placeholderTextarea.classList.remove('ai-loading');
                     // Update data model with error and save
                     data.updateCardContentData(placeholderCardId, placeholderTextarea.value);
                     enableConflictingActions(); // Unlock UI on error
                 },
                 onDone: (finalContent) => {
                     placeholderTextarea.classList.remove('ai-loading');

                     if (useMultiPartResponseHandler) {
                         // Delegate complex response processing
                         processMultiPartResponse(finalContent, placeholderCardId, placeholderTextarea, cardId, targetColumnIndex, parentIdForNewCards);
                     } else {
                         // Default handling for single-card output
                         if (data.updateCardContentData(placeholderCardId, finalContent)) {
                             updateGroupHeaderDisplay(placeholderCardId); // Update header if it's a parent
                         }
                         console.log(`AI Action (${aiServiceMethodName}) completed. New card: ${placeholderCardId}`);
                         // Optionally focus
                         focusCardTextarea(placeholderCardId, 'start');
                     }
                     enableConflictingActions(); // Unlock UI on success
                 }
             };

             // Add userPrompt only if the method expects it (currently just generateCustom)
             if (userPrompt !== null && aiServiceMethodName === 'generateCustom') {
                 aiServiceArgs.userPrompt = userPrompt;
             }

             // Dynamically call the specified AI service method
             if (typeof aiService[aiServiceMethodName] === 'function') {
                 aiService[aiServiceMethodName](aiServiceArgs);
             } else {
                 throw new Error(`Invalid aiService method name: ${aiServiceMethodName}`);
             }

         } catch (error) {
             console.error(`Error executing AI action ${aiServiceMethodName} for card ${cardId}:`, error);
             if (placeholderTextarea) { // Check if textarea exists before updating
                 placeholderTextarea.value = `Error during AI call setup: ${error.message}`;
                 placeholderTextarea.classList.remove('ai-loading');
                 data.updateCardContentData(placeholderCardId, placeholderTextarea.value);
             }
             enableConflictingActions(); // Ensure UI is unlocked even if setup fails
         }
     }


     // --- AI Action Handlers (Refactored) ---

     function handleAiSummarize(cardId) {
         const card = data.getCard(cardId);
         if (!card) return;

         // Determine insertion point (after current card)
         let insertBeforeId = null;
         const siblings = data.getSiblingCards(cardId);
         const currentIndex = siblings.findIndex(c => c.id === cardId);
         if (currentIndex !== -1 && currentIndex + 1 < siblings.length) {
             insertBeforeId = siblings[currentIndex + 1].id;
         }

         executeAiAction(cardId, 'generateSummary', {
             targetColumnIndex: card.columnIndex, // Summarize in the same column
             parentIdForNewCards: card.parentId, // Same parent as original
             insertBeforeId: insertBeforeId,
             requiresContentCheck: true,
             useMultiPartResponseHandler: false // Summarize typically produces single output
         });
     }

     function handleAiContinue(cardId) {
         const card = data.getCard(cardId);
         if (!card) return;

         // Determine insertion point (after current card)
         let insertBeforeId = null;
         const siblings = data.getSiblingCards(cardId);
         const currentIndex = siblings.findIndex(c => c.id === cardId);
         if (currentIndex !== -1 && currentIndex + 1 < siblings.length) {
             insertBeforeId = siblings[currentIndex + 1].id;
         }

         executeAiAction(cardId, 'generateContinuation', {
             targetColumnIndex: card.columnIndex, // Continue in the same column
             parentIdForNewCards: card.parentId, // Same parent as original
             insertBeforeId: insertBeforeId,
             requiresContentCheck: false, // Can continue from empty card
             useMultiPartResponseHandler: false // Continue typically produces single output
         });
     }

     function handleAiBreakdown(cardId) {
         const card = data.getCard(cardId);
         if (!card) return;

         executeAiAction(cardId, 'generateBreakdown', {
             targetColumnIndex: card.columnIndex + 1, // Breakdown into the next column
             parentIdForNewCards: card.id, // Original card becomes the parent
             insertBeforeId: null, // Append new cards to the end of the group
             requiresContentCheck: true,
             useMultiPartResponseHandler: true // Breakdown often produces multiple parts
         });
     }

     function handleAiExpand(cardId) {
         const card = data.getCard(cardId);
         if (!card) return;

         executeAiAction(cardId, 'generateExpand', {
             targetColumnIndex: card.columnIndex + 1, // Expand into the next column
             parentIdForNewCards: card.id, // Original card becomes the parent
             insertBeforeId: null, // Append new card to the end of the group
             requiresContentCheck: true,
             useMultiPartResponseHandler: false // Expand typically produces single output
          });
      }

      function handleAiCustom(cardId) {
          const card = data.getCard(cardId);
          if (!card) return;
          if (!aiService.areAiSettingsValid()) { alert("Please configure AI settings first."); return; }
          if (isAiActionInProgress) { alert("Please wait for the current AI action to complete."); return; }

          // Use the createModal helper
          const modalTitle = "Custom AI Prompt";
          const modalContent = `
              <p>Enter your prompt below. It will be sent to the AI along with the content of card #${cardId.slice(-4)}.</p>
              <textarea id="modal-custom-prompt-input" placeholder="e.g., Rewrite this text in a more formal tone."></textarea>
          `; // Use a unique ID

          createModal(modalTitle, modalContent, "Submit",
              (modalElement) => { // onSubmit callback
                  const promptInput = modalElement.querySelector('#modal-custom-prompt-input');
                  const userPrompt = promptInput.value.trim();
                  if (!userPrompt) {
                      alert("Please enter a prompt.");
                      // Re-open modal or handle differently? For now, just alert and close.
                      // To prevent closing, the onSubmit callback in createModal would need modification
                      // or this callback would need to signal not to close.
                      // Simpler approach for now: alert and let it close.
                      return;
                  }

                  // --- Call executeAiAction after getting prompt ---
                  executeAiAction(cardId, 'generateCustom', {
                      targetColumnIndex: card.columnIndex + 1, // Custom prompt usually goes to next column
                      parentIdForNewCards: card.id, // Original card is parent
                      insertBeforeId: null, // Append to end of group
                      requiresContentCheck: false, // Allow custom prompt on empty card
                      userPrompt: userPrompt, // Pass the collected prompt
                      useMultiPartResponseHandler: true // Custom prompts might produce multiple parts
                  });
              }
              // No specific onCancel action needed
          );
      }

      // --- AI Feature Visibility ---
    function updateAiFeatureVisibility(isValid) {
        document.body.classList.toggle('ai-ready', isValid);
        document.querySelectorAll('.ai-feature button').forEach(btn => {
            // Also check column and global prompt buttons specifically
            if (btn.classList.contains('add-prompt-btn') || btn.classList.contains('global-prompt-btn')) {
                 btn.disabled = !isValid;
            } else {
                 // Disable other AI buttons based on validity
                 const cardEl = btn.closest('.card');
                 if (cardEl) { // Only disable buttons within cards for now
                     btn.disabled = !isValid;
                 }
            }
        });
        // Update toolbar buttons which might also disable prompt buttons
        updateAllToolbarButtons();
    }


    // --- Initialization ---
    async function initializeApp() { // Make async to await onboarding import
        console.log("Initializing App...");

        // 1. Load Data
        data.loadProjectsData(); // Loads projects and sets activeProjectId in data module

        // --- Onboarding Check ---
        const isOnboardingComplete = localStorage.getItem(STORAGE_KEY_ONBOARDING);
        if (!isOnboardingComplete) {
            console.log("New user detected (no onboarding key found). Attempting default project import...");
            try {
                // Attempt to import the default project
                await projectTransfer.importProjectFromUrl(DEFAULT_ONBOARDING_PROJECT_URL, STORAGE_KEY_ONBOARDING);
                // Set the key *after* the attempt, regardless of success/failure
                localStorage.setItem(STORAGE_KEY_ONBOARDING, new Date().toISOString());
                console.log("Onboarding key set in localStorage.");
                // Reload data *after* potential import and before rendering
                data.loadProjectsData();
            } catch (error) {
                console.error("Error during onboarding import process:", error);
                // Still set the key even if there was an error during the process itself
                localStorage.setItem(STORAGE_KEY_ONBOARDING, new Date().toISOString());
                console.warn("Onboarding key set in localStorage despite import error.");
            }
        }
        // --- End Onboarding Check ---

        // 2. Initialize AI Service (passes UI elements and callback)
        aiService.initializeAiSettings({
            providerUrlInput: aiProviderUrlInput,
            modelNameInput: aiModelNameInput,
            apiKeyInput: aiApiKeyInput,
            temperatureInput: aiTemperatureInput,
            titleElement: aiSettingsTitle,
            updateAiFeatureVisibilityCallback: updateAiFeatureVisibility
        });

        // 3. Render UI based on loaded data
        renderProjectList();
        renderApp();

        // 4. Initialize Drag and Drop
        const dataHelpersForDragDrop = {
            getCard: data.getCard,
            moveCardData: (cardId, targetCol, targetParent, insertBefore) => {
                 // Wrapper to handle UI update after data move
                 if (isAiActionInProgress) {
                     console.log("AI action in progress, preventing card move.");
                     // Optionally provide feedback to the user (e.g., visual cue on drag element)
                     return { success: false, reason: "AI action in progress" }; // Prevent move
                 }
                 const moveResult = data.moveCardData(cardId, targetCol, targetParent, insertBefore);
                 if (moveResult.success) {
                     // Check if the move requires rendering columns that might not exist in the DOM yet
                     const maxAffectedIndex = moveResult.affectedColumns.length > 0 ? Math.max(...moveResult.affectedColumns) : -1;
                     const currentDomColumns = columnsContainer.children.length;

                     if (maxAffectedIndex >= currentDomColumns) {
                         // If the move affects a column index equal to or greater than the current number
                         // of columns in the DOM, a full re-render is needed to create the new column structure.
                         console.log(`Card move affects column ${maxAffectedIndex}, which might require adding columns. Triggering full renderApp().`);
                         renderApp(); // Full re-render
                     } else {
                         // Otherwise, just re-render the content of the affected columns that already exist.
                         console.log(`Card move affects existing columns: ${moveResult.affectedColumns.join(', ')}. Triggering renderColumnContent() for each.`);
                         moveResult.affectedColumns.forEach(index => {
                             const colEl = getColumnElementByIndex(index);
                             if (colEl) renderColumnContent(colEl, index);
                         });
                     }

                     updateAllToolbarButtons();
                 } else {
                    console.error("Card move failed:", moveResult.reason);
                    // Optionally provide user feedback
                }
                return moveResult; // Return result for dragDrop module if needed
            }
        };
        const domHelpersForDragDrop = {
            getCardElement: getCardElement,
            getColumnIndex: getColumnIndex
        };
        initializeDragDrop(columnsContainer, dataHelpersForDragDrop, domHelpersForDragDrop);

        // 5. Setup Global Listeners & Sidebar State
        addProjectBtn.addEventListener('click', handleAddProject);
        importProjectBtn.addEventListener('click', event => projectTransfer.displayImportOptions(event.currentTarget));
        function toggleSidebar() {
            const isCollapsed = document.body.classList.toggle('sidebar-collapsed');
            localStorage.setItem(SIDEBAR_COLLAPSED_KEY, isCollapsed);
        }
        resizer.addEventListener('click', toggleSidebar);
        resizer.addEventListener('touchstart', (e) => {
            e.preventDefault();
            toggleSidebar();
        });
        const savedSidebarState = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
        if (savedSidebarState === 'true') {
            document.body.classList.add('sidebar-collapsed');
        }

        // 6. Setup Keyboard Shortcuts
        const renderShortcutMutation = (result) => {
            if (!result.success) return result;
            const affectedColumns = result.affectedColumns || [];
            const needsFullRender = affectedColumns.some(index => index >= columnsContainer.children.length);
            if (needsFullRender) {
                renderApp();
            } else {
                affectedColumns.forEach(index => {
                    const columnEl = getColumnElementByIndex(index);
                    if (columnEl) renderColumnContent(columnEl, index);
                });
                updateAllToolbarButtons();
            }
            return result;
        };
        const shortcutHelpers = {
            getCard: data.getCard,
            getColumnCards: data.getColumnCards,
            getChildCards: data.getChildCards,
            splitCard: (cardId, content, cursor, asChild) =>
                renderShortcutMutation(data.splitCardData(cardId, content, cursor, asChild)),
            mergeCard: (cardId, direction, content) =>
                renderShortcutMutation(data.mergeCardData(cardId, direction, content)),
            focusCardTextarea
        };

        // Attach the single keydown listener using event delegation
        columnsContainer.addEventListener('keydown', (event) => {
            // Directly use the imported handler
            handleCardTextareaKeydown(event, shortcutHelpers);
        });

        console.log("App Initialized.");
    }

    return initializeApp();
}

export { initializeEditorApp };
