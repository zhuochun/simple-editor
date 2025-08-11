# Modularization Plan for simple-editor JavaScript Code

## High‑level analysis of the current code

The **simple‑editor** project currently groups most of its functionality into a few large files:

| File | Observations |
| :---- | :---- |
| **aiService.js** | Contains constants, global state (aiSettings, uiElements) and multiple unrelated functions. It mixes configuration, state management, context gathering, API calls and generation logic. The module imports the whole data module (import \* as data from './data.js') and then uses its functions directly, which tightly couples the AI logic to the data implementation. Global state (aiSettings) is modified in place and reused across functions. The stream call logic uses this state directly to build requests. Generation functions (generateContinuation, generateSummary, generateBreakdown, etc.) are large template strings in the same file. All UI event handlers (focus/blur) live in this file, causing further coupling. |
| **dragDrop.js** | Implements drag‑and‑drop behaviour for cards in a single file. It contains constants, module‑level state variables (draggedCardId, draggedElement, dragIndicator, scrollAnimationFrameId, etc.), helpers (startScrolling, stopScrolling) and event handlers (handleDragStart, handleDragEnd, handleDragOver, etc.) mixed together. DOM helper functions and data helper functions are defined as variables to be overwritten by the consumer, which is fragile. The file manipulates the DOM directly and references global CSS classes. |
| **data.js** | Holds application‑wide constants (storage keys, colours), global mutable state (projects object and activeProjectId) and a wide array of functions for project management, card management, colour calculation and persistence. The same file provides utility functions (ID generation), project CRUD functions, persistence functions and colour/ordering logic. Functions frequently read and write the projects and activeProjectId globals. |

Having many unrelated functions and mutable global state in single files makes it hard to reason about the code, reuse components, or write tests. To make the code cleaner and easier to maintain, we should adopt **ES modules** and **separate functional domains into dedicated modules**. Each module should have a clear purpose, expose a well‑defined API and encapsulate its state. This plan outlines how to refactor incrementally so that each task can be merged independently without breaking existing functionality.

## High‑level modularization plan

1. **Establish a services directory** – Create a src/services/ folder to hold modular code. Under it, create sub‑folders for **data**, **ai** and **drag** services. Each service encapsulates one domain (project/card management, AI interactions and drag‑and‑drop logic). Use ES6 classes or factory functions to encapsulate state instead of top‑level mutable variables.

2. **Adopt ES modules** – Ensure that scripts are loaded with type="module" and that each new service file uses export/import statements. For compatibility with existing code during migration, each original file will re‑export the functions/classes from the new modules until all references are updated.

3. **Encapsulate state** – Move global state variables (projects, activeProjectId, aiSettings, drag state variables) inside classes. Provide getters/setters or methods to interact with the state rather than accessing mutable variables directly. This makes dependencies explicit and simplifies testing.

4. **Define clear public APIs** – For each service, decide which methods should be publicly exposed. For instance, the Data service will expose methods like addProject, deleteProject, getCard, addCard, moveCard, and save(). Internally it can have helper functions for validation and colour calculations. The AI service will provide methods like initialize, areSettingsValid, generateContinuation, etc., without exposing internal caching or DOM details. The Drag service will expose an attach method that binds event handlers to a DOM container and accepts callbacks or dependency injections for data operations.

5. **Incremental integration** – Introduce one service at a time. For each service:

6. Create the new module and copy code from the monolithic file into the class, adapting it to use this for state.

7. Add unit tests or manual test instructions to ensure behaviour matches the original code.

8. Update the original file (aiService.js, dragDrop.js or data.js) to import the service and re‑export its API. This preserves backward compatibility for other parts of the app until they are updated to import from the new service directly.

9. Once all consuming code has been updated, remove unused code from the old files.

10. **Document each module** – Provide JSDoc comments for the class and its public methods, describing parameters, return values and side effects. Add README.md files in each service folder explaining usage.

11. **Improve testability** – After modularization, write Jest or browser‑based tests for each module. Where possible, replace direct DOM access with dependency injection so that modules can be tested in isolation.

## Detailed sequential tasks

Each task below is designed to be merged independently. **Complete and test a task before starting the next.**

### Task 1 – Set up module structure and baseline

1. **Create a src/services/ folder**. Inside it, create three subdirectories: data, ai and drag.

2. **Ensure scripts are loaded as ES modules**. In index.html (or equivalent entry HTML), change the \<script\> tags that load data.js, aiService.js and dragDrop.js to \<script type="module" src="…"\>\</script\>.

3. **Export current functions** – At the end of data.js, aiService.js and dragDrop.js, add export statements that explicitly export all top‑level functions, constants and variables currently used by other parts of the application (e.g., export { createDefaultProject, addProjectData, deleteProjectData, getActiveProjectData, … }). This makes the existing files compliant with ES modules without changing behaviour.

4. **Commit baseline** – Run the application to ensure it still functions as before. Commit these changes as the baseline for refactoring.

*Expected outcome*: The project runs normally, and all existing functions are exported via ES modules. There is a src/services/ folder ready for new modules.

### Task 2 – Create the DataService module

1. **Create src/services/data/DataService.js**. Define a class DataService inside it. The constructor should initialize internal state for projects and activeProjectId, taking optional initial data (to support unit tests).

2. **Move constants** – Copy the constants from the top of data.js (PROJECTS\_STORAGE\_KEY, ACTIVE\_PROJECT\_ID\_KEY, MIN\_COLUMNS, BASE\_COLOR\_HUE, etc.) into the new module. Either keep them as static fields of DataService or as module‑level constants exported separately.

3. **Move utility and project‑management functions** – Copy generateId, createDefaultProject, addProjectData, deleteProjectData, switchActiveProject, updateProjectLastModified, updateProjectTitle into DataService as methods. Replace references to module‑level projects and activeProjectId with this.projects and this.activeProjectId. For example, in addProjectData, replace projects\[newProject.id\] \= newProject; with this.projects\[newProject.id\] \= newProject;.

4. **Move data‑persistence functions** – Add methods getActiveProjectData, saveProjectsData, saveActiveProjectData, saveActiveProjectId to DataService. They should operate on this.projects and this.activeProjectId, and use window.localStorage for persistence.

5. **Move card and column operations** – Add methods such as getColumnCards, getChildCards, getSiblingCards, getDescendantIds, getAncestorIds and addCardData. Adapt them to use this.getActiveProjectData() instead of the global function. Copy the colour calculation functions (getColorForCard) and any other helper functions needed (e.g. compareOrderPaths) into this module.

6. **Expose public API** – At the end of the file, export default DataService;. Optionally export helper functions if they might be used elsewhere.

7. **Create a façade in data.js** – In the existing data.js, import DataService and create a singleton instance: const dataService \= new DataService();. Then export proxy functions that call the corresponding methods, e.g., export function addProjectData(title, data) { return dataService.addProjectData(title, data); }. Keep any code that directly manipulates the DOM out of this file. Ensure that existing modules that import from data.js continue to work.

8. **Test** – Run the application, focusing on project and card operations (creating/deleting projects, adding/moving cards, colour changes). Behaviour should be identical to before because data.js proxies to the new service.

*Expected outcome*: A new DataService class encapsulates project/card logic. data.js becomes a thin façade re‑exporting methods from the singleton. No functional changes yet.

### Task 3 – Create the AIService module

1. **Create src/services/ai/AIService.js**. Define a class AIService. Give it a constructor that accepts a **DataService instance** (to use for context gathering) and optionally initial settings. Store these on this.

2. **Move AI configuration constants** – Copy the AI\_SERVICE\_CONFIG object from aiService.js into this new module.

3. **Move state and settings management** – Move aiSettings and uiElements into private properties of the class. Convert loadAiSettings, saveAiSettings, updateAiSettingsUI, handleAiInputFocus, handleAiInputBlur, initializeAiSettings and areAiSettingsValid into class methods. Replace references to module‑level variables with this.aiSettings and this.uiElements. Remove direct logging unless needed for debugging.

4. **Move stream and generation functions** – Make streamChatCompletion, \_getCardContext, generateContinuation, generateSummary, generateBreakdown, generateExpand and any other generation functions methods of AIService. Replace calls to data.getGlobalPromptData() and similar with calls to the provided DataService instance (e.g., this.dataService.getGlobalPromptData()), or inject just the needed functions as parameters. Keep the signature (params) \=\> { onChunk, onError, onDone } so that callers do not need to change.

5. **Expose public API** – Export the class as default. Provide an interface for initialising the service (e.g., initializeAiSettings(elements)), validating settings and generating content.

6. **Create a façade in aiService.js** – Similar to the data module, import DataService and AIService, instantiate them (const dataService \= new DataService(); const aiService \= new AIService(dataService);), and export proxy functions: export const initializeAiSettings \= (...args) \=\> aiService.initializeAiSettings(...args); and so on. Keep the constants exported if other parts of the app use them.

7. **Test** – Check that the AI sidebar still loads/saves settings and that the AI generation functions work. Because the façade proxies to the new class, the rest of the app should function without modification.

*Expected outcome*: The AI logic is encapsulated in AIService. aiService.js now delegates to an instance of this class, keeping the API unchanged.

### Task 4 – Create the DragDropService module

1. **Create src/services/drag/DragDropService.js**. Define a class DragDropService. Its constructor should accept dependency injections: a **DataService instance** (for card operations such as moveCardData) and functions to retrieve DOM elements (getCardElement, getColumnIndex). Store any required CSS class names as static constants.

2. **Move constants and state** – Copy the CSS\_CLASSES object and constants like SCROLL\_SPEED and SCROLL\_TRIGGER\_ZONE\_HEIGHT from dragDrop.js into static properties of the class. Move module‑level state variables (draggedCardId, draggedElement, dragIndicator, etc.) into instance properties (this.draggedCardId, this.draggedElement, …).

3. **Move helper functions** – Convert ensureDragIndicator, clearDragStyles, setCompactMode, stopScrolling, startScrolling, attachTouchDragSupport into methods. Replace direct references to global variables with this.\*. Accept DOM elements as parameters instead of referencing document directly where possible to allow testing.

4. **Move event handlers** – Turn handleDragStart, handleDragEnd, handleDragOver, handleDrop, and any other handlers into methods. Replace calls to module‑level functions (getCardData, moveCardData) with calls to the injected DataService instance (this.dataService.getCard, this.dataService.moveCard, etc.). Keep the same event signatures so existing listeners can be rebound. Internal logging can be removed or gated behind a debug flag.

5. **Add a method to bind events** – Provide a public method like attach(containerElement) that sets up the necessary event listeners on a column or container for dragging and dropping. This method should accept the DOM helpers as parameters if they are not available globally.

6. **Expose public API** – Export DragDropService as default. The only public methods should be the constructor and attach (and any additional helpers if needed).

7. **Create a façade in dragDrop.js** – Import DataService and DragDropService. Instantiate them (const dataService \= new DataService(); const dragDropService \= new DragDropService(dataService);). Export a function attachDragDrop(container, helpers) that calls dragDropService.attach(container, helpers). Continue exporting any constants used elsewhere for backward compatibility.

8. **Test** – Bind the new drag service to the relevant containers in your main script. Verify that dragging cards still works correctly: dragging within a column, between columns, into empty space and onto parent cards. Because the façade preserves the original API, existing code should not break.

*Expected outcome*: Drag‑and‑drop logic is encapsulated in DragDropService. dragDrop.js delegates calls to an instance of this class.

### Task 5 – Refactor the main application to use services

1. **Identify the application entry point** (likely main.js or app.js) where the data, AI and drag functions are currently imported. Replace imports from data.js, aiService.js and dragDrop.js with imports from the facades if they haven’t been updated already. For example:

* import { addProjectData, getActiveProjectData, addCardData, moveCardData } from './data.js';
  import { initializeAiSettings, generateContinuation } from './aiService.js';
  import { attachDragDrop } from './dragDrop.js';

* These imports will continue to work because the facades proxy to the new classes.

2. **Instantiate services only once** – If you prefer not to rely on the facades, you can import the classes directly and create shared instances in the entry point:

* import DataService from './services/data/DataService.js';
  import AIService from './services/ai/AIService.js';
  import DragDropService from './services/drag/DragDropService.js';

  const dataService \= new DataService();
  const aiService \= new AIService(dataService);
  const dragService \= new DragDropService(dataService);

* Then pass these instances to your UI components.

3. **Inject dependencies** – Update calls where functions from data.js, aiService.js or dragDrop.js were previously used. For instance, when attaching drag‑and‑drop, call dragService.attach(container, { getCardElement, getColumnIndex }); instead of the old global function. When generating AI content, call aiService.generateContinuation({ card, onChunk, onError, onDone }); instead of the static function.

4. **Gradually update other modules** – Whenever you modify a part of the code, replace imports from the facades with direct imports from the service classes. Avoid circular dependencies by keeping the number of cross‑module imports minimal and injecting dependencies (e.g., pass dataService into AIService).

5. **Remove unused exports from facades** – After all modules have been updated to use the service instances directly, the façade files (data.js, aiService.js, dragDrop.js) will become thin wrappers. At this point, you can either keep them for backward compatibility or remove them altogether. If removed, make sure to update all import paths accordingly.

*Expected outcome*: The main application now uses service instances rather than relying on global state functions. Modules communicate via well‑defined APIs. The application continues to work as before.

### Task 6 – Clean up and documentation

1. **Delete unused global state** – After all references have been updated, remove the old global variables (projects, activeProjectId, aiSettings, etc.) from the facades. Ensure no code references them.

2. **Document the services** – For each service module, add a README.md explaining its purpose, public methods and usage examples. Add JSDoc comments to class definitions and methods.

3. **Add unit tests** – Set up a testing framework (e.g., Jest). Write tests for the DataService to ensure that adding projects, cards, moving cards and computing colours work correctly. Write tests for AIService to ensure settings management and context gathering behave as expected (mocking fetch). Write DOM tests or manual scripts for DragDropService.

4. **Continuous integration** – If not already present, configure CI (e.g., GitHub Actions) to run tests and linting on each commit.

5. **Future work** – Consider further modularization of UI components (e.g., React/Vue components) and adopting TypeScript for type safety.

*Expected outcome*: The codebase is now modular, easier to understand and test. Each service has clear responsibilities and encapsulated state, which improves maintainability and extensibility.