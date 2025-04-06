Create an interactive writing tool using HTML, CSS, and JavaScript.

The tool contains an interface with multiple columns of nested, editable cards.

# Structure and Columns

- Minimum and default contains 3 columns.
- Each columns are vertically scrollable, if the cards exceed viewpoints.
- Every column has a sticky toolbar on the top, contains: Add Card, Add Column, Delete Column.
  - Add card: only displayed in the first column, add a new card in the column at the bottom, same as double click on the empty spaces below the cards in the column
  - Add column: only displayed in the right-most column, add a new column to the right of it.
  - Delete column: only displayed in the right-most column, and when the num of columns are more than 3, and there are no cards in that column.

# Editable Cards

- Each column contains cards with a heading and an editable text area.
- Cards are draggable, deletable, and can add child cards.
- The heading displays the card Name if exists, or card ID (last 4 chars) on the left.
  - ID is generated with by timestmap + random string.
  - Name is optional, truncated to first 50 chars (no-wrap).
  - User can double click on the left area to edit name. When pressed Enter or Blur, the edit is accepted. When pressed Escape, the edit is cancelled.
- The heading contains symbol buttons to delete this card, or add a child card on the right
  - Skip delete confirmation if card is empty AND has no descendants
- The heading area is also the handle for dragging
- Editable text area allowing users to type notes, text and format are saved when the text area lost user focus.

# Card Groups

- Every card has a child card group in the next column, as a visual placeholder.
- Each child group displays the parent's card ID on the top left, for quick references.
- Added child cards are placed in the corresponding card groups.
- Double clicking in a card group creates a child card in it.

# Nested Organization

- The first column contains the root cards.
  - When a root card is created, it is assigned with a light background color automatically
  - Every child card created deepen the color by a small percentage of the previous column.
- Click on "add a child card" on a card, add a child card in the next column, creating a clear hierarchical structure.
- When a card is in editing, all its parent cards, child cards and descendants are highlighted with a stronger background color.
- Delete a card will remove all its children cards. a confirmation prompt is asked.

# Drag-and-Drop Reordering

- Users can drag cards by their header area (excluding header buttons) to reorder or reparent them.
- **Visual Feedback:**
  - The dragged card gets a `dragging` style.
  - An insertion indicator line appears between elements (cards, groups) or in empty valid drop zones to show where the card will be placed if dropped.
  - Hovering over a potential drop area (another card's group, empty column space) highlights that area (`drag-over-group`, `drag-over-empty`).
  - Hovering directly over another card highlights that card (`drag-over-parent`) to indicate dropping *onto* it to make the dragged card a child. The insertion indicator is hidden in this case.
- **Drop Actions:**
  - **Reordering/Moving (using indicator):** Dropping when the insertion indicator is visible places the card at the indicator's position.
    - Within the same column: Changes the card's order relative to its siblings. Descendant groups in the next column reorder accordingly.
    - Into a card group in the next column: Makes the card a child of that group's parent, ordered according to the indicator's position within the group. Descendants move down the hierarchy.
    - Into empty space in the first column: Makes the card a root card, ordered according to the indicator's position. Descendants move up/down the hierarchy accordingly.
  - **Reparenting (dropping onto a card):** Dropping directly onto another card (when highlighted as `drag-over-parent`) makes the dragged card the *last child* of the target card. The dragged card and its descendants move to the column immediately following the new parent.
- **Constraints:**
  - Cannot drop a card onto itself.
  - Cannot drop a card into the group belonging to its own descendants.
  - Non-root cards cannot be dropped into the empty space of any column other than the first (they must have a parent or be placed relative to other cards/groups).
  - Root cards can only be dropped into the empty space of the first column.
- **Data Handling:** The underlying `moveCardData` function is responsible for updating the card's order, parent, column index, and managing descendant hierarchy changes based on the drop action. The UI then re-renders based on the updated data. (The data layer might implicitly require new columns if descendants are moved further right, which the UI would then render).

# Persistent Storage

- Card content and hierarchy are saved automatically to the browser’s localStorage, ensuring notes remain after the page is refreshed.
