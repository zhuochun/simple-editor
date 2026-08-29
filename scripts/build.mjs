import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { minify } from 'html-minifier-terser';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const outputDirectory = path.join(repositoryRoot, 'dist');

if (path.dirname(outputDirectory) !== repositoryRoot || path.basename(outputDirectory) !== 'dist') {
    throw new Error(`Refusing to replace unexpected output directory: ${outputDirectory}`);
}

await rm(outputDirectory, { recursive: true, force: true });
await Promise.all([
    mkdir(path.join(outputDirectory, 'assets'), { recursive: true }),
    mkdir(path.join(outputDirectory, 'examples'), { recursive: true })
]);

await Promise.all([
    build({
        entryPoints: [path.join(repositoryRoot, 'src/app/main.js')],
        outfile: path.join(outputDirectory, 'assets/app.js'),
        bundle: true,
        charset: 'utf8',
        format: 'esm',
        legalComments: 'none',
        minify: true,
        platform: 'browser',
        sourcemap: false,
        target: ['es2022']
    }),
    build({
        entryPoints: [path.join(repositoryRoot, 'styles/app.css')],
        outfile: path.join(outputDirectory, 'assets/app.css'),
        bundle: true,
        legalComments: 'none',
        minify: true,
        sourcemap: false
    }),
    copyFile(
        path.join(repositoryRoot, 'assets/favicon.ico'),
        path.join(outputDirectory, 'assets/favicon.ico')
    ),
    copyFile(
        path.join(repositoryRoot, 'examples/new-onboarding.json'),
        path.join(outputDirectory, 'examples/new-onboarding.json')
    ),
    writeFile(path.join(outputDirectory, '.nojekyll'), '', 'utf8')
]);

const sourceHtml = await readFile(path.join(repositoryRoot, 'index.html'), 'utf8');
const productionHtml = sourceHtml
    .replace('href="styles/app.css"', 'href="assets/app.css"')
    .replace('src="src/app/main.js"', 'src="assets/app.js"');

if (productionHtml === sourceHtml || productionHtml.includes('src/app/main.js')) {
    throw new Error('Production HTML entry-point replacement failed.');
}

const minifiedHtml = await minify(productionHtml, {
    collapseWhitespace: true,
    removeAttributeQuotes: true,
    removeComments: true,
    removeRedundantAttributes: true,
    useShortDoctype: true
});

await writeFile(path.join(outputDirectory, 'index.html'), `${minifiedHtml}\n`, 'utf8');

async function listFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = await Promise.all(entries.map(async (entry) => {
        const entryPath = path.join(directory, entry.name);
        return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
    }));
    return files.flat();
}

const outputFiles = await listFiles(outputDirectory);
const sourceMaps = outputFiles.filter((file) => file.endsWith('.map'));
if (sourceMaps.length > 0) {
    throw new Error(`Source maps must not be published: ${sourceMaps.join(', ')}`);
}

console.log(`Built ${outputFiles.length} production files in ${outputDirectory}`);
