# Simple Editor Domain

Status: Current

This document is the canonical current product and domain specification for Simple Editor. Historical change specifications are retained under [`projects/`](projects/README.md).

## Editor structure

- The editor presents a hierarchical set of text cards across columns.
- A new project starts with at least three columns.
- Root cards belong to column 0. A child card belongs to the column immediately after its parent.
- Cards sharing a parent and column are ordered siblings. Root cards are ordered siblings with no parent.
- Columns scroll vertically when their content exceeds the viewport.
- Map mode is the structural view. Document mode opens one card's direct sibling group as a continuous editable document, with Current on the left and that opening card's read-only History Options on the right.
- Only column 0 offers direct root-card creation.
- Only the rightmost column can add another column.
- The rightmost column can be deleted only when it is empty and more than three columns exist.

## Cards and hierarchy

- A card contains an optional name and editable plain-text content.
- Without a name, the interface displays the final four characters of the card ID.
- Card names are edited by double-clicking the heading, accepted on Enter or blur, and cancelled on Escape.
- Card content is persisted when its textarea loses focus.
- Adding a child creates it in the next column under the selected parent.
- Deleting a card deletes all of its descendants and every Option owned by any deleted card ID. Confirmation is required when content-bearing descendants would be deleted.
- Focusing a card highlights and scrolls its ancestors and descendants into view.
- Root colors distinguish root branches. Descendants keep their root branch hue and use a lighter depth tint plus a same-hue hierarchy rail.

## Current and History Options

- Each card has one editable Current state and may own immutable historical Options. `Manual` and `AI` are source metadata on the same Option concept.
- An Option snapshots the ordered direct sibling Cards: stable ID, name, content, and order. It does not copy descendants, attached Options, colors, parents, or columns.
- The card that opens Document mode remains the History owner while focus, sibling editing, splitting, and insertion move within that document. Parent or child navigation opens the destination card as a new owner.
- `Save current as option` creates one Manual Option without changing Current. History is ordered by creation time descending and then Option ID descending.
- Browsing History is read-only. `Use as current` first saves outgoing Current as a new Manual Option, then replaces only the owner's current sibling group. It never reparents cards or changes columns.
- Use is unavailable when a captured Card ID is currently live outside the owner's sibling scope or when applying the snapshot would remove a Card that has descendants.
- A card may begin with no Options. Once it has History, explicit deletion cannot remove its final Option.
- Merging adjacent siblings clears Options owned by both participants, keeps the upper Card, and deletes the lower Card. Document mode rejects a merge whose lower Card has descendants.

## Drag and touch movement

- A card is dragged from its header, excluding action buttons.
- Pointer and touch interactions expose equivalent move and reparent behavior.
- An insertion indicator communicates sibling placement. Dropping directly on a card makes the moved card its last child.
- Moving a card preserves its descendants and shifts their columns with it.
- Options remain attached by card ID when a card or subtree moves. Descendant-owned Options move with their descendant cards rather than being copied into an ancestor snapshot.
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
  "schemaVersion": 2,
  "title": "Project title",
  "data": {
    "columns": [],
    "cards": {},
    "globalPrompt": "",
    "options": {}
  }
}
```

- An absent `schemaVersion` is treated as legacy version 1.
- Versions 1 and 2 are accepted. Version 1 normalizes `options` to an empty dictionary and is rejected if it attempts to carry an Options field. Version 2 requires an Options dictionary. New exports write version 2.
- A newer or otherwise unsupported explicit version is rejected without changing projects, the active project, or persisted data.
- Validation and normalization complete before the imported project is created.
- A missing or blank title becomes `Imported Project`.
- Missing optional values receive these defaults: `globalPrompt` and column `prompt` become empty strings; card `name` becomes `null`; card `content` becomes an empty string; and missing column IDs are generated.
- Imports with fewer than three columns receive empty columns until the minimum is reached.
- Card color is derived state and is recalculated rather than trusted from the import.
- Unknown properties inside supported `data`, column, card, Option, and Option snapshot objects are preserved but ignored by current behavior. Unknown export-envelope properties are ignored because they are not project state.
- Import is rejected when required containers have the wrong type, a card key and ID disagree, a parent is missing, the hierarchy contains a cycle, a root is outside column 0, a child is not immediately to the right of its parent, a column index is invalid, or an order is not finite.
- Invalid hierarchy is never silently reparented or reordered.
- Version-2 Options are rejected when dictionary keys and IDs disagree, an owner card is missing, source metadata is not `Manual` or `AI`, creation time or snapshot order is not finite, snapshot card IDs repeat, the owner is absent from its snapshot, or hierarchy fields appear inside the sibling snapshot.

## Keyboard behavior

- Ctrl+Enter splits the current card at the cursor and creates a following sibling in both modes.
- Alt+Enter splits the current card at the cursor and creates a child in Map mode. It has no structural effect in Document mode.
- Up and Down move to adjacent cards when the cursor is at the corresponding text boundary.
- Alt+Up and Alt+Down move to the previous or next card.
- Alt+Left moves to the parent; Alt+Right moves to the first child. In Document mode the destination opens as the new sibling document owner.
- Backspace at the start merges the current card into its previous sibling. Delete at the end merges the next sibling into the current card. Map mode reparents descendants from the lower Card; Document mode rejects a lower Card with descendants.
- When History has focus, Left selects the next newer Option and Right selects the next older Option, clamped at the available boundaries.
- Document mode offers `Add sibling` after the focused Card or at the end when focus is absent. It exposes no drag, reparent, move-to-column, column, manual child, Expand, Breakdown, or Custom-child command.

## AI configuration and context

- Users provide an OpenAI-compatible endpoint, model, API key, and optional temperature.
- Settings are stored locally and secrets are masked when their fields are not focused.
- AI actions are available only when endpoint, model, and API key are present.
- Every AI request can use the project global prompt, current and target column prompts, parent, preceding and following siblings, source card, and direct children as appropriate.
- Card-targeting streaming appears in a new placeholder Card. Failure leaves that Card with a visible error; AI never deletes it.
- Option-targeting streaming is transient presentation only. A valid non-empty completion creates one immutable Option; failure creates no Option and never overwrites Current.

## AI result placement

AI operations are non-destructive and the selected target, not prompt wording, controls placement:

- Continue and Summarize create one AI Option on the immediate following sibling when it exists; otherwise they create one new following Card.
- Expand creates one child Card and Breakdown creates one or more child Cards after existing children in Map mode. Both are unavailable in Document mode.
- Custom requires an explicit target: create an Option for this Card, target the immediate following sibling using the same Option-or-Card rule, or add child Cards in Map mode.
- AI never deletes a Card or Option, never automatically uses an Option as Current, and never overwrites existing Current content.

## Acceptance claims

- `CHG-OPT-ONE-CURRENT` — Cards remain live Current state; Options are immutable sibling snapshots owned by card ID.
- `CHG-OPT-DOCUMENT-BOUNDARY` — Document mutations remain within one sibling group and cannot perform Map-level structure changes.
- `CHG-OPT-USE-ATOMIC` — Use saves outgoing Current and applies the selected snapshot as one persistence transaction or has no effect.
- `CHG-OPT-KEEP-ONE` — Explicit deletion cannot remove a card's final Option.
- `CHG-AI-NEXT-OPTION-OR-CARD` — Continue and Summarize create a next-sibling Option when possible and otherwise a following Card.
- `CHG-AI-CHILD-ADD` — Child-adding actions preserve existing children and remain Map-only.
- `CHG-AI-NO-DELETE` — No AI action has Card or Option deletion capability.
- `CHG-AI-FAILURE-NONDESTRUCTIVE` — AI failure cannot overwrite existing user content.
- `CHG-IMPORT-LEGACY-V1` — Existing unversioned exports and onboarding data remain importable.
- `CHG-IMPORT-ATOMIC` — Rejected imports have no project, selection, or persistence effects.
- `CHG-IMPORT-NORMALIZED` — Supported legacy omissions receive deterministic defaults.
- `CHG-IMPORT-STRUCTURAL-INTEGRITY` — Accepted cards form an acyclic, column-consistent hierarchy.
- `CHG-IMPORT-FUTURE-VERSION` — Unsupported explicit versions are rejected instead of partially interpreted.
- `CHG-IMPORT-DERIVED-COLOR` — Imported card colors are recalculated.

## Non-goals

- Options are not a diff, branch graph, merge candidate, automatic autosave history, or undo system.
- No server-side storage, cross-project card movement, rich-text format, or multi-user synchronization is implied.
- Compatibility does not include silently repairing structurally ambiguous hierarchies.
