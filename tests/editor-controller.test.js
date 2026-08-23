import test from 'node:test';
import assert from 'node:assert/strict';

import { createMoveCardHandler } from '../editorController.js';

function createHarness({ busy = false, affectedColumns = [0, 1], renderedColumnCount = 3 } = {}) {
    const calls = [];
    const moveCard = (...args) => {
        calls.push(['move', ...args]);
        return { success: true, affectedColumns };
    };
    const handler = createMoveCardHandler({
        isBusy: () => busy,
        moveCard,
        getRenderedColumnCount: () => renderedColumnCount,
        renderApp: () => calls.push(['renderApp']),
        renderColumn: index => calls.push(['renderColumn', index]),
        updateToolbars: () => calls.push(['updateToolbars'])
    });
    return { calls, handler };
}

test('drag command maps a successful move to affected existing columns', () => {
    const { calls, handler } = createHarness();
    const result = handler('card-1', 1, 'parent-1', 'card-2');

    assert.equal(result.success, true);
    assert.deepEqual(calls, [
        ['move', 'card-1', 1, 'parent-1', 'card-2'],
        ['renderColumn', 0],
        ['renderColumn', 1],
        ['updateToolbars']
    ]);
});

test('drag command performs a full render when the move creates a new column', () => {
    const { calls, handler } = createHarness({ affectedColumns: [1, 3], renderedColumnCount: 3 });
    handler('card-1', 3, 'parent-1', null);

    assert.deepEqual(calls.slice(1), [['renderApp'], ['updateToolbars']]);
});

test('drag command rejects state changes while the AI workflow is busy', () => {
    const { calls, handler } = createHarness({ busy: true });

    assert.deepEqual(handler('card-1', 1, null, null), {
        success: false,
        reason: 'AI action in progress'
    });
    assert.deepEqual(calls, []);
});
