// DataService encapsulates project and card management logic.
// Note: This file was created as part of Task 2 of the v7 refactor plan.

// --- Constants ---
export const PROJECTS_STORAGE_KEY = 'writingToolProjects';
export const ACTIVE_PROJECT_ID_KEY = 'writingToolActiveProjectId';
export const MIN_COLUMNS = 3;
export const BASE_COLOR_HUE = 200; // Starting Hue for first root card
export const HUE_ROTATION_STEP = 30; // Degrees to shift hue for each subsequent root card
export const BASE_COLOR_SATURATION = 60;
export const BASE_COLOR_LIGHTNESS = 90;
export const GROUP_LIGHTNESS_STEP_DOWN = 3; // How much darker each card in a group gets vs the one above it

export default class DataService {
    constructor(initialProjects = {}, initialActiveProjectId = null) {
        this.projects = initialProjects;
        this.activeProjectId = initialActiveProjectId;
    }

    // --- Utility Functions ---
    generateId(prefix = 'id_') {
        return prefix + Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
    }

    // --- Project Management ---
    validateProjectData(importedData) {
        if (!importedData || typeof importedData !== 'object') return false;
        return Array.isArray(importedData.columns) && typeof importedData.cards === 'object' && importedData.cards !== null;
    }

    createDefaultProject(title = 'Untitled Project') {
        const projectId = this.generateId('proj_');
        const defaultColumns = [];
        for (let i = 0; i < MIN_COLUMNS; i++) {
            defaultColumns.push({ id: `col-${this.generateId()}`, prompt: '' });
        }
        return {
            id: projectId,
            title: title,
            lastModified: Date.now(),
            data: {
                columns: defaultColumns,
                cards: {},
                globalPrompt: ''
            }
        };
    }

    addProjectData(title, initialProjectData = null) {
        const newTitle = (title || '').trim() || 'Untitled Project';
        const newProject = this.createDefaultProject(newTitle);

        if (initialProjectData && this.validateProjectData(initialProjectData)) {
            newProject.data = initialProjectData;
            if (newProject.data.globalPrompt === undefined) {
                newProject.data.globalPrompt = '';
            }
            console.log(`Creating project "${newTitle}" with imported data.`);
        }

        this.projects[newProject.id] = newProject;
        return newProject;
    }

    deleteProjectData(projectIdToDelete) {
        if (!this.projects[projectIdToDelete]) return { deleted: false, newActiveId: this.activeProjectId };

        const isDeletingActive = this.activeProjectId === projectIdToDelete;
        const projectTitle = this.projects[projectIdToDelete].title;
        delete this.projects[projectIdToDelete];

        let newActiveId = this.activeProjectId;
        if (isDeletingActive) {
            const remaining = Object.values(this.projects).sort((a, b) => b.lastModified - a.lastModified);
            if (remaining.length > 0) {
                newActiveId = remaining[0].id;
            } else {
                const defaultProject = this.createDefaultProject();
                this.projects[defaultProject.id] = defaultProject;
                newActiveId = defaultProject.id;
            }
        }
        this.activeProjectId = newActiveId;
        return { deleted: true, newActiveId, deletedTitle: projectTitle };
    }

    switchActiveProject(newProjectId) {
        if (!this.projects[newProjectId] || newProjectId === this.activeProjectId) {
            return false;
        }
        this.activeProjectId = newProjectId;
        return true;
    }

    updateProjectLastModified(projectId = this.activeProjectId) {
        if (projectId && this.projects[projectId]) {
            this.projects[projectId].lastModified = Date.now();
            return true;
        }
        return false;
    }

    updateProjectTitle(projectId, newTitle) {
        if (projectId && this.projects[projectId] && newTitle && newTitle !== this.projects[projectId].title) {
            this.projects[projectId].title = newTitle;
            this.updateProjectLastModified(projectId);
            return true;
        }
        return false;
    }

    // --- Data Persistence ---
    getActiveProjectData() {
        if (!this.activeProjectId || !this.projects[this.activeProjectId]) {
            console.error('Attempting to get data for invalid or inactive project.');
            return null;
        }
        const proj = this.projects[this.activeProjectId];
        if (!proj.data || !proj.data.columns || !proj.data.cards) {
            console.warn(`Project ${proj.id} has missing data structure, resetting it.`);
            proj.data = this.createDefaultProject().data;
        }
        proj.data.columns.forEach(col => { if (col.prompt === undefined) col.prompt = ''; });
        if (proj.data.globalPrompt === undefined) {
            proj.data.globalPrompt = '';
        }
        return proj.data;
    }

    saveProjectsData() {
        try {
            window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(this.projects));
            console.log('All projects data saved.');
        } catch (e) {
            console.error('Error saving projects data to localStorage:', e);
        }
    }

    saveActiveProjectData() {
        const activeData = this.getActiveProjectData();
        if (activeData && this.activeProjectId) {
            this.saveProjectsData();
            console.log(`Active project data (${this.activeProjectId}) implicitly saved via saveProjectsData.`);
        } else {
            console.warn('Attempted to save active project data, but no active project found.');
        }
    }

    saveActiveProjectId() {
        if (this.activeProjectId) {
            window.localStorage.setItem(ACTIVE_PROJECT_ID_KEY, this.activeProjectId);
        } else {
            window.localStorage.removeItem(ACTIVE_PROJECT_ID_KEY);
        }
    }

    loadProjectsData() {
        const savedProjects = window.localStorage.getItem(PROJECTS_STORAGE_KEY);
        const savedActiveId = window.localStorage.getItem(ACTIVE_PROJECT_ID_KEY);
        let loadedProjects = {};
        let determinedActiveId = null;

        if (savedProjects) {
            try {
                const parsedProjects = JSON.parse(savedProjects);
                if (parsedProjects && typeof parsedProjects === 'object' && !Array.isArray(parsedProjects)) {
                    loadedProjects = parsedProjects;
                    console.log('Projects loaded from localStorage.');
                } else {
                    throw new Error('Invalid project data structure');
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
                console.error('Error parsing projects data from localStorage:', e);
                window.localStorage.removeItem(PROJECTS_STORAGE_KEY);
                window.localStorage.removeItem(ACTIVE_PROJECT_ID_KEY);
                loadedProjects = {};
            }
        }

        if (Object.keys(loadedProjects).length === 0) {
            console.log('No projects found or loaded, creating default project.');
            const defaultProject = this.createDefaultProject();
            loadedProjects[defaultProject.id] = defaultProject;
            determinedActiveId = defaultProject.id;
            this.projects = loadedProjects;
            this.activeProjectId = determinedActiveId;
            this.saveProjectsData();
            this.saveActiveProjectId();
        } else if (!determinedActiveId) {
            const sortedProjects = Object.values(loadedProjects).sort((a, b) => b.lastModified - a.lastModified);
            determinedActiveId = sortedProjects[0].id;
            this.projects = loadedProjects;
            this.activeProjectId = determinedActiveId;
            this.saveActiveProjectId();
        } else {
            this.projects = loadedProjects;
            this.activeProjectId = determinedActiveId;
        }

        console.log(`Initial active project: ${this.projects[this.activeProjectId]?.title} (${this.activeProjectId})`);
        this.getActiveProjectData();
        return { projectsData: this.projects, activeId: this.activeProjectId };
    }

    // --- Card & Column Data Helpers ---
    getCard(id) {
        const projectData = this.getActiveProjectData();
        return projectData ? projectData.cards[id] : undefined;
    }

    getColumnData(columnIndex) {
        const projectData = this.getActiveProjectData();
        if (projectData && columnIndex >= 0 && columnIndex < projectData.columns.length) {
            return projectData.columns[columnIndex];
        }
        return null;
    }

    getOrderPath(cardId, cardsMap) {
        const path = [];
        let currentCard = cardsMap[cardId];
        while (currentCard) {
            path.unshift(currentCard.order);
            currentCard = currentCard.parentId ? cardsMap[currentCard.parentId] : null;
        }
        if (path.length === 0 && cardsMap[cardId]?.columnIndex !== 0) {
            console.warn(`Card ${cardId} in column ${cardsMap[cardId]?.columnIndex} has no parent path.`);
            path.push(cardsMap[cardId]?.order ?? Infinity);
        }
        return path;
    }

    compareOrderPaths(pathA, pathB) {
        const len = Math.max(pathA.length, pathB.length);
        for (let i = 0; i < len; i++) {
            if (i >= pathA.length && i < pathB.length) return -1;
            if (i < pathA.length && i >= pathB.length) return 1;
            if (i >= pathA.length && i >= pathB.length) return 0;
            const orderA = pathA[i];
            const orderB = pathB[i];
            if (orderA !== orderB) {
                return orderA - orderB;
            }
        }
        return 0;
    }

    getColumnCards(columnIndex) {
        const projectData = this.getActiveProjectData();
        if (!projectData) return [];
        const allCards = projectData.cards;
        const cardPaths = {};
        const columnCardIds = Object.keys(allCards).filter(id => allCards[id].columnIndex === columnIndex);
        columnCardIds.forEach(id => { cardPaths[id] = this.getOrderPath(id, allCards); });
        columnCardIds.sort((idA, idB) => {
            const pathA = cardPaths[idA];
            const pathB = cardPaths[idB];
            return this.compareOrderPaths(pathA, pathB);
        });
        return columnCardIds.map(id => allCards[id]);
    }

    getChildCards(parentId, columnIndex = null) {
        const projectData = this.getActiveProjectData();
        if (!projectData) return [];
        return Object.values(projectData.cards).filter(card => {
            if (columnIndex !== null && card.columnIndex !== columnIndex) return false;
            return card.parentId === parentId;
        });
    }

    getSiblingCards(cardId) {
        const projectData = this.getActiveProjectData();
        const card = projectData?.cards[cardId];
        if (!projectData || !card) return [];
        return Object.values(projectData.cards).filter(c => c.parentId === card.parentId && c.id !== cardId && c.columnIndex === card.columnIndex);
    }

    getDescendantIds(cardId) {
        const projectData = this.getActiveProjectData();
        if (!projectData) return [];
        const descendants = [];
        const stack = [cardId];
        while (stack.length > 0) {
            const currentId = stack.pop();
            const children = this.getChildCards(currentId);
            children.forEach(child => {
                descendants.push(child.id);
                stack.push(child.id);
            });
        }
        return descendants;
    }

    getAncestorIds(cardId) {
        const projectData = this.getActiveProjectData();
        if (!projectData) return [];
        const ancestors = [];
        let currentCard = projectData.cards[cardId];
        while (currentCard && currentCard.parentId) {
            ancestors.unshift(currentCard.parentId);
            currentCard = projectData.cards[currentCard.parentId];
        }
        return ancestors;
    }

    getColorForCard(card, cardsMap = null) {
        const projectData = this.getActiveProjectData();
        if (!projectData) return 'hsl(0,0%,100%)';
        const cards = cardsMap || projectData.cards;
        if (card.parentId === null) {
            const rootCards = this.getColumnCards(0);
            const rootIndex = rootCards.findIndex(c => c.id === card.id);
            const hue = BASE_COLOR_HUE + (rootIndex * HUE_ROTATION_STEP);
            return `hsl(${hue}, ${BASE_COLOR_SATURATION}%, ${BASE_COLOR_LIGHTNESS}%)`;
        }
        const parent = cards[card.parentId];
        if (!parent) return `hsl(${BASE_COLOR_HUE}, ${BASE_COLOR_SATURATION}%, ${BASE_COLOR_LIGHTNESS}%)`;
        const baseColor = this.getColorForCard(parent, cards);
        const match = baseColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
        if (match) {
            const [_, hue, sat, light] = match.map(Number);
            const newLight = Math.max(0, light - GROUP_LIGHTNESS_STEP_DOWN);
            return `hsl(${hue}, ${sat}%, ${newLight}%)`;
        }
        return baseColor;
    }

    addCardData(parentId, columnIndex, order = 0) {
        const projectData = this.getActiveProjectData();
        if (!projectData) return null;
        const id = this.generateId('card_');
        const card = {
            id,
            parentId,
            columnIndex,
            order,
            content: '',
            name: null,
            color: '',
        };
        projectData.cards[id] = card;
        card.color = this.getColorForCard(card);
        this.updateProjectLastModified();
        return card;
    }

    updateCardContentData(cardId, newContent) {
        const projectData = this.getActiveProjectData();
        const card = projectData?.cards[cardId];
        if (card) {
            card.content = newContent;
            this.updateProjectLastModified();
            return true;
        }
        return false;
    }

    updateCardNameData(cardId, newName) {
        const projectData = this.getActiveProjectData();
        const card = projectData?.cards[cardId];
        if (card) {
            card.name = newName || null;
            this.updateProjectLastModified();
            return true;
        }
        return false;
    }

    deleteCardData(cardId) {
        const projectData = this.getActiveProjectData();
        if (!projectData) return { deletedIds: [], affectedColumns: [] };
        const toDelete = [cardId, ...this.getDescendantIds(cardId)];
        const affectedColumns = new Set();
        toDelete.forEach(id => {
            const card = projectData.cards[id];
            if (card) {
                affectedColumns.add(card.columnIndex);
                delete projectData.cards[id];
            }
        });
        this.updateProjectLastModified();
        return { deletedIds: toDelete, affectedColumns: Array.from(affectedColumns).sort((a,b)=>a-b) };
    }

    addColumnData() {
        const projectData = this.getActiveProjectData();
        if (!projectData) return false;
        const newColumn = { id: `col-${this.generateId()}`, prompt: '' };
        projectData.columns.push(newColumn);
        this.updateProjectLastModified();
        return true;
    }

    deleteColumnData() {
        const projectData = this.getActiveProjectData();
        if (!projectData) return false;
        if (projectData.columns.length <= MIN_COLUMNS) return false;
        const lastColumnIndex = projectData.columns.length - 1;
        const hasCards = Object.values(projectData.cards).some(c => c.columnIndex === lastColumnIndex);
        if (hasCards) return false;
        projectData.columns.pop();
        this.updateProjectLastModified();
        return true;
    }

    setColumnPromptData(columnIndex, prompt) {
        const projectData = this.getActiveProjectData();
        const column = projectData?.columns[columnIndex];
        if (column) {
            column.prompt = prompt;
            this.updateProjectLastModified();
            return true;
        }
        return false;
    }

    getGlobalPromptData() {
        const projectData = this.getActiveProjectData();
        return projectData ? projectData.globalPrompt : '';
    }

    setGlobalPromptData(prompt) {
        const projectData = this.getActiveProjectData();
        if (projectData) {
            projectData.globalPrompt = prompt;
            this.updateProjectLastModified();
            return true;
        }
        return false;
    }

    moveCardData(cardId, targetColumnIndex, targetOrder) {
        const projectData = this.getActiveProjectData();
        const card = projectData?.cards[cardId];
        if (!projectData || !card) return { success: false };
        const oldColumnIndex = card.columnIndex;
        card.columnIndex = targetColumnIndex;
        card.order = targetOrder;
        card.color = this.getColorForCard(card);
        const affected = new Set([oldColumnIndex, targetColumnIndex]);
        this.updateProjectLastModified();
        return { success: true, affectedColumns: Array.from(affected).sort((a,b)=>a-b) };
    }

    reparentChildrenData(oldParentId, newParentId) {
        const projectData = this.getActiveProjectData();
        if (!projectData) return { success: false };
        const oldParentCard = projectData.cards[oldParentId];
        const newParentCard = projectData.cards[newParentId];
        if (!oldParentCard || !newParentCard) return { success: false };
        const childrenToMove = this.getChildCards(oldParentId);
        if (childrenToMove.length === 0) return { success: true, affectedColumns: new Set() };
        const affectedColumns = new Set();
        affectedColumns.add(newParentCard.columnIndex + 1);
        childrenToMove.forEach(child => affectedColumns.add(child.columnIndex));
        childrenToMove.sort((a,b)=>a.order-b.order);
        const baseOrders = {};
        const processedColumns = new Set();
        childrenToMove.forEach(child => {
            const targetChildColumnIndex = child.columnIndex;
            if (!processedColumns.has(targetChildColumnIndex)) {
                const existingSiblingsInTargetCol = this.getChildCards(newParentId, targetChildColumnIndex);
                baseOrders[targetChildColumnIndex] = existingSiblingsInTargetCol.length > 0
                    ? Math.max(...existingSiblingsInTargetCol.map(c => c.order))
                    : -1;
                processedColumns.add(targetChildColumnIndex);
            }
        });
        let lastAssignedOrder = {};
        childrenToMove.forEach(child => {
            const targetChildColumnIndex = child.columnIndex;
            affectedColumns.add(targetChildColumnIndex);
            const baseOrder = baseOrders[targetChildColumnIndex];
            const prevMovedOrder = lastAssignedOrder[targetChildColumnIndex] ?? baseOrder;
            const nextOrder = prevMovedOrder + 1;
            child.order = (prevMovedOrder + nextOrder) / 2.0;
            lastAssignedOrder[targetChildColumnIndex] = child.order;
            child.parentId = newParentId;
            child.color = this.getColorForCard(child);
            const descendants = this.getDescendantIds(child.id);
            descendants.forEach(descId => {
                const descCard = projectData.cards[descId];
                if (descCard) {
                    descCard.color = this.getColorForCard(descCard);
                    affectedColumns.add(descCard.columnIndex);
                }
            });
        });
        this.updateProjectLastModified();
        const validColumnsToUpdate = Array.from(affectedColumns)
            .filter(idx => idx >= 0 && idx < projectData.columns.length)
            .sort((a,b)=>a-b);
        console.log(`Reparented ${childrenToMove.length} children from ${oldParentId} to ${newParentId}.`);
        return { success: true, affectedColumns: validColumnsToUpdate };
    }
}
