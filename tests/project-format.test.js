import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
    CURRENT_PROJECT_SCHEMA_VERSION,
    createProjectExport,
    normalizeProjectExport,
    parseProjectExport,
    projectToPlainText
} from '../projectFormat.js';

test('accepts and normalizes the unversioned onboarding project', async () => {
    const source = await readFile(new URL('../examples/new-onboarding.json', import.meta.url), 'utf8');
    const result = parseProjectExport(source);

    assert.equal(result.ok, true);
    assert.equal(result.value.title, 'Welcome');
    assert.equal(result.value.data.columns.length, 3);
    assert.equal(result.value.data.globalPrompt, '');
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
        data
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
