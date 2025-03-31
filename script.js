document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('sidebar');
    const resizer = document.getElementById('resizer');
    const mainContent = document.getElementById('main-content');
    const columnsContainer = document.getElementById('columnsContainer');
    const addProjectBtn = document.getElementById('add-project-btn');
    const projectListContainer = document.getElementById('project-list');

    let projects = {}; // { projectId: { id, title, lastModified, data: { columns: [], cards: {} } } }
    let activeProjectId = null;
    let draggedCardId = null;
    let dragIndicator = null;

    const MIN_COLUMNS = 3;
    const BASE_COLOR_HUE = 200; // Starting Hue for first root card
    const HUE_ROTATION_STEP = 30; // Degrees to shift hue for each subsequent root card
    const BASE_COLOR_SATURATION = 60;
    const BASE_COLOR_LIGHTNESS = 90;
    const LIGHTNESS_STEP_DOWN = 5;
    const SATURATION_STEP_UP = 5;
    const GROUP_HEADER_PREVIEW_LENGTH = 60; // Max chars for content preview in group header
    const PROJECTS_STORAGE_KEY = 'writingToolProjects';
    const ACTIVE_PROJECT_ID_KEY = 'writingToolActiveProjectId';

    // --- Project Management ---

    function generateId(prefix = 'id_') {
        return prefix + Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
    }

    function createDefaultProject(title = "Untitled Project") {
        const projectId = generateId('proj_');
        const defaultColumns = [];
        for (let i = 0; i < MIN_COLUMNS; i++) {
            defaultColumns.push({ id: `col-${generateId()}` });
        }
        return {
            id: projectId,
            title: title,
            lastModified: Date.now(),
            data: {
                columns: defaultColumns,
                cards: {}
            }
        };
    }

    function addProject() {
        const title = prompt("Enter a title for the new project:", "New Project");
        if (title === null) return; // User cancelled
        const newTitle = title.trim() || "Untitled Project"; // Use default if empty after trimming

        const newProject = createDefaultProject(newTitle);
        projects[newProject.id] = newProject;
        switchProject(newProject.id); // Will also save
        renderProjectList(); // Update sidebar list
    }

    function deleteProject(projectIdToDelete) {
        if (!projects[projectIdToDelete]) return;
        const projectTitle = projects[projectIdToDelete].title;

        if (!confirm(`Are you sure you want to delete the project "${projectTitle}" and all its content? This cannot be undone.`)) {
            return;
        }

        const isDeletingActive = activeProjectId === projectIdToDelete;
        delete projects[projectIdToDelete];

        if (isDeletingActive) {
            // Find the next project to activate (most recently modified)
            const remainingProjects = Object.values(projects).sort((a, b) => b.lastModified - a.lastModified);
            if (remainingProjects.length > 0) {
                activeProjectId = remainingProjects[0].id;
            } else {
                // No projects left, create a new default one
                const defaultProject = createDefaultProject();
                projects[defaultProject.id] = defaultProject;
                activeProjectId = defaultProject.id;
            }
        }
        // If not deleting active, activeProjectId remains the same

        saveProjectsData(); // Save deletion and potentially new active ID
        renderProjectList(); // Update sidebar

        // If the active project was deleted, load the new active one
        if (isDeletingActive) {
            loadActiveProjectData();
            renderApp();
        }
    }

    function switchProject(newProjectId) {
        if (!projects[newProjectId] || newProjectId === activeProjectId) {
            return; // Project doesn't exist or already active
        }

        activeProjectId = newProjectId;
        saveActiveProjectId(); // Persist the active project choice
        loadActiveProjectData(); // Load the new project's data into the working state
        renderApp(); // Render the main view for the new project
        renderProjectList(); // Update sidebar highlighting
        console.log(`Switched to project: ${projects[activeProjectId].title} (${activeProjectId})`);
    }

    function updateProjectLastModified(projectId = activeProjectId) {
        if (projectId && projects[projectId]) {
            projects[projectId].lastModified = Date.now();
            // No need to re-sort immediately unless the UI needs it *now*.
            // saveProjectsData will save the new timestamp.
            // renderProjectList will sort when it runs.
        }
    }

    // --- Data Persistence ---

    // Gets the data object for the *currently active* project
    function getActiveProjectData() {
        if (!activeProjectId || !projects[activeProjectId]) {
            console.error("Attempting to get data for invalid or inactive project.");
            // Fallback to a safe empty structure to prevent errors down the line
            return { columns: [], cards: {} };
        }
        return projects[activeProjectId].data;
    }

    // Saves the entire projects object to localStorage
    function saveProjectsData() {
        try {
            localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
        } catch (e) {
            console.error("Error saving projects data to localStorage:", e);
            alert("Could not save project data. LocalStorage might be full or disabled.");
        }
    }

    // Saves only the ID of the currently active project
    function saveActiveProjectId() {
        if (activeProjectId) {
            localStorage.setItem(ACTIVE_PROJECT_ID_KEY, activeProjectId);
        } else {
            localStorage.removeItem(ACTIVE_PROJECT_ID_KEY);
        }
    }

    function loadProjectsData() {
        const savedProjects = localStorage.getItem(PROJECTS_STORAGE_KEY);
        const savedActiveId = localStorage.getItem(ACTIVE_PROJECT_ID_KEY);

        if (savedProjects) {
            try {
                const parsedProjects = JSON.parse(savedProjects);
                // Basic validation
                if (parsedProjects && typeof parsedProjects === 'object' && !Array.isArray(parsedProjects)) {
                     // Further validation for each project could be added here
                     projects = parsedProjects;
                     console.log("Projects loaded from localStorage.");
                } else {
                    throw new Error("Invalid project data structure");
                }

                // Determine active project
                if (savedActiveId && projects[savedActiveId]) {
                    activeProjectId = savedActiveId;
                } else {
                    // If saved ID is invalid or missing, find the most recently modified
                    const sortedProjects = Object.values(projects).sort((a, b) => b.lastModified - a.lastModified);
                    if (sortedProjects.length > 0) {
                        activeProjectId = sortedProjects[0].id;
                    }
                }

            } catch (e) {
                console.error("Error parsing projects data from localStorage:", e);
                alert("Could not load saved project data. Resetting.");
                localStorage.removeItem(PROJECTS_STORAGE_KEY);
                localStorage.removeItem(ACTIVE_PROJECT_ID_KEY);
                projects = {}; // Reset
            }
        }

        // If no projects loaded or exist after parsing attempt
        if (Object.keys(projects).length === 0) {
            console.log("No projects found or loaded, creating default project.");
            const defaultProject = createDefaultProject();
            projects[defaultProject.id] = defaultProject;
            activeProjectId = defaultProject.id;
            saveProjectsData(); // Save the new default project
            saveActiveProjectId();
        } else if (!activeProjectId) {
            // If projects exist but no active ID could be determined (shouldn't happen often)
            const sortedProjects = Object.values(projects).sort((a, b) => b.lastModified - a.lastModified);
             activeProjectId = sortedProjects[0].id;
             saveActiveProjectId();
        }

        // Ensure all loaded projects have valid data structure and colors calculated
        Object.values(projects).forEach(proj => {
             if (!proj.data || !proj.data.columns || !proj.data.cards) {
                  console.warn(`Project ${proj.id} has missing data structure, resetting it.`);
                  const defaultData = createDefaultProject().data;
                  proj.data = defaultData;
             }
             // Recalculate colors on load
             Object.values(proj.data.cards).forEach(card => delete card.color);
             Object.values(proj.data.cards).forEach(card => card.color = getColorForCard(card, proj.data)); // Pass project data
             // Ensure order exists
              Object.values(proj.data.cards).forEach(card => {
                   if (card.order === undefined) card.order = Date.now() + Math.random();
              });
        });


        console.log(`Initial active project: ${projects[activeProjectId]?.title} (${activeProjectId})`);
        loadActiveProjectData(); // Load the data for the determined active project
    }

    // Loads the active project's data into the working state (if needed, but currently we modify directly)
    function loadActiveProjectData() {
        if (!activeProjectId || !projects[activeProjectId]) {
            console.error("Cannot load data: Active project ID is invalid.");
            // Optionally, reset to a default state or try to find another project
            return;
        }
        // In the current setup, getActiveProjectData() gives direct access,
        // so there's no separate 'appData' to load *into*.
        // This function primarily ensures the activeProjectId is valid before proceeding.
        console.log(`Loaded data for project: ${projects[activeProjectId].title}`);
    }


    // --- Project Sidebar Rendering & Interactions ---

    function renderProjectList() {
        projectListContainer.innerHTML = ''; // Clear existing list
        const sortedProjects = Object.values(projects).sort((a, b) => b.lastModified - a.lastModified);

        sortedProjects.forEach(project => {
            const item = document.createElement('div');
            item.className = 'project-item';
            item.dataset.projectId = project.id;
            if (project.id === activeProjectId) {
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
                // Prevent switch if clicking on buttons or editing title
                if (!e.target.closest('button') && !e.target.closest('.project-title-input')) {
                    switchProject(project.id);
                }
            });

            // Title Editing
            const titleSpan = item.querySelector('.project-title');
            titleSpan.addEventListener('dblclick', () => makeProjectTitleEditable(project.id, item));

            // Action Buttons
            item.querySelector('.export-project-btn').addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent project switch
                exportProject(project.id);
            });
            item.querySelector('.delete-project-btn').addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent project switch
                deleteProject(project.id);
            });

            projectListContainer.appendChild(item);
        });
    }

     function makeProjectTitleEditable(projectId, projectItemElement) {
        const titleSpan = projectItemElement.querySelector('.project-title');
        const currentTitle = projects[projectId].title;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentTitle;
        input.className = 'project-title-input';

        titleSpan.replaceWith(input);
        input.focus();
        input.select();

        const finishEditing = (saveChanges) => {
            const newTitle = input.value.trim();
            if (saveChanges && newTitle && newTitle !== currentTitle) {
                projects[projectId].title = newTitle;
                updateProjectLastModified(projectId);
                saveProjectsData(); // Save the change
                 // Update the span content before replacing
                 titleSpan.textContent = newTitle;
                 titleSpan.title = newTitle; // Update tooltip
            } else {
                // Restore original if cancelled or empty
                titleSpan.textContent = currentTitle;
            }
            input.replaceWith(titleSpan); // Put the span back
            // No need to call renderProjectList unless order changed,
            // but we do need to save if title changed.
        };

        input.addEventListener('blur', () => finishEditing(true));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                finishEditing(true);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                finishEditing(false);
            }
        });
    }

    function exportProject(projectId) {
        const project = projects[projectId];
        if (!project) return;

        let content = '';
        const projectData = project.data;

        function traverse(cardId) {
            const card = projectData.cards[cardId];
            if (!card) return;

            // Add current card's content if not empty
            const cardContent = card.content?.trim();
            if (cardContent) {
                content += cardContent + '\n\n'; // Add two newlines between cards
            }

            // Find children in the next column, sorted by order
            const children = Object.values(projectData.cards)
                .filter(c => c.parentId === cardId && c.columnIndex === card.columnIndex + 1)
                .sort((a, b) => a.order - b.order);

            // Recursively traverse children
            children.forEach(child => traverse(child.id));
        }

        // Start traversal from root cards (column 0, no parent), sorted by order
        const rootCards = Object.values(projectData.cards)
            .filter(card => card.columnIndex === 0 && !card.parentId)
            .sort((a, b) => a.order - b.order);

        rootCards.forEach(rootCard => traverse(rootCard.id));

        // Create and download the file
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

    // --- Core Card/Column Logic (Adapted for Active Project) ---

    // Helper to get card from the active project
    function getCard(id) {
        const projectData = getActiveProjectData();
        return projectData.cards[id];
    }

    // Helper to get column index (no change needed)
    function getColumnIndex(columnElement) {
        if (!columnElement) return -1;
        return Array.from(columnsContainer.children).indexOf(columnElement);
    }

    // Helper to get root cards for the active project's column
    function getColumnCards(columnIndex) {
        const projectData = getActiveProjectData();
        return Object.values(projectData.cards)
               .filter(card => card.columnIndex === columnIndex && !card.parentId)
               .sort((a, b) => a.order - b.order);
    }

    // Helper to get child cards for the active project
    function getChildCards(parentId, targetColumnIndex = null) {
        const projectData = getActiveProjectData();
        let children = Object.values(projectData.cards)
                         .filter(card => card.parentId === parentId);
        if (targetColumnIndex !== null) {
            children = children.filter(card => card.columnIndex === targetColumnIndex);
        }
        return children.sort((a, b) => a.order - b.order);
    }

    // Helper to get descendant IDs for the active project
     function getDescendantIds(cardId) {
         const projectData = getActiveProjectData();
         let descendants = [];
         const directChildren = Object.values(projectData.cards).filter(card => card.parentId === cardId);
         directChildren.forEach(child => {
             descendants.push(child.id);
             descendants = descendants.concat(getDescendantIds(child.id)); // Recursive call uses the same active project context
         });
         return descendants;
     }

     // Helper to get ancestor IDs for the active project
     function getAncestorIds(cardId) {
         const projectData = getActiveProjectData();
         let ancestors = [];
         let currentCard = projectData.cards[cardId]; // Use projectData
         while (currentCard && currentCard.parentId) {
             ancestors.push(currentCard.parentId);
             currentCard = projectData.cards[currentCard.parentId]; // Use projectData
         }
         return ancestors;
     }

    // --- Color Calculation (Adapted) ---
    // Now requires projectData to access relevant cards for calculation
    function getColorForCard(card, projectData = getActiveProjectData()) {
        if (!card) return `hsl(${BASE_COLOR_HUE}, ${BASE_COLOR_SATURATION}%, ${BASE_COLOR_LIGHTNESS}%)`;

        const getCards = (colIdx) => Object.values(projectData.cards)
            .filter(c => c.columnIndex === colIdx && !c.parentId)
            .sort((a, b) => a.order - b.order);
        const getParent = (pId) => projectData.cards[pId];

        if (card.columnIndex === 0 && !card.parentId) { // Root Card
            const rootCards = getCards(0);
            const rootIndex = rootCards.findIndex(c => c.id === card.id);
            const hue = (BASE_COLOR_HUE + (rootIndex >= 0 ? rootIndex : 0) * HUE_ROTATION_STEP) % 360;
            return `hsl(${hue}, ${BASE_COLOR_SATURATION}%, ${BASE_COLOR_LIGHTNESS}%)`;

        } else if (card.parentId) { // Child Card
            const parentCard = getParent(card.parentId);
            if (!parentCard) {
                 console.warn(`Parent card ${card.parentId} not found for card ${card.id}. Using default color.`);
                 return `hsl(${BASE_COLOR_HUE}, ${BASE_COLOR_SATURATION}%, ${BASE_COLOR_LIGHTNESS - LIGHTNESS_STEP_DOWN}%)`;
            }

            // Ensure parent color is calculated if missing (pass projectData down)
            const parentColor = parentCard.color || getColorForCard(parentCard, projectData);

            try {
                const match = parentColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
                if (match) {
                    let [, h, s, l] = match.map(Number);
                    const newLightness = Math.max(15, l - LIGHTNESS_STEP_DOWN);
                    const newSaturation = Math.min(100, s + SATURATION_STEP_UP);
                    return `hsl(${h}, ${newSaturation}%, ${newLightness}%)`;
                } else {
                     console.warn(`Could not parse parent color ${parentColor}. Using fallback.`);
                     let level = getCardDepth(card.id, projectData);
                     const lightness = Math.max(15, BASE_COLOR_LIGHTNESS - (level * LIGHTNESS_STEP_DOWN));
                     const saturation = Math.min(100, BASE_COLOR_SATURATION + (level * SATURATION_STEP_UP));
                     return `hsl(${BASE_COLOR_HUE}, ${saturation}%, ${lightness}%)`;
                }
            } catch (e) {
                 console.error("Error processing parent color:", e);
                 let level = getCardDepth(card.id, projectData);
                 const lightness = Math.max(15, BASE_COLOR_LIGHTNESS - (level * LIGHTNESS_STEP_DOWN));
                 const saturation = Math.min(100, BASE_COLOR_SATURATION + (level * SATURATION_STEP_UP));
                 return `hsl(${BASE_COLOR_HUE}, ${saturation}%, ${lightness}%)`;
            }
        } else {
             console.warn(`Card ${card.id} in column ${card.columnIndex} has no parent. Using default.`);
             return `hsl(${BASE_COLOR_HUE}, ${BASE_COLOR_SATURATION}%, ${BASE_COLOR_LIGHTNESS}%)`;
        }
    }

    // Helper to get card depth (Adapted)
    function getCardDepth(cardId, projectData = getActiveProjectData()) {
         let level = 0;
         let currentCard = projectData.cards[cardId];
         while (currentCard && currentCard.parentId) {
             level++;
             currentCard = projectData.cards[currentCard.parentId];
         }
         return level;
    }

    // No change needed for getHighlightColor
    function getHighlightColor(baseColor) {
        try {
            const match = baseColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
            if (match) {
                const [, h, s, l] = match.map(Number);
                const highlightL = Math.max(10, l - 5);
                const highlightS = Math.min(100, s + 5);
                return `hsl(${h}, ${highlightS}%, ${highlightL}%)`;
            }
        } catch (e) { console.warn("Could not parse color for highlight:", baseColor); }
        return 'rgba(0, 0, 0, 0.15)';
    }

    // --- DOM Manipulation & Rendering (Adapted for Active Project) ---

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

    // REVISED: Create Card Element - Uses active project context for color
    function createCardElement(card) {
        const cardEl = document.createElement('div');
        cardEl.id = `card-${card.id}`;
        cardEl.className = 'card';
        cardEl.dataset.cardId = card.id;

        // Ensure color is calculated based on the *active* project's data
        card.color = card.color || getColorForCard(card); // getColorForCard uses getActiveProjectData by default
        cardEl.style.backgroundColor = card.color;

        // Display name or ID
        const displayName = card.name ? card.name : `#${card.id.slice(-4)}`;
        const truncatedDisplayName = displayName.length > 50 ? displayName.substring(0, 50) + '...' : displayName;

        cardEl.innerHTML = `
            <div class="card-header" draggable="true">
                <span class="card-name-display" title="${displayName}">${truncatedDisplayName}</span>
                <div class="card-actions">
                    <button class="add-child-btn" title="Add Child Card">+</button>
                    <button class="delete-card-btn" title="Delete Card">×</button>
                </div>
            </div>
            <textarea class="card-content" placeholder="Enter text...">${card.content || ''}</textarea>
        `;

        const headerEl = cardEl.querySelector('.card-header');
        const textarea = cardEl.querySelector('.card-content');
        const nameDisplaySpan = cardEl.querySelector('.card-name-display');

        headerEl.addEventListener('dragstart', handleDragStart);
        headerEl.addEventListener('dragend', handleDragEnd);

        // Add double-click listener for editing name
        nameDisplaySpan.addEventListener('dblclick', () => makeCardNameEditable(card.id, cardEl));

        cardEl.addEventListener('dragenter', (e) => {
             if (e.target.closest('.card') === cardEl) e.stopPropagation();
             handleDragEnter(e);
        });
        cardEl.addEventListener('dragleave', handleDragLeave);

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

    // REVISED: Create Group Element - Uses active project context
    function createGroupElement(parentId) {
        const parentCard = getCard(parentId); // Uses active project data
        if (!parentCard) return null;

        const groupEl = document.createElement('div');
        let groupHeaderText = '';
        let groupHeaderTitle = '';

        if (parentCard.name) {
            // Parent has a name: Use the name
            const truncatedParentName = parentCard.name.length > 50 ? parentCard.name.substring(0, 50) + '...' : parentCard.name;
            groupHeaderText = `>> ${truncatedParentName}`;
            groupHeaderTitle = `Children of ${parentCard.name}`;
         } else {
             // Parent has no name: Use ID + Content Preview
             const idPart = `#${parentId.slice(-4)}`;
             const contentPreview = parentCard.content?.trim().substring(0, GROUP_HEADER_PREVIEW_LENGTH) || '';
             const ellipsis = (parentCard.content?.trim().length || 0) > GROUP_HEADER_PREVIEW_LENGTH ? '...' : '';
             const previewText = contentPreview ? `: ${contentPreview}${ellipsis}` : '';
             groupHeaderText = `>> ${idPart}${previewText}`;
            // Tooltip shows ID and full content if previewed, otherwise just ID
            groupHeaderTitle = `Children of ${idPart}${contentPreview ? `: ${parentCard.content?.trim()}` : ''}`;
        }


        groupEl.id = `group-${parentId}`;
        groupEl.className = 'card-group';
        groupEl.dataset.parentId = parentId;

        groupEl.innerHTML = `
            <div class="group-header" title="${groupHeaderTitle}">${groupHeaderText}</div>
        `;

        groupEl.addEventListener('dragover', handleDragOver);
        groupEl.addEventListener('dragenter', handleDragEnter);
        groupEl.addEventListener('dragleave', handleDragLeave);
        groupEl.addEventListener('drop', handleDrop);

        // Add double-click listener to create a child card
        groupEl.addEventListener('dblclick', (e) => {
            // Only trigger if the click is not on a card within the group
            if (e.target.closest('.card')) {
                return; // Click was on a card, do nothing
            }
            e.stopPropagation(); // Prevent triggering column dblclick if nested

            const parentId = groupEl.dataset.parentId;
            const columnEl = groupEl.closest('.column');
            if (parentId && columnEl) {
                const columnIndex = parseInt(columnEl.dataset.columnIndex, 10);
                if (!isNaN(columnIndex)) {
                    console.log(`Double-click on group ${parentId}, adding card to column ${columnIndex}`);
                    addCard(columnIndex, parentId); // Add child card to this group's column
                } else {
                    console.error("Could not determine column index for group double-click.");
                }
            } else {
                console.error("Could not find parentId or column element for group double-click.");
            }
        });

        return groupEl;
    }

    // REVISED: Create Column Element - Uses active project context for handlers
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

        columnEl.querySelector('.add-card-btn').addEventListener('click', () => addCard(columnIndex, null)); // addCard uses active project
        columnEl.querySelector('.add-column-btn').addEventListener('click', addColumn); // addColumn uses active project
        columnEl.querySelector('.delete-column-btn').addEventListener('click', () => deleteColumn(columnIndex)); // deleteColumn uses active project

        cardsContainer.addEventListener('dblclick', (e) => {
             if (e.target === cardsContainer && columnIndex === 0) {
                 addCard(columnIndex, null); // addCard uses active project
             }
        });

        cardsContainer.addEventListener('dragover', handleDragOver);
        cardsContainer.addEventListener('dragenter', handleDragEnter);
        cardsContainer.addEventListener('dragleave', handleDragLeave);
        cardsContainer.addEventListener('drop', handleDrop); // handleDrop uses active project

        return columnEl;
    }

    // REVISED: Render Column Content - Uses active project data
    function renderColumnContent(columnEl, columnIndex) {
        const cardsContainer = columnEl.querySelector('.cards-container');
        cardsContainer.innerHTML = '';
        const projectData = getActiveProjectData();

        // Render Groups first
        if (columnIndex > 0) {
            const potentialParentCards = Object.values(projectData.cards)
                .filter(card => card.columnIndex === columnIndex - 1)
                .sort((a, b) => a.order - b.order);

            potentialParentCards.forEach(parentCard => {
                 const groupEl = createGroupElement(parentCard.id); // Uses active project context
                 if (!groupEl) return;

                 const childCards = getChildCards(parentCard.id, columnIndex); // Uses active project

                 childCards.forEach(childCard => {
                     const cardEl = createCardElement(childCard); // Uses active project context for color
                     groupEl.appendChild(cardEl);
                 });
                 cardsContainer.appendChild(groupEl);
            });
        }

        // Render Root Cards for this column
        const rootCardsInColumn = getColumnCards(columnIndex); // Uses active project

        rootCardsInColumn.forEach(card => {
            const cardEl = createCardElement(card); // Uses active project context for color
            cardsContainer.appendChild(cardEl);
        });

        updateToolbarButtons(columnEl, columnIndex); // Uses active project data implicitly
    }

    // REVISED: Render App - Renders the active project
    function renderApp() {
        columnsContainer.innerHTML = '';
        const projectData = getActiveProjectData();

        if (!projectData) {
            console.error("Cannot render app: No active project data found.");
            // Handle this case - maybe show an error message or default screen
             columnsContainer.innerHTML = '<p style="padding: 20px; text-align: center;">Error: No project selected or project data is corrupted.</p>';
             return;
        }

        let maxColumnIndex = MIN_COLUMNS - 1;
        Object.values(projectData.cards).forEach(card => {
             maxColumnIndex = Math.max(maxColumnIndex, card.columnIndex);
        });

        // Ensure the project's column array has enough entries
        while (projectData.columns.length <= maxColumnIndex) {
             // Use addColumnInternal which now works on the active project
             addColumnInternal(false); // Don't save immediately, renderApp conclusion will trigger save
        }

        const columnsToRenderCount = Math.max(MIN_COLUMNS, projectData.columns.length);

        for (let i = 0; i < columnsToRenderCount; i++) {
             const columnEl = createColumnElement(i); // Uses active project context for handlers
             columnsContainer.appendChild(columnEl);
             renderColumnContent(columnEl, i); // Uses active project data
        }

        updateAllToolbarButtons(); // Uses active project data implicitly
        console.log(`App rendered for project: ${projects[activeProjectId]?.title}`);
    }

    // REVISED: Update Toolbar Buttons - Uses active project data
    function updateToolbarButtons(columnEl, columnIndex) {
         const addCardBtn = columnEl.querySelector('.add-card-btn');
         const addColBtn = columnEl.querySelector('.add-column-btn');
         const delColBtn = columnEl.querySelector('.delete-column-btn');
         const numColumns = columnsContainer.children.length; // Based on current DOM
         const isRightmost = columnIndex === numColumns - 1;
         const projectData = getActiveProjectData();

         addCardBtn.classList.toggle('hidden', columnIndex !== 0);
         addColBtn.classList.toggle('hidden', !isRightmost);

         const columnCards = Object.values(projectData.cards).filter(card => card.columnIndex === columnIndex);
         // Use projectData.columns.length for minimum check
         const canDelete = isRightmost && projectData.columns.length > MIN_COLUMNS && columnCards.length === 0;
         delColBtn.classList.toggle('hidden', !canDelete);
         delColBtn.disabled = !canDelete;
    }

    // No change needed for autoResizeTextarea
    function autoResizeTextarea(event) {
        const textarea = event.target;
        textarea.style.height = 'auto';
        // Use computed height to avoid jumps if scrollHeight is temporarily large
        const computedHeight = window.getComputedStyle(textarea).height;
        textarea.style.height = computedHeight; // Set explicit height before recalculating
        textarea.style.height = `${Math.min(textarea.scrollHeight, 500)}px`; // 500px max height
    }

    // --- Event Handlers (Adapted for Active Project where necessary) ---

    // REVISED: handleTextareaBlur - Saves to active project
    function handleTextareaBlur(event) {
        const textarea = event.target;
        const cardEl = textarea.closest('.card');
        if (!cardEl) return;
        const cardId = cardEl.dataset.cardId;
        const card = getCard(cardId); // Uses active project data

        if (card && card.content !== textarea.value) {
            card.content = textarea.value;
            updateProjectLastModified(); // Mark project as modified
            saveProjectsData(); // Save all project data (includes the modification)
            console.log(`Card ${cardId} content saved in project ${activeProjectId}.`);
        }
        cardEl.classList.remove('editing');
        clearHighlights();
    }

    // REVISED: handleTextareaFocus - Uses active project data for highlighting
    function handleTextareaFocus(event) {
         const textarea = event.target;
         const cardEl = textarea.closest('.card');
         const cardId = cardEl.dataset.cardId;

         cardEl.classList.add('editing');
         highlightHierarchy(cardId); // Uses active project data implicitly
    }

    // REVISED: highlightHierarchy - Uses active project data
    function highlightHierarchy(cardId) {
        clearHighlights(); // Clear previous highlights first
        const projectData = getActiveProjectData();

        const targetCard = projectData.cards[cardId];
        if (!targetCard) return;

        const ancestors = getAncestorIds(cardId); // Uses active project data
        const descendants = getDescendantIds(cardId); // Uses active project data
        const allToHighlight = [cardId, ...ancestors, ...descendants];

        allToHighlight.forEach(id => {
            const cardEl = getCardElement(id);
            const cardData = projectData.cards[id]; // Get data from active project

            if (cardEl && cardData) {
                cardEl.classList.add('highlight');
                let baseColor = cardData.color;
                if (!baseColor) {
                    baseColor = getColorForCard(cardData); // Recalculate using active project context
                    cardData.color = baseColor; // Store the calculated color
                }
                const highlightBg = getHighlightColor(baseColor);
                cardEl.style.backgroundColor = highlightBg;
            }

            const groupEl = getGroupElement(id);
            if (groupEl) {
                groupEl.classList.add('highlight');
            }
        });
    }

    // REVISED: clearHighlights - Uses active project data
    function clearHighlights() {
        document.querySelectorAll('.card.highlight, .card.editing, .card-group.highlight').forEach(el => {
            el.classList.remove('highlight', 'editing');
            if (el.classList.contains('card')) {
                const cardId = el.dataset.cardId;
                const card = getCard(cardId); // Uses active project data
                if(card && card.color) {
                    el.style.backgroundColor = card.color;
                } else if (card) {
                    el.style.backgroundColor = getColorForCard(card); // Recalculate
                } else {
                    el.style.backgroundColor = ''; // Fallback
                }
            }
        });
    }

    // Drag handlers (handleDragStart, handleDragEnd, handleDragOver, handleDragEnter, handleDragLeave, handleDrop, clearDragStyles)
    // generally don't need direct project data access during the drag itself, as they operate on the DOM elements
    // created by renderApp for the *active* project. The drop handler will use project-aware functions (getCard, moveCard)
    // when the drop occurs.

    // --- Drag & Drop Handlers (Mostly Unchanged Logic, Context is Active Project) ---
    function handleDragStart(event) {
        if (event.target.tagName === 'BUTTON' || event.target.closest('button')) {
            event.preventDefault(); return;
        }
        const headerEl = event.target.closest('.card-header');
        const cardEl = headerEl ? headerEl.closest('.card') : null;
        if (!cardEl) { event.preventDefault(); return; }

        draggedCardId = cardEl.dataset.cardId;
        // Check if the card actually exists in the current project before proceeding
        if (!getCard(draggedCardId)) {
             console.warn(`DragStart aborted: Card ${draggedCardId} not found in active project.`);
             event.preventDefault();
             draggedCardId = null;
             return;
        }

        event.dataTransfer.setData('text/plain', draggedCardId);
        event.dataTransfer.effectAllowed = 'move';
        requestAnimationFrame(() => cardEl.classList.add('dragging'));
        if (!dragIndicator) {
            dragIndicator = document.createElement('div');
            dragIndicator.className = 'drag-over-indicator';
            dragIndicator.style.display = 'none';
            document.body.appendChild(dragIndicator);
        }
        console.log(`Drag Start: ${draggedCardId} (Project: ${activeProjectId})`);
    }

    function handleDragEnd(event) {
        if (draggedCardId) {
            const cardEl = getCardElement(draggedCardId);
            if (cardEl) cardEl.classList.remove('dragging');
        }
        clearDragStyles();
        draggedCardId = null;
        console.log("Drag End");
    }

    function handleDragOver(event) {
        event.preventDefault();
        if (!draggedCardId) return; // Ensure a drag is in progress *within this project*

        event.dataTransfer.dropEffect = 'move';

        const targetElement = event.target;
        const targetCard = targetElement.closest('.card');
        const targetGroup = targetElement.closest('.card-group');
        const targetCardsContainer = targetElement.closest('.cards-container');

        clearDragStyles(false); // Don't remove indicator instance yet

        let validDropTarget = false;
        let indicatorParent = null;
        let indicatorNextSibling = null;

        // Constraints (using active project context via getCard)
        if (targetCard && targetCard.dataset.cardId === draggedCardId) {
             validDropTarget = false;
             if (dragIndicator) dragIndicator.style.display = 'none';
        }
        else if (targetCard) {
            const rect = targetCard.getBoundingClientRect();
            const midway = rect.top + rect.height / 2;
            const parentContainer = targetCard.parentNode;
            targetCard.classList.add('drag-over-card');
            indicatorParent = parentContainer;
            indicatorNextSibling = (event.clientY < midway) ? targetCard : targetCard.nextSibling;
            validDropTarget = true;
        } else if (targetGroup) {
            const groupParentId = targetGroup.dataset.parentId;
            if (groupParentId === draggedCardId) { // Cannot drop into own descendants group
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
                     if (dist < smallestDistance) { smallestDistance = dist; closestCard = card; }
                 });
                 if (closestCard) {
                      const rect = closestCard.getBoundingClientRect();
                      indicatorParent = targetGroup;
                      indicatorNextSibling = (event.clientY < rect.top + rect.height / 2) ? closestCard : closestCard.nextSibling;
                 } else {
                      const header = targetGroup.querySelector('.group-header');
                      indicatorParent = targetGroup;
                      indicatorNextSibling = header ? header.nextSibling : targetGroup.firstChild; // Insert at top if empty
                 }
            }
        } else if (targetCardsContainer) {
            const columnEl = targetCardsContainer.closest('.column');
            const columnIndex = getColumnIndex(columnEl);
            const draggedCardData = getCard(draggedCardId); // Get data for check
            const draggedCardIsRoot = draggedCardData && !draggedCardData.parentId;

            // Allow dropping as root card only in first column OR if moving an existing root card between columns
            if (draggedCardData && (columnIndex === 0 || draggedCardIsRoot)) {
                 targetCardsContainer.classList.add('drag-over-empty');
                 validDropTarget = true;
                 const children = Array.from(targetCardsContainer.children).filter(el => el.matches('.card, .card-group'));
                 let closestElement = null;
                 let smallestDistance = Infinity;
                 children.forEach(el => {
                     if(el.dataset.cardId === draggedCardId || el.dataset.parentId === draggedCardId) return; // Skip self or own group
                     const rect = el.getBoundingClientRect();
                     const dist = Math.abs(event.clientY - (rect.top + rect.height / 2));
                     if (dist < smallestDistance) { smallestDistance = dist; closestElement = el; }
                 });
                 if (closestElement) {
                     const rect = closestElement.getBoundingClientRect();
                     indicatorParent = targetCardsContainer;
                     indicatorNextSibling = (event.clientY < rect.top + rect.height / 2) ? closestElement : closestElement.nextSibling;
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
             if(indicatorNextSibling) indicatorParent.insertBefore(dragIndicator, indicatorNextSibling);
             else indicatorParent.appendChild(dragIndicator);
             dragIndicator.style.display = 'block';
        } else {
             if(dragIndicator) dragIndicator.style.display = 'none';
        }
    }

    function handleDragEnter(event) {
        event.preventDefault();
        event.stopPropagation();
        if (!draggedCardId) return; // Ignore if not dragging

        const targetGroup = event.target.closest('.card-group');
        const targetCardsContainer = event.target.closest('.cards-container');
        const targetCard = event.target.closest('.card');

        if (targetCard && targetCard.dataset.cardId === draggedCardId) return;
        if (targetGroup && targetGroup.dataset.parentId === draggedCardId) return;

         if (targetGroup) targetGroup.classList.add('drag-over-group');
         else if (targetCardsContainer) targetCardsContainer.classList.add('drag-over-empty');
         else if (targetCard) targetCard.classList.add('drag-over-card');
    }

    function handleDragLeave(event) {
         event.stopPropagation();
         if (!draggedCardId) return;

        const relatedTarget = event.relatedTarget;
        const currentTarget = event.currentTarget;
        const leavingValidTarget = currentTarget.matches('.card, .card-group, .cards-container');

        if (leavingValidTarget && (!relatedTarget || !currentTarget.contains(relatedTarget))) {
             currentTarget.classList.remove('drag-over-card', 'drag-over-group', 'drag-over-empty');
              if (dragIndicator && dragIndicator.parentNode === currentTarget && !currentTarget.contains(relatedTarget)) {
                   dragIndicator.style.display = 'none';
              }
        }
         if (currentTarget.matches('.cards-container, .card-group')) {
            if (!currentTarget.contains(relatedTarget)) {
                currentTarget.querySelectorAll('.drag-over-card, .drag-over-group, .drag-over-empty')
                    .forEach(el => el.classList.remove('drag-over-card', 'drag-over-group', 'drag-over-empty'));
            }
         }
    }

    // REVISED: handleDrop - Uses active project context via moveCard
    function handleDrop(event) {
        event.preventDefault();
        event.stopPropagation();
        console.log("Drop event fired");

        const droppedCardId = event.dataTransfer.getData('text/plain');
        if (!droppedCardId || !draggedCardId || droppedCardId !== draggedCardId) {
            console.warn("Drop aborted: Mismatched or missing card ID.");
            clearDragStyles(); draggedCardId = null; return;
        }
        const droppedCard = getCard(droppedCardId); // Check in active project
        if (!droppedCard) {
             console.error("Drop aborted: Dragged card data not found in active project.");
             clearDragStyles(); draggedCardId = null; return;
        }
        if (!dragIndicator || dragIndicator.style.display === 'none' || !dragIndicator.parentNode) {
            console.warn("Drop aborted: No valid drop indicator position.");
            clearDragStyles(); draggedCardId = null; return;
        }

        const indicatorParent = dragIndicator.parentNode;
        const insertBeforeElement = dragIndicator.nextElementSibling;

        let targetColumnIndex = -1;
        let newParentId = null;
        let insertBeforeCardId = null;

        const targetColumnEl = indicatorParent.closest('.column');
        if (!targetColumnEl) {
             console.warn("Drop aborted: Indicator not within a column.");
             clearDragStyles(); draggedCardId = null; return;
        }
        targetColumnIndex = getColumnIndex(targetColumnEl);

        if (indicatorParent.classList.contains('card-group')) {
             newParentId = indicatorParent.dataset.parentId;
             if (newParentId === droppedCardId) {
                 console.warn("Drop aborted: Cannot drop into own child group (final check).");
                 clearDragStyles(); draggedCardId = null; return;
             }
        } else if (indicatorParent.classList.contains('cards-container')) {
            newParentId = null;
            const draggedCardIsRoot = !droppedCard.parentId;
            if(targetColumnIndex > 0 && !draggedCardIsRoot) {
                 console.warn(`Drop aborted: Cannot drop non-root card into empty space of column ${targetColumnIndex}.`);
                 clearDragStyles(); draggedCardId = null; return;
            }
        } else {
            console.warn("Drop aborted: Indicator parent is not group or container.", indicatorParent);
            clearDragStyles(); draggedCardId = null; return;
        }

        if (insertBeforeElement && insertBeforeElement.classList.contains('card')) {
            insertBeforeCardId = insertBeforeElement.dataset.cardId;
        } else if (insertBeforeElement && insertBeforeElement.classList.contains('card-group')) {
             const firstCardInGroup = insertBeforeElement.querySelector('.card');
             insertBeforeCardId = firstCardInGroup ? firstCardInGroup.dataset.cardId : null;
        } else {
             insertBeforeCardId = null; // Append
        }

        if (insertBeforeCardId === droppedCardId) {
             console.warn("Drop aborted: Attempting to insert relative to self.");
             clearDragStyles(); draggedCardId = null; return;
        }

        console.log(`Drop details: Card ${droppedCardId} -> Proj ${activeProjectId}, Col ${targetColumnIndex}, Parent ${newParentId || 'root'}, Before ${insertBeforeCardId || 'end'}`);

        // moveCard now operates on the active project implicitly
        moveCard(droppedCardId, targetColumnIndex, newParentId, insertBeforeCardId);
        clearDragStyles();
        draggedCardId = null; // Ensure reset after successful or failed move
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


    // --- Core Logic Functions (Adapted for Active Project) ---

    // REVISED: addCard - Operates on active project, updates lastModified, saves all
    function addCard(columnIndex, parentId = null) {
        const projectData = getActiveProjectData();
        if (!projectData) return; // Safety check

        if (parentId && !projectData.cards[parentId]) {
            console.error(`Cannot add card: Parent ${parentId} not found in active project.`);
            return;
        }
        const maxExistingColumn = projectData.columns.length - 1;
        if (columnIndex < 0 || columnIndex > maxExistingColumn + 1) {
             console.error(`Cannot add card: Invalid column index ${columnIndex}. Max is ${maxExistingColumn + 1}`);
             return;
        }

        const newCardId = generateId('card_');
        const newCard = {
            id: newCardId, name: null, content: '', parentId: parentId,
            columnIndex: columnIndex, order: 0, color: ''
        };

        projectData.cards[newCardId] = newCard; // Add to active project data

        // Determine order (append) using project-aware helpers
        let siblings;
        if (parentId) siblings = getChildCards(parentId, columnIndex).filter(c => c.id !== newCardId);
        else siblings = getColumnCards(columnIndex).filter(c => c.id !== newCardId);
        newCard.order = siblings.length > 0 ? Math.max(...siblings.map(c => c.order)) + 1 : 0;

        // Calculate Color (uses active project context)
        newCard.color = getColorForCard(newCard);

        // If adding a root card, update other root card colors if needed
        if (columnIndex === 0 && !parentId) {
             const rootCards = getColumnCards(0); // Gets roots from active project
             rootCards.forEach(rc => {
                  const newColor = getColorForCard(rc);
                  if (rc.color !== newColor) rc.color = newColor;
                  // DOM update will happen in re-render below
             });
        }

        // Ensure column exists in the project data structure
        while (projectData.columns.length <= columnIndex) {
             addColumnInternal(false); // Add to active project, don't save yet
        }

        // Re-render affected columns in the DOM
        const targetColumnEl = getColumnElementByIndex(columnIndex);
        if (targetColumnEl) renderColumnContent(targetColumnEl, columnIndex);

        // Re-render next column if it exists and might be affected (e.g., group headers)
        if (projectData.columns.length > columnIndex + 1) {
             const nextColumnEl = getColumnElementByIndex(columnIndex + 1);
             if (nextColumnEl) renderColumnContent(nextColumnEl, columnIndex + 1);
        }

        updateProjectLastModified(); // Mark project as modified
        saveProjectsData(); // Save all project data

        requestAnimationFrame(() => {
             const newCardEl = getCardElement(newCardId);
             if (newCardEl) {
                 const textarea = newCardEl.querySelector('.card-content');
                  if(textarea) textarea.focus();
                  newCardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
             }
        });
        console.log(`Card ${newCardId} added to col ${columnIndex}, parent: ${parentId}, order: ${newCard.order} in project ${activeProjectId}`);
    }

    // --- Card Name Editing ---
    function makeCardNameEditable(cardId, cardEl) {
        const nameDisplaySpan = cardEl.querySelector('.card-name-display');
        const header = cardEl.querySelector('.card-header');
        if (!nameDisplaySpan || !header || header.querySelector('.card-name-input')) return; // Already editing

        const card = getCard(cardId);
        if (!card) return;

        const currentName = card.name || ''; // Use empty string if null/undefined
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentName;
        input.className = 'card-name-input';
        input.maxLength = 50;
        input.placeholder = `#${cardId.slice(-4)}`; // Show ID as placeholder

        nameDisplaySpan.style.display = 'none'; // Hide the span
        // Insert input before the actions div
        const actionsDiv = header.querySelector('.card-actions');
        header.insertBefore(input, actionsDiv);

        input.focus();
        input.select();

        const finishEditing = (saveChanges) => {
            const newNameRaw = input.value;
            // Treat empty string as clearing the name (will display ID)
            const newName = newNameRaw.trim() === '' ? null : newNameRaw.trim().substring(0, 50);

            if (saveChanges && newName !== card.name) {
                card.name = newName;
                updateProjectLastModified();
                saveProjectsData();
                console.log(`Card ${cardId} name updated to "${newName}" in project ${activeProjectId}.`);
            }

            // Update display span content and title (Reverted to original logic)
            const displayName = card.name ? card.name : `#${card.id.slice(-4)}`;
            const truncatedDisplayName = displayName.length > 50 ? displayName.substring(0, 50) + '...' : displayName;
            nameDisplaySpan.textContent = truncatedDisplayName;
            nameDisplaySpan.title = displayName; // Update tooltip

            // Update parent group header if this card is a parent (using the NEW logic)
            const groupEl = getGroupElement(cardId);
            if (groupEl) {
                 const groupHeaderContainer = groupEl.querySelector('.group-header');
                 if (groupHeaderContainer) {
                     let groupHeaderText = '';
                     let groupHeaderTitle = '';
                     if (card.name) { // Use name if it exists now
                         const truncatedParentName = card.name.length > 50 ? card.name.substring(0, 50) + '...' : card.name;
                         groupHeaderText = `>> ${truncatedParentName}`;
                         groupHeaderTitle = `Children of ${card.name}`;
                     } else { // Otherwise use ID + Content Preview
                         const idPart = `#${cardId.slice(-4)}`;
                         const contentPreview = card.content?.trim().substring(0, GROUP_HEADER_PREVIEW_LENGTH) || '';
                         const ellipsis = (card.content?.trim().length || 0) > GROUP_HEADER_PREVIEW_LENGTH ? '...' : '';
                         const previewText = contentPreview ? `: ${contentPreview}${ellipsis}` : '';
                         groupHeaderText = `>> ${idPart}${previewText}`;
                         groupHeaderTitle = `Children of ${idPart}${contentPreview ? `: ${card.content?.trim()}` : ''}`;
                     }
                     groupHeaderContainer.textContent = groupHeaderText;
                     groupHeaderContainer.title = groupHeaderTitle;
                 }
            }

            input.remove(); // Remove the input field
            nameDisplaySpan.style.display = ''; // Show the span again
        };

        input.addEventListener('blur', () => finishEditing(true));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                finishEditing(true);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                finishEditing(false);
            }
        });
    }


    // REVISED: deleteCard - Operates on active project, updates lastModified, saves all
    function deleteCard(cardId) {
        const projectData = getActiveProjectData();
        const card = projectData.cards[cardId];
        if (!card) return;

        const descendantIds = getDescendantIds(cardId); // Uses active project data
        const allIdsToDelete = [cardId, ...descendantIds];
        const numDescendants = descendantIds.length;
        const wasRoot = !card.parentId && card.columnIndex === 0;
        const hasContent = card.content?.trim() !== ''; // Check if content exists (trimmed)

        // Skip confirmation if card is empty AND has no descendants
        const shouldConfirm = hasContent || numDescendants > 0;

        if (shouldConfirm) {
            if (!confirm(`Delete card #${cardId.slice(-4)} ${hasContent ? 'with content ' : ''}and its ${numDescendants} descendant(s) from project "${projects[activeProjectId].title}"?`)) {
                return;
            }
        }
        // Proceed with deletion if confirmed OR if skipping confirmation

        const affectedColumns = new Set();
        affectedColumns.add(card.columnIndex);

        allIdsToDelete.forEach(id => {
            const c = projectData.cards[id];
            if (c) {
                 affectedColumns.add(c.columnIndex);
                 // Add next column index if descendants might be there
                 if (projectData.columns.length > c.columnIndex + 1) {
                     affectedColumns.add(c.columnIndex + 1);
                 }
                 delete projectData.cards[id]; // Delete from active project data
            }
        });

         let rootColorsNeedUpdate = wasRoot;

         // Re-render affected columns first
         Array.from(affectedColumns).sort((a,b)=>a-b).forEach(colIndex => {
             // Only render if column still exists (index might be beyond current max after deletion)
             if(colIndex < projectData.columns.length) {
                 const colEl = getColumnElementByIndex(colIndex);
                 if (colEl) renderColumnContent(colEl, colIndex);
             }
         });

        // Now, if needed, update root colors and re-render column 0
        if (rootColorsNeedUpdate) {
             const rootCards = getColumnCards(0); // Gets current roots from active project
             let updated = false;
             rootCards.forEach(rc => {
                  const newColor = getColorForCard(rc);
                  if (rc.color !== newColor) { rc.color = newColor; updated = true; }
             });
             if (updated) {
                  const col0El = getColumnElementByIndex(0);
                  if (col0El) renderColumnContent(col0El, 0);
             }
        }

        updateAllToolbarButtons(); // Update based on new state of active project
        updateProjectLastModified();
        saveProjectsData(); // Save changes
        console.log(`Card ${cardId} and ${numDescendants} descendants deleted from project ${activeProjectId}.`);
    }

    // REVISED: addColumnInternal - Operates on active project's columns array
    function addColumnInternal(doSave = true) {
        const projectData = getActiveProjectData();
        if (!projectData) return -1; // Safety check

        const newIndex = projectData.columns.length;
        projectData.columns.push({ id: `col-${generateId()}` });
        console.log(`Internal add column to project ${activeProjectId}, new count: ${projectData.columns.length}`);
        if (doSave) {
             updateProjectLastModified();
             saveProjectsData();
        }
        return newIndex;
    }

    // REVISED: addColumn - Operates on active project, updates lastModified, saves all
    function addColumn() {
         const newIndex = addColumnInternal(false); // Add to data first, don't save yet
         if (newIndex === -1) return; // Check if addColumnInternal failed

         const columnEl = createColumnElement(newIndex); // Creates DOM element
         columnsContainer.appendChild(columnEl); // Add to DOM
         renderColumnContent(columnEl, newIndex); // Populate with content (should be empty)
         updateAllToolbarButtons(); // Update UI
         console.log(`Column ${newIndex} added visually to project ${activeProjectId}.`);
         columnsContainer.scrollLeft = columnsContainer.scrollWidth; // Scroll to new column

         updateProjectLastModified(); // Mark modified
         saveProjectsData(); // Save the change
    }

    // REVISED: deleteColumn - Operates on active project, updates lastModified, saves all
    function deleteColumn(columnIndex) {
        const projectData = getActiveProjectData();
        if (!projectData) return;

        const numColumns = projectData.columns.length;
        const columnEl = getColumnElementByIndex(columnIndex); // Get DOM element
        const isRightmost = columnIndex === numColumns - 1;
        const columnCards = Object.values(projectData.cards).filter(card => card.columnIndex === columnIndex);
        const canDelete = isRightmost && numColumns > MIN_COLUMNS && columnCards.length === 0;

        if (!canDelete) {
            alert("Cannot delete this column. It might not be the rightmost, the minimum number of columns hasn't been exceeded, or it's not empty.");
            return;
        }
        if (!confirm(`Delete this empty column from project "${projects[activeProjectId].title}"?`)) return;

        // Remove from DOM
        if (columnEl && columnEl.parentNode === columnsContainer) {
            columnsContainer.removeChild(columnEl);
        } else {
             console.warn("Column element not found for deletion, re-rendering as failsafe.");
             renderApp(); // Failsafe if DOM is inconsistent
        }

        // Remove from project data
        if(projectData.columns.length > columnIndex) {
             projectData.columns.splice(columnIndex, 1);
        }

        updateAllToolbarButtons(); // Update remaining buttons
        updateProjectLastModified();
        saveProjectsData(); // Save the deletion
        console.log(`Column ${columnIndex} deleted from project ${activeProjectId}.`);
    }

    // REVISED: moveCard - Operates entirely within the active project's data
    function moveCard(cardId, targetColumnIndex, newParentId, insertBeforeCardId) {
        const projectData = getActiveProjectData();
        const card = projectData.cards[cardId];
        if (!card) return;

        const originalColumnIndex = card.columnIndex;
        const originalParentId = card.parentId;
        const wasRoot = !originalParentId && originalColumnIndex === 0;
        const isBecomingRoot = !newParentId && targetColumnIndex === 0;

        // Prevent dropping into self/descendant (uses active project context)
        let tempParentId = newParentId;
        while(tempParentId) {
            if (tempParentId === cardId) {
                 console.warn("Move Aborted: Cannot move card inside itself or descendants.");
                 return; // Abort the move
            }
            tempParentId = projectData.cards[tempParentId]?.parentId; // Check within active project
        }

        // --- Update card basic properties ---
        card.columnIndex = targetColumnIndex;
        card.parentId = newParentId;

        // --- Calculate new order (uses active project context) ---
        let siblings;
        if (newParentId) siblings = getChildCards(newParentId, targetColumnIndex).filter(c => c.id !== cardId);
        else siblings = getColumnCards(targetColumnIndex).filter(c => c.id !== cardId);

        let newOrder;
        if (insertBeforeCardId && insertBeforeCardId !== cardId) {
            const insertBeforeCard = projectData.cards[insertBeforeCardId]; // Get from active project
            if (insertBeforeCard && insertBeforeCard.columnIndex === targetColumnIndex && insertBeforeCard.parentId === newParentId) { // Ensure sibling exists and is valid target
                 const insertBeforeOrder = insertBeforeCard.order;
                 // Find the card *before* the insertBeforeCard among the *filtered* siblings
                 const insertBeforeIndexInSiblings = siblings.findIndex(c => c.id === insertBeforeCardId);
                 let prevOrder = -1;
                 if(insertBeforeIndexInSiblings > 0) {
                      prevOrder = siblings[insertBeforeIndexInSiblings - 1].order;
                 } else if (insertBeforeIndexInSiblings === 0) {
                      prevOrder = -1; // Insert at the beginning
                 }
                 // Calculate intermediate order
                 newOrder = (prevOrder + insertBeforeOrder) / 2.0;
            } else {
                 console.warn(`Invalid insertBeforeCardId ${insertBeforeCardId} or not a valid sibling. Appending.`);
                 newOrder = siblings.length > 0 ? Math.max(...siblings.map(c => c.order)) + 1 : 0;
            }
        } else { // Append
            newOrder = siblings.length > 0 ? Math.max(...siblings.map(c => c.order)) + 1 : 0;
        }
        card.order = newOrder;

        // --- Update Color (must be after order is set for root cards) ---
        card.color = getColorForCard(card); // Uses active project context

        // --- Update descendants recursively (uses active project context) ---
        const columnDiff = targetColumnIndex - originalColumnIndex;
        const affectedDescendants = [];
        let maxDescendantCol = targetColumnIndex; // Track max column needed
        const descendants = getDescendantIds(cardId); // Get descendants within project

        descendants.forEach(descId => {
            const descCard = projectData.cards[descId];
            if (descCard) {
                descCard.columnIndex += columnDiff;
                descCard.color = getColorForCard(descCard); // Update descendant colors
                affectedDescendants.push(descCard);
                maxDescendantCol = Math.max(maxDescendantCol, descCard.columnIndex);
            }
        });
        // If column didn't change, still update descendant colors as parent color might have changed
        if (columnDiff === 0) {
            descendants.forEach(descId => {
                 const descCard = projectData.cards[descId];
                 if (descCard && !affectedDescendants.find(d => d.id === descId)) { // Only update if not already done
                     descCard.color = getColorForCard(descCard);
                     affectedDescendants.push(descCard);
                 }
             });
        }

        // --- Update colors of other root cards if hierarchy changed ---
        let rootColorsNeedUpdate = false;
        if (wasRoot !== isBecomingRoot || (isBecomingRoot && card.order !== projectData.cards[cardId].order) || wasRoot) {
            // If card became root, left root, reordered among roots, or was root and moved (affecting others)
             rootColorsNeedUpdate = true;
        }

        // --- Ensure enough columns exist IN THE PROJECT DATA ---
        while (projectData.columns.length <= maxDescendantCol) {
             addColumnInternal(false); // Add to active project data, don't save yet
        }

        // --- Determine Columns to Re-render ---
        const columnsToRender = new Set();
        columnsToRender.add(originalColumnIndex);
        columnsToRender.add(targetColumnIndex);
        // Add columns where parents *were* or *are* to update groups
        if (originalParentId) columnsToRender.add(projectData.cards[originalParentId]?.columnIndex + 1);
        if (newParentId) columnsToRender.add(projectData.cards[newParentId]?.columnIndex + 1);
        // Add columns where descendants ended up
        affectedDescendants.forEach(desc => columnsToRender.add(desc.columnIndex));
        // Add columns *next to* original/target columns to potentially update groups they contain
        if (projectData.columns.length > originalColumnIndex + 1) columnsToRender.add(originalColumnIndex + 1);
        if (projectData.columns.length > targetColumnIndex + 1) columnsToRender.add(targetColumnIndex + 1);

        // Filter out invalid column indices (e.g., -1 if parent was missing, or index > max)
        const validColumnsToRender = Array.from(columnsToRender)
                                      .filter(idx => idx !== undefined && idx !== null && idx >= 0 && idx < projectData.columns.length)
                                      .sort((a, b) => a - b);

        // --- Update root colors if needed ---
        if (rootColorsNeedUpdate) {
             const rootCards = getColumnCards(0); // Get current roots from active project
             rootCards.forEach(rc => rc.color = getColorForCard(rc)); // Recalculate based on new order
             if (!validColumnsToRender.includes(0)) { // Ensure column 0 is re-rendered if not already listed
                 validColumnsToRender.push(0);
                 validColumnsToRender.sort((a,b) => a - b);
             }
        }

        // --- Perform the render ---
        console.log("Re-rendering columns after move:", validColumnsToRender);
        validColumnsToRender.forEach(index => {
            const colEl = getColumnElementByIndex(index);
            if (colEl) {
                renderColumnContent(colEl, index); // Renders based on active project data
            } else {
                 console.warn(`Attempted to re-render non-existent column DOM element at index ${index}`);
            }
        });

        updateAllToolbarButtons(); // Update based on new state
        updateProjectLastModified();
        saveProjectsData(); // Save all changes
        console.log(`Card ${cardId} moved SUCCESS -> Proj ${activeProjectId}, Col ${targetColumnIndex}, Parent: ${newParentId || 'root'}, Order: ${card.order}`);
    }

    // REVISED: updateAllToolbarButtons - Operates based on active project DOM/Data
    function updateAllToolbarButtons() {
        Array.from(columnsContainer.children).forEach((col, idx) => {
            updateToolbarButtons(col, idx); // Uses active project data implicitly
        });
    }

    // --- Sidebar Resizer ---
    let isResizing = false;
    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        document.body.style.cursor = 'ew-resize'; // Indicate resizing across the body
        document.body.style.userSelect = 'none'; // Prevent text selection during resize
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const minWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--min-sidebar-width'), 10) || 150;
        let newWidth = e.clientX;
        // Clamp width to minimum and reasonable maximum (e.g., half the window width)
        newWidth = Math.max(minWidth, newWidth);
        newWidth = Math.min(newWidth, window.innerWidth / 2);
        document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`);
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = 'default';
            document.body.style.userSelect = 'auto';
        }
    });


    // --- Initial Load ---
    loadProjectsData(); // Loads all projects and determines/loads the active one
    renderProjectList(); // Render the sidebar
    renderApp(); // Render the main view for the active project

    // Add Project Button Listener
    addProjectBtn.addEventListener('click', addProject);

}); // End DOMContentLoaded
