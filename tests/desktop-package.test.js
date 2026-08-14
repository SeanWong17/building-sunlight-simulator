const assert = require('node:assert/strict');
const { readFile, stat } = require('node:fs/promises');
const path = require('node:path');
const { test } = require('node:test');

const projectRoot = path.resolve(__dirname, '..');

test('desktop preparation contains only the declared runtime surface', async () => {
    const manifest = JSON.parse(await readFile(path.join(projectRoot, 'dist', 'desktop-manifest.json'), 'utf8'));
    assert.equal(manifest.schemaVersion, 1);
    assert.deepEqual(manifest.entrypoints, ['index.html', 'editor.html']);
    assert.ok(manifest.files.some(entry => entry.path === 'vendor/three-r128/LICENSE'));
    assert.ok(manifest.files.every(entry => !entry.path.startsWith('tests/')));
    assert.equal(await stat(path.join(projectRoot, 'dist', 'README.md')).catch(() => null), null);
});
