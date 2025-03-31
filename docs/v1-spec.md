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

- Users can drag cards within the column to order content.
  - When a card's order is changed, all the descendant card groups are reordered in their columns, meaning if Card A is above Card B in Column N, then the entire group of Card A's children appears above the entire group of Card B's children in Column N+1
- Users can drag cards between columns to reorganize content.
  - The new parent is the identified by the new card group or as a new root card.
  - When a card is moved up to a left column, all its descendants move up the hierachy accordingly.
  - When a card is moved down to a right column, all its descendants move down the hierachy as well, new columns would be created automatically.
- Visual drag over indicators are displayed in the hovering column to provide visual indications.

# Persistent Storage

- Card content and hierarchy are saved automatically to the browser’s localStorage, ensuring notes remain after the page is refreshed.