# Architecture

Status: Current

This document is the current authority for code ownership and dependency direction in Simple Editor. The decision history for the modular split is preserved in [V7: Editor Module Boundaries](projects/v7-editor-module-boundaries.md).

## Runtime

Simple Editor is a browser-only application built with native HTML, CSS, and ES modules. It has no framework, build step, application server, or remote persistence service. Browser `localStorage` is the persistence boundary.

## Composition and dependency direction

`script.js` starts the application. `editorController.js` composes state, view, transfer, interaction adapters, and AI workflow. Feature modules receive explicit commands or capabilities from the controller rather than reaching through controller closure state.

The intended direction is:

```text
script
  -> editor controller
       -> project state -> project format
       -> project transfer
       -> editor view -> editor DOM mechanics
       -> interaction adapters
       -> AI workflow -> AI service
```

## Module ownership

- `projectState.js` owns projects, active selection, hierarchy and ordering invariants, timestamps, colors, and persistence. Public mutations save their own completed result.
- `projectFormat.js` owns versioned parsing, legacy compatibility, normalization, validation, JSON envelopes, and plain-text traversal.
- `projectTransfer.js` owns browser import and export effects. Imported input reaches project state only after format validation succeeds.
- `editorView.js` owns card, group, column, toolbar, project-list, and AI-related DOM presentation. It receives read-only project queries and emits intent through injected actions.
- `editorDom.js` owns reusable DOM mechanics: lookup, focus, textarea sizing, hierarchy scrolling and highlighting, and modal construction. It does not own presentation policy.
- `aiWorkflow.js` owns AI action selection, result placement, placeholder lifecycle, streaming transitions, multipart results, and busy-state policy. It uses a narrow view interface and does not query or mutate DOM directly.
- `aiService.js` owns AI settings, prompt construction, project-context consumption, and OpenAI-compatible streaming transport.
- `cardShortcuts.js` and `dragDrop.js` translate browser gestures into complete project commands. They own gesture state, not project mutations or persistence.
- `editorController.js` is the composition root and command mapper. It does not construct cards or columns or own AI streaming callbacks.

## Stable boundaries

- Persisted project shape and existing `localStorage` keys remain compatible unless an explicit migration is accepted.
- Existing unversioned project exports remain importable.
- Project mutations and persistence have one owner: `projectState.js`.
- Presentation policy has one owner: `editorView.js`.
- Format compatibility has one owner: `projectFormat.js`.
- AI transport does not decide card placement; AI workflow does not construct provider requests.

## When to revisit

Reopen these boundaries when repeated changes require knowledge to cross them, a new runtime or persistence owner is introduced, a stored project violates the accepted hierarchy contract, or preserving behavior would require duplicate state or presentation authority. Do not split modules solely because they grow in line count.
