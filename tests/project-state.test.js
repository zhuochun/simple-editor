import assert from 'node:assert/strict';
import test from 'node:test';

function createMemoryStorage() {
    const values = new Map();
    let writeCount = 0;
    return {
        getItem(key) {
            return values.has(key) ? values.get(key) : null;
        },
        setItem(key, value) {
            writeCount += 1;
            values.set(key, String(value));
        },
        removeItem(key) {
            values.delete(key);
        },
        get writeCount() {
            return writeCount;
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
