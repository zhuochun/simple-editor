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

function createStreamDisplay() {
    const display = { content: '', finished: false, failed: false };
    return {
        display,
        stream: {
            append: delta => { display.content += delta; },
            replace: content => { display.content = content; },
            finish: failed => {
                display.finished = true;
                display.failed = Boolean(failed);
            }
        }
    };
}

function createCardTargetHarness({ action = 'continue', customTarget = null } = {}) {
    const source = { id: 'source', columnIndex: 1, parentId: 'root', content: 'Source' };
    const existingChild = { id: 'existing-child', columnIndex: 2, parentId: 'source', content: 'Existing' };
    const cards = new Map([[source.id, source], [existingChild.id, existingChild]]);
    const childOrder = [existingChild.id];
    const addCalls = [];
    const updates = [];
    const focuses = [];
    const headers = [];
    const lockedStates = [];
    const serviceCalls = [];
    let nextId = 1;

    const addCard = (columnIndex, parentId, content, insertBeforeId, isAi) => {
        const id = `generated-${nextId++}`;
        addCalls.push({ id, columnIndex, parentId, content, insertBeforeId, isAi });
        cards.set(id, { id, columnIndex, parentId, content });
        if (parentId === source.id) {
            const insertionIndex = insertBeforeId ? childOrder.indexOf(insertBeforeId) : -1;
            if (insertionIndex === -1) childOrder.push(id);
            else childOrder.splice(insertionIndex, 0, id);
        }
        return id;
    };
    const getSiblingCards = cardId => {
        const card = cards.get(cardId);
        if (!card) return [];
        if (card.parentId === source.id) return childOrder.map(id => cards.get(id));
        return [source];
    };
    const { display, stream } = createStreamDisplay();
    const provider = args => { serviceCalls.push(args); };
    const aiService = {
        areAiSettingsValid: () => true,
        generateContinuation: provider,
        generateExpand: provider,
        generateBreakdown: provider,
        generateCustom: provider
    };
    const workflow = createAiWorkflow({
        projectState: {
            getCard: id => cards.get(id) || null,
            getSiblingCards,
            getCardContextData: () => ({ card: source }),
            updateCardContentData: (id, content) => {
                const card = cards.get(id);
                if (!card) return false;
                card.content = content;
                updates.push({ id, content });
                return true;
            }
        },
        aiService,
        addCard,
        getMode: () => 'map',
        view: {
            setInteractionLocked: locked => lockedStates.push(locked),
            createOptionStream: () => null,
            createCardStream: () => stream,
            optionCreated: () => {},
            updateGroupHeaderDisplay: id => headers.push(id),
            focusCard: (id, position) => focuses.push({ id, position }),
            showCustomAiPrompt: (cardId, targets, onSubmit) => onSubmit({
                userPrompt: 'Generate children',
                target: customTarget
            }),
            updateAiFeatureVisibility: () => {}
        }
    });

    return {
        action,
        workflow,
        source,
        existingChild,
        cards,
        childOrder,
        addCalls,
        updates,
        focuses,
        headers,
        lockedStates,
        serviceCalls,
        display
    };
}

function createOptionTargetHarness({ customTarget = null } = {}) {
    const source = { id: 'source', columnIndex: 0, parentId: null, content: 'Source' };
    const next = { id: 'next', columnIndex: 0, parentId: null, content: 'Current next' };
    const optionCalls = [];
    const serviceCalls = [];
    const lockedStates = [];
    const { display, stream } = createStreamDisplay();
    const provider = args => { serviceCalls.push(args); };
    const workflow = createAiWorkflow({
        projectState: {
            getCard: id => id === source.id ? source : id === next.id ? next : null,
            getSiblingCards: () => [source, next],
            getCardContextData: () => ({ card: source }),
            createOptionData: (cardId, optionSource, override) => {
                optionCalls.push({ cardId, optionSource, override });
                return { success: true, option: { id: `option-${optionCalls.length}`, cardId, source: optionSource } };
            }
        },
        aiService: {
            areAiSettingsValid: () => true,
            generateContinuation: provider,
            generateSummary: provider,
            generateCustom: provider
        },
        addCard: () => { throw new Error('Card must not be added'); },
        getMode: () => 'document',
        view: {
            setInteractionLocked: locked => lockedStates.push(locked),
            createOptionStream: () => stream,
            createCardStream: () => null,
            optionCreated: () => {},
            updateGroupHeaderDisplay: () => {},
            focusCard: () => {},
            showCustomAiPrompt: (cardId, targets, onSubmit) => onSubmit({
                userPrompt: 'Generate the selected placement',
                target: customTarget
            }),
            updateAiFeatureVisibility: () => {}
        }
    });

    return { workflow, source, next, optionCalls, serviceCalls, lockedStates, display };
}

test('Continue and Summarize target an existing next Card Option or add one following Card', () => {
    const summary = getAiActionPlan('summarize', sourceCard, siblings);
    const continuation = getAiActionPlan('continue', sourceCard, siblings);
    const append = getAiActionPlan('continue', sourceCard, siblings.slice(0, 2));

    assert.equal(summary.method, 'generateSummary');
    assert.equal(summary.targetKind, 'option');
    assert.equal(summary.targetCardId, 'card-c');
    assert.equal(summary.requiresContentCheck, true);
    assert.equal(continuation.targetKind, 'option');
    assert.equal(continuation.targetCardId, 'card-c');
    assert.equal(append.targetKind, 'card');
    assert.equal(append.targetColumnIndex, 2);
    assert.equal(append.parentIdForNewCards, 'parent-1');
    assert.equal(append.insertBeforeId, null);
});

test('child-adding AI plans are Map-only', () => {
    const breakdown = getAiActionPlan('breakdown', sourceCard, [], { mode: 'map' });
    const expand = getAiActionPlan('expand', sourceCard, [], { mode: 'map' });
    const customChildren = getAiActionPlan('custom', sourceCard, [], { mode: 'map', customTarget: 'children' });

    for (const plan of [breakdown, expand, customChildren]) {
        assert.equal(plan.targetKind, 'card');
        assert.equal(plan.targetColumnIndex, 3);
        assert.equal(plan.parentIdForNewCards, 'card-b');
    }
    assert.equal(breakdown.useMultiPartResponseHandler, true);
    assert.equal(expand.useMultiPartResponseHandler, false);
    assert.equal(getAiActionPlan('expand', sourceCard, [], { mode: 'document' }), null);
    assert.equal(getAiActionPlan('breakdown', sourceCard, [], { mode: 'document' }), null);
    assert.equal(getAiActionPlan('custom', sourceCard, [], { mode: 'document', customTarget: 'children' }), null);
});

test('Document child actions invoke no provider or mutation collaborator', () => {
    const calls = [];
    const source = { id: 'source', columnIndex: 0, parentId: null, content: 'Source' };
    const workflow = createAiWorkflow({
        projectState: {
            getCard: () => source,
            getSiblingCards: () => [source],
            getCardContextData: () => ({})
        },
        aiService: {
            areAiSettingsValid: () => true,
            generateExpand: () => calls.push('provider-expand'),
            generateBreakdown: () => calls.push('provider-breakdown')
        },
        addCard: () => calls.push('add-card'),
        getMode: () => 'document',
        view: {
            setInteractionLocked: () => calls.push('lock'),
            createOptionStream: () => null,
            createCardStream: () => null,
            showCustomAiPrompt: () => calls.push('prompt'),
            updateAiFeatureVisibility: () => {}
        }
    });

    assert.equal(workflow.expand('source'), false);
    assert.equal(workflow.breakdown('source'), false);
    assert.deepEqual(calls, []);
});

test('Custom target selection is authoritative', () => {
    const rewrite = getAiActionPlan('custom', sourceCard, siblings, { mode: 'document', customTarget: 'rewrite' });
    const next = getAiActionPlan('custom', sourceCard, siblings, { mode: 'document', customTarget: 'next' });

    assert.equal(rewrite.targetKind, 'option');
    assert.equal(rewrite.targetCardId, sourceCard.id);
    assert.equal(next.targetKind, 'option');
    assert.equal(next.targetCardId, 'card-c');
    assert.equal(getAiActionPlan('custom', sourceCard, siblings, { mode: 'map' }), null);
    assert.equal(getAiActionPlan('unknown', sourceCard), null);
});

test('Option-targeting AI requests one Option without adding or overwriting a Card', () => {
    const optionCalls = [];
    const addedCards = [];
    const lockedStates = [];
    const { display, stream } = createStreamDisplay();
    let serviceArguments;
    const cards = {
        source: { id: 'source', columnIndex: 0, parentId: null, content: 'Source' },
        next: { id: 'next', columnIndex: 0, parentId: null, content: 'Current next' }
    };

    const workflow = createAiWorkflow({
        projectState: {
            getCard: id => cards[id] || null,
            getSiblingCards: () => [cards.source, cards.next],
            getCardContextData: () => ({ card: { id: 'source' } }),
            createOptionData: (cardId, source, override) => {
                optionCalls.push({ cardId, source, override });
                return { success: true, option: { id: 'option-1', cardId, source } };
            }
        },
        aiService: {
            areAiSettingsValid: () => true,
            generateContinuation: args => { serviceArguments = args; }
        },
        addCard: (...args) => { addedCards.push(args); return 'unexpected'; },
        getMode: () => 'document',
        view: {
            setInteractionLocked: locked => lockedStates.push(locked),
            createOptionStream: () => stream,
            createCardStream: () => { throw new Error('card stream should not be used'); },
            optionCreated: () => {},
            updateGroupHeaderDisplay: () => {},
            focusCard: () => {},
            showCustomAiPrompt: () => {},
            updateAiFeatureVisibility: () => {}
        }
    });

    workflow.continue('source');
    assert.equal(workflow.isBusy(), true);
    serviceArguments.onChunk('Alternative');
    serviceArguments.onDone('Alternative next');

    assert.deepEqual(optionCalls, [{ cardId: 'next', source: 'AI', override: { content: 'Alternative next' } }]);
    assert.deepEqual(addedCards, []);
    assert.equal(cards.next.content, 'Current next');
    assert.equal(display.content, 'Alternative next');
    assert.equal(display.finished, true);
    assert.equal(display.failed, false);
    assert.deepEqual(lockedStates, [true, false]);
});

test('Option-targeting failure creates no Option and releases busy state', () => {
    let serviceArguments;
    let optionCount = 0;
    const lockedStates = [];
    const { display, stream } = createStreamDisplay();
    const source = { id: 'source', columnIndex: 0, parentId: null, content: 'Source' };

    const workflow = createAiWorkflow({
        projectState: {
            getCard: () => source,
            getSiblingCards: () => [source],
            getCardContextData: () => ({}),
            createOptionData: () => { optionCount += 1; return { success: true }; }
        },
        aiService: {
            areAiSettingsValid: () => true,
            generateCustom: args => { serviceArguments = args; }
        },
        addCard: () => { throw new Error('Card must not be added'); },
        getMode: () => 'document',
        view: {
            setInteractionLocked: locked => lockedStates.push(locked),
            createOptionStream: () => stream,
            createCardStream: () => null,
            optionCreated: () => {},
            updateGroupHeaderDisplay: () => {},
            focusCard: () => {},
            showCustomAiPrompt: (cardId, targets, onSubmit) => onSubmit({ userPrompt: 'delete it', target: 'rewrite' }),
            updateAiFeatureVisibility: () => {}
        }
    });

    workflow.custom('source');
    serviceArguments.onError(new Error('transport failed'));

    assert.equal(optionCount, 0);
    assert.equal(display.failed, true);
    assert.match(display.content, /transport failed/);
    assert.equal(workflow.isBusy(), false);
    assert.deepEqual(lockedStates, [true, false]);
});

test('Card-targeting empty output retains an error placeholder and never deletes it', () => {
    const updates = [];
    const addedCards = [];
    const { display, stream } = createStreamDisplay();
    let serviceArguments;
    const source = { id: 'source', columnIndex: 0, parentId: null, content: 'Source' };

    const workflow = createAiWorkflow({
        projectState: {
            getCard: id => id === 'source' || id === 'placeholder' ? { ...source, id } : null,
            getSiblingCards: () => [source],
            getCardContextData: () => ({}),
            updateCardContentData: (id, content) => { updates.push({ id, content }); return true; }
        },
        aiService: {
            areAiSettingsValid: () => true,
            generateContinuation: args => { serviceArguments = args; }
        },
        addCard: (...args) => { addedCards.push(args); return 'placeholder'; },
        getMode: () => 'map',
        view: {
            setInteractionLocked: () => {},
            createOptionStream: () => null,
            createCardStream: () => stream,
            optionCreated: () => {},
            updateGroupHeaderDisplay: () => {},
            focusCard: () => {},
            showCustomAiPrompt: () => {},
            updateAiFeatureVisibility: () => {}
        }
    });

    workflow.continue('source');
    serviceArguments.onDone('   ');

    assert.equal(addedCards.length, 1);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].id, 'placeholder');
    assert.match(updates[0].content, /empty response/i);
    assert.equal(display.failed, true);
});

test('Map Expand appends exactly one child Card and preserves the existing child', () => {
    const harness = createCardTargetHarness({ action: 'expand' });

    assert.equal(harness.workflow.expand(harness.source.id), true);
    assert.equal(harness.serviceCalls.length, 1);
    harness.serviceCalls[0].onDone('Expanded child');

    assert.deepEqual(harness.childOrder, ['existing-child', 'generated-1']);
    assert.equal(harness.cards.get('existing-child').content, 'Existing');
    assert.equal(harness.cards.get('generated-1').content, 'Expanded child');
    assert.deepEqual(harness.addCalls, [{
        id: 'generated-1',
        columnIndex: 2,
        parentId: 'source',
        content: 'AI is thinking...',
        insertBeforeId: null,
        isAi: true
    }]);
    assert.deepEqual(harness.focuses, [{ id: 'generated-1', position: 'start' }]);
    assert.deepEqual(harness.lockedStates, [true, false]);
});

test('Map Breakdown appends every generated part in order after existing children', () => {
    const harness = createCardTargetHarness({ action: 'breakdown' });

    assert.equal(harness.workflow.breakdown(harness.source.id), true);
    harness.serviceCalls[0].onDone('First child\n---\nSecond child\n---\nThird child');

    assert.deepEqual(harness.childOrder, [
        'existing-child',
        'generated-1',
        'generated-2',
        'generated-3'
    ]);
    assert.deepEqual(harness.childOrder.map(id => harness.cards.get(id).content), [
        'Existing',
        'First child',
        'Second child',
        'Third child'
    ]);
    assert.deepEqual(harness.addCalls.map(call => call.insertBeforeId), [null, null, null]);
    assert.deepEqual(harness.focuses, [{ id: 'generated-3', position: 'start' }]);
    assert.deepEqual(harness.headers, ['source']);
});

test('Map Custom children uses the selected target and the same ordered child placement', () => {
    const harness = createCardTargetHarness({ action: 'custom', customTarget: 'children' });

    assert.equal(harness.workflow.custom(harness.source.id), true);
    assert.equal(harness.serviceCalls.length, 1);
    assert.equal(harness.serviceCalls[0].userPrompt, 'Generate children');
    harness.serviceCalls[0].onDone('Custom one\n---\nCustom two');

    assert.deepEqual(harness.childOrder, ['existing-child', 'generated-1', 'generated-2']);
    assert.deepEqual(harness.childOrder.map(id => harness.cards.get(id).content), [
        'Existing',
        'Custom one',
        'Custom two'
    ]);
});

test('Continue without a following sibling appends one live Card in the same group', () => {
    const harness = createCardTargetHarness();

    assert.equal(harness.workflow.continue(harness.source.id), true);
    harness.serviceCalls[0].onDone('Following paragraph');

    assert.deepEqual(harness.addCalls, [{
        id: 'generated-1',
        columnIndex: 1,
        parentId: 'root',
        content: 'AI is thinking...',
        insertBeforeId: null,
        isAi: true
    }]);
    assert.equal(harness.cards.get('generated-1').content, 'Following paragraph');
});

test('Option persistence failure leaves no visible success effect and releases busy state', () => {
    const source = { id: 'source', columnIndex: 0, parentId: null, content: 'Source' };
    const next = { id: 'next', columnIndex: 0, parentId: null, content: 'Current next' };
    const lockedStates = [];
    const createdNotifications = [];
    const { display, stream } = createStreamDisplay();
    let serviceArguments;

    const workflow = createAiWorkflow({
        projectState: {
            getCard: id => id === source.id ? source : next,
            getSiblingCards: () => [source, next],
            getCardContextData: () => ({}),
            createOptionData: () => ({ success: false, reason: 'persistence-failed' })
        },
        aiService: {
            areAiSettingsValid: () => true,
            generateContinuation: args => { serviceArguments = args; }
        },
        addCard: () => { throw new Error('Card must not be added'); },
        getMode: () => 'document',
        view: {
            setInteractionLocked: locked => lockedStates.push(locked),
            createOptionStream: () => stream,
            createCardStream: () => null,
            optionCreated: (...args) => createdNotifications.push(args),
            updateGroupHeaderDisplay: () => {},
            focusCard: () => {},
            showCustomAiPrompt: () => {},
            updateAiFeatureVisibility: () => {}
        }
    });

    workflow.continue(source.id);
    serviceArguments.onDone('Unsaved alternative');

    assert.equal(display.failed, true);
    assert.match(display.content, /could not be saved/i);
    assert.deepEqual(createdNotifications, []);
    assert.equal(next.content, 'Current next');
    assert.equal(workflow.isBusy(), false);
    assert.deepEqual(lockedStates, [true, false]);
});

test('Synchronous setup failure is inspectable and late callbacks cannot commit during retry', () => {
    const source = { id: 'source', columnIndex: 0, parentId: null, content: 'Source' };
    const next = { id: 'next', columnIndex: 0, parentId: null, content: 'Current next' };
    const serviceCalls = [];
    const optionCalls = [];
    const displays = [];
    let attempt = 0;

    const workflow = createAiWorkflow({
        projectState: {
            getCard: id => id === source.id ? source : next,
            getSiblingCards: () => [source, next],
            getCardContextData: () => ({}),
            createOptionData: (cardId, optionSource, override) => {
                optionCalls.push({ cardId, optionSource, override });
                return { success: true, option: { id: `option-${optionCalls.length}` } };
            }
        },
        aiService: {
            areAiSettingsValid: () => true,
            generateContinuation: args => {
                serviceCalls.push(args);
                attempt += 1;
                if (attempt === 1) throw new Error('setup exploded');
            }
        },
        addCard: () => { throw new Error('Card must not be added'); },
        getMode: () => 'document',
        view: {
            setInteractionLocked: () => {},
            createOptionStream: () => {
                const item = createStreamDisplay();
                displays.push(item.display);
                return item.stream;
            },
            createCardStream: () => null,
            optionCreated: () => {},
            updateGroupHeaderDisplay: () => {},
            focusCard: () => {},
            showCustomAiPrompt: () => {},
            updateAiFeatureVisibility: () => {}
        }
    });

    assert.equal(workflow.continue(source.id), false);
    assert.equal(displays[0].failed, true);
    assert.match(displays[0].content, /setup failed: setup exploded/i);
    assert.equal(workflow.isBusy(), false);

    assert.equal(workflow.continue(source.id), true);
    serviceCalls[0].onDone('Late first-attempt completion');
    serviceCalls[1].onChunk('Second');
    serviceCalls[1].onDone('Second-attempt completion');
    serviceCalls[1].onError(new Error('Late second-attempt error'));

    assert.deepEqual(optionCalls, [{
        cardId: 'next',
        optionSource: 'AI',
        override: { content: 'Second-attempt completion' }
    }]);
    assert.equal(displays[1].content, 'Second-attempt completion');
    assert.equal(displays[1].failed, false);
    assert.equal(workflow.isBusy(), false);
});

test('Summarize executes against the immediate following Card as one Option', () => {
    const harness = createOptionTargetHarness();
    const before = structuredClone(harness.next);

    assert.equal(harness.workflow.summarize(harness.source.id), true);
    harness.serviceCalls[0].onDone('Summary alternative');

    assert.deepEqual(harness.optionCalls, [{
        cardId: 'next',
        optionSource: 'AI',
        override: { content: 'Summary alternative' }
    }]);
    assert.deepEqual(harness.next, before);
    assert.deepEqual(harness.lockedStates, [true, false]);
});

test('Custom next executes the explicitly selected following-Card Option target', () => {
    const harness = createOptionTargetHarness({ customTarget: 'next' });

    assert.equal(harness.workflow.custom(harness.source.id), true);
    assert.equal(harness.serviceCalls[0].userPrompt, 'Generate the selected placement');
    harness.serviceCalls[0].onDone('Custom next alternative');

    assert.deepEqual(harness.optionCalls, [{
        cardId: 'next',
        optionSource: 'AI',
        override: { content: 'Custom next alternative' }
    }]);
});

test('Non-string Option output is rejected without a persistent Option', () => {
    const harness = createOptionTargetHarness();

    harness.workflow.continue(harness.source.id);
    harness.serviceCalls[0].onDone({ content: 'not an accepted provider result' });

    assert.deepEqual(harness.optionCalls, []);
    assert.equal(harness.display.failed, true);
    assert.match(harness.display.content, /empty response/i);
    assert.equal(harness.workflow.isBusy(), false);
});

test('Cancelled Card generation keeps only its error placeholder and preserves prior Cards', () => {
    const harness = createCardTargetHarness({ action: 'expand' });
    const sourceBefore = structuredClone(harness.source);
    const existingBefore = structuredClone(harness.existingChild);

    harness.workflow.expand(harness.source.id);
    harness.serviceCalls[0].onError(new Error('cancelled'));

    assert.deepEqual(harness.source, sourceBefore);
    assert.deepEqual(harness.existingChild, existingBefore);
    assert.match(harness.cards.get('generated-1').content, /cancelled/i);
    assert.deepEqual(harness.childOrder, ['existing-child', 'generated-1']);
    assert.equal(harness.display.failed, true);
    assert.equal(harness.workflow.isBusy(), false);
});
