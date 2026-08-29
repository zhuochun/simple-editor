# Repository Working Contract

Before changing Simple Editor, read the current [domain](docs/domain.md), [data schema](docs/data-schema.md), [architecture](docs/architecture.md), and [testing](docs/testing.md) documents. Files under `docs/projects/` are historical context and are not current authority.

## Change rules

- Preserve the browser-only, native ES-module runtime unless a separate architecture change is accepted.
- Preserve existing `localStorage` keys, stored project representation, and unversioned import compatibility unless a migration is explicitly specified.
- Route complete project mutations through `src/project/projectState.js`; callers must not remember separate save steps.
- Route parsing, normalization, validation, and export-envelope changes through `src/project/projectFormat.js`.
- Keep DOM presentation in `src/editor/editorView.js`; keep reusable DOM mechanics in `src/editor/editorDom.js`.
- Keep AI placement and lifecycle policy in `src/ai/aiWorkflow.js` and provider request construction in `src/ai/aiService.js`.
- Do not use a remote AI provider in routine automated tests or commit credentials.

## Local development server

- From the repository root, run `npm install` once and then `npm run dev`; open the address it prints in the browser.

## Required checks

- Run the narrow affected tests while editing and `npm run verify` before handoff.
- Run `git diff --check`; `npm run verify` owns JavaScript syntax checks.
- Perform a focused browser smoke check for DOM, pointer, touch, modal, import/export, or startup changes.
- Update the current authority document when domain meaning, stored data, module ownership, or verification obligations change.
