# Architecture

Status: Current

This document is the current authority for code ownership and dependency direction in Simple Editor. The decision history for the modular split is preserved in [Editor Module Boundaries](projects/20260823-editor-module-boundaries.md).

## Runtime

Simple Editor is a browser-only application built with native HTML, CSS, and ES modules. It has no framework, build step, application server, or remote persistence service. Browser `localStorage` is the persistence boundary.

## Composition and dependency direction

`src/app/main.js` starts the application. `src/app/editorController.js` composes state, view, transfer, interaction adapters, and AI workflow. Feature modules receive explicit commands or capabilities from the controller rather than reaching through controller closure state.

The intended direction is:

```text
main
  -> editor controller
       -> project state -> project format
       -> project transfer
       -> editor view -> editor DOM mechanics
       -> interaction adapters
       -> AI workflow -> AI service
```

## Repository layout

- `src/app/` contains the browser entry point and composition root.
- `src/project/` contains project state, format compatibility, and browser transfer effects.
- `src/editor/` contains presentation, reusable DOM mechanics, and interaction adapters.
- `src/ai/` contains AI workflow policy and provider transport.
- `styles/` and `assets/` contain browser-served static resources.
- `tests/` mirrors the source ownership areas; `tests/browser/` contains real-browser smoke coverage.
- `scripts/` contains cross-platform verification entry points.

## Module ownership

- `src/project/projectState.js` owns projects, active selection, hierarchy and ordering invariants, card-owned Option lifecycle, atomic Option use, timestamps, colors, and persistence. Public mutations save their own completed result.
- `src/project/projectFormat.js` owns versioned parsing, legacy compatibility, Card and Option normalization/validation, JSON envelopes, and Current-only plain-text traversal.
- `src/project/projectTransfer.js` owns browser import and export effects. Imported input reaches project state only after format validation succeeds.
- `src/editor/editorView.js` owns Map and Document presentation, Current/History layout, Option browsing controls, card/group/column/toolbars, project list, the AI settings form, job/result status, and safe text-only rendering. It receives read-only project queries and emits intent through injected actions.
- `src/editor/editorDom.js` owns reusable DOM mechanics: lookup, focus, textarea sizing, hierarchy scrolling and highlighting, and accessible modal construction. It does not own presentation policy.
- `src/ai/aiWorkflow.js` owns mode-sensitive AI action selection, Option-or-Card result placement, placeholder lifecycle, cancel/retry/busy transitions, multipart results, and result discovery. It uses a narrow view interface and has no deletion capability.
- `src/ai/aiService.js` owns compatible AI-settings normalization and persistence, prompt construction, project-context consumption, OpenAI Responses and Chat Completions request construction, streaming protocol parsing, cancellation, and timeout. It owns no DOM.
- `src/editor/cardShortcuts.js` and `src/editor/dragDrop.js` translate browser gestures into complete project commands. They own gesture state, not project mutations or persistence.
- `src/app/editorController.js` is the composition root and command mapper. It does not construct cards or columns or own AI streaming callbacks.

## Stable boundaries

- Persisted project shape and existing `localStorage` keys remain compatible unless an explicit migration is accepted.
- Existing unversioned project exports remain importable.
- Project mutations and persistence have one owner: `src/project/projectState.js`.
- Presentation policy has one owner: `src/editor/editorView.js`.
- Format compatibility has one owner: `src/project/projectFormat.js`.
- AI transport does not decide card placement; AI workflow does not construct provider requests.
- AI settings presentation does not construct or parse provider requests; the service does not query or mutate the DOM.
- Document presentation cannot move or reparent Cards. Shortcut and controller commands pass complete sibling-scoped mutations to project state.

## When to revisit

Reopen these boundaries when repeated changes require knowledge to cross them, a new runtime or persistence owner is introduced, a stored project violates the accepted hierarchy contract, or preserving behavior would require duplicate state or presentation authority. Do not split modules solely because they grow in line count.
