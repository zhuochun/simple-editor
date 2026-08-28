# Simple Editor Domain

Status: Current

This document is the canonical current product and domain specification for Simple Editor. Historical change specifications are retained under [`projects/`](projects/README.md).

## Editor structure

- The editor presents a hierarchical set of text cards across columns.
- A new project starts with at least three columns.
- Root cards belong to column 0. A child card belongs to the column immediately after its parent.
- Cards sharing a parent and column are ordered siblings. Root cards are ordered siblings with no parent.
- Columns scroll vertically when their content exceeds the viewport.
- Map mode is the structural view. Document mode opens one card's direct sibling group as a continuous editable document, with the editable sibling flow on the left and the focused Card's read-only History Options on the right. Entering it requires the explicit Open sibling document control on a Map Card; ordinary Card clicks keep the user in Map mode.
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
- Focusing a Map Card places it around 30% from the top of its column when possible. For a long sibling group, focus shifts down enough to keep its ancestor and group anchor visible when they can fit; if both cannot fit, keeping the focused Card visible takes priority. Its parent Card aligns with the top of the sibling group containing the focused Card, recursively through ancestors. Its Child sibling group aligns with the focused Card, then the first Child's sibling group aligns with that first Child, recursively through descendants.
- Root colors distinguish root branches. Descendants keep their root branch hue and use a lighter depth tint. Each Child sibling group inherits its Parent Card's branch tint and uses compact internal spacing so the group reads as the Parent expanding into its next column. Map columns share a narrow seam; hierarchy focus uses a plain white Card surface instead of a warning tint.
- Document Cards form a neutral pageless flow separated by dividers. Map colors, selection borders, owner badges, and Card IDs are not shown there. Each Card grows to show its complete content and never exposes an internal textarea scrollbar.

## Current and History Options

- Each Card has one editable Current state and may own immutable historical Options. `Manual` and `AI` are source metadata on the same Option concept.
- A newly created Option snapshots only its owner Card: stable ID, name, content, and order metadata. It does not copy siblings, descendants, attached Options, colors, parents, or columns.
- In Document mode, focusing a Card selects that Card's History. Each Card exposes its own explicit save control; there is no document-level save.
- Saving a Card creates one Manual Option without changing Current only when no existing Option has the same name and content. Otherwise it selects and reuses the newest matching Option without persistence. History is ordered by creation time descending and then Option ID descending.
- Browsing History is read-only. `Use as current` compares the same Card's outgoing Current name and content with its existing History, saves a new Manual Option only when no matching Option already exists, then replaces only that Card's name and content. Using an Option already identical to Current succeeds without changing the project timestamp or persistence. It never changes order, siblings, descendants, parents, or columns.
- Historical version-2 Options that contain additional sibling snapshot records remain importable. Current Card-level behavior reads and applies only the record whose ID matches the Option owner; additional records are preserved but ignored.
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
- Version-2 Options are rejected when dictionary keys and IDs disagree, an owner card is missing, source metadata is not `Manual` or `AI`, creation time or snapshot order is not finite, snapshot card IDs repeat, the owner is absent from its snapshot, or hierarchy fields appear inside the snapshot.

## Keyboard behavior

- Ctrl+Enter splits the current card at the cursor and creates a following sibling in both modes. Document mode restores the active document viewport after Card layout and textarea sizing, whether the desktop Current pane or the narrow-layout workspace owns scrolling, then scrolls only as needed to keep the new caret visible.
- Alt+Enter splits the current card at the cursor and creates a child in Map mode. It has no structural effect in Document mode.
- Up and Down move to adjacent cards when the cursor is at the corresponding text boundary.
- Alt+Up and Alt+Down move to the previous or next card.
- Alt+Left moves to the parent; Alt+Right moves to the first child. In Document mode the destination opens its sibling flow and becomes the focused History Card.
- Backspace at the start merges the current card into its previous sibling. Delete at the end merges the next sibling into the current card. Map mode reparents descendants from the lower Card; Document mode rejects a lower Card with descendants.
- When History has focus, Left selects the next newer Option and Right selects the next older Option, clamped at the available boundaries.
- Document mode offers `Add sibling` after the focused Card or at the end when focus is absent. It exposes no drag, reparent, move-to-column, column, manual child, Expand, Breakdown, or Custom-child command.

## AI configuration and context

- The OpenAI preset uses the Responses API at `https://api.openai.com/v1/responses`, defaults to `gpt-5.6-sol`, and exposes reasoning effort instead of temperature. OpenRouter uses Chat Completions; Custom makes the protocol and endpoint explicit.
- Settings retain the existing `writingToolAiSettings` browser-storage key. Legacy endpoint/model/key settings remain readable; a legacy temperature value is ignored and is not written by new saves.
- Settings are stored locally, the API key remains a password field, and values change only through explicit Save. Save requires a complete `http://` or `https://` endpoint. Test sends a minimal connection prompt without project content.
- AI actions are available only when endpoint, model, and API key are present.
- Every AI request can use the project global prompt, current and target column prompts, parent, preceding and following siblings, source card, and direct children as appropriate.
- Starting an action exposes one global job with its status and Cancel control. While it runs, structural controls include project import and Document-to-Map navigation. A request times out after 60 seconds; cancellation, timeout, and provider failure always release those controls and expose Retry.
- Card-targeting streaming appears in a read-only new placeholder Card. Completion or failure makes it editable again. Failure leaves that Card with a visible error; AI never deletes it.
- Option-targeting streaming is transient presentation only. A valid non-empty completion creates one immutable Option; failure creates no Option and never overwrites Current.
- Successful Option creation names its owner Card and offers `Open History`, including when the result owner differs from the Card currently focused in Document mode.
- Imported, user-authored, and AI-authored Card names, content, project titles, prompts, and provider output are rendered as literal plain text rather than executable markup. API keys are not written to application logs.

## AI result placement

AI operations are non-destructive and the selected target, not prompt wording, controls placement:

- Continue and Summarize create one AI Option on the immediate following sibling when it exists; otherwise they create one new following Card.
- Expand creates one child Card and Breakdown creates one or more child Cards after existing children in Map mode. Both are unavailable in Document mode.
- Custom requires an explicit target: create an Option for this Card, target the immediate following sibling using the same Option-or-Card rule, or add child Cards in Map mode.
- AI never deletes a Card or Option, never automatically uses an Option as Current, and never overwrites existing Current content.

## Acceptance claims

- `CHG-OPT-ONE-CURRENT` — Cards remain live Current state; each Option is an immutable alternative for one owner Card.
- `CHG-OPT-DOCUMENT-BOUNDARY` — Document mutations remain within one sibling group and cannot perform Map-level structure changes.
- `CHG-OPT-USE-ATOMIC` — Use saves the owner Card's outgoing Current and replaces only that Card's name and content as one persistence transaction or has no effect.
- `CHG-OPT-KEEP-ONE` — Explicit deletion cannot remove a card's final Option.
- `CHG-AI-NEXT-OPTION-OR-CARD` — Continue and Summarize create a next-sibling Option when possible and otherwise a following Card.
- `CHG-AI-CHILD-ADD` — Child-adding actions preserve existing children and remain Map-only.
- `CHG-AI-NO-DELETE` — No AI action has Card or Option deletion capability.
- `CHG-AI-FAILURE-NONDESTRUCTIVE` — AI failure cannot overwrite existing user content.
- `CHG-AI-OPENAI-RESPONSES` — The OpenAI preset uses `gpt-5.6-sol`, Responses streaming, and explicit reasoning effort without temperature.
- `CHG-AI-LEGACY-SETTINGS` — The existing settings key remains readable while obsolete temperature data is ignored.
- `CHG-AI-LIFECYCLE` — Every request settles through success, cancellation, timeout, or failure and always unlocks the editor; failed jobs can be retried.
- `CHG-AI-RESULT-DISCOVERY` — A created Option identifies its owner and can open that Card's History.
- `CHG-AI-PLACEMENT-PROMPT` — Provider instructions describe the workflow-selected Card, Option, or child destination without claiming a conflicting placement.
- `CHG-AI-SAFE-TEXT` — User, import, and provider strings render as plain text and credentials never enter application logs.
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
