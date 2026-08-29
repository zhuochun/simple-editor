import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
    CURRENT_PROJECT_SCHEMA_VERSION,
    createProjectExport,
    normalizeProjectExport,
    parseProjectExport,
    projectToPlainText
} from '../../src/project/projectFormat.js';

test('accepts and normalizes the unversioned onboarding project', async () => {
    const source = await readFile(new URL('../../examples/new-onboarding.json', import.meta.url), 'utf8');
    const result = parseProjectExport(source);

    assert.equal(result.ok, true);
    assert.equal(result.value.title, 'Welcome');
    assert.equal(result.value.data.columns.length, 3);
    assert.equal(result.value.data.globalPrompt, '');
    assert.deepEqual(result.value.data.options, {});
    assert.ok(Object.values(result.value.data.columns).every(column => typeof column.prompt === 'string'));
    assert.ok(Object.values(result.value.data.cards).every(card => card.color === ''));
});

test('defaults supported legacy omissions without mutating the source', () => {
    const source = {
        title: '   ',
        data: {
            columns: [{}],
            cards: {
                root: { id: 'root', parentId: null, columnIndex: 0, order: 0 },
                child: { id: 'child', parentId: 'root', columnIndex: 1, order: 0, extra: 'preserved' }
            },
            extraData: 'preserved'
        }
    };
    let generatedId = 0;
    const result = normalizeProjectExport(source, { generateColumnId: () => `column-${generatedId++}` });

    assert.equal(result.ok, true);
    assert.equal(result.value.title, 'Imported Project');
    assert.equal(result.value.data.columns.length, 3);
    assert.equal(result.value.data.globalPrompt, '');
    assert.deepEqual(result.value.data.options, {});
    assert.equal(result.value.data.cards.root.content, '');
    assert.equal(result.value.data.cards.root.name, null);
    assert.equal(result.value.data.cards.child.extra, 'preserved');
    assert.equal(result.value.data.extraData, 'preserved');
    assert.equal(source.data.columns.length, 1);
    assert.equal(source.data.cards.root.content, undefined);
});

test('rejects an unsupported future version', () => {
    const result = normalizeProjectExport({
        schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION + 1,
        data: { columns: [], cards: {} }
    });

    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'unsupported-version');
});

test('normalizes and round-trips valid version 2 options', () => {
    const source = {
        schemaVersion: 2,
        title: 'Options',
        data: {
            columns: [{ id: 'column-0' }, {}, {}],
            cards: {
                first: { id: 'first', parentId: null, columnIndex: 0, order: 0, content: 'Current first' },
                second: { id: 'second', parentId: null, columnIndex: 0, order: 1, content: 'Current second' }
            },
            options: {
                option_1: {
                    id: 'option_1',
                    cardId: 'first',
                    source: 'Manual',
                    createdAt: 1700000000000,
                    snapshot: {
                        cards: [
                            { id: 'first', name: null, content: 'Past first', order: 0 },
                            { id: 'second', name: 'Second', content: 'Past second', order: 1 }
                        ]
                    },
                    extra: 'preserved'
                }
            }
        }
    };

    const result = normalizeProjectExport(source, { generateColumnId: () => 'generated-column' });

    assert.equal(result.ok, true);
    assert.equal(result.value.data.options.option_1.extra, 'preserved');
    assert.deepEqual(result.value.data.options.option_1.snapshot.cards, source.data.options.option_1.snapshot.cards);
    const exported = createProjectExport({ title: result.value.title, data: result.value.data });
    assert.equal(exported.schemaVersion, 2);
    assert.deepEqual(normalizeProjectExport(exported), result);
});

test('version 1 never interprets an options field', () => {
    const result = normalizeProjectExport({
        schemaVersion: 1,
        data: { columns: [], cards: {}, options: {} }
    });

    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'options-require-version-2');
});

test('rejects invalid option ownership and snapshot records', () => {
    const base = {
        schemaVersion: 2,
        data: {
            columns: [{}, {}, {}],
            cards: {
                owner: { id: 'owner', parentId: null, columnIndex: 0, order: 0 }
            },
            options: {}
        }
    };
    const normalizeOption = option => normalizeProjectExport({
        ...base,
        data: { ...base.data, options: { option_1: option } }
    });
    const valid = {
        id: 'option_1',
        cardId: 'owner',
        source: 'AI',
        createdAt: 1,
        snapshot: { cards: [{ id: 'owner', name: null, content: '', order: 0 }] }
    };

    assert.equal(normalizeOption({ ...valid, id: 'wrong' }).error.code, 'option-id-mismatch');
    assert.equal(normalizeOption({ ...valid, cardId: 'missing' }).error.code, 'missing-option-owner');
    assert.equal(normalizeOption({ ...valid, source: 'Robot' }).error.code, 'invalid-option-source');
    assert.equal(normalizeOption({ ...valid, createdAt: Number.NaN }).error.code, 'invalid-option-created-at');
    assert.equal(normalizeOption({ ...valid, snapshot: { cards: [] } }).error.code, 'missing-option-owner-snapshot');
    assert.equal(normalizeOption({
        ...valid,
        snapshot: {
            cards: [
                { id: 'owner', name: null, content: '', order: 0 },
                { id: 'owner', name: null, content: 'duplicate', order: 1 }
            ]
        }
    }).error.code, 'duplicate-option-snapshot-card');
});

test('rejects structurally ambiguous hierarchies', () => {
    const missingParent = normalizeProjectExport({
        data: {
            columns: [{}, {}, {}],
            cards: {
                child: { id: 'child', parentId: 'missing', columnIndex: 1, order: 0 }
            }
        }
    });
    assert.equal(missingParent.error.code, 'missing-parent');

    const wrongColumn = normalizeProjectExport({
        data: {
            columns: [{}, {}, {}],
            cards: {
                root: { id: 'root', parentId: null, columnIndex: 0, order: 0 },
                child: { id: 'child', parentId: 'root', columnIndex: 2, order: 0 }
            }
        }
    });
    assert.equal(wrongColumn.error.code, 'child-column-mismatch');
});

test('emits a versioned export envelope', () => {
    const data = { columns: [], cards: {}, globalPrompt: '' };
    assert.deepEqual(createProjectExport({ title: 'Draft', data }), {
        schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
        title: 'Draft',
        data: { ...data, options: {} }
    });
});

test('exports text in depth-first sibling order and skips empty cards', () => {
    const project = {
        data: {
            cards: {
                second: { id: 'second', parentId: null, order: 2, content: 'Second root' },
                root: { id: 'root', parentId: null, order: 1, content: 'First root' },
                childB: { id: 'childB', parentId: 'root', order: 2, content: 'Second child' },
                childA: { id: 'childA', parentId: 'root', order: 1, content: 'First child' },
                empty: { id: 'empty', parentId: 'root', order: 3, content: '   ' }
            }
        }
    };

    assert.equal(projectToPlainText(project), 'First root\n\nFirst child\n\nSecond child\n\nSecond root');
});
