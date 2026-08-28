# Data Schema

Status: Current

This document is the current authority for persisted project data and relationships. Product meaning and compatibility policy are defined in [Domain](domain.md).

## Overview

The application manages multiple writing projects, each structured as a hierarchical, multi-column layout of cards (similar to a Kanban board or outliner). All project data is stored client-side in the browser's `localStorage`.

The core data structure is a single JavaScript object named `projects`, which acts as a dictionary mapping unique `projectId` strings to individual `Project` objects. A separate `localStorage` entry tracks the `activeProjectId`.

## Data Persistence

*   **Storage:** Browser `localStorage`.
*   **Main Data Key:** `PROJECTS_STORAGE_KEY` (defaults to `'writingToolProjects'`)
    *   Stores the entire `projects` object, serialized as a JSON string.
*   **Active Project Key:** `ACTIVE_PROJECT_ID_KEY` (defaults to `'writingToolActiveProjectId'`)
    *   Stores the `id` (string) of the currently active project.

JSON project exports wrap a project title and data in a versioned envelope. An absent `schemaVersion` is treated as legacy version 1; new exports write `schemaVersion: 2`. Version 1 has no Options contract and normalizes `data.options` to `{}`.

## Schema Details

Here's the breakdown of the nested data structures:

---

### 1. `projects` (Root Object)

*   **Type:** `Object` (Dictionary/Map)
*   **Description:** The top-level container holding all projects managed by the application.
*   **Schema:**
    ```json
    {
      "<projectId_1>": { /* Project Object 1 */ },
      "<projectId_2>": { /* Project Object 2 */ },
      "...": "..."
    }
    ```
*   **Keys:** `projectId` (String) - Unique identifier for each project (e.g., `"proj_abc123def"`). Generated using `generateId('proj_')`.
*   **Values:** `Project Object` - Contains the metadata and content for a single project.

---

### 2. `Project` Object

*   **Type:** `Object`
*   **Description:** Represents a single writing project with its metadata and core data (columns and cards).
*   **Schema:**
    ```json
    {
      "id": "<projectId>",
      "title": "Project Title",
      "lastModified": 1678886400000, // Timestamp
      "data": { /* Project Data Object */ }
    }
    ```
*   **Properties:**
    *   `id`:
        *   **Type:** `String`
        *   **Description:** The unique identifier for this project. Matches the key used in the root `projects` object.
        *   **Example:** `"proj_k2xzv9p8q"`
    *   `title`:
        *   **Type:** `String`
        *   **Description:** The user-defined name of the project. Can be edited via the sidebar. Defaults to "Untitled Project" or "New Project".
        *   **Example:** `"My Novel Outline"`
    *   `lastModified`:
        *   **Type:** `Number`
        *   **Description:** A Unix timestamp (milliseconds since epoch, via `Date.now()`) indicating the last time the project was modified (e.g., card added/deleted/moved/edited, title changed, column added/deleted). Used for sorting projects in the sidebar and determining the default active project on load if the explicitly saved active ID is missing/invalid.
        *   **Example:** `1701254800123`
    *   `data`:
        *   **Type:** `Object` (`Project Data Object`)
        *   **Description:** Contains the actual structural and content data for the project (columns and cards).

---

### 3. `Project Data` Object (`project.data`)

*   **Type:** `Object`
*   **Description:** Holds the collections defining the project's structure: the columns and all the cards within them.
*   **Schema:**
    ```json
    {
      "columns": [ /* Array of Column Objects */ ],
      "cards": { /* Dictionary of Card Objects */ },
      "globalPrompt": "",
      "options": { /* Dictionary of Option Objects */ }
    }
    ```
*   **Properties:**
    *   `columns`:
        *   **Type:** `Array`
        *   **Description:** An array representing the columns present in the project view. The index of an element in this array corresponds directly to the `columnIndex` property of cards within that column (0-based). The primary purpose of this array in the current code seems to be tracking the *number* of columns and ensuring the minimum count (`MIN_COLUMNS`).
        *   **Element:** `Column Object`
    *   `cards`:
        *   **Type:** `Object` (Dictionary/Map)
        *   **Description:** A flattened collection of *all* cards belonging to this project. Using an object keyed by `cardId` allows for efficient lookup of any card regardless of its position or hierarchy.
        *   **Keys:** `cardId` (String) - Unique identifier for each card (e.g., `"card_lz3ywa4b7"`). Generated using `generateId('card_')`.
        *   **Values:** `Card Object` - Contains the data for a single card.
    *   `globalPrompt`:
        *   **Type:** `String`
        *   **Description:** Project-wide guidance included in AI context. Legacy imports default it to an empty string.
    *   `options`:
        *   **Type:** `Object` (Dictionary/Map)
        *   **Description:** Immutable Card alternatives keyed by Option ID. Each record resolves to one live owner through `option.cardId`; Cards never embed Options. Legacy version-1 input defaults it to an empty object.

---

### 4. `Column` Object (Element within `project.data.columns` array)

*   **Type:** `Object`
*   **Description:** Represents a single column in the project data. In the current implementation, its primary role is structural – its presence at a certain index signifies the existence of that column.
*   **Schema:**
    ```json
    {
      "id": "<columnId>",
      "prompt": ""
    }
    ```
*   **Properties:**
    *   `id`:
        *   **Type:** `String`
        *   **Description:** A unique identifier for the column instance (e.g., `"col-..."`). While present, the code primarily uses the array *index* (`columnIndex`) for logic related to card placement and column operations.
        *   **Example:** `"col-1jklmno9p"`
    *   `prompt`:
        *   **Type:** `String`
        *   **Description:** Column-specific guidance included in AI context. Legacy imports default it to an empty string.

---

### 5. `Card` Object (Value within `project.data.cards` dictionary)

*   **Type:** `Object`
*   **Description:** Represents a single card containing text content and positional/hierarchical information.
*   **Schema:**
    ```json
    {
      "id": "<cardId>",
      "name": null,
      "content": "Text content of the card...",
      "parentId": "<parentCardId>" | null,
      "columnIndex": 0, // Integer
      "order": 1.0,     // Number
      "color": "hsl(200, 60%, 90%)" // String (HSL format)
    }
    ```
*   **Properties:**
    *   `id`:
        *   **Type:** `String`
        *   **Description:** The unique identifier for this card. Matches the key used in the `project.data.cards` object.
        *   **Example:** `"card_abc123xyz"`
    *   `content`:
        *   **Type:** `String`
        *   **Description:** The user-entered text content for the card. Can be an empty string.
        *   **Example:** `"Chapter 1: The Beginning"`
    *   `name`:
        *   **Type:** `String` | `null`
        *   **Description:** Optional display name. A null value makes the interface display the card ID suffix.
    *   `parentId`:
        *   **Type:** `String` | `null`
        *   **Description:** Defines the hierarchical relationship.
            *   If `null`, this card is a root card in column 0.
            *   If a `String`, it holds the `id` of the parent card. A child is in the column immediately following its parent (`child.columnIndex === parent.columnIndex + 1`).
        *   **Example:** `"card_xyz789abc"` or `null`
    *   `columnIndex`:
        *   **Type:** `Number` (Integer)
        *   **Description:** The zero-based index of the column where this card resides. Corresponds to the index in the `project.data.columns` array.
        *   **Example:** `0`, `1`, `2`
    *   `order`:
        *   **Type:** `Number`
        *   **Description:** Determines the vertical sort order of cards *within the same group*. Cards sharing the same `parentId` and `columnIndex` are sorted based on this value (ascending, lower numbers appear higher). The code uses floating-point numbers to allow inserting cards between existing ones without renumbering all subsequent cards (e.g., inserting between order `1` and `2` might result in order `1.5`). New cards are typically appended with an order value higher than the current maximum in their group.
        *   **Example:** `0`, `1`, `1.5`, `2`
    *   `color`:
        *   **Type:** `String`
        *   **Description:** An HSL color string calculated from root-branch hue and hierarchy depth. It is derived cache data: imports do not trust it, and rendering or project mutations recalculate it.
        *   **Example:** `"hsl(230, 65%, 85%)"`

---

### 6. `Option` Object (Value within `project.data.options` dictionary)

```json
{
  "id": "option_abc123",
  "cardId": "card_owner",
  "source": "Manual",
  "createdAt": 1701254800123,
  "snapshot": {
    "cards": [
      { "id": "card_owner", "name": null, "content": "Past text", "order": 0 }
    ]
  }
}
```

- The dictionary key equals `id`; IDs are stable and unique within the project.
- `cardId` must resolve to a live Card and is the sole History ownership link.
- `source` is `Manual` or `AI`; it records provenance, not a different Option type.
- `createdAt` is a finite non-negative millisecond timestamp. History sorts descending by it and then descending by Option ID.
- Newly created `snapshot.cards` contains exactly the owner Card. Its ID matches `cardId`, `name` is text or `null`, `content` is text, and `order` is finite compatibility metadata.
- Version-2 imports may contain historical sibling records in addition to the owner. Their IDs remain unique and their data is preserved on round trip, but current behavior reads and applies only the owner record.
- Snapshot cards deliberately omit `parentId`, `columnIndex`, `color`, descendants, and attached Options. Applying an Option updates only the live owner's name and content; it never recreates, reorders, reparents, or deletes Cards.
- Unknown Option, snapshot, and snapshot-card properties are preserved on supported-version round trips and ignored by current behavior.

---

## Relationships & Constraints Summary

1.  **Projects Container:** The root `projects` object holds all `Project` objects, keyed by `project.id`.
2.  **Project Content:** Each `Project` contains its metadata and a `data` object holding `columns` and `cards`.
3.  **Columns:** The `project.data.columns` array defines the available columns. Its length dictates the number of columns, with a minimum enforced (`MIN_COLUMNS`). The *index* is functionally more important than the `column.id`.
4.  **Cards Collection:** `project.data.cards` holds *all* cards flattened into a single dictionary for easy lookup by `card.id`.
5.  **Card Placement (Column):** `card.columnIndex` links a card to a specific column index.
6.  **Card Placement (Hierarchy):** `card.parentId` links a card to its parent (or `null` if it's a root).
7.  **Card Placement (Vertical Order):** `card.order` sorts cards vertically within the same parent/column context.
8.  **Options Collection:** `project.data.options` stores historical Card alternatives once, keyed by Option ID and linked to one owner through `cardId`.
9.  **Uniqueness:** `projectId`s and `cardId`s must be unique across the application instance; Option IDs are unique within their project.

This schema provides a flexible structure for representing hierarchical data across columns, while the flattened `cards` dictionary allows for efficient access and modification of individual cards. The use of `localStorage` makes it a purely client-side application.
