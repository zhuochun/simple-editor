import test from 'node:test';
import assert from 'node:assert/strict';

import { createEditorDom } from '../editorDom.js';

function runHierarchyAlignment({ selectedOffset = 100 } = {}) {
    const originalDocument = globalThis.document;
    const scrolls = new Map();
    const containers = Array.from({ length: 4 }, (_, index) => ({
        clientHeight: 1000,
        scrollTop: 0,
        getBoundingClientRect: () => ({ top: 0 }),
        scrollTo: value => scrolls.set(index, value)
    }));
    const columns = containers.map((container, index) => ({
        dataset: { columnIndex: String(index) },
        querySelector: selector => selector === '.cards-container' ? container : null
    }));
    const createElement = ({ top, height, columnIndex, group = null }) => ({
        closest(selector) {
            if (selector === '.column') return columns[columnIndex];
            if (selector === '.card-group') return group;
            return null;
        },
        getBoundingClientRect: () => ({ top, bottom: top + height, height })
    });

    const root = createElement({ top: 450, height: 100, columnIndex: 0 });
    const rootGroup = createElement({ top: 500, height: 300, columnIndex: 1 });
    const selected = createElement({ top: 500 + selectedOffset, height: 100, columnIndex: 1, group: rootGroup });
    const selectedGroup = createElement({ top: 700, height: 260, columnIndex: 2 });
    const firstChild = createElement({ top: 740, height: 100, columnIndex: 2, group: selectedGroup });
    const firstChildGroup = createElement({ top: 900, height: 80, columnIndex: 3 });
    const elements = {
        'card-root': root,
        'card-selected': selected,
        'card-first-child': firstChild,
        'group-root': rootGroup,
        'group-selected': selectedGroup,
        'group-first-child': firstChildGroup
    };

    globalThis.document = {
        getElementById: id => elements[id] || null
    };

    try {
        const dom = createEditorDom({
            columnsContainer: { children: columns },
            projectState: {
                getCard: id => ({
                    root: { id: 'root', parentId: null, columnIndex: 0 },
                    selected: { id: 'selected', parentId: 'root', columnIndex: 1 },
                    'first-child': { id: 'first-child', parentId: 'selected', columnIndex: 2 }
                })[id] || null,
                getChildCards: id => ({
                    root: [{ id: 'selected', parentId: 'root', columnIndex: 1 }],
                    selected: [{ id: 'first-child', parentId: 'selected', columnIndex: 2 }],
                    'first-child': []
                })[id] || [],
                getAncestorIds: () => ['root'],
                getDescendantIds: () => ['first-child'],
                getSiblingCards: () => [{ id: 'selected' }]
            }
        });
        dom.scrollHierarchy('selected');
        return scrolls;
    } finally {
        if (originalDocument === undefined) delete globalThis.document;
        else globalThis.document = originalDocument;
    }
}

test('Map focus aligns the selected Card, its parent group, and first-child branch', () => {
    const scrolls = runHierarchyAlignment();

    assert.deepEqual(scrolls.get(0), { top: 250, behavior: 'smooth' });
    assert.deepEqual(scrolls.get(1), { top: 300, behavior: 'smooth' });
    assert.deepEqual(scrolls.get(2), { top: 400, behavior: 'smooth' });
    assert.deepEqual(scrolls.get(3), { top: 560, behavior: 'smooth' });
});

test('Map focus shifts down to keep a long sibling group ancestor visible when feasible', () => {
    const scrolls = runHierarchyAlignment({ selectedOffset: 500 });

    assert.deepEqual(scrolls.get(0), { top: 434, behavior: 'smooth' });
    assert.deepEqual(scrolls.get(1), { top: 484, behavior: 'smooth' });
});

test('Document focus preserves the viewport and follows the caret with nearest smooth scrolling', () => {
    const originalDocument = globalThis.document;
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const focusCalls = [];
    const scrollCalls = [];
    const selections = [];
    const documentPane = {};
    const textarea = {
        value: 'Split content',
        style: {},
        closest: selector => selector === '.document-current' ? documentPane : null,
        focus: options => focusCalls.push(options),
        scrollIntoView: options => scrollCalls.push(options),
        setSelectionRange: (start, end) => selections.push([start, end])
    };
    const cardElement = {
        classList: { add() {} },
        querySelector: selector => selector === 'textarea.card-content' ? textarea : null
    };

    globalThis.document = {
        getElementById: id => id === 'card-card-1' ? cardElement : null,
        querySelectorAll: () => []
    };
    globalThis.requestAnimationFrame = callback => callback();

    try {
        const dom = createEditorDom({
            columnsContainer: { children: [] },
            projectState: {
                getAncestorIds: () => [],
                getCard: () => ({ id: 'card-1' }),
                getDescendantIds: () => [],
                getSiblingCards: () => [{ id: 'card-1' }]
            }
        });

        dom.focusCardTextarea('card-1', 'start');

        assert.deepEqual(focusCalls, [{ preventScroll: true }]);
        assert.deepEqual(selections, [[0, 0]]);
        assert.deepEqual(scrollCalls, [{ behavior: 'smooth', block: 'nearest', inline: 'nearest' }]);
    } finally {
        if (originalDocument === undefined) delete globalThis.document;
        else globalThis.document = originalDocument;
        if (originalRequestAnimationFrame === undefined) delete globalThis.requestAnimationFrame;
        else globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    }
});
