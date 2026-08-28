import test from 'node:test';
import assert from 'node:assert/strict';

import {
    createEditorView,
    getAdjacentOptionId,
    getCardDisplayName,
    getGroupPresentation,
    getHierarchyDepth,
    getHistorySelection
} from '../editorView.js';

function createFakeElement() {
    const listeners = new Map();
    const queryResults = new Map();
    const children = [];
    return {
        nodeType: 1,
        children,
        classList: { add() {}, remove() {}, toggle() {} },
        dataset: {},
        style: { setProperty() {} },
        addEventListener(type, listener) {
            listeners.set(type, listener);
        },
        appendChild(child) {
            children.push(child);
        },
        append(...items) {
            children.push(...items);
        },
        setAttribute(name, value) {
            this[name] = String(value);
        },
        removeAttribute(name) {
            delete this[name];
        },
        contains() {
            return false;
        },
        focus() {},
        dispatch(type, target, event = {}) {
            listeners.get(type)?.({ target, stopPropagation() {}, ...event });
        },
        querySelector(selector) {
            if (!queryResults.has(selector)) queryResults.set(selector, createFakeElement());
            return queryResults.get(selector);
        },
        querySelectorAll() {
            return [];
        }
    };
}

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

test('only the explicit Map Card control enters the Document-opening path', () => {
    const originalDocument = globalThis.document;
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const focused = [];
    const card = { id: 'card-1', name: null, content: 'Current', parentId: 'parent', columnIndex: 1, order: 0 };
    const sibling = { id: 'card-2', name: null, content: 'Sibling', parentId: 'parent', columnIndex: 1, order: 1 };
    const parent = { id: 'parent', parentId: null };
    const group = createFakeElement();
    const columnsContainer = createFakeElement();
    const animationFrames = [];
    const flushAnimationFrames = () => {
        while (animationFrames.length > 0) animationFrames.shift()();
    };
    const optionCalls = [];
    const optionsByCard = {
        [card.id]: [{ id: 'owner-option', cardId: card.id, source: 'Manual', createdAt: 2, snapshot: { cards: [{ id: card.id, name: null, content: 'Owner', order: 0 }] } }],
        [sibling.id]: [
            { id: 'sibling-new', cardId: sibling.id, source: 'Manual', createdAt: 3, snapshot: { cards: [{ id: sibling.id, name: null, content: 'New sibling', order: 1 }] } },
            { id: 'sibling-old', cardId: sibling.id, source: 'Manual', createdAt: 1, snapshot: { cards: [{ id: sibling.id, name: null, content: 'Old sibling', order: 1 }] } }
        ]
    };

    globalThis.document = {
        body: createFakeElement(),
        createElement: () => createFakeElement()
    };
    globalThis.requestAnimationFrame = callback => animationFrames.push(callback);

    try {
        const view = createEditorView({
            columnsContainer,
            projectListContainer: createFakeElement(),
            addProjectButton: createFakeElement(),
            model: {
                getActiveProjectData: () => null,
                getCard(id) {
                    if (id === parent.id) return parent;
                    if (id === card.id) return card;
                    return id === sibling.id ? sibling : null;
                },
                getColorForCard: () => 'hsl(200, 60%, 90%)',
                getOptionsForCard(id) {
                    optionCalls.push(id);
                    return optionsByCard[id] || [];
                },
                getOptionUseAvailability: () => ({ available: true }),
                getSiblingCards: () => [card, sibling],
                minColumns: 3
            },
            actions: {
                addChildCard() {},
                aiBreakdown() {},
                aiContinue() {},
                aiCustom() {},
                aiExpand() {},
                aiSummarize() {},
                deleteCard() {}
            },
            dom: {
                autoResizeTextarea() {},
                focusCardTextarea: (...args) => focused.push(args),
                getCardElement: () => null,
                getColumnElementByIndex: () => null,
                getGroupElement: id => id === parent.id ? group : null,
                highlightHierarchy() {},
                scrollHierarchy() {}
            },
            isAiReady: () => false
        });
        const cardElement = view.insertCard(card, { parentId: parent.id, insertBeforeCardId: null });
        flushAnimationFrames();
        focused.length = 0;

        cardElement.dispatch('click', { closest: () => null });

        assert.equal(view.getMode(), 'map');
        assert.deepEqual(focused, []);

        cardElement.querySelector('.open-document-btn').dispatch('click', { closest: () => null });

        assert.equal(view.getMode(), 'document');
        assert.match(columnsContainer.innerHTML, /class="document-view"/);
        flushAnimationFrames();
        assert.deepEqual(focused, [[card.id, 'start']]);

        const documentPane = columnsContainer.querySelector('.document-current');
        documentPane.scrollTop = 240;
        view.renderDocument();
        columnsContainer.querySelector('.document-current').scrollTop = 0;
        flushAnimationFrames();
        assert.equal(columnsContainer.querySelector('.document-current').scrollTop, 240);

        const documentWorkspace = columnsContainer.querySelector('.document-workspace');
        documentPane.scrollTop = 0;
        documentWorkspace.scrollTop = 360;
        view.renderDocument();
        columnsContainer.querySelector('.document-workspace').scrollTop = 0;
        flushAnimationFrames();
        assert.equal(columnsContainer.querySelector('.document-workspace').scrollTop, 360);

        const documentCards = columnsContainer.querySelector('.document-cards').children;
        const siblingTextarea = documentCards[1].querySelector('.card-content');
        siblingTextarea.dispatch('focus', { closest: selector => selector === '.card' ? documentCards[1] : null });
        optionCalls.length = 0;
        columnsContainer.querySelector('.document-history').dispatch('keydown', null, {
            key: 'ArrowRight',
            preventDefault() {}
        });

        assert.deepEqual(optionCalls, [sibling.id, sibling.id]);
    } finally {
        if (originalDocument === undefined) delete globalThis.document;
        else globalThis.document = originalDocument;
        if (originalRequestAnimationFrame === undefined) delete globalThis.requestAnimationFrame;
        else globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    }
});

test('Card names and content are assigned as literal text instead of HTML', () => {
    const originalDocument = globalThis.document;
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const malicious = '<img src=x onerror="globalThis.compromised=true">';
    const card = {
        id: 'card-safe',
        name: malicious,
        content: `<script>globalThis.compromised=true</script>`,
        parentId: 'parent',
        columnIndex: 1,
        order: 0
    };
    const target = createFakeElement();
    let renderedCard;
    globalThis.document = {
        body: createFakeElement(),
        createElement: () => createFakeElement()
    };
    globalThis.requestAnimationFrame = callback => callback();

    try {
        const view = createEditorView({
            columnsContainer: createFakeElement(),
            projectListContainer: createFakeElement(),
            addProjectButton: createFakeElement(),
            model: {
                getCard: id => id === card.id ? card : (id === 'parent' ? { id: 'parent', columnIndex: 0 } : null),
                getColorForCard: () => 'white'
            },
            actions: {
                addChildCard() {},
                aiBreakdown() {},
                aiContinue() {},
                aiCustom() {},
                aiExpand() {},
                aiSummarize() {},
                deleteCard() {},
                updateCardContent() {}
            },
            dom: {
                autoResizeTextarea() {},
                clearHighlights() {},
                focusCardTextarea() {},
                getCardElement: () => renderedCard,
                getColumnElementByIndex: () => null,
                getGroupElement: id => id === 'parent' ? target : null,
                highlightHierarchy() {},
                scrollHierarchy() {},
                scrollIntoViewIfNeeded() {}
            },
            isAiReady: () => true
        });

        renderedCard = view.insertCard(card, { parentId: 'parent', insertBeforeCardId: null });
        assert.equal(renderedCard.querySelector('.card-name-display').textContent, malicious);
        assert.equal(renderedCard.querySelector('.card-content').value, card.content);
        assert.doesNotMatch(renderedCard.innerHTML, /onerror|<script>/i);
    } finally {
        if (originalDocument === undefined) delete globalThis.document;
        else globalThis.document = originalDocument;
        if (originalRequestAnimationFrame === undefined) delete globalThis.requestAnimationFrame;
        else globalThis.requestAnimationFrame = originalRequestAnimationFrame;
        delete globalThis.compromised;
    }
});

test('AI interaction lock covers project import and Document-to-Map navigation', () => {
    const originalDocument = globalThis.document;
    const createLockable = () => {
        const classes = new Set();
        return {
            tagName: 'BUTTON',
            disabled: false,
            classList: {
                add: value => classes.add(value),
                remove: value => classes.delete(value),
                contains: value => classes.has(value),
                toggle(value, force) {
                    if (force) classes.add(value);
                    else classes.delete(value);
                }
            }
        };
    };
    const backToMap = createLockable();
    const importProject = createLockable();
    const addProject = createLockable();
    const lockedElements = [backToMap, importProject, addProject];
    const body = { classList: { toggle() {} } };
    globalThis.document = {
        body,
        querySelectorAll: selector => selector === '.disabled-by-ai' ? lockedElements : []
    };

    try {
        const view = createEditorView({
            columnsContainer: {
                querySelectorAll: selector => selector.includes('.back-to-map-btn') ? [backToMap] : []
            },
            projectListContainer: { querySelectorAll: () => [] },
            addProjectButton: addProject,
            importProjectButton: importProject,
            model: {},
            actions: {},
            dom: {},
            isAiReady: () => true
        });

        view.setInteractionLocked(true);
        assert.equal(backToMap.disabled, true);
        assert.equal(importProject.disabled, true);
        assert.equal(addProject.disabled, true);

        view.setInteractionLocked(false);
        assert.equal(backToMap.disabled, false);
        assert.equal(importProject.disabled, false);
        assert.equal(addProject.disabled, false);
    } finally {
        if (originalDocument === undefined) delete globalThis.document;
        else globalThis.document = originalDocument;
    }
});
