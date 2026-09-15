/**
 * 楼盘采光可视化 - 主逻辑（含日照分析功能）
 */
(function() {
    'use strict';

    // ========== 场景初始化 ==========
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.SCENE.BACKGROUND_COLOR);
    scene.fog = new THREE.Fog(CONFIG.SCENE.FOG_COLOR, CONFIG.SCENE.FOG_NEAR, CONFIG.SCENE.FOG_FAR);

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 5000);
    camera.position.set(200, 260, 320);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    document.getElementById('canvas-container').appendChild(renderer.domElement);
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2 - 0.1;

    let renderFrameRequested = false;
    function requestRender(updateShadows = false) {
        if (updateShadows) renderer.shadowMap.needsUpdate = true;
        if (renderFrameRequested) return;
        renderFrameRequested = true;
        requestAnimationFrame(() => {
            renderFrameRequested = false;
            const controlsChanged = controls.update();
            renderer.render(scene, camera);
            if (controlsChanged) requestRender();
        });
    }
    controls.addEventListener('change', () => requestRender());

    // 地面
    const planeGeometry = new THREE.PlaneGeometry(4000, 4000);
    const planeMaterial = new THREE.MeshStandardMaterial({ 
        color: CONFIG.MATERIALS.GROUND_COLOR, 
        roughness: 0.95, 
        metalness: 0.0 
    });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.x = -Math.PI / 2;
    plane.receiveShadow = true;
    scene.add(plane);

    // 网格
    const gridHelper = new THREE.GridHelper(2000, 100, 0xcfd8e3, 0xe9eff5);
    gridHelper.position.y = 0.02;
    scene.add(gridHelper);

    // 创建罗盘指南针
    function createCompass() {
        const compassGroup = new THREE.Group();
        
        // 罗盘底座 - 圆形平台
        const baseGeometry = new THREE.CylinderGeometry(20, 20, 0.5, 32);
        const baseMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xffffff, 
            roughness: 0.3, 
            metalness: 0.1 
        });
        const base = new THREE.Mesh(baseGeometry, baseMaterial);
        base.position.y = 0.25;
        compassGroup.add(base);
        
        // 罗盘刻度盘
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        
        // 背景
        ctx.fillStyle = '#f8f9fa';
        ctx.beginPath();
        ctx.arc(256, 256, 256, 0, Math.PI * 2);
        ctx.fill();
        
        // 外圈
        ctx.strokeStyle = '#2c3e50';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(256, 256, 250, 0, Math.PI * 2);
        ctx.stroke();
        
        // 刻度和方位
        const directions = [
            { angle: 0, label: 'N', color: '#e74c3c', size: 48 },
            { angle: 90, label: 'E', color: '#34495e', size: 36 },
            { angle: 180, label: 'S', color: '#34495e', size: 36 },
            { angle: 270, label: 'W', color: '#34495e', size: 36 }
        ];
        
        // 绘制刻度
        for (let i = 0; i < 360; i += 10) {
            const angle = (i - 90) * Math.PI / 180;
            const isMain = i % 30 === 0;
            const length = isMain ? 30 : 15;
            const width = isMain ? 3 : 1;
            
            const x1 = 256 + Math.cos(angle) * 220;
            const y1 = 256 + Math.sin(angle) * 220;
            const x2 = 256 + Math.cos(angle) * (220 - length);
            const y2 = 256 + Math.sin(angle) * (220 - length);
            
            ctx.strokeStyle = '#34495e';
            ctx.lineWidth = width;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }
        
        // 绘制方位文字
        directions.forEach(dir => {
            const angle = (dir.angle - 90) * Math.PI / 180;
            const x = 256 + Math.cos(angle) * 170;
            const y = 256 + Math.sin(angle) * 170;
            
            ctx.fillStyle = dir.color;
            ctx.font = `bold ${dir.size}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(dir.label, x, y);
        });
        
        // 中心装饰
        ctx.fillStyle = '#34495e';
        ctx.beginPath();
        ctx.arc(256, 256, 15, 0, Math.PI * 2);
        ctx.fill();
        
        const texture = new THREE.CanvasTexture(canvas);
        const discGeometry = new THREE.CircleGeometry(19.5, 64);
        const discMaterial = new THREE.MeshStandardMaterial({ 
            map: texture, 
            roughness: 0.4,
            metalness: 0.1
        });
        const disc = new THREE.Mesh(discGeometry, discMaterial);
        disc.rotation.x = -Math.PI / 2;
        disc.position.y = 0.6;
        compassGroup.add(disc);
        
        // 指北针 - 红色箭头
        const arrowShape = new THREE.Shape();
        arrowShape.moveTo(0, 12);
        arrowShape.lineTo(-2, 0);
        arrowShape.lineTo(0, -1);
        arrowShape.lineTo(2, 0);
        arrowShape.closePath();
        
        const arrowGeometry = new THREE.ExtrudeGeometry(arrowShape, {
            depth: 1,
            bevelEnabled: false
        });
        const arrowMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xe74c3c,
            roughness: 0.3,
            metalness: 0.2
        });
        const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
        arrow.rotation.x = -Math.PI / 2;
        arrow.position.y = 1.2;
        compassGroup.add(arrow);
        
        compassGroup.position.set(0, 0.5, 180);
        return compassGroup;
    }

    const compass = createCompass();
    scene.add(compass);

    // 楼栋组
    const buildingsGroup = new THREE.Group();
    scene.add(buildingsGroup);

    // 热力图层组
    const heatmapGroup = new THREE.Group();
    scene.add(heatmapGroup);

    const HEATMAP_BASE_OPACITY = 0.85;
    const HEATMAP_HOVER_LIGHTEN = 0.18;
    const HEATMAP_SELECTED_LIGHTEN = 0.34;
    const HEATMAP_EDGE_LOCK_RATIO = 0.08;
    const HEATMAP_EDGE_LOCK_MIN = 0.03;
    const HEATMAP_EDGE_LOCK_MAX = 0.16;
    const HEATMAP_OCCLUSION_EPS = 0.8;
    const PRECOMPUTED_SCHEMA_VERSION = CONFIG.SUNLIGHT_ANALYSIS.PRECOMPUTED_SCHEMA_VERSION;
    const PRECOMPUTED_ALGORITHM_VERSION = CONFIG.SUNLIGHT_ANALYSIS.PRECOMPUTED_ALGORITHM_VERSION;
    const MAX_PRECOMPUTED_ENTRIES = CONFIG.SUNLIGHT_ANALYSIS.MAX_PRECOMPUTED_ENTRIES;
    const ANALYSIS_SEASON_PRESETS = new Set([
        'march-equinox',
        'june-solstice',
        'september-equinox',
        'december-solstice',
        'custom'
    ]);

    // ========== 状态变量 ==========
    let LATITUDE = CONFIG.DEFAULTS.LATITUDE;
    let LONGITUDE = CONFIG.DEFAULTS.LONGITUDE;
    let TIME_ZONE = CONFIG.DEFAULTS.TIME_ZONE;
    let NORTH_ANGLE = CONFIG.DEFAULTS.NORTH_ANGLE;
    let showOwnOnly = false;
    let rawData = null;
    let currentData = null;
    let sunlightResults = null; // 存储日照计算结果
    let showHeatmap = false;
    let hoverOccluderMeshes = [];
    let heatmapCellsByApartmentKey = new Map();
    let heatmapInstanceData = [];
    let heatmapResultsSource = null;
    let hoveredApartmentKey = null;
    let selectedApartmentKey = null;
    let currentUnitInfoData = null;
    let analysisVersion = 0;
    let activeAnalysisTask = null;
    let precomputedEntries = new Map();
    let importedPrecomputedSelection = null;
    let importDragDepth = 0;

    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');
    const dropOverlay = document.getElementById('dropOverlay');
    const exportAnalysisButton = document.getElementById('exportAnalysisBtn');
    const precomputedStatus = document.getElementById('precomputedStatus');

    function waitForNextPaint() {
        return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }

    function setLoadingOverlayVisible(visible, messageKey = 'viewer.importLoading') {
        if (!loadingOverlay) return;
        loadingOverlay.classList.toggle('is-active', visible);
        loadingOverlay.setAttribute('aria-hidden', visible ? 'false' : 'true');
        if (visible && loadingText) loadingText.textContent = i18n.t(messageKey);
    }

    function setDropOverlayVisible(visible) {
        if (!dropOverlay) return;
        dropOverlay.classList.toggle('is-active', visible);
        dropOverlay.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }

    class AnalysisCancelledError extends Error {
        constructor() {
            super('Sunlight analysis cancelled');
            this.name = 'AnalysisCancelledError';
        }
    }

    class AnalysisComplexityError extends Error {
        constructor() {
            super('Sunlight analysis complexity limit exceeded');
            this.name = 'AnalysisComplexityError';
        }
    }

    function cancelActiveAnalysis() {
        analysisVersion++;
        if (activeAnalysisTask) {
            const task = activeAnalysisTask;
            task.cancelled = true;
            if (task.worker) {
                task.worker.terminate();
                task.worker = null;
            }
            if (task.rejectWorker) {
                const rejectWorker = task.rejectWorker;
                task.rejectWorker = null;
                rejectWorker(new AnalysisCancelledError());
            }
        }
    }

    function assertAnalysisActive(task) {
        if (!task || task.cancelled || task.version !== analysisVersion || activeAnalysisTask !== task) {
            throw new AnalysisCancelledError();
        }
    }

    function formatAngleText(angle) {
        return Math.abs(Utils.normalizeAngle(angle)).toFixed(1).replace(/\.0$/, '');
    }

    function rebuildProjectScene() {
        if (!rawData) return;
        currentData = Utils.transformProjectData(rawData, NORTH_ANGLE);
        loadBuildings(currentData);
    }

    function syncCitySelection() {
        const citySelect = document.getElementById('citySelect');
        let matched = false;
        for (const option of citySelect.options) {
            if (option.dataset.lat
                && Math.abs(parseFloat(option.dataset.lat) - LATITUDE) < 0.01
                && Math.abs(parseFloat(option.dataset.lon) - LONGITUDE) < 0.01
                && option.dataset.timeZone === TIME_ZONE) {
                citySelect.value = option.value;
                matched = true;
                break;
            }
        }
        if (!matched) {
            citySelect.value = '';
        }
    }

    function syncLocationControls(location) {
        if (Number.isFinite(location?.latitude)) LATITUDE = location.latitude;
        if (Number.isFinite(location?.longitude)) LONGITUDE = location.longitude;
        if (Utils.isValidTimeZone(location?.timeZone)) TIME_ZONE = location.timeZone;

        document.getElementById('latitudeInput').value = LATITUDE;
        document.getElementById('longitudeInput').value = LONGITUDE;
        document.getElementById('timeZoneInput').value = TIME_ZONE;
        syncCitySelection();
        updateLatDisplay();
        updateSeasonOptions();
    }

    // ========== 纹理与材质工具 ==========
    function createFacadeTexture(floors, unitsPerFloor, unitRatiosPerFloor) {
        const maximumSize = Math.max(4, renderer.capabilities.maxTextureSize || 4096);
        const width = Math.min(512, maximumSize);
        const height = Math.min(maximumSize, Math.max(floors * 28, 4));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        const grd = ctx.createLinearGradient(0, 0, 0, canvas.height);
        grd.addColorStop(0, '#b1bfd1');
        grd.addColorStop(1, '#a2b2c7');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, width, height);

        // flipY 将 Canvas 顶部映射到 UV v=1，因此从最高层开始绘制。
        for (let canvasFloor = 0; canvasFloor < floors; canvasFloor++) {
            const floorIndex = floors - canvasFloor - 1;
            const y0 = Math.floor(canvasFloor * height / floors);
            const y1 = Math.floor((canvasFloor + 1) * height / floors);
            const bandH = y1 - y0;

            const nUnits = Math.max(1, unitsPerFloor[floorIndex] || 1);
            if (nUnits > 1) {
                const ratios = getUnitRatiosForFloor(unitRatiosPerFloor, floorIndex, floors, nUnits);
                let acc = 0;
                for (let i = 0; i < nUnits - 1; i++) {
                    const ratio = ratios ? ratios[i] : (1 / nUnits);
                    acc += ratio;
                    const x = Math.round(acc * width);
                    ctx.fillStyle = 'rgba(35,45,60,0.6)';
                    ctx.fillRect(x - 1, y0, 2, bandH);
                    ctx.fillStyle = 'rgba(255,255,255,0.22)';
                    ctx.fillRect(x + 1, y0, 1, bandH);
                }
            }

            if (canvasFloor < floors - 1) {
                ctx.fillStyle = 'rgba(35,45,60,0.55)';
                ctx.fillRect(0, y1 - 1, width, 2);
                ctx.fillStyle = 'rgba(255,255,255,0.25)';
                ctx.fillRect(0, y1 + 1, width, 1);
            }
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.flipY = true;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy?.() || 1);
        tex.needsUpdate = true;
        return tex;
    }

    function getFacadeTexture(cache, floors, unitsPerFloor, unitRatiosPerFloor) {
        const key = JSON.stringify([floors, unitsPerFloor, unitRatiosPerFloor || null]);
        if (!cache.has(key)) {
            cache.set(key, createFacadeTexture(floors, unitsPerFloor, unitRatiosPerFloor));
        }
        return cache.get(key);
    }

    const roofMaterial = new THREE.MeshStandardMaterial({ 
        color: CONFIG.MATERIALS.ROOF_COLOR, 
        roughness: 0.9, 
        metalness: 0.0 
    });

    function createEdgeLines(geometry, color = 0x435061, opacity = 0.5) {
        const edges = new THREE.EdgesGeometry(geometry, 15);
        const line = new THREE.LineSegments(
            edges,
            new THREE.LineBasicMaterial({ color, linewidth: 1, transparent: true, opacity })
        );
        return line;
    }

    function createLabel(text, x, y, z) {
        const t = (text ?? '').toString().trim();
        if (!t) return null;

        const canvas = document.createElement('canvas');
        const size = 256;
        canvas.width = size;
        canvas.height = size / 2;
        const ctx = canvas.getContext('2d');

        const r = 28, w = size - 24, h = (size / 2) - 24, x0 = 12, y0 = 12;
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.beginPath();
        ctx.moveTo(x0 + r, y0);
        ctx.arcTo(x0 + w, y0, x0 + w, y0 + h, r);
        ctx.arcTo(x0 + w, y0 + h, x0, y0 + h, r);
        ctx.arcTo(x0, y0 + h, x0, y0, r);
        ctx.arcTo(x0, y0, x0 + r, y0, r);
        ctx.closePath();
        ctx.fill();

        const maxTextWidth = w - 28;
        let fontSize = 72;
        ctx.font = `bold ${fontSize}px Arial, Helvetica, sans-serif`;
        const measuredWidth = ctx.measureText(t).width;
        if (measuredWidth > maxTextWidth) {
            fontSize = Math.max(12, Math.floor(fontSize * maxTextWidth / measuredWidth));
            ctx.font = `bold ${fontSize}px Arial, Helvetica, sans-serif`;
        }
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(t, size / 2, (size / 4) + 2);

        const tex = new THREE.CanvasTexture(canvas);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true }));
        sprite.scale.set(12, 6, 1);
        sprite.position.set(x, y + 4, z);
        sprite.userData.type = 'label';
        return sprite;
    }

    function makeUVGenerator(shape, totalHeight, axis) {
        let minProj = Infinity;
        let maxProj = -Infinity;

        for (let i = 0; i < shape.length; i++) {
            const proj = dot2(shape[i], axis);
            if (proj < minProj) minProj = proj;
            if (proj > maxProj) maxProj = proj;
        }

        const spanProj = Math.max(1e-6, maxProj - minProj);
        const invDepth = totalHeight > 0 ? 1 / totalHeight : 1;

        return {
            generateTopUV: function() {
                return [
                    new THREE.Vector2(0, 0),
                    new THREE.Vector2(1, 0),
                    new THREE.Vector2(0, 1),
                ];
            },
            generateSideWallUV: function(geometry, vertices, a, b, c, d) {
                const ax = vertices[a * 3], ay = vertices[a * 3 + 1], az = vertices[a * 3 + 2];
                const bx = vertices[b * 3], by = vertices[b * 3 + 1], bz = vertices[b * 3 + 2];
                const cx = vertices[c * 3], cy = vertices[c * 3 + 1], cz = vertices[c * 3 + 2];
                const dx = vertices[d * 3], dy = vertices[d * 3 + 1], dz = vertices[d * 3 + 2];

                const projA = dot2({ x: ax, y: -ay }, axis);
                const projB = dot2({ x: bx, y: -by }, axis);
                const projC = dot2({ x: cx, y: -cy }, axis);
                const projD = dot2({ x: dx, y: -dy }, axis);

                const uA = (maxProj - projA) / spanProj;
                const uB = (maxProj - projB) / spanProj;
                const uC = (maxProj - projC) / spanProj;
                const uD = (maxProj - projD) / spanProj;

                const vA = az * invDepth;
                const vB = bz * invDepth;
                const vC = cz * invDepth;
                const vD = dz * invDepth;

                return [
                    new THREE.Vector2(uA, vA),
                    new THREE.Vector2(uB, vB),
                    new THREE.Vector2(uC, vC),
                    new THREE.Vector2(uD, vD),
                ];
            },
        };
    }

    function normalizeUnitsPerFloor(building) {
        const floors = Math.max(1, parseInt(building.floors || 1, 10));
        if (Array.isArray(building.unitsPerFloor) && building.unitsPerFloor.length > 0) {
            const arr = [];
            for (let i = 0; i < floors; i++) {
                const v = building.unitsPerFloor[i] !== undefined ? building.unitsPerFloor[i] : building.unitsPerFloor[building.unitsPerFloor.length - 1];
                const n = Math.max(1, parseInt(v || 1, 10));
                arr.push(n);
            }
            return arr;
        } else {
            const n = Math.max(1, parseInt(building.units || 1, 10));
            return new Array(floors).fill(n);
        }
    }

    function normalizeUnitRatios(ratios, units) {
        if (!Array.isArray(ratios) || ratios.length !== units) return null;

        const cleaned = ratios.map(v => Math.max(0, Number(v) || 0));
        const sum = cleaned.reduce((acc, v) => acc + v, 0);
        if (sum <= 1e-9) return null;

        return cleaned.map(v => v / sum);
    }

    function getSharedFirstFloorUnitRatios(unitRatiosPerFloor, floors, units) {
        if (!Array.isArray(unitRatiosPerFloor) || unitRatiosPerFloor.length === 0) return null;

        const first = normalizeUnitRatios(unitRatiosPerFloor[0], units);
        if (!first) return null;

        for (let i = 1; i < floors; i++) {
            const next = unitRatiosPerFloor[i];
            if (next == null) continue;

            const normalized = normalizeUnitRatios(next, units);
            if (!normalized) return null;

            for (let j = 0; j < units; j++) {
                if (Math.abs(normalized[j] - first[j]) > 1e-6) {
                    return null;
                }
            }
        }

        return first;
    }

    function getUnitRatiosForFloor(unitRatiosPerFloor, floorIndex, floors, units) {
        const direct = normalizeUnitRatios(unitRatiosPerFloor?.[floorIndex], units);
        if (direct) return direct;

        if (floorIndex > 0) {
            const sharedFirst = getSharedFirstFloorUnitRatios(unitRatiosPerFloor, floors, units);
            if (sharedFirst) return sharedFirst.slice();
        }

        return null;
    }

    function normalizeUnitNumberingStartSide(value) {
        return value === 'B' ? 'B' : 'A';
    }

    function isUnitNumberingStartFromSideB(building) {
        return normalizeUnitNumberingStartSide(building?.unitNumberingStartSide) === 'B';
    }

    function getDisplayUnitNumber(building, physicalUnitIndex, units) {
        return isUnitNumberingStartFromSideB(building)
            ? (units - physicalUnitIndex)
            : (physicalUnitIndex + 1);
    }

    function dot2(point, axis) {
        return (point?.x || 0) * (axis?.x || 0) + (point?.y || 0) * (axis?.y || 0);
    }

    function axisFromAngleDeg(angleDeg) {
        const rad = (Number(angleDeg) || 0) * Math.PI / 180;
        return { x: Math.cos(rad), y: Math.sin(rad) };
    }

    function getHeatmapCellWidth(subLen) {
        const sideInset = 0.12;
        return Math.min(subLen * 0.9, Math.max(0.06, subLen - sideInset * 2));
    }

    // ========== 日照分析核心功能 ==========

    function getBuildingSplitAxis(building) {
        return axisFromAngleDeg(building?.unitSplitAngleDeg || 0);
    }

    /**
     * 计算所有外墙片段上的采光检测点
     */
    function calculateSamplingPoints(building, buildingIndex, maxPoints = Infinity) {
        const points = [];
        const floors = Math.max(1, parseInt(building.floors || 1, 10));
        const floorHeight = building.floorHeight || 3;
        const unitsPerFloor = normalizeUnitsPerFloor(building);
        const axis = getBuildingSplitAxis(building);

        if (!Array.isArray(building.shape) || building.shape.length < 3) return points;

        let signedArea = 0;
        for (let i = 0; i < building.shape.length; i++) {
            const p1 = building.shape[i];
            const p2 = building.shape[(i + 1) % building.shape.length];
            signedArea += p1.x * p2.y - p2.x * p1.y;
        }

        const isCCW = signedArea > 0;
        const segments = [];
        let minProj = Infinity;
        let maxProj = -Infinity;

        for (let i = 0; i < building.shape.length; i++) {
            const start = building.shape[i];
            const end = building.shape[(i + 1) % building.shape.length];
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const len = Math.hypot(dx, dy);
            if (len <= 1e-6) continue;

            const leftNormal = { x: -dy / len, y: dx / len };
            const rightNormal = { x: dy / len, y: -dx / len };
            const outward = isCCW ? rightNormal : leftNormal;
            const pA = dot2(start, axis);
            const pB = dot2(end, axis);

            minProj = Math.min(minProj, pA, pB);
            maxProj = Math.max(maxProj, pA, pB);
            segments.push({ start, end, len, outward, pA, pB });
        }

        const spanProj = maxProj - minProj;
        if (!isFinite(spanProj) || segments.length === 0) return points;

        for (let floor = 0; floor < floors; floor++) {
            const units = unitsPerFloor[floor];
            const requestedWindowOffset = floorHeight * CONFIG.SUNLIGHT_ANALYSIS.FLOOR_HEIGHT_RATIO
                + CONFIG.SUNLIGHT_ANALYSIS.WINDOW_HEIGHT_OFFSET;
            const windowOffset = Math.min(floorHeight - 0.05, Math.max(0.05, requestedWindowOffset));
            const windowHeight = floor * floorHeight + windowOffset;
            const ratios = getUnitRatiosForFloor(building.unitRatiosPerFloor, floor, floors, units);
            const boundaries = [maxProj + 1e-4];

            let cumulative = 0;
            for (let unit = 0; unit < units; unit++) {
                const ratio = ratios ? ratios[unit] : (1 / units);
                cumulative += ratio;
                boundaries.push(maxProj - cumulative * spanProj);
            }
            boundaries[units] -= 1e-4;

            for (const segment of segments) {
                const ts = [0, 1];

                if (spanProj > 1e-6 && Math.abs(segment.pB - segment.pA) > 1e-6) {
                    for (const boundary of boundaries) {
                        const t = (boundary - segment.pA) / (segment.pB - segment.pA);
                        if (t > 0 && t < 1) ts.push(t);
                    }
                }

                ts.sort((a, b) => a - b);

                const uniqueTs = [];
                for (let i = 0; i < ts.length; i++) {
                    if (i === 0 || ts[i] - uniqueTs[uniqueTs.length - 1] > 1e-6) {
                        uniqueTs.push(ts[i]);
                    }
                }

                for (let i = 0; i < uniqueTs.length - 1; i++) {
                    const tStart = uniqueTs[i];
                    const tEnd = uniqueTs[i + 1];
                    const tMid = (tStart + tEnd) / 2;
                    const projMid = segment.pA + tMid * (segment.pB - segment.pA);

                    let unitIdx = units - 1;
                    for (let unit = 0; unit < units; unit++) {
                        if (projMid <= boundaries[unit] + 1e-5 && projMid >= boundaries[unit + 1] - 1e-5) {
                            unitIdx = unit;
                            break;
                        }
                    }

                    const subLen = (tEnd - tStart) * segment.len;
                    if (subLen <= 1e-9) continue;

                    const midX = segment.start.x + tMid * (segment.end.x - segment.start.x);
                    const midY = segment.start.y + tMid * (segment.end.y - segment.start.y);
                    const dx = segment.end.x - segment.start.x;
                    const dy = segment.end.y - segment.start.y;
                    const tangent = segment.len > 1e-6
                        ? { x: dx / segment.len, y: dy / segment.len }
                        : { x: 1, y: 0 };

                    if (points.length >= maxPoints) throw new AnalysisComplexityError();
                    points.push({
                        buildingIndex,
                        buildingName: building.name || `建筑${buildingIndex + 1}`,
                        floor: floor + 1,
                        unit: getDisplayUnitNumber(building, unitIdx, units),
                        x: midX + segment.outward.x * 0.5,
                        y: midY + segment.outward.y * 0.5,
                        z: windowHeight,
                        wallDataX: midX,
                        wallDataY: midY,
                        outward: segment.outward,
                        tangent: tangent,
                        cellWidth: getHeatmapCellWidth(subLen),
                        sunlightHours: 0
                    });
                }
            }
        }

        return points;
    }

    function calculateSunPosition(civilHour, latitude, declination, solarTimeOffset = 0) {
        const rad = Math.PI / 180;
        const solarHour = civilHour + solarTimeOffset;
        const hAngle = (solarHour - 12) * 15 * rad;
        const lat = latitude * rad;
        const dec = declination * rad;

        const sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hAngle);
        const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));

        const cosAz = (sinAlt * Math.sin(lat) - Math.sin(dec)) / (Math.cos(alt) * Math.cos(lat));
        let az = Math.acos(Math.min(1, Math.max(-1, cosAz)));
        if (solarHour >= 12) az = -az;

        const y = Math.sin(alt);
        const r = Math.cos(alt);
        const x = r * Math.sin(az);
        const z = r * Math.cos(az);

        return {
            altitude: alt,
            direction: new THREE.Vector3(x, y, z).normalize()
        };
    }

    /**
     * 计算指向太阳的方向向量
     */
    function calculateSunDirection(hour, latitude, declination, solarTimeOffset = 0) {
        const position = calculateSunPosition(hour, latitude, declination, solarTimeOffset);
        if (!position || position.altitude <= 0.01) return null; // 太阳在地平线以下或刚好在地平线
        return position.direction;
    }

    function isFacadeFacingSun(point, sunDirection) {
        if (!point?.outward || !sunDirection) return true;
        return ((point.outward.x || 0) * sunDirection.x + (point.outward.y || 0) * sunDirection.z) > 1e-6;
    }

    /**
     * 收集所有建筑物的mesh用于射线检测
     */
    function collectBuildingMeshes() {
        const meshes = [];
        buildingsGroup.traverse(obj => {
            if (obj.isMesh && obj.geometry) {
                meshes.push(obj);
            }
        });
        return meshes;
    }

    function refreshHoverOccluderMeshes() {
        hoverOccluderMeshes = collectBuildingMeshes();
    }

    function makeApartmentKey(data) {
        if (!data) return '';
        const buildingKey = data.buildingIndex != null ? data.buildingIndex : (data.buildingName || '');
        return `${buildingKey}::${data.floor}::${data.unit}`;
    }

    // Heatmap hit filtering and split-edge locking were adapted from the wingkinl fork (MIT).
    function filterHeatHitsByOcclusion(raycaster, heatHits) {
        if (!Array.isArray(heatHits) || heatHits.length === 0) return [];
        if (!Array.isArray(hoverOccluderMeshes) || hoverOccluderMeshes.length === 0) return heatHits;

        const buildingHits = raycaster.intersectObjects(hoverOccluderMeshes, true);
        const nearestBuildingHit = buildingHits.find(hit => hit && hit.distance > 1e-6);
        if (!nearestBuildingHit) return heatHits;

        const maxAcceptedDistance = nearestBuildingHit.distance + HEATMAP_OCCLUSION_EPS;
        return heatHits.filter(hit => hit && hit.distance <= maxAcceptedDistance);
    }

    function isIntersectionNearCellEdge(intersection) {
        const obj = intersection?.object;
        const instanceId = intersection?.instanceId;
        const descriptor = Number.isInteger(instanceId) ? heatmapInstanceData[instanceId] : null;
        if (!obj?.isInstancedMesh || !descriptor || !intersection.point) {
            return false;
        }

        const instanceMatrix = new THREE.Matrix4();
        const worldMatrix = new THREE.Matrix4();
        obj.getMatrixAt(instanceId, instanceMatrix);
        worldMatrix.multiplyMatrices(obj.matrixWorld, instanceMatrix).invert();
        const localPoint = intersection.point.clone().applyMatrix4(worldMatrix);
        const width = descriptor.cellWidth;
        const edgeGap = (0.5 - Math.abs(localPoint.x)) * width;
        const lockBand = Math.max(
            HEATMAP_EDGE_LOCK_MIN,
            Math.min(HEATMAP_EDGE_LOCK_MAX, width * HEATMAP_EDGE_LOCK_RATIO)
        );

        return edgeGap >= -1e-4 && edgeGap <= lockBand;
    }

    function getHeatmapHitDescriptor(hit) {
        return Number.isInteger(hit?.instanceId) ? heatmapInstanceData[hit.instanceId] || null : null;
    }

    function findRepresentativeCell(apartmentKey) {
        const cells = heatmapCellsByApartmentKey.get(apartmentKey);
        return Array.isArray(cells) && cells.length > 0 ? cells[0] : null;
    }

    function findHitCellForApartment(heatHits, apartmentKey) {
        if (!Array.isArray(heatHits) || !apartmentKey) return null;
        const hit = heatHits.find(item => getHeatmapHitDescriptor(item)?.userData?.apartmentKey === apartmentKey);
        return getHeatmapHitDescriptor(hit);
    }

    function applyHeatmapCellVisual(cell, options = {}) {
        if (!cell?.mesh || !cell.baseColor) return;

        const isSelected = !!options.selected;
        const isHovered = !!options.hovered;
        const targetColor = cell.baseColor.clone();
        const lighten = isSelected
            ? HEATMAP_SELECTED_LIGHTEN
            : (isHovered ? HEATMAP_HOVER_LIGHTEN : 0);

        if (lighten > 0) {
            targetColor.lerp(new THREE.Color(1, 1, 1), lighten);
        }

        cell.mesh.setColorAt(cell.instanceId, targetColor);
        if (cell.mesh.instanceColor) cell.mesh.instanceColor.needsUpdate = true;
    }

    function updateApartmentHighlight(apartmentKey) {
        if (!apartmentKey) return;
        const cells = heatmapCellsByApartmentKey.get(apartmentKey);
        if (!Array.isArray(cells)) return;

        const isSelected = apartmentKey === selectedApartmentKey;
        const isHovered = apartmentKey === hoveredApartmentKey;
        cells.forEach(cell => applyHeatmapCellVisual(cell, { selected: isSelected, hovered: isHovered }));
    }

    function refreshHeatmapHighlights(changedKeys = []) {
        const keys = new Set(changedKeys.filter(Boolean));
        if (selectedApartmentKey) keys.add(selectedApartmentKey);
        if (hoveredApartmentKey) keys.add(hoveredApartmentKey);
        keys.forEach(updateApartmentHighlight);
        if (keys.size > 0) requestRender();
    }

    function setHoveredApartment(apartmentKey) {
        if (apartmentKey === hoveredApartmentKey) return;
        const previousKey = hoveredApartmentKey;
        hoveredApartmentKey = apartmentKey || null;
        refreshHeatmapHighlights([previousKey, hoveredApartmentKey]);
    }

    function setSelectedApartment(apartmentKey) {
        if (apartmentKey === selectedApartmentKey) return;
        const previousKey = selectedApartmentKey;
        selectedApartmentKey = apartmentKey || null;
        refreshHeatmapHighlights([previousKey, selectedApartmentKey]);
    }

    function clearHeatmapInteractionState(options = {}) {
        const hidePanel = options.hidePanel !== false;
        const changedKeys = [];
        if (hoveredApartmentKey) changedKeys.push(hoveredApartmentKey);
        if (selectedApartmentKey) changedKeys.push(selectedApartmentKey);

        hoveredApartmentKey = null;
        selectedApartmentKey = null;
        currentUnitInfoData = null;
        refreshHeatmapHighlights(changedKeys);
        renderer.domElement.style.cursor = '';

        if (hidePanel) {
            document.getElementById('unitInfoPanel').style.display = 'none';
        }
        if (sunlightResults) {
            showSunlightStats(sunlightResults);
        }
    }

    function resetHeatmapHoverState() {
        setHoveredApartment(null);
        if (!selectedApartmentKey && currentUnitInfoData) {
            currentUnitInfoData = null;
            if (sunlightResults) {
                showSunlightStats(sunlightResults);
            }
        }
        renderer.domElement.style.cursor = '';
    }

    function pickApartmentKeyFromHeatHits(heatHits, fallbackApartmentKey, allowFirstOnAmbiguous = false) {
        if (!Array.isArray(heatHits) || heatHits.length === 0) return null;

        const firstHit = heatHits[0];
        const firstData = getHeatmapHitDescriptor(firstHit)?.userData;
        const firstKey = firstData?.apartmentKey;
        if (!firstKey) return null;

        if (!isIntersectionNearCellEdge(firstHit)) return firstKey;

        if (fallbackApartmentKey) {
            const fallbackCell = findRepresentativeCell(fallbackApartmentKey);
            if (fallbackCell) {
                const sameBuilding = fallbackCell.userData?.buildingIndex === firstData?.buildingIndex;
                const sameFloor = fallbackCell.userData?.floor === firstData?.floor;
                if (sameBuilding && sameFloor) {
                    return fallbackApartmentKey;
                }
            }
        }

        return allowFirstOnAmbiguous ? firstKey : null;
    }

    /**
     * 检查某点在某时刻是否有日照
     */
    function checkSunlight(point, sunDirection, buildingMeshes, raycaster) {
        if (!sunDirection) return false;
        if (!isFacadeFacingSun(point, sunDirection)) return false;

        // 转换坐标：数据中的 (x, y) -> 3D 中的 (x, z)，z 是高度变 y
        const origin = new THREE.Vector3(point.x, point.z, point.y);

        raycaster.set(origin, sunDirection);
        raycaster.near = 0.1;
        raycaster.far = Infinity;

        // 起点已沿立面外法线偏移，near 只忽略起始面；同一楼栋的其他翼仍参与遮挡。
        const intersects = raycaster.intersectObjects(buildingMeshes, false);
        return intersects.length === 0;
    }

    function buildSunlightResultsFromPoints(allPoints, snapshot) {
        const results = {
            points: allPoints,
            source: snapshot.source || 'calculated',
            algorithmVersion: snapshot.algorithmVersion,
            projectFingerprint: snapshot.projectFingerprint,
            samplingFingerprint: snapshot.samplingFingerprint,
            declination: snapshot.declination,
            latitude: snapshot.latitude,
            longitude: snapshot.longitude,
            timeZone: snapshot.timeZone,
            northAngle: snapshot.northAngle,
            date: snapshot.date,
            seasonPreset: snapshot.seasonPreset,
            solarTimeOffset: snapshot.solarTimeOffset,
            timeStep: snapshot.timeStep,
            startHour: snapshot.startHour,
            endHour: snapshot.endHour,
            referenceHours: snapshot.referenceHours,
            buildings: {}
        };

        let sumUnitHours = 0;
        let totalUnits = 0;
        let globalMin = Infinity;
        let globalMax = 0;
        const referenceHours = snapshot.referenceHours;

        allPoints.forEach(point => {
            const buildingKey = String(point.buildingIndex);
            if (!results.buildings[buildingKey]) {
                results.buildings[buildingKey] = {
                    name: point.buildingName,
                    units: [],
                    unitsMap: new Map(),
                    minHours: Infinity,
                    maxHours: 0,
                    avgHours: 0,
                    totalUnits: 0
                };
            }

            const buildingResult = results.buildings[buildingKey];
            const unitKey = `${point.floor}-${point.unit}`;
            if (!buildingResult.unitsMap.has(unitKey)) {
                buildingResult.unitsMap.set(unitKey, []);
            }
            buildingResult.unitsMap.get(unitKey).push(point);
        });

        for (const key of Object.keys(results.buildings)) {
            const buildingResult = results.buildings[key];
            let buildingSum = 0;
            let buildingBelowReference = 0;

            for (const unitPoints of buildingResult.unitsMap.values()) {
                let unitMaxHours = 0;
                unitPoints.forEach(point => {
                    unitMaxHours = Math.max(unitMaxHours, Number(point.sunlightHours) || 0);
                });

                unitPoints.forEach(point => {
                    point.unitMaxHours = unitMaxHours;
                });

                buildingResult.units.push(...unitPoints);
                buildingResult.minHours = Math.min(buildingResult.minHours, unitMaxHours);
                buildingResult.maxHours = Math.max(buildingResult.maxHours, unitMaxHours);
                buildingResult.totalUnits++;
                buildingSum += unitMaxHours;
                sumUnitHours += unitMaxHours;
                totalUnits++;
                if (unitMaxHours < referenceHours) buildingBelowReference++;
                globalMin = Math.min(globalMin, unitMaxHours);
                globalMax = Math.max(globalMax, unitMaxHours);
            }

            buildingResult.avgHours = buildingResult.totalUnits > 0 ? (buildingSum / buildingResult.totalUnits) : 0;
            buildingResult.belowReference = buildingBelowReference;
            delete buildingResult.unitsMap;
        }

        results.totalUnits = totalUnits;
        results.minHours = globalMin === Infinity ? 0 : globalMin;
        results.maxHours = globalMax;
        results.avgHours = totalUnits > 0 ? (sumUnitHours / totalUnits) : 0;
        results.belowReference = totalUnits === 0
            ? 0
            : allPoints.filter(point => point.unitMaxHours < referenceHours)
                .reduce((set, point) => {
                    set.add(`${point.buildingIndex}-${point.floor}-${point.unit}`);
                    return set;
                }, new Set()).size;

        return results;
    }

    function getAnalysisSolarSettings() {
        const seasonPreset = document.getElementById('seasonSelect').value;
        const date = seasonPreset === 'custom'
            ? document.getElementById('customDateInput').value
            : Utils.getSeasonPresetDate(seasonPreset);
        const declination = Utils.calculateSolarDeclination(date);
        const solarTimeOffset = Utils.calculateSolarTimeOffset(date, LONGITUDE, TIME_ZONE);
        if (!date || !Number.isFinite(declination) || !Number.isFinite(solarTimeOffset)) {
            const error = new Error('Invalid location or analysis date');
            error.name = 'InvalidLocationError';
            throw error;
        }
        return { date, declination, solarTimeOffset, seasonPreset };
    }

    function getReferenceHours() {
        const input = document.getElementById('referenceHoursInput');
        const fallback = CONFIG.SUNLIGHT_ANALYSIS.REFERENCE_HOURS || 2;
        const value = Number(input?.value);
        return Number.isFinite(value) ? Math.min(12, Math.max(0.1, value)) : fallback;
    }

    function createAnalysisProjectFingerprint(data) {
        return Utils.createFingerprint({ buildings: data?.buildings || [] });
    }

    function createSamplingFingerprint(points) {
        return Utils.createFingerprint((points || []).map(point => ({
            buildingIndex: point.buildingIndex,
            floor: point.floor,
            unit: point.unit,
            x: Utils.roundTo(point.x, 6),
            y: Utils.roundTo(point.y, 6),
            z: Utils.roundTo(point.z, 6),
            wallDataX: Utils.roundTo(point.wallDataX, 6),
            wallDataY: Utils.roundTo(point.wallDataY, 6),
            outwardX: Utils.roundTo(point.outward?.x || 0, 6),
            outwardY: Utils.roundTo(point.outward?.y || 0, 6),
            cellWidth: Utils.roundTo(point.cellWidth, 6)
        })));
    }

    function createAnalysisIdentity(analysisData, solarSettings = getAnalysisSolarSettings()) {
        return {
            algorithmVersion: PRECOMPUTED_ALGORITHM_VERSION,
            projectFingerprint: createAnalysisProjectFingerprint(analysisData),
            latitude: Utils.roundTo(LATITUDE, 8),
            longitude: Utils.roundTo(LONGITUDE, 8),
            timeZone: TIME_ZONE,
            northAngle: Utils.roundTo(NORTH_ANGLE, 8),
            date: solarSettings.date,
            declination: Utils.roundTo(solarSettings.declination, 8),
            solarTimeOffset: Utils.roundTo(solarSettings.solarTimeOffset, 8),
            timeStep: CONFIG.SUNLIGHT_ANALYSIS.TIME_INTERVAL,
            startHour: CONFIG.TIME.MIN_HOUR,
            endHour: CONFIG.TIME.MAX_HOUR
        };
    }

    function createAnalysisKey(identity) {
        return Utils.createFingerprint(identity);
    }

    function collectAnalysisPoints(analysisData, maxPoints = CONFIG.SUNLIGHT_ANALYSIS.MAX_SAMPLE_POINTS) {
        const points = [];
        analysisData.buildings.forEach((building, index) => {
            if (building.isThisCommunity === false) return;
            const remaining = maxPoints - points.length;
            points.push(...calculateSamplingPoints(building, index, remaining));
        });
        return points;
    }

    function getCurrentProjectPrecomputedEntries() {
        if (!currentData) return [];
        const projectFingerprint = createAnalysisProjectFingerprint(currentData);
        return Array.from(precomputedEntries.values())
            .filter(entry => entry.identity.projectFingerprint === projectFingerprint);
    }

    function updatePrecomputedControls(messageKey = null, replacement = null) {
        const entries = getCurrentProjectPrecomputedEntries();
        if (exportAnalysisButton) exportAnalysisButton.disabled = entries.length === 0;
        if (!precomputedStatus) return;
        if (messageKey) {
            const text = replacement == null
                ? i18n.t(messageKey)
                : i18n.t(messageKey).replace('{0}', replacement);
            precomputedStatus.textContent = text;
        } else {
            precomputedStatus.textContent = entries.length > 0
                ? i18n.t('viewer.precomputedReady').replace('{0}', entries.length)
                : '';
        }
    }

    function cacheSunlightResult(results) {
        if (!results?.projectFingerprint || !results?.samplingFingerprint || !Array.isArray(results.points)) return;
        const identity = {
            algorithmVersion: results.algorithmVersion,
            projectFingerprint: results.projectFingerprint,
            latitude: results.latitude,
            longitude: results.longitude,
            timeZone: results.timeZone,
            northAngle: results.northAngle,
            date: results.date,
            declination: results.declination,
            solarTimeOffset: results.solarTimeOffset,
            timeStep: results.timeStep,
            startHour: results.startHour,
            endHour: results.endHour
        };
        const key = createAnalysisKey(identity);
        const entry = {
            key,
            identity,
            samplingFingerprint: results.samplingFingerprint,
            pointCount: results.points.length,
            hours: results.points.map(point => Utils.roundTo(Number(point.sunlightHours) || 0, 4)),
            createdAt: new Date().toISOString()
        };
        precomputedEntries.delete(key);
        precomputedEntries.set(key, entry);
        while (precomputedEntries.size > MAX_PRECOMPUTED_ENTRIES) {
            precomputedEntries.delete(precomputedEntries.keys().next().value);
        }
        updatePrecomputedControls();
    }

    function isValidPrecomputedIdentity(identity) {
        return !!identity
            && identity.algorithmVersion === PRECOMPUTED_ALGORITHM_VERSION
            && typeof identity.projectFingerprint === 'string'
            && /^[0-9a-f]{16}$/.test(identity.projectFingerprint)
            && Number.isFinite(identity.latitude) && identity.latitude >= -90 && identity.latitude <= 90
            && Number.isFinite(identity.longitude) && identity.longitude >= -180 && identity.longitude <= 180
            && Utils.isValidTimeZone(identity.timeZone)
            && Number.isFinite(identity.northAngle)
            && !!Utils.parseDateParts(identity.date)
            && Number.isFinite(identity.declination)
            && Number.isFinite(identity.solarTimeOffset)
            && identity.timeStep === CONFIG.SUNLIGHT_ANALYSIS.TIME_INTERVAL
            && identity.startHour === CONFIG.TIME.MIN_HOUR
            && identity.endHour === CONFIG.TIME.MAX_HOUR;
    }

    function normalizePrecomputedEntry(entry, currentProjectFingerprint) {
        if (!entry || !isValidPrecomputedIdentity(entry.identity)) return null;
        if (entry.identity.projectFingerprint !== currentProjectFingerprint) return null;
        if (entry.key !== createAnalysisKey(entry.identity)) return null;
        if (!/^[0-9a-f]{16}$/.test(entry.samplingFingerprint || '')) return null;
        if (!Number.isInteger(entry.pointCount)
            || entry.pointCount < 1
            || entry.pointCount > CONFIG.SUNLIGHT_ANALYSIS.MAX_SAMPLE_POINTS
            || !Array.isArray(entry.hours)
            || entry.hours.length !== entry.pointCount) return null;
        const hours = entry.hours.map(value => Number(value));
        if (hours.some(value => !Number.isFinite(value) || value < 0 || value > 12.001)) return null;
        return {
            key: entry.key,
            identity: Utils.deepClone(entry.identity),
            samplingFingerprint: entry.samplingFingerprint,
            pointCount: entry.pointCount,
            hours,
            createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : null
        };
    }

    function importPrecomputedPayload(payload) {
        precomputedEntries = new Map();
        importedPrecomputedSelection = null;
        if (payload == null) {
            updatePrecomputedControls();
            return 0;
        }
        if (!currentData
            || payload?.schemaVersion !== PRECOMPUTED_SCHEMA_VERSION
            || payload?.algorithmVersion !== PRECOMPUTED_ALGORITHM_VERSION
            || !Array.isArray(payload.entries)) {
            updatePrecomputedControls('viewer.precomputedIgnored');
            return 0;
        }

        const projectFingerprint = createAnalysisProjectFingerprint(currentData);
        payload.entries.slice(0, MAX_PRECOMPUTED_ENTRIES).forEach(rawEntry => {
            const entry = normalizePrecomputedEntry(rawEntry, projectFingerprint);
            if (entry) precomputedEntries.set(entry.key, entry);
        });
        const activeSelection = payload.activeSelection;
        const activeEntry = activeSelection && precomputedEntries.get(activeSelection.key);
        if (activeEntry
            && ANALYSIS_SEASON_PRESETS.has(activeSelection.seasonPreset)
            && activeSelection.date === activeEntry.identity.date) {
            importedPrecomputedSelection = {
                key: activeEntry.key,
                seasonPreset: activeSelection.seasonPreset,
                date: activeEntry.identity.date
            };
        }
        if (precomputedEntries.size === 0) {
            updatePrecomputedControls('viewer.precomputedIgnored');
        } else {
            updatePrecomputedControls();
        }
        return precomputedEntries.size;
    }

    function getActivePrecomputedSelection() {
        if (!currentData) return null;
        try {
            const solarSettings = getAnalysisSolarSettings();
            const identity = createAnalysisIdentity(currentData, solarSettings);
            const key = createAnalysisKey(identity);
            if (!precomputedEntries.has(key)) return null;
            return {
                key,
                seasonPreset: solarSettings.seasonPreset,
                date: solarSettings.date
            };
        } catch (error) {
            return null;
        }
    }

    function buildPrecomputedPayload() {
        return {
            schemaVersion: PRECOMPUTED_SCHEMA_VERSION,
            algorithmVersion: PRECOMPUTED_ALGORITHM_VERSION,
            activeSelection: getActivePrecomputedSelection(),
            entries: getCurrentProjectPrecomputedEntries().map(entry => Utils.deepClone(entry))
        };
    }

    function restoreImportedPrecomputedSelection() {
        const selection = importedPrecomputedSelection;
        importedPrecomputedSelection = null;
        if (!selection || !precomputedEntries.has(selection.key)) return false;

        const seasonSelect = document.getElementById('seasonSelect');
        const customDateInput = document.getElementById('customDateInput');
        const customDatePicker = document.getElementById('customDatePicker');
        const presetDate = selection.seasonPreset === 'custom'
            ? null
            : Utils.getSeasonPresetDate(selection.seasonPreset);
        const canRestorePreset = presetDate === selection.date;

        seasonSelect.value = canRestorePreset ? selection.seasonPreset : 'custom';
        customDateInput.value = selection.date;
        customDatePicker.style.display = canRestorePreset ? 'none' : 'block';
        return true;
    }

    function tryApplyPrecomputedForCurrentSelection() {
        if (!currentData || precomputedEntries.size === 0) return false;
        try {
            const analysisData = Utils.deepClone(currentData);
            const solarSettings = getAnalysisSolarSettings();
            const identity = createAnalysisIdentity(analysisData, solarSettings);
            const entry = precomputedEntries.get(createAnalysisKey(identity));
            if (!entry) {
                updatePrecomputedControls();
                return false;
            }

            const points = collectAnalysisPoints(analysisData);
            if (points.length !== entry.pointCount
                || createSamplingFingerprint(points) !== entry.samplingFingerprint) {
                precomputedEntries.delete(entry.key);
                updatePrecomputedControls('viewer.precomputedIgnored');
                return false;
            }
            points.forEach((point, index) => {
                point.sunlightHours = entry.hours[index];
            });
            const snapshot = {
                ...identity,
                seasonPreset: solarSettings.seasonPreset,
                referenceHours: getReferenceHours(),
                samplingFingerprint: entry.samplingFingerprint,
                source: 'precomputed'
            };
            const results = buildSunlightResultsFromPoints(points, snapshot);
            presentSunlightResults(results, true);
            updatePrecomputedControls('viewer.precomputedApplied');
            return true;
        } catch (error) {
            console.warn('Precomputed sunlight result was ignored:', error);
            updatePrecomputedControls();
            return false;
        }
    }

    function serializeOccluderMeshes(buildingMeshes) {
        buildingsGroup.updateMatrixWorld(true);
        return buildingMeshes.map(mesh => {
            const position = mesh.geometry?.getAttribute('position');
            if (!position) return null;
            const positions = new Float32Array(position.array);
            const sourceIndex = mesh.geometry.getIndex();
            const indices = sourceIndex ? new Uint32Array(sourceIndex.array) : null;
            return {
                positions,
                indices,
                matrixWorld: mesh.matrixWorld.elements.slice()
            };
        }).filter(Boolean);
    }

    function getMeshTriangleCount(mesh) {
        const geometry = mesh?.geometry;
        if (!geometry) return 0;
        const index = geometry.getIndex();
        if (index) return index.count / 3;
        return (geometry.getAttribute('position')?.count || 0) / 3;
    }

    function buildWorkerPayload(allPoints, sunDirections, buildingMeshes, timeStep) {
        const origins = new Float32Array(allPoints.length * 3);
        const outwardNormals = new Float32Array(allPoints.length * 2);
        allPoints.forEach((point, index) => {
            origins[index * 3] = point.x;
            origins[index * 3 + 1] = point.z;
            origins[index * 3 + 2] = point.y;
            outwardNormals[index * 2] = point.outward?.x || 0;
            outwardNormals[index * 2 + 1] = point.outward?.y || 0;
        });

        const directions = new Float32Array(sunDirections.length * 3);
        sunDirections.forEach((direction, index) => {
            if (!direction) return;
            directions[index * 3] = direction.x;
            directions[index * 3 + 1] = direction.y;
            directions[index * 3 + 2] = direction.z;
        });

        return {
            origins,
            outwardNormals,
            directions,
            meshes: serializeOccluderMeshes(buildingMeshes),
            timeStep,
            near: 0.1,
            far: Infinity
        };
    }

    function runWorkerAnalysis(task, payload, progressCallback) {
        return new Promise((resolve, reject) => {
            let worker;
            try {
                if (typeof createSunlightAnalysisWorker !== 'function') {
                    throw new Error('Sunlight Worker factory is unavailable');
                }
                worker = createSunlightAnalysisWorker();
            } catch (error) {
                reject(error);
                return;
            }

            task.worker = worker;
            task.rejectWorker = reject;
            const transfer = [payload.origins.buffer, payload.outwardNormals.buffer, payload.directions.buffer];
            payload.meshes.forEach(mesh => {
                transfer.push(mesh.positions.buffer);
                if (mesh.indices) transfer.push(mesh.indices.buffer);
            });

            const cleanup = () => {
                worker.terminate();
                if (task.worker === worker) task.worker = null;
                task.rejectWorker = null;
            };

            worker.onmessage = event => {
                if (task.cancelled) return;
                const message = event.data || {};
                if (message.type === 'progress') {
                    if (progressCallback) progressCallback(message.value);
                    return;
                }
                if (message.type === 'complete') {
                    cleanup();
                    resolve(new Float64Array(message.hours));
                    return;
                }
                if (message.type === 'error') {
                    cleanup();
                    reject(new Error(message.message || 'Worker analysis failed'));
                }
            };
            worker.onerror = event => {
                cleanup();
                reject(new Error(event.message || 'Worker analysis failed'));
            };
            worker.postMessage({ type: 'start', payload }, transfer);
        });
    }

    async function runMainThreadAnalysis(task, allPoints, sunDirections, buildingMeshes, timeStep, progressCallback) {
        const raycaster = new THREE.Raycaster();
        const totalSteps = allPoints.length * sunDirections.length;
        const batchSize = CONFIG.SUNLIGHT_ANALYSIS.MAIN_THREAD_BATCH_SIZE || 240;
        let completedSteps = 0;
        let batchSteps = 0;

        for (const point of allPoints) {
            let litIntervals = 0;
            for (const sunDirection of sunDirections) {
                assertAnalysisActive(task);
                if (sunDirection && checkSunlight(point, sunDirection, buildingMeshes, raycaster)) {
                    litIntervals++;
                }
                completedSteps++;
                batchSteps++;
                if (batchSteps >= batchSize) {
                    if (progressCallback) progressCallback(completedSteps / totalSteps);
                    batchSteps = 0;
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }
            point.sunlightHours = Utils.roundTo(litIntervals * timeStep, 6);
        }
        if (progressCallback) progressCallback(1);
    }

    /**
     * 使用不可变参数快照执行日照时长计算。
     */
    async function calculateSunlightDuration(progressCallback) {
        if (!currentData || !currentData.buildings) {
            alert(i18n.t('viewer.errorNoData'));
            return null;
        }

        const task = { version: ++analysisVersion, cancelled: false, worker: null, rejectWorker: null };
        activeAnalysisTask = task;

        try {
            const solarSettings = getAnalysisSolarSettings();
            const analysisData = Utils.deepClone(currentData);
            const identity = createAnalysisIdentity(analysisData, solarSettings);
            const snapshot = Object.freeze({
                ...identity,
                seasonPreset: solarSettings.seasonPreset,
                referenceHours: getReferenceHours(),
                source: 'calculated'
            });
            const timePoints = Utils.createTimeSamples(
                snapshot.startHour,
                snapshot.endHour,
                snapshot.timeStep
            );
            const sunDirections = timePoints.map(hour => calculateSunDirection(
                hour,
                snapshot.latitude,
                snapshot.declination,
                snapshot.solarTimeOffset
            ));

            const allPoints = collectAnalysisPoints(analysisData);

            if (allPoints.length === 0) {
                alert(i18n.t('viewer.errorNoBuilding'));
                return null;
            }
            const raySteps = allPoints.length * timePoints.length;
            if (raySteps > CONFIG.SUNLIGHT_ANALYSIS.MAX_RAY_STEPS) {
                throw new AnalysisComplexityError();
            }

            assertAnalysisActive(task);
            const buildingMeshes = collectBuildingMeshes();
            const triangleCounts = buildingMeshes.map(getMeshTriangleCount);
            const occlusionWork = Utils.estimateOcclusionWork(
                raySteps,
                triangleCounts,
                CONFIG.SUNLIGHT_ANALYSIS.REFERENCE_TRIANGLES_PER_MESH
            );
            if (occlusionWork > CONFIG.SUNLIGHT_ANALYSIS.MAX_OCCLUSION_WORK) {
                throw new AnalysisComplexityError();
            }
            let completedInWorker = false;
            if (typeof Worker !== 'undefined') {
                try {
                    const payload = buildWorkerPayload(allPoints, sunDirections, buildingMeshes, snapshot.timeStep);
                    const hours = await runWorkerAnalysis(task, payload, progressCallback);
                    assertAnalysisActive(task);
                    hours.forEach((hoursValue, index) => {
                        allPoints[index].sunlightHours = Utils.roundTo(hoursValue, 6);
                    });
                    completedInWorker = true;
                } catch (error) {
                    if (error?.name === 'AnalysisCancelledError' || task.cancelled) throw new AnalysisCancelledError();
                    console.warn('Sunlight Worker unavailable, using main-thread fallback:', error);
                }
            }

            if (!completedInWorker) {
                await runMainThreadAnalysis(
                    task,
                    allPoints,
                    sunDirections,
                    buildingMeshes,
                    snapshot.timeStep,
                    progressCallback
                );
            }

            assertAnalysisActive(task);
            return buildSunlightResultsFromPoints(allPoints, {
                ...snapshot,
                samplingFingerprint: createSamplingFingerprint(allPoints)
            });
        } finally {
            if (task.worker) task.worker.terminate();
            task.rejectWorker = null;
            if (activeAnalysisTask === task) activeAnalysisTask = null;
        }
    }

    /**
     * 根据日照时长获取颜色
     */
    function getSunlightColor(hours, maxHours = 8) {
        // 限制在最大值，超过8小时的都显示为最优颜色
        const clampedHours = Math.min(hours, maxHours);
        const t = clampedHours / maxHours;

        // 使用温暖色系：从淡黄色到深橙色
        const colors = [
            { pos: 0, r: 255, g: 250, b: 205 },   // 淡黄色 - 0小时 (LemonChiffon)
            { pos: 0.2, r: 255, g: 239, b: 170 }, // 浅黄色
            { pos: 0.35, r: 255, g: 223, b: 130 }, // 金黄色
            { pos: 0.5, r: 255, g: 200, b: 90 },  // 橙黄色
            { pos: 0.65, r: 255, g: 170, b: 60 }, // 浅橙色
            { pos: 0.8, r: 245, g: 140, b: 40 },  // 橙色
            { pos: 1, r: 220, g: 100, b: 20 }     // 深橙色 - 8小时及以上
        ];

        // 找到t所在的区间
        let lower = colors[0], upper = colors[colors.length - 1];
        for (let i = 0; i < colors.length - 1; i++) {
            if (t >= colors[i].pos && t <= colors[i + 1].pos) {
                lower = colors[i];
                upper = colors[i + 1];
                break;
            }
        }

        // 线性插值
        const range = upper.pos - lower.pos;
        const localT = range > 0 ? (t - lower.pos) / range : 0;

        const r = Math.round(lower.r + (upper.r - lower.r) * localT);
        const g = Math.round(lower.g + (upper.g - lower.g) * localT);
        const b = Math.round(lower.b + (upper.b - lower.b) * localT);

        return new THREE.Color(r / 255, g / 255, b / 255);
    }

    /**
     * 创建热力图显示层 - 贴在实际受光立面片段上
     */
    function createHeatmapLayer(results) {
        clearGroup(heatmapGroup);
        heatmapCellsByApartmentKey = new Map();
        heatmapInstanceData = [];
        heatmapResultsSource = results || null;
        hoveredApartmentKey = null;
        selectedApartmentKey = null;
        currentUnitInfoData = null;
        if (!results || !results.points) return;

        const points = results.points.filter(point => currentData.buildings[point.buildingIndex]);
        if (points.length === 0) return;
        const maxHours = CONFIG.SUNLIGHT_ANALYSIS.MAX_HOURS;
        const geometry = new THREE.PlaneGeometry(1, 1);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: HEATMAP_BASE_OPACITY,
            depthTest: true,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1
        });
        const mesh = new THREE.InstancedMesh(geometry, material, points.length);
        mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
        mesh.frustumCulled = false;
        mesh.renderOrder = 2;
        mesh.userData.type = 'heatmapLayer';

        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        const matrix = new THREE.Matrix4();
        const rotationMatrix = new THREE.Matrix4();
        const upAxis = new THREE.Vector3(0, 1, 0);

        points.forEach((point, instanceId) => {
            const building = currentData.buildings[point.buildingIndex];
            const floorHeight = building.floorHeight || 3;
            const cellHeight = floorHeight * 0.9;
            const cellWidth = Number(point.cellWidth) || 0.6;
            const color = getSunlightColor(point.sunlightHours, maxHours);
            const wallHeight = (point.floor - 0.5) * floorHeight;
            const normalX = point.outward?.x || 0;
            const normalZ = point.outward?.y || 0;
            const offset = 0.3;
            const wallDataX = point.wallDataX;
            const wallDataY = point.wallDataY;
            const tangentX = point.tangent?.x || 1;
            const tangentZ = point.tangent?.y || 0;

            position.set(wallDataX + normalX * offset, wallHeight, wallDataY + normalZ * offset);
            const outwardAxis = new THREE.Vector3(normalX, 0, normalZ);

            let xAxis;
            if (outwardAxis.lengthSq() > 1e-8) {
                outwardAxis.normalize();
                xAxis = new THREE.Vector3().crossVectors(upAxis, outwardAxis);
                if (xAxis.lengthSq() < 1e-8) xAxis.set(1, 0, 0);
                xAxis.normalize();

                const tangentAxis = new THREE.Vector3(tangentX, 0, tangentZ);
                if (tangentAxis.lengthSq() > 1e-8 && xAxis.dot(tangentAxis) < 0) {
                    xAxis.negate();
                }
            } else {
                xAxis = new THREE.Vector3(tangentX, 0, tangentZ);
                if (xAxis.lengthSq() < 1e-8) xAxis.set(1, 0, 0);
                xAxis.normalize();
            }

            const zAxis = new THREE.Vector3().crossVectors(xAxis, upAxis).normalize();
            rotationMatrix.makeBasis(xAxis, upAxis, zAxis);
            quaternion.setFromRotationMatrix(rotationMatrix);
            scale.set(cellWidth, cellHeight, 1);
            matrix.compose(position, quaternion, scale);
            mesh.setMatrixAt(instanceId, matrix);
            mesh.setColorAt(instanceId, color);

            const apartmentKey = makeApartmentKey(point);
            const userData = {
                type: 'heatmapCell',
                apartmentKey,
                buildingIndex: point.buildingIndex,
                buildingName: point.buildingName,
                floor: point.floor,
                unit: point.unit,
                sunlightHours: point.sunlightHours,
                unitMaxHours: point.unitMaxHours
            };
            const descriptor = { mesh, instanceId, userData, baseColor: color.clone(), cellWidth };
            heatmapInstanceData[instanceId] = descriptor;

            if (!heatmapCellsByApartmentKey.has(apartmentKey)) {
                heatmapCellsByApartmentKey.set(apartmentKey, []);
            }
            heatmapCellsByApartmentKey.get(apartmentKey).push(descriptor);
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        heatmapGroup.add(mesh);
        requestRender();
    }

    /**
     * 显示/隐藏热力图
     */
    function toggleHeatmap(show) {
        showHeatmap = show;
        heatmapGroup.visible = show;

        if (show && sunlightResults) {
            if (heatmapResultsSource !== sunlightResults || heatmapGroup.children.length === 0) {
                createHeatmapLayer(sunlightResults);
            }
            renderer.domElement.style.cursor = '';
        } else {
            clearHeatmapInteractionState();
        }
        requestRender();
    }

    function presentSunlightResults(results, fromPrecomputed = false) {
        if (!results) return;
        sunlightResults = results;
        document.getElementById('toggleHeatmap').disabled = false;
        document.getElementById('heatmapLegend').style.display = 'block';
        showSunlightStats(results);
        document.getElementById('toggleHeatmap').checked = true;
        toggleHeatmap(true);
        if (!fromPrecomputed) cacheSunlightResult(results);
    }

    // ========== 城市/位置选择器初始化 ==========
    function initLocationSelector() {
        const citySelect = document.getElementById('citySelect');
        const latInput = document.getElementById('latitudeInput');
        const lonInput = document.getElementById('longitudeInput');
        const timeZoneInput = document.getElementById('timeZoneInput');
        const northAngleInput = document.getElementById('northAngleInput');
        if (typeof generateCityOptions === 'function') {
            citySelect.innerHTML = generateCityOptions(CONFIG.DEFAULTS.CITY);
            const location = getLocationByCity(CONFIG.DEFAULTS.CITY);
            LATITUDE = location?.lat ?? CONFIG.DEFAULTS.LATITUDE;
            LONGITUDE = location?.lon ?? CONFIG.DEFAULTS.LONGITUDE;
            TIME_ZONE = location?.timeZone ?? CONFIG.DEFAULTS.TIME_ZONE;
            latInput.value = LATITUDE;
            lonInput.value = LONGITUDE;
            timeZoneInput.value = TIME_ZONE;
        }
        northAngleInput.value = NORTH_ANGLE;

        function applyLocation(latitude, longitude, timeZone) {
            if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
                || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
                || !Utils.isValidTimeZone(timeZone)) {
                alert(i18n.t('viewer.errorInvalidLocation'));
                syncLocationControls({ latitude: LATITUDE, longitude: LONGITUDE, timeZone: TIME_ZONE });
                return;
            }
            LATITUDE = latitude;
            LONGITUDE = longitude;
            TIME_ZONE = timeZone;
            clearSunlightResults();
            syncLocationControls({ latitude, longitude, timeZone });
            updateSun();
            tryApplyPrecomputedForCurrentSelection();
        }

        citySelect.addEventListener('change', function() {
            const selectedOption = this.options[this.selectedIndex];
            if (selectedOption.dataset.lat) {
                applyLocation(
                    parseFloat(selectedOption.dataset.lat),
                    parseFloat(selectedOption.dataset.lon),
                    selectedOption.dataset.timeZone
                );
            }
        });

        const applyManualLocation = () => applyLocation(
            parseFloat(latInput.value),
            parseFloat(lonInput.value),
            timeZoneInput.value.trim()
        );
        latInput.addEventListener('change', applyManualLocation);
        lonInput.addEventListener('change', applyManualLocation);
        timeZoneInput.addEventListener('change', applyManualLocation);

        northAngleInput.addEventListener('change', function() {
            NORTH_ANGLE = Utils.normalizeAngle(parseFloat(this.value));
            this.value = NORTH_ANGLE;
            updateNorthAngleDisplay();

            if (rawData) {
                clearSunlightResults();
                rebuildProjectScene();
                updateSun();
                tryApplyPrecomputedForCurrentSelection();
            }
        });

        syncLocationControls({ latitude: LATITUDE, longitude: LONGITUDE, timeZone: TIME_ZONE });
        updateNorthAngleDisplay();
    }

    function clearSunlightResults() {
        cancelActiveAnalysis();
        sunlightResults = null;
        clearHeatmapInteractionState();
        clearGroup(heatmapGroup);
        heatmapCellsByApartmentKey = new Map();
        heatmapInstanceData = [];
        heatmapResultsSource = null;
        document.getElementById('toggleHeatmap').checked = false;
        document.getElementById('toggleHeatmap').disabled = true;
        document.getElementById('heatmapLegend').style.display = 'none';
        document.getElementById('sunlightStats').style.display = 'none';
        document.getElementById('calcProgress').style.display = 'none';
        requestRender();
    }

    // ========== 加载楼栋数据 ==========
    const jsonInput = document.getElementById('jsonInput');

    function getBuildingSchemaOptions() {
        return {
            defaults: {
                latitude: LATITUDE,
                longitude: LONGITUDE,
                timeZone: TIME_ZONE,
                northAngle: NORTH_ANGLE,
                scaleRatio: 1
            },
            limits: {
                latitude: { min: CONFIG.VALIDATION.LATITUDE.MIN, max: CONFIG.VALIDATION.LATITUDE.MAX },
                longitude: { min: CONFIG.VALIDATION.LONGITUDE.MIN, max: CONFIG.VALIDATION.LONGITUDE.MAX },
                northAngle: { min: CONFIG.VALIDATION.NORTH_ANGLE.MIN, max: CONFIG.VALIDATION.NORTH_ANGLE.MAX },
                floors: { min: CONFIG.VALIDATION.FLOORS.MIN, max: CONFIG.VALIDATION.FLOORS.MAX },
                floorHeight: { min: CONFIG.VALIDATION.FLOOR_HEIGHT.MIN, max: CONFIG.VALIDATION.FLOOR_HEIGHT.MAX },
                units: { min: CONFIG.VALIDATION.UNITS.MIN, max: CONFIG.VALIDATION.UNITS.MAX },
                buildings: { min: CONFIG.VALIDATION.BUILDINGS.MIN, max: CONFIG.VALIDATION.BUILDINGS.MAX },
                polygonPoints: {
                    min: CONFIG.VALIDATION.POLYGON_POINTS.MIN,
                    max: CONFIG.VALIDATION.POLYGON_POINTS.MAX
                },
                minPolygonArea: CONFIG.VALIDATION.MIN_POLYGON_AREA
            }
        };
    }

    function normalizeImportedData(data) {
        return Utils.normalizeBuildingData(data, getBuildingSchemaOptions());
    }

    function applyImportedProject(parsedData, normalized) {
        if (normalized.warnings.length) console.warn('Building data normalized:', normalized.warnings);
        clearSunlightResults();
        rawData = normalized.data;
        syncLocationControls(rawData);
        NORTH_ANGLE = rawData.northAngle;
        document.getElementById('northAngleInput').value = NORTH_ANGLE;
        updateNorthAngleDisplay();
        rebuildProjectScene();
        importPrecomputedPayload(parsedData?.precomputedSunlight);
        restoreImportedPrecomputedSelection();
        updateSun();
        tryApplyPrecomputedForCurrentSelection();
        document.getElementById('empty-state').style.display = 'none';
    }

    function isJsonFile(file) {
        const name = String(file?.name || '').toLowerCase();
        return !!file && (name.endsWith('.json') || file.type === 'application/json' || file.type === 'text/json');
    }

    async function importProjectFile(file) {
        if (!isJsonFile(file)) {
            alert(i18n.t('viewer.errorInvalidJsonFile'));
            return false;
        }

        setLoadingOverlayVisible(true);
        try {
            await waitForNextPaint();
            const parsedData = JSON.parse(await file.text());
            const normalized = normalizeImportedData(parsedData);
            if (!normalized.valid) {
                setLoadingOverlayVisible(false);
                alert(i18n.t('viewer.errorInvalidData').replace('{0}', normalized.errors.slice(0, 8).join('\n')));
                console.warn('Invalid building data:', normalized.errors);
                return false;
            }
            await waitForNextPaint();
            applyImportedProject(parsedData, normalized);
            await waitForNextPaint();
            return true;
        } catch (error) {
            setLoadingOverlayVisible(false);
            alert(error instanceof SyntaxError ? i18n.t('viewer.errorParseFailed') : i18n.t('viewer.errorFileRead'));
            console.error(error);
            return false;
        } finally {
            setLoadingOverlayVisible(false);
        }
    }

    async function saveJsonWithDialog(content, filename) {
        const blob = new Blob([content], { type: 'application/json' });
        if (typeof window.showSaveFilePicker === 'function') {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: filename,
                    types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
                });
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
                return true;
            } catch (error) {
                if (error?.name === 'AbortError') return false;
                if (error?.name !== 'SecurityError') throw error;
            }
        }
        Utils.downloadFile(content, filename, 'application/json');
        return true;
    }

    async function exportProjectWithPrecomputedResults() {
        if (!rawData || getCurrentProjectPrecomputedEntries().length === 0) return;
        try {
            const exportBase = {
                ...Utils.deepClone(rawData),
                version: CONFIG.APP.VERSION,
                latitude: LATITUDE,
                longitude: LONGITUDE,
                timeZone: TIME_ZONE,
                northAngle: NORTH_ANGLE
            };
            const normalized = normalizeImportedData(exportBase);
            if (!normalized.valid) throw new Error(normalized.errors.join('\n'));
            const exportData = {
                ...normalized.data,
                precomputedSunlight: buildPrecomputedPayload()
            };
            const saved = await saveJsonWithDialog(
                JSON.stringify(exportData, null, 2),
                'sunlight_project_with_results.json'
            );
            if (saved) updatePrecomputedControls('viewer.exportAnalysisComplete');
        } catch (error) {
            console.error('Failed to export precomputed project:', error);
            alert(i18n.t('viewer.errorExportFailed'));
        }
    }

    jsonInput.addEventListener('change', async event => {
        const file = event.target.files[0];
        if (file) await importProjectFile(file);
        event.target.value = '';
    });

    window.addEventListener('dragenter', event => {
        if (!event.dataTransfer?.types?.includes('Files')) return;
        event.preventDefault();
        importDragDepth++;
        setDropOverlayVisible(true);
    });
    window.addEventListener('dragover', event => {
        if (!event.dataTransfer?.types?.includes('Files')) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
    });
    window.addEventListener('dragleave', event => {
        if (!event.dataTransfer?.types?.includes('Files')) return;
        importDragDepth = Math.max(0, importDragDepth - 1);
        if (importDragDepth === 0) setDropOverlayVisible(false);
    });
    window.addEventListener('drop', async event => {
        if (!event.dataTransfer) return;
        event.preventDefault();
        importDragDepth = 0;
        setDropOverlayVisible(false);
        const file = Array.from(event.dataTransfer.files || [])[0];
        if (file) await importProjectFile(file);
    });

    function clearGroup(group) {
        const geometries = new Set();
        const materials = new Set();
        const textures = new Set();

        group.traverse(object => {
            if (object === group) return;
            if (object.geometry) geometries.add(object.geometry);
            const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
            objectMaterials.filter(Boolean).forEach(material => {
                if (material === roofMaterial) return;
                materials.add(material);
                Object.values(material).forEach(value => {
                    if (value?.isTexture) textures.add(value);
                });
                Object.values(material.uniforms || {}).forEach(uniform => {
                    if (uniform?.value?.isTexture) textures.add(uniform.value);
                });
            });
        });

        textures.forEach(texture => texture.dispose());
        materials.forEach(material => material.dispose());
        geometries.forEach(geometry => geometry.dispose());
        group.clear();
    }

    function loadBuildings(data) {
        clearGroup(buildingsGroup);

        if (!data || !Array.isArray(data.buildings) || data.buildings.length === 0) {
            refreshHoverOccluderMeshes();
            requestRender(true);
            return;
        }

        const facadeTextureCache = new Map();

        data.buildings.forEach((b, index) => {
            if (!b.shape || b.shape.length < 3) return;

            const shape = new THREE.Shape();
            shape.moveTo(b.shape[0].x, -b.shape[0].y);
            for (let i = 1; i < b.shape.length; i++) {
                shape.lineTo(b.shape[i].x, -b.shape[i].y);
            }
            shape.closePath();

            const floors = Math.max(1, parseInt(b.floors || 1, 10));
            const totalHeight = floors * (b.floorHeight || 3);
            const unitsPerFloor = normalizeUnitsPerFloor({ floors, units: b.units, unitsPerFloor: b.unitsPerFloor });
            const splitAxis = axisFromAngleDeg(b.unitSplitAngleDeg || 0);

            const extrudeSettings = {
                depth: totalHeight,
                bevelEnabled: false,
                UVGenerator: makeUVGenerator(b.shape, totalHeight, splitAxis)
            };
            const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
            geometry.computeVertexNormals();

            const own = (typeof b.isThisCommunity === 'boolean') ? b.isThisCommunity : true;

            const node = new THREE.Group();
            node.userData = { own, name: b.name || '', buildingIndex: index };
            buildingsGroup.add(node);

            let mesh;
            if (own) {
                const sideTexture = getFacadeTexture(
                    facadeTextureCache,
                    floors,
                    unitsPerFloor,
                    b.unitRatiosPerFloor
                );
                const sideMaterial = new THREE.MeshStandardMaterial({
                    map: sideTexture,
                    color: CONFIG.MATERIALS.BUILDING_COLOR,
                    roughness: CONFIG.MATERIALS.BUILDING_ROUGHNESS,
                    metalness: 0.05
                });
                mesh = new THREE.Mesh(geometry, [roofMaterial, sideMaterial]);
            } else {
                const neighborMaterial = new THREE.MeshStandardMaterial({
                    color: CONFIG.MATERIALS.NEIGHBOR_COLOR,
                    roughness: 0.95,
                    metalness: 0.0,
                    transparent: true,
                    opacity: 0.92
                });
                mesh = new THREE.Mesh(geometry, neighborMaterial);
            }
            mesh.rotation.x = -Math.PI / 2;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.userData.buildingIndex = index;
            node.add(mesh);

            const edgesColor = own ? 0x435061 : 0x7c8896;
            const edgesOpacity = own ? 0.5 : 0.28;
            const edges = createEdgeLines(geometry, edgesColor, edgesOpacity);
            edges.rotation.x = -Math.PI / 2;
            node.add(edges);

            let cx = 0, cy = 0;
            b.shape.forEach(p => { cx += p.x; cy += p.y; });
            cx /= b.shape.length;
            cy /= b.shape.length;

            const label = createLabel(b.name, cx, totalHeight, cy);
            if (label) {
                label.renderOrder = 999;
                node.add(label);
            }
        });

        refreshHoverOccluderMeshes();
        applyVisibilityFilter(false);
        fitViewToBuildings();
        requestRender(true);
    }

    // ========== 视角与可见性 ==========
    function fitViewToBuildings(padding = 1.3) {
        const nodes = buildingsGroup.children.filter(n => n.visible);
        if (nodes.length === 0) return;

        const box = new THREE.Box3();
        nodes.forEach(node => box.expandByObject(node));
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);

        const maxSize = Math.max(size.x, size.z, 30);
        const fov = camera.fov * Math.PI / 180;
        let dist = (maxSize / 2) / Math.tan(fov / 2) * padding;
        dist = Math.min(Math.max(dist, 150), 1200);

        const elev = 35 * Math.PI / 180;
        const azim = -30 * Math.PI / 180;
        const dx = dist * Math.cos(elev) * Math.sin(azim);
        const dy = dist * Math.sin(elev);
        const dz = dist * Math.cos(elev) * Math.cos(azim);

        camera.position.set(center.x + dx, Math.max(dy, size.y * 0.8, 60), center.z + dz);
        controls.target.set(center.x, 0, center.z);
        controls.minDistance = Math.max(40, dist * 0.2);
        controls.maxDistance = dist * 2.5;
        controls.update();

        const sd = Math.max(maxSize * 1.5, 200);
        sunLight.shadow.camera.left = -sd;
        sunLight.shadow.camera.right = sd;
        sunLight.shadow.camera.top = sd;
        sunLight.shadow.camera.bottom = -sd;
        sunLight.shadow.camera.far = Math.max(1500, sd * 5);

        scene.fog.near = Math.max(120, maxSize * 0.8);
        scene.fog.far = Math.max(900, maxSize * 6);
        requestRender(true);
    }

    function applyVisibilityFilter(shouldFit = true) {
        buildingsGroup.children.forEach(node => {
            if (typeof node.userData?.own === 'boolean') {
                node.visible = showOwnOnly ? node.userData.own : true;
            }
        });
        refreshHoverOccluderMeshes();
        if (shouldFit) fitViewToBuildings();
        requestRender(true);
    }

    // ========== 光照 ==========
    const sunLight = new THREE.DirectionalLight(0xffffff, CONFIG.LIGHTING.SUN_INTENSITY);
    sunLight.castShadow = true;
    const shadowMapSize = Math.min(
        CONFIG.LIGHTING.SHADOW_MAP_SIZE,
        renderer.capabilities.maxTextureSize || CONFIG.LIGHTING.SHADOW_MAP_SIZE
    );
    sunLight.shadow.mapSize.width = shadowMapSize;
    sunLight.shadow.mapSize.height = shadowMapSize;
    sunLight.shadow.bias = CONFIG.LIGHTING.SHADOW_BIAS;
    const d = 500;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 2000;
    scene.add(sunLight);
    
    const ambientLight = new THREE.AmbientLight(CONFIG.LIGHTING.AMBIENT_COLOR, CONFIG.LIGHTING.AMBIENT_INTENSITY);
    scene.add(ambientLight);

    // ========== 时间控制 ==========
    function getCurrentHour() {
        const desk = document.getElementById('timeSlider');
        const dock = document.getElementById('timeSliderDock');
        if (dock && window.getComputedStyle(dock).display !== 'none') {
            return parseFloat(dock.value);
        }
        return parseFloat(desk.value);
    }

    function setHour(val) {
        const desk = document.getElementById('timeSlider');
        const dock = document.getElementById('timeSliderDock');
        if (desk) desk.value = val;
        if (dock) dock.value = val;
    }

    function setTimeText(hour) {
        const text = Utils.formatTime(hour);
        const t1 = document.getElementById('timeText');
        const t2 = document.getElementById('timeTextDock');
        if (t1) t1.innerText = text;
        if (t2) t2.innerText = text;
    }

    function updateSun() {
        const hour = getCurrentHour();
        let settings;
        try {
            settings = getAnalysisSolarSettings();
        } catch (error) {
            return;
        }

        setTimeText(hour);

        const sunPosition = calculateSunPosition(
            hour,
            LATITUDE,
            settings.declination,
            settings.solarTimeOffset
        );
        const alt = sunPosition.altitude;
        const direction = sunPosition.direction;
        const dist = 800;
        const x = direction.x * dist;
        const y = direction.y * dist;
        const z = direction.z * dist;

        sunLight.position.set(x, y, z);
        
        // 动态调整光照强度
        if (alt > 0) {
            // 太阳高度角（度）
            const altDeg = alt * 180 / Math.PI;
            
            // 根据太阳高度角调整光照
            // 归一化高度角 (0-90度 -> 0-1)
            const altNorm = Math.min(altDeg / 90, 1);
            
            // 使用平方曲线使高角度时的亮度增长更缓慢
            const altCurve = Math.pow(altNorm, 1.5);
            
            // 太阳光强度：使用反向曲线，但限制最大值
            const sunIntensity = CONFIG.LIGHTING.MIN_SUN_INTENSITY + 
                (CONFIG.LIGHTING.MAX_SUN_INTENSITY - CONFIG.LIGHTING.MIN_SUN_INTENSITY) * 
                (1 - altCurve * 0.6);
            
            // 环境光强度：使用更平缓的曲线
            const ambientIntensity = CONFIG.LIGHTING.MIN_AMBIENT_INTENSITY + 
                (CONFIG.LIGHTING.MAX_AMBIENT_INTENSITY - CONFIG.LIGHTING.MIN_AMBIENT_INTENSITY) * 
                (altCurve * 0.8);
            
            sunLight.intensity = sunIntensity;
            ambientLight.intensity = ambientIntensity;
        } else {
            // 太阳在地平线以下
            sunLight.intensity = 0.0;
            ambientLight.intensity = CONFIG.LIGHTING.MIN_AMBIENT_INTENSITY;
        }
        requestRender(true);
    }

    // ========== 点击交互 ==========
    const raycasterClick = new THREE.Raycaster();
    const raycasterHover = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    function onCanvasClick(event) {
        if (!sunlightResults || !showHeatmap) return;

        // 获取点击位置
        const rect = renderer.domElement.getBoundingClientRect();
        
        // 支持触摸事件和鼠标事件
        let clientX, clientY;
        if (event.touches && event.touches.length > 0) {
            clientX = event.touches[0].clientX;
            clientY = event.touches[0].clientY;
        } else if (event.changedTouches && event.changedTouches.length > 0) {
            clientX = event.changedTouches[0].clientX;
            clientY = event.changedTouches[0].clientY;
        } else {
            clientX = event.clientX;
            clientY = event.clientY;
        }

        mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

        raycasterClick.setFromCamera(mouse, camera);
        const intersects = raycasterClick.intersectObjects(heatmapGroup.children, false);
        const heatHits = filterHeatHitsByOcclusion(raycasterClick, intersects);
        const fallbackApartmentKey = hoveredApartmentKey || selectedApartmentKey;
        const apartmentKey = pickApartmentKeyFromHeatHits(heatHits, fallbackApartmentKey, true);

        if (apartmentKey) {
            const cell = findHitCellForApartment(heatHits, apartmentKey) || findRepresentativeCell(apartmentKey);
            if (cell?.userData) {
                setSelectedApartment(apartmentKey);
                currentUnitInfoData = cell.userData;
                showUnitInfo(cell.userData);
                return;
            }
        }

        clearHeatmapInteractionState();
    }

    function onCanvasMouseMove(event) {
        if (!sunlightResults || !showHeatmap) {
            resetHeatmapHoverState();
            return;
        }

        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycasterHover.setFromCamera(mouse, camera);
        const intersects = raycasterHover.intersectObjects(heatmapGroup.children, false);
        const heatHits = filterHeatHitsByOcclusion(raycasterHover, intersects);
        const fallbackApartmentKey = hoveredApartmentKey || selectedApartmentKey;
        const apartmentKey = pickApartmentKeyFromHeatHits(heatHits, fallbackApartmentKey, false);

        if (apartmentKey) {
            setHoveredApartment(apartmentKey);
            if (!selectedApartmentKey) {
                const cell = findHitCellForApartment(heatHits, apartmentKey) || findRepresentativeCell(apartmentKey);
                if (cell?.userData) {
                    currentUnitInfoData = cell.userData;
                    showSunlightStats(sunlightResults);
                }
            }
            renderer.domElement.style.cursor = 'pointer';
            return;
        }

        resetHeatmapHoverState();
    }

    // ========== UI 绑定 ==========
    function updateSeasonOptions() {
        const seasonSelect = document.getElementById('seasonSelect');
        if (!seasonSelect) return;
        Array.from(seasonSelect.options).forEach(option => {
            if (option.value === 'custom') {
                option.textContent = i18n.t('viewer.customDate');
                return;
            }
            const key = Utils.getSeasonTranslationKey(option.value, LATITUDE);
            if (key) option.textContent = i18n.t(`viewer.${key}`);
        });
    }

    function bindUI() {
        // 语言切换
        initLanguageSwitcher();

        // 日期选择
        const seasonSelect = document.getElementById('seasonSelect');
        const customDatePicker = document.getElementById('customDatePicker');
        const customDateInput = document.getElementById('customDateInput');
        
        // 设置默认日期为今天
        customDateInput.value = Utils.formatDate(new Date());
        updateSeasonOptions();
        
        seasonSelect.addEventListener('change', (e) => {
            const value = e.target.value;
            
            if (value === 'custom') {
                // 显示日期选择器
                customDatePicker.style.display = 'block';
            } else {
                // 隐藏日期选择器
                customDatePicker.style.display = 'none';
            }
            
            clearSunlightResults();
            updateSun();
            tryApplyPrecomputedForCurrentSelection();
        });
        
        // 自定义日期变化
        customDateInput.addEventListener('change', () => {
            clearSunlightResults();
            updateSun();
            tryApplyPrecomputedForCurrentSelection();
        });

        document.getElementById('timeSlider').addEventListener('input', (e) => {
            setHour(e.target.value);
            updateSun();
        });

        const dockSlider = document.getElementById('timeSliderDock');
        if (dockSlider) {
            dockSlider.addEventListener('input', (e) => {
                setHour(e.target.value);
                updateSun();
            });
        }

        const referenceHoursInput = document.getElementById('referenceHoursInput');
        referenceHoursInput.value = CONFIG.SUNLIGHT_ANALYSIS.REFERENCE_HOURS || 2;
        referenceHoursInput.addEventListener('change', () => {
            referenceHoursInput.value = getReferenceHours();
            clearSunlightResults();
            tryApplyPrecomputedForCurrentSelection();
        });

        document.getElementById('toggleOwnOnly').addEventListener('change', (e) => {
            showOwnOnly = !!e.target.checked;
            applyVisibilityFilter(false);
        });

        // 日照分析按钮
        let progressHideTimer = null;
        document.getElementById('calcSunlightBtn').addEventListener('click', async () => {
            const btn = document.getElementById('calcSunlightBtn');
            const progress = document.getElementById('calcProgress');
            const progressFill = document.getElementById('progressFill');
            const progressText = document.getElementById('progressText');

            clearSunlightResults();
            if (progressHideTimer) {
                clearTimeout(progressHideTimer);
                progressHideTimer = null;
            }
            btn.disabled = true;
            progress.style.display = 'block';
            progressFill.style.width = '0%';

            try {
                const results = await calculateSunlightDuration((p) => {
                    const pct = Math.round(p * 100);
                    progressFill.style.width = pct + '%';
                    progressText.textContent = i18n.t('viewer.calculatingProgress').replace('{0}', pct);
                });

                if (results) {
                    progressText.textContent = i18n.t('viewer.calculationComplete');
                    presentSunlightResults(results);
                }
            } catch (err) {
                if (err?.name === 'AnalysisCancelledError') {
                    progressText.textContent = i18n.t('viewer.calculationCancelled');
                } else if (err?.name === 'AnalysisComplexityError') {
                    progressText.textContent = i18n.t('viewer.calculationCancelled');
                    alert(i18n.t('viewer.errorTooComplex'));
                } else if (err?.name === 'InvalidLocationError') {
                    alert(i18n.t('viewer.errorInvalidLocation'));
                } else {
                    console.error('日照计算错误:', err);
                    alert(i18n.t('viewer.errorCalcFailed'));
                }
            } finally {
                btn.disabled = false;
                progressHideTimer = setTimeout(() => {
                    progress.style.display = 'none';
                    progressHideTimer = null;
                }, 1500);
            }
        });

        const cancelButton = document.getElementById('cancelSunlightBtn');
        cancelButton.title = i18n.t('viewer.cancelCalculation');
        cancelButton.setAttribute('aria-label', i18n.t('viewer.cancelCalculation'));
        cancelButton.addEventListener('click', () => {
            cancelActiveAnalysis();
            document.getElementById('progressText').textContent = i18n.t('viewer.calculationCancelled');
        });

        exportAnalysisButton.addEventListener('click', exportProjectWithPrecomputedResults);

        // 热力图开关
        document.getElementById('toggleHeatmap').addEventListener('change', (e) => {
            toggleHeatmap(e.target.checked);
        });

        // 关闭户型信息面板
        document.getElementById('closeUnitInfo').addEventListener('click', () => {
            clearHeatmapInteractionState();
        });

        // 点击画布（支持触摸和鼠标事件，防止双触发）
        let touchHandled = false;
        renderer.domElement.addEventListener('touchend', (e) => {
            touchHandled = true;
            onCanvasClick(e);
            setTimeout(() => { touchHandled = false; }, 400);
        });
        renderer.domElement.addEventListener('click', (e) => {
            if (!touchHandled) onCanvasClick(e);
        });
        renderer.domElement.addEventListener('mousemove', onCanvasMouseMove);
        renderer.domElement.addEventListener('mouseleave', () => {
            resetHeatmapHoverState();
        });

        // 侧边栏收起/展开
        const controlsPanel = document.getElementById('controls');
        const sidebarToggle = document.getElementById('sidebarToggle');

        const mql = window.matchMedia('(max-width: 600px)');
        function applyMobileLayout() {
            const dock = document.getElementById('timeDock');
            dock.style.display = mql.matches ? 'flex' : 'none';
            if (mql.matches) {
                controlsPanel.classList.add('collapsed');
            }
        }
        applyMobileLayout();
        mql.addEventListener('change', applyMobileLayout);

        sidebarToggle.addEventListener('click', () => {
            const isCollapsed = controlsPanel.classList.toggle('collapsed');
            // 更新按钮的 title 和 aria-label
            if (isCollapsed) {
                sidebarToggle.title = i18n.t('common.expand');
                sidebarToggle.setAttribute('aria-label', i18n.t('common.expand'));
            } else {
                sidebarToggle.title = i18n.t('common.close');
                sidebarToggle.setAttribute('aria-label', i18n.t('common.close'));
            }
        });
    }

    // ========== 窗口大小调整 ==========
    const debouncedFitView = Utils.debounce(() => fitViewToBuildings(), 150);
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        requestRender();
        debouncedFitView();
    });

    // ========== 初始化 ==========
    initLocationSelector();
    bindUI();
    setHour(10);
    updateSun();

    // 尝试加载默认数据
    if (typeof DEFAULT_DATA !== 'undefined') {
        console.log('检测到默认数据，正在加载...');
        const normalized = normalizeImportedData(DEFAULT_DATA);
        if (normalized.valid) {
            applyImportedProject(DEFAULT_DATA, normalized);
        } else {
            console.error('默认数据无效:', normalized.errors);
        }
    } else {
        console.log('未检测到 DEFAULT_DATA 变量，等待手动上传文件');
        updatePrecomputedControls();
    }

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
                    updateDynamicContent();
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
        document.title = i18n.t('viewer.title');
        
        // 更新 HTML lang 属性
        document.documentElement.lang = i18n.getCurrentLanguage() === 'zh' ? 'zh-CN' : 'en';
        
        // 更新侧边栏切换按钮的 title
        const sidebarToggle = document.getElementById('sidebarToggle');
        const controlsPanel = document.getElementById('controls');
        if (sidebarToggle && controlsPanel) {
            const isCollapsed = controlsPanel.classList.contains('collapsed');
            const titleText = isCollapsed ? i18n.t('common.expand') : i18n.t('common.close');
            sidebarToggle.title = titleText;
            sidebarToggle.setAttribute('aria-label', titleText);
        }
    }

    function updateDynamicContent() {
        // 更新纬度显示
        updateLatDisplay();
        updateNorthAngleDisplay();
        updateSeasonOptions();

        const cancelButton = document.getElementById('cancelSunlightBtn');
        if (cancelButton) {
            cancelButton.title = i18n.t('viewer.cancelCalculation');
            cancelButton.setAttribute('aria-label', i18n.t('viewer.cancelCalculation'));
        }

        // 更新时间显示
        const hour = getCurrentHour();
        setTimeText(hour);
        
        // 如果有日照统计结果，更新显示
        if (sunlightResults) {
            showSunlightStats(sunlightResults);
        }

        if (currentUnitInfoData && document.getElementById('unitInfoPanel').style.display !== 'none') {
            showUnitInfo(currentUnitInfoData);
        }
        updatePrecomputedControls();
    }

    function updateLatDisplay() {
        const latDisplay = document.getElementById('latDisplay');
        if (latDisplay) {
            const hemisphere = LATITUDE >= 0 ? i18n.t('viewer.northLat') : i18n.t('viewer.southLat');
            latDisplay.textContent = `${i18n.t('viewer.currentLat')}: ${hemisphere} ${Math.abs(LATITUDE).toFixed(2)}°`;
        }
    }

    function updateNorthAngleDisplay() {
        const normalizedAngle = Utils.normalizeAngle(NORTH_ANGLE);
        const northAngleDisplay = document.getElementById('northAngleDisplay');
        const orientationText = document.getElementById('orientationText');
        const angleText = formatAngleText(normalizedAngle);
        const compactAngle = normalizedAngle.toFixed(1).replace(/\.0$/, '');

        if (northAngleDisplay) {
            northAngleDisplay.textContent = `${i18n.t('viewer.northAngleLabel')}: ${compactAngle}°`;
        }

        if (orientationText) {
            if (Math.abs(normalizedAngle) < 0.01) {
                orientationText.textContent = i18n.t('viewer.orientationNorthUp');
            } else if (normalizedAngle > 0) {
                orientationText.textContent = i18n.t('viewer.orientationClockwise').replace('{0}', angleText);
            } else {
                orientationText.textContent = i18n.t('viewer.orientationCounterClockwise').replace('{0}', angleText);
            }
        }
    }

    function getSunlightStatusMeta(hours, referenceHours) {
        const reached = hours >= referenceHours;
        return {
            text: i18n.t(reached ? 'viewer.statusReachedReference' : 'viewer.statusBelowReference'),
            className: reached ? 'good' : 'bad'
        };
    }

    /**
     * 更新信息面板文字（支持多语言）
     */
    function showUnitInfo(data) {
        const panel = document.getElementById('unitInfoPanel');
        const content = document.getElementById('unitInfoContent');
        const title = document.getElementById('unitInfoTitle');
        const esc = Utils.escapeHtml;

        title.textContent = `${data.buildingName}`;

        const hours = data.sunlightHours;
        const unitMaxHours = Number.isFinite(data.unitMaxHours) ? data.unitMaxHours : null;
        const statusHours = unitMaxHours != null ? unitMaxHours : hours;
        const maxHours = CONFIG.SUNLIGHT_ANALYSIS.MAX_HOURS;
        const percent = Math.min(hours / maxHours * 100, 100);
        const color = getSunlightColor(hours, maxHours);
        const colorHex = '#' + color.getHexString();
        const currentLang = i18n.getCurrentLanguage();
        const referenceHours = sunlightResults?.referenceHours || getReferenceHours();
        const statusMeta = getSunlightStatusMeta(statusHours, referenceHours);

        const unitMaxText = unitMaxHours != null && Math.abs(unitMaxHours - hours) > 1e-6
            ? (currentLang === 'zh'
                ? `（户最大 ${unitMaxHours.toFixed(1)}h）`
                : `(Unit max ${unitMaxHours.toFixed(1)}h)`)
            : '';

        content.innerHTML = `
            <div class="info-row">
                <span class="info-label">${esc(i18n.t('viewer.floor'))}</span>
                <span class="info-value">${esc(data.floor)} ${esc(i18n.t('viewer.floorUnit'))}</span>
            </div>
            <div class="info-row">
                <span class="info-label">${esc(i18n.t('viewer.unitNumber'))}</span>
                <span class="info-value">${esc(i18n.t('viewer.unitFrom'))} ${esc(data.unit)} ${esc(i18n.t('viewer.unitTo'))}</span>
            </div>
            <div class="info-row">
                <span class="info-label">${esc(i18n.t('viewer.sunlightDuration'))}</span>
                <span class="info-value" style="color: ${colorHex}">${hours.toFixed(1)} ${esc(i18n.t('viewer.sunlightHours'))} <span style="font-size: 0.85em; color: #777;">${esc(unitMaxText)}</span></span>
            </div>
            <div class="info-row">
                <span class="info-label">${esc(i18n.t('viewer.sunlightStatus'))}</span>
                <span class="info-value ${statusMeta.className}">${esc(statusMeta.text)}</span>
            </div>
            <div class="sunlight-bar">
                <div class="sunlight-fill" style="width: ${percent}%; background: ${colorHex};"></div>
                <span class="sunlight-text">${hours.toFixed(1)}h</span>
            </div>
        `;

        panel.style.display = 'block';
        if (sunlightResults) {
            showSunlightStats(sunlightResults);
        }
    }

    /**
     * 显示日照统计结果（支持多语言）
     */
    function showSunlightStats(results) {
        const statsDiv = document.getElementById('sunlightStats');
        if (!statsDiv || !results) return;

        const currentLang = i18n.getCurrentLanguage();
        const dateParts = Utils.parseDateParts(results.date);
        const dateText = dateParts
            ? (currentLang === 'zh'
                ? `${dateParts.month}月${dateParts.day}日`
                : `${dateParts.month}/${dateParts.day}`)
            : results.date;
        const seasonKey = Utils.getSeasonTranslationKey(results.seasonPreset, results.latitude);
        const seasonName = seasonKey
            ? `${i18n.t(`viewer.${seasonKey}`)} (${dateText})`
            : dateText;

        const esc = Utils.escapeHtml;
        const selectedData = currentUnitInfoData;
        const selectedBuilding = selectedData ? results.buildings[String(selectedData.buildingIndex)] : null;
        const selectedUnitHours = Number.isFinite(selectedData?.unitMaxHours)
            ? selectedData.unitMaxHours
            : Number(selectedData?.sunlightHours) || 0;
        const referenceHours = results.referenceHours || CONFIG.SUNLIGHT_ANALYSIS.REFERENCE_HOURS || 2;
        const selectedStatus = selectedData
            ? getSunlightStatusMeta(selectedUnitHours, referenceHours)
            : null;

        let html = `
            <div class="stats-section">
                <div class="stats-section-title">${esc(i18n.t('viewer.statsScope'))}</div>
                <div class="stat-row">
                    <span class="stat-label">${esc(i18n.t('viewer.analysisDate'))}</span>
                    <span class="stat-value">${esc(seasonName)}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">${esc(i18n.t('viewer.statsTotalUnits'))}</span>
                    <span class="stat-value">${results.totalUnits}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">${esc(i18n.t('viewer.statsAverageHours'))}</span>
                    <span class="stat-value">${results.avgHours.toFixed(1)}h</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">${esc(i18n.t('viewer.statsMinHours'))}</span>
                    <span class="stat-value">${results.minHours.toFixed(1)}h</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">${esc(i18n.t('viewer.statsMaxHours'))}</span>
                    <span class="stat-value">${results.maxHours.toFixed(1)}h</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">${esc(i18n.t('viewer.statsBelowReference'))}</span>
                    <span class="stat-value ${results.belowReference > 0 ? 'bad' : 'good'}">${results.belowReference} / ${results.totalUnits}</span>
                </div>
                <div class="stat-note">${esc(i18n.t('viewer.statsScopeUnitMax'))}</div>
                <div class="stat-note">${esc(i18n.t('viewer.referenceHours'))}: ${referenceHours.toFixed(1).replace(/\.0$/, '')}h</div>
                <div class="stat-note">${esc(i18n.t('viewer.analysisDisclaimer'))}</div>
            </div>
        `;

        if (selectedData && selectedBuilding) {
            html += `
                <div class="stats-section">
                    <div class="stats-section-title">${esc(i18n.t('viewer.statsCurrentFocus'))}</div>
                    <div class="stat-row">
                        <span class="stat-label">${esc(i18n.t('viewer.statsCurrentUnit'))}</span>
                        <span class="stat-value">${esc(selectedData.buildingName)} ${esc(selectedData.floor)}${esc(i18n.t('viewer.floorUnit'))} ${esc(i18n.t('viewer.unitFrom'))}${esc(selectedData.unit)}${esc(i18n.t('viewer.unitTo'))}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">${esc(i18n.t('viewer.statsStatusLabel'))}</span>
                        <span class="stat-value ${selectedStatus.className}">${esc(selectedStatus.text)}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">${esc(i18n.t('viewer.statsMaxHours'))}</span>
                        <span class="stat-value">${selectedUnitHours.toFixed(1)}h</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">${esc(i18n.t('viewer.sunlightDuration'))}</span>
                        <span class="stat-value">${(Number(selectedData.sunlightHours) || 0).toFixed(1)}h</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">${esc(i18n.t('viewer.statsCurrentBuilding'))}</span>
                        <span class="stat-value">${esc(selectedBuilding.name || selectedData.buildingName)}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">${esc(i18n.t('viewer.statsTotalUnits'))}</span>
                        <span class="stat-value">${selectedBuilding.totalUnits}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">${esc(i18n.t('viewer.statsBuildingAverage'))}</span>
                        <span class="stat-value">${selectedBuilding.avgHours.toFixed(1)}h</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">${esc(i18n.t('viewer.statsBuildingBelowReference'))}</span>
                        <span class="stat-value ${selectedBuilding.belowReference > 0 ? 'bad' : 'good'}">${selectedBuilding.belowReference} / ${selectedBuilding.totalUnits}</span>
                    </div>
                </div>
            `;
        } else {
            html += `
                <div class="stats-section">
                    <div class="stats-section-title">${esc(i18n.t('viewer.statsCurrentFocus'))}</div>
                    <div class="stat-note">${esc(i18n.t('viewer.statsNoSelection'))}</div>
                </div>
            `;
        }

        statsDiv.innerHTML = html;
        statsDiv.style.display = 'block';
    }

})();
