import test from 'node:test';
import assert from 'node:assert/strict';

import { createAiWorkflow, getAiActionPlan } from '../aiWorkflow.js';

const sourceCard = {
    id: 'card-b',
    columnIndex: 2,
    parentId: 'parent-1',
    content: 'Source'
};
const siblings = [{ id: 'card-a' }, sourceCard, { id: 'card-c' }];

test('sequential AI actions place their result after the source sibling', () => {
    const summary = getAiActionPlan('summarize', sourceCard, siblings);
    const continuation = getAiActionPlan('continue', sourceCard, siblings);

    assert.deepEqual(summary, {
        method: 'generateSummary',
        targetColumnIndex: 2,
        parentIdForNewCards: 'parent-1',
        insertBeforeId: 'card-c',
        requiresContentCheck: true,
        useMultiPartResponseHandler: false
    });
    assert.equal(continuation.method, 'generateContinuation');
    assert.equal(continuation.insertBeforeId, 'card-c');
    assert.equal(continuation.requiresContentCheck, false);
});

test('hierarchical AI actions place results as children in the next column', () => {
    const breakdown = getAiActionPlan('breakdown', sourceCard);
    const expand = getAiActionPlan('expand', sourceCard);
    const custom = getAiActionPlan('custom', sourceCard);

    for (const plan of [breakdown, expand, custom]) {
        assert.equal(plan.targetColumnIndex, 3);
        assert.equal(plan.parentIdForNewCards, 'card-b');
        assert.equal(plan.insertBeforeId, null);
    }
    assert.equal(breakdown.useMultiPartResponseHandler, true);
    assert.equal(expand.useMultiPartResponseHandler, false);
    assert.equal(custom.method, 'generateCustom');
});

test('unknown AI actions do not produce an executable plan', () => {
    assert.equal(getAiActionPlan('unknown', sourceCard), null);
});

test('AI workflow owns placeholder completion and releases its busy lifecycle without a remote call', () => {
    const updates = [];
    const lockedStates = [];
    const display = { content: 'AI is thinking...', loading: true };
    let serviceArguments;

    const workflow = createAiWorkflow({
        projectState: {
            getCard: id => id === 'source' ? { id, columnIndex: 0, parentId: null, content: 'Source' } : { id },
            getSiblingCards: () => [{ id: 'source' }],
            getCardContextData: () => ({ card: { id: 'source' } }),
            updateCardContentData: (id, content) => { updates.push({ id, content }); return true; }
        },
        aiService: {
            areAiSettingsValid: () => true,
            generateContinuation: args => { serviceArguments = args; }
        },
        addCard: () => 'placeholder',
        deleteCard: () => {},
        view: {
            setInteractionLocked: locked => lockedStates.push(locked),
            createCardStream: () => ({
                append: delta => { display.content += delta; },
                replace: content => { display.content = content; },
                finish: () => { display.loading = false; }
            }),
            updateGroupHeaderDisplay: () => {},
            focusCard: () => {},
            showCustomAiPrompt: () => {},
            updateAiFeatureVisibility: () => {}
        }
    });

    workflow.continue('source');
    assert.equal(workflow.isBusy(), true);
    assert.equal(typeof serviceArguments.onDone, 'function');

    serviceArguments.onDone('Generated result');
    assert.equal(workflow.isBusy(), false);
    assert.deepEqual(updates, [{ id: 'placeholder', content: 'Generated result' }]);
    assert.equal(display.loading, false);
    assert.deepEqual(lockedStates, [true, false]);
});
