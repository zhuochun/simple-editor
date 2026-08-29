# Document Options View

Status: Canonical specification — implemented and verified

> This document is the canonical change contract. Current product behavior and ownership are defined by [Domain](../domain.md), [Data schema](../data-schema.md), [Architecture](../architecture.md), and [Testing](../testing.md). Execution derivations and retained evidence are recorded in the [execution log](20260828-document-options-view-execution.md).

## Purpose

Simple Editor needs two complementary reading modes:

- **Map mode** shows the whole-to-parts hierarchy.
- **Document mode** lets one sibling group read and edit as a continuous document while preserving complete historical alternatives as Options.

The feature must retain the existing ability to create, split, navigate, and merge sibling cards. Options are document alternatives, not diffs, branches, merge inputs, or a graph of changes.

## Product model

### Map mode

Map mode remains the default structural view.

- Horizontal position expresses structural depth; vertical position expresses sibling order.
- Adjacent columns form one continuous canvas with a 4–8 px gap rather than wide gutters.
- Each root branch owns a hue. Descendants retain that hue while surface tint becomes lighter and the same-hue hierarchy rail becomes darker with depth.
- Options do not appear as structural columns and do not alter the hierarchy color meaning.

### Document mode

Opening a card enters Document mode for its sibling group.

- The **sibling document** contains the selected card and every card sharing its `parentId` and `columnIndex`, in sibling order.
- The selected card is the entry anchor and **Option owner card** for that Document-mode session. It is not a separate document or version.
- Each sibling remains a structural card and appears in sibling order on one continuous document surface.
- **Current** is on the left and is the only mutable document state.
- **History Options** attached to the Option owner card are on the right and are read-only.
- The user can move left and right through complete historical Options without changing Current.

At narrow widths, the History pane may reflow below Current or into a compact selector. Current must remain visually primary, and the selected historical Option must remain clearly read-only.

### Terms

| Term | Meaning |
| --- | --- |
| Sibling document | The ordered document formed by cards in one sibling group. |
| Option owner card | The card whose stable ID matches an Option record's `cardId` and owns the History Options shown in the current Document-mode session. |
| Current | The one live, directly editable state of the sibling document. Map mode renders this state. |
| Option | A complete, immutable historical or generated alternative for the sibling document. |
| Creation source | Option metadata recording whether the Option came from an explicit human save (`Manual`) or an AI action (`AI`). Source does not create different Option types. |
| Use as current | Copy a selected Option into Current while preserving both the source Option and the outgoing Current. |

### Invariants

- Each sibling document has exactly one mutable Current.
- Each historical Option is attached to exactly one Option owner card.
- Moving or reparenting a card in Map mode carries its attached Options with it. Every descendant card and its own attached Options move with the descendant subtree.
- Changing a card's sibling group never merges its Options with another card's Options.
- Historical Options are immutable.
- One completed explicit save or AI rewrite action creates exactly one Option.
- Opening, closing, or editing Current does not automatically create an Option.
- An Option captures the complete ordered sibling document, not a stored diff.
- Previewing an Option never changes Current or Map mode.
- Using an Option is atomic and never mutates the source Option.
- Structural edits in Document mode are limited to the current sibling group. They may add, split, merge childless Cards, remove childless siblings during restore, or reorder siblings, but never modify a descendant or move an existing Card to another `parentId` or `columnIndex`.
- Failed creation or switching leaves Current and all stored Options unchanged.
- A card may begin with no historical Options, but `Delete option` cannot remove its final historical Option once one exists. Deleting a Card is a separate structural action and deletes the Options owned by that Card and every deleted descendant.
- No AI action deletes a Card or an Option.

## Version scope

An Option captures the sibling document as one structural unit:

- ordered sibling cards;
- the stable identity of the Option owner card, which must remain one of those cards;
- each sibling card's identity, name, and content;
- creation time and source (`Manual` or `AI`).

Attached History and descendant subtrees are card-owned live state, not recursively copied parts of another Option snapshot. Document mode renders the direct sibling cards as one continuous document. Descendant subtrees remain navigable through Map mode and the hierarchy navigation keymap.

When a card moves, its Option attachment remains on the same card identity. Moving a subtree therefore carries the owner card, its descendants, and every Option collection attached to those cards. Options belonging to different sibling cards remain distinct even while those cards appear in the same sibling document.

When an Option becomes Current, its captured direct sibling Cards replace the live sibling document atomically inside the Option owner's current `parentId` and `columnIndex`. Captured Card identities are reused rather than duplicated. The restore may add, remove, or reorder Cards only in that sibling group; it never changes the `parentId` or `columnIndex` of an existing live Card and never modifies or reparents descendants. If a captured Card ID is currently live outside the owner's sibling group, or if the restore would remove a live sibling that has descendants, `Use as current` is unavailable and the operation has no effect. No restore may produce two live Cards with the same ID.

When a restore removes a childless live sibling Card, that Card and its Options are deleted under the ordinary Card-deletion rule. Descendants of sibling Cards that remain live are unchanged. A captured sibling Card that no longer exists may be recreated in the owner's current sibling group with its captured identity, name, and content; deleted descendant subtrees and their Options are not recreated.

### Option storage contract

All Options are records in one project-level `project.data.options` dictionary keyed by Option ID. An Option record contains at least:

```json
{
  "id": "option_...",
  "cardId": "card_...",
  "source": "AI",
  "createdAt": 1700000000000,
  "snapshot": {}
}
```

- `cardId` is the stable ID of the Option owner card.
- `source` records how the Option was created. `AI` and `Manual` are metadata values, not separate Option concepts.
- `snapshot` contains the complete direct sibling document defined above.
- `project.data.options` is the single persisted source of truth. Card records do not embed Option payloads or maintain a second list of Option IDs.
- The History pane resolves an owner card's Options by selecting records whose `cardId` equals the owner card's ID, then ordering by `createdAt` descending and Option ID descending by code-unit order. The Option ID is the stable tie-breaker when timestamps are equal.
- Moving or reparenting a card does not rewrite its Option records because its stable card ID does not change.
- A descendant card's Options remain in the same project-level dictionary and continue to resolve through that descendant's stable card ID when the subtree moves.

## Interaction contract

### 1. Open and close a sibling document

Clicking a card opens its sibling document. The selected card receives initial focus while preceding and following sibling cards remain visible in document order.

If the card has no siblings, the document contains one card. Root cards form a root-level sibling document under the same rule.

The card that opens Document mode remains the Option owner for that session. Focusing, editing, splitting, or adding another sibling card does not reassign the History pane. Navigating to a parent or child document opens the destination card as the new Option owner.

Closing Document mode returns to the same structural location in Map mode. Opening or closing creates no Option and changes no content.

### 2. Edit Current

Current is edited directly. Content and name changes use the existing persistence behavior and are reflected in Map mode.

The entry card is indicated through focus and a restrained active marker. Its visual treatment must not break the continuous-document reading experience.

### 3. Add and restructure sibling cards

Document mode provides an `Add sibling` action. It inserts a new empty Card immediately after the focused Card and moves focus to it. If no Card is focused, it appends the new Card to the document.

The new Card belongs to the same `parentId` and `columnIndex` group. In Document mode it can be edited, split into another sibling, merged with an adjacent sibling, and viewed in Map mode. Moving a Card to another parent or column and creating children are Map-mode operations. Adding or restructuring sibling Cards changes Current only; it does not create an Option.

Document mode reuses the existing card key bindings within Document-mode scope:

| Key | Document-mode behavior |
| --- | --- |
| `Ctrl+Enter` | Split the focused Card at the cursor, create a following sibling Card, and focus it. |
| `Alt+Enter` | No structural action. Child creation is a Map-mode operation. |
| `Up` / `Down` | At the corresponding text boundary, move to the preceding or following sibling Card. Otherwise retain normal text-cursor behavior. |
| `Alt+Up` / `Alt+Down` | Move to the preceding or following sibling Card regardless of cursor position. |
| `Alt+Left` | Move to the parent card and open the parent's sibling document. |
| `Alt+Right` | Move to the first child and open that child's sibling document. If no child exists, do nothing. |
| `Backspace` at Card start | Merge the focused lower Card into its preceding upper sibling when the lower Card has no children. Clear all Options owned by both Cards, keep the upper Card as the merged live Card, and delete the lower Card. |
| `Delete` at Card end | Merge the following lower sibling into the focused upper Card when the lower Card has no children. Clear all Options owned by both Cards, keep the upper Card as the merged live Card, and delete the lower Card. |

Document mode exposes no drag, reparent, move-to-column, column creation/deletion, or child-creation command. A merge whose lower Card has children, and every command with no valid target, does nothing and must not change document state. While an AI action owns the busy state, structural commands follow the same rejection policy as Map mode.

### 4. Browse History Options

At desktop widths, the History pane appears to the right of Current. It shows the Options attached to the current Option owner card, with one selected Option as a complete read-only document preview together with:

- its position in history;
- creation time;
- source (`Manual` or `AI`);
- `Newer` and `Older` controls;
- `Use as current` and `Delete option` actions.

The newest Option is closest to Current. Equal timestamps use descending Option ID as the stable tie-breaker. In the focused History pane, `Left` selects the next newer Option and `Right` selects the next older Option. At either boundary, the selection remains on the available Option. Arrow keys inside Current retain normal text editing behavior.

Browsing does not present a diff and does not change Current. History controls are disabled when no Options exist.

### 5. Save Current as an Option

`Save current as option` captures the complete Current sibling document in one atomic snapshot and writes one record under `project.data.options` with `source: "Manual"` and the Option owner card's ID in `cardId`. The new Option becomes the selected History preview; Current remains unchanged and editable.

Repeated actions create distinct Options even when their contents are identical. Options are not created on keystroke, blur, navigation, opening, closing, or elapsed time.

### 6. AI actions in Map and Document modes

AI-created alternatives use the same Option records, History browser, and `Use as current` behavior as every other Option. `source: "AI"` is provenance metadata only; the interface exposes no separate AI-specific Option type or creation flow.

An AI action has exactly one of two effects:

1. **Existing Card target:** create one immutable Option for that Card by writing one record under `project.data.options` with the target Card's ID in `cardId`. The Card's Current content is not overwritten.
2. **New Card target:** add the generated Card or Cards directly to the live Map structure through the existing project mutation owner.

AI never deletes a Card or an Option. Creating an Option does not automatically use it as Current. Document mode exposes only AI actions whose result remains in the current sibling group: rewriting an existing Card into an Option, or Continue/Summarize targeting the immediate following Card or creating one following sibling. Child-adding AI actions remain available in Map mode only.

An Existing Card target still produces a complete sibling-document snapshot. The generated content replaces only the target Card inside that snapshot; every other direct sibling Card's identity, name, content, and order are copied from Current unchanged. Descendant subtrees are live Map state and are not copied into the Option. The target Card is the Option owner.

| Action | Target and result |
| --- | --- |
| Continue | If an immediate following sibling exists, create one Option on that following Card. Otherwise add one new following sibling Card. |
| Summarize | If an immediate following sibling exists, create one Option on that following Card. Otherwise add one new following sibling Card. |
| Expand | In Map mode, add one new child Card after the source Card's existing children. Existing children remain unchanged. Unavailable in Document mode. |
| Breakdown | In Map mode, add multiple new child Cards after the source Card's existing children. Existing children remain unchanged. Unavailable in Document mode. |
| Custom — `Rewrite this Card` | Create one Option on the source Card. Current remains unchanged. |
| Custom — `Continue to next Card` | Apply the same existing-following-Card or new-Card rule as Continue. |
| Custom — `Add child Cards` | In Map mode, add one or more child Cards after existing children. Unavailable in Document mode. |

For Continue and Summarize, “create one Option on the following Card” means adding a new immutable alternative; it never edits or replaces an existing Option. For Custom, the explicit target remains authoritative regardless of prompt wording. AI receives no Card- or Option-deletion effect, so delete wording cannot delete or relocate anything; generated text may still describe deletion as ordinary content.

When an Option-targeting action streams, output remains temporary until completion. Cancellation, transport failure, empty output, invalid output, or persistence failure creates no Option and leaves Current and existing Options unchanged. A retry is a new action and may create a separate Option.

When a Card-adding action streams, it retains the current placeholder lifecycle. Failure may leave a visible error Card but cannot alter or delete any pre-existing Card or Option.

### 7. Use a historical Option

`Use as current` performs one atomic mutation:

1. Capture the outgoing Current as a new Option record with `source: "Manual"`, using the same owner `cardId`.
2. Copy the selected historical Option into Current.
3. Keep the selected source Option unchanged in History.
4. Preserve the Option owner card's identity and keep its attached History on that card.
5. Focus the owner Card in the new Current so editing can continue immediately.

The replacement is restricted to the owner's current sibling scope. It may add, remove, or reorder direct siblings under the current `parentId` and `columnIndex`, but it cannot move an existing live Card across a parent or column boundary or modify a descendant. If the selected Option references a captured Card ID that is live outside that sibling scope, would remove a live sibling with descendants, or cannot persist in full, neither the outgoing Current snapshot nor the Current replacement is applied.

Combining ideas from multiple Options uses ordinary copy and direct editing in Current. There is no separate finalize, merge, accept, conflict, or stale-state workflow.

### 8. Delete a historical Option

`Delete option` removes only the selected Option record from `project.data.options` after confirmation. It never changes Current. If a newer Option remains, the nearest newer Option becomes selected; otherwise the nearest older Option becomes selected.

If the Option owner card has exactly one historical Option, `Delete option` is disabled. A card with no historical Options may remain in that initial state until its first Option is created; after that, `Delete option` cannot return it to zero Options.

Options are never discarded by retention or background cleanup. Explicit Card deletion removes the deleted Card, every descendant, and all Options owned by those deleted Card IDs. Merging two Cards clears the Options owned by both participating Cards before deleting the lower Card; the surviving upper Card begins with no History. If browser storage cannot accept another complete Option, creation fails atomically and reports that storage is unavailable or full.

## State model

```text
explicit save ───────────────> Option (`source: Manual`)
AI rewrite existing Card ────> Option (`source: AI`)
AI targets missing/new Card ─> live Card addition

Historical Option ── browse ──> no state change

Historical Option ── use as current ──> snapshot outgoing Current
                                      + copy selected Option into Current

Map Card deletion ────────────> delete Card + descendants
                                      + their owned Options

Document sibling merge ───────> clear Options for upper + lower Cards
                                      + merge into upper Card
                                      + delete childless lower Card
```

Creation source is provenance metadata only. It does not imply ancestry, merge parents, or change lineage.

## Representative behavior

### Read and extend a sibling document

The user opens one card in a three-sibling group. All three Cards appear consecutively in Current. The user selects the second Card and invokes `Add sibling`; a fourth Card appears immediately after it in both Document mode and Map mode.

### Split with the existing keymap

The user places the cursor halfway through a Card and presses `Ctrl+Enter`. The text after the cursor moves into a new following sibling Card, which receives focus. No Option is created.

### Navigate into a child document

The user presses `Alt+Right` on a Card that already has children. Document mode changes scope to the first child's sibling group. `Alt+Left` returns to the parent's sibling document. `Alt+Enter` does not create a child in Document mode; child creation remains in Map mode.

### Save and continue editing

The user invokes `Save current as option`, then continues rewriting Current. The saved direct sibling document remains read-only on the right.

### Browse without changing Current

With the History pane focused, the user presses `Right` to select an older Option and `Left` to return to a newer one. Current on the left remains unchanged.

### Restore an Option

The user chooses `Use as current`. The outgoing Current is saved as an Option with `source: "Manual"`, a copy of the chosen Option becomes Current, and the historical source remains available.

### Rewrite the current Card with AI

The user chooses `Rewrite this Card`. AI produces replacement text, and the system stores one Option with `source: "AI"` and the source Card's ID in `cardId`. The live Card remains unchanged until the user invokes `Use as current`.

### Continue into an existing or new Card

The source Card already has an immediate following sibling. Continue creates one Option owned by that following Card and leaves its Current content unchanged. If no following sibling exists, Continue adds one new following Card directly to the live Map.

### Add child Cards with AI

Expand appends one child Card. Breakdown appends every generated child Card after the existing children. Neither action converts existing children into Options or deletes them.

### Move a card with its History

The user moves an Option owner card beneath another parent. Its History Options remain attached to that card and appear when the card is opened in its new sibling document. The card's descendant subtree moves with it, and each descendant card retains its own attached History.

If one of that Card's historical Options includes a Card ID that is still live in another sibling group, the Option remains previewable but `Use as current` is unavailable. Document restore never pulls that Card across a parent or column boundary.

### Delete or merge Cards with History

Deleting a Card in Map mode deletes the Card, its descendants, and every Option owned by those deleted Card IDs. Merging an upper and lower sibling in Document mode clears the Options owned by both Cards, keeps the upper Card with the merged content, and deletes the lower Card. A lower Card with children cannot be merged in Document mode because that would reparent descendants.

### Keep one historical Option

An Option owner card has one historical Option. `Delete option` is disabled, so the History cannot be emptied through deletion. A legacy card that has never created an Option may still have an empty History pane.

### Fail safely

An Option-targeting AI action streams part of an alternative and fails, or local storage rejects the snapshot. No partial Option is stored and Current remains unchanged. A Card-adding AI action may retain its visible error placeholder, but all pre-existing Cards and Options remain unchanged.

## Scope and non-goals

This project includes:

- compact Map columns with hue-and-depth hierarchy;
- Document mode for one sibling group;
- continuous editing of Current, including sibling creation and the sibling-scoped subset of the existing structural keymap;
- read-only Options to the right of Current, with creation source shown only as metadata;
- horizontal History selection;
- atomic Option creation, deletion, and use;
- persistence, reload, import, and export compatibility.

This project does not include:

- diff highlighting, change lists, merge drafts, conflicts, or lineage graphs;
- simultaneous editing of historical Options;
- automatic snapshots;
- detaching Options from their owner card, assigning them to another card, or moving them across projects; moving an owner card to another sibling group still carries its Options with that card;
- Document-mode child creation, drag/reparent operations, or column creation and deletion;
- automatic semantic combination of several Options;
- multi-user collaboration, remote sync, or source-control terminology.

## Compatibility obligations

- Existing local projects and unversioned or schema-version-1 imports retain their live hierarchy and begin with Current only, without fabricated Options.
- Persisted Options survive reload.
- The next project schema adds one top-level `data.options` dictionary. Legacy input without `options` normalizes it to an empty dictionary.
- Every persisted Option record has a unique Option ID and a `cardId` identifying one valid Option owner card. Moving or reparenting that card does not change the record or attachment.
- Descendant cards retain their own Option attachments when their subtree moves. Their History is referenced by card identity rather than recursively copied into every ancestor Option snapshot.
- Deleting a Card deletes all Option records whose `cardId` belongs to that Card or one of its deleted descendants. Merging two Cards clears all Option records owned by either participating Card before the lower Card is deleted.
- JSON export round-trips Current and all Options. Invalid Option state causes atomic import rejection.
- Plain-text export emits Current only.
- A format containing Options uses an explicit supported schema version; it must not be written as schema version 1.
- Live card IDs remain unique across the project. Validation rejects missing Option owners, duplicate live IDs, missing parents, cycles, invalid columns, and ambiguous Option ownership.

## Ownership obligations

Implementation must preserve the current module boundaries:

- Current mutations, sibling commands, the `project.data.options` collection, Option lifecycle, timestamps, and persistence belong to `projectState.js` or a deeper state owner reached through it.
- Option parsing, normalization, validation, legacy compatibility, and export envelopes belong to `projectFormat.js`.
- Document-mode presentation, Current editing, History browsing, and responsive layout belong to `editorView.js` or a view module reached through it.
- Keyboard gestures remain command translation in `cardShortcuts.js`; they do not mutate project data directly.
- AI target selection and Option-or-Card placement belong to `aiWorkflow.js`; provider request construction remains in `aiService.js`.
- The browser-only native ES-module runtime and local persistence boundary remain unchanged.

The accepted implementation must update the current Domain, Data schema, Architecture, and Testing authorities when these behaviors become current.

## Acceptance claims

| Key | Behavioral claim | Representative conditions |
| --- | --- | --- |
| `CHG-OPT-DOCUMENT-SCOPE` | Opening a card unfolds that card and its ordered siblings as one continuous document. | Root, only-child, and multi-sibling groups |
| `CHG-OPT-CURRENT-HISTORY-LAYOUT` | Current is left and visually primary; its read-only History Options are right at desktop widths and reflow without reversing that hierarchy at narrow widths. | Desktop and narrow widths |
| `CHG-OPT-ONE-CURRENT` | Each sibling document has exactly one mutable Current, and Map mode renders it. | Legacy project and document with Options |
| `CHG-OPT-CARD-OWNERSHIP` | Each Option remains attached to one stable owner card when that card moves or is reparented. | Move within a sibling group and move beneath another parent |
| `CHG-OPT-STORE-BY-CARD-ID` | Every Option is stored once under `project.data.options` and resolves to its owner through `cardId`; cards contain no duplicate Option payload or index. | Manual save, AI rewrite, reload, move, export, and import |
| `CHG-OPT-DESCENDANT-HISTORY` | Moving a card subtree carries each descendant card and that descendant's own attached Options without merging histories. | Nested descendants with independent Options |
| `CHG-OPT-ADD-SIBLING` | `Add sibling` inserts and focuses a normal Card immediately after the focused Card without creating an Option. | Middle Card and no focused Card |
| `CHG-OPT-DOCUMENT-BOUNDARY` | Document-mode mutations remain within the current sibling group; child creation, reparenting, cross-column movement, and column operations remain Map-only. | Command UI, `Alt+Enter`, drag, and restore |
| `CHG-OPT-KEYMAP-SPLIT` | `Ctrl+Enter` preserves sibling-split behavior, while `Alt+Enter` performs no structural action in Document mode. | Start, middle, and end cursor positions |
| `CHG-OPT-KEYMAP-NAVIGATE` | Boundary arrows and `Alt` navigation move through sibling, parent, and child document scopes without changing content. | Valid target and missing target |
| `CHG-OPT-KEYMAP-MERGE` | Boundary Backspace and Delete merge a childless lower Card into its upper sibling, clear both Cards' Options, and keep the upper Card; a lower Card with children is unchanged. | Both merge directions, Options on either Card, and lower Card with children |
| `CHG-OPT-PAST-OPTIONS` | Historical Options are complete read-only alternatives, not diffs or merge candidates; creation source is metadata only. | `Manual` and `AI` sources |
| `CHG-OPT-STABLE-ORDER` | History order is deterministic by descending creation time and then descending Option ID. | Distinct and equal timestamps |
| `CHG-OPT-EXPLICIT-SAVE` | One explicit save atomically captures one complete Option and leaves Current editable. | Repeated and identical saves |
| `CHG-AI-REWRITE-OPTION` | Rewriting an existing Card creates one Option owned by that Card and does not overwrite Current. | Map and Document modes |
| `CHG-AI-NEXT-OPTION-OR-CARD` | Continue and Summarize create an Option on the immediate following Card when it exists; otherwise they add one following Card. | Existing and missing following sibling |
| `CHG-AI-CHILD-ADD` | In Map mode, Expand adds one child and Breakdown adds multiple children after existing children without modifying them; both actions are unavailable in Document mode. | No children, existing children, and Document mode |
| `CHG-AI-CUSTOM-TARGET` | Custom placement follows an explicit target selected before generation and cannot be changed silently by prompt wording; child-Card placement is Map-only. | Rewrite, next Card, child Cards, and both modes |
| `CHG-AI-NO-DELETE` | No AI action has a Card- or Option-deletion effect, regardless of prompt wording. | Success, delete wording, failure, and retry |
| `CHG-OPT-PREVIEW-SAFE` | Selecting newer or older History Options never changes Current. | First, middle, and last Option |
| `CHG-OPT-USE-ATOMIC` | Using an Option preserves outgoing Current and replaces only the owner's current sibling scope, or has no effect; it never moves a live Card across parent or column boundaries or modifies descendants. | Success, persistence failure, captured ID live in another scope, and removal candidate with descendants |
| `CHG-OPT-KEEP-ONE` | A card may start with no History, but `Delete option` cannot remove its final historical Option once one exists. | Legacy empty History, one Option, and multiple Options |
| `CHG-OPT-CARD-DELETE-CASCADE` | Deleting a Card deletes its descendants and every Option owned by a deleted Card; merging clears the Options owned by both participating Cards. | Direct deletion, descendant deletion, Backspace merge, and Delete merge |
| `CHG-OPT-FAILURE-NONDESTRUCTIVE` | Failed Option creation or switching leaves Current and all stored Options unchanged. | AI and storage failures |
| `CHG-OPT-LEGACY-LOAD` | Existing projects retain their hierarchy and receive no fabricated Option history. | Local storage and version-1 or unversioned import |
| `CHG-OPT-ROUND-TRIP` | JSON export and import preserve Current and all valid Options. | `Manual` and `AI` sources with descendant subtrees |
| `CHG-OPT-COMPACT-MAP` | Map columns remain visually tight and use branch hue plus depth tint. | Multiple roots and depths |

## Verification strategy

Status: Executed for the current working-tree implementation. This section remains the renewal contract for later changes. Evidence owners adjudicate the named oracles, while the accountable product owner decides whether residual risk is acceptable.

The pre-implementation `npm test` run remains baseline evidence. These claims are supported by the corresponding deterministic tests and implementation-bearing browser checks recorded in the execution log; future material changes must renew the affected `VER-*` obligations.

### Evidence portfolio

| Evidence obligation | Acceptance claims and principal risk | Falsifying evidence and oracle | Owner, location, and run point | Boundary and renewal trigger |
| --- | --- | --- | --- | --- |
| `VER-OPT-FORMAT` — Option format and compatibility contract | `CHG-OPT-STORE-BY-CARD-ID`, `CHG-OPT-LEGACY-LOAD`, `CHG-OPT-ROUND-TRIP`. High consequence: malformed or partially interpreted state can lose writing or make a project unloadable. | Deterministic `projectFormat` contract tests must show that version-1 and unversioned input normalize to `options: {}` without fabricated history; the Option schema accepts valid keyed Options; key/ID disagreement, invalid owner, source, timestamp, snapshot, or direct sibling document is rejected; plain-text export omits Options; JSON export/import deep-round-trips Current and Options; rejected input produces no normalized project. Any accepted invalid relationship, fabricated Option, or unequal round trip falsifies the claims. | Format owner in `tests/project/project-format.test.js`, before merge and on every format change. Preserve rejected fixtures and normalized output as diagnostics. | Does not prove browser storage, download effects, or state mutation atomicity. Renew when the schema version, Option fields, snapshot shape, normalization, or validation rules change. |
| `VER-OPT-STATE` — Atomic and immutable Option lifecycle | `CHG-OPT-ONE-CURRENT`, `CHG-OPT-PAST-OPTIONS`, `CHG-OPT-STABLE-ORDER`, `CHG-OPT-EXPLICIT-SAVE`, `CHG-OPT-USE-ATOMIC`, `CHG-OPT-KEEP-ONE`, `CHG-OPT-CARD-DELETE-CASCADE`, `CHG-OPT-FAILURE-NONDESTRUCTIVE`. High consequence: a partial switch or identity-destructive action can overwrite Current or leave orphaned history. | `projectState` tests with an observable persistence seam must show: save creates exactly one distinct immutable record and one completed persistence effect while Current is unchanged; preview creates no mutation; History sorts equal timestamps by descending Option ID; use-as-current stores outgoing Current and replaces only the owner's sibling scope in one mutation; a captured ID live outside that scope, a removal candidate with descendants, and injected persistence failure each restore the exact pre-action project; the source Option is byte-for-byte unchanged; repeated identical saves remain distinct; `Delete option` selects the specified neighbor and refuses the final Option; Card deletion removes Options for the Card and descendants; both merge directions clear Options for both Cards, retain the upper Card, and reject a lower Card with children without mutation. Any partial state, mutated historical record, orphaned owner, descendant mutation, cross-scope move, or lifecycle result outside these rules falsifies the claims. | State owner in `tests/project/project-state.test.js`, before merge and on every Option lifecycle, Card deletion, merge, ordering, or transaction change. Retain before/after project snapshots and persistence-call counts. | Does not prove browser focus or storage quota behavior. Renew when transaction, persistence, Option ordering, deletion, merge, or snapshot application changes. |
| `VER-OPT-IDENTITY-MOVE` — Card-owned History survives Map movement | `CHG-OPT-CARD-OWNERSHIP`, `CHG-OPT-DESCENDANT-HISTORY`, `CHG-OPT-STORE-BY-CARD-ID`, `CHG-OPT-DOCUMENT-BOUNDARY`. High consequence: moves can orphan, duplicate, or merge histories. | State tests must move an owner within its sibling group and beneath another parent in Map mode, then move a nested subtree whose descendants own independent Options. The live Card IDs, every Option ID, and each Option `cardId` must remain unique and unchanged; resolving History by each moved Card ID must return exactly the pre-move set; no Card gains an embedded Option payload or index. A selected historical Option that references a Card now live outside the owner's group must remain previewable while use is rejected with an exact before/after state match. A lost, rewritten, duplicated, cross-owner, or cross-scope-moved Option falsifies the claims. | State owner in `tests/project/project-state.test.js`, before merge and on every move, reparent, restore, or Option-indexing change. Record the full keyed Card and Option sets. | Does not prove Document command availability in the DOM. Renew when Map movement, restore scope, Card identity, or Option indexing changes. |
| `VER-DOCUMENT-INTERACTION` — Document rendering and structural commands preserve scope | `CHG-OPT-DOCUMENT-SCOPE`, `CHG-OPT-CURRENT-HISTORY-LAYOUT`, `CHG-OPT-DOCUMENT-BOUNDARY`, `CHG-OPT-ADD-SIBLING`, `CHG-OPT-KEYMAP-SPLIT`, `CHG-OPT-KEYMAP-NAVIGATE`, `CHG-OPT-KEYMAP-MERGE`, `CHG-OPT-PREVIEW-SAFE`, and presentation aspects of `CHG-OPT-ONE-CURRENT` and `CHG-OPT-PAST-OPTIONS`. Medium-to-high consequence: focus or command routing can edit the wrong document or hierarchy level. | Component tests through the view and shortcut command interfaces must cover root, only-child, and multi-sibling documents; Current-left/History-right order; read-only History; stable owner while focus, split, and sibling insertion change; owner reassignment only when parent/child navigation opens another document; `Alt+Enter` with zero mutation; absence of drag, reparent, column, manual child-creation, Expand, Breakdown, and Custom child-placement commands; both valid childless merges and a rejected lower Card with children; all navigation boundary and missing-target cases; busy-state rejection; newer/older boundaries; and zero project mutation during preview. Focused browser smoke must repeat editing, focus, keyboard, narrow-width reflow, and no-runtime-error paths. Wrong owner, editable History, unexpected parent/column change, or command placement falsifies the claims. | View and shortcut owners in `tests/editor/editor-view.test.js`, `tests/editor/card-shortcuts.test.js`, and a recorded local browser smoke, before merge. Retain command logs, project before/after snapshots, viewport size, and screenshots for layout failures. | Node component tests do not prove browser focus, textarea selection, responsive layout, or assistive semantics; the browser smoke does not exhaust all state combinations. Renew when Document DOM, focus policy, keymap mapping, busy policy, or responsive layout changes. |
| `VER-AI-PLACEMENT` — AI target choice produces exactly one allowed effect | `CHG-AI-REWRITE-OPTION`, `CHG-AI-NEXT-OPTION-OR-CARD`, `CHG-AI-CHILD-ADD`, `CHG-AI-CUSTOM-TARGET`, `CHG-AI-NO-DELETE`. High consequence: placement errors can overwrite or structurally misplace writing. | `aiWorkflow` tests with fake provider, state, and view collaborators must cover both modes. Rewrite creates one Option on the source; Continue and Summarize create one Option on the immediate following Card when present and otherwise one following Card; in Map mode Expand appends one child, Breakdown appends all returned children, and Custom child placement adds its requested children; in Document mode those three child-adding paths are unavailable and invoke no provider or mutation collaborator. Each available Custom target follows the explicit pre-generation choice even when prompt wording requests deletion or another placement. For every executed case, assert the exact added Option/Card IDs and deep equality of all pre-existing Cards and Options. Any unavailable action execution, second effect, overwrite, replacement of an existing Option, or call to a Card/Option deletion capability falsifies the claims. | AI workflow owner in `tests/ai/ai-workflow.test.js`, before merge and on every action-plan, target, multipart, mode, or placement-policy change. Retain the action plan and collaborator call trace. | Fake collaborators prove deterministic placement policy, not provider transport or browser presentation. Prompt wording is ordinary provider input; the authoritative target, mode, and available mutation capabilities are the observable safety boundary. |
| `VER-AI-FAILURE` — AI failure is non-destructive and replayable | `CHG-AI-NO-DELETE`, `CHG-OPT-FAILURE-NONDESTRUCTIVE`, plus failure paths of the three AI placement claims. High consequence: streaming or retry can leave partial Options or mutate pre-existing Cards. | Deterministic workflow tests inject cancellation, setup throw, transport error, empty output, invalid output, persistence failure, and retry. Option-targeting paths must leave Current and the entire Option dictionary deep-equal to the initial state. Card-adding paths may leave only the newly created error placeholder allowed by the contract; all pre-existing Cards and Options must remain deep-equal. Retry may produce one new result but cannot replay a prior side effect. Partial Options, changed pre-existing state, leaked busy state, or duplicate placement falsifies the claims. | AI workflow and state owners in `tests/ai/ai-workflow.test.js` and `tests/project/project-state.test.js`, before merge and on every streaming, cancellation, retry, placeholder, or persistence change. Preserve injected failure class and call trace. | Does not reproduce arbitrary provider behavior or storage quota variation. Use a bounded real-provider check only when transport integration changes; it is not the oracle for placement and must not expose credentials. |
| `VER-BROWSER-PERSISTENCE` — Reload and transfer preserve the implemented contract | `CHG-OPT-ONE-CURRENT`, `CHG-OPT-STORE-BY-CARD-ID`, `CHG-OPT-LEGACY-LOAD`, `CHG-OPT-ROUND-TRIP`. High consequence: Node-only success can hide browser storage or transfer loss. | A focused browser smoke must create Manual and AI-sourced Options, reload, export JSON, import it as a new project, and compare Current plus keyed Options; import version-1 and unversioned fixtures and confirm empty History without hierarchy change; export plain text and confirm it contains Current only; attempt an invalid-Option import and confirm the project list, active selection, and serialized storage are unchanged. Loss across reload, unequal transfer, fabricated history, or any rejected-import side effect falsifies the claims. | Transfer, format, and state owners; recorded local browser run before merge and before release packaging. Retain sanitized exported JSON, pre/post storage hashes, and console errors. | Local browser evidence does not prove every storage quota or browser implementation. Renew when storage keys, schema, serialization, import/export UI, or startup restoration changes. |
| `VER-MAP-HIERARCHY` — Compact Map still communicates hierarchy | `CHG-OPT-COMPACT-MAP`. Medium consequence: reduced gutters can collapse parent/child and root distinctions. | Browser checks at representative desktop and narrow widths must measure adjacent column gaps within 4–8 px and capture roots with at least three depths. Computed styles and screenshots must show one stable hue per root branch, distinguish different roots, and change tint or rail emphasis monotonically by depth without clipping, overlap, or unreadable contrast. A gap outside the range, indistinguishable roots/depths, overlap, or illegible state falsifies the claim. | View/style owner in a recorded browser smoke before merge. Retain viewport sizes, computed gap/color values, and screenshots. | Screenshot review is perceptual and a small fixture is not universal accessibility evidence. Renew when Map layout, color tokens, hierarchy calculation, breakpoints, or card surfaces change. |

### Execution order and evidence maintenance

1. Run format and state tests first because they provide the fastest counterexamples for data loss, identity, scope, and atomicity.
2. Run AI placement and injected-failure tests through fake collaborators; a remote provider is not required for those claims.
3. Run view and shortcut component tests, then the complete non-provider `npm test` regression suite.
4. Run the focused browser persistence, transfer, Document interaction, and Map hierarchy checks in an implementation-bearing browser.
5. Run `node --check` on every changed JavaScript module and `git diff --check`; record these as implementation-integrity checks, not substitutes for behavioral evidence.

An escaped defect must add its smallest reproducible counterexample to the earliest credible deterministic layer, then renew every downstream obligation whose assumptions it invalidates. Evidence is stale after a material change to the Option schema or snapshot, transaction/persistence boundary, Card identity lifecycle, Document focus/command model, AI target policy, browser storage/transfer path, or Map layout tokens.

## Readiness

The confirmed product behavior in this document is canonical for this project. An implementer may rely on the sibling-document scope, card-owned History that moves with each card and descendant subtree in Map mode, Current-left and History-right relationship, one unified immutable Option concept, explicit-save and AI creation sources, AI target placement into Options or live Cards, the no-delete AI invariant, sibling-scoped copy-on-use, Document-mode sibling editing and navigation, deterministic History ordering, Card-deletion and merge cleanup, the `Delete option` final-Option guard, and the absence of diff or merge-candidate semantics.

The implemented export schema version is 2. `project.data.options` is a keyed dictionary, and `snapshot.cards` is the validated direct-sibling payload defined above. The evidence portfolio has run against that representation; its stated boundaries remain residual limits rather than unexecuted work.

This behavior contract is **implemented and verified in the current working tree**. This specification remains the canonical change record and renewal oracle; it does not by itself authorize release or deployment.
