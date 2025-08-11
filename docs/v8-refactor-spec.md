# Modularization plan for script.js

## High‑level analysis of script.js

The script.js file in **simple‑editor** has grown into a very large script (\~2000 lines) that handles nearly every aspect of the UI. Inside the DOMContentLoaded callback it:

1. **References many DOM elements and stores them in variables** (e.g., sidebar, resizer, project list, AI inputs).

2. **Defines UI constants and small UI state** (isAiActionInProgress, GROUP\_HEADER\_PREVIEW\_LENGTH, CARD\_NAME\_MAX\_LENGTH, etc.).

3. **Implements dozens of helper functions**: for DOM lookups (getCardElement, getGroupElement, getColumnElementByIndex), auto‑sizing textareas, scrolling cards into view, highlighting ancestors/descendants, updating group headers, focusing textareas, building modal dialogs, etc. These helpers are interspersed with application logic.

4. **Implements rendering functions**: renderColumnContent, renderApp, renderProjectList, updateToolbarButtons, updateAllToolbarButtons build and update the DOM to reflect project and card data.

5. **Contains controller‑like functions (action handlers)** for projects (add/delete/switch/export/import), cards (add/delete/update), columns (add/delete), AI actions, onboarding flow, keyboard shortcuts, etc..

6. **Binds many event listeners** directly inside the DOMContentLoaded callback to UI elements and registers keyboard shortcuts.

This monolithic structure makes it difficult to maintain, test or extend the UI. There is no separation between *view rendering*, *business logic* and *event binding*. To improve maintainability, we should modularize this script. Below is a plan to restructure it incrementally without breaking functionality.

## High‑level modularization plan

1. **Identify functional domains** within script.js:

2. **DOM/utility helpers**: functions that locate elements, adjust sizes, scroll into view or highlight elements.

3. **UI rendering functions**: functions that create DOM elements (createCardElement, createGroupElement, createColumnElement), render lists (renderColumnContent, renderApp, renderProjectList) and update toolbars.

4. **Modal and dialog helpers**: functions to display prompts, confirmations and import/export dialogs.

5. **Controllers (action handlers)**: functions that respond to user actions, such as adding/deleting projects or cards, switching projects, editing titles, invoking AI operations, etc.

6. **Initialisation and event binding**: code that runs on DOMContentLoaded to wire up controllers to the DOM.

7. **Create dedicated modules** for each domain. For example:

8. src/helpers/domUtils.js → DOM lookup functions (getCardElement, etc.), auto‑resize, scroll logic, highlighting.

9. src/components/cardComponents.js → functions to construct card, group and column elements, update group header display.

10. src/render/renderApp.js → functions to render columns and the overall app (renderColumnContent, renderApp, updateToolbarButtons, updateAllToolbarButtons).

11. src/components/modals.js → createModal and specialised modal builders.

12. src/controllers/projectController.js → handlers for adding, deleting, switching, exporting and importing projects; editing project titles; rendering project lists.

13. src/controllers/cardController.js → handlers for card CRUD operations, focusing textareas, updating names/content.

14. src/controllers/columnController.js → handlers for adding/deleting columns.

15. src/controllers/aiController.js → handlers for AI actions, bridging UI events to the AIService module.

16. src/main.js (or update script.js) → the entry point: imports the service classes (DataService, AIService, DragDropService), the helper modules and controllers; wires them together and binds event listeners.

17. **Use dependency injection**: pass instances of DataService, AIService and DragDropService into controllers and rendering functions rather than referencing global singletons. This will make modules easier to test.

18. **Refactor in small steps**: Move groups of functions into their own modules and then import them back into script.js. After migrating all functions, script.js can be reduced to a thin entry point or replaced with main.js.

## Detailed tasks

Each task should be completed and tested before moving to the next to ensure no regressions.

### Task 1 – Set up module directories

1. Within src/, create the following directories:

2. helpers – for small reusable functions.

3. components – for UI component builders and modal utilities.

4. render – for high‑level rendering functions.

5. controllers – for event handlers and application logic.

6. Commit this structure. No functional changes yet.

*Expected outcome*: A clear folder hierarchy is in place, ready to accept refactored code.

### Task 2 – Extract DOM utility helpers

1. **Create src/helpers/domUtils.js**. Copy the following functions from script.js and export them individually:

2. getCardElement, getGroupElement, getColumnElementByIndex, getColumnIndex.

3. autoResizeTextarea.

4. scrollIntoViewIfNeeded.

5. scrollHierarchy and its nested helper scrollToTarget.

6. highlightHierarchy and clearHighlights (found later in the file near the hierarchy functions).

7. Ensure these functions accept the minimum required parameters (e.g., pass columnsContainer or dataService in rather than relying on outer variables). For instance, getColumnElementByIndex should accept columnsContainer as a parameter.

8. **Import and re‑export** – At the top of script.js, import these functions: import { getCardElement, getGroupElement, getColumnIndex, autoResizeTextarea, scrollHierarchy, highlightHierarchy, clearHighlights } from './helpers/domUtils.js';. Remove their definitions from script.js. If other parts of the code reference them, update the imports accordingly.

9. Test the application to verify that helper functions still work (e.g., auto‑resizing, scrolling and highlighting behaviour remain unchanged).

*Expected outcome*: DOM helper functions are moved into a dedicated helper module, and script.js imports them instead of defining them inline. No functional change occurs.

### Task 3 – Extract modal utilities

1. **Create src/components/modals.js**. Move the createModal function and any related modal helper functions from script.js into this file. Export them individually or as named exports.

2. If there are other modal types (e.g., import/export dialogs, prompts), move their DOM‑building logic into this module as well. The functions should accept relevant parameters (title, content HTML, callbacks) and return the overlay element or nothing.

3. **Import** these modal functions into script.js and remove their definitions from script.js.

4. Test creating and dismissing modals (e.g., export project modal, confirmation dialogues) to ensure behaviour is unchanged.

*Expected outcome*: Modal creation code is encapsulated in its own module and can be reused elsewhere.

### Task 4 – Extract UI component builders

1. **Create src/components/cardComponents.js**. Move functions that build DOM elements for cards, groups and columns from script.js into this module. This typically includes:

2. createCardElement – builds a card \<div\> with appropriate content, textarea, buttons, event listeners, etc.

3. createGroupElement – builds a group container with a header and optionally children.

4. createColumnElement – builds a column container with its toolbar and empty cards container.

5. updateGroupHeaderDisplay – updates the text/title of a group header based on parent card data.

6. These functions should accept dependencies: a DataService instance (to read card data), aiService if needed for enabling/disabling AI buttons, and helper functions from domUtils for DOM operations. Avoid capturing outer variables; instead, pass columnsContainer or aiService as parameters or close over them in factory functions.

7. **Export** these functions. Then update script.js to import them. Remove their original definitions from script.js.

8. Test rendering of individual cards, group headers and columns to ensure they still display correctly and their event listeners fire.

*Expected outcome*: Card and column creation logic is isolated in a reusable module.

### Task 5 – Extract rendering functions

1. **Create src/render/renderApp.js**. Move the high‑level rendering functions from script.js into this module:

2. renderColumnContent – now should accept the column element, index, DataService instance and UI component builders from the previous task.

3. renderApp – accepts columnsContainer, DataService, aiService and uses renderColumnContent to build the UI.

4. updateToolbarButtons and updateAllToolbarButtons – keep them in this module or create a separate toolbar.js if they are complex.

5. This module should import createColumnElement, createCardElement, createGroupElement and updateGroupHeaderDisplay from cardComponents.js, and any needed helpers from domUtils.js.

6. **Export** these functions. In script.js, import them: import { renderApp, renderColumnContent, renderProjectList } from './render/renderApp.js'; (the project list rendering will be moved next).

7. Remove the original definitions from script.js and ensure that calls to renderApp() now use the imported version.

8. Test the overall rendering: switching projects, adding/deleting columns and cards should still update the UI correctly.

*Expected outcome*: High‑level rendering functions reside in their own module, making the UI rendering pipeline clearer and reusable.

### Task 6 – Extract project list rendering and project controllers

1. **Create src/controllers/projectController.js**. Move the following functions from script.js into this module:

2. renderProjectList – uses DataService to get projects, sorts them and builds DOM elements.

3. makeProjectTitleEditable – handles editing of project titles.

4. handleAddProject, handleDeleteProject, handleSwitchProject, handleExportProject, handleImportProject (found later in the file).

5. These functions should accept the dependencies they need: DataService instance, rendering functions (renderApp, renderProjectList) and modal utilities. Remove direct references to data.projects or data.activeProjectId; instead, call dataService.getActiveProjectData() or use injected dataService methods.

6. **Export** these controller functions. In script.js, import them and wire them up: e.g., addProjectBtn.addEventListener('click', () \=\> projectController.handleAddProject());.

7. Test project operations: adding, deleting, switching, renaming, exporting and importing projects. The sidebar should update correctly.

*Expected outcome*: Project‑related operations are isolated in a controller module that uses the DataService and rendering functions.

### Task 7 – Extract card and column controllers

1. **Create src/controllers/cardController.js**. Move card operation handlers from script.js into this module, including:

2. handleAddCard, handleDeleteCard, handleMoveCard, handleUpdateCardContent (or similarly named functions later in the file).

3. focusCardTextarea (moved earlier) could remain a helper, but cardController can expose focusCard as a convenience.

4. Any functions handling card name changes or card order.

5. This module should accept DataService, renderApp, domUtils, aiService and the drag service (to reattach drag events on new cards). Remove references to global variables.

6. **Create src/controllers/columnController.js**. Move functions such as handleAddColumn, handleDeleteColumn, and any logic dealing with column prompts or global prompts into this module. The controller should call methods on DataService to modify data and then call renderApp to update the view.

7. Export these controllers. Update script.js to import them and bind event listeners accordingly.

8. Test card and column operations: adding/deleting/moving cards, adding/removing columns and prompts. Ensure the drag‑and‑drop still works by injecting the drag service where needed.

*Expected outcome*: Logic for manipulating cards and columns is organized into dedicated controllers, making the main script cleaner and easier to manage.

### Task 8 – Extract AI action controller

1. **Create src/controllers/aiController.js**. Move AI‑related handlers from script.js into this module. These may include functions triggered by buttons such as **Continue**, **Summarize**, **Breakdown**, **Expand**, **Rename** and **Auto‑generate**, which call the methods of AIService and then update card content accordingly.

2. The controller should accept a DataService instance (to fetch card context) and an AIService instance. It may also need DOM helpers to find relevant buttons and modals.

3. Export these functions. In script.js, import them and bind the AI buttons to the appropriate controller functions.

4. Test all AI actions to ensure they still call the AI backend, handle streaming responses and update card content or names appropriately.

*Expected outcome*: AI UI logic resides in a module separate from general UI code and can be maintained independently.

### Task 9 – Create a new entry point and reduce script.js

1. **Create src/main.js** (or rename script.js) as the entry point. In this file:

2. Import DataService, AIService and DragDropService classes.

3. Import helpers, components and controllers created in earlier tasks.

4. Instantiate the services: const dataService \= new DataService(); const aiService \= new AIService(dataService); const dragService \= new DragDropService(dataService);.

5. Call the initialization functions: aiService.initializeAiSettings({ providerUrlInput: …, ... }) and bind drag‑and‑drop: dragService.attach(columnsContainer, { getCardElement, getColumnIndex });.

6. Bind UI event listeners to the controller functions.

7. Call renderApp() and renderProjectList() on initial load.

8. Move the remaining code from script.js into appropriate controllers or helpers. The old script.js should eventually only import the entry point and perhaps show a deprecation warning.

9. **Update index.html** to load main.js instead of script.js.

10. Test the full application to ensure that everything still works end‑to‑end.

*Expected outcome*: The monolithic script.js is replaced by an organised set of modules. The entry point coordinates services, rendering and controllers.

### Task 10 – Clean up and document

1. **Remove unused code** – Once all functions have been moved, delete the remaining definitions in the original script.js or remove the file entirely if no longer used.

2. **Document modules** – Provide README files or JSDoc comments explaining the purpose and usage of each controller and helper module.

3. **Write tests** – Add unit tests for helpers and controllers (e.g., using Jest and JSDOM). For instance, test that renderApp builds the expected DOM structure given a sample project.

4. **Consider using a component framework** – After modularization, consider migrating UI rendering to a framework (React, Vue, etc.) or a templating system for further maintainability.

*Expected outcome*: A well‑structured codebase where each file has a focused responsibility, making future maintenance and feature additions easier.