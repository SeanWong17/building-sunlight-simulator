import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const distDirectory = path.join(projectRoot, 'dist');

const requiredFiles = [
    'index.html',
    'editor.html',
    'css/viewer.css',
    'css/editor.css',
    'css/desktop.css',
    'js/config.js',
    'js/utils.js',
    'js/cities.js',
    'js/i18n.js',
    'js/sunlight-worker.js',
    'js/viewer.js',
    'js/editor.js',
    'js/desktop.js',
    'vendor/three-r128/three.min.js',
    'vendor/three-r128/OrbitControls.js',
    'vendor/three-r128/LICENSE',
    'examples/sample.json',
    'examples/sample_data.js',
    'desktop-manifest.json'
];

const missing = [];
for (const relative of requiredFiles) {
    const entry = await stat(path.join(distDirectory, relative)).catch(() => null);
    if (!entry?.isFile()) missing.push(relative);
}
if (missing.length > 0) {
    throw new Error(`Desktop package is missing required files: ${missing.join(', ')}`);
}

const packageJson = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'));
const tauriConfig = JSON.parse(await readFile(path.join(projectRoot, 'src-tauri', 'tauri.conf.json'), 'utf8'));
const cargoToml = await readFile(path.join(projectRoot, 'src-tauri', 'Cargo.toml'), 'utf8');
const cargoVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
if (tauriConfig.version !== packageJson.version || cargoVersion !== packageJson.version) {
    throw new Error(
        `Desktop versions disagree: package=${packageJson.version}, ` +
        `tauri=${tauriConfig.version}, cargo=${cargoVersion ?? '<missing>'}`
    );
}
const manifest = JSON.parse(await readFile(path.join(distDirectory, 'desktop-manifest.json'), 'utf8'));
if (manifest.schemaVersion !== 1 || manifest.appVersion !== packageJson.version) {
    throw new Error('Desktop manifest does not match package.json');
}
if (!Array.isArray(manifest.entrypoints) || manifest.entrypoints.length !== 2) {
    throw new Error('Desktop manifest has unexpected entrypoints');
}

const forbidden = ['README.md', 'README_en.md', 'tests', 'scripts', 'src-tauri'];
const forbiddenPaths = [];
for (const entry of forbidden) {
    if (await stat(path.join(distDirectory, entry)).catch(() => null)) forbiddenPaths.push(entry);
}
if (forbiddenPaths.length > 0) {
    throw new Error(`Desktop package contains development files: ${forbiddenPaths.join(', ')}`);
}

const sourceBytes = manifest.files.reduce((sum, entry) => sum + entry.bytes, 0);
console.log(`Verified desktop package: ${manifest.files.length} files, ${sourceBytes} source bytes`);
