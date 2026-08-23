# Editor Module Boundary Design

Status: Accepted implementation direction

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
