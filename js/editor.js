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
    const zoomInfo = document.getElementById('zoom-info');
    const emptyTip = document.getElementById('empty-tip');

    // 位置/纬度配置元素
    const citySelectEl = document.getElementById('citySelect');
    const projectLatEl = document.getElementById('projectLat');
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

    // 使用配置常量
    const CLOSE_EPS_BASE = CONFIG.EDITOR.CLOSE_EPSILON;
    const SANITIZE_EPS = CONFIG.EDITOR.SANITIZE_EPSILON;
    const TABLE_COLUMN_COUNT = 6;

    // ========== 工具函数（使用 Utils 模块）==========
    const { distance, pointsEqual, clampInt, clampFloat, getPolygonCenter, normalizeAngle } = Utils;

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

    function unitRatiosMatch(a, b, eps = 1e-6) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (Math.abs((Number(a[i]) || 0) - (Number(b[i]) || 0)) > eps) return false;
        }
        return true;
    }

    function getSharedFirstFloorUnitRatios(unitRatiosPerFloor, floors, units) {
        const totalFloors = Math.max(1, parseInt(floors || 1, 10));
        if (!Array.isArray(unitRatiosPerFloor) || unitRatiosPerFloor.length === 0) return null;

        const first = normalizeUnitRatios(unitRatiosPerFloor[0], units);
        if (!first) return null;

        for (let i = 1; i < totalFloors; i++) {
            const next = unitRatiosPerFloor[i];
            if (next == null) continue;

            const normalized = normalizeUnitRatios(next, units);
            if (!normalized || !unitRatiosMatch(normalized, first)) {
                return null;
            }
        }

        return first;
    }

    function serializeUnitRatiosPerFloor(unitRatiosPerFloor, floors, units) {
        const totalFloors = Math.max(1, parseInt(floors || 1, 10));
        const perFloor = [];
        let hasAny = false;

        for (let floorIndex = 0; floorIndex < totalFloors; floorIndex++) {
            const normalized = normalizeUnitRatios(unitRatiosPerFloor?.[floorIndex], units);
            perFloor.push(normalized);
            if (normalized) hasAny = true;
        }

        if (!hasAny) return null;

        const sharedFirst = getSharedFirstFloorUnitRatios(perFloor, totalFloors, units);
        if (sharedFirst) return [sharedFirst.slice()];
        return perFloor;
    }

    function formatUnitRatiosText(building) {
        const floors = Math.max(1, parseInt(building?.floors || 1, 10));
        const units = Math.max(1, parseInt(building?.units || 1, 10));
        const serialized = serializeUnitRatiosPerFloor(building?.unitRatiosPerFloor, floors, units);
        if (!Array.isArray(serialized) || serialized.length === 0) return '';

        return serialized
            .map(line => Array.isArray(line) ? line.map(value => Number(value).toFixed(4).replace(/0+$/, '').replace(/\.$/, '')).join(', ') : '')
            .filter(Boolean)
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

    function parseUnitRatiosInput(text, floors, units) {
        const raw = String(text || '').trim();
        if (!raw) return { value: null };

        const lines = raw
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean);

        if (lines.length !== 1 && lines.length !== floors) {
            return { error: i18n.t('editor.splitRatiosErrorLineCount') };
        }

        const parsed = [];
        for (const line of lines) {
            const result = parseUnitRatioLine(line, units);
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
        const units = Math.max(1, parseInt(building?.units || 1, 10));
        const parsed = parseUnitRatiosInput(building?.unitRatiosInput, floors, units);
        if (parsed.error) return parsed;
        if (!parsed.value) return { value: null };

        const serialized = serializeUnitRatiosPerFloor(parsed.value, floors, units);
        if (!serialized) return { value: null };

        const equal = buildEqualUnitRatios(units);
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
        const units = Math.max(1, parseInt(building?.units || 1, 10));
        return parseUnitRatiosInput(building?.unitRatiosInput, floors, units);
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
    function initCitySelector() {
        if (typeof generateCityOptions === 'function') {
            const defaultCity = CONFIG.DEFAULTS.CITY;
            citySelectEl.innerHTML = generateCityOptions(defaultCity);
            
            // 设置默认纬度
            const defaultLat = getLatitudeByCity(defaultCity);
            if (defaultLat) {
                projectLatEl.value = defaultLat;
            } else {
                projectLatEl.value = CONFIG.DEFAULTS.LATITUDE;
            }
        }

        citySelectEl.addEventListener('change', function() {
            const selectedOption = this.options[this.selectedIndex];
            const lat = selectedOption.dataset.lat;
            if (lat) {
                projectLatEl.value = parseFloat(lat);
            }
        });

        // 手动修改纬度时清空城市选择
        projectLatEl.addEventListener('input', function() {
            // 检查是否匹配某个城市
            const inputLat = parseFloat(this.value);
            let matched = false;
            for (const option of citySelectEl.options) {
                if (option.dataset.lat && Math.abs(parseFloat(option.dataset.lat) - inputLat) < 0.01) {
                    citySelectEl.value = option.value;
                    matched = true;
                    break;
                }
            }
            if (!matched) {
                citySelectEl.value = '';
            }
        });
    }

    // ========== 图片加载 ==========
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            image.onload = () => {
                canvas.style.display = 'block';
                emptyTip.style.display = 'none';
                canvas.width = image.width;
                canvas.height = image.height;
                isImageLoaded = true;
                document.getElementById('btnStartScale').disabled = false;
                resetView();
                draw();
            };
            image.src = event.target.result;
        };
        reader.onerror = () => {
            alert(i18n.t('viewer.errorFileRead'));
        };
        reader.readAsDataURL(file);
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
        if (mode === 'drawing' || mode === 'scaling') {
            wrapper.style.cursor = 'crosshair';
        } else {
            wrapper.style.cursor = 'grab';
        }
    }

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
        const isSpacePressed = e.getModifierState && e.getModifierState(" ");

        // 拖拽视图
        if (e.button === 1 || (mode === 'idle' && e.button === 0) || (isSpacePressed && e.button === 0)) {
            isDragging = true;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            wrapper.classList.add('grabbing');
            e.preventDefault();
            return;
        }

        // 左键操作
        if (e.button === 0) {
            const p = getCanvasCoordinates(e);
            if (mode === 'scaling') {
                scalePoints.push(p);
                if (scalePoints.length === 2) {
                    mode = 'idle';
                    updateCursor();
                    document.getElementById('scaleInputArea').style.display = 'block';
                }
                draw();
            } else if (mode === 'drawing') {
                currentPoly.push(p);
                draw();
            }
        }

        // 右键撤销
        if (e.button === 2) {
            if (mode === 'drawing' && currentPoly.length > 0) {
                currentPoly.pop();
                draw();
            }
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
        if (mode === 'drawing') draw();
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
        wrapper.classList.remove('grabbing');
    });

    canvas.addEventListener('contextmenu', e => e.preventDefault());

    // ========== 触摸事件支持 ==========
    let touchStartTime = 0;
    let lastTouchDist = 0;

    function getTouchCanvasCoords(touch) {
        const rect = wrapper.getBoundingClientRect();
        return {
            x: (touch.clientX - rect.left - viewX) / viewScale,
            y: (touch.clientY - rect.top - viewY) / viewScale
        };
    }

    wrapper.addEventListener('touchstart', (e) => {
        if (!isImageLoaded) return;
        e.preventDefault();

        if (e.touches.length === 2) {
            // 双指缩放
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            lastTouchDist = Math.hypot(dx, dy);
            return;
        }

        if (e.touches.length === 1) {
            touchStartTime = Date.now();
            const touch = e.touches[0];

            if (mode === 'idle') {
                isDragging = true;
                lastMouseX = touch.clientX;
                lastMouseY = touch.clientY;
                wrapper.classList.add('grabbing');
            } else if (mode === 'scaling') {
                const p = getTouchCanvasCoords(touch);
                scalePoints.push(p);
                if (scalePoints.length === 2) {
                    mode = 'idle';
                    updateCursor();
                    document.getElementById('scaleInputArea').style.display = 'block';
                }
                draw();
            } else if (mode === 'drawing') {
                const p = getTouchCanvasCoords(touch);
                currentPoly.push(p);
                draw();
            }
        }
    }, { passive: false });

    wrapper.addEventListener('touchmove', (e) => {
        if (!isImageLoaded) return;
        e.preventDefault();

        if (e.touches.length === 2 && lastTouchDist > 0) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.hypot(dx, dy);
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
            if (isDragging) {
                viewX += touch.clientX - lastMouseX;
                viewY += touch.clientY - lastMouseY;
                lastMouseX = touch.clientX;
                lastMouseY = touch.clientY;
                updateTransform();
            } else if (mode === 'drawing') {
                mousePos = getTouchCanvasCoords(touch);
                draw();
            }
        }
    }, { passive: false });

    wrapper.addEventListener('touchend', (e) => {
        if (!isImageLoaded) return;

        if (e.touches.length === 0) {
            lastTouchDist = 0;
            if (isDragging) {
                isDragging = false;
                wrapper.classList.remove('grabbing');
            }
        }
    });

    // ========== 绘图函数 ==========
    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!isImageLoaded) return;
        ctx.drawImage(image, 0, 0);

        // 绘制已完成的楼栋
        buildings.forEach(b => {
            drawPolygon(b.points, 'rgba(0, 123, 255, 0.28)', '#007bff');
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
        currentPoly = [];
        renderTable();
        draw();
    }

    // ========== 比例尺标定 ==========
    document.getElementById('btnStartScale').addEventListener('click', () => {
        scalePoints = [];
        mode = 'scaling';
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
        document.getElementById('scaleStatus').innerText = `${i18n.t('editor.scaleSet')} (1px ≈ ${scaleRatio.toFixed(4)}m)`;
        document.getElementById('scaleInputArea').style.display = 'none';
        toggleDrawMode(true);
        renderTable();
    });

    // ========== 绘制模式切换 ==========
    const btnDrawMode = document.getElementById('btnDrawMode');
    btnDrawMode.addEventListener('click', () => {
        toggleDrawMode(mode !== 'drawing');
    });

    function toggleDrawMode(active) {
        if (active) {
            mode = 'drawing';
            btnDrawMode.innerText = i18n.t('editor.modeDrawing');
            btnDrawMode.style.background = "#28a745";
            btnDrawMode.style.color = "white";
        } else {
            mode = 'idle';
            btnDrawMode.innerText = i18n.t('editor.modeIdle');
            btnDrawMode.style.background = "#6c757d";
            btnDrawMode.style.color = "white";
            currentPoly = [];
            draw();
        }
        updateCursor();
    }

    // ========== 表格渲染 ==========
    const tableBody = document.getElementById('tableBody');

    function renderTable() {
        tableBody.innerHTML = '';
        buildings.forEach((b, i) => {
            ensureBuildingSplitState(b);
            const tr = document.createElement('tr');

            // 名称
            const tdName = document.createElement('td');
            const inpName = document.createElement('input');
            inpName.type = 'text';
            inpName.value = b.name;
            inpName.placeholder = i18n.t('editor.namePlaceholder');
            inpName.addEventListener('input', () => {
                b.name = inpName.value || i18n.t('viewer.defaultBuildingName').replace('{0}', i + 1);
                draw();
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
                b.floors = clampInt(parseInt(inpFloors.value), 1, 300, b.floors);
                inpFloors.value = b.floors;
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
                b.floorHeight = clampFloat(parseFloat(inpFloorH.value), 1, 20, b.floorHeight);
                inpFloorH.value = b.floorHeight;
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
                b.units = clampInt(parseInt(inpUnits.value), 1, 50, b.units);
                inpUnits.value = b.units;
                renderTable();
            });
            tdUnits.appendChild(inpUnits);

            // 本小区
            const tdOwn = document.createElement('td');
            const chkOwn = document.createElement('input');
            chkOwn.type = 'checkbox';
            chkOwn.checked = b.isThisCommunity !== false;
            chkOwn.addEventListener('change', () => {
                b.isThisCommunity = !!chkOwn.checked;
            });
            tdOwn.style.textAlign = 'center';
            tdOwn.appendChild(chkOwn);

            // 删除
            const tdOps = document.createElement('td');
            const btnDel = document.createElement('button');
            btnDel.className = 'btn-mini btn-danger';
            btnDel.textContent = i18n.t('editor.tableDelete');
            btnDel.addEventListener('click', () => {
                if (confirm(i18n.t('editor.alertConfirmDelete'))) {
                    buildings.splice(i, 1);
                    renderTable();
                    draw();
                }
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
            splitCard.appendChild(splitTitle);

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
                b.unitSplitAngleDeg = normalizeAngle(parseFloat(angleInput.value));
                angleInput.value = String(b.unitSplitAngleDeg);
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
                b.unitNumberingStartSide = normalizeUnitNumberingStartSide(numberingSelect.value);
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
    }

    // ========== 应用默认值到所有楼栋 ==========
    btnApplyDefaultsAll.addEventListener('click', () => {
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
            isThisCommunity: own,
            unitNumberingStartSide: numberingStartSide
        }));
        buildings.forEach(ensureBuildingSplitState);
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
        const lat = parseFloat(projectLatEl.value) || CONFIG.DEFAULTS.LATITUDE;
        const northAngle = normalizeAngle(parseFloat(projectNorthAngleEl.value));
        projectNorthAngleEl.value = northAngle;

        try {
            const exportData = {
                version: CONFIG.APP.VERSION,
                latitude: lat,
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

            Utils.downloadFile(JSON.stringify(exportData, null, 2), 'buildings_config.json', 'application/json');
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
        } else {
            btnDrawMode.setAttribute('data-i18n', 'editor.modeIdle');
            btnDrawMode.innerText = i18n.t('editor.modeIdle');
        }
    }

})();
