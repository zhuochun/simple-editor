# Editor Module Boundary Design

Status: Implemented

## Decision

Reshape the browser application incrementally around deep project-state and project-format boundaries. Retain the current drag/drop module and browser-only runtime. Do not introduce a framework, build system, server, or replacement data model.

## Pressure and horizon

- Project mutations, timestamps, persistence, and rendering are currently coordinated by callers.
- Project import/export rules are distributed between UI and state code.
- AI prompt construction reaches directly into project state while AI result lifecycle remains in the main controller.
- Drag and touch changes have remained local to `dragDrop.js`, so that boundary is retained.
- The design assumes continued feature maintenance. If the editor becomes feature-complete, further splitting should stop.

## Ownership boundaries

### Project state

Owns projects, active-project selection, hierarchy invariants, ordering, derived colors, timestamps, and persistence. Callers request complete mutations and receive results describing affected cards or columns. Callers do not read the projects dictionary or remember separate save steps.

### Project format

Owns deterministic JSON parsing, version compatibility, normalization, structural validation, JSON export envelopes, and plain-text traversal. Invalid input has no state effects.

### Editor view and controller

Own DOM creation, rendering, focus, modal presentation, event wiring, and mapping mutation results to UI updates. It does not own project representation or compatibility rules.

### Interaction adapters

`dragDrop.js` and `cardShortcuts.js` translate browser gestures into project commands. They own gesture state and navigation interpretation, not multi-step project mutations or persistence.

### AI service

Owns settings, prompt construction, and the OpenAI-compatible streaming request. It receives an explicit project-context snapshot and does not import project state. The controller owns placement, placeholder presentation, and the visible streaming lifecycle.

## Implemented module map

- `script.js` is the browser bootstrap and has no application decisions.
- `editorController.js` composes the editor, maps user actions to project commands, and owns AI placement and visible streaming lifecycle.
- `editorDom.js` owns DOM lookup, focus, hierarchy scrolling and highlighting, group-header presentation, textarea sizing, and modal lifecycle.
- `projectState.js` is the sole project-state, hierarchy, ordering, timestamp, and persistence authority.
- `projectFormat.js` owns versioned parsing, validation, normalization, and export serialization.
- `projectTransfer.js` owns browser import/export effects and invokes project creation only after format validation succeeds.
- `cardShortcuts.js` and `dragDrop.js` remain interaction adapters that call complete project commands.
- `aiService.js` owns AI settings, prompt construction, and streaming transport using explicit context snapshots.

The former `data.js` and monolithic `script.js` ownership paths have been retired rather than retained as compatibility wrappers.

## Interface direction

- Project queries expose projects and active selection without exporting mutable module state.
- Composite split and merge operations are atomic project commands.
- Project mutations persist under the state owner's control.
- Import produces a normalized value before the state owner creates a project.
- AI generation receives an explicit context object.

## Preserved commitments

- Existing `localStorage` keys and stored project representation remain supported.
- Existing hierarchy, ordering, drag, keyboard, AI placement, and onboarding behavior remain supported except for the explicitly accepted import validation additions.
- Existing unversioned exports remain importable.

## Adoption and stop conditions

Adopt in executable vertical slices: project-format compatibility, state access and transaction ownership, keyboard composite commands, then AI context decoupling. Each slice must leave one authoritative path and pass repository tests plus browser smoke checks.

Stop and reopen the design if an existing stored project violates the accepted hierarchy contract, a browser consumer depends on exported raw state, or preserving gesture and AI behavior requires duplicate state ownership.

Reconsider further modules only when subsequent change history shows another repeated cross-boundary pressure.

## Completion evidence

- State-command tests cover persistence, split, merge, and AI context snapshots.
- Format and transfer tests cover legacy normalization, unsupported versions, structural rejection, export envelopes, depth-first text output, and atomic project creation/selection.
- Browser regression checks cover module loading, rendering, persistence, keyboard operations, project transfer UI, and placement tooltips.
