import assert from 'node:assert/strict';
import test from 'node:test';

import { handleCardTextareaKeydown } from '../cardShortcuts.js';

function createShortcutHarness({ key, ctrlKey = false, selectionStart = 0, value = 'AlphaBeta' }) {
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
        altKey: false,
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
