# Projects Management

The initial specification was built for one group of cards, or known as a project. In this specification, we are adding multiple projects support.

## Left Sidebar

- Add a left sidebar to the app.
  - The sidebar is resizable, with a minimum width.
  - The existing structure and columns are pushed to the right as the main section.
- Top of the sidebar has a "Add Project" button to create a project.
  - Open a dialog and ask for a title first.
  - Each project is assigned with a project ID, similar to card ID.
- The rest of the sidebar lists all the projects by their titles.
  - List is vertically scrollable.
  - Projects are sorted by last modified time (last modified time of card updates in the project).

## Project

- Project contains a title, the list of cards and their hierarchies.
  - Title is editable when double clicked on the title. Confirmed when pressing Enter or clicking  outside the title field (blur), and cancelled when pressing Escape.
  - Title cannot be empty, allow duplicated titles.
  - New projects start with the default 3 empty columns.
  - After creating a project, it is automatically selected and loaded into the main view.
- Each project item has two buttons to the right of the title: Export and Delete.
    - Export project: will concatenate all the text area of cards in a plain text.
      - No special representation of the hierarchy.
      - Concatenate in the depth-first traversal order: left to right by parent-descendants, and top to down in root cards. E.g. Expected order: RootA text -> ChildA1 text -> GrandchildA1a text -> ChildA2 text -> RootB text -> ChildB1 text.
      - Ignore empty content cards.
      - Deliver in a downloadable file with the date-time as filename, e.g. ProjectExport_YYYY-MM-DDTHHmmssZ.txt or similar.
    - Delete project: will delete the project with a confirmation.
      - If the current active project is deleted, switch to the last modified project.
      - If it was the last project, create a default "Untitled" project and switch to it.
- Click on a project item will switch the main section to display the cards from that project.
  - Save the active project first before switching.
  - Currently selected/active project visually indicated in the sidebar list, background color change, bold text.
- Users cannot drag cards between projects.

## The app first loads

- Load projects from localStorage and select the last modified project.
- If the localStorage is empty, create a default "Untitled" project, the default project is selected and displayed.