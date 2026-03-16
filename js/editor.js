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
    const jsonImportInput = document.getElementById('jsonImportInput');
    const btnImportJson = document.getElementById('btnImportJson');
    const exportFilenameEl = document.getElementById('exportFilename');

    const splitModalOverlay = document.getElementById('splitModalOverlay');
    const splitModalClose = document.getElementById('splitModalClose');
    const splitFloorSelect = document.getElementById('splitFloorSelect');
    const splitUnitsText = document.getElementById('splitUnitsText');
    const splitBar = document.getElementById('splitBar');
    const splitTableBody = document.getElementById('splitTableBody');
    const splitResetEqualBtn = document.getElementById('splitResetEqual');
    const splitApplyAllFloorsBtn = document.getElementById('splitApplyAllFloors');
    const splitSaveBtn = document.getElementById('splitSave');
    const splitAngleInput = document.getElementById('splitAngleInput');
    const splitAngleSlider = document.getElementById('splitAngleSlider');
    const splitPreviewCanvas = document.getElementById('splitPreviewCanvas');
    const splitFloorsInput = document.getElementById('splitFloorsInput');
    const splitUseAreasChk = document.getElementById('splitUseAreasChk');
    const splitAreaTh = document.getElementById('splitAreaTh');
    const splitUnitIndexInput = document.getElementById('splitUnitIndexInput');
    const splitModeSelect = document.getElementById('splitModeSelect');
    const splitAdvancedToolbar = document.getElementById('splitAdvancedToolbar');
    const splitToolLine = document.getElementById('splitToolLine');
    const splitToolUnit = document.getElementById('splitToolUnit');
    const splitClearLines = document.getElementById('splitClearLines');
    const splitBarWrap = document.getElementById('splitBarWrap');
    const splitTableWrap = document.getElementById('splitTableWrap');
    const splitBasicActions = document.getElementById('splitBasicActions');

    // 位置/纬度配置元素
    const citySelectEl = document.getElementById('citySelect');
    const projectLatEl = document.getElementById('projectLat');

    // 默认参数元素
    const defFloorsEl = document.getElementById('defFloors');
    const defFloorHeightEl = document.getElementById('defFloorHeight');
    const defUnitsEl = document.getElementById('defUnits');
    const defIsThisCommunityEl = document.getElementById('defIsThisCommunity');
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

    let splitState = {
        open: false,
        buildingIndex: -1,
        floorIndex: 0,
        mode: 'basic',
        activeTool: 'line',
        cutLines: [],
        unitCenters: [],
        draftLine: [],
        lineCursor: null,
        ratios: [],
        areas: [],
        draggingHandle: null,
        angleDeg: 0,
        barDom: { segs: [], handles: [] },
        useAreas: false,
        draftRatiosPerFloor: [],
        draftAreasPerFloor: [],
        preview: null,
        hoverBoundaryIndex: -1,
        draggingBoundary: null
    };

    // 使用配置常量
    const CLOSE_EPS_BASE = CONFIG.EDITOR.CLOSE_EPSILON;
    const SANITIZE_EPS = CONFIG.EDITOR.SANITIZE_EPSILON;

    // ========== 工具函数（使用 Utils 模块）==========
    const { distance, pointsEqual, clampInt, clampFloat, getPolygonCenter, deepClone } = Utils;

    function buildEqualRatios(n) {
        const k = Math.max(1, parseInt(n || 1, 10));
        const v = 1 / k;
        return new Array(k).fill(v);
    }

    function normalizeRatios(ratios) {
        if (!Array.isArray(ratios) || ratios.length === 0) return [1];
        const cleaned = ratios.map(v => Math.max(0, Number(v) || 0));
        const sum = cleaned.reduce((a, b) => a + b, 0);
        if (sum <= 1e-9) return buildEqualRatios(cleaned.length);
        return cleaned.map(v => v / sum);
    }

    function clampHandlePos(pos, left, right) {
        const p = Number(pos);
        if (!isFinite(p)) return left;
        return Math.max(left, Math.min(p, right));
    }

    function clampAngleDeg(deg) {
        const d = Number(deg);
        if (!isFinite(d)) return 0;
        let v = Math.round(d);
        while (v > 180) v -= 360;
        while (v < -180) v += 360;
        return v;
    }

    function axisFromAngleDeg(angleDeg) {
        const rad = clampAngleDeg(angleDeg) * Math.PI / 180;
        return { x: Math.cos(rad), y: Math.sin(rad) };
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
            points: cleaned
        };
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
            tdOps.style.whiteSpace = 'nowrap';
            const btnSplit = document.createElement('button');
            btnSplit.className = 'btn-mini btn-outline';
            btnSplit.textContent = i18n.t('editor.tableSplit');
            btnSplit.addEventListener('click', () => {
                openSplitModal(i);
            });
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
            tdOps.appendChild(btnSplit);
            tdOps.appendChild(btnDel);

            tr.appendChild(tdName);
            tr.appendChild(tdFloors);
            tr.appendChild(tdFloorH);
            tr.appendChild(tdUnits);
            tr.appendChild(tdOwn);
            tr.appendChild(tdOps);

            tableBody.appendChild(tr);
        });
    }

    // ========== 应用默认值到所有楼栋 ==========
    btnApplyDefaultsAll.addEventListener('click', () => {
        const validation = CONFIG.VALIDATION;
        const f = clampInt(parseInt(defFloorsEl.value), validation.FLOORS.MIN, validation.FLOORS.MAX, CONFIG.DEFAULTS.FLOORS);
        const h = clampFloat(parseFloat(defFloorHeightEl.value), validation.FLOOR_HEIGHT.MIN, validation.FLOOR_HEIGHT.MAX, CONFIG.DEFAULTS.FLOOR_HEIGHT);
        const u = clampInt(parseInt(defUnitsEl.value), validation.UNITS.MIN, validation.UNITS.MAX, CONFIG.DEFAULTS.UNITS_PER_FLOOR);
        const own = !!defIsThisCommunityEl.checked;
        buildings = buildings.map(b => ({ ...b, floors: f, floorHeight: h, units: u, isThisCommunity: own }));
        renderTable();
        draw();
    });

    // ========== 导出 JSON ==========
    function normalizeExportFilename(name) {
        const s = String(name ?? '').trim();
        const base = s || 'buildings_config.json';
        return base.toLowerCase().endsWith('.json') ? base : (base + '.json');
    }

    document.getElementById('btnExport').addEventListener('click', async () => {
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

        const exportData = {
            version: CONFIG.APP.VERSION,
            latitude: lat,
            scaleRatio: scaleRatio,
            origin: { x: centerX, y: centerY },
            buildings: buildings.map(b => {
                const c = getPolygonCenter(b.points);
                const cx = (c.x - centerX) * scaleRatio;
                const cy = (c.y - centerY) * scaleRatio;

                let unitRatiosPerFloor = null;
                if (Array.isArray(b.unitRatiosPerFloor) && b.unitRatiosPerFloor.length > 0) {
                    const floors = Math.max(1, parseInt(b.floors || 1, 10));
                    const per = [];
                    for (let fi = 0; fi < floors; fi++) {
                        const units = Math.max(1, parseInt(b.units || 1, 10));
                        const r = b.unitRatiosPerFloor[fi];
                        if (Array.isArray(r) && r.length === units) {
                            const nr = normalizeRatios(r).map(x => Utils.roundTo(x, 6));
                            per.push(nr);
                        } else {
                            per.push(null);
                        }
                    }
                    if (per.some(v => Array.isArray(v))) unitRatiosPerFloor = per;
                }

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
                    unitRatiosPerFloor,
                    unitSplitAngleDeg: (typeof b.unitSplitAngleDeg === 'number' && isFinite(b.unitSplitAngleDeg)) ? clampAngleDeg(b.unitSplitAngleDeg) : undefined,
                    advancedSplit: !!b.advancedSplit,
                    cutLines: Array.isArray(b.cutLines) ? deepClone(b.cutLines) : [],
                    unitCenters: Array.isArray(b.unitCenters) ? deepClone(b.unitCenters) : []
                };
            })
        };

        const filename = normalizeExportFilename(exportFilenameEl?.value);
        const content = JSON.stringify(exportData, null, 2);
        try {
            if (window.showSaveFilePicker) {
                const handle = await window.showSaveFilePicker({
                    suggestedName: filename,
                    types: [
                        { description: 'JSON', accept: { 'application/json': ['.json'] } }
                    ]
                });
                const writable = await handle.createWritable();
                await writable.write(content);
                await writable.close();
            } else {
                Utils.downloadFile(content, filename, 'application/json');
            }
        } catch (e) {
            if (e && e.name === 'AbortError') return;
            Utils.downloadFile(content, filename, 'application/json');
        }
    });

    function applyImportedData(data) {
        const sr = Number(data?.scaleRatio);
        const origin = data?.origin;
        const ox = Number(origin?.x);
        const oy = Number(origin?.y);
        if (!(sr > 0) || !isFinite(ox) || !isFinite(oy)) {
            alert(i18n.t('editor.alertImportMissingTransform'));
            return;
        }

        const list = Array.isArray(data?.buildings) ? data.buildings : [];
        const imported = [];
        for (let i = 0; i < list.length; i++) {
            const b = list[i];
            const shape = Array.isArray(b?.shape) ? b.shape : [];
            if (shape.length < 3) continue;
            const pts = shape.map(p => ({
                x: ox + (Number(p?.x) || 0) / sr,
                y: oy + (Number(p?.y) || 0) / sr
            }));
            const cleaned = sanitizePolygon(pts, 0.75);
            if (cleaned.length < 3) continue;

            const floors = clampInt(parseInt(b?.floors), CONFIG.VALIDATION.FLOORS.MIN, CONFIG.VALIDATION.FLOORS.MAX, CONFIG.DEFAULTS.FLOORS);
            const floorHeight = clampFloat(parseFloat(b?.floorHeight), CONFIG.VALIDATION.FLOOR_HEIGHT.MIN, CONFIG.VALIDATION.FLOOR_HEIGHT.MAX, CONFIG.DEFAULTS.FLOOR_HEIGHT);
            const units = clampInt(parseInt(b?.units), CONFIG.VALIDATION.UNITS.MIN, CONFIG.VALIDATION.UNITS.MAX, CONFIG.DEFAULTS.UNITS_PER_FLOOR);
            const name = (b?.name ?? '').toString().trim() || i18n.t('viewer.defaultBuildingName').replace('{0}', i + 1);
            const own = (typeof b?.isThisCommunity === 'boolean') ? b.isThisCommunity : true;

            imported.push({
                id: Date.now().toString(36) + Math.random().toString(36).slice(2),
                name,
                floors,
                floorHeight,
                units,
                isThisCommunity: own,
                points: cleaned,
                unitRatiosPerFloor: Array.isArray(b?.unitRatiosPerFloor) ? b.unitRatiosPerFloor : null,
                unitSplitAngleDeg: (typeof b?.unitSplitAngleDeg === 'number' && isFinite(b.unitSplitAngleDeg)) ? clampAngleDeg(b.unitSplitAngleDeg) : undefined,
                advancedSplit: !!b?.advancedSplit,
                cutLines: Array.isArray(b?.cutLines) ? deepClone(b.cutLines) : [],
                unitCenters: Array.isArray(b?.unitCenters) ? deepClone(b.unitCenters) : []
            });
        }

        scaleRatio = sr;
        if (typeof data?.latitude === 'number' && isFinite(data.latitude)) {
            projectLatEl.value = data.latitude;
        }

        buildings = imported;
        updateScaleStatus();
        toggleDrawMode(true);
        renderTable();
        if (isImageLoaded) draw();
    }

    function importJsonFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                applyImportedData(data);
            } catch (e) {
                alert(i18n.t('editor.alertImportFailed'));
            }
        };
        reader.onerror = () => {
            alert(i18n.t('editor.alertImportFailed'));
        };
        reader.readAsText(file);
    }

    if (btnImportJson && jsonImportInput) {
        btnImportJson.addEventListener('click', () => {
            const file = jsonImportInput.files?.[0];
            if (file) importJsonFile(file);
            else jsonImportInput.click();
        });
        jsonImportInput.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (file) importJsonFile(file);
        });
    }

    function openSplitModal(buildingIndex) {
        const b = buildings[buildingIndex];
        if (!b) return;
        const floors = Math.max(1, parseInt(b.floors || 1, 10));
        const units = Math.max(1, parseInt(b.units || 1, 10));

        if (!Array.isArray(b.unitRatiosPerFloor) || b.unitRatiosPerFloor.length !== floors) {
            b.unitRatiosPerFloor = new Array(floors).fill(null);
        }

        splitState.draftRatiosPerFloor = new Array(floors).fill(null).map((_, i) => {
            const r = b.unitRatiosPerFloor?.[i];
            if (Array.isArray(r) && r.length === units) return normalizeRatios(r);
            return null;
        });
        splitState.draftAreasPerFloor = new Array(floors).fill(null);

        rebuildFloorSelect(floors);

        splitUnitsText.textContent = String(units);
        if (splitFloorsInput) splitFloorsInput.value = String(floors);

        splitState.open = true;
        splitState.buildingIndex = buildingIndex;
        splitState.floorIndex = 0;
        splitState.mode = b.advancedSplit ? 'advanced' : 'basic';
        splitState.activeTool = 'line';
        splitState.cutLines = deepClone(Array.isArray(b.cutLines) ? b.cutLines : []);
        splitState.unitCenters = deepClone(Array.isArray(b.unitCenters) ? b.unitCenters : []);
        splitState.draftLine = [];
        splitState.lineCursor = null;
        splitState.areas = new Array(units).fill('');
        splitFloorSelect.value = '0';

        const r0 = splitState.draftRatiosPerFloor[0];
        splitState.ratios = (Array.isArray(r0) && r0.length === units) ? normalizeRatios(r0) : buildEqualRatios(units);
        splitState.angleDeg = (typeof b.unitSplitAngleDeg === 'number' && isFinite(b.unitSplitAngleDeg)) ? clampAngleDeg(b.unitSplitAngleDeg) : 0;
        splitAngleInput.value = String(splitState.angleDeg);
        splitAngleSlider.value = String(splitState.angleDeg);
        splitState.useAreas = false;
        splitUseAreasChk.checked = false;
        splitState.preview = null;
        splitState.hoverBoundaryIndex = -1;
        splitState.draggingBoundary = null;
        applySplitModeUI();

        if (splitUnitIndexInput) {
            splitUnitIndexInput.min = '1';
            splitUnitIndexInput.max = String(units);
            splitUnitIndexInput.value = String(clampInt(parseInt(splitUnitIndexInput.value), 1, units, 1));
        }

        splitModalOverlay.style.display = 'flex';
        requestAnimationFrame(() => {
            if (!splitState.open) return;
            renderSplitUI();
        });
    }

    function rebuildFloorSelect(totalFloors) {
        splitFloorSelect.innerHTML = '';
        for (let i = 0; i < totalFloors; i++) {
            const opt = document.createElement('option');
            opt.value = String(i);
            opt.textContent = String(i + 1);
            splitFloorSelect.appendChild(opt);
        }
    }

    if (splitFloorsInput) {
        splitFloorsInput.addEventListener('change', () => {
            const b = buildings[splitState.buildingIndex];
            if (!b || !splitState.open) return;
            storeCurrentSplitDraft();

            const validation = CONFIG.VALIDATION;
            const nextFloors = clampInt(parseInt(splitFloorsInput.value), validation.FLOORS.MIN, validation.FLOORS.MAX, Math.max(1, b.floors || 1));
            splitFloorsInput.value = String(nextFloors);
            if (nextFloors === b.floors) return;

            const units = Math.max(1, parseInt(b.units || 1, 10));
            b.floors = nextFloors;

            if (Array.isArray(b.unitRatiosPerFloor)) {
                const old = b.unitRatiosPerFloor.slice();
                b.unitRatiosPerFloor = new Array(nextFloors).fill(null).map((_, i) => old[i] ?? null);
            }

            const oldDraftRatios = splitState.draftRatiosPerFloor.slice();
            const oldDraftAreas = splitState.draftAreasPerFloor.slice();
            splitState.draftRatiosPerFloor = new Array(nextFloors).fill(null).map((_, i) => oldDraftRatios[i] ?? null);
            splitState.draftAreasPerFloor = new Array(nextFloors).fill(null).map((_, i) => oldDraftAreas[i] ?? null);

            rebuildFloorSelect(nextFloors);
            splitState.floorIndex = Math.max(0, Math.min(nextFloors - 1, splitState.floorIndex));
            splitFloorSelect.value = String(splitState.floorIndex);

            const r = splitState.draftRatiosPerFloor?.[splitState.floorIndex];
            splitState.ratios = (Array.isArray(r) && r.length === units) ? normalizeRatios(r) : buildEqualRatios(units);
            const a = splitState.draftAreasPerFloor?.[splitState.floorIndex];
            splitState.areas = Array.isArray(a) && a.length === units ? a.slice() : new Array(units).fill('');

            renderSplitUI();
            updateRatiosFromAreas();
            renderTable();
        });
    }

    function closeSplitModal() {
        splitModalOverlay.style.display = 'none';
        splitState.open = false;
        splitState.buildingIndex = -1;
        splitState.floorIndex = 0;
        splitState.mode = 'basic';
        splitState.activeTool = 'line';
        splitState.cutLines = [];
        splitState.unitCenters = [];
        splitState.draftLine = [];
        splitState.lineCursor = null;
        splitState.ratios = [];
        splitState.areas = [];
        splitState.draggingHandle = null;
        splitState.angleDeg = 0;
        splitState.barDom = { segs: [], handles: [] };
        splitState.useAreas = false;
        splitState.draftRatiosPerFloor = [];
        splitState.draftAreasPerFloor = [];
        applySplitModeUI();
    }

    function storeCurrentSplitDraft() {
        const b = buildings[splitState.buildingIndex];
        if (!b) return;
        const floors = Math.max(1, parseInt(b.floors || 1, 10));
        const units = Math.max(1, parseInt(b.units || 1, 10));
        const fi = Math.max(0, Math.min(floors - 1, splitState.floorIndex));
        splitState.draftRatiosPerFloor[fi] = normalizeRatios(splitState.ratios).slice(0, units);
        if (splitState.useAreas) splitState.draftAreasPerFloor[fi] = splitState.areas.slice(0, units);
    }

    function currentSplitUnits() {
        const b = buildings[splitState.buildingIndex];
        const units = Math.max(1, parseInt(b?.units || 1, 10));
        return units;
    }

    function ensureSplitArraySizes(units) {
        if (!Array.isArray(splitState.ratios)) splitState.ratios = [];
        if (splitState.ratios.length !== units) {
            const src = splitState.ratios.map(v => Math.max(0, Number(v) || 0));
            const next = new Array(units).fill(0);
            const take = Math.min(units, src.length);
            let used = 0;
            for (let i = 0; i < take; i++) {
                next[i] = src[i];
                used += next[i];
            }
            const remaining = Math.max(0, 1 - used);
            if (units > take) {
                const fill = remaining / (units - take);
                for (let i = take; i < units; i++) next[i] = fill;
            }
            splitState.ratios = normalizeRatios(next);
        }

        if (!Array.isArray(splitState.areas)) splitState.areas = [];
        if (splitState.areas.length !== units) {
            const next = new Array(units).fill('');
            for (let i = 0; i < Math.min(units, splitState.areas.length); i++) next[i] = splitState.areas[i];
            splitState.areas = next;
        }
    }

    function setSplitRatios(ratios) {
        splitState.ratios = normalizeRatios(ratios);
        renderSplitUI();
    }

    function renderSplitBar() {
        const ratios = splitState.ratios;
        const n = ratios.length;
        const dom = splitState.barDom;

        if (dom.segs.length !== n || dom.handles.length !== Math.max(0, n - 1)) {
            splitBar.innerHTML = '';
            dom.segs = [];
            dom.handles = [];

            for (let i = 0; i < n; i++) {
                const seg = document.createElement('div');
                seg.className = 'split-seg';
                seg.dataset.segIndex = String(i);
                seg.textContent = String(i + 1);
                splitBar.appendChild(seg);
                dom.segs.push(seg);
            }

            for (let i = 0; i < n - 1; i++) {
                const handle = document.createElement('div');
                handle.className = 'split-handle';
                handle.dataset.handleIndex = String(i);
                handle.addEventListener('pointerdown', (e) => {
                    if (splitState.useAreas) return;
                    e.preventDefault();
                    splitBar.setPointerCapture(e.pointerId);
                    splitState.draggingHandle = { index: i, pointerId: e.pointerId };
                });
                splitBar.appendChild(handle);
                dom.handles.push(handle);
            }
        }

        updateSplitBarStyles();
    }

    function updateSplitBarStyles() {
        const ratios = splitState.ratios;
        const dom = splitState.barDom;
        const n = ratios.length;
        let cum = 0;
        for (let i = 0; i < n; i++) {
            const seg = dom.segs[i];
            if (!seg) continue;
            seg.style.left = (cum * 100).toFixed(4) + '%';
            seg.style.width = (ratios[i] * 100).toFixed(4) + '%';
            const pct = Utils.roundTo(ratios[i] * 100, 1);
            let areaHtml = '';
            if (splitState.useAreas) {
                const a = Math.max(0, parseFloat(splitState.areas?.[i]) || 0);
                if (a > 0) areaHtml = `<div class="seg-area">${Utils.roundTo(a, 2)}㎡</div>`;
            }
            seg.innerHTML = `<div class="seg-idx">${i + 1}</div><div class="seg-pct">${pct}%</div>${areaHtml}`;
            cum += ratios[i];
        }

        cum = 0;
        for (let i = 0; i < n - 1; i++) {
            cum += ratios[i];
            const handle = dom.handles[i];
            if (!handle) continue;
            handle.style.left = (cum * 100).toFixed(4) + '%';
            handle.classList.toggle('active', splitState.hoverBoundaryIndex === i || (splitState.draggingBoundary?.index === i));
        }
    }

    function renderSplitTable() {
        const units = currentSplitUnits();
        ensureSplitArraySizes(units);
        const ratios = splitState.ratios;
        splitTableBody.innerHTML = '';
        if (splitAreaTh) splitAreaTh.style.display = splitState.useAreas ? '' : 'none';

        for (let i = 0; i < units; i++) {
            const tr = document.createElement('tr');

            const tdIdx = document.createElement('td');
            tdIdx.textContent = String(i + 1);

            const tdRatio = document.createElement('td');
            const inpRatio = document.createElement('input');
            inpRatio.type = 'number';
            inpRatio.id = `splitRatioInput_${i + 1}`;
            inpRatio.name = `splitRatioInput_${i + 1}`;
            inpRatio.min = '0';
            inpRatio.step = '0.1';
            inpRatio.value = Utils.roundTo(ratios[i] * 100, 2);
            inpRatio.disabled = !!splitState.useAreas;
            inpRatio.addEventListener('change', () => {
                if (splitState.useAreas) return;
                const pct = Math.max(0, parseFloat(inpRatio.value) || 0);
                const target = pct / 100;
                const next = ratios.slice();
                next[i] = target;
                const restIdx = [];
                for (let k = 0; k < next.length; k++) if (k !== i) restIdx.push(k);
                const restSum = restIdx.reduce((s, k) => s + Math.max(0, next[k] || 0), 0);
                const remaining = Math.max(0, 1 - Math.max(0, target));
                if (restIdx.length > 0) {
                    if (restSum > 1e-9) {
                        restIdx.forEach(k => { next[k] = Math.max(0, next[k]) / restSum * remaining; });
                    } else {
                        const v = remaining / restIdx.length;
                        restIdx.forEach(k => { next[k] = v; });
                    }
                }
                setSplitRatios(next);
            });
            tdRatio.appendChild(inpRatio);

            let tdArea = null;
            if (splitState.useAreas) {
                tdArea = document.createElement('td');
                const inpArea = document.createElement('input');
                inpArea.type = 'number';
                inpArea.id = `splitAreaInput_${i + 1}`;
                inpArea.name = `splitAreaInput_${i + 1}`;
                inpArea.min = '0';
                inpArea.step = '0.01';
                inpArea.value = splitState.areas[i] ?? '';
                inpArea.addEventListener('input', () => {
                    splitState.areas[i] = inpArea.value;
                    updateRatiosFromAreas();
                });
                tdArea.appendChild(inpArea);
            }

            tr.appendChild(tdIdx);
            tr.appendChild(tdRatio);
            if (splitState.useAreas && tdArea) tr.appendChild(tdArea);
            splitTableBody.appendChild(tr);
        }
    }

    function updateRatiosFromAreas() {
        if (!splitState.useAreas) return;
        const vals = splitState.areas.map(v => Math.max(0, parseFloat(v) || 0));
        const sum = vals.reduce((a, b) => a + b, 0);
        if (!(sum > 1e-9)) return;
        splitState.ratios = vals.map(v => v / sum);
        updateSplitBarStyles();
        renderSplitTable();
        renderSplitPreview();
    }

    function renderSplitPreview() {
        const b = buildings[splitState.buildingIndex];
        if (!b || !Array.isArray(b.points) || b.points.length < 3) return;

        const canvasEl = splitPreviewCanvas;
        const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
        const rect = canvasEl.getBoundingClientRect();
        const cssW = rect.width || 720;
        const cssH = rect.height || 260;
        const w = Math.max(10, Math.round(cssW * dpr));
        const h = Math.max(10, Math.round(cssH * dpr));
        if (canvasEl.width !== w) canvasEl.width = w;
        if (canvasEl.height !== h) canvasEl.height = h;

        const g = canvasEl.getContext('2d');
        g.clearRect(0, 0, w, h);

        const pts = b.points;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const p of pts) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        }
        const pad = 18 * dpr;
        const spanX = Math.max(1e-6, maxX - minX);
        const spanY = Math.max(1e-6, maxY - minY);
        const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY);
        const ox = pad + (w - pad * 2 - spanX * scale) * 0.5;
        const oy = pad + (h - pad * 2 - spanY * scale) * 0.5;

        const toCanvas = (p) => ({
            x: ox + (p.x - minX) * scale,
            y: oy + (p.y - minY) * scale
        });

        const fromCanvas = (p) => ({
            x: minX + (p.x - ox) / scale,
            y: minY + (p.y - oy) / scale
        });

        const unitPalette = [
            [82, 160, 255],
            [86, 214, 140],
            [250, 173, 20],
            [240, 105, 100],
            [140, 109, 230],
            [64, 196, 202],
            [255, 141, 60],
            [120, 192, 90]
        ];

        function unitColor(index) {
            const i = Math.max(1, parseInt(index || 1, 10));
            return unitPalette[(i - 1) % unitPalette.length];
        }

        function buildFloodOverlay(points, preview) {
            if (!Array.isArray(splitState.unitCenters) || splitState.unitCenters.length === 0) return null;
            const maxDim = 260;
            const scaleFactor = Math.min(1, maxDim / Math.max(preview.width, preview.height));
            const ffW = Math.max(120, Math.round(preview.width * scaleFactor));
            const ffH = Math.max(120, Math.round(preview.height * scaleFactor));
            const ffCanvas = document.createElement('canvas');
            ffCanvas.width = ffW;
            ffCanvas.height = ffH;
            const fctx = ffCanvas.getContext('2d');
            fctx.clearRect(0, 0, ffW, ffH);

            const toFF = (p) => {
                const c = preview.toCanvas(p);
                return { x: (c.x / preview.width) * ffW, y: (c.y / preview.height) * ffH };
            };

            fctx.fillStyle = '#ffffff';
            fctx.beginPath();
            const p0ff = toFF(points[0]);
            fctx.moveTo(p0ff.x, p0ff.y);
            for (let i = 1; i < points.length; i++) {
                const pi = toFF(points[i]);
                fctx.lineTo(pi.x, pi.y);
            }
            fctx.closePath();
            fctx.fill();

            const maskLines = [];
            if (Array.isArray(splitState.cutLines)) maskLines.push(...splitState.cutLines);
            if (Array.isArray(splitState.draftLine) && splitState.draftLine.length > 1) {
                const draft = splitState.draftLine.slice();
                if (splitState.lineCursor) draft.push(splitState.lineCursor);
                maskLines.push(draft);
            }
            if (maskLines.length > 0) {
                const lineWidth = Math.max(2, Math.round(3 * ffW / preview.width));
                fctx.strokeStyle = '#000000';
                fctx.lineWidth = lineWidth;
                fctx.lineJoin = 'round';
                fctx.lineCap = 'round';
                maskLines.forEach(line => {
                    if (!Array.isArray(line) || line.length < 2) return;
                    fctx.beginPath();
                    const s = toFF(line[0]);
                    fctx.moveTo(s.x, s.y);
                    for (let i = 1; i < line.length; i++) {
                        const pt = toFF(line[i]);
                        fctx.lineTo(pt.x, pt.y);
                    }
                    fctx.stroke();
                });
            }

            const img = fctx.getImageData(0, 0, ffW, ffH);
            const data = img.data;
            const state = new Uint16Array(ffW * ffH);
            for (let i = 0, idx = 0; i < data.length; i += 4, idx++) {
                const a = data[i + 3];
                if (a < 10) {
                    state[idx] = 65535;
                    continue;
                }
                if (data[i] < 200 && data[i + 1] < 200 && data[i + 2] < 200) {
                    state[idx] = 65535;
                }
            }

            const overlay = fctx.createImageData(ffW, ffH);
            const odata = overlay.data;
            const queue = new Int32Array(ffW * ffH);

            splitState.unitCenters.forEach(center => {
                const unitIndex = Math.max(1, parseInt(center?.unitIndex || 1, 10));
                const c = toFF(center);
                const sx = Math.round(c.x);
                const sy = Math.round(c.y);
                if (sx < 0 || sy < 0 || sx >= ffW || sy >= ffH) return;
                const start = sy * ffW + sx;
                if (state[start] !== 0) return;

                let head = 0;
                let tail = 0;
                queue[tail++] = start;
                state[start] = unitIndex;

                while (head < tail) {
                    const idx = queue[head++];
                    const x = idx % ffW;
                    const y = (idx / ffW) | 0;
                    const up = idx - ffW;
                    const down = idx + ffW;
                    if (x > 0 && state[idx - 1] === 0) {
                        state[idx - 1] = unitIndex;
                        queue[tail++] = idx - 1;
                    }
                    if (x < ffW - 1 && state[idx + 1] === 0) {
                        state[idx + 1] = unitIndex;
                        queue[tail++] = idx + 1;
                    }
                    if (y > 0 && state[up] === 0) {
                        state[up] = unitIndex;
                        queue[tail++] = up;
                    }
                    if (y < ffH - 1 && state[down] === 0) {
                        state[down] = unitIndex;
                        queue[tail++] = down;
                    }
                }
            });

            for (let idx = 0; idx < state.length; idx++) {
                const unitIndex = state[idx];
                if (unitIndex === 0 || unitIndex === 65535) continue;
                const color = unitColor(unitIndex);
                const i = idx * 4;
                odata[i] = color[0];
                odata[i + 1] = color[1];
                odata[i + 2] = color[2];
                odata[i + 3] = 120;
            }

            const octx = ffCanvas.getContext('2d');
            octx.clearRect(0, 0, ffW, ffH);
            octx.putImageData(overlay, 0, 0);
            return ffCanvas;
        }

        function buildRegionOverlay(points, preview) {
            const maxDim = 260;
            const scaleFactor = Math.min(1, maxDim / Math.max(preview.width, preview.height));
            const ffW = Math.max(120, Math.round(preview.width * scaleFactor));
            const ffH = Math.max(120, Math.round(preview.height * scaleFactor));
            const ffCanvas = document.createElement('canvas');
            ffCanvas.width = ffW;
            ffCanvas.height = ffH;
            const fctx = ffCanvas.getContext('2d');
            fctx.clearRect(0, 0, ffW, ffH);

            const toFF = (p) => {
                const c = preview.toCanvas(p);
                return { x: (c.x / preview.width) * ffW, y: (c.y / preview.height) * ffH };
            };

            fctx.fillStyle = '#ffffff';
            fctx.beginPath();
            const p0ff = toFF(points[0]);
            fctx.moveTo(p0ff.x, p0ff.y);
            for (let i = 1; i < points.length; i++) {
                const pi = toFF(points[i]);
                fctx.lineTo(pi.x, pi.y);
            }
            fctx.closePath();
            fctx.fill();

            const maskLines = [];
            if (Array.isArray(splitState.cutLines)) maskLines.push(...splitState.cutLines);
            if (Array.isArray(splitState.draftLine) && splitState.draftLine.length > 1) {
                const draft = splitState.draftLine.slice();
                if (splitState.lineCursor) draft.push(splitState.lineCursor);
                maskLines.push(draft);
            }
            if (maskLines.length > 0) {
                const lineWidth = Math.max(2, Math.round(3 * ffW / preview.width));
                fctx.strokeStyle = '#000000';
                fctx.lineWidth = lineWidth;
                fctx.lineJoin = 'round';
                fctx.lineCap = 'round';
                maskLines.forEach(line => {
                    if (!Array.isArray(line) || line.length < 2) return;
                    fctx.beginPath();
                    const s = toFF(line[0]);
                    fctx.moveTo(s.x, s.y);
                    for (let i = 1; i < line.length; i++) {
                        const pt = toFF(line[i]);
                        fctx.lineTo(pt.x, pt.y);
                    }
                    fctx.stroke();
                });
            }

            const img = fctx.getImageData(0, 0, ffW, ffH);
            const data = img.data;
            const state = new Uint16Array(ffW * ffH);
            for (let i = 0, idx = 0; i < data.length; i += 4, idx++) {
                const a = data[i + 3];
                if (a < 10) {
                    state[idx] = 65535;
                    continue;
                }
                if (data[i] < 200 && data[i + 1] < 200 && data[i + 2] < 200) {
                    state[idx] = 65535;
                }
            }

            const overlay = fctx.createImageData(ffW, ffH);
            const odata = overlay.data;
            const queue = new Int32Array(ffW * ffH);
            let region = 0;

            for (let idx = 0; idx < state.length; idx++) {
                if (state[idx] !== 0) continue;
                region++;
                const color = unitColor(region);
                let head = 0;
                let tail = 0;
                queue[tail++] = idx;
                state[idx] = region;

                while (head < tail) {
                    const cur = queue[head++];
                    const x = cur % ffW;
                    const y = (cur / ffW) | 0;
                    const oi = cur * 4;
                    odata[oi] = color[0];
                    odata[oi + 1] = color[1];
                    odata[oi + 2] = color[2];
                    odata[oi + 3] = 120;

                    if (x > 0 && state[cur - 1] === 0) {
                        state[cur - 1] = region;
                        queue[tail++] = cur - 1;
                    }
                    if (x < ffW - 1 && state[cur + 1] === 0) {
                        state[cur + 1] = region;
                        queue[tail++] = cur + 1;
                    }
                    if (y > 0 && state[cur - ffW] === 0) {
                        state[cur - ffW] = region;
                        queue[tail++] = cur - ffW;
                    }
                    if (y < ffH - 1 && state[cur + ffW] === 0) {
                        state[cur + ffW] = region;
                        queue[tail++] = cur + ffW;
                    }
                }
            }

            if (region === 0) return null;
            const octx = ffCanvas.getContext('2d');
            octx.clearRect(0, 0, ffW, ffH);
            octx.putImageData(overlay, 0, 0);
            return ffCanvas;
        }

        function renderAdvancedPreview(ctx, points, preview) {
            const regionOverlay = buildRegionOverlay(points, preview);
            if (regionOverlay) {
                ctx.save();
                ctx.drawImage(regionOverlay, 0, 0, preview.width, preview.height);
                ctx.restore();
            }

            const overlay = buildFloodOverlay(points, preview);
            if (overlay) {
                ctx.save();
                ctx.drawImage(overlay, 0, 0, preview.width, preview.height);
                ctx.restore();
            }

            const lineWidth = 2 * preview.dpr;
            const drawLine = (line, dashed) => {
                if (!Array.isArray(line) || line.length < 2) return;
                ctx.save();
                ctx.strokeStyle = 'rgba(231, 76, 60, 0.9)';
                ctx.lineWidth = lineWidth;
                ctx.lineJoin = 'round';
                ctx.lineCap = 'round';
                if (dashed) ctx.setLineDash([6 * preview.dpr, 6 * preview.dpr]);
                ctx.beginPath();
                const s = preview.toCanvas(line[0]);
                ctx.moveTo(s.x, s.y);
                for (let i = 1; i < line.length; i++) {
                    const pt = preview.toCanvas(line[i]);
                    ctx.lineTo(pt.x, pt.y);
                }
                ctx.stroke();
                ctx.restore();
            };

            if (Array.isArray(splitState.cutLines)) {
                splitState.cutLines.forEach(line => drawLine(line, false));
            }

            if (Array.isArray(splitState.draftLine) && splitState.draftLine.length > 0) {
                const draft = splitState.draftLine.slice();
                if (splitState.lineCursor) draft.push(splitState.lineCursor);
                drawLine(draft, true);

                ctx.save();
                ctx.fillStyle = 'rgba(231, 76, 60, 0.9)';
                draft.forEach(pt => {
                    const c = preview.toCanvas(pt);
                    ctx.beginPath();
                    ctx.arc(c.x, c.y, 3 * preview.dpr, 0, Math.PI * 2);
                    ctx.fill();
                });
                ctx.restore();
            }

            if (Array.isArray(splitState.unitCenters)) {
                ctx.save();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = `bold ${Math.max(11, Math.round(11 * preview.dpr))}px Arial`;
                splitState.unitCenters.forEach(center => {
                    const c = preview.toCanvas(center);
                    const color = unitColor(center?.unitIndex || 1);
                    ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.95)`;
                    ctx.strokeStyle = 'rgba(44, 62, 80, 0.7)';
                    ctx.lineWidth = 1 * preview.dpr;
                    ctx.beginPath();
                    ctx.arc(c.x, c.y, 7 * preview.dpr, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();

                    ctx.fillStyle = '#ffffff';
                    ctx.fillText(String(center?.unitIndex || 1), c.x, c.y);
                });
                ctx.restore();
            }
        }

        g.save();
        g.fillStyle = 'rgba(0, 123, 255, 0.10)';
        g.strokeStyle = 'rgba(44, 62, 80, 0.85)';
        g.lineWidth = 2 * dpr;
        g.beginPath();
        const p0 = toCanvas(pts[0]);
        g.moveTo(p0.x, p0.y);
        for (let i = 1; i < pts.length; i++) {
            const pi = toCanvas(pts[i]);
            g.lineTo(pi.x, pi.y);
        }
        g.closePath();
        g.fill();
        g.stroke();
        g.restore();

        if (splitState.mode === 'advanced') {
            splitState.preview = { dpr, rect, minX, minY, scale, ox, oy, fromCanvas, toCanvas, width: w, height: h };
            renderAdvancedPreview(g, pts, splitState.preview);
            return;
        }

        const u = axisFromAngleDeg(splitState.angleDeg);
        const proj = (p) => p.x * u.x + p.y * u.y;
        let minP = Infinity, maxP = -Infinity;
        for (const p of pts) {
            const t = proj(p);
            if (t < minP) minP = t;
            if (t > maxP) maxP = t;
        }
        const spanP = maxP - minP;
        if (!(spanP > 1e-6)) return;

        const v = { x: -u.y, y: u.x };
        const L = Math.max(spanX, spanY) * 2;
        const center = pts.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
        center.x /= pts.length;
        center.y /= pts.length;
        const centerProj = proj(center);

        g.save();
        g.setLineDash([6 * dpr, 6 * dpr]);

        let cum = 0;
        const boundaries = [];
        for (let i = 0; i < splitState.ratios.length - 1; i++) {
            cum += splitState.ratios[i];
            const boundaryP = maxP - cum * spanP;
            const delta = boundaryP - centerProj;
            const base = { x: center.x + u.x * delta, y: center.y + u.y * delta };
            const a = { x: base.x + v.x * L, y: base.y + v.y * L };
            const bpt = { x: base.x - v.x * L, y: base.y - v.y * L };
            const ca = toCanvas(a);
            const cb = toCanvas(bpt);
            boundaries.push({ index: i, proj: boundaryP, a: ca, b: cb });

            const highlight = (splitState.hoverBoundaryIndex === i) || (splitState.draggingBoundary?.index === i);
            g.strokeStyle = highlight ? 'rgba(231, 76, 60, 0.95)' : 'rgba(231, 76, 60, 0.72)';
            g.lineWidth = (highlight ? 3 : 2) * dpr;
            g.beginPath();
            g.moveTo(ca.x, ca.y);
            g.lineTo(cb.x, cb.y);
            g.stroke();
        }
        g.restore();

        splitState.preview = { dpr, rect, minX, minY, scale, ox, oy, fromCanvas, toCanvas, u, v, minP, maxP, spanP, boundaries };

        const dotV = (p) => p.x * v.x + p.y * v.y;
        const eps = 1e-6;
        function dedupPoints(points) {
            const out = [];
            for (const p of points) {
                let ok = true;
                for (const q of out) {
                    if (Math.hypot(p.x - q.x, p.y - q.y) < 1e-3) { ok = false; break; }
                }
                if (ok) out.push(p);
            }
            return out;
        }

        function intersectionsAtProj(targetProj) {
            const hits = [];
            for (let i = 0; i < pts.length; i++) {
                const a = pts[i];
                const b = pts[(i + 1) % pts.length];
                const ua = proj(a);
                const ub = proj(b);
                const da = ua - targetProj;
                const db = ub - targetProj;
                if (Math.abs(da) < eps && Math.abs(db) < eps) {
                    hits.push({ x: a.x, y: a.y });
                    hits.push({ x: b.x, y: b.y });
                    continue;
                }
                if ((da <= 0 && db >= 0) || (da >= 0 && db <= 0)) {
                    const denom = ub - ua;
                    if (Math.abs(denom) < eps) continue;
                    const t = (targetProj - ua) / denom;
                    if (t >= -1e-6 && t <= 1 + 1e-6) {
                        hits.push({
                            x: a.x + (b.x - a.x) * t,
                            y: a.y + (b.y - a.y) * t
                        });
                    }
                }
            }
            const uniq = dedupPoints(hits);
            uniq.sort((p, q) => dotV(p) - dotV(q));
            return uniq;
        }

        g.save();
        const fontSize = Math.max(11, Math.round(12 * dpr));
        const fontUnit = `bold ${fontSize}px Arial`;
        const fontRest = `${fontSize}px Arial`;
        g.textAlign = 'left';
        g.textBaseline = 'middle';

        let startCum = 0;
        for (let i = 0; i < splitState.ratios.length; i++) {
            const r = splitState.ratios[i];
            const segCenterProj = maxP - (startCum + r * 0.5) * spanP;
            const hits = intersectionsAtProj(segCenterProj);
            if (hits.length >= 2) {
                const pA = hits[0];
                const pB = hits[hits.length - 1];
                const mid = { x: (pA.x + pB.x) / 2, y: (pA.y + pB.y) / 2 };
                const m = toCanvas(mid);
                const pct = Utils.roundTo(r * 100, 1);
                const unitText = `${i + 1}`;
                const areaVal = splitState.useAreas ? Math.max(0, parseFloat(splitState.areas?.[i]) || 0) : 0;
                const restInside = (splitState.useAreas && areaVal > 0) ? `${pct}%, ${Utils.roundTo(areaVal, 2)}㎡` : `${pct}%`;
                const restText = `(${restInside})`;

                const padPx = 6 * dpr;
                const gap = 4 * dpr;
                g.font = fontUnit;
                const wUnit = g.measureText(unitText).width;
                g.font = fontRest;
                const wRest = g.measureText(restText).width;
                const bw = wUnit + gap + wRest + padPx * 2;
                const bh = Math.max(20 * dpr, (fontSize + 10) * dpr);

                g.fillStyle = 'rgba(255, 255, 255, 0.85)';
                g.strokeStyle = 'rgba(44, 62, 80, 0.25)';
                g.lineWidth = 1 * dpr;
                g.beginPath();
                const rx = m.x - bw / 2, ry = m.y - bh / 2;
                const rr = 6 * dpr;
                g.moveTo(rx + rr, ry);
                g.arcTo(rx + bw, ry, rx + bw, ry + bh, rr);
                g.arcTo(rx + bw, ry + bh, rx, ry + bh, rr);
                g.arcTo(rx, ry + bh, rx, ry, rr);
                g.arcTo(rx, ry, rx + bw, ry, rr);
                g.closePath();
                g.fill();
                g.stroke();

                const tx = rx + padPx;
                const ty = m.y;
                g.font = fontUnit;
                g.fillStyle = 'rgba(231, 76, 60, 0.95)';
                g.fillText(unitText, tx, ty);
                g.font = fontRest;
                g.fillStyle = 'rgba(44, 62, 80, 0.90)';
                g.fillText(restText, tx + wUnit + gap, ty);
            }
            startCum += r;
        }
        g.restore();
    }

    function renderSplitUI() {
        renderSplitBar();
        renderSplitTable();
        renderSplitPreview();
    }

    function applySplitModeUI() {
        const isAdvanced = splitState.mode === 'advanced';
        if (splitModeSelect) splitModeSelect.value = isAdvanced ? 'advanced' : 'basic';
        const setDisplay = (el, show, display) => {
            if (!el) return;
            el.style.display = show ? display : 'none';
        };
        setDisplay(splitAdvancedToolbar, isAdvanced, 'flex');
        setDisplay(splitBarWrap, !isAdvanced, 'block');
        setDisplay(splitBasicActions, !isAdvanced, 'flex');
        setDisplay(splitTableWrap, !isAdvanced, 'block');
        updateSplitToolUI();
        if (splitState.open) {
            renderSplitPreview();
            if (!isAdvanced) {
                renderSplitBar();
                renderSplitTable();
            }
        }
    }

    function updateSplitToolUI() {
        if (!splitToolLine || !splitToolUnit) return;
        const isLine = splitState.activeTool === 'line';
        splitToolLine.classList.toggle('active', isLine);
        splitToolUnit.classList.toggle('active', !isLine);
        splitToolLine.setAttribute('aria-pressed', isLine ? 'true' : 'false');
        splitToolUnit.setAttribute('aria-pressed', !isLine ? 'true' : 'false');
    }

    function setSplitTool(tool) {
        splitState.activeTool = tool === 'unit' ? 'unit' : 'line';
        if (splitState.activeTool !== 'line') {
            splitState.lineCursor = null;
        }
        updateSplitToolUI();
    }

    if (splitModeSelect) {
        splitModeSelect.addEventListener('change', () => {
            const nextMode = splitModeSelect.value === 'advanced' ? 'advanced' : 'basic';
            splitState.mode = nextMode;
            applySplitModeUI();
        });
    }

    if (splitToolLine) {
        splitToolLine.addEventListener('click', () => {
            setSplitTool('line');
        });
    }

    if (splitToolUnit) {
        splitToolUnit.addEventListener('click', () => {
            setSplitTool('unit');
        });
    }

    if (splitClearLines) {
        splitClearLines.addEventListener('click', () => {
            splitState.cutLines = [];
            splitState.unitCenters = [];
            splitState.draftLine = [];
            splitState.lineCursor = null;
            renderSplitPreview();
        });
    }

    if (splitUnitIndexInput) {
        splitUnitIndexInput.addEventListener('change', () => {
            const b = buildings[splitState.buildingIndex];
            const units = Math.max(1, parseInt(b?.units || 1, 10));
            splitUnitIndexInput.value = String(clampInt(parseInt(splitUnitIndexInput.value), 1, units, 1));
        });
    }

    splitModalClose.addEventListener('click', closeSplitModal);
    splitModalOverlay.addEventListener('mousedown', (e) => {
        if (e.target === splitModalOverlay) closeSplitModal();
    });
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && splitState.open) closeSplitModal();
    });

    splitBar.addEventListener('pointermove', (e) => {
        if (splitState.mode === 'advanced') return;
        if (!splitState.draggingHandle) return;
        if (splitState.draggingHandle.pointerId !== e.pointerId) return;
        const i = splitState.draggingHandle.index;
        const ratiosNow = splitState.ratios;
        if (!Array.isArray(ratiosNow) || ratiosNow.length < 2) return;
        if (i < 0 || i >= ratiosNow.length - 1) return;

        const rect = splitBar.getBoundingClientRect();
        const x = (e.clientX - rect.left) / Math.max(1, rect.width);
        const minGap = 0.005;
        const leftSum = ratiosNow.slice(0, i).reduce((a, b) => a + b, 0);
        const rightSum = ratiosNow.slice(0, i + 2).reduce((a, b) => a + b, 0);
        const leftBound = leftSum + minGap;
        const rightBound = rightSum - minGap;
        const newBoundary = clampHandlePos(x, leftBound, rightBound);
        const pairTotal = rightSum - leftSum;
        const newLeft = newBoundary - leftSum;
        const newRight = pairTotal - newLeft;
        const next = ratiosNow.slice();
        next[i] = Math.max(0, newLeft);
        next[i + 1] = Math.max(0, newRight);
        splitState.ratios = normalizeRatios(next);
        updateSplitBarStyles();
        renderSplitPreview();
    });

    splitBar.addEventListener('pointerup', (e) => {
        if (splitState.mode === 'advanced') return;
        if (splitState.draggingHandle && splitState.draggingHandle.pointerId === e.pointerId) {
            splitState.draggingHandle = null;
            renderSplitTable();
            renderSplitPreview();
        }
    });

    splitBar.addEventListener('pointercancel', () => {
        if (splitState.mode === 'advanced') return;
        splitState.draggingHandle = null;
        renderSplitTable();
        renderSplitPreview();
    });

    splitAngleSlider.addEventListener('input', () => {
        const deg = clampAngleDeg(parseInt(splitAngleSlider.value, 10));
        splitState.angleDeg = deg;
        splitAngleInput.value = String(deg);
        renderSplitPreview();
    });

    splitAngleInput.addEventListener('change', () => {
        const deg = clampAngleDeg(parseInt(splitAngleInput.value, 10));
        splitState.angleDeg = deg;
        splitAngleInput.value = String(deg);
        splitAngleSlider.value = String(deg);
        renderSplitPreview();
    });

    function distPointToSegment(px, py, ax, ay, bx, by) {
        const abx = bx - ax;
        const aby = by - ay;
        const apx = px - ax;
        const apy = py - ay;
        const ab2 = abx * abx + aby * aby;
        if (ab2 <= 1e-9) return Math.hypot(apx, apy);
        let t = (apx * abx + apy * aby) / ab2;
        t = Math.max(0, Math.min(1, t));
        const cx = ax + abx * t;
        const cy = ay + aby * t;
        return Math.hypot(px - cx, py - cy);
    }

    function findHoverBoundaryAtClientPos(clientX, clientY) {
        const p = splitState.preview;
        if (!p || !splitPreviewCanvas) return -1;
        const r = splitPreviewCanvas.getBoundingClientRect();
        const dpr = p.dpr || 1;
        const x = (clientX - r.left) * dpr;
        const y = (clientY - r.top) * dpr;
        let bestIdx = -1;
        let best = Infinity;
        const th = 10 * dpr;
        for (const b of p.boundaries || []) {
            const d = distPointToSegment(x, y, b.a.x, b.a.y, b.b.x, b.b.y);
            if (d < best) {
                best = d;
                bestIdx = b.index;
            }
        }
        return best <= th ? bestIdx : -1;
    }

    function getPreviewWorldFromEvent(clientX, clientY) {
        const p = splitState.preview;
        if (!p || !splitPreviewCanvas) return null;
        const r = splitPreviewCanvas.getBoundingClientRect();
        const dpr = p.dpr || 1;
        const cx = (clientX - r.left) * dpr;
        const cy = (clientY - r.top) * dpr;
        return p.fromCanvas({ x: cx, y: cy });
    }

    function commitDraftLine() {
        if (Array.isArray(splitState.draftLine) && splitState.draftLine.length >= 2) {
            splitState.cutLines.push(splitState.draftLine.slice());
        }
        splitState.draftLine = [];
        splitState.lineCursor = null;
        renderSplitPreview();
    }

    function assignUnitCenter(world) {
        if (!world) return;
        const b = buildings[splitState.buildingIndex];
        const units = Math.max(1, parseInt(b?.units || 1, 10));
        const unitIndex = clampInt(parseInt(splitUnitIndexInput?.value || '1', 10), 1, units, 1);
        if (splitUnitIndexInput) splitUnitIndexInput.value = String(unitIndex);
        splitState.unitCenters = splitState.unitCenters.filter(c => c?.unitIndex !== unitIndex);
        splitState.unitCenters.push({ x: world.x, y: world.y, unitIndex });
        if (splitUnitIndexInput) {
            const nextIndex = Math.min(unitIndex + 1, units);
            splitUnitIndexInput.value = String(nextIndex);
        }
        renderSplitPreview();
    }

    function updateRatiosByBoundaryIndex(boundaryIndex, newProj) {
        const p = splitState.preview;
        if (!p) return;
        const ratiosNow = splitState.ratios;
        const i = boundaryIndex;
        if (!Array.isArray(ratiosNow) || ratiosNow.length < 2) return;
        if (i < 0 || i >= ratiosNow.length - 1) return;

        const minGap = 0.005;
        const leftPrefix = ratiosNow.slice(0, i).reduce((a, b) => a + b, 0);
        const pairTotal = ratiosNow[i] + ratiosNow[i + 1];
        const leftBoundCum = leftPrefix + minGap;
        const rightBoundCum = leftPrefix + pairTotal - minGap;

        const clampProjMax = p.maxP - leftBoundCum * p.spanP;
        const clampProjMin = p.maxP - rightBoundCum * p.spanP;
        const clampedProj = clampHandlePos(newProj, clampProjMin, clampProjMax);
        const newCum = (p.maxP - clampedProj) / p.spanP;

        const newLeft = newCum - leftPrefix;
        const newRight = pairTotal - newLeft;
        const next = ratiosNow.slice();
        next[i] = Math.max(0, newLeft);
        next[i + 1] = Math.max(0, newRight);
        splitState.ratios = normalizeRatios(next);
        updateSplitBarStyles();
        renderSplitTable();
        renderSplitPreview();
    }

    if (splitPreviewCanvas) {
        splitPreviewCanvas.addEventListener('pointermove', (e) => {
            if (!splitState.open) return;
            if (splitState.mode === 'advanced') {
                if (splitState.activeTool === 'line' && Array.isArray(splitState.draftLine) && splitState.draftLine.length > 0) {
                    const world = getPreviewWorldFromEvent(e.clientX, e.clientY);
                    splitState.lineCursor = world;
                    renderSplitPreview();
                }
                return;
            }
            if (splitState.useAreas) return;

            if (splitState.draggingBoundary && splitState.draggingBoundary.pointerId === e.pointerId) {
                const p = splitState.preview;
                if (!p) return;
                const r = splitPreviewCanvas.getBoundingClientRect();
                const dpr = p.dpr || 1;
                const cx = (e.clientX - r.left) * dpr;
                const cy = (e.clientY - r.top) * dpr;
                const world = p.fromCanvas({ x: cx, y: cy });
                const newProj = world.x * p.u.x + world.y * p.u.y;
                updateRatiosByBoundaryIndex(splitState.draggingBoundary.index, newProj);
                return;
            }

            const idx = findHoverBoundaryAtClientPos(e.clientX, e.clientY);
            if (idx !== splitState.hoverBoundaryIndex) {
                splitState.hoverBoundaryIndex = idx;
                splitPreviewCanvas.style.cursor = idx >= 0 ? 'ew-resize' : '';
                updateSplitBarStyles();
                renderSplitPreview();
            }
        });

        splitPreviewCanvas.addEventListener('pointerleave', () => {
            if (!splitState.open) return;
            if (splitState.mode === 'advanced') {
                if (splitState.lineCursor) {
                    splitState.lineCursor = null;
                    renderSplitPreview();
                }
                return;
            }
            if (splitState.draggingBoundary) return;
            if (splitState.hoverBoundaryIndex !== -1) {
                splitState.hoverBoundaryIndex = -1;
                splitPreviewCanvas.style.cursor = '';
                updateSplitBarStyles();
                renderSplitPreview();
            }
        });

        splitPreviewCanvas.addEventListener('pointerdown', (e) => {
            if (!splitState.open) return;
            if (splitState.mode === 'advanced') {
                if (e.button === 2) return;
                const world = getPreviewWorldFromEvent(e.clientX, e.clientY);
                if (!world) return;
                if (splitState.activeTool === 'unit') {
                    assignUnitCenter(world);
                    return;
                }
                splitState.draftLine = Array.isArray(splitState.draftLine) ? splitState.draftLine : [];
                splitState.draftLine.push(world);
                renderSplitPreview();
                return;
            }
            if (splitState.useAreas) return;
            const idx = findHoverBoundaryAtClientPos(e.clientX, e.clientY);
            if (idx < 0) return;
            e.preventDefault();
            splitPreviewCanvas.setPointerCapture(e.pointerId);
            splitState.draggingBoundary = { index: idx, pointerId: e.pointerId };
            splitState.hoverBoundaryIndex = idx;
            splitPreviewCanvas.style.cursor = 'ew-resize';
            updateSplitBarStyles();
            renderSplitPreview();
        });

        splitPreviewCanvas.addEventListener('pointerup', (e) => {
            if (splitState.mode === 'advanced') return;
            if (!splitState.draggingBoundary) return;
            if (splitState.draggingBoundary.pointerId !== e.pointerId) return;
            splitState.draggingBoundary = null;
            renderSplitTable();
            renderSplitPreview();
        });

        splitPreviewCanvas.addEventListener('pointercancel', () => {
            if (splitState.mode === 'advanced') return;
            splitState.draggingBoundary = null;
            renderSplitTable();
            renderSplitPreview();
        });

        splitPreviewCanvas.addEventListener('dblclick', (e) => {
            if (!splitState.open || splitState.mode !== 'advanced') return;
            e.preventDefault();
            commitDraftLine();
        });

        splitPreviewCanvas.addEventListener('contextmenu', (e) => {
            if (!splitState.open || splitState.mode !== 'advanced') return;
            e.preventDefault();
            const repaintAfterUndo = () => {
                renderSplitPreview();
                requestAnimationFrame(renderSplitPreview);
            };
            const cursorWorld = getPreviewWorldFromEvent(e.clientX, e.clientY);
            if (Array.isArray(splitState.draftLine) && splitState.draftLine.length > 0) {
                splitState.draftLine.pop();
                if (splitState.draftLine.length === 0) {
                    splitState.lineCursor = null;
                } else if (cursorWorld) {
                    splitState.lineCursor = cursorWorld;
                }
                repaintAfterUndo();
                return;
            }
            if (Array.isArray(splitState.cutLines) && splitState.cutLines.length > 0) {
                const last = splitState.cutLines[splitState.cutLines.length - 1];
                if (Array.isArray(last) && last.length > 0) {
                    while (last.length > 1 && pointsEqual(last[last.length - 1], last[last.length - 2], 1e-4)) {
                        last.pop();
                    }
                    const moved = last.pop();
                    splitState.draftLine = last.slice();
                    splitState.cutLines.pop();
                    if (cursorWorld) {
                        splitState.lineCursor = cursorWorld;
                    } else {
                        splitState.lineCursor = moved ? { x: moved.x, y: moved.y } : null;
                    }
                    repaintAfterUndo();
                }
            }
        });

        if (window.ResizeObserver) {
            const ro = new ResizeObserver(() => {
                if (!splitState.open) return;
                renderSplitPreview();
            });
            ro.observe(splitPreviewCanvas);
        }
    }

    splitFloorSelect.addEventListener('change', () => {
        const b = buildings[splitState.buildingIndex];
        if (!b) return;
        const units = Math.max(1, parseInt(b.units || 1, 10));
        storeCurrentSplitDraft();
        const floorIndex = clampInt(parseInt(splitFloorSelect.value), 0, Math.max(0, b.floors - 1), 0);
        splitState.floorIndex = floorIndex;
        const r = splitState.draftRatiosPerFloor?.[floorIndex];
        splitState.ratios = (Array.isArray(r) && r.length === units) ? normalizeRatios(r) : buildEqualRatios(units);
        const a = splitState.draftAreasPerFloor?.[floorIndex];
        splitState.areas = Array.isArray(a) && a.length === units ? a.slice() : new Array(units).fill('');
        renderSplitUI();
        updateRatiosFromAreas();
    });

    splitResetEqualBtn.addEventListener('click', () => {
        const b = buildings[splitState.buildingIndex];
        if (!b) return;
        const units = Math.max(1, parseInt(b.units || 1, 10));
        splitState.areas = new Array(units).fill('');
        setSplitRatios(buildEqualRatios(units));
    });

    splitApplyAllFloorsBtn.addEventListener('click', () => {
        const b = buildings[splitState.buildingIndex];
        if (!b) return;
        const floors = Math.max(1, parseInt(b.floors || 1, 10));
        const units = Math.max(1, parseInt(b.units || 1, 10));
        storeCurrentSplitDraft();
        const r = normalizeRatios(splitState.ratios).slice(0, units);
        splitState.draftRatiosPerFloor = new Array(floors).fill(null).map(() => r.slice());
        if (splitState.useAreas) {
            const a = splitState.areas.slice(0, units);
            splitState.draftAreasPerFloor = new Array(floors).fill(null).map(() => a.slice());
        } else {
            splitState.draftAreasPerFloor = new Array(floors).fill(null);
        }
        renderSplitUI();
        updateRatiosFromAreas();
    });

    splitUseAreasChk.addEventListener('change', () => {
        storeCurrentSplitDraft();
        splitState.useAreas = !!splitUseAreasChk.checked;
        if (splitState.useAreas) {
            const b = buildings[splitState.buildingIndex];
            const units = Math.max(1, parseInt(b?.units || 1, 10));
            const a = splitState.draftAreasPerFloor?.[splitState.floorIndex];
            splitState.areas = Array.isArray(a) && a.length === units ? a.slice() : (splitState.areas.length === units ? splitState.areas : new Array(units).fill(''));
        }
        renderSplitUI();
        updateRatiosFromAreas();
    });

    splitSaveBtn.addEventListener('click', () => {
        const b = buildings[splitState.buildingIndex];
        if (!b) return;
        const floors = Math.max(1, parseInt(b.floors || 1, 10));
        const units = Math.max(1, parseInt(b.units || 1, 10));
        if (!Array.isArray(b.unitRatiosPerFloor) || b.unitRatiosPerFloor.length !== floors) {
            b.unitRatiosPerFloor = new Array(floors).fill(null);
        }
        storeCurrentSplitDraft();
        for (let fi = 0; fi < floors; fi++) {
            const r = splitState.draftRatiosPerFloor?.[fi];
            if (Array.isArray(r) && r.length === units) {
                b.unitRatiosPerFloor[fi] = normalizeRatios(r).slice(0, units);
            }
        }
        b.unitSplitAngleDeg = clampAngleDeg(splitState.angleDeg);
        if (splitState.mode === 'advanced') {
            commitDraftLine();
            b.advancedSplit = true;
            b.cutLines = deepClone(splitState.cutLines);
            b.unitCenters = deepClone(splitState.unitCenters);
        } else {
            b.advancedSplit = false;
        }
        closeSplitModal();
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
