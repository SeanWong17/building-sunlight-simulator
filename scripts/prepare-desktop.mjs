import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const outputDirectory = path.join(projectRoot, 'dist');
const runtimeEntries = [
    'index.html',
    'editor.html',
    'css',
    'js',
    'vendor/three-r128',
    'examples/sample.json',
    'examples/sample_data.js'
];
const requiredRuntimeFiles = [
    'index.html',
    'editor.html',
    'css/viewer.css',
    'css/editor.css',
    'css/desktop.css',
    'js/viewer.js',
    'js/editor.js',
    'js/sunlight-worker.js',
    'vendor/three-r128/three.min.js'
];

if (path.dirname(outputDirectory) !== projectRoot || path.basename(outputDirectory) !== 'dist') {
    throw new Error(`Refusing to replace unexpected output directory: ${outputDirectory}`);
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const entry of runtimeEntries) {
    const source = path.join(projectRoot, entry);
    const destination = path.join(outputDirectory, entry);
    const sourceStat = await stat(source);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(source, destination, { recursive: sourceStat.isDirectory() });
}

for (const entry of requiredRuntimeFiles) {
    const destination = path.join(outputDirectory, entry);
    const entryStat = await stat(destination).catch(() => null);
    if (!entryStat?.isFile()) {
        throw new Error(`Desktop frontend is missing required runtime file: ${entry}`);
    }
}

const packageJson = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'));
const runtimeFiles = [];
for (const entry of runtimeEntries) {
    const source = path.join(projectRoot, entry);
    const entryStat = await stat(source);
    if (entryStat.isFile()) {
        runtimeFiles.push({ path: entry, bytes: entryStat.size });
        continue;
    }
    const pending = [entry];
    while (pending.length > 0) {
        const relative = pending.pop();
        const fullPath = path.join(projectRoot, relative);
        const childStat = await stat(fullPath);
        if (childStat.isDirectory()) {
            const children = await readdir(fullPath);
            for (const child of children.sort().reverse()) {
                pending.push(path.join(relative, child));
            }
        } else {
            runtimeFiles.push({ path: relative.replaceAll(path.sep, '/'), bytes: childStat.size });
        }
    }
}
runtimeFiles.sort((left, right) => left.path.localeCompare(right.path));

await writeFile(
    path.join(outputDirectory, 'desktop-manifest.json'),
    `${JSON.stringify({
        schemaVersion: 1,
        appVersion: packageJson.version,
        entrypoints: ['index.html', 'editor.html'],
        files: runtimeFiles
    }, null, 2)}\n`,
    'utf8'
);

const totalBytes = runtimeFiles.reduce((sum, entry) => sum + entry.bytes, 0);
console.log(
    `Prepared desktop frontend in ${path.relative(projectRoot, outputDirectory)}/ ` +
    `(${runtimeFiles.length} files, ${totalBytes} source bytes)`
);
