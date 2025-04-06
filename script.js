import * as data from './data.js';
import { initializeDragDrop } from './dragDrop.js';
import { aiService } from './aiService.js';
import { handleCardTextareaKeydown } from './cardShortcuts.js'; // Import the handler

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const sidebar = document.getElementById('sidebar');
    const resizer = document.getElementById('resizer');
    const mainContent = document.getElementById('main-content');
    const columnsContainer = document.getElementById('columnsContainer');
    const addProjectBtn = document.getElementById('add-project-btn');
    const projectListContainer = document.getElementById('project-list');

    // AI Settings Elements (Passed to aiService)
    const aiSettingsTitle = document.getElementById('ai-settings-title');
    const aiProviderUrlInput = document.getElementById('ai-provider-url');
    const aiModelNameInput = document.getElementById('ai-model-name');
    const aiApiKeyInput = document.getElementById('ai-api-key');

    // --- Constants --- (UI/Rendering related)
    const GROUP_HEADER_PREVIEW_LENGTH = 60; // Max chars for content preview in group header
    const CARD_NAME_MAX_LENGTH = 50;
    const AI_PLACEHOLDER_TEXT = "AI is thinking..."; // Keep UI constant here
    const AI_RESPONSE_SEPARATOR = '---'; // Keep UI constant here
    const SIDEBAR_COLLAPSED_KEY = 'sidebarCollapsed';

    // --- State ---
    let isAiActionInProgress = false; // Flag to prevent concurrent conflicting actions

    // --- Helper Functions (DOM/UI specific) ---

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
    // Helper to get column index from element
    function getColumnIndex(columnElement) {
        if (!columnElement) return -1;
        return Array.from(columnsContainer.children).indexOf(columnElement);
    }

    function autoResizeTextarea(event) {
        const textarea = event.target;
        textarea.style.height = 'auto';
        const computedHeight = window.getComputedStyle(textarea).height;
        textarea.style.height = computedHeight;
        textarea.style.height = `${textarea.scrollHeight}px`;
    }

    function scrollIntoViewIfNeeded(element) {
        if (element) {
            // Use 'nearest' to avoid unnecessary scrolling if already visible
            element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        }
    }

    /**
     * Scrolls the hierarchy related to a given card ID.
     * - Centers the focused card.
     * - Centers all ancestor cards in their respective containers.
     * - Scrolls descendant groups (top if taller than viewport, center otherwise).
     * @param {string} cardId - The ID of the card initiating the scroll.
     */
    function scrollHierarchy(cardId) {
        const cardEl = getCardElement(cardId);
        if (!cardEl) return;

        const scrolledContainers = new Set(); // Track containers already scrolled

        const scrollToTarget = (container, targetElement, center = true, scrollToTopIfTaller = false) => {
            if (!container || !targetElement || scrolledContainers.has(container)) {
                return;
            }

            const containerRect = container.getBoundingClientRect();
            const elementRect = targetElement.getBoundingClientRect();
            const relativeElementTop = elementRect.top - containerRect.top + container.scrollTop;
            const relativeElementHeight = elementRect.height;
            const containerHeight = container.clientHeight;

            let targetScroll;
            if (scrollToTopIfTaller && relativeElementHeight > window.innerHeight) {
                targetScroll = relativeElementTop;
            } else if (center) {
                targetScroll = relativeElementTop - (containerHeight / 2) + (relativeElementHeight / 2);
            } else {
                targetScroll = relativeElementTop;
            }

            container.scrollTo({
                top: Math.max(0, targetScroll),
                behavior: 'smooth'
            });
            scrolledContainers.add(container);
        };

        // 1. Scroll Focused Card
        const focusedScrollContainer = cardEl.closest('.column')?.querySelector('.cards-container');
        scrollToTarget(focusedScrollContainer, cardEl, true);

        // 2. Scroll Ancestors (using data helper)
        const ancestorIds = data.getAncestorIds(cardId);
        ancestorIds.forEach(ancestorId => {
            const ancestorEl = getCardElement(ancestorId);
            if (ancestorEl) {
                const ancestorScrollContainer = ancestorEl.closest('.column')?.querySelector('.cards-container');
                scrollToTarget(ancestorScrollContainer, ancestorEl, true);
            }
        });

        // 3. Scroll Descendant Groups (using data helpers)
        const descendantIds = data.getDescendantIds(cardId);
        const allIdsToCheckForGroups = [cardId, ...descendantIds];

        allIdsToCheckForGroups.forEach(currentId => {
            const currentCardData = data.getCard(currentId);
            if (!currentCardData) return;

            const childrenInNextCol = data.getChildCards(currentId, currentCardData.columnIndex + 1);
            if (childrenInNextCol.length > 0) {
                const groupEl = getGroupElement(currentId);
                if (groupEl) {
                    const groupScrollContainer = groupEl.closest('.column')?.querySelector('.cards-container');
                    scrollToTarget(groupScrollContainer, groupEl, true, true);
                }
            }
        });
    }

    function highlightHierarchy(cardId) {
        clearHighlights();
        const targetCardData = data.getCard(cardId);
        if (!targetCardData) return;

        const ancestors = data.getAncestorIds(cardId);
        const descendants = data.getDescendantIds(cardId);
        const allToHighlight = [cardId, ...ancestors, ...descendants];

        allToHighlight.forEach(id => {
            const cardEl = getCardElement(id);
            if (cardEl) cardEl.classList.add('highlight');
            const groupEl = getGroupElement(id); // Highlight group headers too
            if (groupEl) groupEl.classList.add('highlight');
        });
    }

    function clearHighlights() {
        document.querySelectorAll('.card.highlight, .card.editing, .card-group.highlight').forEach(el => {
            el.classList.remove('highlight', 'editing');
        });
    }

    /**
     * Updates the display text and title of a group header based on its parent card's data.
     * @param {string} parentCardId - The ID of the card whose data determines the group header.
     */
    function updateGroupHeaderDisplay(parentCardId) {
        const groupEl = getGroupElement(parentCardId);
        if (!groupEl) return; // Group might not exist in the DOM yet

        const parentCardData = data.getCard(parentCardId);
        if (!parentCardData) return; // Parent card data not found

        const groupHeaderContainer = groupEl.querySelector('.group-header');
        if (!groupHeaderContainer) return; // Header element not found

        let groupHeaderText = '';
        let groupHeaderTitle = '';

        if (parentCardData.name) {
            const truncatedParentName = parentCardData.name.length > CARD_NAME_MAX_LENGTH ? parentCardData.name.substring(0, CARD_NAME_MAX_LENGTH) + '...' : parentCardData.name;
            groupHeaderText = `>> ${truncatedParentName}`;
            groupHeaderTitle = `Children of ${parentCardData.name}`;
        } else {
            const idPart = `#${parentCardId.slice(-4)}`;
            const contentPreview = parentCardData.content?.trim().substring(0, GROUP_HEADER_PREVIEW_LENGTH) || '';
            const ellipsis = (parentCardData.content?.trim().length || 0) > GROUP_HEADER_PREVIEW_LENGTH ? '...' : '';
            const previewText = contentPreview ? `: ${contentPreview}${ellipsis}` : '';
            groupHeaderText = `>> ${idPart}${previewText}`;
            groupHeaderTitle = `Children of ${idPart}${contentPreview ? `: ${parentCardData.content?.trim()}` : ''}`;
        }

        groupHeaderContainer.textContent = groupHeaderText;
        groupHeaderContainer.title = groupHeaderTitle;
        // console.log(`Updated group header display for parent: ${parentCardId}`);
    }


    /**
     * Finds a card's textarea, focuses it, sets cursor position, and scrolls into view.
     * @param {string} cardId - The ID of the card to focus.
     * @param {'start' | 'end' | 'preserve' | number} [position='preserve'] - Cursor position.
     */
    function focusCardTextarea(cardId, position = 'preserve') {
        const cardEl = getCardElement(cardId);
        if (!cardEl) return;
        const textarea = cardEl.querySelector('textarea.card-content');
        if (!textarea) return;

        textarea.style.display = '';
        textarea.focus();

        requestAnimationFrame(() => {
            try {
                 if (typeof position === 'number') {
                     const pos = Math.max(0, Math.min(textarea.value.length, position));
                     textarea.setSelectionRange(pos, pos);
                 } else if (position === 'start') {
                    textarea.setSelectionRange(0, 0);
                } else if (position === 'end') {
                    const len = textarea.value.length;
                    textarea.setSelectionRange(len, len);
                }
            } catch (e) {
                console.error(`Error setting selection range for card ${cardId}:`, e);
            }
            scrollHierarchy(cardId);
            highlightHierarchy(cardId);
        });
        console.log(`Focused card ${cardId}, position: ${position}`);
    }

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

        // Color should be pre-calculated by data.js
        cardEl.style.backgroundColor = cardData.color || data.getColorForCard(cardData); // Fallback just in case

        const displayName = cardData.name ? cardData.name : `#${cardData.id.slice(-4)}`;
        const truncatedDisplayName = displayName.length > CARD_NAME_MAX_LENGTH ? displayName.substring(0, CARD_NAME_MAX_LENGTH) + '...' : displayName;
        const aiReady = aiService.areAiSettingsValid();

        cardEl.innerHTML = `
            <div class="card-header" draggable="true">
                <span class="card-name-display" title="${displayName}">${truncatedDisplayName}</span>
                <div class="card-ai-actions ai-feature">
                     <button class="ai-continue-btn" title="Continue Writing (in this column)" ${!aiReady ? 'disabled' : ''}>⬇️</button>
                      <button class="ai-expand-btn" title="Expand (to next column)" ${!aiReady ? 'disabled' : ''}>↕️</button>
                      <button class="ai-summarize-btn" title="Reduce (in this column)" ${!aiReady ? 'disabled' : ''}>⏪</button>
                      <button class="ai-breakdown-btn" title="Brainstorm (to next column)" ${!aiReady ? 'disabled' : ''}>🧠</button>
                      <button class="ai-custom-btn" title="Custom Prompt (to next column)" ${!aiReady ? 'disabled' : ''}>✨</button>
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

        columnEl.innerHTML = `
            <div class="column-toolbar">
                 <div class="toolbar-left">
                     <button class="add-card-btn">Add Card</button>
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

    function renderColumnContent(columnEl, columnIndex) {
        const cardsContainer = columnEl.querySelector('.cards-container');
        cardsContainer.innerHTML = ''; // Clear previous content

        if (columnIndex === 0) {
            // --- Render Root Cards for Column 0 ---
            const rootCards = data.getColumnCards(0).filter(c => !c.parentId);
            // Root cards are already sorted by order by getColumnCards
            rootCards.forEach(cardData => {
                const cardEl = createCardElement(cardData);
                cardsContainer.appendChild(cardEl);
            });
        } else {
            // --- Render Groups and Child Cards for Columns > 0 ---
            // Get parents from the *previous* column, sorted by their order
            const parentCards = data.getColumnCards(columnIndex - 1);

            parentCards.forEach(parentCardData => {
                // Create a group element for each parent from the previous column
                const groupEl = createGroupElement(parentCardData.id);
                if (!groupEl) {
                    console.warn(`Failed to create group element for parent ${parentCardData.id} in column ${columnIndex}`);
                    return; // Skip this parent if group creation fails
                }

                // Get children of this parent *in the current column*, sorted by their order
                const childCards = data.getChildCards(parentCardData.id, columnIndex);

                // If children exist, create their card elements and append to the group
                if (childCards.length > 0) {
                    childCards.forEach(childCardData => {
                        const cardEl = createCardElement(childCardData);
                        groupEl.appendChild(cardEl);
                    });
                }
                // Else: The group will be empty, which is the desired behavior to show all parent groups

                // Append the complete group (with or without children) to the container
                cardsContainer.appendChild(groupEl);
            });
        }

        updateToolbarButtons(columnEl, columnIndex);
    }


    function renderApp() {
        columnsContainer.innerHTML = '';
        const projectData = data.getActiveProjectData(); // Use data helper

        if (!projectData) {
            columnsContainer.innerHTML = '<p style="padding: 20px; text-align: center;">Error: No project selected or data corrupted.</p>';
            return;
        }

        // Determine the number of columns to render based on data
        const columnsToRenderCount = Math.max(data.MIN_COLUMNS, projectData.columns.length);

        for (let i = 0; i < columnsToRenderCount; i++) {
             const columnEl = createColumnElement(i);
             columnsContainer.appendChild(columnEl);
             // Ensure column data exists before rendering content
             if (i < projectData.columns.length) {
                 renderColumnContent(columnEl, i);
             } else {
                 // Render empty column structure if data doesn't exist yet (shouldn't happen often with addColumnData check)
                 updateToolbarButtons(columnEl, i);
             }
        }

        updateAllToolbarButtons();
        console.log(`App rendered for project: ${data.projects[data.activeProjectId]?.title}`);
    }

    function updateToolbarButtons(columnEl, columnIndex) {
        const addCardBtn = columnEl.querySelector('.add-card-btn');
        const addColBtn = columnEl.querySelector('.add-column-btn');
        const delColBtn = columnEl.querySelector('.delete-column-btn');
        const addPromptBtn = columnEl.querySelector('.add-prompt-btn');

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
    }

    function updateAllToolbarButtons() {
        Array.from(columnsContainer.children).forEach((col, idx) => {
            updateToolbarButtons(col, idx);
        });
    }

    // --- Project Sidebar Rendering & Interactions ---

    function renderProjectList() {
        projectListContainer.innerHTML = '';
        const sortedProjects = Object.values(data.projects).sort((a, b) => b.lastModified - a.lastModified);

        sortedProjects.forEach(project => {
            const item = document.createElement('div');
            item.className = 'project-item';
            item.dataset.projectId = project.id;
            if (project.id === data.activeProjectId) { // Use data state
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
                handleExportProject(project.id); // Use handler
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
        const currentTitle = data.projects[projectId].title; // Use data state
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
                    data.saveProjectsData(); // Save changes
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
        data.saveProjectsData(); // Save the new project list
        handleSwitchProject(newProject.id); // Switch to the new project
        // renderProjectList() will be called by handleSwitchProject's renderApp
    }

    function handleDeleteProject(projectIdToDelete) {
        const projectTitle = data.projects[projectIdToDelete]?.title;
        if (!projectTitle) return;

        if (!confirm(`Are you sure you want to delete the project "${projectTitle}" and all its content? This cannot be undone.`)) {
            return;
        }

        const originalActiveId = data.activeProjectId; // Store the ID *before* deletion
        const deleteResult = data.deleteProjectData(projectIdToDelete); // Use data function

        if (deleteResult.deleted) {
            data.saveProjectsData(); // Save the deletion
            data.saveActiveProjectId(); // Save the potentially new active ID

            // Check if the *original* active project was the one deleted
            if (originalActiveId === projectIdToDelete) {
                 // Active project *was* deleted, load the new one
                 console.log(`Active project ${projectIdToDelete} deleted. Rendering new active project: ${data.activeProjectId}`);
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
            data.saveActiveProjectId(); // Persist the choice
            renderApp(); // Render the new project
            renderProjectList(); // Update sidebar highlighting
            console.log(`Switched to project: ${data.projects[data.activeProjectId].title} (${data.activeProjectId})`);
        }
    }

    function handleExportProject(projectId) {
        const project = data.projects[projectId];
        if (!project) return;

        let content = '';
        const projectData = project.data; // Use specific project's data

        // Need temporary local versions of traversal helpers using specific project data
        const getCardLocal = (id) => projectData.cards[id];
        const getChildCardsLocal = (parentId, targetColumnIndex = null) => {
            let children = Object.values(projectData.cards).filter(card => card.parentId === parentId);
            if (targetColumnIndex !== null) {
                children = children.filter(card => card.columnIndex === targetColumnIndex);
            }
            return children.sort((a, b) => a.order - b.order);
        };
        const getColumnCardsLocal = (columnIndex) => {
             return Object.values(projectData.cards)
                    .filter(card => card.columnIndex === columnIndex && !card.parentId) // Only root cards
                    .sort((a, b) => a.order - b.order);
        };


        function traverse(cardId) {
            const card = getCardLocal(cardId);
            if (!card) return;

            const cardContent = card.content?.trim();
            if (cardContent) {
                content += cardContent + '\n\n';
            }

            const children = getChildCardsLocal(cardId, card.columnIndex + 1);
            children.forEach(child => traverse(child.id));
        }

        const rootCards = getColumnCardsLocal(0);
        rootCards.forEach(rootCard => traverse(rootCard.id));

        // File download logic (remains the same)
        const blob = new Blob([content.trim()], { type: 'text/plain;charset=utf-8' });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `ProjectExport_${project.title.replace(/\s+/g, '_')}_${timestamp}.txt`;
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        console.log(`Exported project: ${project.title}`);
    }

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

            data.saveProjectsData(); // Save after data and DOM updates

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
        const confirmMessage = `Delete card #${cardId.slice(-4)} ${hasContent ? 'with content ' : ''}and its ${descendantIds.length} descendant(s) (${numDescendantsWithContent} with content) from project "${data.projects[data.activeProjectId].title}"?`;

        if (isAiActionInProgress) {
            alert("Please wait for the current AI action to complete before deleting cards.");
            return;
        }

        if (shouldConfirm && !confirm(confirmMessage)) {
            return;
        }

        const originalParentId = card.parentId;
        const originalColumnIndex = card.columnIndex;
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
            data.saveProjectsData(); // Save changes
            console.log(`Card ${cardId} and descendants deleted.`);
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

         data.saveProjectsData(); // Save after DOM update
         console.log(`Column ${newIndex} added visually.`);
    }

    function handleDeleteColumn(columnIndex) {
        if (isAiActionInProgress) {
            alert("Please wait for the current AI action to complete before deleting columns.");
            return;
        }
        const projectTitle = data.projects[data.activeProjectId]?.title;
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
            data.saveProjectsData(); // Save deletion
            console.log(`Column ${columnIndex} deleted.`);
        } else {
             alert("Cannot delete this column. It might not be the rightmost, the minimum number of columns hasn't been exceeded, or it's not empty.");
        }
    }

    function handleSetColumnPrompt(columnIndex) {
        const columnData = data.getColumnData(columnIndex);
        if (!columnData) return;
        const currentPrompt = columnData.prompt || '';

        // --- Modal Implementation (UI Logic) ---
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        const modal = document.createElement('div');
        modal.className = 'modal-content';
        modal.innerHTML = `
            <h4>Set Prompt for Column ${columnIndex + 1}</h4>
            <p>This prompt guides AI 'Continue' actions within this column.</p>
            <textarea id="column-prompt-input" placeholder="e.g., Write in the style of a pirate.">${currentPrompt}</textarea>
            <div class="modal-actions">
                <button id="column-prompt-cancel">Cancel</button>
                <button id="column-prompt-submit" class="primary">Save Prompt</button>
            </div>
        `;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const promptInput = modal.querySelector('#column-prompt-input');
        const cancelButton = modal.querySelector('#column-prompt-cancel');
        const submitButton = modal.querySelector('#column-prompt-submit');
        promptInput.focus();
        promptInput.select();

        const closeModal = () => {
            if (overlay.parentNode === document.body) {
                document.body.removeChild(overlay);
            }
        };

        cancelButton.addEventListener('click', closeModal);
        submitButton.addEventListener('click', () => {
            const newPrompt = promptInput.value.trim();
            // Use data function to update
            if (data.setColumnPromptData(columnIndex, newPrompt)) {
                data.saveProjectsData(); // Save if changed
                // Update button indicator
                const columnEl = getColumnElementByIndex(columnIndex);
                if (columnEl) updateToolbarButtons(columnEl, columnIndex);
                console.log(`Column ${columnIndex} prompt updated.`);
            }
            closeModal();
        });
        promptInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitButton.click(); }
            else if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
        });
         overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
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
            data.saveProjectsData(); // Save if content changed
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
                    data.saveProjectsData(); // Save if changed
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

     // --- AI Action Handlers ---

     function handleAiSummarize(cardId) {
         if (!aiService.areAiSettingsValid()) { alert("Please configure AI settings first."); return; }
         if (isAiActionInProgress) { alert("Please wait for the current AI action to complete."); return; }

         const card = data.getCard(cardId);
         if (!card || !card.content?.trim()) { alert("Card has no content to summarize."); return; }

         disableConflictingActions(); // Lock UI

         // Find insertBeforeId for the new card (immediately after the current card)
         let insertBeforeId = null;
         const siblings = data.getSiblingCards(cardId);
         const currentIndex = siblings.findIndex(c => c.id === cardId);
         if (currentIndex !== -1 && currentIndex + 1 < siblings.length) {
             insertBeforeId = siblings[currentIndex + 1].id;
         }

         // Create the new placeholder card using handleAddCard
         const newCardId = handleAddCard(card.columnIndex, card.parentId, AI_PLACEHOLDER_TEXT, insertBeforeId);
         if (!newCardId) {
             enableConflictingActions(); // Unlock if card creation failed
             return;
         }

         const newCardEl = getCardElement(newCardId);
         const newTextarea = newCardEl?.querySelector('.card-content');
         if (!newTextarea) {
             console.error("Could not find textarea for new summary card:", newCardId);
             // Update data directly if textarea not found
             data.updateCardContentData(newCardId, "Error: Could not find card textarea.");
             data.saveProjectsData();
             enableConflictingActions(); // Unlock if card creation failed
             return;
         }

         // Call aiService, targeting the new card
         aiService.generateSummary({
             card: card, // Pass the original card for context (children, parent, etc.)
             onChunk: (delta) => {
                 if (newTextarea.value === AI_PLACEHOLDER_TEXT) {
                     newTextarea.value = ''; // Clear placeholder
                 }
                 newTextarea.value += delta;
                 autoResizeTextarea({ target: newTextarea });
             },
             onError: (error) => {
                newTextarea.value = `AI Error: ${error.message}`;
                newTextarea.classList.remove('ai-loading');
                // Update data model with error
                data.updateCardContentData(newCardId, newTextarea.value);
                data.saveProjectsData();
                enableConflictingActions(); // Unlock UI on error
             },
             onDone: (finalContent) => {
                 newTextarea.classList.remove('ai-loading');
                 // Update the *new* card's data model with the final content
                 if (data.updateCardContentData(newCardId, finalContent)) {
                     data.saveProjectsData(); // Save the new card's content
                     // Update the group header for the new card that created by AI
                     updateGroupHeaderDisplay(newCardId);
                 }
                 enableConflictingActions(); // Unlock UI
                 console.log(`AI Summarize completed. New card: ${newCardId}`);
                 // Optionally focus the new card
                 // focusCardTextarea(newCardId, 'end');
             }
         });
     }

     function handleAiContinue(cardId) {
        if (!aiService.areAiSettingsValid()) { alert("Please configure AI settings first."); return; }
        if (isAiActionInProgress) { alert("Please wait for the current AI action to complete."); return; }

        const currentCard = data.getCard(cardId); // Still need current card for column/parent info
        if (!currentCard) return;

        disableConflictingActions(); // Lock UI

        // Find insertBeforeId using data helpers
        let insertBeforeId = null;
        const siblings = data.getSiblingCards(cardId); // Need siblings to find insertion point
        const currentIndex = siblings.findIndex(c => c.id === cardId);
        if (currentIndex !== -1 && currentIndex + 1 < siblings.length) {
            insertBeforeId = siblings[currentIndex + 1].id;
        }

        // Use handleAddCard to create placeholder and update DOM/Data
        // Pass currentCard's column and parentId
        const newCardId = handleAddCard(currentCard.columnIndex, currentCard.parentId, AI_PLACEHOLDER_TEXT, insertBeforeId);
        if (!newCardId) {
            enableConflictingActions(); // Unlock if card creation failed
            return;
        }

        const newCardEl = getCardElement(newCardId);
        const newTextarea = newCardEl?.querySelector('.card-content');
        if (!newTextarea) {
             console.error("Could not find textarea for new AI card:", newCardId);
             // Update data directly if textarea not found
             data.updateCardContentData(newCardId, "Error: Could not find card textarea.");
             data.saveProjectsData();
             enableConflictingActions(); // Unlock if card creation failed
             return;
        }

        // Call aiService, passing the card object and callbacks
        aiService.generateContinuation({
            card: currentCard, // Pass the full card object
            onChunk: (delta) => {
                if (newTextarea.value === AI_PLACEHOLDER_TEXT) {
                    newTextarea.value = '';
                }
                newTextarea.value += delta;
                autoResizeTextarea({ target: newTextarea });
            },
            onError: (error) => {
                newTextarea.value = `AI Error: ${error.message}`;
                newTextarea.classList.remove('ai-loading');
                // Update data model with error
                data.updateCardContentData(newCardId, newTextarea.value);
                data.saveProjectsData();
                enableConflictingActions(); // Unlock UI on error
            },
            onDone: (finalContent) => {
                 newTextarea.classList.remove('ai-loading');
                 // Update data model with final content
                 if (data.updateCardContentData(newCardId, finalContent)) {
                     data.saveProjectsData();
                     // Update the group header for the new card that created by AI
                     updateGroupHeaderDisplay(newCardId);
                 }
                 enableConflictingActions(); // Unlock UI on success
                 console.log("AI Continue completed for card:", newCardId);
            }
        });
    }

    function handleAiBreakdown(cardId) {
        if (!aiService.areAiSettingsValid()) { alert("Please configure AI settings first."); return; }
        if (isAiActionInProgress) { alert("Please wait for the current AI action to complete."); return; }

        const card = data.getCard(cardId);
        if (!card || !card.content?.trim()) { alert("Card has no content to breakdown."); return; }

        disableConflictingActions(); // Lock UI

        const targetColumnIndex = card.columnIndex + 1;
        const parentIdForNewCards = card.id;

        // Create a single temporary placeholder using handleAddCard
        const tempCardId = handleAddCard(targetColumnIndex, parentIdForNewCards, AI_PLACEHOLDER_TEXT);
        if (!tempCardId) {
            enableConflictingActions(); // Unlock if card creation failed
            return;
        }

        const tempCardEl = getCardElement(tempCardId);
        const tempTextarea = tempCardEl?.querySelector('.card-content');
        if (!tempTextarea) {
             console.error("Could not find textarea for temp AI card:", tempCardId);
             data.updateCardContentData(tempCardId, "Error: Could not find card textarea.");
             data.saveProjectsData();
             enableConflictingActions(); // Unlock if card creation failed
             return;
        }

        aiService.generateBreakdown({
            card: card, // Pass the full card object
            onChunk: (delta) => {
                 if (tempTextarea.value === AI_PLACEHOLDER_TEXT) {
                     tempTextarea.value = '';
                 }
                 tempTextarea.value += delta;
                 autoResizeTextarea({ target: tempTextarea });
            },
            onError: (error) => {
                tempTextarea.value = `AI Error: ${error.message}`;
                tempTextarea.classList.remove('ai-loading');
                data.updateCardContentData(tempCardId, tempTextarea.value); // Save error
                data.saveProjectsData();
                enableConflictingActions(); // Unlock UI on error
            },
            onDone: (fullResponse) => {
                const parts = fullResponse.split(AI_RESPONSE_SEPARATOR).map(p => p.trim()).filter(p => p.length > 0);
                let lastCardId = null;

                if (parts.length > 0) {
                    // Reuse the temporary card for the first part
                    const firstPartContent = parts[0];
                    if (data.updateCardContentData(tempCardId, firstPartContent)) { // Update data
                        if (tempTextarea) { // Update UI
                            tempTextarea.value = firstPartContent;
                            tempTextarea.classList.remove('ai-loading');
                            autoResizeTextarea({ target: tempTextarea });
                        }
                        lastCardId = tempCardId;
                        console.log(`AI Breakdown: Reused temp card ${tempCardId}.`);
                    } else {
                        // If update failed (e.g., card deleted concurrently), log error
                        console.error("Could not update temp card data for AI Breakdown.");
                        handleDeleteCard(tempCardId); // Attempt to clean up temp card
                    }

                    // Create new cards for the remaining parts
                    if (parts.length > 1 && lastCardId) { // Ensure first card was processed
                        let insertAfterCardId = lastCardId;
                        parts.slice(1).forEach((partContent) => {
                            // Determine insertBeforeId based on current siblings in data
                            let insertBeforeId = null;
                            const insertAfterCard = data.getCard(insertAfterCardId);
                            if (insertAfterCard) {
                                const siblings = data.getSiblingCards(insertAfterCardId);
                                const currentIndex = siblings.findIndex(c => c.id === insertAfterCardId);
                                if (currentIndex !== -1 && currentIndex + 1 < siblings.length) {
                                    insertBeforeId = siblings[currentIndex + 1].id;
                                }
                            }
                            // Use handleAddCard to create card and update DOM/Data
                            const newChildId = handleAddCard(targetColumnIndex, parentIdForNewCards, partContent, insertBeforeId);
                            if (newChildId) {
                                lastCardId = newChildId;
                                insertAfterCardId = newChildId;
                            }
                        });
                    }
                } else {
                    // No valid parts, delete the temporary card
                    console.log("AI Breakdown: No valid parts returned, deleting temp card.");
                    handleDeleteCard(tempCardId); // Use handler to delete
                }

                // Final save after all potential modifications
                data.saveProjectsData();
                // Update the group header for the original card
                updateGroupHeaderDisplay(tempCardId);
                console.log(`AI Breakdown completed for card ${cardId}.`);

                if (tempCardId && data.getCard(tempCardId)) {
                    requestAnimationFrame(() => {
                        focusCardTextarea(tempCardId, 'start'); // Use dedicated function, focus at start
                    })
                }
                enableConflictingActions(); // Unlock UI on success
            }
        });
    }

    function handleAiExpand(cardId) {
        if (!aiService.areAiSettingsValid()) { alert("Please configure AI settings first."); return; }
        if (isAiActionInProgress) { alert("Please wait for the current AI action to complete."); return; }

        const card = data.getCard(cardId);
        if (!card || !card.content?.trim()) { alert("Card has no content to expand."); return; }

        disableConflictingActions(); // Lock UI

        const targetColumnIndex = card.columnIndex + 1;
        const parentIdForNewCard = card.id;

        // Use handleAddCard to create placeholder
        const newCardId = handleAddCard(targetColumnIndex, parentIdForNewCard, AI_PLACEHOLDER_TEXT);
        if (!newCardId) {
            enableConflictingActions(); // Unlock if card creation failed
            return;
        }

        const newCardEl = getCardElement(newCardId);
        const newTextarea = newCardEl?.querySelector('.card-content');
        if (!newTextarea) {
            console.error("Could not find textarea for new AI card:", newCardId);
            data.updateCardContentData(newCardId, "Error: Could not find card textarea.");
            data.saveProjectsData();
            enableConflictingActions(); // Unlock if card creation failed
            return;
        }

        aiService.generateExpand({
            card: card, // Pass the full card object
            onChunk: (delta) => {
                if (newTextarea.value === AI_PLACEHOLDER_TEXT) {
                    newTextarea.value = '';
                }
                newTextarea.value += delta;
                autoResizeTextarea({ target: newTextarea });
            },
            onError: (error) => {
                newTextarea.value = `AI Error: ${error.message}`;
                newTextarea.classList.remove('ai-loading');
                data.updateCardContentData(newCardId, newTextarea.value); // Save error
                data.saveProjectsData();
                enableConflictingActions(); // Unlock UI on error
            },
            onDone: (finalContent) => {
                 newTextarea.classList.remove('ai-loading');
                 // Update data model with final content
                 if (data.updateCardContentData(newCardId, finalContent)) { // Save final content
                     data.saveProjectsData();
                     // Update the group header for the new card
                     updateGroupHeaderDisplay(newCardId);
                 }
                 enableConflictingActions(); // Unlock UI on success
                 console.log("AI Expand completed for card:", newCardId);
            }
        });
    }

    function handleAiCustom(cardId) {
        if (!aiService.areAiSettingsValid()) { alert("Please configure AI settings first."); return; }
        if (isAiActionInProgress) { alert("Please wait for the current AI action to complete."); return; }

        const card = data.getCard(cardId);
        if (!card) return;

        // --- Modal Implementation (UI Logic) ---
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        const modal = document.createElement('div');
        modal.className = 'modal-content';
        modal.innerHTML = `
            <h4>Custom AI Prompt</h4>
            <p>Enter your prompt below. It will be sent to the AI along with the content of card #${cardId.slice(-4)}.</p>
            <textarea id="custom-prompt-input" placeholder="e.g., Rewrite this text in a more formal tone."></textarea>
            <div class="modal-actions">
                <button id="custom-prompt-cancel">Cancel</button>
                <button id="custom-prompt-submit" class="primary">Submit</button>
            </div>
        `;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const promptInput = modal.querySelector('#custom-prompt-input');
        const cancelButton = modal.querySelector('#custom-prompt-cancel');
        const submitButton = modal.querySelector('#custom-prompt-submit');
        promptInput.focus();

        const closeModal = () => { if (overlay.parentNode === document.body) document.body.removeChild(overlay); };

        cancelButton.addEventListener('click', closeModal);
        submitButton.addEventListener('click', () => {
            const userPrompt = promptInput.value.trim();
            if (!userPrompt) { alert("Please enter a prompt."); return; }
            closeModal();

            disableConflictingActions(); // Lock UI

            // Proceed with AI call
            const targetColumnIndex = card.columnIndex + 1;
            const parentIdForNewCard = card.id;

            // Use handleAddCard for placeholder
            const placeholderCardId = handleAddCard(targetColumnIndex, parentIdForNewCard, AI_PLACEHOLDER_TEXT);
            if (!placeholderCardId) {
                enableConflictingActions(); // Unlock if card creation failed
                return;
            }

            const placeholderCardEl = getCardElement(placeholderCardId);
            const placeholderTextarea = placeholderCardEl?.querySelector('.card-content');
             if (!placeholderTextarea) {
                 console.error("Could not find textarea for new AI card:", placeholderCardId);
                 data.updateCardContentData(placeholderCardId, "Error: Could not find card textarea.");
                 data.saveProjectsData();
                 enableConflictingActions(); // Unlock if card creation failed
                 return;
             }

            aiService.generateCustom({
                card: card, // Pass the full card object
                userPrompt: userPrompt,
                onChunk: (delta) => {
                    if (placeholderTextarea.value === AI_PLACEHOLDER_TEXT) {
                        placeholderTextarea.value = '';
                    }
                    placeholderTextarea.value += delta;
                    autoResizeTextarea({ target: placeholderTextarea });
                },
                onError: (error) => {
                    placeholderTextarea.value = `AI Error: ${error.message}`;
                    placeholderTextarea.classList.remove('ai-loading');
                    data.updateCardContentData(placeholderCardId, placeholderTextarea.value); // Save error
                    data.saveProjectsData();
                    enableConflictingActions(); // Unlock UI on error
                },
                onDone: (finalContent) => {
                    // Process potential multi-part response
                    const parts = finalContent.split(AI_RESPONSE_SEPARATOR).map(p => p.trim()).filter(p => p.length > 0);
                    let lastCardId = null;

                    if (parts.length > 0) {
                        // Reuse placeholder for first part
                        const firstPartContent = parts[0];
                        if (data.updateCardContentData(placeholderCardId, firstPartContent)) {
                            if (placeholderTextarea) {
                                placeholderTextarea.value = firstPartContent;
                                placeholderTextarea.classList.remove('ai-loading');
                                autoResizeTextarea({ target: placeholderTextarea });
                            }
                            lastCardId = placeholderCardId;
                            console.log(`AI Custom: Reused placeholder ${placeholderCardId}.`);
                        } else {
                             console.error("Could not update placeholder card data for AI Custom.");
                             handleDeleteCard(placeholderCardId); // Cleanup
                        }

                        // Create new cards for remaining parts
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
                                const newChildId = handleAddCard(targetColumnIndex, parentIdForNewCard, partContent, insertBeforeId);
                                if (newChildId) {
                                    lastCardId = newChildId;
                                    insertAfterCardId = newChildId;
                                }
                            });
                        }
                    } else {
                        console.log("AI Custom: No valid parts returned, deleting placeholder.");
                        handleDeleteCard(placeholderCardId);
                    }

                    data.saveProjectsData(); // Final save
                    // Update the group header for the original card
                    updateGroupHeaderDisplay(placeholderCardId);
                    console.log(`AI Custom completed for original card ${cardId}.`);

                    if (placeholderCardId && data.getCard(placeholderCardId)) {
                        requestAnimationFrame(() => {
                            focusCardTextarea(placeholderCardId, 'start'); // Use dedicated function, focus at start
                        });
                    }
                    enableConflictingActions(); // Unlock UI on success
                }
            });
        });

        promptInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitButton.click(); }
            else if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
        });
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    }

    // --- AI Feature Visibility ---
    function updateAiFeatureVisibility(isValid) {
        document.body.classList.toggle('ai-ready', isValid);
        document.querySelectorAll('.ai-feature button').forEach(btn => {
            // Also check column prompt button specifically
            if (btn.classList.contains('add-prompt-btn')) {
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
    function initializeApp() {
        console.log("Initializing App...");

        // 1. Load Data
        data.loadProjectsData(); // Loads projects and sets activeProjectId in data module

        // 2. Initialize AI Service (passes UI elements and callback)
        aiService.initializeAiSettings({
            providerUrlInput: aiProviderUrlInput,
            modelNameInput: aiModelNameInput,
            apiKeyInput: aiApiKeyInput,
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
                     data.saveProjectsData(); // Save after successful move and render
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
        resizer.addEventListener('click', () => {
            const isCollapsed = document.body.classList.toggle('sidebar-collapsed');
            localStorage.setItem(SIDEBAR_COLLAPSED_KEY, isCollapsed);
        });
        const savedSidebarState = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
        if (savedSidebarState === 'true') {
            document.body.classList.add('sidebar-collapsed');
        }

        // 6. Setup Keyboard Shortcuts
        const shortcutHelpers = {
            // Provide necessary functions from data and script modules
            getCard: data.getCard,
            addCard: handleAddCard, // Use the UI handler
            deleteCard: handleDeleteCard, // Use the UI handler for standard delete
            // For merge/split shortcuts, use wrappers that handle re-rendering
            deleteCardInternal: (cardId) => {
                 const result = data.deleteCardData(cardId); // Call data function
                 if (result.deletedIds.length > 0) {
                     // Remove elements immediately for responsiveness
                     result.deletedIds.forEach(id => {
                         getCardElement(id)?.remove();
                         getGroupElement(id)?.remove();
                     });
                     // Re-render affected columns after data update
                     result.affectedColumns.forEach(index => {
                         const colEl = getColumnElementByIndex(index);
                         if (colEl) renderColumnContent(colEl, index);
                     });
                     updateAllToolbarButtons(); // Update toolbars
                     data.saveProjectsData(); // Save changes
                 }
                 return result; // Return result for shortcut logic
            },
            reparentChildren: (oldP, newP) => {
                 const result = data.reparentChildrenData(oldP, newP); // Call data function
                 if (result.success) {
                     // Re-render affected columns after data update
                     result.affectedColumns.forEach(index => {
                         const colEl = getColumnElementByIndex(index);
                         if (colEl) renderColumnContent(colEl, index);
                     });
                     updateAllToolbarButtons(); // Update toolbars
                     data.saveProjectsData(); // Save changes
                 }
                 return result; // Return result for shortcut logic
            },
            focusCardTextarea: focusCardTextarea, // UI helper
            getCardElement: getCardElement, // UI helper
            getColumnCards: data.getColumnCards, // Data helper
            getChildCards: data.getChildCards, // Data helper
            getSiblingCards: data.getSiblingCards, // Data helper
            updateCardContent: (cardId, newContent) => { // Wrapper for update data + save
                if (data.updateCardContentData(cardId, newContent)) {
                    data.saveProjectsData();
                    // Update textarea value directly for immediate feedback
                    const cardEl = getCardElement(cardId);
                    const textarea = cardEl?.querySelector('textarea.card-content');
                    if (textarea) {
                        textarea.value = newContent;
                        autoResizeTextarea({ target: textarea });
                    }
                    // Update group header display after content update
                    updateGroupHeaderDisplay(cardId);
                }
            },
            renderColumnContent: renderColumnContent, // UI helper for re-rendering after merge/split
            getColumnElementByIndex: getColumnElementByIndex // UI helper
        };

        // Attach the single keydown listener using event delegation
        columnsContainer.addEventListener('keydown', (event) => {
            // Directly use the imported handler
            handleCardTextareaKeydown(event, shortcutHelpers);
        });

        console.log("App Initialized.");
    }

    // --- Start the application ---
    initializeApp();

}); // End DOMContentLoaded
