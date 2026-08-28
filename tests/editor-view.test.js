import test from 'node:test';
import assert from 'node:assert/strict';

import {
    createEditorView,
    getAdjacentOptionId,
    getCardDisplayName,
    getGroupPresentation,
    getHierarchyDepth,
    getHistorySelection,
    shouldOpenDocumentFromCardClick
} from '../editorView.js';

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

test('history selection is stable and browsing clamps at both boundaries', () => {
    const options = [{ id: 'newest' }, { id: 'middle' }, { id: 'oldest' }];

    assert.equal(getHistorySelection(options, null).id, 'newest');
    assert.equal(getHistorySelection(options, 'middle').id, 'middle');
    assert.equal(getHistorySelection(options, 'missing').id, 'newest');
    assert.equal(getAdjacentOptionId(options, 'newest', 'newer'), 'newest');
    assert.equal(getAdjacentOptionId(options, 'newest', 'older'), 'middle');
    assert.equal(getAdjacentOptionId(options, 'oldest', 'older'), 'oldest');
    assert.equal(getAdjacentOptionId([], null, 'older'), null);
});

test('hierarchy depth follows parent identity and stops safely at a cycle', () => {
    const cards = {
        root: { id: 'root', parentId: null },
        child: { id: 'child', parentId: 'root' },
        grandchild: { id: 'grandchild', parentId: 'child' },
        cycleA: { id: 'cycleA', parentId: 'cycleB' },
        cycleB: { id: 'cycleB', parentId: 'cycleA' }
    };
    const getCard = id => cards[id] || null;

    assert.equal(getHierarchyDepth(cards.root, getCard), 0);
    assert.equal(getHierarchyDepth(cards.grandchild, getCard), 2);
    assert.equal(getHierarchyDepth(cards.cycleA, getCard), 2);
});

test('Map Card clicks open Document mode while action controls do not', () => {
    const cardTarget = { closest: () => null };
    const buttonTarget = { closest: selector => selector === 'button, input' ? {} : null };

    assert.equal(shouldOpenDocumentFromCardClick(false, cardTarget), true);
    assert.equal(shouldOpenDocumentFromCardClick(false, buttonTarget), false);
    assert.equal(shouldOpenDocumentFromCardClick(true, cardTarget), false);
});
