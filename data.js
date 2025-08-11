import DataService, {
    PROJECTS_STORAGE_KEY,
    ACTIVE_PROJECT_ID_KEY,
    MIN_COLUMNS,
    BASE_COLOR_HUE,
    HUE_ROTATION_STEP,
    BASE_COLOR_SATURATION,
    BASE_COLOR_LIGHTNESS,
    GROUP_LIGHTNESS_STEP_DOWN
} from './src/services/data/DataService.js';

const dataService = new DataService();

export let projects = dataService.projects;
export let activeProjectId = dataService.activeProjectId;

function syncState() {
    projects = dataService.projects;
    activeProjectId = dataService.activeProjectId;
}

// Utility and project management proxies
export function generateId(prefix) { return dataService.generateId(prefix); }
export function validateProjectData(data) { return dataService.validateProjectData(data); }
export function createDefaultProject(title) { return dataService.createDefaultProject(title); }
export function addProjectData(title, data) { const res = dataService.addProjectData(title, data); syncState(); return res; }
export function deleteProjectData(id) { const res = dataService.deleteProjectData(id); syncState(); return res; }
export function switchActiveProject(id) { const res = dataService.switchActiveProject(id); syncState(); return res; }
export function updateProjectLastModified(id) { const res = dataService.updateProjectLastModified(id); syncState(); return res; }
export function updateProjectTitle(id, title) { const res = dataService.updateProjectTitle(id, title); syncState(); return res; }

// Persistence proxies
export function getActiveProjectData() { return dataService.getActiveProjectData(); }
export function saveProjectsData() { return dataService.saveProjectsData(); }
export function saveActiveProjectData() { return dataService.saveActiveProjectData(); }
export function saveActiveProjectId() { return dataService.saveActiveProjectId(); }
export function loadProjectsData() { const res = dataService.loadProjectsData(); syncState(); return res; }

// Card & column helpers
export function getCard(id) { return dataService.getCard(id); }
export function getColumnData(index) { return dataService.getColumnData(index); }
export function getOrderPath(cardId, cardsMap) { return dataService.getOrderPath(cardId, cardsMap); }
export function compareOrderPaths(a, b) { return dataService.compareOrderPaths(a, b); }
export function getColumnCards(index) { return dataService.getColumnCards(index); }
export function getChildCards(parentId, columnIndex) { return dataService.getChildCards(parentId, columnIndex); }
export function getSiblingCards(cardId) { return dataService.getSiblingCards(cardId); }
export function getDescendantIds(cardId) { return dataService.getDescendantIds(cardId); }
export function getAncestorIds(cardId) { return dataService.getAncestorIds(cardId); }
export function getColorForCard(card, cardsMap) { return dataService.getColorForCard(card, cardsMap); }
export function addCardData(parentId, columnIndex, order) { const res = dataService.addCardData(parentId, columnIndex, order); syncState(); return res; }
export function updateCardContentData(id, content) { const res = dataService.updateCardContentData(id, content); syncState(); return res; }
export function updateCardNameData(id, name) { const res = dataService.updateCardNameData(id, name); syncState(); return res; }
export function deleteCardData(id) { const res = dataService.deleteCardData(id); syncState(); return res; }
export function addColumnData() { const res = dataService.addColumnData(); syncState(); return res; }
export function deleteColumnData() { const res = dataService.deleteColumnData(); syncState(); return res; }
export function setColumnPromptData(index, prompt) { const res = dataService.setColumnPromptData(index, prompt); syncState(); return res; }
export function getGlobalPromptData() { return dataService.getGlobalPromptData(); }
export function setGlobalPromptData(prompt) { const res = dataService.setGlobalPromptData(prompt); syncState(); return res; }
export function moveCardData(id, col, order) { const res = dataService.moveCardData(id, col, order); syncState(); return res; }
export function reparentChildrenData(oldParent, newParent) { const res = dataService.reparentChildrenData(oldParent, newParent); syncState(); return res; }

export {
    PROJECTS_STORAGE_KEY,
    ACTIVE_PROJECT_ID_KEY,
    MIN_COLUMNS,
    BASE_COLOR_HUE,
    HUE_ROTATION_STEP,
    BASE_COLOR_SATURATION,
    BASE_COLOR_LIGHTNESS,
    GROUP_LIGHTNESS_STEP_DOWN
};
