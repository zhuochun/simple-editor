document.addEventListener('DOMContentLoaded', () => {
    // Existing variables...
    const sidebar = document.getElementById('sidebar');
    const resizer = document.getElementById('resizer');
    const mainContent = document.getElementById('main-content');
    const columnsContainer = document.getElementById('columnsContainer');
    const addProjectBtn = document.getElementById('add-project-btn');
    const projectListContainer = document.getElementById('project-list');

    // AI Settings Elements
    const aiSettingsTitle = document.getElementById('ai-settings-title');
    const aiProviderUrlInput = document.getElementById('ai-provider-url');
    const aiModelNameInput = document.getElementById('ai-model-name');
    const aiApiKeyInput = document.getElementById('ai-api-key');

    let projects = {}; // { projectId: { id, title, lastModified, data: { columns: [{id, prompt?}], cards: {} } } }
    let activeProjectId = null;
    let draggedCardId = null;
    let dragIndicator = null;

    const MIN_COLUMNS = 3;
    const BASE_COLOR_HUE = 200; // Starting Hue for first root card
    const HUE_ROTATION_STEP = 30; // Degrees to shift hue for each subsequent root card
    const BASE_COLOR_SATURATION = 60;
    const BASE_COLOR_LIGHTNESS = 90;
    const GROUP_LIGHTNESS_STEP_DOWN = 3; // How much darker each card in a group gets vs the one above it
    const GROUP_HEADER_PREVIEW_LENGTH = 60; // Max chars for content preview in group header
    const PROJECTS_STORAGE_KEY = 'writingToolProjects';
    const ACTIVE_PROJECT_ID_KEY = 'writingToolActiveProjectId';


    // --- AI Settings Management (Delegated to aiService.js) ---

    // This function will be passed to aiService to update UI based on settings validity
    function updateAiFeatureVisibility(isValid) {
        // const isValid = aiService.areAiSettingsValid(); // Use aiService check
        document.body.classList.toggle('ai-ready', isValid);
        // Disable/enable buttons based on validity
        document.querySelectorAll('.ai-feature button').forEach(btn => {
            btn.disabled = !isValid;
        });
    }

    // --- Project Management ---

    function generateId(prefix = 'id_') {
        return prefix + Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
    }

    function createDefaultProject(title = "Untitled Project") {
        const projectId = generateId('proj_');
        const defaultColumns = [];
        for (let i = 0; i < MIN_COLUMNS; i++) {
            // Add prompt property to column data
            defaultColumns.push({ id: `col-${generateId()}`, prompt: '' });
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
            // Ensure column prompts are saved
            if (activeProjectId && projects[activeProjectId] && projects[activeProjectId].data.columns) {
                 projects[activeProjectId].data.columns.forEach(col => {
                     if (col.prompt === undefined) col.prompt = ''; // Ensure prompt property exists
                 });
            }
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
             // Ensure columns have prompt property
             proj.data.columns.forEach(col => {
                if (col.prompt === undefined) col.prompt = '';
             });
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

     // Helper to get column data (including prompt)
     function getColumnData(columnIndex) {
         const projectData = getActiveProjectData();
         if (columnIndex >= 0 && columnIndex < projectData.columns.length) {
             return projectData.columns[columnIndex];
         }
         return null; // Or return a default object { id: null, prompt: '' }
     }


    // Helper to get column index (no change needed)
    function getColumnIndex(columnElement) {
        if (!columnElement) return -1;
        return Array.from(columnsContainer.children).indexOf(columnElement);
    }

    // Helper to get cards for the active project's column
    // Sorts root cards by their order, then groups child cards by parent,
    // sorting groups by parent.order, and cards within groups by card.order.
    function getColumnCards(columnIndex) {
        const projectData = getActiveProjectData();
        const allCards = projectData.cards; // Need all cards for parent lookup

        return Object.values(allCards)
               .filter(card => card.columnIndex === columnIndex)
               .sort((a, b) => {
                   const aIsRoot = !a.parentId;
                   const bIsRoot = !b.parentId;

                   if (aIsRoot && bIsRoot) {
                       // Case 1: Both are root cards in this column, sort by their own order
                       return a.order - b.order;
                   } else if (aIsRoot) {
                       // Case 2: a is root, b is child. Root comes first.
                       return -1;
                   } else if (bIsRoot) {
                       // Case 3: a is child, b is root. Root comes first.
                       return 1;
                   } else {
                       // Case 4: Both are child cards
                       if (a.parentId === b.parentId) {
                           // Subcase 4a: Same parent, sort by their own order
                           return a.order - b.order;
                       } else {
                           // Subcase 4b: Different parents, sort by parent's order
                           const parentA = allCards[a.parentId];
                           const parentB = allCards[b.parentId];

                           // Handle cases where parent might be missing (defensive coding)
                           const parentAOrder = parentA ? parentA.order : Infinity; // Missing parents sort last
                           const parentBOrder = parentB ? parentB.order : Infinity;

                           if (parentAOrder !== parentBOrder) {
                               return parentAOrder - parentBOrder;
                           } else {
                               // Tie-breaker: If parents somehow have the same order,
                               // sort by the child card's order.
                               return a.order - b.order;
                           }
                       }
                   }
               });
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
                // Fallback: Use a slightly darker default color if parent is missing
                return `hsl(${BASE_COLOR_HUE}, ${BASE_COLOR_SATURATION}%, ${BASE_COLOR_LIGHTNESS - GROUP_LIGHTNESS_STEP_DOWN}%)`;
            }

            // Ensure parent color is calculated if missing (pass projectData down)
            const parentColor = parentCard.color || getColorForCard(parentCard, projectData);

            try {
                const match = parentColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
                if (match) {
                    let [, h, s, l] = match.map(Number); // Inherit parent's H, S, L

                    // Find siblings in the same group (same parent, same column)
                    const siblings = Object.values(projectData.cards)
                        .filter(c => c.parentId === card.parentId && c.columnIndex === card.columnIndex)
                        .sort((a, b) => a.order - b.order);

                    // Find the index of the current card among its siblings
                    const siblingIndex = siblings.findIndex(c => c.id === card.id);
                    const indexInGroup = siblingIndex >= 0 ? siblingIndex : 0; // Default to 0 if not found (shouldn't happen)

                    // Calculate new lightness based on position within the group
                    const newLightness = Math.max(15, l - (indexInGroup * GROUP_LIGHTNESS_STEP_DOWN));
                    // Keep parent's saturation for now, or adjust slightly if desired:
                    // const newSaturation = Math.min(100, s + (indexInGroup * 1)); // Optional: slightly increase saturation too

                    return `hsl(${h}, ${s}%, ${newLightness}%)`; // Use parent's hue and saturation, adjusted lightness
                } else {
                    console.warn(`Could not parse parent color ${parentColor}. Using fallback based on group position.`);
                    // Fallback: Still try to darken based on group position if parent color parsing failed
                    const siblings = Object.values(projectData.cards)
                        .filter(c => c.parentId === card.parentId && c.columnIndex === card.columnIndex)
                        .sort((a, b) => a.order - b.order);
                    const siblingIndex = siblings.findIndex(c => c.id === card.id);
                    const indexInGroup = siblingIndex >= 0 ? siblingIndex : 0;
                    const lightness = Math.max(15, BASE_COLOR_LIGHTNESS - (indexInGroup * GROUP_LIGHTNESS_STEP_DOWN));
                    return `hsl(${BASE_COLOR_HUE}, ${BASE_COLOR_SATURATION}%, ${lightness}%)`;
                }
            } catch (e) {
                console.error("Error processing parent color or calculating group color:", e);
                // Final fallback: Use a default slightly darker color
                return `hsl(${BASE_COLOR_HUE}, ${BASE_COLOR_SATURATION}%, ${BASE_COLOR_LIGHTNESS - GROUP_LIGHTNESS_STEP_DOWN}%)`;
            }
        } else {
            // This case should ideally not happen for cards in columns > 0, but handle defensively
            console.warn(`Card ${card.id} in column ${card.columnIndex} has no parent but is not in column 0. Using default color.`);
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

    // REVISED: Create Card Element - Uses active project context for color, adds AI buttons
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

        // Check AI readiness for button state (using aiService)
        const aiReady = aiService.areAiSettingsValid();

        cardEl.innerHTML = `
            <div class="card-header" draggable="true">
                <span class="card-name-display" title="${displayName}">${truncatedDisplayName}</span>
                <div class="card-ai-actions ai-feature">
                     <button class="ai-continue-btn" title="Continue Writing (in this column)" ${!aiReady ? 'disabled' : ''}>⬇️</button>
                     <button class="ai-expand-btn" title="Expand (to next column)" ${!aiReady ? 'disabled' : ''}>🪴</button>
                     <button class="ai-breakdown-btn" title="Brainstorm (to next column)" ${!aiReady ? 'disabled' : ''}>🧠</button>
                     <button class="ai-custom-btn" title="Custom Prompt (to next column)" ${!aiReady ? 'disabled' : ''}>✨</button>
                </div>
                <div class="card-actions">
                    <button class="add-child-btn" title="Add Child Card (to next column)">➕</button>
                    <button class="delete-card-btn" title="Delete Card">🗑️</button>
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

        // Standard Actions
        headerEl.querySelector('.add-child-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            addCard(card.columnIndex + 1, card.id);
        });
        headerEl.querySelector('.delete-card-btn').addEventListener('click', (e) => {
            e.stopPropagation();
             deleteCard(card.id);
        });

        // AI Actions - Add listeners regardless, disable state handled by updateAiFeatureVisibility
        headerEl.querySelector('.ai-continue-btn').addEventListener('click', (e) => { e.stopPropagation(); handleAiContinue(card.id); });
        headerEl.querySelector('.ai-breakdown-btn').addEventListener('click', (e) => { e.stopPropagation(); handleAiBreakdown(card.id); });
        headerEl.querySelector('.ai-expand-btn').addEventListener('click', (e) => { e.stopPropagation(); handleAiExpand(card.id); });
        headerEl.querySelector('.ai-custom-btn').addEventListener('click', (e) => { e.stopPropagation(); handleAiCustom(card.id); });


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

    // REVISED: Create Column Element - Adds "Add Prompt" button
    function createColumnElement(columnIndex) {
        const columnEl = document.createElement('div');
        columnEl.className = 'column';
        columnEl.dataset.columnIndex = columnIndex;
        const aiReady = aiService.areAiSettingsValid(); // Use aiService check
        const columnData = getColumnData(columnIndex);
        const promptIndicator = columnData?.prompt ? '📝' : ''; // Indicator if prompt exists

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

        columnEl.querySelector('.add-card-btn').addEventListener('click', () => addCard(columnIndex, null)); // addCard uses active project
        columnEl.querySelector('.add-column-btn').addEventListener('click', addColumn); // addColumn uses active project
        columnEl.querySelector('.delete-column-btn').addEventListener('click', () => deleteColumn(columnIndex)); // deleteColumn uses active project

        // Add Prompt Button Listener
        const addPromptBtn = columnEl.querySelector('.add-prompt-btn');
        if (addPromptBtn) {
             addPromptBtn.addEventListener('click', () => handleSetColumnPrompt(columnIndex));
        }


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

    // REVISED: Update Toolbar Buttons - Uses active project data, updates prompt button
    function updateToolbarButtons(columnEl, columnIndex) {
         const addCardBtn = columnEl.querySelector('.add-card-btn');
         const addColBtn = columnEl.querySelector('.add-column-btn');
         const delColBtn = columnEl.querySelector('.delete-column-btn');
         const addPromptBtn = columnEl.querySelector('.add-prompt-btn'); // Get prompt button

         const numColumns = columnsContainer.children.length; // Based on current DOM
         const isRightmost = columnIndex === numColumns - 1;
         const projectData = getActiveProjectData();
         const columnData = getColumnData(columnIndex); // Get column data

         addCardBtn.classList.toggle('hidden', columnIndex !== 0);
         addColBtn.classList.toggle('hidden', !isRightmost);

         const columnCards = Object.values(projectData.cards).filter(card => card.columnIndex === columnIndex);
         // Use projectData.columns.length for minimum check
         const canDelete = isRightmost && projectData.columns.length > MIN_COLUMNS && columnCards.length === 0;
         delColBtn.classList.toggle('hidden', !canDelete);
         delColBtn.disabled = !canDelete;

         // Update prompt button text/indicator
         if (addPromptBtn) {
             const promptIndicator = columnData?.prompt ? '📝' : '';
             addPromptBtn.textContent = `Prompt ${promptIndicator}`;
             addPromptBtn.disabled = !aiService.areAiSettingsValid(); // Also disable if AI not ready
         }
    }

    // No change needed for autoResizeTextarea
    function autoResizeTextarea(event) {
        const textarea = event.target;
        textarea.style.height = 'auto';
        // Use computed height to avoid jumps if scrollHeight is temporarily large
        const computedHeight = window.getComputedStyle(textarea).height;
        textarea.style.height = computedHeight; // Set explicit height before recalculating
        textarea.style.height = `${textarea.scrollHeight}px`; // Allow textarea to grow based on content
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
            // If it was loading, clear the loading state
            textarea.classList.remove('ai-loading');
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
         scrollHierarchy(cardId);
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
            if (cardEl) {
                cardEl.classList.add('highlight');
            }
            const groupEl = getGroupElement(id);
            if (groupEl) {
                groupEl.classList.add('highlight');
            }
        });
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

        // Helper to perform scroll if container hasn't been scrolled yet
        const scrollToTarget = (container, targetElement, center = true, scrollToTopIfTaller = false) => {
            if (!container || !targetElement || scrolledContainers.has(container)) {
                return; // Skip if no container, target, or already scrolled
            }

            const containerRect = container.getBoundingClientRect();
            const elementRect = targetElement.getBoundingClientRect();

            // Calculate element's position relative to the container
            const relativeElementTop = elementRect.top - containerRect.top + container.scrollTop;
            const relativeElementHeight = elementRect.height;
            const containerHeight = container.clientHeight; // Use clientHeight for visible height

            let targetScroll;

            if (scrollToTopIfTaller && relativeElementHeight > window.innerHeight) {
                targetScroll = relativeElementTop;
            } else if (center) {
                targetScroll = relativeElementTop - (containerHeight / 2) + (relativeElementHeight / 2);
            } else {
                targetScroll = relativeElementTop;
            }

            container.scrollTo({
                top: Math.max(0, targetScroll), // Ensure scroll isn't negative
                behavior: 'smooth'
            });
            scrolledContainers.add(container); // Mark as scrolled
        };

        // 1. Scroll Focused Card
        const focusedScrollContainer = cardEl.closest('.column')?.querySelector('.cards-container');
        scrollToTarget(focusedScrollContainer, cardEl, true); // Center focused card

        // 2. Scroll Ancestors
        const ancestorIds = getAncestorIds(cardId);
        ancestorIds.forEach(ancestorId => {
            const ancestorEl = getCardElement(ancestorId);
            if (ancestorEl) {
                const ancestorScrollContainer = ancestorEl.closest('.column')?.querySelector('.cards-container');
                scrollToTarget(ancestorScrollContainer, ancestorEl, true); // Center ancestor
            }
        });

        // 3. Scroll Descendant Groups
        const descendantIds = getDescendantIds(cardId);
        const allIdsToCheckForGroups = [cardId, ...descendantIds]; // Include the focused card itself

        allIdsToCheckForGroups.forEach(currentId => {
            const currentCard = getCard(currentId);
            if (!currentCard) return;

            // Check if this card has children in the *next* column
            const childrenInNextCol = getChildCards(currentId, currentCard.columnIndex + 1);
            if (childrenInNextCol.length > 0) {
                const groupEl = getGroupElement(currentId); // Get the group element in the next column
                if (groupEl) {
                    const groupScrollContainer = groupEl.closest('.column')?.querySelector('.cards-container');
                    // Scroll the group: top if taller than viewport, center otherwise
                    scrollToTarget(groupScrollContainer, groupEl, true, true);
                }
            }
        });
    }

    // REVISED: clearHighlights - Uses active project data
    function clearHighlights() {
        document.querySelectorAll('.card.highlight, .card.editing, .card-group.highlight').forEach(el => {
            el.classList.remove('highlight', 'editing');
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

    // REVISED: addCard - Operates on active project, updates lastModified, saves all. Added initialContent option.
    function addCard(columnIndex, parentId = null, initialContent = '', insertBeforeCardId = null) {
        const projectData = getActiveProjectData();
        if (!projectData) return null; // Safety check

        if (parentId && !projectData.cards[parentId]) {
            console.error(`Cannot add card: Parent ${parentId} not found in active project.`);
            return null;
        }
        const maxExistingColumn = projectData.columns.length - 1;
        if (columnIndex < 0 || columnIndex > maxExistingColumn + 1) {
             console.error(`Cannot add card: Invalid column index ${columnIndex}. Max is ${maxExistingColumn + 1}`);
             return null;
        }

        const newCardId = generateId('card_');
        const newCard = {
            id: newCardId, name: null, content: initialContent, parentId: parentId,
            columnIndex: columnIndex, order: 0, color: ''
        };

        projectData.cards[newCardId] = newCard; // Add to active project data

        // Determine order using project-aware helpers and insertBeforeCardId
        let siblings;
        if (parentId) siblings = getChildCards(parentId, columnIndex).filter(c => c.id !== newCardId);
        else siblings = getColumnCards(columnIndex).filter(c => c.id !== newCardId);

        let newOrder;
        if (insertBeforeCardId && insertBeforeCardId !== newCardId) {
            const insertBeforeCard = projectData.cards[insertBeforeCardId];
            if (insertBeforeCard && insertBeforeCard.columnIndex === columnIndex && insertBeforeCard.parentId === parentId) {
                const insertBeforeOrder = insertBeforeCard.order;
                const insertBeforeIndexInSiblings = siblings.findIndex(c => c.id === insertBeforeCardId);
                let prevOrder = -1;
                if (insertBeforeIndexInSiblings > 0) {
                    prevOrder = siblings[insertBeforeIndexInSiblings - 1].order;
                } else if (insertBeforeIndexInSiblings === 0) {
                    prevOrder = -1; // Insert at the beginning
                }
                newOrder = (prevOrder + insertBeforeOrder) / 2.0;
            } else {
                console.warn(`Invalid insertBeforeCardId ${insertBeforeCardId} or not a valid sibling for new card. Appending.`);
                newOrder = siblings.length > 0 ? Math.max(...siblings.map(c => c.order)) + 1 : 0;
            }
        } else { // Append
            newOrder = siblings.length > 0 ? Math.max(...siblings.map(c => c.order)) + 1 : 0;
        }
        newCard.order = newOrder;


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

        // --- DOM Update ---
        // Instead of full re-render, insert the new element directly for better focus/scroll
        const newCardEl = createCardElement(newCard); // Create the element
        let targetContainer;
        let insertBeforeEl = null;

        if (parentId) {
            targetContainer = getGroupElement(parentId);
            if (!targetContainer) { // Group might not exist yet if this is the first child
                const parentCard = getCard(parentId);
                if(parentCard) {
                    const parentColEl = getColumnElementByIndex(parentCard.columnIndex);
                    renderColumnContent(parentColEl, parentCard.columnIndex); // Re-render parent column
                    const targetColEl = getColumnElementByIndex(columnIndex);
                    renderColumnContent(targetColEl, columnIndex); // Re-render target column
                    targetContainer = getGroupElement(parentId); // Try getting group again
                }
            }
        } else {
            const columnEl = getColumnElementByIndex(columnIndex);
            if (columnEl) targetContainer = columnEl.querySelector('.cards-container');
        }

        if(targetContainer) {
            if (insertBeforeCardId) {
                 insertBeforeEl = getCardElement(insertBeforeCardId);
                 // If inserting before a card in a group, make sure targetContainer is the group
                 if(insertBeforeEl && parentId && !targetContainer.contains(insertBeforeEl)) {
                      targetContainer = insertBeforeEl.closest('.card-group');
                 }
            }

            if (insertBeforeEl && targetContainer && targetContainer.contains(insertBeforeEl)) {
                 targetContainer.insertBefore(newCardEl, insertBeforeEl);
            } else if (targetContainer) {
                 // Append to the correct container (group or column's cards-container)
                 if (parentId && targetContainer.classList.contains('card-group')) {
                     // Find correct place within group (respect order)
                     const siblingsInDOM = Array.from(targetContainer.querySelectorAll(`:scope > .card[data-card-id]`));
                     let inserted = false;
                     for(const siblingEl of siblingsInDOM) {
                         const siblingCard = getCard(siblingEl.dataset.cardId);
                         if(siblingCard && newCard.order < siblingCard.order) {
                             targetContainer.insertBefore(newCardEl, siblingEl);
                             inserted = true;
                             break;
                         }
                     }
                     if(!inserted) targetContainer.appendChild(newCardEl); // Append if last
                 } else if (!parentId && targetContainer.classList.contains('cards-container')) {
                      // Append root card to column's container (respect order)
                      const siblingsInDOM = Array.from(targetContainer.querySelectorAll(`:scope > .card[data-card-id]`)); // Only direct children cards
                      let inserted = false;
                      for (const siblingEl of siblingsInDOM) {
                           const siblingCard = getCard(siblingEl.dataset.cardId);
                           if (siblingCard && newCard.order < siblingCard.order) {
                               targetContainer.insertBefore(newCardEl, siblingEl);
                               inserted = true;
                               break;
                           }
                      }
                       if (!inserted) targetContainer.appendChild(newCardEl); // Append if last
                 } else {
                      console.warn("Could not determine correct insertion point, appending to container:", targetContainer);
                      targetContainer.appendChild(newCardEl);
                 }
            } else {
                 console.error("Target container not found for new card. Re-rendering column.", columnIndex);
                 const colEl = getColumnElementByIndex(columnIndex);
                 if(colEl) renderColumnContent(colEl, columnIndex);
            }
        } else {
             console.error("Target container or column element not found. Re-rendering app.");
             renderApp(); // Fallback to full render
        }

        // Re-render next column if it exists and might be affected (e.g., group headers for the new card)
        if (projectData.columns.length > columnIndex + 1) {
             const nextColumnEl = getColumnElementByIndex(columnIndex + 1);
             if (nextColumnEl) renderColumnContent(nextColumnEl, columnIndex + 1);
        }

        updateProjectLastModified(); // Mark project as modified
        saveProjectsData(); // Save all project data

        requestAnimationFrame(() => {
            const textarea = newCardEl.querySelector('.card-content');
             if (textarea && initialContent.includes("AI is thinking...")) {
                 textarea.classList.add('ai-loading');
             }
             if (newCardEl) {
                scrollIntoViewIfNeeded(newCardEl)
                // Don't focus if AI is loading
                if (textarea && !initialContent.includes("AI is thinking...")) {
                    textarea.focus();
                }
             }
        });
        console.log(`Card ${newCardId} added to col ${columnIndex}, parent: ${parentId}, order: ${newCard.order} in project ${activeProjectId}`);
        return newCardId; // Return the ID of the created card
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
        // Insert input before the AI actions div (or standard actions if AI not present)
        const aiActionsDiv = header.querySelector('.card-ai-actions');
        const actionsDiv = header.querySelector('.card-actions');
        const insertBeforeTarget = aiActionsDiv || actionsDiv;
        if (insertBeforeTarget) {
             header.insertBefore(input, insertBeforeTarget);
        } else { // Fallback if no action divs found
             header.appendChild(input);
        }


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

    /**
     * Internal helper to delete a single card's data and optionally its DOM element.
     * Does NOT handle descendants or confirmation.
     * @param {string} cardId The ID of the card to delete.
     * @param {boolean} [updateDOM=true] Whether to remove the card's DOM element.
     * @returns {object | null} The data of the deleted card, or null if not found.
     */
    function deleteCardInternal(cardId, updateDOM = true) {
        const projectData = getActiveProjectData();
        const cardData = projectData.cards[cardId];
        if (!cardData) {
            console.warn(`deleteCardInternal: Card ${cardId} not found.`);
            return null;
        }

        // Delete data
        delete projectData.cards[cardId];

        // Optionally delete DOM
        if (updateDOM) {
            const cardEl = getCardElement(cardId);
            if (cardEl) {
                cardEl.remove();
                console.log(`deleteCardInternal: Removed DOM for ${cardId}`);
            } else {
                 console.warn(`deleteCardInternal: DOM element not found for ${cardId} during removal.`);
            }
        }
        console.log(`deleteCardInternal: Deleted data for ${cardId}`);
        return cardData; // Return the data in case it's needed
    }


    // REVISED: deleteCard - Handles confirmation, deletes card and descendants, updates UI.
    function deleteCard(cardId) {
        const projectData = getActiveProjectData();
        const card = projectData.cards[cardId]; // Check if card exists before proceeding
        if (!card) {
             console.warn(`deleteCard: Card ${cardId} not found.`);
             return;
        }

        const descendantIds = getDescendantIds(cardId); // Uses active project data
        const allIdsToDelete = [cardId, ...descendantIds];
        const numDescendantsWithContent = descendantIds.filter(id => projectData.cards[id]?.content?.trim()).length;
        const wasRoot = !card.parentId && card.columnIndex === 0;
        const hasContent = card.content?.trim() !== '';

        // Confirmation logic
        const shouldConfirm = numDescendantsWithContent > 0 || (hasContent && descendantIds.length > 0); // Confirm if descendants have content OR if parent has content and there are any descendants
        const confirmMessage = `Delete card #${cardId.slice(-4)} ${hasContent ? 'with content ' : ''}and its ${descendantIds.length} descendant(s) (${numDescendantsWithContent} with content) from project "${projects[activeProjectId].title}"?`;

        if (shouldConfirm && !confirm(confirmMessage)) {
            return; // User cancelled
        }

        // Proceed with deletion
        const affectedColumns = new Set();
        affectedColumns.add(card.columnIndex);
        const originalParentId = card.parentId;
        let rootColorsNeedUpdate = wasRoot;

        // Delete data and DOM for all descendants first, then the card itself
        descendantIds.forEach(id => {
            const descCardData = deleteCardInternal(id, true); // Delete data and DOM
            if (descCardData) {
                affectedColumns.add(descCardData.columnIndex);
                // Add next column index if descendants might be there
                if (projectData.columns.length > descCardData.columnIndex + 1) {
                    affectedColumns.add(descCardData.columnIndex + 1);
                }
            }
        });
        // Finally, delete the main card
        deleteCardInternal(cardId, true); // Delete data and DOM

        // Remove empty group container if the deleted card was the last child in its original group
        if (originalParentId) {
            const remainingChildren = getChildCards(originalParentId, card.columnIndex); // Check remaining children in the original column
            if (remainingChildren.length === 0) {
                const groupEl = getGroupElement(originalParentId);
                if (groupEl) groupEl.remove();
            }
        }

        // Re-render affected columns that *still exist* to update layout/groups etc.
        const validColumnsToRender = Array.from(affectedColumns)
            .filter(idx => idx >= 0 && idx < projectData.columns.length) // Ensure column index is valid
            .sort((a, b) => a - b);

        validColumnsToRender.forEach(colIndex => {
            const colEl = getColumnElementByIndex(colIndex);
            if (colEl) {
                renderColumnContent(colEl, colIndex);
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
            if (updated && !validColumnsToRender.includes(0)) { // Only add if not already there
                 validColumnsToRender.push(0);
                 validColumnsToRender.sort((a,b) => a - b);
            }
            // Re-render column 0 if colors changed OR if it was already in the list
            if (updated || validColumnsToRender.includes(0)) {
                 const col0El = getColumnElementByIndex(0);
                 if (col0El) renderColumnContent(col0El, 0);
            }
        }

        updateAllToolbarButtons(); // Update based on new state of active project
        updateProjectLastModified();
        saveProjectsData(); // Save changes
        console.log(`Card ${cardId} and ${descendantIds.length} descendants deleted from project ${activeProjectId}.`);
    }

    /**
     * Reparents all direct children of one card to another, updating columns, order, and colors.
     * Handles data update, saving, and triggers necessary re-renders.
     * @param {string} oldParentId The ID of the card whose children will be moved.
     * @param {string} newParentId The ID of the card that will become the new parent.
     */
    function reparentChildren(oldParentId, newParentId) {
        const projectData = getActiveProjectData();
        const oldParentCard = projectData.cards[oldParentId]; // Needed for original column context if children move columns
        const newParentCard = projectData.cards[newParentId];

        if (!oldParentCard || !newParentCard) {
            console.error(`reparentChildren: Old parent ${oldParentId} or new parent ${newParentId} not found.`);
            return;
        }

        const childrenToMove = Object.values(projectData.cards).filter(c => c.parentId === oldParentId);
        if (childrenToMove.length === 0) {
            console.log(`reparentChildren: No children found for ${oldParentId}.`);
            return; // Nothing to do
        }

        console.log(`reparentChildren: Moving ${childrenToMove.length} children from ${oldParentId} to ${newParentId}`);

        const affectedColumns = new Set();
        affectedColumns.add(newParentCard.columnIndex + 1); // Column where new group header might appear/change
        childrenToMove.forEach(child => affectedColumns.add(child.columnIndex)); // Original columns of children

        // Sort children by original order before processing
        childrenToMove.sort((a, b) => a.order - b.order);

        // Find the order of the last existing child of the new parent *in the target column*
        // Note: Children being moved might end up in different columns relative to the new parent.
        // We need to calculate order based on the *child's target column*.
        const lastChildOrders = {}; // Store last order per column for the new parent

        childrenToMove.forEach(child => {
            const targetChildColumnIndex = child.columnIndex; // Children keep their column index relative to parent
            affectedColumns.add(targetChildColumnIndex); // Ensure child's column is re-rendered

            // Find last order of existing children of the *new parent* in the *child's target column*
            if (lastChildOrders[targetChildColumnIndex] === undefined) {
                 const existingSiblingsInTargetCol = getChildCards(newParentId, targetChildColumnIndex);
                 lastChildOrders[targetChildColumnIndex] = existingSiblingsInTargetCol.length > 0
                     ? Math.max(...existingSiblingsInTargetCol.map(c => c.order))
                     : -1; // Use -1 if no existing children in that column yet
            }

            // Update child properties
            child.parentId = newParentId;
            // child.columnIndex remains the same (relative position)

            // Calculate new order - append after the last known child in that column for the new parent
            lastChildOrders[targetChildColumnIndex] += 1; // Increment order for the next child in this column
            child.order = lastChildOrders[targetChildColumnIndex];

            // Recalculate color based on new parentage and position
            child.color = getColorForCard(child);

            // Recursively update descendants' colors as their ancestor chain changed
            const descendants = getDescendantIds(child.id);
            descendants.forEach(descId => {
                const descCard = projectData.cards[descId];
                if (descCard) {
                    descCard.color = getColorForCard(descCard);
                    affectedColumns.add(descCard.columnIndex); // Ensure descendant columns are also re-rendered
                }
            });
        });

        // --- Save and Re-render ---
        updateProjectLastModified();
        saveProjectsData();

        // Re-render all affected columns
        const validColumnsToRender = Array.from(affectedColumns)
            .filter(idx => idx >= 0 && idx < projectData.columns.length)
            .sort((a, b) => a - b);

        console.log("reparentChildren: Re-rendering columns:", validColumnsToRender);
        validColumnsToRender.forEach(index => {
            const colEl = getColumnElementByIndex(index);
            if (colEl) {
                renderColumnContent(colEl, index);
            } else {
                 console.warn(`reparentChildren: Attempted to re-render non-existent column DOM element at index ${index}`);
            }
        });

        updateAllToolbarButtons(); // Update toolbars as content might have moved
    }


    // --- Column Prompt Handling ---
    function handleSetColumnPrompt(columnIndex) {
        const projectData = getActiveProjectData();
        const columnData = getColumnData(columnIndex);
        if (!columnData) {
            console.error("Cannot set prompt for invalid column index:", columnIndex);
            return;
        }
        const currentPrompt = columnData.prompt || '';

        // --- Modal Implementation ---
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
        promptInput.select(); // Select existing text

        const closeModal = () => {
            if (overlay.parentNode === document.body) {
                document.body.removeChild(overlay);
            }
        };

        cancelButton.addEventListener('click', closeModal);
        submitButton.addEventListener('click', () => {
            const newPrompt = promptInput.value.trim(); // Trim the input value

            if (columnData.prompt !== newPrompt) { // Check if it actually changed
                columnData.prompt = newPrompt; // Save the trimmed prompt (or empty string)
                updateProjectLastModified();
                saveProjectsData();
                // Update the button indicator in the specific column
                const columnEl = getColumnElementByIndex(columnIndex);
                if (columnEl) updateToolbarButtons(columnEl, columnIndex);
                console.log(`Column ${columnIndex} prompt updated.`);
            }
            closeModal(); // Close modal after processing
        });

        // Allow submitting with Ctrl+Enter in textarea
        promptInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
                e.preventDefault(); // Prevent newline
                submitButton.click(); // Trigger submit
            } else if (e.key === 'Escape') {
                 e.preventDefault();
                 closeModal(); // Close on Escape
            }
        });

         // Close if clicking outside the modal content
         overlay.addEventListener('click', (e) => {
             if (e.target === overlay) {
                 closeModal();
             }
         });
    }


    // REVISED: addColumnInternal - Operates on active project's columns array, adds prompt property
    function addColumnInternal(doSave = true) {
        const projectData = getActiveProjectData();
        if (!projectData) return -1; // Safety check

        const newIndex = projectData.columns.length;
        // Add prompt property when creating column data
        projectData.columns.push({ id: `col-${generateId()}`, prompt: '' });
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
        if (originalParentId) {
            const originalParentCard = getCard(originalParentId);
            if (originalParentCard) columnsToRender.add(originalParentCard.columnIndex + 1);
        }
         if (newParentId) {
             const newParentCard = getCard(newParentId);
             if (newParentCard) columnsToRender.add(newParentCard.columnIndex + 1);
         }
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

    // --- Sidebar Collapser ---
    const SIDEBAR_COLLAPSED_KEY = 'sidebarCollapsed';

    resizer.addEventListener('click', () => {
        const isCollapsed = document.body.classList.toggle('sidebar-collapsed');
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, isCollapsed); // Save state
    });

    // --- AI Action Handlers ---

    function getCardContextForContinue(cardId) {
        const projectData = getActiveProjectData();
        const currentCard = projectData.cards[cardId];
        if (!currentCard) return { contextText: '', columnPrompt: '' };

        const columnIndex = currentCard.columnIndex;
        const columnData = getColumnData(columnIndex);
        const columnPrompt = columnData?.prompt || '';

        // Get siblings in the same column, same parent, ordered before current card
        let siblings;
        if (currentCard.parentId) {
            siblings = getChildCards(currentCard.parentId, columnIndex);
        } else {
            siblings = getColumnCards(columnIndex);
        }

        const cardsAbove = siblings.filter(c => c.order < currentCard.order);
        let contextText = cardsAbove.map(c => c.content || '').join('\n\n').trim();
        if (contextText) contextText += '\n\n---\n\n'; // Add separator if there was content above
        contextText += currentCard.content || '';

        return { contextText: contextText.trim(), columnPrompt };
    }

    // --- AI Action Handlers (Using aiService) ---

    function handleAiContinue(cardId) {
        if (!aiService.areAiSettingsValid()) {
            alert("Please configure AI settings first.");
            return;
        }
        const card = getCard(cardId);
        if (!card) return;

        const { contextText, columnPrompt } = getCardContextForContinue(cardId);

        // Create placeholder card *after* the current card
        const placeholderContent = "AI is thinking...";
        // Find the next sibling ID to insert before
        let insertBeforeId = null;
        let siblings;
        if (card.parentId) siblings = getChildCards(card.parentId, card.columnIndex);
        else siblings = getColumnCards(card.columnIndex);
        const currentIndex = siblings.findIndex(c => c.id === cardId);
        if (currentIndex !== -1 && currentIndex + 1 < siblings.length) {
            insertBeforeId = siblings[currentIndex + 1].id;
        }

        const newCardId = addCard(card.columnIndex, card.parentId, placeholderContent, insertBeforeId);
        if (!newCardId) return; // Failed to create card

        const newCardEl = getCardElement(newCardId);
        const newTextarea = newCardEl?.querySelector('.card-content');
        if (!newTextarea) {
             console.error("Could not find textarea for new AI card:", newCardId);
             getCard(newCardId).content = "Error: Could not find card textarea."; // Update data
             saveProjectsData();
             return;
        }

        aiService.generateContinuation({
            contextText,
            columnPrompt,
            onChunk: (delta) => {
                if (newTextarea.value === placeholderContent) {
                    newTextarea.value = ''; // Clear placeholder on first chunk
                    newTextarea.classList.remove('ai-loading');
                }
                newTextarea.value += delta;
                autoResizeTextarea({ target: newTextarea }); // Resize as content streams
            },
            onError: (error) => {
                newTextarea.value = `AI Error: ${error.message}`;
                newTextarea.classList.remove('ai-loading');
                const targetCard = getCard(newCardId);
                if (targetCard) targetCard.content = newTextarea.value; // Save error to data
                updateProjectLastModified();
                saveProjectsData();
            },
            onDone: (finalContent) => {
                 newTextarea.classList.remove('ai-loading');
                 const targetCard = getCard(newCardId);
                 if (targetCard) targetCard.content = finalContent; // Save final content to data
                 updateProjectLastModified();
                 saveProjectsData();
                 console.log("AI Continue completed for card:", newCardId);
            }
        });
    }

    function handleAiBreakdown(cardId) {
        if (!aiService.areAiSettingsValid()) { alert("Please configure AI settings first."); return; }
        const card = getCard(cardId);
        if (!card || !card.content?.trim()) { alert("Card has no content to breakdown."); return; }

        const targetColumnIndex = card.columnIndex + 1;
        const parentIdForNewCards = card.id; // New cards are children of the original

        // Create a single temporary placeholder in the next column
        const placeholderContent = "AI is thinking...";
        const tempCardId = addCard(targetColumnIndex, parentIdForNewCards, placeholderContent);
        if (!tempCardId) return;

        const tempCardEl = getCardElement(tempCardId);
        const tempTextarea = tempCardEl?.querySelector('.card-content');
        if (!tempTextarea) {
             console.error("Could not find textarea for temp AI card:", tempCardId);
             getCard(tempCardId).content = "Error: Could not find card textarea.";
             saveProjectsData();
             return;
        }

        aiService.generateBreakdown({
            cardContent: card.content,
            onChunk: (delta) => {
                 // Update the temporary card visually while streaming
                 if (tempTextarea.value === placeholderContent) {
                     tempTextarea.value = '';
                     tempTextarea.classList.remove('ai-loading');
                 }
                 tempTextarea.value += delta;
                 autoResizeTextarea({ target: tempTextarea });
            },
            onError: (error) => {
                tempTextarea.value = `AI Error: ${error.message}`;
                tempTextarea.classList.remove('ai-loading');
                const targetCard = getCard(tempCardId);
                if (targetCard) targetCard.content = tempTextarea.value; // Save error
                updateProjectLastModified();
                saveProjectsData();
            },
            onDone: (fullResponse) => {
                // Process the full response here
                const parts = fullResponse.split('---').map(p => p.trim()).filter(p => p.length > 0);
                let lastCardId = null; // Keep track of the last card processed/created

                if (parts.length > 0) {
                    // Reuse the temporary card for the first part
                    const firstPartContent = parts[0];
                    const tempCardData = getCard(tempCardId);

                    if (tempCardData && tempTextarea) {
                        tempTextarea.value = firstPartContent; // Update textarea content
                        tempTextarea.classList.remove('ai-loading');
                        autoResizeTextarea({ target: tempTextarea });
                        tempCardData.content = firstPartContent; // Update data model
                        lastCardId = tempCardId; // This is now the first real card
                        console.log(`AI Breakdown: Reused temp card ${tempCardId} for first part.`);
                    } else {
                        console.error("Could not find temp card data or textarea to reuse.");
                        // Fallback: delete the temp card if it couldn't be reused properly
                        if(getCard(tempCardId)) deleteCard(tempCardId); // Delete only if it still exists
                    }

                    // Create new cards for the remaining parts
                    if (parts.length > 1) {
                        let insertAfterCardId = lastCardId; // Start inserting after the reused card
                        parts.slice(1).forEach((partContent) => {
                            // Determine the ID of the card to insert *before* (null means append)
                            let insertBeforeId = null;
                            if (insertAfterCardId) {
                                const insertAfterCard = getCard(insertAfterCardId);
                                if (insertAfterCard) {
                                    // Find the next sibling in the data model to insert before
                                    let siblings;
                                     if (insertAfterCard.parentId) siblings = getChildCards(insertAfterCard.parentId, insertAfterCard.columnIndex);
                                     else siblings = getColumnCards(insertAfterCard.columnIndex);
                                     const currentIndex = siblings.findIndex(c => c.id === insertAfterCardId);
                                     if (currentIndex !== -1 && currentIndex + 1 < siblings.length) {
                                         insertBeforeId = siblings[currentIndex + 1].id;
                                     }
                                }
                            }

                            const newChildId = addCard(targetColumnIndex, parentIdForNewCards, partContent, insertBeforeId);
                            if (newChildId) {
                                lastCardId = newChildId; // Update lastCardId for the next iteration
                                insertAfterCardId = newChildId; // Next card should be inserted after this one
                            }
                        });
                    }
                } else {
                    // No valid parts returned, delete the temporary card
                    console.log("AI Breakdown: No valid parts returned, deleting temp card.");
                    if(getCard(tempCardId)) deleteCard(tempCardId); // Delete only if it still exists
                }

                // Ensure save after all modifications
                updateProjectLastModified();
                saveProjectsData();
                console.log(`AI Breakdown completed for card ${cardId}.`);

                // Optional: scroll to the last card (either reused or newly created)
                if (lastCardId && getCard(lastCardId)) { // Check if lastCardId is still valid
                    requestAnimationFrame(() => {
                        const lastEl = getCardElement(lastCardId);
                        scrollIntoViewIfNeeded(lastEl)
                    });
                }
            }
        });
    }

    function handleAiExpand(cardId) {
        if (!aiService.areAiSettingsValid()) { alert("Please configure AI settings first."); return; }
        const card = getCard(cardId);
        if (!card || !card.content?.trim()) { alert("Card has no content to expand."); return; }

        const targetColumnIndex = card.columnIndex + 1;
        const parentIdForNewCard = card.id; // New card is child of the original

        const placeholderContent = "AI is thinking...";
        // Add as a child in the next column
        const newCardId = addCard(targetColumnIndex, parentIdForNewCard, placeholderContent);
        if (!newCardId) return;

        const newCardEl = getCardElement(newCardId);
        const newTextarea = newCardEl?.querySelector('.card-content');
        if (!newTextarea) {
             console.error("Could not find textarea for new AI card:", newCardId);
              getCard(newCardId).content = "Error: Could not find card textarea."; // Update data
              saveProjectsData();
             return;
        }

        aiService.generateExpand({
            cardContent: card.content,
            onChunk: (delta) => {
                if (newTextarea.value === placeholderContent) {
                    newTextarea.value = '';
                    newTextarea.classList.remove('ai-loading');
                }
                newTextarea.value += delta;
                autoResizeTextarea({ target: newTextarea });
            },
            onError: (error) => {
                newTextarea.value = `AI Error: ${error.message}`;
                newTextarea.classList.remove('ai-loading');
                const targetCard = getCard(newCardId);
                if (targetCard) targetCard.content = newTextarea.value; // Save error
                updateProjectLastModified();
                saveProjectsData();
            },
            onDone: (finalContent) => {
                 newTextarea.classList.remove('ai-loading');
                 const targetCard = getCard(newCardId);
                 if (targetCard) targetCard.content = finalContent; // Save final content
                 updateProjectLastModified();
                 saveProjectsData();
                 console.log("AI Expand completed for card:", newCardId);
            }
        });
    }

    function handleAiCustom(cardId) {
        if (!aiService.areAiSettingsValid()) { alert("Please configure AI settings first."); return; }
        const card = getCard(cardId);
        if (!card) return;

        // --- Simple Modal Implementation ---
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

        const closeModal = () => {
            if (overlay.parentNode === document.body) { // Check if still attached
                 document.body.removeChild(overlay);
            }
        };

        cancelButton.addEventListener('click', closeModal);
        submitButton.addEventListener('click', () => {
            const userPrompt = promptInput.value.trim();
            if (!userPrompt) {
                alert("Please enter a prompt.");
                return;
            }
            closeModal(); // Close modal before processing

            // Proceed with AI call
            const targetColumnIndex = card.columnIndex + 1;
            const parentIdForNewCard = card.id;

            const placeholderContent = "AI is thinking...";
            const newCardId = addCard(targetColumnIndex, parentIdForNewCard, placeholderContent);
            if (!newCardId) return;

            const newCardEl = getCardElement(newCardId);
            const newTextarea = newCardEl?.querySelector('.card-content');
             if (!newTextarea) {
                 console.error("Could not find textarea for new AI card:", newCardId);
                 getCard(newCardId).content = "Error: Could not find card textarea."; // Update data
                 saveProjectsData();
                 return;
             }

            aiService.generateCustom({
                cardContent: card.content,
                userPrompt: userPrompt,
                onChunk: (delta) => {
                    if (newTextarea.value === placeholderContent) {
                        newTextarea.value = '';
                         newTextarea.classList.remove('ai-loading');
                    }
                    newTextarea.value += delta;
                    autoResizeTextarea({ target: newTextarea });
                },
                onError: (error) => {
                    newTextarea.value = `AI Error: ${error.message}`;
                     newTextarea.classList.remove('ai-loading');
                     const targetCard = getCard(newCardId);
                     if (targetCard) targetCard.content = newTextarea.value; // Save error
                     updateProjectLastModified();
                     saveProjectsData();
                },
                onDone: (finalContent) => {
                    // Process the full response, splitting by '---' like in handleAiBreakdown
                    const parts = finalContent.split('---').map(p => p.trim()).filter(p => p.length > 0);
                    let lastCardId = null; // Keep track of the last card processed/created

                    if (parts.length > 0) {
                        // Reuse the temporary card (newCardId) for the first part
                        const firstPartContent = parts[0];
                        const tempCardData = getCard(newCardId); // Use newCardId from handleAiCustom scope

                        if (tempCardData && newTextarea) {
                            newTextarea.value = firstPartContent; // Update textarea content
                            newTextarea.classList.remove('ai-loading');
                            autoResizeTextarea({ target: newTextarea });
                            tempCardData.content = firstPartContent; // Update data model
                            lastCardId = newCardId; // This is now the first real card
                            console.log(`AI Custom: Reused placeholder card ${newCardId} for first part.`);
                        } else {
                            console.error("Could not find placeholder card data or textarea to reuse for AI Custom.");
                            // Fallback: delete the placeholder if it couldn't be reused properly
                            if(getCard(newCardId)) deleteCard(newCardId); // Delete only if it still exists
                        }

                        // Create new cards for the remaining parts
                        if (parts.length > 1) {
                            let insertAfterCardId = lastCardId; // Start inserting after the reused card
                            parts.slice(1).forEach((partContent) => {
                                // Determine the ID of the card to insert *before* (null means append)
                                let insertBeforeId = null;
                                if (insertAfterCardId) {
                                    const insertAfterCard = getCard(insertAfterCardId);
                                    if (insertAfterCard) {
                                        // Find the next sibling in the data model to insert before
                                        let siblings;
                                         // Use parentIdForNewCard and targetColumnIndex from handleAiCustom scope
                                         if (parentIdForNewCard) siblings = getChildCards(parentIdForNewCard, targetColumnIndex);
                                         else siblings = getColumnCards(targetColumnIndex);
                                         const currentIndex = siblings.findIndex(c => c.id === insertAfterCardId);
                                         if (currentIndex !== -1 && currentIndex + 1 < siblings.length) {
                                             insertBeforeId = siblings[currentIndex + 1].id;
                                         }
                                    }
                                }

                                // Use targetColumnIndex and parentIdForNewCard from handleAiCustom scope
                                const newChildId = addCard(targetColumnIndex, parentIdForNewCard, partContent, insertBeforeId);
                                if (newChildId) {
                                    lastCardId = newChildId; // Update lastCardId for the next iteration
                                    insertAfterCardId = newChildId; // Next card should be inserted after this one
                                }
                            });
                        }
                    } else {
                        // No valid parts returned, delete the temporary card
                        console.log("AI Custom: No valid parts returned, deleting placeholder card.");
                        if(getCard(newCardId)) deleteCard(newCardId); // Delete only if it still exists
                    }

                    // Ensure save after all modifications
                    updateProjectLastModified();
                    saveProjectsData();
                    console.log(`AI Custom completed for original card ${parentIdForNewCard}.`); // Log based on original card

                    // Optional: scroll to the last card (either reused or newly created)
                    if (lastCardId && getCard(lastCardId)) { // Check if lastCardId is still valid
                        requestAnimationFrame(() => {
                            const lastEl = getCardElement(lastCardId);
                            scrollIntoViewIfNeeded(lastEl)
                        });
                    }
                }
            });
        });

        // Allow submitting with Enter in textarea
        promptInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
                e.preventDefault(); // Prevent newline
                submitButton.click(); // Trigger submit
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closeModal(); // Close on Escape
            }
        })

        // Close if clicking outside the modal content
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeModal();
            }
        });
    }

    // --- Keyboard Navigation Helpers ---

    function scrollIntoViewIfNeeded(element) {
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    /**
     * Finds a card's textarea, focuses it, sets cursor position, and scrolls into view.
     * @param {string} cardId - The ID of the card to focus.
     * @param {'start' | 'end' | 'preserve' | number} [position='preserve'] - Where to place the cursor ('start', 'end', 'preserve', or a specific index).
     */
    function focusCardTextarea(cardId, position = 'preserve') {
        const cardEl = getCardElement(cardId);
        if (!cardEl) {
            console.warn(`focusCardTextarea: Card element not found for ID ${cardId}`);
            return;
        }
        const textarea = cardEl.querySelector('textarea.card-content');
        if (!textarea) {
            console.warn(`focusCardTextarea: Textarea not found for card ID ${cardId}`);
            return;
        }

        // Ensure textarea is visible and interactable before focusing
        textarea.style.display = ''; // Ensure it's not display: none

        textarea.focus(); // Focus the element first

        // Set selection based on position after focus
        requestAnimationFrame(() => { // Use rAF to ensure focus is applied
            try {
                 if (typeof position === 'number') {
                     const pos = Math.max(0, Math.min(textarea.value.length, position)); // Clamp position
                     textarea.setSelectionRange(pos, pos);
                 } else if (position === 'start') {
                    textarea.setSelectionRange(0, 0);
                } else if (position === 'end') {
                    const len = textarea.value.length;
                    textarea.setSelectionRange(len, len);
                }
                // else 'preserve' - Do nothing, keep existing selection/cursor position
            } catch (e) {
                console.error(`Error setting selection range for card ${cardId}:`, e);
            }
            scrollHierarchy(cardId);
            highlightHierarchy(cardId); // Also highlight the hierarchy when focusing via shortcut
        });
        console.log(`Focused card ${cardId}, position: ${position}`);
    }

    // Helper function to update card content (used by shortcuts)
    function updateCardContent(cardId, newContent) {
        const projectData = getActiveProjectData();
        const card = projectData.cards[cardId];
        if (card) {
            if (card.content !== newContent) {
                card.content = newContent;
                updateProjectLastModified();
                saveProjectsData();
                console.log(`Card ${cardId} content updated via shortcut helper.`);

                // Also update the textarea value directly if the element exists
                const cardEl = getCardElement(cardId);
                const textarea = cardEl?.querySelector('textarea.card-content');
                if (textarea) {
                    textarea.value = newContent;
                    autoResizeTextarea({ target: textarea }); // Adjust height if needed
                }
            }
        } else {
            console.warn(`updateCardContent: Card ${cardId} not found in active project.`);
        }
    }


    // --- Initial Load ---
    // Initialize AI Settings UI and logic from aiService
    aiService.initializeAiSettings({
        providerUrlInput: aiProviderUrlInput,
        modelNameInput: aiModelNameInput,
        apiKeyInput: aiApiKeyInput,
        titleElement: aiSettingsTitle,
        updateAiFeatureVisibilityCallback: updateAiFeatureVisibility // Pass the callback
    });
    loadProjectsData(); // Loads all projects and determines/loads the active one
    renderProjectList(); // Render the sidebar
    renderApp(); // Render the main view for the active project

    // Add Project Button Listener
    addProjectBtn.addEventListener('click', addProject);

    // --- Load Initial Sidebar State ---
    const savedSidebarState = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (savedSidebarState === 'true') {
        document.body.classList.add('sidebar-collapsed');
    }

    // --- Keyboard Shortcut Integration ---
    // Define the helpers object to pass to the shortcut handler
    const shortcutHelpers = {
        getCard: getCard,
        addCard: addCard,
        deleteCard: deleteCard, // Keep the main one for standard deletion
        deleteCardInternal: deleteCardInternal, // For merge operations
        reparentChildren: reparentChildren, // For merge operations
        focusCardTextarea: focusCardTextarea,
        getCardElement: getCardElement,
        getColumnCards: getColumnCards,
        getChildCards: getChildCards,
        updateCardContent: updateCardContent,
        // Maybe add a function to trigger re-render of specific columns if needed?
        // rerenderColumns: (columnIndices) => { /* ... */ }
    };

    // Attach the single keydown listener using event delegation
    columnsContainer.addEventListener('keydown', (event) => {
        // Check if the cardShortcuts handler is available (due to defer loading)
        if (window.cardShortcuts && typeof window.cardShortcuts.handleCardTextareaKeydown === 'function') {
            window.cardShortcuts.handleCardTextareaKeydown(event, shortcutHelpers);
        } else {
             console.warn("cardShortcuts handler not yet available.");
        }
    });

}); // End DOMContentLoaded
