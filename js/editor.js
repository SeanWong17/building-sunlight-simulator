/**
 * 楼盘规划图配置器 - 主逻辑
 * Building Plan Configurator - Main Logic
 * 
 * @description 提供2D平面图编辑功能，支持楼栋轮廓绘制、比例尺标定、参数配置等
 * @author Building Sunlight Simulator Team
 * @version 1.0.0
 */
(function() {
    'use strict';

    // ========== DOM 元素 ==========
    const wrapper = document.getElementById('canvas-wrapper');
    const canvas = document.getElementById('editorCanvas');
    const ctx = canvas.getContext('2d');
    const fileInput = document.getElementById('fileInput');
    const jsonImportInput = document.getElementById('jsonImportInput');
    const zoomInfo = document.getElementById('zoom-info');
    const emptyTip = document.getElementById('empty-tip');
    const btnUndoPoint = document.getElementById('btnUndoPoint');
    const btnFinishPolygon = document.getElementById('btnFinishPolygon');
    const btnUndoEdit = document.getElementById('btnUndoEdit');
    const editorLoadingOverlay = document.getElementById('editorLoadingOverlay');
    const editorLoadingText = document.getElementById('editorLoadingText');
    const splitEditorModal = document.getElementById('splitEditorModal');
    const visualSplitFloor = document.getElementById('visualSplitFloor');
    const visualSplitAngleRange = document.getElementById('visualSplitAngleRange');
    const visualSplitAngleNumber = document.getElementById('visualSplitAngleNumber');
    const visualSplitBar = document.getElementById('visualSplitBar');
    const visualSplitInputs = document.getElementById('visualSplitInputs');

    // 位置/纬度配置元素
    const citySelectEl = document.getElementById('citySelect');
    const projectLatEl = document.getElementById('projectLat');
    const projectLonEl = document.getElementById('projectLon');
    const projectTimeZoneEl = document.getElementById('projectTimeZone');
    const projectNorthAngleEl = document.getElementById('projectNorthAngle');

    // 默认参数元素
    const defFloorsEl = document.getElementById('defFloors');
    const defFloorHeightEl = document.getElementById('defFloorHeight');
    const defUnitsEl = document.getElementById('defUnits');
    const defIsThisCommunityEl = document.getElementById('defIsThisCommunity');
    const defUnitNumberingStartFromSideBEl = document.getElementById('defUnitNumberingStartFromSideB');
    const btnApplyDefaultsAll = document.getElementById('btnApplyDefaultsAll');
    const chkUseDefaults = document.getElementById('chkUseDefaults');

    // ========== 状态变量 ==========
    let image = new Image();
    let isImageLoaded = false;
    let hasPlanImage = false;
    let scaleRatio = 0;
    let buildings = [];
    let viewScale = 1.0;
    let viewX = 0;
    let viewY = 0;
    let mode = 'idle'; // 'idle' | 'scaling' | 'drawing'
    let scalePoints = [];
    let currentPoly = [];
    let mousePos = { x: 0, y: 0 };
    let isDragging = false;
    let lastMouseX = 0;
    let lastMouseY = 0;
    let spacePressed = false;
    let selectedBuildingId = null;
    let buildingDragState = null;
    let editHistory = [];
    let visualSplitState = null;
    let navigationApproved = false;

    window.addEventListener('project:navigate', event => {
        if (!isImageLoaded && buildings.length === 0 && currentPoly.length === 0) return;
        const message = i18n.getCurrentLanguage() === 'zh'
            ? '离开将丢失当前画布和未导出的修改。确定离开？'
            : 'Leaving will discard the current canvas and changes that have not been exported. Leave?';
        navigationApproved = confirm(message);
        if (!navigationApproved) event.preventDefault();
    });

    // A full-page navigation destroys the in-memory drawing, including the plan image.
    window.addEventListener('beforeunload', event => {
        if (navigationApproved || (!isImageLoaded && buildings.length === 0 && currentPoly.length === 0)) return;
        event.preventDefault();
        event.returnValue = '';
    });

    // 使用配置常量
    const CLOSE_EPS_BASE = CONFIG.EDITOR.CLOSE_EPSILON;
    const SANITIZE_EPS = CONFIG.EDITOR.SANITIZE_EPSILON;
    const TABLE_COLUMN_COUNT = 6;
    const MAX_EDIT_HISTORY = 50;
    const MIN_VISUAL_UNIT_RATIO = 0.01;
    const MAX_VISUAL_UNIT_RATIO = 0.98;

    // ========== 工具函数（使用 Utils 模块）==========
    const { distance, pointsEqual, clampInt, clampFloat, getPolygonCenter, normalizeAngle } = Utils;

    function waitForNextPaint() {
        return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }

    function setEditorLoadingVisible(visible) {
        editorLoadingOverlay.classList.toggle('is-active', visible);
        editorLoadingOverlay.setAttribute('aria-hidden', visible ? 'false' : 'true');
        if (visible) editorLoadingText.textContent = i18n.t('editor.importLoading');
    }

    function captureBuildingsState() {
        return Utils.deepClone(buildings);
    }

    function updateUndoEditButton() {
        btnUndoEdit.disabled = editHistory.length === 0;
    }

    function pushEditHistory(beforeState) {
        if (!Array.isArray(beforeState)) return;
        if (Utils.createFingerprint(beforeState) === Utils.createFingerprint(buildings)) return;
        editHistory.push(beforeState);
        if (editHistory.length > MAX_EDIT_HISTORY) editHistory.shift();
        updateUndoEditButton();
    }

    function resetEditHistory() {
        editHistory = [];
        updateUndoEditButton();
    }

    function getBuildingIndexById(id) {
        return buildings.findIndex(building => building.id === id);
    }

    function pointInPolygon(point, polygon) {
        if (!point || !Array.isArray(polygon) || polygon.length < 3) return false;
        let inside = false;
        for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
            const a = polygon[index];
            const b = polygon[previous];
            const intersects = ((a.y > point.y) !== (b.y > point.y))
                && point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || Number.EPSILON) + a.x;
            if (intersects) inside = !inside;
        }
        return inside;
    }

    function findBuildingIndexAtPoint(point) {
        for (let index = buildings.length - 1; index >= 0; index--) {
            if (pointInPolygon(point, buildings[index].points)) return index;
        }
        return -1;
    }

    function syncSelectedBuildingRow(scrollIntoView = false) {
        document.querySelectorAll('#tableBody tr.building-row').forEach(row => {
            const selected = row.dataset.buildingId === selectedBuildingId;
            row.classList.toggle('is-selected', selected);
            if (selected && scrollIntoView) row.scrollIntoView({ block: 'nearest' });
        });
    }

    function setSelectedBuilding(id, options = {}) {
        selectedBuildingId = getBuildingIndexById(id) >= 0 ? id : null;
        syncSelectedBuildingRow(!!options.scrollIntoView);
        draw();
        updateCursor();
    }

    function moveBuildingByDelta(index, deltaX, deltaY) {
        const building = buildings[index];
        if (!building || (!deltaX && !deltaY)) return;
        building.points = building.points.map(point => ({
            x: point.x + deltaX,
            y: point.y + deltaY
        }));
        draw();
    }

    function beginBuildingDrag(index, point) {
        const building = buildings[index];
        if (!building) return false;
        setSelectedBuilding(building.id, { scrollIntoView: true });
        buildingDragState = {
            buildingId: building.id,
            lastPoint: point,
            beforeState: captureBuildingsState(),
            moved: false
        };
        updateCursor();
        return true;
    }

    function updateBuildingDrag(point) {
        if (!buildingDragState || !point) return false;
        const index = getBuildingIndexById(buildingDragState.buildingId);
        if (index < 0) return false;
        const deltaX = point.x - buildingDragState.lastPoint.x;
        const deltaY = point.y - buildingDragState.lastPoint.y;
        if (!deltaX && !deltaY) return true;
        buildingDragState.lastPoint = point;
        buildingDragState.moved = true;
        moveBuildingByDelta(index, deltaX, deltaY);
        return true;
    }

    function finishBuildingDrag(commit = true) {
        if (!buildingDragState) return;
        const state = buildingDragState;
        buildingDragState = null;
        if (state.moved && commit) pushEditHistory(state.beforeState);
        if (state.moved && !commit) {
            buildings = state.beforeState;
            renderTable();
            draw();
        }
        updateCursor();
    }

    function undoLastEdit() {
        const previous = editHistory.pop();
        if (!previous) return;
        buildings = previous;
        if (getBuildingIndexById(selectedBuildingId) < 0) selectedBuildingId = null;
        renderTable();
        draw();
        updateUndoEditButton();
    }

    function deleteBuildingById(id, requireConfirmation = true) {
        const index = getBuildingIndexById(id);
        if (index < 0) return false;
        if (requireConfirmation && !confirm(i18n.t('editor.alertConfirmDelete'))) return false;
        const beforeState = captureBuildingsState();
        buildings.splice(index, 1);
        selectedBuildingId = null;
        buildingDragState = null;
        pushEditHistory(beforeState);
        renderTable();
        draw();
        return true;
    }

    // Basic unit-split editing flow adapted from wingkinl/building-sunlight-simulator (MIT).
    function normalizeUnitNumberingStartSide(value) {
        return value === 'B' ? 'B' : 'A';
    }

    function getBuildingUnitNumberingStartSide(building) {
        return normalizeUnitNumberingStartSide(building?.unitNumberingStartSide);
    }

    function buildEqualUnitRatios(units) {
        const count = Math.max(1, parseInt(units || 1, 10));
        return new Array(count).fill(1 / count);
    }

    function getBuildingUnitsPerFloor(building) {
        const floors = Math.max(1, parseInt(building?.floors || 1, 10));
        const fallback = Math.max(1, parseInt(building?.units || 1, 10));
        if (!Array.isArray(building?.unitsPerFloor) || building.unitsPerFloor.length === 0) {
            return new Array(floors).fill(fallback);
        }
        return new Array(floors).fill(fallback).map((_, floorIndex) => {
            const value = building.unitsPerFloor[Math.min(floorIndex, building.unitsPerFloor.length - 1)];
            return Math.max(1, parseInt(value || fallback, 10));
        });
    }

    function normalizeUnitCounts(floors, unitsOrCounts) {
        const totalFloors = Math.max(1, parseInt(floors || 1, 10));
        if (Array.isArray(unitsOrCounts)) {
            return new Array(totalFloors).fill(1).map((_, floorIndex) => Math.max(
                1,
                parseInt(unitsOrCounts[Math.min(floorIndex, unitsOrCounts.length - 1)] || 1, 10)
            ));
        }
        return new Array(totalFloors).fill(Math.max(1, parseInt(unitsOrCounts || 1, 10)));
    }

    function normalizeUnitRatios(ratios, units) {
        const count = Math.max(1, parseInt(units || 1, 10));
        if (!Array.isArray(ratios) || ratios.length !== count) return null;

        const cleaned = ratios.map(value => {
            const num = Number(value);
            return Number.isFinite(num) ? num : NaN;
        });
        if (cleaned.some(value => !Number.isFinite(value) || value < 0)) return null;

        const sum = cleaned.reduce((acc, value) => acc + value, 0);
        if (sum <= 1e-9) return null;

        return cleaned.map(value => value / sum);
    }

    function getVisualUnitRatioBounds(units) {
        const count = Math.max(1, parseInt(units || 1, 10));
        if (count === 1) return { min: 1, max: 1 };
        return {
            min: MIN_VISUAL_UNIT_RATIO,
            max: Math.min(MAX_VISUAL_UNIT_RATIO, 1 - MIN_VISUAL_UNIT_RATIO * (count - 1))
        };
    }

    function constrainVisualUnitRatios(ratios, units) {
        const count = Math.max(1, parseInt(units || 1, 10));
        const normalized = normalizeUnitRatios(ratios, count) || buildEqualUnitRatios(count);
        if (count === 1) return [1];

        const { min } = getVisualUnitRatioBounds(count);
        const available = 1 - min * count;
        const weights = normalized.map(value => Math.max(0, value - min));
        const weightTotal = weights.reduce((sum, value) => sum + value, 0);
        if (weightTotal <= 1e-9) return buildEqualUnitRatios(count);
        return weights.map(weight => min + available * weight / weightTotal);
    }

    function redistributeVisualUnitRatio(ratios, index, nextValue) {
        const count = ratios.length;
        if (count <= 1) return [1];

        const constrained = constrainVisualUnitRatios(ratios, count);
        const { min, max } = getVisualUnitRatioBounds(count);
        const numericValue = Number(nextValue);
        const target = Math.min(max, Math.max(min, Number.isFinite(numericValue) ? numericValue : min));
        const availableForOthers = 1 - target - min * (count - 1);
        const weights = constrained.map((value, ratioIndex) => (
            ratioIndex === index ? 0 : Math.max(0, value - min)
        ));
        const weightTotal = weights.reduce((sum, value) => sum + value, 0);
        const result = constrained.map((value, ratioIndex) => {
            if (ratioIndex === index) return target;
            const share = weightTotal > 1e-9 ? weights[ratioIndex] / weightTotal : 1 / (count - 1);
            return min + availableForOthers * share;
        });
        return constrainVisualUnitRatios(result, count);
    }

    function unitRatiosMatch(a, b, eps = 1e-6) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (Math.abs((Number(a[i]) || 0) - (Number(b[i]) || 0)) > eps) return false;
        }
        return true;
    }

    function getSharedFirstFloorUnitRatios(unitRatiosPerFloor, floors, unitsOrCounts) {
        const totalFloors = Math.max(1, parseInt(floors || 1, 10));
        const unitCounts = normalizeUnitCounts(totalFloors, unitsOrCounts);
        if (unitCounts.some(count => count !== unitCounts[0])) return null;
        if (!Array.isArray(unitRatiosPerFloor) || unitRatiosPerFloor.length === 0) return null;

        const first = normalizeUnitRatios(unitRatiosPerFloor[0], unitCounts[0]);
        if (!first) return null;

        for (let i = 1; i < totalFloors; i++) {
            const next = unitRatiosPerFloor[i];
            if (next == null) continue;

            const normalized = normalizeUnitRatios(next, unitCounts[i]);
            if (!normalized || !unitRatiosMatch(normalized, first)) {
                return null;
            }
        }

        return first;
    }

    function serializeUnitRatiosPerFloor(unitRatiosPerFloor, floors, unitsOrCounts) {
        const totalFloors = Math.max(1, parseInt(floors || 1, 10));
        const unitCounts = normalizeUnitCounts(totalFloors, unitsOrCounts);
        const perFloor = [];
        let hasAny = false;

        for (let floorIndex = 0; floorIndex < totalFloors; floorIndex++) {
            const normalized = normalizeUnitRatios(unitRatiosPerFloor?.[floorIndex], unitCounts[floorIndex]);
            perFloor.push(normalized);
            if (normalized) hasAny = true;
        }

        if (!hasAny) return null;

        const sharedFirst = getSharedFirstFloorUnitRatios(perFloor, totalFloors, unitCounts);
        if (sharedFirst) return [sharedFirst.slice()];
        return perFloor;
    }

    function formatUnitRatiosText(building) {
        const floors = Math.max(1, parseInt(building?.floors || 1, 10));
        const unitCounts = getBuildingUnitsPerFloor(building);
        const serialized = serializeUnitRatiosPerFloor(building?.unitRatiosPerFloor, floors, unitCounts);
        if (!Array.isArray(serialized) || serialized.length === 0) return '';

        return serialized
            .map((line, floorIndex) => {
                const ratios = Array.isArray(line)
                    ? line
                    : buildEqualUnitRatios(unitCounts[Math.min(floorIndex, unitCounts.length - 1)]);
                return ratios
                    .map(value => Number(value).toFixed(4).replace(/0+$/, '').replace(/\.$/, ''))
                    .join(', ');
            })
            .join('\n');
    }

    function ensureBuildingSplitState(building) {
        if (!building) return;
        building.unitSplitAngleDeg = Number.isFinite(Number(building.unitSplitAngleDeg))
            ? normalizeAngle(Number(building.unitSplitAngleDeg))
            : 0;
        building.unitNumberingStartSide = getBuildingUnitNumberingStartSide(building);
        if (typeof building.unitRatiosInput !== 'string') {
            building.unitRatiosInput = formatUnitRatiosText(building);
        }
    }

    function parseUnitRatioLine(text, units) {
        const parts = String(text || '')
            .trim()
            .split(/[,\s，]+/)
            .filter(Boolean);

        if (parts.length !== units) {
            return { error: i18n.t('editor.splitRatiosErrorValueCount') };
        }

        const values = parts.map(value => Number(value));
        const normalized = normalizeUnitRatios(values, units);
        if (!normalized) {
            return { error: i18n.t('editor.splitRatiosErrorNumber') };
        }

        return { value: normalized };
    }

    function parseUnitRatiosInput(text, floors, unitsOrCounts) {
        const raw = String(text || '').trim();
        if (!raw) return { value: null };
        const unitCounts = normalizeUnitCounts(floors, unitsOrCounts);

        const lines = raw
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean);

        const canShareOneLine = unitCounts.every(count => count === unitCounts[0]);
        if ((lines.length === 1 && !canShareOneLine) || (lines.length !== 1 && lines.length !== floors)) {
            return { error: i18n.t('editor.splitRatiosErrorLineCount') };
        }

        const parsed = [];
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const result = parseUnitRatioLine(lines[lineIndex], unitCounts[lines.length === 1 ? 0 : lineIndex]);
            if (result.error) return result;
            parsed.push(result.value);
        }

        if (lines.length === 1) {
            return { value: [parsed[0]] };
        }

        return { value: parsed };
    }

    function buildUnitRatiosExportValue(building) {
        const floors = Math.max(1, parseInt(building?.floors || 1, 10));
        const unitCounts = getBuildingUnitsPerFloor(building);
        const parsed = parseUnitRatiosInput(building?.unitRatiosInput, floors, unitCounts);
        if (parsed.error) return parsed;
        if (!parsed.value) return { value: null };

        const serialized = serializeUnitRatiosPerFloor(parsed.value, floors, unitCounts);
        if (!serialized) return { value: null };

        const equal = buildEqualUnitRatios(unitCounts[0]);
        const isDefaultEqual = serialized.length === 1 && unitRatiosMatch(serialized[0], equal);
        if (isDefaultEqual) return { value: null };

        return {
            value: serialized.map(line => Array.isArray(line)
                ? line.map(value => Utils.roundTo(value, 6))
                : null)
        };
    }

    function getSplitConfigValidation(building) {
        const floors = Math.max(1, parseInt(building?.floors || 1, 10));
        return parseUnitRatiosInput(building?.unitRatiosInput, floors, getBuildingUnitsPerFloor(building));
    }

    /**
     * 多边形净化 - 移除重复点、过短边、共线点
     * @param {Array} rawPoints - 原始点数组
     * @param {number} epsPx - 误差阈值（像素）
     * @returns {Array} 净化后的点数组
     */
    function sanitizePolygon(rawPoints, epsPx = SANITIZE_EPS) {
        if (!Array.isArray(rawPoints)) return [];
        const eps = Math.max(1e-6, epsPx);
        let pts = rawPoints.slice();

        // 移除首尾重复点
        if (pts.length >= 2 && pointsEqual(pts[0], pts[pts.length - 1], eps)) {
            pts.pop();
        }
        if (pts.length < 3) return pts;

        // 去重相邻点
        const dedup = [];
        for (let i = 0; i < pts.length; i++) {
            const p = pts[i];
            const q = dedup[dedup.length - 1];
            if (!q || !pointsEqual(p, q, eps)) {
                dedup.push({ x: p.x, y: p.y });
            }
        }

        if (dedup.length >= 2 && pointsEqual(dedup[0], dedup[dedup.length - 1], eps)) {
            dedup.pop();
        }
        if (dedup.length < 3) return dedup;

        // 移除过短边
        const shortThresh = eps;
        let clean = dedup.slice();
        let changed = true;

        function edgeLen(i, j) { return distance(clean[i], clean[j]); }
        function mod(n, m) { return ((n % m) + m) % m; }

        while (changed && clean.length > 3) {
            changed = false;
            for (let i = 0; i < clean.length; i++) {
                const j = mod(i + 1, clean.length);
                if (edgeLen(i, j) < shortThresh) {
                    clean.splice(j, 1);
                    changed = true;
                    if (clean.length <= 3) break;
                }
            }
        }

        if (clean.length < 3) return clean;

        // 移除共线点
        const result = [];
        const n = clean.length;
        for (let i = 0; i < n; i++) {
            const p0 = clean[mod(i - 1, n)];
            const p1 = clean[i];
            const p2 = clean[mod(i + 1, n)];
            const v1x = p1.x - p0.x, v1y = p1.y - p0.y;
            const v2x = p2.x - p1.x, v2y = p2.y - p1.y;
            const cross = Math.abs(v1x * v2y - v1y * v2x);
            const len1 = Math.hypot(v1x, v1y);
            const len2 = Math.hypot(v2x, v2y);
            if (cross > eps * (len1 + len2)) result.push(p1);
        }

        if (result.length < 3) return clean;
        return result;
    }

    // ========== 城市选择器初始化 ==========
    function syncManualLocationToCity() {
        const inputLat = parseFloat(projectLatEl.value);
        const inputLon = parseFloat(projectLonEl.value);
        const inputTimeZone = projectTimeZoneEl.value.trim();
        let matched = false;
        for (const option of citySelectEl.options) {
            if (option.dataset.lat
                && Math.abs(parseFloat(option.dataset.lat) - inputLat) < 0.01
                && Math.abs(parseFloat(option.dataset.lon) - inputLon) < 0.01
                && option.dataset.timeZone === inputTimeZone) {
                citySelectEl.value = option.value;
                matched = true;
                break;
            }
        }
        if (!matched) citySelectEl.value = '';
    }

    function initCitySelector() {
        if (typeof generateCityOptions === 'function') {
            const defaultCity = CONFIG.DEFAULTS.CITY;
            citySelectEl.innerHTML = generateCityOptions(defaultCity);

            const location = getLocationByCity(defaultCity);
            projectLatEl.value = location?.lat ?? CONFIG.DEFAULTS.LATITUDE;
            projectLonEl.value = location?.lon ?? CONFIG.DEFAULTS.LONGITUDE;
            projectTimeZoneEl.value = location?.timeZone ?? CONFIG.DEFAULTS.TIME_ZONE;
        }

        citySelectEl.addEventListener('change', function() {
            const selectedOption = this.options[this.selectedIndex];
            if (selectedOption.dataset.lat) {
                projectLatEl.value = parseFloat(selectedOption.dataset.lat);
                projectLonEl.value = parseFloat(selectedOption.dataset.lon);
                projectTimeZoneEl.value = selectedOption.dataset.timeZone;
            }
        });

        projectLatEl.addEventListener('input', syncManualLocationToCity);
        projectLonEl.addEventListener('input', syncManualLocationToCity);
        projectTimeZoneEl.addEventListener('input', syncManualLocationToCity);
    }

    // ========== 图片加载 ==========
    function hasEditableProjectState() {
        return buildings.length > 0 || scaleRatio > 0 || scalePoints.length > 0 || currentPoly.length > 0;
    }

    function resetProjectForNewImage() {
        scaleRatio = 0;
        buildings = [];
        selectedBuildingId = null;
        buildingDragState = null;
        mode = 'idle';
        scalePoints = [];
        currentPoly = [];
        mousePos = { x: 0, y: 0 };
        isDragging = false;
        wrapper.classList.remove('grabbing');
        document.getElementById('scaleInputArea').style.display = 'none';
        updateScaleStatus();
        updateDrawModeButton();
        updateCursor();
        renderTable();
        resetEditHistory();
    }

    function isImageFile(file) {
        const name = String(file?.name || '').toLowerCase();
        return !!file && (file.type?.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|svg)$/.test(name));
    }

    async function loadImageFile(file) {
        if (!isImageFile(file)) {
            alert(i18n.t('editor.alertInvalidDropFile'));
            return false;
        }
        if (hasEditableProjectState() && !confirm(i18n.t('editor.alertConfirmReplaceImage'))) return false;

        setEditorLoadingVisible(true);
        try {
            const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = event => resolve(event.target.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            await new Promise((resolve, reject) => {
                const nextImage = new Image();
                nextImage.onload = () => {
                    image = nextImage;
                    resolve();
                };
                nextImage.onerror = reject;
                nextImage.src = dataUrl;
            });
            resetProjectForNewImage();
            hasPlanImage = true;
            canvas.style.display = 'block';
            emptyTip.style.display = 'none';
            canvas.width = image.width;
            canvas.height = image.height;
            isImageLoaded = true;
            document.getElementById('btnStartScale').disabled = false;
            resetView();
            draw();
            return true;
        } catch (error) {
            console.error(error);
            setEditorLoadingVisible(false);
            alert(i18n.t('viewer.errorFileRead'));
            return false;
        } finally {
            setEditorLoadingVisible(false);
        }
    }

    function getProjectShapeBounds(data) {
        const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
        data.buildings.forEach(building => {
            building.shape.forEach(point => {
                bounds.minX = Math.min(bounds.minX, point.x);
                bounds.maxX = Math.max(bounds.maxX, point.x);
                bounds.minY = Math.min(bounds.minY, point.y);
                bounds.maxY = Math.max(bounds.maxY, point.y);
            });
        });
        return bounds;
    }

    function getBlankCanvasScale(data, bounds = getProjectShapeBounds(data)) {
        const maxSpan = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 1);
        const sourceScale = Number.isFinite(data.scaleRatio) && data.scaleRatio > 0 ? data.scaleRatio : 1;
        return Math.min(Math.max(sourceScale, maxSpan / 2200), maxSpan / 500);
    }

    function loadNormalizedProjectIntoEditor(data) {
        const { minX, maxX, minY, maxY } = getProjectShapeBounds(data);
        const padding = 80;
        const editorScale = getBlankCanvasScale(data, { minX, maxX, minY, maxY });

        scaleRatio = editorScale;
        buildings = data.buildings.map((building, index) => {
            const next = {
                id: `imported-${index}-${Date.now().toString(36)}`,
                name: building.name,
                floors: building.floors,
                floorHeight: building.floorHeight,
                units: building.units,
                unitsPerFloor: Array.isArray(building.unitsPerFloor)
                    ? building.unitsPerFloor.slice()
                    : undefined,
                isThisCommunity: building.isThisCommunity !== false,
                unitSplitAngleDeg: building.unitSplitAngleDeg || 0,
                unitNumberingStartSide: building.unitNumberingStartSide || 'A',
                unitRatiosPerFloor: Array.isArray(building.unitRatiosPerFloor)
                    ? Utils.deepClone(building.unitRatiosPerFloor)
                    : undefined,
                points: building.shape.map(point => ({
                    x: (point.x - minX) / editorScale + padding,
                    y: (point.y - minY) / editorScale + padding
                }))
            };
            ensureBuildingSplitState(next);
            return next;
        });

        canvas.width = Math.max(800, Math.ceil((maxX - minX) / editorScale + padding * 2));
        canvas.height = Math.max(600, Math.ceil((maxY - minY) / editorScale + padding * 2));
        image = new Image();
        hasPlanImage = false;
        isImageLoaded = true;
        selectedBuildingId = null;
        buildingDragState = null;
        mode = 'idle';
        scalePoints = [];
        currentPoly = [];
        canvas.style.display = 'block';
        emptyTip.style.display = 'none';
        document.getElementById('btnStartScale').disabled = false;
        projectLatEl.value = data.latitude;
        projectLonEl.value = data.longitude;
        projectTimeZoneEl.value = data.timeZone;
        projectNorthAngleEl.value = data.northAngle;
        syncManualLocationToCity();
        updateScaleStatus();
        updateDrawModeButton();
        resetEditHistory();
        renderTable();
        resetView();
        draw();
    }

    async function importProjectJsonFile(file) {
        const name = String(file?.name || '').toLowerCase();
        if (!file || (!name.endsWith('.json') && file.type !== 'application/json' && file.type !== 'text/json')) {
            alert(i18n.t('editor.alertInvalidDropFile'));
            return false;
        }
        if (hasEditableProjectState() && !confirm(i18n.t('editor.alertConfirmReplaceProject'))) return false;

        setEditorLoadingVisible(true);
        try {
            await waitForNextPaint();
            const parsed = JSON.parse(await file.text());
            const normalized = Utils.normalizeBuildingData(parsed);
            if (!normalized.valid) throw new Error(normalized.errors.slice(0, 8).join('\n'));
            loadNormalizedProjectIntoEditor(normalized.data);
            await waitForNextPaint();
            return true;
        } catch (error) {
            console.error(error);
            setEditorLoadingVisible(false);
            alert(i18n.t('editor.alertImportProjectFailed'));
            return false;
        } finally {
            setEditorLoadingVisible(false);
        }
    }

    fileInput.addEventListener('change', async event => {
        const file = event.target.files[0];
        if (file) await loadImageFile(file);
        event.target.value = '';
    });

    document.getElementById('btnImportProject').addEventListener('click', () => jsonImportInput.click());
    jsonImportInput.addEventListener('change', async event => {
        const file = event.target.files[0];
        if (file) await importProjectJsonFile(file);
        event.target.value = '';
    });

    wrapper.addEventListener('dragenter', event => {
        event.preventDefault();
        wrapper.dataset.dragLabel = i18n.t('editor.dragDropLabel');
        wrapper.classList.add('drag-over');
    });
    wrapper.addEventListener('dragover', event => {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    });
    wrapper.addEventListener('dragleave', event => {
        if (!wrapper.contains(event.relatedTarget)) wrapper.classList.remove('drag-over');
    });
    wrapper.addEventListener('drop', async event => {
        event.preventDefault();
        wrapper.classList.remove('drag-over');
        const file = Array.from(event.dataTransfer?.files || [])[0];
        if (!file) return;
        if (isImageFile(file)) await loadImageFile(file);
        else await importProjectJsonFile(file);
    });

    // ========== 视图控制 ==========
    function resetView() {
        if (!isImageLoaded) return;
        const padding = 40;
        const wRatio = (wrapper.clientWidth - padding) / canvas.width;
        const hRatio = (wrapper.clientHeight - padding) / canvas.height;
        viewScale = Math.min(wRatio, hRatio, 1);
        viewX = (wrapper.clientWidth - canvas.width * viewScale) / 2;
        viewY = (wrapper.clientHeight - canvas.height * viewScale) / 2;
        updateTransform();
    }

    function updateTransform() {
        canvas.style.transform = `translate(${viewX}px, ${viewY}px) scale(${viewScale})`;
        zoomInfo.innerText = `${i18n.t('editor.zoomInfo')}: ${Math.round(viewScale * 100)}%`;
    }

    function getCanvasCoordinates(e) {
        const rect = wrapper.getBoundingClientRect();
        const mouseXInWrapper = e.clientX - rect.left;
        const mouseYInWrapper = e.clientY - rect.top;
        const canvasX = (mouseXInWrapper - viewX) / viewScale;
        const canvasY = (mouseYInWrapper - viewY) / viewScale;
        return { x: canvasX, y: canvasY };
    }

    function updateCursor() {
        if (buildingDragState) {
            wrapper.style.cursor = 'move';
        } else if (isDragging) {
            wrapper.style.cursor = 'grabbing';
        } else if (spacePressed || mode === 'idle') {
            wrapper.style.cursor = 'grab';
        } else if (mode === 'drawing' || mode === 'scaling') {
            wrapper.style.cursor = 'crosshair';
        } else {
            wrapper.style.cursor = 'grab';
        }
    }

    function addScalePoint(point) {
        scalePoints.push(point);
        if (scalePoints.length === 2) {
            mode = 'idle';
            updateDrawModeButton();
            updateCursor();
            document.getElementById('scaleInputArea').style.display = 'block';
        }
        draw();
    }

    function isEditableKeyboardTarget(target) {
        return target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName);
    }

    window.addEventListener('keydown', event => {
        if (isEditableKeyboardTarget(event.target)) return;
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
            undoLastEdit();
            event.preventDefault();
            return;
        }
        if ((event.key === 'Delete' || event.key === 'Backspace') && selectedBuildingId) {
            deleteBuildingById(selectedBuildingId, true);
            event.preventDefault();
            return;
        }
        if (event.code !== 'Space') return;
        spacePressed = true;
        updateCursor();
        event.preventDefault();
    });

    window.addEventListener('keyup', event => {
        if (event.code !== 'Space') return;
        spacePressed = false;
        updateCursor();
        if (!isEditableKeyboardTarget(event.target)) event.preventDefault();
    });

    window.addEventListener('blur', () => {
        finishBuildingDrag(false);
        spacePressed = false;
        isDragging = false;
        wrapper.classList.remove('grabbing');
        updateCursor();
    });

    document.getElementById('btnResetView').addEventListener('click', resetView);

    // ========== 鼠标/滚轮事件 ==========
    wrapper.addEventListener('wheel', (e) => {
        if (!isImageLoaded) return;
        e.preventDefault();
        const zoomSpeed = 0.1;
        const delta = e.deltaY > 0 ? (1 - zoomSpeed) : (1 + zoomSpeed);
        const newScale = Math.min(Math.max(viewScale * delta, 0.1), 10);
        const rect = wrapper.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const canvasOffsetX = (mouseX - viewX);
        const canvasOffsetY = (mouseY - viewY);
        viewX = mouseX - (canvasOffsetX * (newScale / viewScale));
        viewY = mouseY - (canvasOffsetY * (newScale / viewScale));
        viewScale = newScale;
        updateTransform();
    }, { passive: false });

    wrapper.addEventListener('mousedown', (e) => {
        if (!isImageLoaded) return;

        // 拖拽视图
        if (e.button === 1 || (spacePressed && e.button === 0)) {
            isDragging = true;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            wrapper.classList.add('grabbing');
            updateCursor();
            e.preventDefault();
            return;
        }

        // 左键操作
        if (e.button === 0) {
            const p = getCanvasCoordinates(e);
            if (mode === 'idle') {
                const hitIndex = findBuildingIndexAtPoint(p);
                if (hitIndex >= 0) {
                    beginBuildingDrag(hitIndex, p);
                } else {
                    setSelectedBuilding(null);
                    isDragging = true;
                    lastMouseX = e.clientX;
                    lastMouseY = e.clientY;
                    wrapper.classList.add('grabbing');
                    updateCursor();
                }
                e.preventDefault();
                return;
            } else if (mode === 'scaling') {
                addScalePoint(p);
            } else if (mode === 'drawing') {
                currentPoly.push(p);
                draw();
            }
        }

        // 右键撤销
        if (e.button === 2) {
            undoCurrentPoint();
        }
    });

    wrapper.addEventListener('dblclick', (e) => {
        if (!isImageLoaded) return;
        if (mode === 'drawing' && e.button === 0) {
            if (currentPoly.length >= 3) {
                finishPolygon();
            }
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (buildingDragState) {
            updateBuildingDrag(getCanvasCoordinates(e));
            return;
        }
        if (isDragging) {
            const dx = e.clientX - lastMouseX;
            const dy = e.clientY - lastMouseY;
            viewX += dx;
            viewY += dy;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            updateTransform();
            return;
        }
        if (!isImageLoaded) return;
        mousePos = getCanvasCoordinates(e);
        if (mode === 'drawing') {
            draw();
        } else if (mode === 'idle') {
            wrapper.style.cursor = findBuildingIndexAtPoint(mousePos) >= 0 ? 'move' : 'grab';
        }
    });

    window.addEventListener('mouseup', () => {
        finishBuildingDrag(true);
        isDragging = false;
        wrapper.classList.remove('grabbing');
        updateCursor();
    });

    canvas.addEventListener('contextmenu', e => e.preventDefault());

    // ========== 触摸事件支持 ==========
    const TOUCH_TAP_MOVE_THRESHOLD = 8;
    let lastTouchDist = 0;
    let pendingTouchAction = null;
    let multiTouchGesture = false;

    function getTouchCanvasCoords(touch) {
        const rect = wrapper.getBoundingClientRect();
        return {
            x: (touch.clientX - rect.left - viewX) / viewScale,
            y: (touch.clientY - rect.top - viewY) / viewScale
        };
    }

    function findTouchByIdentifier(touchList, identifier) {
        for (let index = 0; index < touchList.length; index++) {
            if (touchList[index].identifier === identifier) return touchList[index];
        }
        return null;
    }

    function commitPendingTouchAction(touch) {
        const pending = pendingTouchAction;
        pendingTouchAction = null;
        if (!pending || pending.cancelled || multiTouchGesture || mode !== pending.mode || !touch) return;

        const point = getTouchCanvasCoords(touch);
        if (pending.mode === 'scaling') {
            addScalePoint(point);
        } else if (pending.mode === 'drawing') {
            currentPoly.push(point);
            mousePos = point;
            draw();
        }
    }

    function stopTouchDragging() {
        if (!isDragging) return;
        isDragging = false;
        wrapper.classList.remove('grabbing');
        updateCursor();
    }

    function resetTouchGesture() {
        finishBuildingDrag(false);
        pendingTouchAction = null;
        multiTouchGesture = false;
        lastTouchDist = 0;
        stopTouchDragging();
    }

    wrapper.addEventListener('touchstart', (e) => {
        if (!isImageLoaded) return;
        e.preventDefault();

        if (e.touches.length >= 2) {
            finishBuildingDrag(false);
            pendingTouchAction = null;
            multiTouchGesture = true;
            stopTouchDragging();
            // 双指缩放
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            lastTouchDist = Math.hypot(dx, dy);
            return;
        }

        if (e.touches.length === 1) {
            const touch = e.touches[0];
            multiTouchGesture = false;

            if (mode === 'idle') {
                const point = getTouchCanvasCoords(touch);
                const hitIndex = findBuildingIndexAtPoint(point);
                if (hitIndex >= 0) {
                    beginBuildingDrag(hitIndex, point);
                } else {
                    setSelectedBuilding(null);
                    isDragging = true;
                    lastMouseX = touch.clientX;
                    lastMouseY = touch.clientY;
                    wrapper.classList.add('grabbing');
                    updateCursor();
                }
            } else if (mode === 'scaling' || mode === 'drawing') {
                pendingTouchAction = {
                    identifier: touch.identifier,
                    mode,
                    startClientX: touch.clientX,
                    startClientY: touch.clientY,
                    cancelled: false
                };
                if (mode === 'drawing') {
                    mousePos = getTouchCanvasCoords(touch);
                    draw();
                }
            }
        }
    }, { passive: false });

    wrapper.addEventListener('touchmove', (e) => {
        if (!isImageLoaded) return;
        e.preventDefault();

        if (e.touches.length >= 2) {
            finishBuildingDrag(false);
            pendingTouchAction = null;
            multiTouchGesture = true;
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.hypot(dx, dy);
            if (lastTouchDist <= 0) {
                lastTouchDist = dist;
                return;
            }
            const scale = dist / lastTouchDist;
            const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            const rect = wrapper.getBoundingClientRect();
            const mx = midX - rect.left;
            const my = midY - rect.top;
            const newScale = Math.min(Math.max(viewScale * scale, 0.1), 10);
            const ox = mx - viewX;
            const oy = my - viewY;
            viewX = mx - ox * (newScale / viewScale);
            viewY = my - oy * (newScale / viewScale);
            viewScale = newScale;
            lastTouchDist = dist;
            updateTransform();
            return;
        }

        if (e.touches.length === 1) {
            const touch = e.touches[0];
            if (multiTouchGesture) return;
            if (buildingDragState) {
                updateBuildingDrag(getTouchCanvasCoords(touch));
            } else if (isDragging) {
                viewX += touch.clientX - lastMouseX;
                viewY += touch.clientY - lastMouseY;
                lastMouseX = touch.clientX;
                lastMouseY = touch.clientY;
                updateTransform();
            } else if (pendingTouchAction?.identifier === touch.identifier) {
                const movement = Math.hypot(
                    touch.clientX - pendingTouchAction.startClientX,
                    touch.clientY - pendingTouchAction.startClientY
                );
                if (movement > TOUCH_TAP_MOVE_THRESHOLD) pendingTouchAction.cancelled = true;
            }
            if (mode === 'drawing' && pendingTouchAction) {
                mousePos = getTouchCanvasCoords(touch);
                draw();
            }
        }
    }, { passive: false });

    wrapper.addEventListener('touchend', (e) => {
        if (!isImageLoaded) return;

        if (e.touches.length === 0) {
            const endedTouch = pendingTouchAction
                ? findTouchByIdentifier(e.changedTouches, pendingTouchAction.identifier)
                : null;
            finishBuildingDrag(true);
            stopTouchDragging();
            commitPendingTouchAction(endedTouch);
            pendingTouchAction = null;
            multiTouchGesture = false;
            lastTouchDist = 0;
        } else {
            pendingTouchAction = null;
            if (e.touches.length < 2) lastTouchDist = 0;
        }
    });

    wrapper.addEventListener('touchcancel', resetTouchGesture);

    // ========== 绘图函数 ==========
    function draw() {
        updateDrawActionButtons();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!isImageLoaded) return;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (hasPlanImage) ctx.drawImage(image, 0, 0);

        // 绘制已完成的楼栋
        buildings.forEach(b => {
            const selected = b.id === selectedBuildingId;
            drawPolygon(
                b.points,
                selected ? 'rgba(25, 118, 210, 0.38)' : 'rgba(0, 123, 255, 0.24)',
                selected ? '#d94841' : '#007bff'
            );
            if (selected) b.points.forEach(point => drawPoint(point, '#d94841'));
            const center = getPolygonCenter(b.points);
            ctx.fillStyle = "white";
            ctx.font = `bold 16px Arial`;
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 3;
            ctx.strokeText(b.name, center.x - 10, center.y);
            ctx.fillText(b.name, center.x - 10, center.y);
        });

        // 绘制比例尺标定点
        if (scalePoints.length > 0) drawPoint(scalePoints[0], 'red');
        if (scalePoints.length === 2) {
            drawPoint(scalePoints[1], 'red');
            ctx.beginPath();
            ctx.moveTo(scalePoints[0].x, scalePoints[0].y);
            ctx.lineTo(scalePoints[1].x, scalePoints[1].y);
            ctx.strokeStyle = 'red';
            ctx.lineWidth = 2 / viewScale;
            ctx.stroke();
        }

        // 绘制当前多边形
        if (currentPoly.length > 0) {
            const first = currentPoly[0];
            const eps = CLOSE_EPS_BASE / viewScale;
            const nearStart = distance(mousePos, first) <= eps && currentPoly.length > 2;

            ctx.beginPath();
            ctx.moveTo(currentPoly[0].x, currentPoly[0].y);
            for (let i = 1; i < currentPoly.length; i++) {
                ctx.lineTo(currentPoly[i].x, currentPoly[i].y);
            }
            ctx.lineTo(mousePos.x, mousePos.y);
            ctx.strokeStyle = '#28a745';
            ctx.lineWidth = 2 / viewScale;
            ctx.stroke();

            currentPoly.forEach((p, idx) => drawPoint(p, idx === 0 ? '#ff9800' : '#28a745'));

            if (nearStart) {
                ctx.beginPath();
                ctx.arc(first.x, first.y, 10 / viewScale, 0, Math.PI * 2);
                ctx.strokeStyle = '#ff9800';
                ctx.lineWidth = 2 / viewScale;
                ctx.stroke();
            }
        }
    }

    function drawPoint(p, color) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4 / viewScale, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
    }

    function drawPolygon(points, fillColor, strokeColor) {
        if (points.length < 3) return;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2 / viewScale;
        ctx.stroke();
    }

    // ========== 多边形完成 ==========
    function finishPolygon() {
        if (scaleRatio === 0) {
            alert(i18n.t('editor.alertNoScale'));
            currentPoly = [];
            draw();
            return;
        }
        if (currentPoly.length < 3) {
            alert(i18n.t('editor.alertMinPoints'));
            currentPoly = [];
            draw();
            return;
        }

        const eps = 0.75;
        const cleaned = sanitizePolygon(currentPoly, eps);
        if (cleaned.length < 3) {
            alert(i18n.t('editor.alertInvalidPoly'));
            currentPoly = [];
            draw();
            return;
        }

        const beforeState = captureBuildingsState();
        const idx = buildings.length + 1;
        const useDefaults = chkUseDefaults.checked;
        const validation = CONFIG.VALIDATION;
        
        const b = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2),
            name: i18n.t('viewer.defaultBuildingName').replace('{0}', idx),
            floors: useDefaults ? clampInt(parseInt(defFloorsEl.value), validation.FLOORS.MIN, validation.FLOORS.MAX, CONFIG.DEFAULTS.FLOORS) : CONFIG.DEFAULTS.FLOORS,
            floorHeight: useDefaults ? clampFloat(parseFloat(defFloorHeightEl.value), validation.FLOOR_HEIGHT.MIN, validation.FLOOR_HEIGHT.MAX, CONFIG.DEFAULTS.FLOOR_HEIGHT) : CONFIG.DEFAULTS.FLOOR_HEIGHT,
            units: useDefaults ? clampInt(parseInt(defUnitsEl.value), validation.UNITS.MIN, validation.UNITS.MAX, CONFIG.DEFAULTS.UNITS_PER_FLOOR) : CONFIG.DEFAULTS.UNITS_PER_FLOOR,
            isThisCommunity: useDefaults ? !!defIsThisCommunityEl.checked : CONFIG.DEFAULTS.IS_THIS_COMMUNITY,
            unitSplitAngleDeg: 0,
            unitNumberingStartSide: useDefaults && defUnitNumberingStartFromSideBEl?.checked ? 'B' : 'A',
            unitRatiosInput: '',
            points: cleaned
        };
        ensureBuildingSplitState(b);
        buildings.push(b);
        selectedBuildingId = b.id;
        pushEditHistory(beforeState);
        currentPoly = [];
        renderTable();
        draw();
    }

    function undoCurrentPoint() {
        if (mode !== 'drawing' || currentPoly.length === 0) return;
        currentPoly.pop();
        draw();
    }

    // ========== 比例尺标定 ==========
    document.getElementById('btnStartScale').addEventListener('click', () => {
        scalePoints = [];
        mode = 'scaling';
        updateDrawModeButton();
        updateCursor();
        document.getElementById('scaleStatus').innerText = i18n.t('editor.scalePrompt');
        document.getElementById('scaleInputArea').style.display = 'none';
        draw();
    });

    document.getElementById('btnConfirmScale').addEventListener('click', () => {
        if (scalePoints.length < 2) {
            alert(i18n.t('editor.alertNoScale'));
            return;
        }
        const distPx = Math.hypot(scalePoints[1].x - scalePoints[0].x, scalePoints[1].y - scalePoints[0].y);
        const distReal = parseFloat(document.getElementById('realDistance').value);
        if (!(distReal > 0) || !(distPx > 0)) {
            alert(i18n.t('editor.alertInvalidDistance'));
            return;
        }
        scaleRatio = distReal / distPx;
        updateScaleStatus();
        document.getElementById('scaleInputArea').style.display = 'none';
        toggleDrawMode(true);
        renderTable();
    });

    // ========== 绘制模式切换 ==========
    const btnDrawMode = document.getElementById('btnDrawMode');
    btnDrawMode.addEventListener('click', () => {
        toggleDrawMode(mode !== 'drawing');
    });
    btnUndoPoint.addEventListener('click', undoCurrentPoint);
    btnUndoEdit.addEventListener('click', undoLastEdit);
    btnFinishPolygon.addEventListener('click', () => {
        if (mode === 'drawing' && currentPoly.length >= 3) finishPolygon();
    });

    function updateDrawActionButtons() {
        const drawing = mode === 'drawing';
        btnUndoPoint.disabled = !drawing || currentPoly.length === 0;
        btnFinishPolygon.disabled = !drawing || currentPoly.length < 3;
    }

    function toggleDrawMode(active) {
        if (active) {
            mode = 'drawing';
            setSelectedBuilding(null);
        } else {
            mode = 'idle';
            currentPoly = [];
            draw();
        }
        updateCursor();
        updateDrawModeButton();
        updateDrawActionButtons();
    }

    function closeVisualSplitEditor() {
        visualSplitState = null;
        splitEditorModal.hidden = true;
    }

    function getVisualSplitRatiosFromBuilding(building) {
        const floors = Math.max(1, parseInt(building.floors || 1, 10));
        const unitCounts = getBuildingUnitsPerFloor(building);
        const parsed = parseUnitRatiosInput(building.unitRatiosInput, floors, unitCounts);
        if (parsed.error) return parsed;

        const source = parsed.value;
        const ratiosPerFloor = new Array(floors).fill(null).map((_, floorIndex) => {
            const units = unitCounts[floorIndex];
            const row = source?.[source.length === 1 ? 0 : floorIndex];
            return constrainVisualUnitRatios(row, units);
        });
        return { value: ratiosPerFloor, unitCounts };
    }

    function openVisualSplitEditor(buildingId) {
        const buildingIndex = getBuildingIndexById(buildingId);
        const building = buildings[buildingIndex];
        if (!building) return;
        const ratios = getVisualSplitRatiosFromBuilding(building);
        if (ratios.error) {
            alert(i18n.t('editor.alertInvalidSplitConfig')
                .replace('{0}', building.name)
                .replace('{1}', ratios.error));
            return;
        }

        visualSplitState = {
            buildingId,
            floorIndex: 0,
            unitCounts: ratios.unitCounts,
            ratiosPerFloor: ratios.value,
            angle: normalizeAngle(Number(building.unitSplitAngleDeg) || 0),
            beforeState: captureBuildingsState()
        };
        document.getElementById('splitEditorBuildingName').textContent = building.name;
        visualSplitFloor.innerHTML = '';
        for (let floorIndex = 0; floorIndex < building.floors; floorIndex++) {
            const option = document.createElement('option');
            option.value = String(floorIndex);
            option.textContent = i18n.t('editor.visualSplitFloorOption').replace('{0}', floorIndex + 1);
            visualSplitFloor.appendChild(option);
        }
        visualSplitAngleRange.value = String(visualSplitState.angle);
        visualSplitAngleNumber.value = String(visualSplitState.angle);
        splitEditorModal.hidden = false;
        renderVisualSplitEditor();
        visualSplitFloor.focus();
    }

    function updateVisualSplitRatio(index, nextValue) {
        if (!visualSplitState) return;
        const floorIndex = visualSplitState.floorIndex;
        const ratios = visualSplitState.ratiosPerFloor[floorIndex].slice();
        if (ratios.length === 1) return;
        visualSplitState.ratiosPerFloor[floorIndex] = redistributeVisualUnitRatio(ratios, index, nextValue);
        renderVisualSplitEditor();
    }

    function adjustVisualSplitBoundary(boundaryIndex, delta) {
        if (!visualSplitState) return;
        const floorIndex = visualSplitState.floorIndex;
        const ratios = visualSplitState.ratiosPerFloor[floorIndex].slice();
        const pairTotal = ratios[boundaryIndex] + ratios[boundaryIndex + 1];
        const minimum = MIN_VISUAL_UNIT_RATIO;
        const left = Math.min(pairTotal - minimum, Math.max(minimum, ratios[boundaryIndex] + delta));
        ratios[boundaryIndex] = left;
        ratios[boundaryIndex + 1] = pairTotal - left;
        visualSplitState.ratiosPerFloor[floorIndex] = ratios;
        renderVisualSplitEditor();
    }

    function createVisualSplitHandle(boundaryIndex, boundaryPosition) {
        const handle = document.createElement('button');
        handle.type = 'button';
        handle.className = 'visual-split-handle';
        handle.style.left = `${boundaryPosition * 100}%`;
        handle.setAttribute('aria-label', `${boundaryIndex + 1}/${boundaryIndex + 2}`);
        handle.addEventListener('keydown', event => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            adjustVisualSplitBoundary(boundaryIndex, event.key === 'ArrowLeft' ? -0.01 : 0.01);
            visualSplitBar.querySelectorAll('.visual-split-handle')[boundaryIndex]?.focus();
            event.preventDefault();
        });
        handle.addEventListener('pointerdown', event => {
            if (event.button !== 0) return;
            const startX = event.clientX;
            const pointerId = event.pointerId;
            const startRatios = visualSplitState.ratiosPerFloor[visualSplitState.floorIndex].slice();
            const width = Math.max(1, visualSplitBar.getBoundingClientRect().width);
            const onMove = moveEvent => {
                if (moveEvent.pointerId !== pointerId || !visualSplitState) return;
                const pairTotal = startRatios[boundaryIndex] + startRatios[boundaryIndex + 1];
                const minimum = MIN_VISUAL_UNIT_RATIO;
                const delta = (moveEvent.clientX - startX) / width;
                const left = Math.min(
                    pairTotal - minimum,
                    Math.max(minimum, startRatios[boundaryIndex] + delta)
                );
                const next = startRatios.slice();
                next[boundaryIndex] = left;
                next[boundaryIndex + 1] = pairTotal - left;
                visualSplitState.ratiosPerFloor[visualSplitState.floorIndex] = next;
                renderVisualSplitEditor();
            };
            const onEnd = endEvent => {
                if (endEvent.pointerId !== pointerId) return;
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onEnd);
                window.removeEventListener('pointercancel', onEnd);
            };
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onEnd);
            window.addEventListener('pointercancel', onEnd);
            event.preventDefault();
        });
        return handle;
    }

    function renderVisualSplitEditor() {
        if (!visualSplitState) return;
        const floorIndex = visualSplitState.floorIndex;
        const ratios = visualSplitState.ratiosPerFloor[floorIndex];
        visualSplitFloor.value = String(floorIndex);
        visualSplitAngleRange.value = String(visualSplitState.angle);
        visualSplitAngleNumber.value = String(visualSplitState.angle);
        visualSplitBar.innerHTML = '';
        visualSplitInputs.innerHTML = '';

        let cumulative = 0;
        const handles = [];
        ratios.forEach((ratio, index) => {
            const segment = document.createElement('div');
            segment.className = 'visual-split-segment';
            segment.style.left = `${cumulative * 100}%`;
            segment.style.width = `${ratio * 100}%`;
            segment.textContent = `${index + 1} · ${(ratio * 100).toFixed(1)}%`;
            visualSplitBar.appendChild(segment);
            cumulative += ratio;
            if (index < ratios.length - 1) handles.push(createVisualSplitHandle(index, cumulative));

            const label = document.createElement('label');
            label.textContent = i18n.t('editor.visualSplitUnitRatio').replace('{0}', index + 1);
            const input = document.createElement('input');
            input.type = 'number';
            const bounds = getVisualUnitRatioBounds(ratios.length);
            input.min = String(Utils.roundTo(bounds.min * 100, 6));
            input.max = String(Utils.roundTo(bounds.max * 100, 6));
            input.step = '0.1';
            input.value = (ratio * 100).toFixed(1);
            input.disabled = ratios.length === 1;
            input.addEventListener('change', () => updateVisualSplitRatio(index, Number(input.value) / 100));
            label.appendChild(input);
            visualSplitInputs.appendChild(label);
        });
        handles.forEach(handle => visualSplitBar.appendChild(handle));

        const currentUnits = visualSplitState.unitCounts[floorIndex];
        document.getElementById('btnApplySplitAllFloors').disabled = visualSplitState.unitCounts
            .some(count => count !== currentUnits);
    }

    function saveVisualSplitEditor() {
        if (!visualSplitState) return;
        const building = buildings[getBuildingIndexById(visualSplitState.buildingId)];
        if (!building) {
            closeVisualSplitEditor();
            return;
        }
        building.unitSplitAngleDeg = visualSplitState.angle;
        building.unitRatiosPerFloor = serializeUnitRatiosPerFloor(
            visualSplitState.ratiosPerFloor,
            building.floors,
            visualSplitState.unitCounts
        );
        building.unitRatiosInput = formatUnitRatiosText(building);
        pushEditHistory(visualSplitState.beforeState);
        closeVisualSplitEditor();
        renderTable();
        draw();
    }

    visualSplitFloor.addEventListener('change', () => {
        if (!visualSplitState) return;
        visualSplitState.floorIndex = clampInt(
            parseInt(visualSplitFloor.value),
            0,
            visualSplitState.ratiosPerFloor.length - 1,
            0
        );
        renderVisualSplitEditor();
    });
    const updateVisualSplitAngle = value => {
        if (!visualSplitState) return;
        visualSplitState.angle = normalizeAngle(Number(value));
        visualSplitAngleRange.value = String(visualSplitState.angle);
        visualSplitAngleNumber.value = String(visualSplitState.angle);
    };
    visualSplitAngleRange.addEventListener('input', () => updateVisualSplitAngle(visualSplitAngleRange.value));
    visualSplitAngleNumber.addEventListener('change', () => updateVisualSplitAngle(visualSplitAngleNumber.value));
    document.getElementById('btnEqualizeSplit').addEventListener('click', () => {
        if (!visualSplitState) return;
        const units = visualSplitState.unitCounts[visualSplitState.floorIndex];
        visualSplitState.ratiosPerFloor[visualSplitState.floorIndex] = buildEqualUnitRatios(units);
        renderVisualSplitEditor();
    });
    document.getElementById('btnApplySplitAllFloors').addEventListener('click', () => {
        if (!visualSplitState) return;
        const source = visualSplitState.ratiosPerFloor[visualSplitState.floorIndex];
        if (visualSplitState.unitCounts.some(count => count !== source.length)) return;
        visualSplitState.ratiosPerFloor = visualSplitState.ratiosPerFloor.map(() => source.slice());
        renderVisualSplitEditor();
    });
    document.getElementById('btnSaveSplitEditor').addEventListener('click', saveVisualSplitEditor);
    document.getElementById('btnCancelSplitEditor').addEventListener('click', closeVisualSplitEditor);
    document.getElementById('btnCloseSplitEditor').addEventListener('click', closeVisualSplitEditor);
    splitEditorModal.addEventListener('click', event => {
        if (event.target === splitEditorModal) closeVisualSplitEditor();
    });
    window.addEventListener('keydown', event => {
        if (event.key === 'Escape' && visualSplitState) closeVisualSplitEditor();
    });

    // ========== 表格渲染 ==========
    const tableBody = document.getElementById('tableBody');

    function renderTable() {
        tableBody.innerHTML = '';
        buildings.forEach((b, i) => {
            ensureBuildingSplitState(b);
            const tr = document.createElement('tr');
            tr.className = 'building-row';
            tr.dataset.buildingId = b.id;
            tr.addEventListener('click', () => setSelectedBuilding(b.id));

            // 名称
            const tdName = document.createElement('td');
            const inpName = document.createElement('input');
            inpName.type = 'text';
            inpName.value = b.name;
            inpName.placeholder = i18n.t('editor.namePlaceholder');
            let nameBeforeState = null;
            inpName.addEventListener('focus', () => { nameBeforeState = captureBuildingsState(); });
            inpName.addEventListener('input', () => {
                b.name = inpName.value || i18n.t('viewer.defaultBuildingName').replace('{0}', i + 1);
                draw();
            });
            inpName.addEventListener('blur', () => {
                pushEditHistory(nameBeforeState);
                nameBeforeState = null;
            });
            tdName.appendChild(inpName);

            // 层数
            const tdFloors = document.createElement('td');
            const inpFloors = document.createElement('input');
            inpFloors.type = 'number';
            inpFloors.min = 1;
            inpFloors.step = 1;
            inpFloors.value = b.floors;
            inpFloors.addEventListener('change', () => {
                const beforeState = captureBuildingsState();
                const previousFloors = b.floors;
                const previousUnitCounts = getBuildingUnitsPerFloor(b);
                const previousRatios = parseUnitRatiosInput(
                    b.unitRatiosInput,
                    previousFloors,
                    previousUnitCounts
                );
                b.floors = clampInt(parseInt(inpFloors.value), 1, 300, b.floors);
                if (Array.isArray(b.unitsPerFloor)) {
                    b.unitsPerFloor = new Array(b.floors).fill(b.units).map((_, floorIndex) => (
                        b.unitsPerFloor[Math.min(floorIndex, b.unitsPerFloor.length - 1)] || b.units
                    ));
                }
                if (!previousRatios.error) {
                    if (previousRatios.value) {
                        const nextUnitCounts = getBuildingUnitsPerFloor(b);
                        const expandedPreviousRatios = new Array(previousFloors).fill(null).map((_, floorIndex) => {
                            const row = previousRatios.value[
                                previousRatios.value.length === 1 ? 0 : floorIndex
                            ];
                            return normalizeUnitRatios(row, previousUnitCounts[floorIndex])
                                || buildEqualUnitRatios(previousUnitCounts[floorIndex]);
                        });
                        const resizedRatios = new Array(b.floors).fill(null).map((_, floorIndex) => {
                            const source = expandedPreviousRatios[
                                Math.min(floorIndex, expandedPreviousRatios.length - 1)
                            ];
                            return normalizeUnitRatios(source, nextUnitCounts[floorIndex])
                                || buildEqualUnitRatios(nextUnitCounts[floorIndex]);
                        });
                        b.unitRatiosPerFloor = serializeUnitRatiosPerFloor(
                            resizedRatios,
                            b.floors,
                            nextUnitCounts
                        );
                        b.unitRatiosInput = formatUnitRatiosText(b);
                    } else {
                        delete b.unitRatiosPerFloor;
                        b.unitRatiosInput = '';
                    }
                }
                inpFloors.value = b.floors;
                pushEditHistory(beforeState);
                renderTable();
            });
            tdFloors.appendChild(inpFloors);

            // 层高
            const tdFloorH = document.createElement('td');
            const inpFloorH = document.createElement('input');
            inpFloorH.type = 'number';
            inpFloorH.min = 1;
            inpFloorH.step = 0.01;
            inpFloorH.value = b.floorHeight;
            inpFloorH.addEventListener('change', () => {
                const beforeState = captureBuildingsState();
                b.floorHeight = clampFloat(parseFloat(inpFloorH.value), 1, 20, b.floorHeight);
                inpFloorH.value = b.floorHeight;
                pushEditHistory(beforeState);
            });
            tdFloorH.appendChild(inpFloorH);

            // 户数
            const tdUnits = document.createElement('td');
            const inpUnits = document.createElement('input');
            inpUnits.type = 'number';
            inpUnits.min = 1;
            inpUnits.step = 1;
            inpUnits.value = b.units;
            inpUnits.addEventListener('change', () => {
                const beforeState = captureBuildingsState();
                b.units = clampInt(parseInt(inpUnits.value), 1, 50, b.units);
                delete b.unitsPerFloor;
                delete b.unitRatiosPerFloor;
                b.unitRatiosInput = '';
                inpUnits.value = b.units;
                pushEditHistory(beforeState);
                renderTable();
            });
            tdUnits.appendChild(inpUnits);

            // 本小区
            const tdOwn = document.createElement('td');
            const chkOwn = document.createElement('input');
            chkOwn.type = 'checkbox';
            chkOwn.checked = b.isThisCommunity !== false;
            chkOwn.addEventListener('change', () => {
                const beforeState = captureBuildingsState();
                b.isThisCommunity = !!chkOwn.checked;
                pushEditHistory(beforeState);
            });
            tdOwn.style.textAlign = 'center';
            tdOwn.appendChild(chkOwn);

            // 删除
            const tdOps = document.createElement('td');
            const btnDel = document.createElement('button');
            btnDel.className = 'btn-mini btn-danger';
            btnDel.textContent = i18n.t('editor.tableDelete');
            btnDel.addEventListener('click', event => {
                event.stopPropagation();
                deleteBuildingById(b.id, true);
            });
            tdOps.appendChild(btnDel);

            tr.appendChild(tdName);
            tr.appendChild(tdFloors);
            tr.appendChild(tdFloorH);
            tr.appendChild(tdUnits);
            tr.appendChild(tdOwn);
            tr.appendChild(tdOps);

            tableBody.appendChild(tr);

            const splitValidation = getSplitConfigValidation(b);
            const splitTr = document.createElement('tr');
            splitTr.className = 'split-config-row';

            const splitTd = document.createElement('td');
            splitTd.colSpan = TABLE_COLUMN_COUNT;

            const splitCard = document.createElement('div');
            splitCard.className = 'split-config-card';

            const splitTitle = document.createElement('div');
            splitTitle.className = 'split-config-title';
            splitTitle.textContent = i18n.t('editor.splitConfigTitle');
            const splitHeader = document.createElement('div');
            splitHeader.className = 'split-config-header';
            const visualEditButton = document.createElement('button');
            visualEditButton.type = 'button';
            visualEditButton.className = 'btn-mini btn-outline';
            visualEditButton.textContent = i18n.t('editor.tableVisualSplit');
            visualEditButton.addEventListener('click', event => {
                event.stopPropagation();
                openVisualSplitEditor(b.id);
            });
            splitHeader.appendChild(splitTitle);
            splitHeader.appendChild(visualEditButton);
            splitCard.appendChild(splitHeader);

            const splitGrid = document.createElement('div');
            splitGrid.className = 'split-config-grid';

            const angleField = document.createElement('div');
            angleField.className = 'split-config-field';
            const angleLabel = document.createElement('label');
            angleLabel.className = 'split-config-label';
            angleLabel.textContent = i18n.t('editor.splitAngle');
            const angleInput = document.createElement('input');
            angleInput.type = 'number';
            angleInput.step = '0.1';
            angleInput.min = '-180';
            angleInput.max = '180';
            angleInput.value = String(Number(b.unitSplitAngleDeg || 0));
            angleInput.addEventListener('change', () => {
                const beforeState = captureBuildingsState();
                b.unitSplitAngleDeg = normalizeAngle(parseFloat(angleInput.value));
                angleInput.value = String(b.unitSplitAngleDeg);
                pushEditHistory(beforeState);
            });
            angleField.appendChild(angleLabel);
            angleField.appendChild(angleInput);

            const numberingField = document.createElement('div');
            numberingField.className = 'split-config-field';
            const numberingLabel = document.createElement('label');
            numberingLabel.className = 'split-config-label';
            numberingLabel.textContent = i18n.t('editor.splitNumberingStartSide');
            const numberingSelect = document.createElement('select');
            const sideAOption = document.createElement('option');
            sideAOption.value = 'A';
            sideAOption.textContent = i18n.t('editor.splitNumberingSideA');
            const sideBOption = document.createElement('option');
            sideBOption.value = 'B';
            sideBOption.textContent = i18n.t('editor.splitNumberingSideB');
            numberingSelect.appendChild(sideAOption);
            numberingSelect.appendChild(sideBOption);
            numberingSelect.value = getBuildingUnitNumberingStartSide(b);
            numberingSelect.addEventListener('change', () => {
                const beforeState = captureBuildingsState();
                b.unitNumberingStartSide = normalizeUnitNumberingStartSide(numberingSelect.value);
                pushEditHistory(beforeState);
            });
            numberingField.appendChild(numberingLabel);
            numberingField.appendChild(numberingSelect);

            const ratiosField = document.createElement('div');
            ratiosField.className = 'split-config-field';
            const ratiosLabel = document.createElement('label');
            ratiosLabel.className = 'split-config-label';
            ratiosLabel.textContent = i18n.t('editor.splitRatios');
            const ratiosInput = document.createElement('textarea');
            ratiosInput.rows = Math.min(Math.max(parseInt(b.floors || 1, 10), 2), 4);
            ratiosInput.placeholder = i18n.t('editor.splitRatiosPlaceholder');
            ratiosInput.value = b.unitRatiosInput || '';
            let ratiosBeforeState = null;
            ratiosInput.addEventListener('focus', () => { ratiosBeforeState = captureBuildingsState(); });
            if (splitValidation.error) {
                ratiosInput.classList.add('split-config-input', 'invalid');
            }
            ratiosInput.addEventListener('input', () => {
                b.unitRatiosInput = ratiosInput.value;
                const validation = getSplitConfigValidation(b);
                ratiosInput.classList.toggle('split-config-input', !!validation.error);
                ratiosInput.classList.toggle('invalid', !!validation.error);
                helpText.classList.toggle('invalid', !!validation.error);
                helpText.textContent = validation.error
                    ? validation.error
                    : `${i18n.t('editor.splitRatiosHelp')} ${i18n.t('editor.splitRatiosExamples')}`;
            });
            ratiosInput.addEventListener('blur', () => {
                pushEditHistory(ratiosBeforeState);
                ratiosBeforeState = null;
            });
            const helpText = document.createElement('div');
            helpText.className = splitValidation.error ? 'split-config-help invalid' : 'split-config-help';
            helpText.textContent = splitValidation.error
                ? splitValidation.error
                : `${i18n.t('editor.splitRatiosHelp')} ${i18n.t('editor.splitRatiosExamples')}`;
            ratiosField.appendChild(ratiosLabel);
            ratiosField.appendChild(ratiosInput);
            ratiosField.appendChild(helpText);

            splitGrid.appendChild(angleField);
            splitGrid.appendChild(numberingField);
            splitGrid.appendChild(ratiosField);
            splitCard.appendChild(splitGrid);
            splitTd.appendChild(splitCard);
            splitTr.appendChild(splitTd);
            tableBody.appendChild(splitTr);
        });
        syncSelectedBuildingRow();
    }

    // ========== 应用默认值到所有楼栋 ==========
    btnApplyDefaultsAll.addEventListener('click', () => {
        const beforeState = captureBuildingsState();
        const validation = CONFIG.VALIDATION;
        const f = clampInt(parseInt(defFloorsEl.value), validation.FLOORS.MIN, validation.FLOORS.MAX, CONFIG.DEFAULTS.FLOORS);
        const h = clampFloat(parseFloat(defFloorHeightEl.value), validation.FLOOR_HEIGHT.MIN, validation.FLOOR_HEIGHT.MAX, CONFIG.DEFAULTS.FLOOR_HEIGHT);
        const u = clampInt(parseInt(defUnitsEl.value), validation.UNITS.MIN, validation.UNITS.MAX, CONFIG.DEFAULTS.UNITS_PER_FLOOR);
        const own = !!defIsThisCommunityEl.checked;
        const numberingStartSide = defUnitNumberingStartFromSideBEl?.checked ? 'B' : 'A';
        buildings = buildings.map(b => ({
            ...b,
            floors: f,
            floorHeight: h,
            units: u,
            unitsPerFloor: undefined,
            unitRatiosPerFloor: undefined,
            unitRatiosInput: '',
            isThisCommunity: own,
            unitNumberingStartSide: numberingStartSide
        }));
        buildings.forEach(ensureBuildingSplitState);
        pushEditHistory(beforeState);
        renderTable();
        draw();
    });

    // ========== 导出 JSON ==========
    document.getElementById('btnExport').addEventListener('click', () => {
        if (buildings.length === 0) {
            alert(i18n.t('editor.alertNoData'));
            return;
        }

        // 清理多边形
        buildings = buildings.map(b => {
            const eps = 0.75;
            const cleaned = sanitizePolygon(b.points, eps);
            return { ...b, points: cleaned };
        });

        // 计算边界中心
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        buildings.forEach(b => {
            b.points.forEach(p => {
                if (p.x < minX) minX = p.x;
                if (p.x > maxX) maxX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.y > maxY) maxY = p.y;
            });
        });
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        const round2 = n => Utils.roundTo(n, 2);
        const lat = parseFloat(projectLatEl.value);
        const lon = parseFloat(projectLonEl.value);
        const timeZone = projectTimeZoneEl.value.trim();
        if (!Number.isFinite(lat) || lat < -90 || lat > 90
            || !Number.isFinite(lon) || lon < -180 || lon > 180
            || !Utils.isValidTimeZone(timeZone)) {
            alert(i18n.t('editor.alertInvalidLocation'));
            return;
        }
        const northAngle = normalizeAngle(parseFloat(projectNorthAngleEl.value));
        projectNorthAngleEl.value = northAngle;

        try {
            const exportData = {
                version: CONFIG.APP.VERSION,
                latitude: lat,
                longitude: lon,
                timeZone,
                northAngle,
                scaleRatio: scaleRatio,
                origin: { x: centerX, y: centerY },
                buildings: buildings.map(b => {
                    ensureBuildingSplitState(b);
                    const splitRatiosResult = buildUnitRatiosExportValue(b);
                    if (splitRatiosResult.error) {
                        throw new Error(
                            i18n.t('editor.alertInvalidSplitConfig')
                                .replace('{0}', b.name || i18n.t('viewer.defaultBuildingName').replace('{0}', '?'))
                                .replace('{1}', splitRatiosResult.error)
                        );
                    }

                    const c = getPolygonCenter(b.points);
                    const cx = (c.x - centerX) * scaleRatio;
                    const cy = (c.y - centerY) * scaleRatio;

                    const splitAngle = Number.isFinite(Number(b.unitSplitAngleDeg))
                        ? normalizeAngle(Number(b.unitSplitAngleDeg))
                        : 0;
                    const numberingStartSide = getBuildingUnitNumberingStartSide(b);

                    return {
                        name: b.name,
                        floors: b.floors,
                        floorHeight: b.floorHeight,
                        units: b.units,
                        unitsPerFloor: Array.isArray(b.unitsPerFloor) ? b.unitsPerFloor.slice() : undefined,
                        totalHeight: b.floors * b.floorHeight,
                        isThisCommunity: b.isThisCommunity !== false,
                        shape: b.points.map(p => ({
                            x: round2((p.x - centerX) * scaleRatio),
                            y: round2((p.y - centerY) * scaleRatio)
                        })),
                        center: { x: round2(cx), y: round2(cy) },
                        unitRatiosPerFloor: splitRatiosResult.value || undefined,
                        unitSplitAngleDeg: Math.abs(splitAngle) > 1e-6 ? Utils.roundTo(splitAngle, 3) : undefined,
                        unitNumberingStartSide: numberingStartSide !== 'A' ? numberingStartSide : undefined
                    };
                })
            };

            const normalized = Utils.normalizeBuildingData(exportData);
            if (!normalized.valid) {
                throw new Error(normalized.errors.slice(0, 8).join('\n'));
            }
            Utils.downloadFile(JSON.stringify(normalized.data, null, 2), 'buildings_config.json', 'application/json');
        } catch (error) {
            alert(error?.message || i18n.t('editor.alertInvalidSplitConfig').replace('{0}', '').replace('{1}', ''));
        }
    });

    // ========== 默认参数输入校验 ==========
    [defFloorsEl, defFloorHeightEl, defUnitsEl].forEach(el => {
        el.addEventListener('change', () => {
            const validation = CONFIG.VALIDATION;
            defFloorsEl.value = clampInt(parseInt(defFloorsEl.value), validation.FLOORS.MIN, validation.FLOORS.MAX, CONFIG.DEFAULTS.FLOORS);
            defFloorHeightEl.value = clampFloat(parseFloat(defFloorHeightEl.value), validation.FLOOR_HEIGHT.MIN, validation.FLOOR_HEIGHT.MAX, CONFIG.DEFAULTS.FLOOR_HEIGHT);
            defUnitsEl.value = clampInt(parseInt(defUnitsEl.value), validation.UNITS.MIN, validation.UNITS.MAX, CONFIG.DEFAULTS.UNITS_PER_FLOOR);
        });
    });

    projectNorthAngleEl.addEventListener('change', () => {
        projectNorthAngleEl.value = normalizeAngle(parseFloat(projectNorthAngleEl.value));
    });

    // ========== 面板拖拽调整高度 ==========
    const topPane = document.getElementById('topPane');
    const bottomPane = document.getElementById('bottomPane');
    const outerResizer = document.getElementById('outerResizer');
    const tableWrapper = document.getElementById('table-wrapper');
    const tableResizer = document.getElementById('tableResizer');

    let outerResize = { active: false, startY: 0, startHeight: 0 };
    let innerResize = { active: false, startY: 0, startHeight: 0 };

    function setTopPaneHeight(px) {
        const sidebar = document.getElementById('sidebar');
        const minPx = 160;
        const maxPx = Math.max(160, sidebar.clientHeight - 240);
        const clamped = Math.max(minPx, Math.min(px, maxPx));
        topPane.style.height = clamped + 'px';
        clampTableHeightToBottomPane();
    }

    function tableMaxHeight() {
        const reserve = 130;
        return Math.max(120, bottomPane.clientHeight - reserve);
    }

    function setTableHeight(px) {
        const clamped = Math.max(120, Math.min(px, tableMaxHeight()));
        tableWrapper.style.height = clamped + 'px';
    }

    function clampTableHeightToBottomPane() {
        const maxH = tableMaxHeight();
        const curH = tableWrapper.getBoundingClientRect().height;
        if (curH > maxH) {
            tableWrapper.style.height = maxH + 'px';
        }
    }

    outerResizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        outerResize.active = true;
        outerResize.startY = e.clientY;
        outerResize.startHeight = topPane.getBoundingClientRect().height;
        outerResizer.classList.add('active');
        document.body.style.cursor = 'row-resize';
    });

    tableResizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        innerResize.active = true;
        innerResize.startY = e.clientY;
        innerResize.startHeight = tableWrapper.getBoundingClientRect().height;
        tableResizer.classList.add('active');
        document.body.style.cursor = 'row-resize';
    });

    window.addEventListener('mousemove', (e) => {
        if (outerResize.active) {
            const delta = e.clientY - outerResize.startY;
            setTopPaneHeight(outerResize.startHeight + delta);
        }
        if (innerResize.active) {
            const delta = e.clientY - innerResize.startY;
            setTableHeight(innerResize.startHeight + delta);
        }
    });

    window.addEventListener('mouseup', () => {
        if (outerResize.active) {
            outerResize.active = false;
            outerResizer.classList.remove('active');
            document.body.style.cursor = '';
        }
        if (innerResize.active) {
            innerResize.active = false;
            tableResizer.classList.remove('active');
            document.body.style.cursor = '';
        }
    });

    // ========== 初始化 ==========
    window.addEventListener('load', () => {
        initCitySelector();
        initLanguageSwitcher();
        projectNorthAngleEl.value = CONFIG.DEFAULTS.NORTH_ANGLE;

        const initialTop = Math.max(160, Math.min(window.innerHeight * 0.6, window.innerHeight * 0.44));
        topPane.style.height = initialTop + 'px';
        const initialTable = Math.max(120, Math.min(window.innerHeight * 0.7, window.innerHeight * 0.28));
        tableWrapper.style.height = initialTable + 'px';
        clampTableHeightToBottomPane();
    });

    window.addEventListener('resize', () => {
        clampTableHeightToBottomPane();
    });

    // ========== 语言切换功能 ==========
    function initLanguageSwitcher() {
        const langBtns = document.querySelectorAll('.lang-btn');
        
        // 设置初始激活状态
        updateLangButtons();
        
        // 绑定点击事件
        langBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const lang = btn.dataset.lang;
                if (i18n.setLanguage(lang)) {
                    updateLangButtons();
                    updatePageLanguage();
                }
            });
        });
        
        // 初始化页面语言
        updatePageLanguage();
    }

    function updateLangButtons() {
        const currentLang = i18n.getCurrentLanguage();
        document.querySelectorAll('.lang-btn').forEach(btn => {
            if (btn.dataset.lang === currentLang) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    function updatePageLanguage() {
        // 更新所有带 data-i18n 属性的元素
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const translation = i18n.t(key);
            
            if (el.tagName === 'INPUT' && (el.type === 'button' || el.type === 'submit')) {
                el.value = translation;
            } else if (el.tagName === 'OPTION') {
                el.textContent = translation;
            } else {
                el.textContent = translation;
            }
        });
        
        // 更新页面标题
        document.title = i18n.t('editor.title');
        
        // 更新 HTML lang 属性
        document.documentElement.lang = i18n.getCurrentLanguage() === 'zh' ? 'zh-CN' : 'en';
        
        // 更新缩放信息
        updateZoomInfo();
        
        // 更新比例尺状态
        updateScaleStatus();
        
        // 更新绘制模式按钮
        updateDrawModeButton();

        // 重新渲染表格中的动态文案
        renderTable();
        wrapper.dataset.dragLabel = i18n.t('editor.dragDropLabel');
        const closeSplitButton = document.getElementById('btnCloseSplitEditor');
        closeSplitButton.title = i18n.t('common.close');
        closeSplitButton.setAttribute('aria-label', i18n.t('common.close'));
        if (visualSplitState) {
            Array.from(visualSplitFloor.options).forEach((option, floorIndex) => {
                option.textContent = i18n.t('editor.visualSplitFloorOption').replace('{0}', floorIndex + 1);
            });
            renderVisualSplitEditor();
        }
    }

    function updateZoomInfo() {
        const zoomPercent = Math.round(viewScale * 100);
        zoomInfo.innerText = `${i18n.t('editor.zoomInfo')}: ${zoomPercent}%`;
    }

    function updateScaleStatus() {
        const statusEl = document.getElementById('scaleStatus');
        if (scaleRatio === 0) {
            statusEl.setAttribute('data-i18n', 'editor.scaleNotSet');
            statusEl.textContent = i18n.t('editor.scaleNotSet');
        } else {
            statusEl.removeAttribute('data-i18n');
            statusEl.textContent = `${i18n.t('editor.scaleSet')} (1px ≈ ${scaleRatio.toFixed(4)}m)`;
        }
    }

    function updateDrawModeButton() {
        if (mode === 'drawing') {
            btnDrawMode.setAttribute('data-i18n', 'editor.modeDrawing');
            btnDrawMode.innerText = i18n.t('editor.modeDrawing');
            btnDrawMode.style.background = '#28a745';
        } else {
            btnDrawMode.setAttribute('data-i18n', 'editor.modeIdle');
            btnDrawMode.innerText = i18n.t('editor.modeIdle');
            btnDrawMode.style.background = '#6c757d';
        }
        btnDrawMode.style.color = 'white';
        updateDrawActionButtons();
    }

})();
