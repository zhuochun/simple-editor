import assert from 'node:assert/strict';
import test from 'node:test';

import { createProjectTransfer, downloadBrowserFile } from '../projectTransfer.js';

function createHarness() {
    const addedProjects = [];
    const selectedProjects = [];
    const alerts = [];
    const projectState = {
        addProjectData(title, data) {
            const project = { id: `project-${addedProjects.length + 1}`, title, data };
            addedProjects.push(project);
            return project;
        },
        getProject() {
            return null;
        }
    };
    const transfer = createProjectTransfer({
        projectState,
        onProjectImported: projectId => selectedProjects.push(projectId),
        showAlert: message => alerts.push(message)
    });
    return { addedProjects, alerts, selectedProjects, transfer };
}

test('valid import creates and selects one normalized project', async () => {
    const harness = createHarness();
    const result = await harness.transfer.processImportedData(JSON.stringify({
        title: 'Imported',
        data: { columns: [], cards: {} }
    }), 'test input');

    assert.equal(result, true);
    assert.equal(harness.addedProjects.length, 1);
    assert.equal(harness.addedProjects[0].title, 'Imported');
    assert.equal(harness.addedProjects[0].data.columns.length, 3);
    assert.deepEqual(harness.selectedProjects, ['project-1']);
    assert.deepEqual(harness.alerts, []);
});

test('rejected import has no project or selection effects', async () => {
    const harness = createHarness();
    const result = await harness.transfer.processImportedData(JSON.stringify({
        schemaVersion: 3,
        data: { columns: [], cards: {} }
    }), 'future input');

    assert.equal(result, false);
    assert.deepEqual(harness.addedProjects, []);
    assert.deepEqual(harness.selectedProjects, []);
    assert.equal(harness.alerts.length, 1);
});

test('URL import delegates fetched text through the same atomic path', async () => {
    const harness = createHarness();
    const transfer = createProjectTransfer({
        projectState: {
            addProjectData(title, data) {
                const project = { id: 'fetched-project', title, data };
                harness.addedProjects.push(project);
                return project;
            },
            getProject() {
                return null;
            }
        },
        onProjectImported: projectId => harness.selectedProjects.push(projectId),
        showAlert: message => harness.alerts.push(message),
        fetchImpl: async () => ({
            ok: true,
            text: async () => JSON.stringify({ title: 'Fetched', data: { columns: [], cards: {} } })
        })
    });

    assert.equal(await transfer.importProjectFromUrl('/project.json', 'test URL'), true);
    assert.equal(harness.addedProjects[0].title, 'Fetched');
    assert.deepEqual(harness.selectedProjects, ['fetched-project']);
});

test('browser download creates, clicks, removes, and revokes one named Blob URL', async () => {
    const effects = [];
    const link = {
        href: '',
        download: '',
        click: () => effects.push('click')
    };
    let capturedBlob;
    const documentImpl = {
        createElement(tagName) {
            assert.equal(tagName, 'a');
            effects.push('create');
            return link;
        },
        body: {
            appendChild(node) {
                assert.equal(node, link);
                effects.push('append');
            },
            removeChild(node) {
                assert.equal(node, link);
                effects.push('remove');
            }
        }
    };
    const urlImpl = {
        createObjectURL(blob) {
            capturedBlob = blob;
            effects.push('object-url');
            return 'blob:test-export';
        },
        revokeObjectURL(url) {
            assert.equal(url, 'blob:test-export');
            effects.push('revoke');
        }
    };

    downloadBrowserFile('export payload', 'application/json;charset=utf-8', 'ProjectExport_Test.json', {
        BlobImpl: Blob,
        documentImpl,
        urlImpl
    });

    assert.equal(link.href, 'blob:test-export');
    assert.equal(link.download, 'ProjectExport_Test.json');
    assert.equal(capturedBlob.type, 'application/json;charset=utf-8');
    assert.equal(await capturedBlob.text(), 'export payload');
    assert.deepEqual(effects, ['create', 'object-url', 'append', 'click', 'remove', 'revoke']);
});
