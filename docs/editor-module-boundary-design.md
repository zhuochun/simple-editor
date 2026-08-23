# Editor Module Boundary Design

Status: Implemented

## Decision

Reshape the browser application around deep project-state, project-format, editor-view, and AI-workflow boundaries. Retain the current drag/drop module and browser-only runtime. Do not introduce a framework, build system, server, or replacement data model.

## Pressure and horizon

- Project mutations, timestamps, persistence, and rendering are currently coordinated by callers.
- Project import/export rules are distributed between UI and state code.
- The first modularization pass largely relocated `script.js` into a 1,400-line `editorController.js`; this revision corrects that ownership rather than treating file relocation as completion.
- `editorDom.js` contains shared DOM mechanics, while `editorView.js` now owns card, column, group, toolbar, and project-list rendering.
- Drag and touch changes have remained local to `dragDrop.js`, so that boundary is retained.
- The design assumes continued feature maintenance. If the editor becomes feature-complete, further splitting should stop.

## Ownership boundaries

### Project state

Owns projects, active-project selection, hierarchy invariants, ordering, derived colors, timestamps, and persistence. Callers request complete mutations and receive results describing affected cards or columns. Callers do not read the projects dictionary or remember separate save steps.

### Project format

Owns deterministic JSON parsing, version compatibility, normalization, structural validation, JSON export envelopes, and plain-text traversal. Invalid input has no state effects.

### Editor view

Owns card, group, column, toolbar, and project-list DOM creation and presentation. It owns local edit lifecycles, focus, AI modal presentation, hierarchy highlighting, and rendering through injected read-only project queries. It emits user intent through callbacks and does not mutate project state, select AI policies, or know persistence and format rules.

### Editor controller

Composes state, view, transfer, interaction adapters, and AI workflow. It maps view intent to complete project commands and requests a view refresh from command results. It does not construct card or column DOM, implement edit widgets, or own AI placeholders and streaming cleanup.

### Interaction adapters

`dragDrop.js` and `cardShortcuts.js` translate browser gestures into project commands. They own gesture state and navigation interpretation, not multi-step project mutations or persistence.

### AI workflow and service

`aiWorkflow.js` owns AI action selection, target placement, placeholder cards, multipart result placement, visible streaming state, and success/error cleanup. It depends on explicit state commands, an explicit view interface, and `aiService.js`. `aiService.js` continues to own settings, prompt construction, and the OpenAI-compatible streaming request using an explicit project-context snapshot.

## Implemented module map

- `script.js` is the browser bootstrap and has no application decisions.
- `editorController.js` is the composition root and maps user intent to project commands.
- `editorView.js` owns editor and project-list rendering plus local editing lifecycles.
- `editorDom.js` owns shared focus, hierarchy scrolling and highlighting, textarea sizing, and modal mechanics used by the view and controller prompt orchestration.
- `aiWorkflow.js` owns AI placement and the visible streaming lifecycle.
- `projectState.js` is the sole project-state, hierarchy, ordering, timestamp, and persistence authority.
- `projectFormat.js` owns versioned parsing, validation, normalization, and export serialization.
- `projectTransfer.js` owns browser import/export effects and invokes project creation only after format validation succeeds.
- `cardShortcuts.js` and `dragDrop.js` remain interaction adapters that call complete project commands.
- `aiService.js` owns AI settings, prompt construction, and streaming transport using explicit context snapshots.

The former `data.js` and monolithic `script.js` ownership paths are retired. The relocated rendering and AI-workflow implementations have also been removed from `editorController.js`; these are ownership transfers, not pass-through wrappers.

## Interface direction

- Project queries expose projects and active selection without exporting mutable module state.
- Composite split and merge operations are atomic project commands.
- Project mutations persist under the state owner's control.
- Import produces a normalized value before the state owner creates a project.
- AI generation receives an explicit context object.
- The view receives read-only project queries and emits intent; it does not import `projectState.js`.
- The AI workflow receives explicit state commands and one view interface; it does not query or mutate browser DOM directly.

## Preserved commitments

- Existing `localStorage` keys and stored project representation remain supported.
- Existing hierarchy, ordering, drag, keyboard, AI placement, and onboarding behavior remain supported except for the explicitly accepted import validation additions.
- Existing unversioned exports remain importable.

## Adoption and stop conditions

Adopt in executable vertical slices: transfer rendering and edit lifecycle to the view, transfer AI placement and streaming lifecycle to the AI workflow, then reduce the controller to composition and command mapping. Each slice must leave one authoritative path and pass repository tests plus browser smoke checks.

Stop and reopen the design if an existing stored project violates the accepted hierarchy contract, a browser consumer depends on exported raw state, or preserving gesture and AI behavior requires duplicate state ownership.

This design is implemented because `editorController.js` no longer constructs card or column DOM, implements local rename/content-edit widgets, or owns AI placeholder and streaming-result behavior.

Reconsider further modules only when subsequent change history shows another repeated cross-boundary pressure.

## Completion evidence

- State-command tests cover persistence, split, merge, and AI context snapshots.
- Format and transfer tests cover legacy normalization, unsupported versions, structural rejection, export envelopes, depth-first text output, and atomic project creation/selection.
- View tests cover card and group presentation policy plus group-header updates through the public view interface; browser checks cover rendered cards, columns, edit-intent wiring, and rename finalization. `editorView.js` does not import project state.
- AI workflow tests cover sibling/child placement, placeholder completion, and busy-state cleanup through one explicit view collaborator without invoking a remote AI provider.
- Drag-command tests cover busy rejection, affected-column rendering, and moves that require a new column; browser logs confirm the drag adapter initializes against rendered draggable cards.
- The 27-test non-AI suite, syntax/static checks, and browser checks cover rendering, persistence, rename finalization, split/merge, card add/delete, project transfer UI, AI-control visibility, placement tooltips, and zero runtime errors.
- `editorController.js` is 479 lines of composition, project/card command mapping, prompt orchestration, startup, and adapter wiring; it contains no card or column DOM construction, edit-widget implementation, AI placeholder policy, or streaming callbacks.
