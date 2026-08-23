import * as data from './projectState.js';
import { initializeDragDrop } from './dragDrop.js';
import { aiService } from './aiService.js';
import { handleCardTextareaKeydown } from './cardShortcuts.js'; // Import the handler
import { createProjectTransfer } from './projectTransfer.js';
import { createEditorDom } from './editorDom.js';
import { createAiWorkflow } from './aiWorkflow.js';
import { createEditorView } from './editorView.js';

function createMoveCardHandler({ isBusy, moveCard, getRenderedColumnCount, renderApp, renderColumn, updateToolbars }) {
    return (cardId, targetColumn, targetParent, insertBefore) => {
        if (isBusy()) return { success: false, reason: 'AI action in progress' };

        const result = moveCard(cardId, targetColumn, targetParent, insertBefore);
        if (!result.success) return result;

        const affectedColumns = result.affectedColumns || [];
        const maxAffectedIndex = affectedColumns.length > 0 ? Math.max(...affectedColumns) : -1;
        if (maxAffectedIndex >= getRenderedColumnCount()) {
            renderApp();
        } else {
            affectedColumns.forEach(renderColumn);
        }
        updateToolbars();
        return result;
    };
}

function initializeEditorApp() {
    // --- DOM Elements ---
    const resizer = document.getElementById('resizer');
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
    const SIDEBAR_COLLAPSED_KEY = 'sidebarCollapsed';
    const STORAGE_KEY_ONBOARDING = 'onboardingComplete';
    const DEFAULT_ONBOARDING_PROJECT_URL = 'examples/new-onboarding.json'; // Relative path if served

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
    let aiWorkflow;
    const view = createEditorView({
        columnsContainer,
        projectListContainer,
        model: {
            minColumns: data.MIN_COLUMNS,
            getActiveProjectData: data.getActiveProjectData,
            getActiveProjectId: data.getActiveProjectId,
            getProjects: data.getProjects,
            getProject: data.getProject,
            getCard: data.getCard,
            getColumnCards: data.getColumnCards,
            getChildCards: data.getChildCards,
            getColumnData: data.getColumnData,
            getGlobalPromptData: data.getGlobalPromptData,
            getColorForCard: data.getColorForCard
        },
        actions: {
            addCard: handleAddCard,
            addChildCard: handleAddChildCard,
            deleteCard: handleDeleteCard,
            addColumn: handleAddColumn,
            deleteColumn: handleDeleteColumn,
            setColumnPrompt: handleSetColumnPrompt,
            setGlobalPrompt: handleSetGlobalPrompt,
            switchProject: handleSwitchProject,
            deleteProject: handleDeleteProject,
            exportProject: (projectId, event) => projectTransfer.handleExportProject(projectId, event),
            renameProject: data.updateProjectTitle,
            updateCardContent: data.updateCardContentData,
            renameCard: data.updateCardNameData,
            aiContinue: cardId => aiWorkflow.continue(cardId),
            aiExpand: cardId => aiWorkflow.expand(cardId),
            aiSummarize: cardId => aiWorkflow.summarize(cardId),
            aiBreakdown: cardId => aiWorkflow.breakdown(cardId),
            aiCustom: cardId => aiWorkflow.custom(cardId)
        },
        dom: {
            autoResizeTextarea,
            clearHighlights,
            focusCardTextarea,
            getCardElement,
            getColumnElementByIndex,
            getGroupElement,
            highlightHierarchy,
            scrollHierarchy,
            scrollIntoViewIfNeeded,
            updateGroupHeaderDisplay
        },
        isAiReady: aiService.areAiSettingsValid,
        cardNameMaxLength: CARD_NAME_MAX_LENGTH,
        groupHeaderPreviewLength: GROUP_HEADER_PREVIEW_LENGTH
    });
    const {
        renderApp,
        renderColumnContent,
        renderProjectList,
        updateAllToolbarButtons,
        updateToolbarButtons
    } = view;
    aiWorkflow = createAiWorkflow({
        projectState: data,
        aiService,
        columnsContainer,
        projectListContainer,
        addProjectButton: addProjectBtn,
        addCard: handleAddCard,
        deleteCard: handleDeleteCard,
        getCardElement,
        autoResizeTextarea,
        createModal,
        focusCardTextarea,
        updateGroupHeaderDisplay,
        updateAllToolbarButtons: view.updateAllToolbarButtons
    });


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

    function handleAddCard(columnIndex, parentId = null, initialContent = '', insertBeforeCardId = null, isAiPlaceholder = false) {
        const newCard = data.addCardData(columnIndex, parentId, initialContent, insertBeforeCardId);
        if (!newCard) return null;

        view.insertCard(newCard, {
            parentId,
            insertBeforeCardId,
            isAiPlaceholder
        });
        return newCard.id;
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

        if (aiWorkflow.isBusy()) {
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
            view.removeCardElements(deleteResult.deletedIds);

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
         if (aiWorkflow.isBusy()) {
             alert("Please wait for the current AI action to complete before adding columns.");
             return;
         }
         const newIndex = data.addColumnData();
         if (newIndex === -1) return;
         view.appendColumn(newIndex);
    }

    function handleDeleteColumn(columnIndex) {
        if (aiWorkflow.isBusy()) {
            alert("Please wait for the current AI action to complete before deleting columns.");
            return;
        }
        const projectTitle = data.getProject(data.getActiveProjectId())?.title;
        // Confirmation uses data layer checks via deleteColumnData
         if (!confirm(`Delete this empty column from project "${projectTitle}"?`)) return;

         if (data.deleteColumnData(columnIndex)) { // Use data function (checks conditions)
             view.removeColumn(columnIndex);
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
            updateAiFeatureVisibilityCallback: aiWorkflow.updateFeatureVisibility
        });

        // 3. Render UI based on loaded data
        renderProjectList();
        renderApp();

        // 4. Initialize Drag and Drop
        const dataHelpersForDragDrop = {
            getCard: data.getCard,
            moveCardData: createMoveCardHandler({
                isBusy: aiWorkflow.isBusy,
                moveCard: data.moveCardData,
                getRenderedColumnCount: () => columnsContainer.children.length,
                renderApp,
                renderColumn: index => {
                    const columnElement = getColumnElementByIndex(index);
                    if (columnElement) renderColumnContent(columnElement, index);
                },
                updateToolbars: updateAllToolbarButtons
            })
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

export { createMoveCardHandler, initializeEditorApp };
