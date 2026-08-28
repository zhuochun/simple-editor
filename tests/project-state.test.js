import assert from 'node:assert/strict';
import test from 'node:test';

function createMemoryStorage() {
    const values = new Map();
    let writeCount = 0;
    let failNextWrite = false;
    return {
        getItem(key) {
            return values.has(key) ? values.get(key) : null;
        },
        setItem(key, value) {
            if (failNextWrite) {
                failNextWrite = false;
                throw new Error('simulated storage failure');
            }
            writeCount += 1;
            values.set(key, String(value));
        },
        removeItem(key) {
            values.delete(key);
        },
        get writeCount() {
            return writeCount;
        },
        failNextWrite() {
            failNextWrite = true;
        }
    };
}

async function loadDataModule(label) {
    globalThis.localStorage = createMemoryStorage();
    const data = await import(`../projectState.js?test=${label}-${Date.now()}-${Math.random()}`);
    data.loadProjectsData();
    return { data, storage: globalThis.localStorage };
}

test('project mutations persist under the state owner', async () => {
    const { data, storage } = await loadDataModule('persistence');
    const writesBefore = storage.writeCount;

    data.addCardData(0, null, 'Persisted card');

    assert.equal(storage.writeCount, writesBefore + 1);
    const storedProjects = JSON.parse(storage.getItem('writingToolProjects'));
    const storedActive = storedProjects[data.getActiveProjectId()];
    assert.equal(Object.values(storedActive.data.cards)[0].content, 'Persisted card');
});

test('adding a column always persists through the public command', async () => {
    const { data, storage } = await loadDataModule('add-column');
    const columnsBefore = data.getActiveProjectData().columns.length;
    const writesBefore = storage.writeCount;

    const newColumnIndex = data.addColumnData(false);

    assert.equal(newColumnIndex, columnsBefore);
    assert.equal(data.getActiveProjectData().columns.length, columnsBefore + 1);
    assert.equal(storage.writeCount, writesBefore + 1);
});

test('split sibling is one atomic project command', async () => {
    const { data, storage } = await loadDataModule('split');
    const original = data.addCardData(0, null, 'AlphaBeta');
    const writesBefore = storage.writeCount;

    const result = data.splitCardData(original.id, 'AlphaBeta', 5, false);

    assert.equal(result.success, true);
    assert.equal(storage.writeCount, writesBefore + 1);
    assert.equal(data.getCard(original.id).content, 'Alpha');
    assert.equal(data.getCard(result.newCardId).content, 'Beta');
    assert.equal(data.getCard(result.newCardId).parentId, null);
    assert.deepEqual(data.getColumnCards(0).map(card => card.id), [original.id, result.newCardId]);
});

test('split child creates the child in the next column', async () => {
    const { data } = await loadDataModule('split-child');
    const original = data.addCardData(0, null, 'ParentChild');

    const result = data.splitCardData(original.id, 'ParentChild', 6, true);

    assert.equal(result.success, true);
    assert.equal(data.getCard(original.id).content, 'Parent');
    assert.equal(data.getCard(result.newCardId).content, 'Child');
    assert.equal(data.getCard(result.newCardId).parentId, original.id);
    assert.equal(data.getCard(result.newCardId).columnIndex, 1);
});

test('merge reparents children and persists once', async () => {
    const { data, storage } = await loadDataModule('merge');
    const first = data.addCardData(0, null, 'First');
    const second = data.addCardData(0, null, 'Second');
    const child = data.addCardData(1, second.id, 'Child');
    const writesBefore = storage.writeCount;

    const result = data.mergeCardData(second.id, 'previous', 'Second');

    assert.equal(result.success, true);
    assert.equal(storage.writeCount, writesBefore + 1);
    assert.equal(data.getCard(first.id).content, 'FirstSecond');
    assert.equal(data.getCard(second.id), undefined);
    assert.equal(data.getCard(child.id).parentId, first.id);
    assert.equal(result.focusCardId, first.id);
    assert.equal(result.cursorPosition, 5);
});

test('AI context is exposed as a project snapshot', async () => {
    const { data } = await loadDataModule('ai-context');
    data.setGlobalPromptData('Global');
    data.setColumnPromptData(0, 'Current column');
    data.setColumnPromptData(1, 'Target column');
    const first = data.addCardData(0, null, 'First');
    const source = data.addCardData(0, null, 'Source');
    const following = data.addCardData(0, null, 'Following');
    const child = data.addCardData(1, source.id, 'Child');

    const context = data.getCardContextData(source.id);

    assert.deepEqual(context, {
        globalPrompt: 'Global',
        columnPrompt: 'Current column',
        parentCardContent: null,
        currentCardContent: 'Source',
        precedingSiblingsContent: ['First'],
        followingSiblingsContent: ['Following'],
        existingChildrenContent: ['Child'],
        targetColumnPrompt: 'Target column'
    });
    assert.ok(first && following && child);
});

test('derived hierarchy colors keep a root hue and lighten by depth', async () => {
    const { data } = await loadDataModule('hierarchy-colors');
    const firstRoot = data.addCardData(0, null, 'First');
    const secondRoot = data.addCardData(0, null, 'Second');
    const child = data.addCardData(1, firstRoot.id, 'Child');
    const grandchild = data.addCardData(2, child.id, 'Grandchild');
    const parse = card => data.getColorForCard(card).match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/).slice(1).map(Number);
    const [rootHue, rootSaturation, rootLightness] = parse(firstRoot);
    const [secondHue] = parse(secondRoot);
    const [childHue, childSaturation, childLightness] = parse(child);
    const [grandchildHue, , grandchildLightness] = parse(grandchild);

    assert.notEqual(secondHue, rootHue);
    assert.equal(childHue, rootHue);
    assert.equal(grandchildHue, rootHue);
    assert.equal(childSaturation, rootSaturation);
    assert.equal(childLightness, rootLightness + 2);
    assert.equal(grandchildLightness, childLightness + 2);
});

test('manual and AI options capture immutable direct sibling snapshots in stable order', async () => {
    const { data, storage } = await loadDataModule('options-create');
    const first = data.addCardData(0, null, 'First');
    const second = data.addCardData(0, null, 'Second');
    const child = data.addCardData(1, first.id, 'Child');
    const writesBefore = storage.writeCount;

    const manual = data.createOptionData(first.id, 'Manual');
    const ai = data.createOptionData(first.id, 'AI', { content: 'Alternative first' });

    assert.equal(manual.success, true);
    assert.equal(ai.success, true);
    assert.equal(storage.writeCount, writesBefore + 2);
    assert.deepEqual(manual.option.snapshot.cards, [
        { id: first.id, name: null, content: 'First', order: first.order },
        { id: second.id, name: null, content: 'Second', order: second.order }
    ]);
    assert.equal(manual.option.snapshot.cards.some(card => card.id === child.id), false);
    assert.equal(ai.option.snapshot.cards[0].content, 'Alternative first');
    assert.equal(data.getCard(first.id).content, 'First');

    data.getActiveProjectData().options[manual.option.id].createdAt = 10;
    data.getActiveProjectData().options[ai.option.id].createdAt = 10;
    assert.deepEqual(
        data.getOptionsForCard(first.id).map(option => option.id),
        [manual.option.id, ai.option.id].sort((left, right) => (
            left === right ? 0 : (left < right ? 1 : -1)
        ))
    );
});

test('option deletion preserves the final history item and selects the nearest survivor', async () => {
    const { data } = await loadDataModule('options-delete');
    const card = data.addCardData(0, null, 'Current');
    const oldest = data.createOptionData(card.id, 'Manual').option;
    data.updateCardContentData(card.id, 'Newer current');
    const newest = data.createOptionData(card.id, 'Manual').option;

    const deleted = data.deleteOptionData(newest.id);

    assert.equal(deleted.success, true);
    assert.equal(deleted.selectedOptionId, oldest.id);
    assert.equal(data.getOption(newest.id), null);
    assert.equal(data.deleteOptionData(oldest.id).reason, 'final-option');
    assert.equal(data.getOption(oldest.id).id, oldest.id);
});

test('card deletion removes descendant-owned options without affecting other histories', async () => {
    const { data } = await loadDataModule('options-card-delete');
    const root = data.addCardData(0, null, 'Root');
    const other = data.addCardData(0, null, 'Other');
    const child = data.addCardData(1, root.id, 'Child');
    const rootOption = data.createOptionData(root.id, 'Manual').option;
    const childOption = data.createOptionData(child.id, 'Manual').option;
    const otherOption = data.createOptionData(other.id, 'Manual').option;

    const result = data.deleteCardData(root.id);

    assert.deepEqual(new Set(result.deletedOptionIds), new Set([rootOption.id, childOption.id]));
    assert.equal(data.getOption(rootOption.id), null);
    assert.equal(data.getOption(childOption.id), null);
    assert.equal(data.getOption(otherOption.id).id, otherOption.id);
});

test('merge clears both histories and document merge rejects a lower card with children', async () => {
    const { data } = await loadDataModule('options-merge');
    const upper = data.addCardData(0, null, 'Upper');
    const lower = data.addCardData(0, null, 'Lower');
    const upperOption = data.createOptionData(upper.id, 'Manual').option;
    const lowerOption = data.createOptionData(lower.id, 'Manual').option;

    const merged = data.mergeCardData(lower.id, 'previous', 'Lower', { documentMode: true });

    assert.equal(merged.success, true);
    assert.equal(data.getCard(upper.id).content, 'UpperLower');
    assert.equal(data.getCard(lower.id), undefined);
    assert.equal(data.getOption(upperOption.id), null);
    assert.equal(data.getOption(lowerOption.id), null);

    const nextLower = data.addCardData(0, null, 'Next');
    const child = data.addCardData(1, nextLower.id, 'Child');
    const before = structuredClone(data.getActiveProjectData());
    const rejected = data.mergeCardData(upper.id, 'next', 'UpperLower', { documentMode: true });

    assert.equal(rejected.success, false);
    assert.equal(rejected.reason, 'document-scope-descendants');
    assert.deepEqual(data.getActiveProjectData(), before);
    assert.ok(child);
});

test('use as current preserves outgoing state and rejects cross-scope or descendant mutation', async () => {
    const { data } = await loadDataModule('options-use');
    const first = data.addCardData(0, null, 'Past first');
    const second = data.addCardData(0, null, 'Past second');
    const historical = data.createOptionData(first.id, 'Manual').option;
    data.updateCardContentData(first.id, 'Current first');
    data.updateCardContentData(second.id, 'Current second');

    const used = data.useOptionAsCurrentData(historical.id);

    assert.equal(used.success, true);
    assert.equal(data.getCard(first.id).content, 'Past first');
    assert.equal(data.getCard(second.id).content, 'Past second');
    assert.equal(data.getOption(historical.id).snapshot.cards[0].content, 'Past first');
    assert.ok(data.getOptionsForCard(first.id).some(option => (
        option.source === 'Manual'
        && option.snapshot.cards[0].content === 'Current first'
    )));

    const current = data.createOptionData(first.id, 'Manual').option;
    data.moveCardData(second.id, 1, first.id, null);
    const beforeCrossScope = structuredClone(data.getActiveProjectData());
    const crossScope = data.useOptionAsCurrentData(current.id);
    assert.equal(crossScope.success, false);
    assert.equal(crossScope.reason, 'cross-scope-card');
    assert.deepEqual(data.getActiveProjectData(), beforeCrossScope);

    const third = data.addCardData(0, null, 'Third');
    const withoutThird = data.createOptionData(first.id, 'Manual').option;
    data.deleteOptionData(withoutThird.id);
    const optionWithoutThird = data.createOptionData(first.id, 'Manual').option;
    data.getActiveProjectData().options[optionWithoutThird.id].snapshot.cards = [
        data.getActiveProjectData().options[optionWithoutThird.id].snapshot.cards[0]
    ];
    const thirdChild = data.addCardData(1, third.id, 'Third child');
    const beforeDescendants = structuredClone(data.getActiveProjectData());
    const descendantRemoval = data.useOptionAsCurrentData(optionWithoutThird.id);
    assert.equal(descendantRemoval.success, false);
    assert.equal(descendantRemoval.reason, 'document-scope-descendants');
    assert.deepEqual(data.getActiveProjectData(), beforeDescendants);
    assert.ok(thirdChild);
});

test('moving an owner or subtree preserves card-owned Option identity', async () => {
    const { data } = await loadDataModule('options-move-identity');
    const firstRoot = data.addCardData(0, null, 'First root');
    const secondRoot = data.addCardData(0, null, 'Second root');
    const child = data.addCardData(1, firstRoot.id, 'Child');
    const grandchild = data.addCardData(2, child.id, 'Grandchild');
    const childOption = data.createOptionData(child.id, 'Manual').option;
    const grandchildOption = data.createOptionData(grandchild.id, 'AI').option;
    const beforeOptions = structuredClone(data.getActiveProjectData().options);

    const ownerMove = data.moveCardData(child.id, 1, secondRoot.id, null);
    assert.equal(ownerMove.success, true);
    assert.equal(data.getCard(child.id).parentId, secondRoot.id);
    assert.deepEqual(data.getActiveProjectData().options, beforeOptions);
    assert.deepEqual(data.getOptionsForCard(child.id).map(option => option.id), [childOption.id]);
    assert.deepEqual(data.getOptionsForCard(grandchild.id).map(option => option.id), [grandchildOption.id]);

    const subtreeMove = data.moveCardData(secondRoot.id, 1, firstRoot.id, null);
    assert.equal(subtreeMove.success, true);
    assert.equal(data.getCard(child.id).columnIndex, 2);
    assert.equal(data.getCard(grandchild.id).columnIndex, 3);
    assert.deepEqual(data.getActiveProjectData().options, beforeOptions);
});

test('persistence failure rolls back option creation and use as current', async () => {
    const { data, storage } = await loadDataModule('options-storage-failure');
    const card = data.addCardData(0, null, 'Initial');
    const beforeCreate = structuredClone(data.getActiveProjectData());

    storage.failNextWrite();
    const failedCreate = data.createOptionData(card.id, 'Manual');
    assert.equal(failedCreate.success, false);
    assert.equal(failedCreate.reason, 'persistence-failed');
    assert.deepEqual(data.getActiveProjectData(), beforeCreate);

    const historical = data.createOptionData(card.id, 'Manual').option;
    data.updateCardContentData(card.id, 'Changed');
    const beforeUse = structuredClone(data.getActiveProjectData());
    storage.failNextWrite();
    const failedUse = data.useOptionAsCurrentData(historical.id);
    assert.equal(failedUse.success, false);
    assert.equal(failedUse.reason, 'persistence-failed');
    assert.deepEqual(data.getActiveProjectData(), beforeUse);
});
