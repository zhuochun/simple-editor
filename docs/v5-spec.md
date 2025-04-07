# Onboarding Flow

Provide an initial onboarding project (defined in `examples/new-onboarding.json`) to guide new users.

# Enhance Project Export/Import

- Modify the project Export button to offer options: "Export Text" and "Export JSON".
  - "Export Text": Exports concatenated card content as a `.txt` file.
  - "Export JSON": Exports the project title and data structure (`{title, data}`) as a `.json` file.
  - Filenames include project title and timestamp.
- Add a project Import button near "Add Project".
  - Offers options: "Import File" (select local JSON) and "Import URL" (fetch from URL).
  - Validates the imported JSON structure (`{title, data: {columns, cards}}`).
  - Creates a new project with the imported data (assigning a new unique ID).
  - Saves and switches to the imported project.

# Detect New User and Import Onboarding Project

- On application start, check if `localStorage` key `onboardingComplete` exists.
- If the key is missing, automatically import the default onboarding project from `examples/new-onboarding.json` using the "Import URL" mechanism.
- Set the `onboardingComplete` key in `localStorage` after the import attempt.
