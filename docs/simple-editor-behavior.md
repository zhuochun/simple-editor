# Simple Editor Behavior

Status: Current

This document is the canonical product behavior specification for Simple Editor. It supersedes the versioned specifications previously stored in this directory.

## Editor structure

- The editor presents a hierarchical set of text cards across columns.
- A new project starts with at least three columns.
- Root cards belong to column 0. A child card belongs to the column immediately after its parent.
- Cards sharing a parent and column are ordered siblings. Root cards are ordered siblings with no parent.
- Columns scroll vertically when their content exceeds the viewport.
- Only column 0 offers direct root-card creation.
- Only the rightmost column can add another column.
- The rightmost column can be deleted only when it is empty and more than three columns exist.

## Cards and hierarchy

- A card contains an optional name and editable plain-text content.
- Without a name, the interface displays the final four characters of the card ID.
- Card names are edited by double-clicking the heading, accepted on Enter or blur, and cancelled on Escape.
- Card content is persisted when its textarea loses focus.
- Adding a child creates it in the next column under the selected parent.
- Deleting a card deletes all of its descendants. Confirmation is required when content-bearing descendants would be deleted.
- Focusing a card highlights and scrolls its ancestors and descendants into view.
- Root colors distinguish root groups. Descendants derive their color from their hierarchy and sibling position.

## Drag and touch movement

- A card is dragged from its header, excluding action buttons.
- Pointer and touch interactions expose equivalent move and reparent behavior.
- An insertion indicator communicates sibling placement. Dropping directly on a card makes the moved card its last child.
- Moving a card preserves its descendants and shifts their columns with it.
- A card cannot be moved onto itself or beneath one of its descendants.
- Root cards can occupy empty space only in column 0. Non-root cards require a parent or sibling group.
- Successful movement updates order, parent, columns, derived colors, and persisted project data.

## Projects and persistence

- All projects and AI settings are stored in browser `localStorage`.
- Projects are sorted by last-modified time in the sidebar.
- Creating a project selects it and initializes at least three empty columns.
- Renaming a project accepts Enter or blur and cancels on Escape. Titles cannot be empty.
- Deleting the active project selects the most recently modified remaining project. Deleting the final project creates a new empty project.
- The active project is restored on reload. If its saved ID is missing or invalid, the most recently modified project becomes active.
- Text export emits non-empty card content in depth-first hierarchy order.
- JSON export emits the project title and project data using the compatibility contract below.
- Import from a file or URL creates a new project ID, preserves card IDs, saves the project, and selects it.
- A new browser profile imports the bundled onboarding project once, then records that the attempt occurred.

## Import compatibility

JSON exports use this envelope:

```json
{
  "schemaVersion": 1,
  "title": "Project title",
  "data": {
    "columns": [],
    "cards": {},
    "globalPrompt": ""
  }
}
```

- An absent `schemaVersion` is treated as legacy version 1.
- Version 1 is accepted. A newer or otherwise unsupported explicit version is rejected without changing projects, the active project, or persisted data.
- Validation and normalization complete before the imported project is created.
- A missing or blank title becomes `Imported Project`.
- Missing optional values receive these defaults: `globalPrompt` and column `prompt` become empty strings; card `name` becomes `null`; card `content` becomes an empty string; and missing column IDs are generated.
- Imports with fewer than three columns receive empty columns until the minimum is reached.
- Card color is derived state and is recalculated rather than trusted from the import.
- Unknown properties inside supported `data`, column, and card objects are preserved but ignored by current behavior. Unknown export-envelope properties are ignored because they are not project state.
- Import is rejected when required containers have the wrong type, a card key and ID disagree, a parent is missing, the hierarchy contains a cycle, a root is outside column 0, a child is not immediately to the right of its parent, a column index is invalid, or an order is not finite.
- Invalid hierarchy is never silently reparented or reordered.

## Keyboard behavior

- Ctrl+Enter splits the current card at the cursor and creates a following sibling.
- Alt+Enter splits the current card at the cursor and creates a child.
- Up and Down move to adjacent cards when the cursor is at the corresponding text boundary.
- Alt+Up and Alt+Down move to the previous or next card.
- Alt+Left moves to the parent; Alt+Right moves to the first child.
- Backspace at the start merges the current card into its previous sibling and reparents its children.
- Delete at the end merges the next sibling into the current card and reparents the removed sibling's children.

## AI configuration and context

- Users provide an OpenAI-compatible endpoint, model, API key, and optional temperature.
- Settings are stored locally and secrets are masked when their fields are not focused.
- AI actions are available only when endpoint, model, and API key are present.
- Every AI request can use the project global prompt, current and target column prompts, parent, preceding and following siblings, source card, and direct children as appropriate.
- Streaming output appears in a placeholder card. Failure produces a visible error in that generated card and never overwrites existing content.

## AI result placement

AI operations are non-destructive:

- Continue creates one sibling immediately after the source card.
- Breakdown creates multiple children beneath the source card.
- Expand creates one child beneath the source card.
- Summarize creates one sibling immediately after the source card.
- Custom creates one or more children beneath the source card.
- Expand and Summarize preserve the source card and all descendants.
- The interface communicates placement through the action label or tooltip.
- Replacing the source card is not supported until a separate undo or revision-history policy is accepted.

## Acceptance claims

- `CHG-AI-EXPAND-CHILD` — Expand creates exactly one child in the next column.
- `CHG-AI-SUMMARY-SIBLING` — Summarize creates exactly one following sibling.
- `CHG-AI-SOURCE-PRESERVED` — Expand and Summarize do not change the source or its descendants.
- `CHG-AI-FAILURE-NONDESTRUCTIVE` — AI failure cannot overwrite existing user content.
- `CHG-IMPORT-LEGACY-V1` — Existing unversioned exports and onboarding data remain importable.
- `CHG-IMPORT-ATOMIC` — Rejected imports have no project, selection, or persistence effects.
- `CHG-IMPORT-NORMALIZED` — Supported legacy omissions receive deterministic defaults.
- `CHG-IMPORT-STRUCTURAL-INTEGRITY` — Accepted cards form an acyclic, column-consistent hierarchy.
- `CHG-IMPORT-FUTURE-VERSION` — Unsupported explicit versions are rejected instead of partially interpreted.
- `CHG-IMPORT-DERIVED-COLOR` — Imported card colors are recalculated.

## Non-goals

- No AI overwrite mode, undo system, or revision history is introduced by this specification.
- No server-side storage, cross-project card movement, rich-text format, or multi-user synchronization is implied.
- Compatibility does not include silently repairing structurally ambiguous hierarchies.
