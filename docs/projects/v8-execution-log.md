# V8 Execution Derivations and Assumptions

Status: Complete implementation and verification record

This log records material derivations and assumptions made while implementing the canonical [V8 Document Options View specification](v8-evolution-view.md). It is execution evidence, not a second source of product behavior. If this log conflicts with the canonical specification or current authority documents, the current authority documents govern.

## Review and verification contract

- “Complete the spec” is interpreted as implementing the canonical V8 behavior end to end in product code, tests, and current authority documents; it does not mean editorial completion alone.
- No commit, release, deployment, remote provider call, or credential use is authorized by this goal.
- After implementation and verification, the candidate working-tree snapshot will be pinned and reviewed read-only against the canonical V8 claims. Any finding repair will occur outside the review pass, followed by a new pinned review and complete verification run.
- Existing `npm test` results are baseline regression evidence only until V8-specific tests execute against implementation-bearing code.

## User-decided behavior consumed without reinterpretation

- Options use one concept. `Manual` and `AI` are provenance metadata, not different Option types.
- Current is left and editable; History Options are right and read-only.
- Options are stored once under `project.data.options` and resolve to an owner through `cardId`.
- Map movement carries an owner Card, its descendants, and each Card's attached Options.
- Deleting a Card deletes its descendants and every Option owned by a deleted Card.
- Merging adjacent Cards clears the Options owned by both participating Cards, keeps the upper Card, and deletes the lower Card.
- Document mode mutates only the current sibling group. Parent, child-creation, reparenting, and column-level mutations remain Map-mode operations.
- AI can create an Option for an existing Card or add live Cards according to the canonical action table, but it cannot delete a Card or Option.

## Initial implementation derivations

### DER-001 — Export schema version

- **Derivation:** Version 1 has no `data.options` contract, while V8 requires explicit versioning whenever Options are present. The next supported envelope version will therefore be `schemaVersion: 2`.
- **Preserved compatibility:** Unversioned and version-1 input remains accepted and normalizes `data.options` to `{}`. Version 1 is never interpreted as containing Options. A version-2 export is used for every project after V8 because normalized project data always has an `options` dictionary, including when it is empty.
- **Owner:** `projectFormat.js`.

### DER-002 — Option snapshot boundary

- **Derivation:** An Option snapshot contains the ordered direct sibling Cards only: Card ID, name, content, and sibling order. It excludes descendants, attached Options, derived color, parent reassignment, and column reassignment.
- **Reason:** Document mode may change only siblings. Descendants and their Options remain live card-owned Map state.
- **Owner:** `projectState.js` representation, validated by `projectFormat.js`.

### DER-003 — Scope-safe restore

- **Derivation:** `Use as current` targets the Option owner's current `parentId` and `columnIndex`; historical parent or column values are not restored. A captured Card already live outside that group, or a current sibling with descendants that the snapshot would remove, makes the operation unavailable and produces no state or persistence effect.
- **Reason:** This is the smallest deterministic enforcement of the no-cross-scope Document rule and avoids implicit reparenting or descendant deletion.
- **Owner:** `projectState.js`, surfaced by `editorView.js`.

### DER-004 — Merge scope

- **Derivation:** Both Backspace and Delete sibling merges keep the upper Card. A lower Card with children cannot merge in Document mode because the existing merge behavior would reparent descendants. Before a valid merge, Options for both upper and lower Cards are removed atomically.
- **Owner:** `projectState.js`; gestures remain in `cardShortcuts.js`.

### DER-005 — Deterministic History order

- **Derivation:** History sorts by `createdAt` descending, then Option ID descending by JavaScript code-unit comparison. The second key is stability, not a claim that random IDs encode creation order.
- **Owner:** `projectState.js` query behavior; `projectFormat.js` validates both fields.

## Open implementation assumptions

No material implementation assumption remains open. Residual verification limits are stated by the evidence portfolio rather than treated as missing behavior.

## Resolved implementation assumptions

### DER-006 — Serialized direct sibling snapshot

- **Decision:** `snapshot` is an object with one ordered `cards` array. Each element contains `id`, `name`, `content`, and `order`. Option and snapshot objects may preserve unknown properties for forward-compatible round-trip behavior, but V8 behavior ignores them.
- **Validation:** Card IDs in one snapshot are unique; the Option owner ID appears exactly once; `name` is string or `null`; `content` is text; and `order` is finite. A snapshot Card may be absent from the live Card dictionary because historical restore can recreate a deleted direct sibling.
- **Excluded fields:** `parentId`, `columnIndex`, `color`, descendants, and attached Options are not part of the canonical snapshot payload.
- **Owner:** `projectFormat.js` and `projectState.js`.

### DER-007 — AI streaming ownership

- **Decision:** Option-targeted AI output uses a transient, non-editing stream attached to the target Card and creates no persistent placeholder. Only a valid non-empty completion writes one `source: "AI"` Option. Card-targeted output creates one live placeholder Card and retains it with a visible error on failure.
- **Reason:** This keeps Current authoritative, preserves the no-delete AI invariant, and gives each failure path one inspectable effect.
- **Owner:** `aiWorkflow.js`, with presentation in `editorView.js`.

### DER-008 — Document session owner and rendering

- **Decision:** Document mode is view state inside `editorView.js`: opening Card ID, focused sibling Card ID, and selected Option ID. Focus, add, split, and merge update the sibling document without changing the opening Card ID; parent/child key navigation explicitly opens a new owner Card.
- **Reason:** History ownership is stable by Card identity while Document commands remain controller-routed state mutations. No router, duplicated project state, or embedded Options are introduced.
- **Owner:** `editorView.js`, `editorController.js`, and `cardShortcuts.js`.

### DER-009 — Map hierarchy visual encoding

- **Decision:** Root Cards receive stable order-derived hues. Descendants retain the root hue, become two lightness points lighter per depth (capped at 97%), and receive a same-hue left rail whose darkness increases with depth. Sibling order does not encode depth.
- **Reason:** The same branch remains perceptually connected while parent/child depth has a separate monotonic cue. Map column spacing is reduced from 15px to 6px.
- **Owner:** `projectState.js`, `editorView.js`, and `style.css`.

### DER-010 — Browser verification isolation

- **Decision:** Browser mutation checks run on a separate localhost port so its origin has isolated browser storage. A generated, sanitized version-2 fixture supplies one Manual and one AI Option without contacting a provider; version-1, unversioned, and invalid fixtures exercise compatibility and rejection.
- **Reason:** The browser pass must test persistence and import presentation without using credentials, a remote provider, or pre-existing user project data.
- **Owner:** Verification execution only; generated fixtures remain outside the repository.

### DER-011 — Map-to-Document entry affordance

- **Decision:** A normal click anywhere on a Map Card outside its action buttons opens that Card's sibling document and focuses it. No separate Document button remains. The opening Card receives a restrained `owner` marker inside Current for the lifetime of that Document session.
- **Reason:** This implements the canonical direct-card entry contract and keeps the Map visually minimal while preserving action-button and drag handling.
- **Owner:** `editorView.js` and `style.css`.

### DER-012 — Browser download evidence split

- **Derivation:** The selected in-app browser exposes the export command and runtime log but not the downloaded Blob body. Download verification is therefore split across two implementation-bearing boundaries: the browser invokes `Export JSON`, closes the menu, and records the successful command without a runtime error; a deterministic test executes the same default `downloadBrowserFile` primitive with observable browser-platform collaborators and asserts the Blob MIME/body, filename, anchor creation/click/removal order, object URL, and revocation.
- **Assumption avoided:** A successful console message alone is not treated as proof of the Blob payload, and a format-only test is not treated as proof of the browser anchor effect.
- **Owner:** `projectTransfer.js`, `tests/project-transfer.test.js`, and the recorded browser smoke.

### DER-013 — Owner Card ID DOM assignment

- **Derivation:** The Document owner Card ID is assigned through `element.dataset` after the fixed markup is parsed rather than interpolated into `innerHTML`.
- **Reason:** Card IDs are imported data. DOM assignment preserves the owner hook without creating a new attribute-injection surface.
- **Owner:** `editorView.js`.

## Verification portfolio applied

- Format and state tests own schema, identity, transaction, ordering, deletion, merge, movement, and compatibility oracles.
- AI workflow tests own selected-target placement, Map/Document availability, no-delete capability, streaming completion, and failure effects with fake collaborators.
- View and shortcut tests own deterministic History selection, depth derivation, sibling-only navigation, Document hierarchy navigation, and no-op `Alt+Enter`.
- The implementation-bearing browser smoke owns DOM command availability, desktop and narrow layouts, editable/read-only separation, reload persistence, import effects, and runtime-error observation. It does not substitute for transaction or provider tests.

## Evidence ledger

| Date | Slice | Evidence | Result |
| --- | --- | --- | --- |
| 2026-08-28 | Pre-implementation baseline | `npm test` | 27/27 passed before V8 product-code changes |
| 2026-08-28 | Schema v2 and Option compatibility | `node --test tests/project-format.test.js tests/project-transfer.test.js`; `node --check projectFormat.js` | 12/12 passed; syntax passed |
| 2026-08-28 | Option state lifecycle and transaction rollback | `node --test tests/project-state.test.js` | 12/12 passed, including create, sort, delete guard, Card/descendant cleanup, merge cleanup, scope-safe restore, and simulated storage failure rollback |
| 2026-08-28 | AI Option-or-Card placement and failure semantics | `node --test tests/ai-workflow.test.js` | 17/17 passed: executed Continue, Summarize, Expand, Breakdown, and all Custom placements through fake collaborators; covered Document unavailability, exact ordered append, no overwrite/delete capability, transport and cancellation errors, empty/non-string output, persistence failure, setup throw, retry, and ignored late callbacks |
| 2026-08-28 | Document view and keymap contract | `node --test tests/editor-view.test.js tests/card-shortcuts.test.js` | 10/10 passed for History boundaries, hierarchy depth, owner navigation, sibling-only navigation, and Document `Alt+Enter` no-op |
| 2026-08-28 | Option identity under Map movement | `node --test tests/project-state.test.js` | 14/14 state tests passed, including owner move and nested subtree move with byte-equal keyed Options |
| 2026-08-28 | Integrated non-provider regression | `npm test` | 58/58 passed |
| 2026-08-28 | Implementation-bearing browser smoke, default desktop | `http://127.0.0.1:8766/index.html` on isolated origin | Current left of History; Current wider; History had zero editable textareas; no drag/column/child/Expand/Breakdown controls; 6px Map gap; matching parent/child kept hue and changed depth tint/rail |
| 2026-08-28 | Browser interaction and persistence | Manual save, History browse, use, Add sibling, `Alt+Enter`, `Ctrl+Enter`, reload | Final-Option delete disabled at one; browsing preserved Current; use added outgoing Option; owner stayed stable through add/split; child split was a no-op; sibling split succeeded; 3 Options and 6 Cards survived reload; no runtime or network failures observed on reload |
| 2026-08-28 | Browser compatibility and rejection | Sanitized version-2 Manual/AI fixture, version-1 fixture, bundled unversioned fixture, invalid Option fixture | Manual and AI appeared in one ordered History; version-1 and unversioned imports opened empty History; invalid import showed an alert and left project count, active project, and Document owner unchanged |
| 2026-08-28 | Independent code review pass 1 | Pinned manifest `b3ca31b99cf8ac57457eef57c2226197ed34427bc03fc1cb335d7adfe6f38fb5` against canonical interaction claims | Rejected: Map required a separate Document button instead of direct Card click; Current lacked a persistent opening-owner marker; Custom tooltip implied child-only placement |
| 2026-08-28 | Review-1 repair verification | `node --test tests/editor-view.test.js`; `npm test`; focused browser smoke on isolated port | 6/6 view tests and 47/47 full tests passed; clicking Map Card content opened Document, no separate Document button remained, opening Card had the owner class and initial focus, and no runtime errors were observed |
| 2026-08-28 | Independent code review pass 2 | Pinned manifest `3a946586a1e4b249f7484a4cee53b6af570aa1965dae4a7c270bb6318a7dc00f` against the repaired snapshot and verification claims | Rejected: project-document status text was stale; AI tests did not yet execute every claimed placement/failure collaborator trace; browser evidence had not yet retained a three-depth computed-style trace or an observable download effect |
| 2026-08-28 | Review-2 AI evidence repair | `node --test tests/ai-workflow.test.js` | 17/17 passed with exact Option/Card placement, pre-existing-state, failure, retry, and late-callback oracles |
| 2026-08-28 | Review-2 browser hierarchy repair | Isolated browser origin on port 8768; computed styles plus screenshot | Depths 0/1/2 in one 230° branch had progressively lighter surfaces `rgb(214,219,245)` → `rgb(222,226,247)` → `rgb(231,234,249)` and progressively darker rail lightness 52% → 49% → 46%; other root hues remained distinct; the visible Map retained its 6 px column gap without runtime errors |
| 2026-08-28 | Review-2 export-effect repair | Browser `Export JSON` command plus `node --test tests/project-transfer.test.js` | Browser menu closed and emitted `Exported project as JSON: Welcome` with no error; 4/4 transfer tests passed, including exact Blob body/MIME, filename, anchor click/removal, object URL, and revocation effects |
| 2026-08-28 | Final complete verification | `npm test`; `node --check` on all 13 changed JavaScript modules/tests; `git diff --check` | 58/58 passed; every syntax check passed; diff check passed with line-ending conversion warnings only |

The final independent acceptance review runs read-only against the completed pinned snapshot. Its immutable manifest and result are reported in the task handoff rather than appended afterward, so the reviewed snapshot remains byte-identical to the accepted candidate.
