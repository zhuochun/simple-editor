import assert from 'node:assert/strict';
import test from 'node:test';

import { handleCardTextareaKeydown } from '../../src/editor/cardShortcuts.js';

function createShortcutHarness({ key, ctrlKey = false, altKey = false, selectionStart = 0, value = 'AlphaBeta' }) {
    const cardElement = { dataset: { cardId: 'card-1' } };
    const textarea = {
        dataset: {},
        selectionEnd: selectionStart,
        selectionStart,
        value,
        closest: selector => selector === '.card' ? cardElement : null,
        matches: selector => selector === 'textarea.card-content'
    };
    const event = {
        altKey,
        ctrlKey,
        key,
        metaKey: false,
        target: textarea,
        preventDefault() {}
    };
    return { event, textarea };
}

test('split suppresses the stale blur save before running the command', () => {
    const { event, textarea } = createShortcutHarness({
        key: 'Enter',
        ctrlKey: true,
        selectionStart: 5
    });
    let commandObservedSuppression = false;

    handleCardTextareaKeydown(event, {
        splitCard() {
            commandObservedSuppression = textarea.dataset.skipBlurSave === 'true';
            return { success: true, newCardId: 'card-2' };
        },
        focusCardTextarea() {}
    });

    assert.equal(commandObservedSuppression, true);
});

test('Document mode Alt+Enter has no structural effect', () => {
    const { event, textarea } = createShortcutHarness({
        key: 'Enter',
        altKey: true,
        selectionStart: 5
    });
    let splitCalls = 0;

    handleCardTextareaKeydown(event, {
        getMode: () => 'document',
        splitCard() {
            splitCalls += 1;
            return { success: true };
        }
    });

    assert.equal(splitCalls, 0);
    assert.equal(textarea.dataset.skipBlurSave, undefined);
});

test('Document mode sibling navigation never falls through to unrelated column cards', () => {
    const { event } = createShortcutHarness({
        key: 'ArrowDown',
        altKey: true,
        selectionStart: 9
    });
    const focused = [];

    handleCardTextareaKeydown(event, {
        getMode: () => 'document',
        getCard: () => ({ id: 'card-1', parentId: 'parent', columnIndex: 1 }),
        getSiblingCards: () => [{ id: 'card-1' }, { id: 'card-2' }],
        getChildCards: () => { throw new Error('Document navigation must not query child fallback.'); },
        getColumnCards: () => { throw new Error('Document navigation must not query column fallback.'); },
        focusCardTextarea: (...args) => focused.push(args)
    });

    assert.deepEqual(focused, [['card-2', 'preserve']]);
});

test('Document hierarchy navigation opens a new owner document', () => {
    const parentHarness = createShortcutHarness({ key: 'ArrowLeft', altKey: true });
    const childHarness = createShortcutHarness({ key: 'ArrowRight', altKey: true });
    const opened = [];
    const helpers = {
        getMode: () => 'document',
        getCard: () => ({ id: 'card-1', parentId: 'parent', columnIndex: 1 }),
        getChildCards: () => [{ id: 'child' }],
        openDocument: (...args) => opened.push(args),
        focusCardTextarea() {}
    };

    handleCardTextareaKeydown(parentHarness.event, helpers);
    handleCardTextareaKeydown(childHarness.event, helpers);

    assert.deepEqual(opened, [['parent', 'end'], ['child', 'start']]);
});

test('failed structural shortcut restores ordinary blur persistence', () => {
    const { event, textarea } = createShortcutHarness({
        key: 'Enter',
        ctrlKey: true,
        selectionStart: 5
    });

    handleCardTextareaKeydown(event, {
        splitCard: () => ({ success: false }),
        focusCardTextarea() {}
    });

    assert.equal(textarea.dataset.skipBlurSave, undefined);
});
