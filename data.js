// --- Constants ---
const PROJECTS_STORAGE_KEY = 'writingToolProjects';
const ACTIVE_PROJECT_ID_KEY = 'writingToolActiveProjectId';
const MIN_COLUMNS = 3;
const BASE_COLOR_HUE = 200; // Starting Hue for first root card
const HUE_ROTATION_STEP = 30; // Degrees to shift hue for each subsequent root card
const BASE_COLOR_SATURATION = 60;
const BASE_COLOR_LIGHTNESS = 90;
const GROUP_LIGHTNESS_STEP_DOWN = 3; // How much darker each card in a group gets vs the one above it

// --- State ---
let projects = {}; // { projectId: { id, title, lastModified, data: { columns: [{id, prompt?}], cards: {} } } }
let activeProjectId = null;

// --- Utility Functions ---
function generateId(prefix = 'id_') {
    return prefix + Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
}

// --- Project Management ---

function createDefaultProject(title = "Untitled Project") {
    const projectId = generateId('proj_');
    const defaultColumns = [];
    for (let i = 0; i < MIN_COLUMNS; i++) {
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

function addProjectData(title) {
    const newTitle = title.trim() || "Untitled Project";
    const newProject = createDefaultProject(newTitle);
    projects[newProject.id] = newProject;
    return newProject; // Return the created project data
}

function deleteProjectData(projectIdToDelete) {
    if (!projects[projectIdToDelete]) return { deleted: false, newActiveId: activeProjectId };

    const isDeletingActive = activeProjectId === projectIdToDelete;
    const projectTitle = projects[projectIdToDelete].title;
    delete projects[projectIdToDelete];

    let newActiveId = activeProjectId;
    if (isDeletingActive) {
        const remainingProjects = Object.values(projects).sort((a, b) => b.lastModified - a.lastModified);
        if (remainingProjects.length > 0) {
            newActiveId = remainingProjects[0].id;
        } else {
            // No projects left, create a new default one
            const defaultProject = createDefaultProject();
            projects[defaultProject.id] = defaultProject;
            newActiveId = defaultProject.id;
        }
    }
    activeProjectId = newActiveId; // Update internal state
    return { deleted: true, newActiveId: newActiveId, deletedTitle: projectTitle };
}

function switchActiveProject(newProjectId) {
    if (!projects[newProjectId] || newProjectId === activeProjectId) {
        return false; // Project doesn't exist or already active
    }
    activeProjectId = newProjectId;
    return true;
}

function updateProjectLastModified(projectId = activeProjectId) {
    if (projectId && projects[projectId]) {
        projects[projectId].lastModified = Date.now();
        return true;
    }
    return false;
}

function updateProjectTitle(projectId, newTitle) {
     if (projectId && projects[projectId] && newTitle && newTitle !== projects[projectId].title) {
         projects[projectId].title = newTitle;
         updateProjectLastModified(projectId);
         return true;
     }
     return false;
}

// --- Data Persistence ---

function getActiveProjectData() {
    if (!activeProjectId || !projects[activeProjectId]) {
        console.error("Attempting to get data for invalid or inactive project.");
        return null; // Return null or handle error appropriately
    }
    // Ensure data structure integrity on access
    const proj = projects[activeProjectId];
    if (!proj.data || !proj.data.columns || !proj.data.cards) {
        console.warn(`Project ${proj.id} has missing data structure, resetting it.`);
        const defaultData = createDefaultProject().data;
        proj.data = defaultData;
    }
    // Ensure columns have prompt property
    proj.data.columns.forEach(col => {
        if (col.prompt === undefined) col.prompt = '';
    });
    // Colors will be calculated on demand (e.g., during rendering)
    return proj.data;
}

function saveProjectsData() {
    try {
        localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
        console.log("All projects data saved.");
    } catch (e) {
        console.error("Error saving projects data to localStorage:", e);
        // Consider notifying the user
    }
}

function saveActiveProjectData() {
    const activeData = getActiveProjectData();
    if (activeData && activeProjectId) {
        // This function might be redundant if saveProjectsData() is always called after modifications.
        // However, if there are scenarios where only the active project's data needs saving
        // without saving *all* projects, this could be useful.
        // For now, it relies on the fact that getActiveProjectData() returns a direct reference,
        // so modifications are already in the 'projects' object.
        // We just need to ensure saveProjectsData() is called.
        saveProjectsData(); // For now, just call the main save function
        console.log(`Active project data (${activeProjectId}) implicitly saved via saveProjectsData.`);
    } else {
        console.warn("Attempted to save active project data, but no active project found.");
    }
}


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
    let loadedProjects = {};
    let determinedActiveId = null;

    if (savedProjects) {
        try {
            const parsedProjects = JSON.parse(savedProjects);
            if (parsedProjects && typeof parsedProjects === 'object' && !Array.isArray(parsedProjects)) {
                 loadedProjects = parsedProjects;
                 console.log("Projects loaded from localStorage.");
            } else {
                throw new Error("Invalid project data structure");
            }

            if (savedActiveId && loadedProjects[savedActiveId]) {
                determinedActiveId = savedActiveId;
            } else {
                const sortedProjects = Object.values(loadedProjects).sort((a, b) => b.lastModified - a.lastModified);
                if (sortedProjects.length > 0) {
                    determinedActiveId = sortedProjects[0].id;
                }
            }

        } catch (e) {
            console.error("Error parsing projects data from localStorage:", e);
            localStorage.removeItem(PROJECTS_STORAGE_KEY);
            localStorage.removeItem(ACTIVE_PROJECT_ID_KEY);
            loadedProjects = {}; // Reset
        }
    }

    if (Object.keys(loadedProjects).length === 0) {
        console.log("No projects found or loaded, creating default project.");
        const defaultProject = createDefaultProject();
        loadedProjects[defaultProject.id] = defaultProject;
        determinedActiveId = defaultProject.id;
        // Save the new default project immediately
        projects = loadedProjects; // Update global state
        activeProjectId = determinedActiveId;
        saveProjectsData();
        saveActiveProjectId();
    } else if (!determinedActiveId) {
        const sortedProjects = Object.values(loadedProjects).sort((a, b) => b.lastModified - a.lastModified);
        determinedActiveId = sortedProjects[0].id;
        saveActiveProjectId(); // Save the determined ID
    }

    projects = loadedProjects; // Update global state
    activeProjectId = determinedActiveId; // Update global state

    console.log(`Initial active project: ${projects[activeProjectId]?.title} (${activeProjectId})`);
    getActiveProjectData(); // Ensure active project data is validated/initialized
    return { projectsData: projects, activeId: activeProjectId };
}


// --- Card & Column Data Helpers ---

function getCard(id) {
    const projectData = getActiveProjectData();
    return projectData ? projectData.cards[id] : undefined;
}

function getColumnData(columnIndex) {
    const projectData = getActiveProjectData();
    if (projectData && columnIndex >= 0 && columnIndex < projectData.columns.length) {
        return projectData.columns[columnIndex];
    }
    return null;
}

function getColumnCards(columnIndex) {
    const projectData = getActiveProjectData();
    if (!projectData) return [];
    const allCards = projectData.cards;

    return Object.values(allCards)
           .filter(card => card.columnIndex === columnIndex)
           .sort((a, b) => {
               const aIsRoot = !a.parentId;
               const bIsRoot = !b.parentId;

               if (aIsRoot && bIsRoot) return a.order - b.order;
               if (aIsRoot) return -1;
               if (bIsRoot) return 1;
               // Both children
               if (a.parentId === b.parentId) return a.order - b.order;
               // Different parents, sort by parent order
               const parentA = allCards[a.parentId];
               const parentB = allCards[b.parentId];
               const parentAOrder = parentA ? parentA.order : Infinity;
               const parentBOrder = parentB ? parentB.order : Infinity;
               if (parentAOrder !== parentBOrder) return parentAOrder - parentBOrder;
               return a.order - b.order; // Tie-breaker
           });
}

function getChildCards(parentId, targetColumnIndex = null) {
    const projectData = getActiveProjectData();
    if (!projectData) return [];
    let children = Object.values(projectData.cards)
                     .filter(card => card.parentId === parentId);
    if (targetColumnIndex !== null) {
        children = children.filter(card => card.columnIndex === targetColumnIndex);
    }
    return children.sort((a, b) => a.order - b.order);
}

function getSiblingCards(cardId) {
    const projectData = getActiveProjectData();
    const card = projectData?.cards[cardId];
    if (!card) return [];

    const parentId = card.parentId;
    const columnIndex = card.columnIndex;

    return Object.values(projectData.cards)
        .filter(c => c.columnIndex === columnIndex && c.parentId === parentId) // Match column and parent (null parent for roots)
        .sort((a, b) => a.order - b.order);
}


function getDescendantIds(cardId) {
    const projectData = getActiveProjectData();
    if (!projectData) return [];
    let descendants = [];
    const directChildren = Object.values(projectData.cards).filter(card => card.parentId === cardId);
    directChildren.forEach(child => {
        descendants.push(child.id);
        descendants = descendants.concat(getDescendantIds(child.id));
    });
    return descendants;
}

function getAncestorIds(cardId) {
    const projectData = getActiveProjectData();
    if (!projectData) return [];
    let ancestors = [];
    let currentCard = projectData.cards[cardId];
    while (currentCard && currentCard.parentId) {
        ancestors.push(currentCard.parentId);
        currentCard = projectData.cards[currentCard.parentId];
    }
    return ancestors;
}

// --- Color Calculation ---
function getColorForCard(card) {
    if (!card) return `hsl(${BASE_COLOR_HUE}, ${BASE_COLOR_SATURATION}%, ${BASE_COLOR_LIGHTNESS}%)`;

    if (card.columnIndex === 0 && !card.parentId) { // Root Card
        const rootCards = getColumnCards(0); // Relies on active project data
        const rootIndex = rootCards.findIndex(c => c.id === card.id);
        const hue = (BASE_COLOR_HUE + (rootIndex >= 0 ? rootIndex : 0) * HUE_ROTATION_STEP) % 360;
        return `hsl(${hue}, ${BASE_COLOR_SATURATION}%, ${BASE_COLOR_LIGHTNESS}%)`;

    } else if (card.parentId) { // Child Card
        const parentCard = getCard(card.parentId); // Relies on active project data
        if (!parentCard) {
            return `hsl(${BASE_COLOR_HUE}, ${BASE_COLOR_SATURATION}%, ${BASE_COLOR_LIGHTNESS - GROUP_LIGHTNESS_STEP_DOWN}%)`;
        }

        const parentColor = parentCard.color || getColorForCard(parentCard); // Recursive call

        try {
            const match = parentColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
            if (match) {
                let [, h, s, l] = match.map(Number);
                const siblings = getSiblingCards(card.id); // Use new helper
                const siblingIndex = siblings.findIndex(c => c.id === card.id);
                const indexInGroup = siblingIndex >= 0 ? siblingIndex : 0;
                const newLightness = Math.max(15, l - (indexInGroup * GROUP_LIGHTNESS_STEP_DOWN));
                return `hsl(${h}, ${s}%, ${newLightness}%)`;
            } else {
                return `hsl(${BASE_COLOR_HUE}, ${BASE_COLOR_SATURATION}%, ${BASE_COLOR_LIGHTNESS}%)`;
            }
        } catch (e) {
            console.error("Error processing parent color:", e);
            return `hsl(${BASE_COLOR_HUE}, ${BASE_COLOR_SATURATION}%, ${BASE_COLOR_LIGHTNESS}%)`;
        }
    } else { // Orphan card in column > 0
        return `hsl(${BASE_COLOR_HUE}, ${BASE_COLOR_SATURATION}%, ${BASE_COLOR_LIGHTNESS}%)`;
    }
}

// --- Data Modification Functions ---

function addCardData(columnIndex, parentId = null, initialContent = '', insertBeforeCardId = null) {
    const projectData = getActiveProjectData();
    if (!projectData) return null;

    if (parentId && !projectData.cards[parentId]) {
        console.error(`Cannot add card: Parent ${parentId} not found.`);
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

    projectData.cards[newCardId] = newCard;

    // Calculate order
    const siblings = getSiblingCards(newCardId).filter(c => c.id !== newCardId); // Get siblings excluding self
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
            console.warn(`Invalid insertBeforeCardId ${insertBeforeCardId}. Appending.`);
            newOrder = siblings.length > 0 ? Math.max(...siblings.map(c => c.order)) + 1 : 0;
        }
    } else { // Append
        newOrder = siblings.length > 0 ? Math.max(...siblings.map(c => c.order)) + 1 : 0;
    }
    newCard.order = newOrder;

    // Calculate Color
    newCard.color = getColorForCard(newCard);

    // Update other root card colors if a new root was added/reordered
    if (columnIndex === 0 && !parentId) {
         const rootCards = getColumnCards(0);
         rootCards.forEach(rc => {
              const newColor = getColorForCard(rc);
              if (rc.color !== newColor) rc.color = newColor;
         });
    }

    // Ensure column exists in data
    while (projectData.columns.length <= columnIndex) {
         addColumnData(false); // Add column data without saving yet
    }

    updateProjectLastModified();
    // Note: saveProjectsData() should be called by the caller (e.g., script.js) after DOM updates

    console.log(`Card data ${newCardId} added to col ${columnIndex}, parent: ${parentId}, order: ${newCard.order}`);
    return newCard; // Return the full card object
}

function updateCardContentData(cardId, newContent) {
    const card = getCard(cardId);
    if (card && card.content !== newContent) {
        card.content = newContent;
        updateProjectLastModified();
        // saveProjectsData() should be called by the caller
        return true;
    }
    return false;
}

function updateCardNameData(cardId, newName) {
    const card = getCard(cardId);
    // Allow setting name to null (will display ID)
    if (card && card.name !== newName) {
        card.name = newName; // newName can be null or a string
        updateProjectLastModified();
        // saveProjectsData() should be called by the caller
        return true;
    }
    return false;
}


function deleteCardData(cardId) {
    const projectData = getActiveProjectData();
    const card = projectData?.cards[cardId];
    if (!card) return { deletedIds: [], affectedColumns: new Set(), rootColorsNeedUpdate: false };

    const descendantIds = getDescendantIds(cardId);
    const allIdsToDelete = [cardId, ...descendantIds];
    const affectedColumns = new Set();
    const wasRoot = !card.parentId && card.columnIndex === 0;
    let rootColorsNeedUpdate = wasRoot;

    allIdsToDelete.forEach(id => {
        const c = projectData.cards[id];
        if (c) {
            affectedColumns.add(c.columnIndex);
            // Add next column index if descendants might be there
            if (projectData.columns.length > c.columnIndex + 1) {
                 affectedColumns.add(c.columnIndex + 1);
            }
            delete projectData.cards[id];
        }
    });

    // If a root card was deleted, other root colors might need updating
    if (rootColorsNeedUpdate) {
        const rootCards = getColumnCards(0);
        rootCards.forEach(rc => rc.color = getColorForCard(rc)); // Recalculate
        affectedColumns.add(0); // Ensure column 0 is considered for re-render
    }

    updateProjectLastModified();
    // saveProjectsData() should be called by the caller

    console.log(`Card data ${cardId} and ${descendantIds.length} descendants deleted.`);
    return { deletedIds: allIdsToDelete, affectedColumns, rootColorsNeedUpdate };
}

function addColumnData(doSave = true) {
    const projectData = getActiveProjectData();
    if (!projectData) return -1;

    const newIndex = projectData.columns.length;
    projectData.columns.push({ id: `col-${generateId()}`, prompt: '' });
    console.log(`Column data added, new count: ${projectData.columns.length}`);
    if (doSave) {
         updateProjectLastModified();
         saveProjectsData();
    }
    return newIndex;
}

function deleteColumnData(columnIndex) {
    const projectData = getActiveProjectData();
    if (!projectData) return false;

    const numColumns = projectData.columns.length;
    const isRightmost = columnIndex === numColumns - 1;
    const columnCards = getColumnCards(columnIndex);
    const canDelete = isRightmost && numColumns > MIN_COLUMNS && columnCards.length === 0;

    if (!canDelete) return false;

    if(projectData.columns.length > columnIndex) {
         projectData.columns.splice(columnIndex, 1);
         updateProjectLastModified();
         // saveProjectsData() should be called by the caller
         console.log(`Column data ${columnIndex} deleted.`);
         return true;
    }
    return false;
}

function setColumnPromptData(columnIndex, newPrompt) {
    const columnData = getColumnData(columnIndex);
    if (columnData && columnData.prompt !== newPrompt) {
        columnData.prompt = newPrompt;
        updateProjectLastModified();
        // saveProjectsData() should be called by the caller
        return true;
    }
    return false;
}

function moveCardData(cardId, targetColumnIndex, newParentId, insertBeforeCardId) {
    const projectData = getActiveProjectData();
    const card = projectData?.cards[cardId];
    if (!card) return { success: false };

    const originalColumnIndex = card.columnIndex;
    const originalParentId = card.parentId;
    const wasRoot = !originalParentId && originalColumnIndex === 0;

    // Prevent dropping into self/descendant
    let tempParentId = newParentId;
    while(tempParentId) {
        if (tempParentId === cardId) return { success: false, reason: "Cannot move into self/descendant" };
        tempParentId = projectData.cards[tempParentId]?.parentId;
    }

    // Update card basic properties
    card.columnIndex = targetColumnIndex;
    card.parentId = newParentId;
    const isBecomingRoot = !newParentId && targetColumnIndex === 0;

    // Calculate new order
    const siblings = getSiblingCards(cardId).filter(c => c.id !== cardId); // Exclude self
    let newOrder;
    if (insertBeforeCardId && insertBeforeCardId !== cardId) {
        const insertBeforeCard = projectData.cards[insertBeforeCardId];
        if (insertBeforeCard && insertBeforeCard.columnIndex === targetColumnIndex && insertBeforeCard.parentId === newParentId) {
             const insertBeforeOrder = insertBeforeCard.order;
             const insertBeforeIndexInSiblings = siblings.findIndex(c => c.id === insertBeforeCardId);
             let prevOrder = -1;
             if(insertBeforeIndexInSiblings > 0) prevOrder = siblings[insertBeforeIndexInSiblings - 1].order;
             else if (insertBeforeIndexInSiblings === 0) prevOrder = -1;
             newOrder = (prevOrder + insertBeforeOrder) / 2.0;
        } else {
             console.warn(`Invalid insertBeforeCardId ${insertBeforeCardId}. Appending.`);
             newOrder = siblings.length > 0 ? Math.max(...siblings.map(c => c.order)) + 1 : 0;
        }
    } else { // Append
        newOrder = siblings.length > 0 ? Math.max(...siblings.map(c => c.order)) + 1 : 0;
    }
    card.order = newOrder;

    // Update Color
    card.color = getColorForCard(card);

    // Update descendants
    const columnDiff = targetColumnIndex - originalColumnIndex;
    const affectedDescendants = [];
    let maxDescendantCol = targetColumnIndex;
    const descendants = getDescendantIds(cardId);

    descendants.forEach(descId => {
        const descCard = projectData.cards[descId];
        if (descCard) {
            descCard.columnIndex += columnDiff;
            descCard.color = getColorForCard(descCard);
            affectedDescendants.push(descCard);
            maxDescendantCol = Math.max(maxDescendantCol, descCard.columnIndex);
        }
    });
    // If column didn't change, still update descendant colors
    if (columnDiff === 0) {
        descendants.forEach(descId => {
             const descCard = projectData.cards[descId];
             if (descCard && !affectedDescendants.find(d => d.id === descId)) {
                 descCard.color = getColorForCard(descCard);
                 affectedDescendants.push(descCard);
             }
         });
    }

    // Update colors of other root cards if hierarchy changed
    let rootColorsNeedUpdate = false;
    if (wasRoot !== isBecomingRoot || (isBecomingRoot && card.order !== projectData.cards[cardId].order) || wasRoot) {
         rootColorsNeedUpdate = true;
    }

    // Ensure enough columns exist in data
    while (projectData.columns.length <= maxDescendantCol) {
         addColumnData(false); // Add column data without saving
    }

    // Determine Columns affected for potential re-render
    const columnsToUpdate = new Set();
    columnsToUpdate.add(originalColumnIndex);
    columnsToUpdate.add(targetColumnIndex);
    if (originalParentId) {
        const originalParentCard = getCard(originalParentId);
        if (originalParentCard) columnsToUpdate.add(originalParentCard.columnIndex + 1);
    }
     if (newParentId) {
         const newParentCard = getCard(newParentId);
         if (newParentCard) columnsToUpdate.add(newParentCard.columnIndex + 1);
     }
    affectedDescendants.forEach(desc => columnsToUpdate.add(desc.columnIndex));
    if (projectData.columns.length > originalColumnIndex + 1) columnsToUpdate.add(originalColumnIndex + 1);
    if (projectData.columns.length > targetColumnIndex + 1) columnsToUpdate.add(targetColumnIndex + 1);

    // Update root colors if needed
    if (rootColorsNeedUpdate) {
         const rootCards = getColumnCards(0);
         rootCards.forEach(rc => rc.color = getColorForCard(rc));
         columnsToUpdate.add(0);
    }

    const validColumnsToUpdate = Array.from(columnsToUpdate)
                                  .filter(idx => idx !== undefined && idx !== null && idx >= 0 && idx < projectData.columns.length)
                                  .sort((a, b) => a - b);

    updateProjectLastModified();
    // saveProjectsData() should be called by the caller

    console.log(`Card data ${cardId} moved -> Col ${targetColumnIndex}, Parent: ${newParentId || 'root'}, Order: ${card.order}`);
    return { success: true, affectedColumns: validColumnsToUpdate, rootColorsUpdated: rootColorsNeedUpdate };
}

function reparentChildrenData(oldParentId, newParentId) {
    const projectData = getActiveProjectData();
    const oldParentCard = projectData?.cards[oldParentId];
    const newParentCard = projectData?.cards[newParentId];

    if (!oldParentCard || !newParentCard) return { success: false };

    const childrenToMove = getChildCards(oldParentId);
    if (childrenToMove.length === 0) return { success: true, affectedColumns: new Set() }; // No children to move

    const affectedColumns = new Set();
    affectedColumns.add(newParentCard.columnIndex + 1); // New parent's group column
    childrenToMove.forEach(child => affectedColumns.add(child.columnIndex)); // Original child columns

    childrenToMove.sort((a, b) => a.order - b.order);

    const lastChildOrders = {};

    childrenToMove.forEach(child => {
        const targetChildColumnIndex = child.columnIndex;
        affectedColumns.add(targetChildColumnIndex);

        if (lastChildOrders[targetChildColumnIndex] === undefined) {
             const existingSiblingsInTargetCol = getChildCards(newParentId, targetChildColumnIndex);
             lastChildOrders[targetChildColumnIndex] = existingSiblingsInTargetCol.length > 0
                 ? Math.max(...existingSiblingsInTargetCol.map(c => c.order))
                 : -1;
        }

        child.parentId = newParentId;
        lastChildOrders[targetChildColumnIndex] += 1;
        child.order = lastChildOrders[targetChildColumnIndex];
        child.color = getColorForCard(child);

        const descendants = getDescendantIds(child.id);
        descendants.forEach(descId => {
            const descCard = projectData.cards[descId];
            if (descCard) {
                descCard.color = getColorForCard(descCard);
                affectedColumns.add(descCard.columnIndex);
            }
        });
    });

    updateProjectLastModified();
    // saveProjectsData() should be called by the caller

    const validColumnsToUpdate = Array.from(affectedColumns)
        .filter(idx => idx >= 0 && idx < projectData.columns.length)
        .sort((a, b) => a - b);

    console.log(`Reparented ${childrenToMove.length} children from ${oldParentId} to ${newParentId}.`);
    return { success: true, affectedColumns: validColumnsToUpdate };
}


// --- Exports ---
export {
    // State (consider exporting getters instead if direct modification is risky)
    projects,
    activeProjectId,
    // Constants
    MIN_COLUMNS,
    // Functions
    generateId,
    createDefaultProject,
    addProjectData,
    deleteProjectData,
    switchActiveProject,
    updateProjectLastModified,
    updateProjectTitle,
    getActiveProjectData,
    saveProjectsData,
    saveActiveProjectData,
    saveActiveProjectId,
    loadProjectsData,
    getCard,
    getColumnData,
    getColumnCards,
    getChildCards,
    getSiblingCards,
    getDescendantIds,
    getAncestorIds,
    getColorForCard,
    addCardData,
    updateCardContentData,
    updateCardNameData,
    deleteCardData,
    addColumnData,
    deleteColumnData,
    setColumnPromptData,
    moveCardData,
    reparentChildrenData
};
