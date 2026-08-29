import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

async function collectJavaScript(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...await collectJavaScript(entryPath));
        } else if (entry.isFile() && /\.(?:js|mjs)$/.test(entry.name)) {
            files.push(entryPath);
        }
    }

    return files;
}

function run(command, args) {
    const result = spawnSync(command, args, { stdio: 'inherit' });
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

const syntaxFiles = [
    'playwright.config.js',
    ...await collectJavaScript('scripts'),
    ...await collectJavaScript('src'),
    ...await collectJavaScript('tests')
].sort();

for (const file of syntaxFiles) {
    run(process.execPath, ['--check', file]);
}

const npmCli = process.env.npm_execpath;
if (npmCli) {
    run(process.execPath, [npmCli, 'test']);
    run(process.execPath, [npmCli, 'run', 'test:browser']);
} else {
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    run(npmCommand, ['test']);
    run(npmCommand, ['run', 'test:browser']);
}
