'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const projectRoot = path.join(__dirname, '..');
let baseUrl = process.env.TEST_BASE_URL || '';

const CONTENT_TYPES = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg'
};

async function startStaticServer() {
    const server = http.createServer((request, response) => {
        try {
            const requestPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
            const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
            const filePath = path.resolve(projectRoot, relativePath);
            if (filePath !== projectRoot && !filePath.startsWith(`${projectRoot}${path.sep}`)) {
                response.writeHead(403).end('Forbidden');
                return;
            }
            if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
                response.writeHead(404).end('Not found');
                return;
            }
            response.writeHead(200, {
                'Content-Type': CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
            });
            if (request.method === 'HEAD') response.end();
            else fs.createReadStream(filePath).pipe(response);
        } catch (error) {
            response.writeHead(500).end(error.message);
        }
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
    return server;
}

function projectJson(overrides = {}) {
    return JSON.stringify({
        version: '3.0.0',
        latitude: 36.65,
        longitude: 117.12,
        timeZone: 'Asia/Shanghai',
        northAngle: 0,
        scaleRatio: 1,
        origin: { x: 0, y: 0 },
        buildings: [{
            name: 'Test Building',
            floors: 1,
            floorHeight: 3,
            units: 1,
            isThisCommunity: true,
            shape: [
                { x: -5, y: -4 },
                { x: 5, y: -4 },
                { x: 5, y: 4 },
                { x: -5, y: 4 }
            ]
        }],
        ...overrides
    });
}

async function waitForLoadingCycle(page, selector) {
    await page.waitForFunction(
        selector => document.querySelector(selector)?.classList.contains('is-active'),
        selector
    );
    await page.waitForFunction(
        selector => {
            const overlay = document.querySelector(selector);
            if (!overlay || overlay.classList.contains('is-active')) return false;
            const style = getComputedStyle(overlay);
            return style.visibility === 'hidden' && Number.parseFloat(style.opacity) <= 0.01;
        },
        selector
    );
}

async function uploadJson(page, content, name = 'project.json') {
    await page.locator('#jsonInput').setInputFiles({
        name,
        mimeType: 'application/json',
        buffer: Buffer.from(content)
    });
    await waitForLoadingCycle(page, '#loadingOverlay');
}

async function dropFile(page, selector, { name, mimeType, content }) {
    await page.evaluate(({ selector, name, mimeType, content }) => {
        const target = document.querySelector(selector);
        const transfer = new DataTransfer();
        transfer.items.add(new File([content], name, { type: mimeType }));
        const dispatch = type => target.dispatchEvent(new DragEvent(type, {
            bubbles: true,
            cancelable: true,
            dataTransfer: transfer
        }));
        dispatch('dragenter');
        dispatch('dragover');
        dispatch('drop');
    }, { selector, name, mimeType, content });
    const loadingSelector = await page.locator('#loadingOverlay').count()
        ? '#loadingOverlay'
        : '#editorLoadingOverlay';
    await waitForLoadingCycle(page, loadingSelector);
}

async function calculateAverageHours(page, useWorker = true) {
    if (!useWorker) {
        await page.evaluate(() => {
            window.__nativeWorkerForTest = window.Worker;
            window.Worker = undefined;
        });
    }

    try {
        await page.locator('#calcSunlightBtn').click();
        await page.waitForFunction(
            () => !document.getElementById('toggleHeatmap').disabled,
            null,
            { timeout: 30000 }
        );
        const averageText = await page.locator('#sunlightStats .stats-section')
            .first()
            .locator('.stat-row')
            .nth(2)
            .locator('.stat-value')
            .textContent();
        return Number.parseFloat(averageText);
    } finally {
        if (!useWorker) {
            await page.evaluate(() => {
                window.Worker = window.__nativeWorkerForTest;
                delete window.__nativeWorkerForTest;
            });
        }
    }
}

async function blockExternalRequests(page) {
    const allowedOrigin = new URL(baseUrl).origin;
    const blocked = [];
    await page.route('**/*', route => {
        const requestUrl = route.request().url();
        if (/^https?:/i.test(requestUrl) && new URL(requestUrl).origin !== allowedOrigin) {
            blocked.push(requestUrl);
            return route.abort();
        }
        return route.continue();
    });
    return blocked;
}

async function checkCanvasPixels(page) {
    await page.waitForTimeout(400);
    return page.evaluate(() => new Promise(resolve => {
        const timeControl = document.getElementById('timeSlider');
        timeControl?.dispatchEvent(new Event('input', { bubbles: true }));
        requestAnimationFrame(() => {
            const canvas = document.querySelector('#canvas-container canvas');
            const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
            if (!canvas || !gl) {
                resolve({ nonZero: 0, distinct: 0 });
                return;
            }
            const pixels = new Uint8Array(canvas.width * canvas.height * 4);
            gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            let nonZero = 0;
            const colors = new Set();
            const pixelStride = Math.max(1, Math.floor((canvas.width * canvas.height) / 50000));
            for (let index = 0; index < pixels.length; index += 4 * pixelStride) {
                if (pixels[index] || pixels[index + 1] || pixels[index + 2] || pixels[index + 3]) nonZero++;
                colors.add(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]},${pixels[index + 3]}`);
            }
            resolve({ nonZero, distinct: colors.size });
        });
    }));
}

async function testViewer(browser) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const blockedExternalRequests = await blockExternalRequests(page);
    const consoleErrors = [];
    const workerFallbacks = [];
    page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
        if (message.text().includes('Worker unavailable')) workerFallbacks.push(message.text());
    });
    page.on('pageerror', error => consoleErrors.push(error.message));

    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#canvas-container canvas');
    assert.equal(await page.locator('#longitudeInput').inputValue(), '117.12');
    assert.equal(await page.locator('#timeZoneInput').inputValue(), 'Asia/Shanghai');
    assert.equal(await page.locator('script[src^="http"]').count(), 0);

    const narrowProject = JSON.parse(projectJson());
    narrowProject.buildings[0].units = 3;
    narrowProject.buildings[0].unitRatiosPerFloor = [[0.499, 0.002, 0.499]];
    await uploadJson(page, JSON.stringify(narrowProject), 'narrow-units.json');
    await calculateAverageHours(page, true);
    const narrowDownloadPromise = page.waitForEvent('download');
    await page.evaluate(() => { window.showSaveFilePicker = undefined; });
    await page.locator('#exportAnalysisBtn').click();
    const narrowDownload = await narrowDownloadPromise;
    const narrowExport = JSON.parse(fs.readFileSync(await narrowDownload.path(), 'utf8'));
    assert.equal(narrowExport.precomputedSunlight.entries[0].pointCount, 8);

    await page.locator('#timeSlider').evaluate(element => {
        element.value = '10.1';
        element.dispatchEvent(new Event('input', { bubbles: true }));
    });
    assert.equal(await page.locator('#timeText').textContent(), '10:06');

    await page.locator('#citySelect').selectOption('悉尼');
    const southernLabels = await page.locator('#seasonSelect option').allTextContents();
    assert.match(southernLabels[0], /夏至|Summer Solstice/);
    assert.match(southernLabels[2], /冬至|Winter Solstice/);
    await page.locator('#citySelect').selectOption('济南');

    const invalidDialogPromise = page.waitForEvent('dialog');
    const invalidUploadPromise = uploadJson(page, projectJson({
        buildings: [{
            name: 'Crossing',
            floors: 1,
            floorHeight: 3,
            units: 1,
            shape: [{ x: 0, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }, { x: 4, y: 0 }]
        }]
    }), 'invalid.json');
    const invalidDialogEvent = await invalidDialogPromise;
    const invalidDialog = invalidDialogEvent.message();
    await invalidDialogEvent.accept();
    await invalidUploadPromise;
    assert.match(invalidDialog, /无效|Invalid/);

    const invalidHeightDialogPromise = page.waitForEvent('dialog');
    const invalidHeightUploadPromise = uploadJson(page, projectJson({
        buildings: [{
            name: 'Invalid Height',
            floors: 2,
            floorHeight: 3,
            totalHeight: 1,
            units: 1,
            shape: [{ x: -5, y: -4 }, { x: 5, y: -4 }, { x: 5, y: 4 }, { x: -5, y: 4 }]
        }]
    }), 'invalid-height.json');
    const invalidHeightDialog = await invalidHeightDialogPromise;
    assert.match(invalidHeightDialog.message(), /无效|Invalid/);
    await invalidHeightDialog.accept();
    await invalidHeightUploadPromise;

    await page.evaluate(() => {
        window.__heatmapConstruction = { planeGeometries: 0, instancedMeshes: 0, instanceCapacity: 0 };
        window.__originalPlaneGeometry = THREE.PlaneGeometry;
        window.__originalInstancedMesh = THREE.InstancedMesh;
        window.__originalCanvasTexture = THREE.CanvasTexture;
        window.__facadeTextureInspection = null;
        THREE.PlaneGeometry = class CountingPlaneGeometry extends window.__originalPlaneGeometry {
            constructor(...args) {
                super(...args);
                window.__heatmapConstruction.planeGeometries++;
            }
        };
        THREE.InstancedMesh = class CountingInstancedMesh extends window.__originalInstancedMesh {
            constructor(geometry, material, count) {
                super(geometry, material, count);
                window.__heatmapConstruction.instancedMeshes++;
                window.__heatmapConstruction.instanceCapacity = count;
            }
        };
        THREE.CanvasTexture = class InspectableCanvasTexture extends window.__originalCanvasTexture {
            constructor(image, ...args) {
                super(image, ...args);
                if (image?.height === 56 && image?.width > 256) {
                    window.__facadeTextureInspection = { canvas: image, texture: this };
                }
            }
        };
    });

    await uploadJson(page, projectJson({
        northAngle: 90,
        buildings: [{
            name: 'Variable Apartments',
            floors: 2,
            floorHeight: 3,
            totalHeight: 6,
            units: 2,
            unitsPerFloor: [1, 2],
            unitRatiosPerFloor: [[1], [1, 1]],
            unitSplitAngleDeg: 30,
            isThisCommunity: true,
            shape: [{ x: -5, y: -4 }, { x: 5, y: -4 }, { x: 5, y: 4 }, { x: -5, y: 4 }]
        }]
    }), 'variable-apartments.json');
    assert.equal(await page.locator('#northAngleInput').inputValue(), '90');
    const facadeBands = await page.evaluate(() => {
        const inspection = window.__facadeTextureInspection;
        if (!inspection) return null;
        const { canvas, texture } = inspection;
        const context = canvas.getContext('2d');
        const x = Math.round(canvas.width / 2);
        const luminanceAt = y => {
            const pixel = context.getImageData(x, y, 1, 1).data;
            return pixel[0] * 0.2126 + pixel[1] * 0.7152 + pixel[2] * 0.0722;
        };
        return {
            flipY: texture.flipY,
            topLuminance: luminanceAt(Math.floor(canvas.height * 0.25)),
            bottomLuminance: luminanceAt(Math.floor(canvas.height * 0.75))
        };
    });
    assert.ok(facadeBands, 'Facade texture was not captured');
    assert.equal(facadeBands.flipY, true);
    assert.ok(
        facadeBands.topLuminance + 30 < facadeBands.bottomLuminance,
        JSON.stringify(facadeBands)
    );
    await page.locator('#referenceHoursInput').fill('4');
    await page.locator('#referenceHoursInput').dispatchEvent('change');
    await page.locator('#calcSunlightBtn').click();
    await page.waitForFunction(() => !document.getElementById('toggleHeatmap').disabled, null, { timeout: 30000 });
    const scopeRows = page.locator('#sunlightStats .stats-section').first().locator('.stat-row');
    assert.equal(await scopeRows.nth(1).locator('.stat-value').textContent(), '3');
    assert.match(await page.locator('#sunlightStats').textContent(), /4h/);
    assert.match(await page.locator('#sunlightStats').textContent(), /可视化估算|visualization estimate/i);
    assert.doesNotMatch(await page.locator('#sunlightStats').textContent(), /不达标|below.standard/i);
    const constructionBeforeToggle = await page.evaluate(() => ({ ...window.__heatmapConstruction }));
    assert.equal(constructionBeforeToggle.planeGeometries, 1);
    assert.equal(constructionBeforeToggle.instancedMeshes, 1);
    assert.ok(constructionBeforeToggle.instanceCapacity >= 3);
    const heatmapScreenshot = await page.screenshot({ path: '/tmp/sunlight-heatmap-instanced.png' });
    assert.ok(heatmapScreenshot.length > 10000);
    const heatmapPixels = await checkCanvasPixels(page);
    assert.ok(heatmapPixels.distinct > 1, JSON.stringify(heatmapPixels));
    await page.locator('#toggleHeatmap').uncheck();
    await page.locator('#toggleHeatmap').check();
    assert.deepEqual(await page.evaluate(() => ({ ...window.__heatmapConstruction })), constructionBeforeToggle);
    await page.evaluate(() => {
        THREE.PlaneGeometry = window.__originalPlaneGeometry;
        THREE.InstancedMesh = window.__originalInstancedMesh;
        THREE.CanvasTexture = window.__originalCanvasTexture;
    });

    await uploadJson(page, projectJson(), 'worker-clear-sky.json');
    const clearWorkerHours = await calculateAverageHours(page, true);
    const clearMainHours = await calculateAverageHours(page, false);
    assert.ok(clearWorkerHours > 0, `Expected positive clear-sky hours, got ${clearWorkerHours}`);
    assert.equal(clearWorkerHours, clearMainHours);

    await uploadJson(page, projectJson(), 'precomputed-custom-date.json');
    await page.locator('#seasonSelect').selectOption('custom');
    await page.locator('#customDateInput').fill('2026-05-15');
    await page.locator('#customDateInput').dispatchEvent('change');
    const precomputedHours = await calculateAverageHours(page, true);
    console.log('Viewer: exporting precomputed result');

    await page.evaluate(() => {
        try {
            Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true });
        } catch (error) {
            window.showSaveFilePicker = undefined;
        }
    });
    assert.equal(await page.locator('#exportAnalysisBtn').isEnabled(), true);
    const analysisDownloadPromise = page.waitForEvent('download');
    await page.locator('#exportAnalysisBtn').click();
    const analysisDownload = await analysisDownloadPromise;
    const precomputedProjectText = fs.readFileSync(await analysisDownload.path(), 'utf8');
    const precomputedProject = JSON.parse(precomputedProjectText);
    console.log('Viewer: importing precomputed result');
    assert.equal(precomputedProject.precomputedSunlight.schemaVersion, 1);
    assert.match(precomputedProject.precomputedSunlight.algorithmVersion, /^3\.2\.0-/);
    assert.equal(precomputedProject.precomputedSunlight.entries.length, 1);
    const precomputedEntry = precomputedProject.precomputedSunlight.entries[0];
    assert.equal(precomputedEntry.hours.length, precomputedEntry.pointCount);
    assert.equal(precomputedEntry.identity.date, '2026-05-15');
    assert.match(precomputedEntry.identity.projectFingerprint, /^[0-9a-f]{16}$/);
    assert.match(precomputedEntry.samplingFingerprint, /^[0-9a-f]{16}$/);
    assert.deepEqual(precomputedProject.precomputedSunlight.activeSelection, {
        key: precomputedEntry.key,
        seasonPreset: 'custom',
        date: precomputedEntry.identity.date
    });

    await page.locator('#seasonSelect').selectOption('december-solstice');
    assert.equal(await page.locator('#toggleHeatmap').isDisabled(), true);
    await uploadJson(page, precomputedProjectText, 'precomputed-project.json');
    assert.equal(await page.locator('#seasonSelect').inputValue(), 'custom');
    assert.equal(await page.locator('#customDateInput').inputValue(), '2026-05-15');
    assert.equal(await page.locator('#customDatePicker').isVisible(), true);
    assert.equal(await page.locator('#toggleHeatmap').isEnabled(), true);
    assert.match(await page.locator('#precomputedStatus').textContent(), /预计算|precomputed/i);
    const importedAverage = Number.parseFloat(await page.locator('#sunlightStats .stats-section')
        .first().locator('.stat-row').nth(2).locator('.stat-value').textContent());
    assert.equal(importedAverage, precomputedHours);

    await page.locator('#referenceHoursInput').fill('3.5');
    await page.locator('#referenceHoursInput').dispatchEvent('change');
    assert.equal(await page.locator('#toggleHeatmap').isEnabled(), true);
    assert.match(await page.locator('#sunlightStats').textContent(), /3\.5h/);

    await page.locator('#northAngleInput').fill('15');
    await page.locator('#northAngleInput').dispatchEvent('change');
    assert.equal(await page.locator('#toggleHeatmap').isDisabled(), true);
    assert.equal(await page.locator('#exportAnalysisBtn').isDisabled(), true);
    await page.locator('#northAngleInput').fill('0');
    await page.locator('#northAngleInput').dispatchEvent('change');
    assert.equal(await page.locator('#toggleHeatmap').isEnabled(), true);
    assert.equal(await page.locator('#exportAnalysisBtn').isEnabled(), true);

    const staleSamplingProject = JSON.parse(precomputedProjectText);
    staleSamplingProject.precomputedSunlight.entries[0].samplingFingerprint = '0000000000000000';
    await uploadJson(page, JSON.stringify(staleSamplingProject), 'stale-sampling-project.json');
    assert.equal(await page.locator('#toggleHeatmap').isDisabled(), true);
    assert.match(await page.locator('#precomputedStatus').textContent(), /不匹配|ignored/i);

    const staleProject = JSON.parse(precomputedProjectText);
    staleProject.buildings[0].shape[0].x += 0.5;
    await uploadJson(page, JSON.stringify(staleProject), 'stale-precomputed-project.json');
    assert.equal(await page.locator('#toggleHeatmap').isDisabled(), true);
    assert.match(await page.locator('#precomputedStatus').textContent(), /不匹配|ignored/i);

    await dropFile(page, 'body', {
        name: 'dropped-precomputed-project.json',
        mimeType: 'application/json',
        content: precomputedProjectText
    });
    assert.equal(await page.locator('#toggleHeatmap').isEnabled(), true);
    console.log('Viewer: precomputed result workflow passed');

    await page.locator('#seasonSelect').selectOption('december-solstice');
    const partialOcclusionProject = JSON.parse(projectJson());
    partialOcclusionProject.buildings.push({
        name: 'Partial Occluder',
        floors: 1,
        floorHeight: 4,
        totalHeight: 4,
        units: 1,
        isThisCommunity: false,
        shape: [
            { x: -100, y: 8 },
            { x: 100, y: 8 },
            { x: 100, y: 10 },
            { x: -100, y: 10 }
        ]
    });
    await uploadJson(page, JSON.stringify(partialOcclusionProject), 'worker-partial-occlusion.json');
    const partialWorkerHours = await calculateAverageHours(page, true);
    const partialMainHours = await calculateAverageHours(page, false);
    assert.ok(partialWorkerHours > 0, `Expected positive partial-occlusion hours, got ${partialWorkerHours}`);
    assert.ok(
        partialWorkerHours < clearWorkerHours,
        `Expected ${partialWorkerHours}h to be below clear-sky ${clearWorkerHours}h`
    );
    assert.equal(partialWorkerHours, partialMainHours);

    const distantOccluders = [
        [[2495, -10000], [2510, -10000], [2510, 10000], [2495, 10000]],
        [[-2510, -10000], [-2495, -10000], [-2495, 10000], [-2510, 10000]],
        [[-10000, 2495], [10000, 2495], [10000, 2510], [-10000, 2510]],
        [[-10000, -2510], [10000, -2510], [10000, -2495], [-10000, -2495]]
    ].map((coordinates, index) => ({
        name: `Distant Occluder ${index + 1}`,
        floors: 300,
        floorHeight: 20,
        totalHeight: 6000,
        units: 1,
        isThisCommunity: false,
        shape: coordinates.map(([x, y]) => ({ x, y }))
    }));
    await uploadJson(page, projectJson({
        buildings: [
            {
                name: 'Distant Occlusion Target',
                floors: 1,
                floorHeight: 3,
                totalHeight: 3,
                units: 1,
                isThisCommunity: true,
                shape: [{ x: -5, y: -4 }, { x: 5, y: -4 }, { x: 5, y: 4 }, { x: -5, y: 4 }]
            },
            ...distantOccluders
        ]
    }), 'distant-occluders.json');
    const distantWorkerHours = await calculateAverageHours(page, true);
    const distantMainHours = await calculateAverageHours(page, false);
    assert.equal(distantWorkerHours, 0);
    assert.equal(distantMainHours, 0);

    await uploadJson(page, projectJson(), 'small.json');
    console.log('Viewer: performance and cancellation checks');
    await page.waitForTimeout(200);

    await page.evaluate(() => {
        window.__disposeCounts = { geometry: 0, material: 0, texture: 0, roof: 0 };
        const wrap = (prototype, key, type) => {
            const original = prototype[key];
            prototype[key] = function wrappedDispose(...args) {
                window.__disposeCounts[type]++;
                if (type === 'material' && this.color?.getHex?.() === CONFIG.MATERIALS.ROOF_COLOR && !this.map) {
                    window.__disposeCounts.roof++;
                }
                return original.apply(this, args);
            };
        };
        wrap(THREE.BufferGeometry.prototype, 'dispose', 'geometry');
        wrap(THREE.Material.prototype, 'dispose', 'material');
        wrap(THREE.Texture.prototype, 'dispose', 'texture');
    });

    await page.locator('#northAngleInput').fill('15');
    await page.locator('#northAngleInput').dispatchEvent('change');
    const disposeCounts = await page.evaluate(() => window.__disposeCounts);
    assert.ok(disposeCounts.geometry >= 2, JSON.stringify(disposeCounts));
    assert.ok(disposeCounts.material >= 3, JSON.stringify(disposeCounts));
    assert.ok(disposeCounts.texture >= 2, JSON.stringify(disposeCounts));
    assert.equal(disposeCounts.roof, 0, JSON.stringify(disposeCounts));

    await page.locator('#calcSunlightBtn').click();
    await page.waitForFunction(() => !document.getElementById('toggleHeatmap').disabled, null, { timeout: 30000 });
    assert.equal(workerFallbacks.length, 0, workerFallbacks.join('\n'));
    assert.equal(await page.locator('#sunlightStats').isVisible(), true);

    const large = JSON.parse(projectJson());
    large.buildings[0].floors = 190;
    large.buildings[0].units = 50;
    large.buildings[0].totalHeight = 570;
    await uploadJson(page, JSON.stringify(large), 'large.json');
    await page.locator('#calcSunlightBtn').click();
    await page.locator('#citySelect').selectOption('悉尼');
    await page.waitForFunction(() => !document.getElementById('calcSunlightBtn').disabled, null, { timeout: 10000 });
    assert.equal(await page.locator('#toggleHeatmap').isDisabled(), true);

    await page.locator('#citySelect').selectOption('济南');
    await page.locator('#calcSunlightBtn').click();
    await page.locator('#cancelSunlightBtn').click();
    await page.waitForFunction(() => !document.getElementById('calcSunlightBtn').disabled, null, { timeout: 10000 });
    assert.equal(await page.locator('#toggleHeatmap').isDisabled(), true);

    const maximum = JSON.parse(projectJson());
    maximum.buildings[0].floors = 300;
    maximum.buildings[0].units = 50;
    maximum.buildings[0].totalHeight = 900;
    await uploadJson(page, JSON.stringify(maximum), 'maximum.json');
    let complexityMessage = '';
    const complexityDialogHandled = new Promise(resolve => {
        page.once('dialog', async dialog => {
            complexityMessage = dialog.message();
            await dialog.accept();
            resolve();
        });
    });
    await Promise.all([page.locator('#calcSunlightBtn').click(), complexityDialogHandled]);
    assert.match(complexityMessage, /复杂|exceeds/i);
    await page.waitForFunction(() => !document.getElementById('calcSunlightBtn').disabled, null, { timeout: 10000 });

    await uploadJson(page, projectJson(), 'small-again.json');
    const desktopScreenshot = await page.screenshot({ path: '/tmp/sunlight-viewer-desktop.png' });
    assert.ok(desktopScreenshot.length > 10000);
    const desktopPixels = await checkCanvasPixels(page);
    assert.ok(desktopPixels.nonZero > 1000, JSON.stringify(desktopPixels));
    assert.ok(desktopPixels.distinct > 1, JSON.stringify(desktopPixels));

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    const mobileScreenshot = await page.screenshot({ path: '/tmp/sunlight-viewer-mobile.png' });
    assert.ok(mobileScreenshot.length > 10000);
    const mobilePixels = await checkCanvasPixels(page);
    assert.ok(mobilePixels.nonZero > 1000, JSON.stringify(mobilePixels));

    assert.deepEqual(blockedExternalRequests, []);
    assert.deepEqual(consoleErrors, []);
    await page.close();
}

async function testFileWorker(browser) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, offline: true });
    const page = await context.newPage();
    const errors = [];
    const workerFallbacks = [];
    page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text());
        if (message.text().includes('Worker unavailable')) workerFallbacks.push(message.text());
    });
    page.on('pageerror', error => errors.push(error.message));

    const fileUrl = pathToFileURL(path.join(projectRoot, 'index.html')).href;
    await page.goto(fileUrl, { waitUntil: 'networkidle' });
    await page.waitForSelector('#canvas-container canvas');
    assert.equal(await page.evaluate(() => typeof createSunlightAnalysisWorker), 'function');

    await uploadJson(page, projectJson(), 'file-mode.json');
    await page.locator('#calcSunlightBtn').click();
    await page.waitForFunction(() => !document.getElementById('toggleHeatmap').disabled, null, { timeout: 30000 });
    assert.equal(workerFallbacks.length, 0, workerFallbacks.join('\n'));
    assert.deepEqual(errors, []);
    await context.close();
}

async function testEditor(browser) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', error => errors.push(error.message));

    await page.goto(`${baseUrl}/editor.html`, { waitUntil: 'networkidle' });
    const firstImage = path.join(__dirname, '..', 'examples', 'editor.png');
    const secondImage = path.join(__dirname, '..', 'examples', 'vis.png');
    await page.locator('#fileInput').setInputFiles(firstImage);
    await page.waitForFunction(() => document.getElementById('editorCanvas').width > 0);
    await page.addScriptTag({ content: 'window.__TAURI_INTERNALS__ = {};' });
    await page.addScriptTag({ url: `${baseUrl}/js/desktop.js` });
    const leaveDialog = page.waitForEvent('dialog');
    const leaveClick = page.locator('.desktop-view-tabs a[href="index.html"]').click();
    await (await leaveDialog).dismiss();
    await leaveClick;
    assert.match(page.url(), /editor\.html$/);
    assert.equal(await page.locator('#editorCanvas').isVisible(), true);
    await page.locator('.desktop-view-tabs').evaluate(element => element.remove());
    assert.equal(await page.locator('#projectLon').inputValue(), '117.12');
    assert.equal(await page.locator('#projectTimeZone').inputValue(), 'Asia/Shanghai');

    await page.locator('#btnStartScale').click();
    const canvas = page.locator('#editorCanvas');
    let box = await canvas.boundingBox();
    assert.ok(box);
    await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.45);
    await page.mouse.click(box.x + box.width * 0.65, box.y + box.height * 0.45);
    await page.locator('#btnConfirmScale').click();
    assert.equal(await page.locator('#scaleStatus').getAttribute('data-i18n'), null);

    const transformBeforeSpaceDrag = await canvas.getAttribute('style');
    await page.keyboard.down('Space');
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.25);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.3);
    await page.mouse.up();
    await page.keyboard.up('Space');
    assert.notEqual(await canvas.getAttribute('style'), transformBeforeSpaceDrag);
    assert.equal(await page.locator('#btnFinishPolygon').isDisabled(), true);
    box = await canvas.boundingBox();

    const polygon = [
        [0.40, 0.40],
        [0.60, 0.40],
        [0.60, 0.60],
        [0.40, 0.60]
    ];
    for (const [xRatio, yRatio] of polygon.slice(0, 3)) {
        await page.mouse.click(box.x + box.width * xRatio, box.y + box.height * yRatio);
    }
    assert.equal(await page.locator('#btnFinishPolygon').isEnabled(), true);
    await page.locator('#btnUndoPoint').click();
    assert.equal(await page.locator('#btnFinishPolygon').isDisabled(), true);
    for (const [xRatio, yRatio] of polygon.slice(2)) {
        await page.mouse.click(box.x + box.width * xRatio, box.y + box.height * yRatio);
    }
    await page.locator('#btnFinishPolygon').click();
    await page.waitForFunction(() => document.querySelectorAll('#tableBody tr').length >= 2);

    await page.locator('.split-config-header .btn-mini').click();
    assert.equal(await page.locator('#splitEditorModal').isVisible(), true);
    await page.locator('#visualSplitAngleNumber').fill('45');
    await page.locator('#visualSplitAngleNumber').dispatchEvent('change');
    const visualRatioInputs = page.locator('#visualSplitInputs input');
    assert.equal(await visualRatioInputs.count(), 2);
    await page.locator('.visual-split-handle').first().focus();
    await page.locator('.visual-split-handle').first().press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('visual-split-handle')), true);
    await visualRatioInputs.first().fill('30');
    assert.equal(await visualRatioInputs.first().inputValue(), '30');
    await visualRatioInputs.first().press('Tab');
    assert.match(await page.locator('#visualSplitBar').textContent(), /30\.0%.*70\.0%/);
    await page.locator('#btnApplySplitAllFloors').click();
    await page.locator('#btnSaveSplitEditor').click();
    assert.equal(await page.locator('#splitEditorModal').isHidden(), true);
    assert.equal(await page.locator('.split-config-grid input[type="number"]').first().inputValue(), '45');
    assert.match(await page.locator('.split-config-grid textarea').inputValue(), /0\.3.*0\.7/);

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#btnExport').click();
    const download = await downloadPromise;
    const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.equal(exported.longitude, 117.12);
    assert.equal(exported.timeZone, 'Asia/Shanghai');
    assert.equal(exported.buildings.length, 1);
    assert.equal(exported.buildings[0].isThisCommunity, true);
    assert.equal(exported.buildings[0].unitSplitAngleDeg, 45);
    assert.deepEqual(exported.buildings[0].unitRatiosPerFloor, [[0.3, 0.7]]);

    await page.locator('#btnDrawMode').click();
    box = await canvas.boundingBox();
    const dragStart = { x: box.x + box.width * 0.5, y: box.y + box.height * 0.5 };
    await page.mouse.move(dragStart.x, dragStart.y);
    await page.mouse.down();
    await page.mouse.move(dragStart.x + 45, dragStart.y + 20);
    await page.mouse.up();
    assert.equal(await page.locator('#tableBody tr.building-row.is-selected').count(), 1);
    assert.equal(await page.locator('#btnUndoEdit').isEnabled(), true);

    const movedDownloadPromise = page.waitForEvent('download');
    await page.locator('#btnExport').click();
    const movedExport = JSON.parse(fs.readFileSync(await (await movedDownloadPromise).path(), 'utf8'));
    assert.notDeepEqual(movedExport.origin, exported.origin);

    await page.locator('#btnUndoEdit').click();
    const restoredDownloadPromise = page.waitForEvent('download');
    await page.locator('#btnExport').click();
    const restoredExportText = fs.readFileSync(await (await restoredDownloadPromise).path(), 'utf8');
    const restoredExport = JSON.parse(restoredExportText);
    assert.deepEqual(restoredExport.origin, exported.origin);
    assert.deepEqual(restoredExport.buildings[0].shape, exported.buildings[0].shape);

    await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.45);

    let dismissed = false;
    page.once('dialog', async dialog => {
        dismissed = true;
        assert.match(dialog.message(), /清除|clear/i);
        await dialog.dismiss();
    });
    await page.locator('#fileInput').setInputFiles(secondImage);
    await page.waitForTimeout(100);
    assert.equal(dismissed, true);
    assert.equal(await page.locator('#scaleStatus').getAttribute('data-i18n'), null);
    assert.ok(await page.locator('#tableBody tr').count() >= 2);

    page.once('dialog', dialog => dialog.accept());
    await page.locator('#fileInput').setInputFiles(secondImage);
    await page.waitForFunction(() => document.getElementById('scaleStatus').getAttribute('data-i18n') === 'editor.scaleNotSet');
    assert.equal(await page.locator('#tableBody tr').count(), 0);
    assert.equal(await page.locator('#scaleInputArea').isVisible(), false);
    assert.equal(await page.locator('#btnDrawMode').getAttribute('data-i18n'), 'editor.modeIdle');

    await dropFile(page, '#canvas-wrapper', {
        name: 'editable-project.json',
        mimeType: 'application/json',
        content: restoredExportText
    });
    assert.ok(await page.locator('#tableBody tr').count() >= 2);
    assert.equal(await page.locator('#scaleStatus').getAttribute('data-i18n'), null);
    assert.equal(await page.locator('#projectLon').inputValue(), '117.12');

    const sparseRatioProject = projectJson({
        buildings: [{
            name: 'Sparse Ratios',
            floors: 3,
            floorHeight: 3,
            units: 2,
            unitRatiosPerFloor: [[0.2, 0.8], null, [0.4, 0.6]],
            isThisCommunity: true,
            shape: [
                { x: -5, y: -4 },
                { x: 5, y: -4 },
                { x: 5, y: 4 },
                { x: -5, y: 4 }
            ]
        }]
    });
    const replaceProjectDialogPromise = page.waitForEvent('dialog');
    const sparseImportPromise = page.locator('#jsonImportInput').setInputFiles({
        name: 'sparse-ratios.json',
        mimeType: 'application/json',
        buffer: Buffer.from(sparseRatioProject)
    });
    const replaceProjectDialog = await replaceProjectDialogPromise;
    await replaceProjectDialog.accept();
    await sparseImportPromise;
    await waitForLoadingCycle(page, '#editorLoadingOverlay');
    let sparseRatioLines = (await page.locator('.split-config-grid textarea').inputValue()).split('\n');
    assert.deepEqual(sparseRatioLines, ['0.2, 0.8', '0.5, 0.5', '0.4, 0.6']);

    const sparseFloorInput = page.locator('#tableBody tr.building-row input[type="number"]').first();
    await sparseFloorInput.fill('4');
    await sparseFloorInput.dispatchEvent('change');
    sparseRatioLines = (await page.locator('.split-config-grid textarea').inputValue()).split('\n');
    assert.deepEqual(sparseRatioLines, ['0.2, 0.8', '0.5, 0.5', '0.4, 0.6', '0.4, 0.6']);

    const sparseDownloadPromise = page.waitForEvent('download');
    await page.locator('#btnExport').click();
    const sparseExport = JSON.parse(fs.readFileSync(await (await sparseDownloadPromise).path(), 'utf8'));
    assert.deepEqual(sparseExport.buildings[0].unitRatiosPerFloor, [
        [0.2, 0.8],
        [0.5, 0.5],
        [0.4, 0.6],
        [0.4, 0.6]
    ]);

    const fourUnitProject = projectJson({
        buildings: [{
            name: 'Four Units',
            floors: 1,
            floorHeight: 3,
            units: 4,
            isThisCommunity: true,
            shape: [
                { x: -5, y: -4 },
                { x: 5, y: -4 },
                { x: 5, y: 4 },
                { x: -5, y: 4 }
            ]
        }]
    });
    const fourUnitDialogPromise = page.waitForEvent('dialog');
    const fourUnitImportPromise = page.locator('#jsonImportInput').setInputFiles({
        name: 'four-units.json',
        mimeType: 'application/json',
        buffer: Buffer.from(fourUnitProject)
    });
    const fourUnitDialog = await fourUnitDialogPromise;
    await fourUnitDialog.accept();
    await fourUnitImportPromise;
    await waitForLoadingCycle(page, '#editorLoadingOverlay');
    await page.locator('.split-config-header .btn-mini').click();
    const fourUnitRatioInputs = page.locator('#visualSplitInputs input');
    await fourUnitRatioInputs.first().fill('98');
    await fourUnitRatioInputs.first().dispatchEvent('change');
    assert.deepEqual(await page.locator('#visualSplitInputs input').evaluateAll(inputs => inputs.map(input => ({
        value: input.value,
        min: input.min,
        max: input.max,
        valid: input.checkValidity()
    }))), [
        { value: '97.0', min: '1', max: '97', valid: true },
        { value: '1.0', min: '1', max: '97', valid: true },
        { value: '1.0', min: '1', max: '97', valid: true },
        { value: '1.0', min: '1', max: '97', valid: true }
    ]);
    await page.locator('#btnSaveSplitEditor').click();
    const fourUnitDownloadPromise = page.waitForEvent('download');
    await page.locator('#btnExport').click();
    const fourUnitExport = JSON.parse(fs.readFileSync(await (await fourUnitDownloadPromise).path(), 'utf8'));
    assert.deepEqual(fourUnitExport.buildings[0].unitRatiosPerFloor, [[0.97, 0.01, 0.01, 0.01]]);
    assert.deepEqual(errors, []);
    await page.close();
}

async function dispatchTouchTap(page, clientX, clientY) {
    await page.evaluate(({ clientX, clientY }) => {
        const target = document.getElementById('canvas-wrapper');
        const touch = new Touch({
            identifier: Date.now(),
            target,
            clientX,
            clientY,
            pageX: clientX,
            pageY: clientY,
            radiusX: 1,
            radiusY: 1,
            force: 0.5
        });
        target.dispatchEvent(new TouchEvent('touchstart', {
            bubbles: true,
            cancelable: true,
            touches: [touch],
            targetTouches: [touch],
            changedTouches: [touch]
        }));
        target.dispatchEvent(new TouchEvent('touchend', {
            bubbles: true,
            cancelable: true,
            touches: [],
            targetTouches: [],
            changedTouches: [touch]
        }));
    }, { clientX, clientY });
}

async function dispatchPinchGesture(page, centerX, centerY) {
    await page.evaluate(({ centerX, centerY }) => {
        const target = document.getElementById('canvas-wrapper');
        const makeTouch = (identifier, clientX, clientY) => new Touch({
            identifier,
            target,
            clientX,
            clientY,
            pageX: clientX,
            pageY: clientY,
            radiusX: 1,
            radiusY: 1,
            force: 0.5
        });
        const dispatch = (type, touches, changedTouches) => target.dispatchEvent(new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches,
            targetTouches: touches,
            changedTouches
        }));

        const first = makeTouch(101, centerX - 30, centerY);
        dispatch('touchstart', [first], [first]);
        const second = makeTouch(102, centerX + 30, centerY);
        dispatch('touchstart', [first, second], [second]);

        const movedFirst = makeTouch(101, centerX - 50, centerY);
        const movedSecond = makeTouch(102, centerX + 50, centerY);
        dispatch('touchmove', [movedFirst, movedSecond], [movedFirst, movedSecond]);
        dispatch('touchend', [movedFirst], [movedSecond]);
        dispatch('touchend', [], [movedFirst]);
    }, { centerX, centerY });
}

async function testEditorTouchControls(browser) {
    const context = await browser.newContext({
        viewport: { width: 700, height: 900 },
        hasTouch: true,
        isMobile: true
    });
    const page = await context.newPage();
    const errors = [];
    page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', error => errors.push(error.message));

    await page.goto(`${baseUrl}/editor.html`, { waitUntil: 'networkidle' });
    await page.locator('#fileInput').setInputFiles(path.join(projectRoot, 'examples', 'editor.png'));
    await page.waitForFunction(() => document.getElementById('editorCanvas').width > 0);
    await page.locator('#btnStartScale').tap();

    const canvas = page.locator('#editorCanvas');
    let box = await canvas.boundingBox();
    assert.ok(box);
    const transformBeforeScalePinch = await canvas.getAttribute('style');
    await dispatchPinchGesture(page, box.x + box.width * 0.5, box.y + box.height * 0.35);
    assert.notEqual(await canvas.getAttribute('style'), transformBeforeScalePinch);
    assert.equal(await page.locator('#scaleInputArea').isVisible(), false);

    box = await canvas.boundingBox();
    await dispatchTouchTap(page, box.x + box.width * 0.35, box.y + box.height * 0.35);
    assert.equal(await page.locator('#scaleInputArea').isVisible(), false);
    await dispatchTouchTap(page, box.x + box.width * 0.65, box.y + box.height * 0.35);
    assert.equal(await page.locator('#scaleInputArea').isVisible(), true);
    await page.locator('#btnConfirmScale').tap();

    box = await canvas.boundingBox();
    const transformBeforeDrawingPinch = await canvas.getAttribute('style');
    await dispatchPinchGesture(page, box.x + box.width * 0.5, box.y + box.height * 0.48);
    assert.notEqual(await canvas.getAttribute('style'), transformBeforeDrawingPinch);
    assert.equal(await page.locator('#btnUndoPoint').isDisabled(), true);
    assert.equal(await page.locator('#btnFinishPolygon').isDisabled(), true);

    box = await canvas.boundingBox();
    const polygon = [
        [0.42, 0.40],
        [0.58, 0.40],
        [0.58, 0.58],
        [0.42, 0.58]
    ];
    for (const [xRatio, yRatio] of polygon.slice(0, 3)) {
        await dispatchTouchTap(page, box.x + box.width * xRatio, box.y + box.height * yRatio);
    }
    assert.equal(await page.locator('#btnFinishPolygon').isEnabled(), true);
    await page.locator('#btnUndoPoint').tap();
    assert.equal(await page.locator('#btnFinishPolygon').isDisabled(), true);
    for (const [xRatio, yRatio] of polygon.slice(2)) {
        await dispatchTouchTap(page, box.x + box.width * xRatio, box.y + box.height * yRatio);
    }
    await page.locator('#btnFinishPolygon').tap();
    await page.waitForFunction(() => document.querySelectorAll('#tableBody tr').length >= 2);
    const screenshot = await page.screenshot({ path: '/tmp/sunlight-editor-mobile.png' });
    assert.ok(screenshot.length > 10000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.split-config-header .btn-mini').tap();
    const modalBox = await page.locator('.editor-modal-dialog').boundingBox();
    assert.ok(modalBox);
    assert.ok(modalBox.x >= 0 && modalBox.y >= 0, JSON.stringify(modalBox));
    assert.ok(modalBox.x + modalBox.width <= 390, JSON.stringify(modalBox));
    assert.ok(modalBox.y + modalBox.height <= 844, JSON.stringify(modalBox));
    const modalScreenshot = await page.screenshot({ path: '/tmp/sunlight-editor-mobile-split.png' });
    assert.ok(modalScreenshot.length > 10000);
    await page.locator('#btnCancelSplitEditor').tap();
    assert.deepEqual(errors, []);
    await context.close();
}

(async () => {
    let server = null;
    let browser = null;
    try {
        if (!baseUrl) server = await startStaticServer();
        browser = await chromium.launch({ headless: true });
        console.log('Running viewer browser tests');
        await testViewer(browser);
        console.log('Running offline worker browser tests');
        await testFileWorker(browser);
        console.log('Running editor browser tests');
        await testEditor(browser);
        console.log('Running editor touch browser tests');
        await testEditorTouchControls(browser);
        console.log('Browser smoke tests passed');
    } finally {
        if (browser) await browser.close();
        if (server) await new Promise(resolve => server.close(resolve));
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
