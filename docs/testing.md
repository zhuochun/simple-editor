# Testing

Status: Current

This document describes the reproducible checks for Simple Editor. Historical project specifications are not test authorities; current behavior is defined by [Domain](domain.md), with executable evidence under `tests/`.

## Automated non-provider suite

Run:

```powershell
npm test
```

The Node test suite does not contact an AI provider. It covers:

- Project-format normalization, version-1/version-2 compatibility, Option validation, export envelopes, and Current-only text traversal.
- Project-state persistence, split, merge, hierarchy behavior, card-owned Option lifecycle, scope-safe restore, rollback, and AI context snapshots.
- Atomic project import and selection effects.
- Map and Document keyboard scope, split, navigation, merge, and blur-save coordination.
- Drag command mapping and AI-busy rejection.
- Card/group hierarchy and deterministic History selection policy through the editor view interface.
- Mode-sensitive AI Option-or-Card placement, no-delete failure behavior, placeholder completion, and busy lifecycle through fake collaborators.

## Syntax check

For a broad JavaScript change, check every module:

```powershell
$files = rg --files -g '*.js'
foreach ($file in $files) {
    node --check (Resolve-Path -LiteralPath $file).Path
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
```

## Browser checks

DOM and interaction changes also need a local browser smoke check. Exercise the affected paths, normally including startup, project and card rendering, content editing, rename finalization, add/delete behavior, and absence of runtime errors.

For Document Options changes, also record:

- Current-left/History-right desktop order and narrow-width History reflow.
- Read-only preview, newer/older boundary behavior, stable owner while focus/add/split changes, and no Current mutation while browsing.
- Manual save, use-as-current, final-Option delete guard, and reload persistence.
- Absence of drag, column, child, Expand, Breakdown, and Custom-child commands in Document mode; `Alt+Enter` must have no mutation.
- Version-2 Manual/AI History import, version-1 and unversioned empty History, and invalid-Option import with no project or selection effect.

Use focused manual checks for behavior that the Node suite cannot faithfully reproduce:

- Pointer and touch drag behavior, scrolling, and hierarchy highlighting.
- Responsive sidebar and column behavior.
- Import/export dialogs and browser download effects.
- AI configuration visibility and custom-prompt modal behavior.

## Real AI provider checks

Real-provider testing is optional and separate. Never place API keys in fixtures, source files, logs, or normal automated tests. When provider behavior is relevant, verify one bounded action and distinguish transport behavior from placement and view behavior already covered by local tests.

## Before committing

Run the narrow affected tests first, then `npm test`, relevant syntax checks, and `git diff --check`. Record browser or provider checks separately because they are not reproduced by `npm test`.
