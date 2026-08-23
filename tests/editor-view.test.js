import test from 'node:test';
import assert from 'node:assert/strict';

import { createEditorView, getCardDisplayName, getGroupPresentation } from '../editorView.js';

test('card presentation uses names when present and IDs as the fallback', () => {
    assert.deepEqual(getCardDisplayName({ id: 'card-123456', name: null }, 50), {
        full: '#3456',
        visible: '#3456'
    });
    assert.deepEqual(getCardDisplayName({ id: 'card-1', name: 'Long descriptive name' }, 8), {
        full: 'Long descriptive name',
        visible: 'Long des...'
    });
});

test('group presentation owns name and content preview rules', () => {
    assert.deepEqual(
        getGroupPresentation({ id: 'card-123456', name: null, content: '  Preview content beyond limit  ' }, 50, 7),
        {
            text: '>> #3456: Preview...',
            title: 'Children of #3456: Preview content beyond limit'
        }
    );
    assert.deepEqual(
        getGroupPresentation({ id: 'card-1', name: 'Named parent', content: 'Ignored' }, 5, 7),
        {
            text: '>> Named...',
            title: 'Children of Named parent'
        }
    );
});

test('view updates group headers through the same presentation policy', () => {
    const parentCard = { id: 'card-123456', name: null, content: 'Updated content beyond limit' };
    const header = {};
    const view = createEditorView({
        columnsContainer: {},
        projectListContainer: {},
        addProjectButton: {},
        model: { getCard: () => parentCard },
        actions: {},
        dom: { getGroupElement: () => ({ querySelector: () => header }) },
        isAiReady: () => false,
        cardNameMaxLength: 50,
        groupHeaderPreviewLength: 7
    });

    view.updateGroupHeaderDisplay(parentCard.id);

    assert.deepEqual(header, {
        textContent: '>> #3456: Updated...',
        title: 'Children of #3456: Updated content beyond limit'
    });
});
