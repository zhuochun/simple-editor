## Project Management Feature Specification

This document details the implementation of multi-project support in the Interactive Writing Tool.

### 1. Overall Layout Structure

*   The application is divided horizontally into three main sections:
    *   `#sidebar`: A left sidebar containing project management controls and the project list.
    *   `#resizer`: A thin vertical element allowing the user to resize the sidebar.
    *   `#main-content`: The main area to the right, containing the active project's columns and cards (`#app > #columnsContainer`).
*   CSS Flexbox is used to manage the layout.

### 2. Left Sidebar (`#sidebar`)

*   **Resizability:**
    *   The sidebar's width is controlled by the `--sidebar-width` CSS variable (default: `250px`).
    *   A minimum width is enforced by the `--min-sidebar-width` CSS variable (default: `150px`).
    *   The `#resizer` element has `mousedown`, `mousemove`, and `mouseup` event listeners (scoped to the `document` during drag) to handle resizing.
    *   During resize, the `--sidebar-width` variable is updated dynamically via JavaScript, clamped between the minimum width and half the window width. The cursor changes to `ew-resize`.
*   **Add Project Button (`#add-project-btn`):**
    *   Located at the top of the sidebar.
    *   On click, triggers the `addProject` function.
    *   `addProject` Functionality:
        *   Prompts the user for a project title using `prompt()`.
        *   If the user cancels, the operation aborts.
        *   If the user enters an empty title or just whitespace, it defaults to `"Untitled Project"`.
        *   Generates a unique project ID (e.g., `proj_...`).
        *   Creates a new project object using `createDefaultProject`, containing the ID, title, initial `lastModified` timestamp, and a `data` object.
        *   The initial `data` object contains an empty `cards: {}` map and a `columns: []` array populated with 3 default column data objects (each having a unique ID like `col_...`).
        *   Adds the new project to the global `projects` object.
        *   Calls `switchProject` to make the new project the active one.
        *   Calls `renderProjectList` to update the sidebar display.
*   **Project List (`#project-list`):**
    *   Displays all created projects.
    *   Container is vertically scrollable (`overflow-y: auto`).
    *   **Rendering (`renderProjectList` function):**
        *   Clears the existing list content.
        *   Retrieves all projects from the global `projects` object.
        *   Sorts the projects based on their `lastModified` timestamp in descending order (most recent first).
        *   For each project, creates a `.project-item` div:
            *   Sets `data-project-id` attribute to the project's ID.
            *   Displays the project title within a `.project-title` span (with a `title` attribute for tooltips).
            *   Includes a `.project-actions` div containing Export (📤) and Delete (🗑️) buttons.
            *   Adds an `.active` class if the project's ID matches the `activeProjectId`.
            *   Attaches event listeners:
                *   `click` on `.project-item` (but not on buttons/inputs): Calls `switchProject` with the project ID.
                *   `dblclick` on `.project-title`: Calls `makeProjectTitleEditable`.
                *   `click` on `.export-project-btn`: Calls `exportProject` with the project ID (event propagation stopped).
                *   `click` on `.delete-project-btn`: Calls `deleteProject` with the project ID (event propagation stopped).

### 3. Project Data and Management

*   **Data Structure:**
    *   All project data is stored in a single JavaScript object named `projects`.
    *   The `projects` object maps `projectId` keys to project objects.
    *   Each project object has the structure: `{ id: string, title: string, lastModified: number, data: { columns: Array<{id: string}>, cards: { cardId: CardObject } } }`.
    *   A variable `activeProjectId` stores the ID of the currently selected project.
*   **Persistence:**
    *   The entire `projects` object is saved to `localStorage` under the key `PROJECTS_STORAGE_KEY`.
    *   The `activeProjectId` is saved to `localStorage` under the key `ACTIVE_PROJECT_ID_KEY`.
    *   Saving occurs via `saveProjectsData()` whenever project data is modified (cards added/deleted/moved/edited, columns added/deleted, project title changed, project deleted).
    *   `saveActiveProjectId()` saves the active ID when switching projects or on initial load if needed.
*   **Project Title:**
    *   Editable via double-click (handled by `makeProjectTitleEditable`).
        *   Replaces the `.project-title` span with an `<input type="text">`.
        *   Input automatically focused and selected.
        *   **Confirmation:** Pressing Enter or blurring the input field attempts to save. If the trimmed title is not empty and different from the original, it updates `projects[projectId].title`, calls `updateProjectLastModified(projectId)`, saves all data via `saveProjectsData()`, and updates the span text.
        *   **Cancellation:** Pressing Escape reverts the input field to the original title without saving.
        *   Empty titles after trimming are discarded (reverts to original).
    *   Duplicate titles are allowed.
*   **Switching Projects (`switchProject` function):**
    *   Called when a `.project-item` is clicked.
    *   If the clicked project is already active or doesn't exist, it returns early.
    *   Calls `saveCurrentProjectData()` to ensure any pending updates to the *outgoing* project object are reflected before the main save (though direct modification is used).
    *   Updates the global `activeProjectId` variable.
    *   Calls `saveActiveProjectId()` to persist the new active ID choice.
    *   Calls `loadActiveProjectData()` (primarily ensures the new `activeProjectId` is valid).
    *   Calls `renderApp()` to display the columns/cards for the newly active project.
    *   Calls `renderProjectList()` to update the highlighting in the sidebar.
    *   **Important:** Switching projects does *not* update the `lastModified` timestamp unless actual data was modified prior to the switch.
*   **Last Modified Timestamp (`lastModified`):**
    *   Stored as a number (e.g., `Date.now()`).
    *   Updated by calling `updateProjectLastModified()` within functions that modify project data:
        *   Saving card content (`handleTextareaBlur`).
        *   Adding a card (`addCard`).
        *   Deleting a card (`deleteCard`).
        *   Moving a card (`moveCard`).
        *   Adding a column (`addColumn`).
        *   Deleting a column (`deleteColumn`).
        *   Saving a project title edit (`makeProjectTitleEditable`).
        *   Deleting a project (`deleteProject` - affects the remaining projects' potential order).
*   **Export Project (`exportProject` function):**
    *   Retrieves the specified project's data.
    *   Initializes an empty `content` string.
    *   Defines a recursive `traverse(cardId)` function:
        *   Gets the card data.
        *   If the card content is not empty after trimming, appends `card.content.trim() + '\n\n'` to the `content` string.
        *   Finds child cards (parent is `cardId`, `columnIndex` is `card.columnIndex + 1`), sorts them by `order`.
        *   Recursively calls `traverse` for each child.
    *   Gets all root cards (column 0, no parent) for the project, sorted by `order`.
    *   Calls `traverse` for each root card.
    *   Creates a filename like `ProjectExport_[ProjectTitle]_[Timestamp].txt` (e.g., `ProjectExport_My_Notes_2023-10-27T10-30-00-000Z.txt`).
    *   Creates a `Blob` with the final trimmed `content` string (type `text/plain`).
    *   Uses a temporary `<a>` tag with `download` attribute and `Blob` URL to trigger a file download.
*   **Delete Project (`deleteProject` function):**
    *   Prompts the user for confirmation, mentioning the project title.
    *   If confirmed:
        *   Removes the project from the global `projects` object.
        *   **If the deleted project was the active one:**
            *   Finds the remaining project with the most recent `lastModified` timestamp.
            *   If one exists, sets `activeProjectId` to its ID.
            *   If no projects remain, creates a new default "Untitled Project", adds it to `projects`, and sets `activeProjectId` to its ID.
        *   Calls `saveProjectsData()` to persist the deletion and potentially new active ID.
        *   Calls `renderProjectList()` to update the sidebar.
        *   If the active project was deleted, calls `loadActiveProjectData()` and `renderApp()` to display the new active project.

### 4. Application Loading (`loadProjectsData` function)

*   Attempts to load data from `localStorage` keys `PROJECTS_STORAGE_KEY` and `ACTIVE_PROJECT_ID_KEY`.
*   Parses the `projects` data. If parsing fails or data is invalid, it resets to an empty `projects` object.
*   **Determining Active Project:**
    *   Uses the `savedActiveId` if it exists and corresponds to a loaded project.
    *   Otherwise, sorts the loaded projects by `lastModified` descending and selects the first one.
*   **Handling No Projects:** If `projects` is empty after loading (or initially), it creates a default "Untitled Project", saves it, and sets it as active.
*   **Data Integrity:** Iterates through loaded projects/cards, ensures basic data structure exists, recalculates all card colors using `getColorForCard`, and assigns a default `order` if missing.
*   Finally, calls `loadActiveProjectData()` to prepare the active project state.

### 5. Card and Column Operations

*   All core logic functions (`getCard`, `getColumnCards`, `getChildCards`, `getDescendantIds`, `getAncestorIds`, `getColorForCard`, `addCard`, `deleteCard`, `moveCard`, `addColumn`, `deleteColumn`, etc.) operate on the data of the currently `activeProjectId` by using the `getActiveProjectData()` helper function.
*   Card colors (`getColorForCard`) are calculated based on hierarchy and root card order *within the active project*.
*   Drag-and-drop operations are implicitly scoped to the active project, as event listeners and DOM manipulation target elements rendered within the `#columnsContainer` for that project only. Dropping outside this container or onto sidebar elements has no effect.

### 6. Rendering (`renderApp`, `renderColumnContent`, etc.)

*   `renderApp` clears the `#columnsContainer` and rebuilds the DOM for the columns and cards based *only* on the data of the `activeProjectId`.
*   It ensures the correct number of columns (min `MIN_COLUMNS`) are rendered based on the project's `data.columns` array and the highest `columnIndex` found in its cards.
*   `renderColumnContent` populates individual columns with the appropriate cards and group containers from the active project's data.