import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

async function collectTests(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const tests = [];

    for (const entry of entries) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            tests.push(...await collectTests(entryPath));
        } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
            tests.push(entryPath);
        }
    }

    return tests;
}

const tests = (await collectTests('tests')).sort();
if (tests.length === 0) {
    throw new Error('No unit test files were found.');
}

const result = spawnSync(process.execPath, ['--test', ...tests], { stdio: 'inherit' });
process.exit(result.status ?? 1);
