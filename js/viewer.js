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
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2 - 0.1;

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

    // ========== 状态变量 ==========
    let LATITUDE = 36.65;
    let NORTH_ANGLE = CONFIG.DEFAULTS.NORTH_ANGLE;
    let showOwnOnly = false;
    let rawData = null;
    let currentData = null;
    let sunlightResults = null; // 存储日照计算结果
    let showHeatmap = false;
    let customDeclination = null; // 存储自定义日期的赤纬角

    function rotatePlanPoint(point, angleDeg) {
        const rad = angleDeg * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        return {
            x: point.x * cos - point.y * sin,
            y: point.x * sin + point.y * cos
        };
    }

    function transformProjectData(data, northAngle) {
        if (!data) return null;

        const normalizedAngle = Utils.normalizeAngle(parseFloat(northAngle));
        const rotationAngle = -normalizedAngle;
        const transformed = Utils.deepClone(data);
        transformed.northAngle = normalizedAngle;

        if (!Array.isArray(transformed.buildings)) {
            return transformed;
        }

        transformed.buildings = transformed.buildings.map(building => {
            const nextBuilding = { ...building };

            if (Array.isArray(building.shape)) {
                nextBuilding.shape = building.shape.map(point => rotatePlanPoint(point, rotationAngle));
            }

            if (building.center && typeof building.center.x === 'number' && typeof building.center.y === 'number') {
                nextBuilding.center = rotatePlanPoint(building.center, rotationAngle);
            }

            return nextBuilding;
        });

        return transformed;
    }

    function formatAngleText(angle) {
        return Math.abs(Utils.normalizeAngle(angle)).toFixed(1).replace(/\.0$/, '');
    }

    function rebuildProjectScene() {
        if (!rawData) return;
        currentData = transformProjectData(rawData, NORTH_ANGLE);
        loadBuildings(currentData);
    }

    function syncLatitudeControls(latitude) {
        if (typeof latitude !== 'number' || !isFinite(latitude)) return;

        LATITUDE = latitude;
        document.getElementById('latitudeInput').value = LATITUDE;
        updateLatDisplay();

        const citySelect = document.getElementById('citySelect');
        let matched = false;
        for (const option of citySelect.options) {
            if (option.dataset.lat && Math.abs(parseFloat(option.dataset.lat) - LATITUDE) < 0.01) {
                citySelect.value = option.value;
                matched = true;
                break;
            }
        }
        if (!matched) {
            citySelect.value = '';
        }
    }

    // ========== 纹理与材质工具 ==========
    function createFacadeTexture(floors, unitsPerFloor) {
        const floorPx = 28;
        const width = 512;
        const height = Math.max(floors * floorPx, 4);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        const grd = ctx.createLinearGradient(0, 0, 0, canvas.height);
        grd.addColorStop(0, '#b1bfd1');
        grd.addColorStop(1, '#a2b2c7');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, width, height);

        for (let f = 0; f < floors; f++) {
            const y0 = Math.floor(f * floorPx);
            const y1 = Math.floor((f + 1) * floorPx);
            const bandH = y1 - y0;

            const nUnits = Math.max(1, unitsPerFloor[f] || 1);
            if (nUnits > 1) {
                const step = width / nUnits;
                for (let i = 1; i < nUnits; i++) {
                    const x = Math.round(i * step);
                    ctx.fillStyle = 'rgba(35,45,60,0.6)';
                    ctx.fillRect(x - 1, y0, 2, bandH);
                    ctx.fillStyle = 'rgba(255,255,255,0.22)';
                    ctx.fillRect(x + 1, y0, 1, bandH);
                }
            }

            if (f < floors - 1) {
                ctx.fillStyle = 'rgba(35,45,60,0.55)';
                ctx.fillRect(0, y1 - 1, width, 2);
                ctx.fillStyle = 'rgba(255,255,255,0.25)';
                ctx.fillRect(0, y1 + 1, width, 1);
            }
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.anisotropy = 8;
        tex.needsUpdate = true;
        return tex;
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

        ctx.font = "bold 72px Arial, Helvetica, sans-serif";
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

    function makeUVGenerator(minX, maxX, minY, maxY, depth) {
        const rangeX = Math.max(1e-6, maxX - minX);
        const rangeY = Math.max(1e-6, maxY - minY);
        const invDepth = depth > 0 ? 1 / depth : 1;

        return {
            generateTopUV: function(geometry, vertices, a, b, c) {
                const ax = vertices[a * 3], ay = vertices[a * 3 + 1];
                const bx = vertices[b * 3], by = vertices[b * 3 + 1];
                const cx = vertices[c * 3], cy = vertices[c * 3 + 1];
                return [
                    new THREE.Vector2((ax - minX) / rangeX, (ay - minY) / rangeY),
                    new THREE.Vector2((bx - minX) / rangeX, (by - minY) / rangeY),
                    new THREE.Vector2((cx - minX) / rangeX, (cy - minY) / rangeY),
                ];
            },
            generateSideWallUV: function(geometry, vertices, a, b, c, d) {
                const ax = vertices[a * 3], az = vertices[a * 3 + 2];
                const bx = vertices[b * 3], bz = vertices[b * 3 + 2];
                const cx = vertices[c * 3], cz = vertices[c * 3 + 2];
                const dx = vertices[d * 3], dz = vertices[d * 3 + 2];

                const uA = (ax - minX) / rangeX;
                const uB = (bx - minX) / rangeX;
                const uC = (cx - minX) / rangeX;
                const uD = (dx - minX) / rangeX;

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
            }
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
        return Math.max(0.06, subLen - sideInset * 2);
    }

    // ========== 日照分析核心功能 ==========

    /**
     * 找到建筑物的南面（y值最大的边）
     * 返回南面的两个端点，按从西到东排序
     */
    function findSouthFace(shape) {
        if (shape.length < 3) return null;

        // 找到所有边
        const edges = [];
        for (let i = 0; i < shape.length; i++) {
            const p1 = shape[i];
            const p2 = shape[(i + 1) % shape.length];
            const midY = (p1.y + p2.y) / 2;
            edges.push({ p1, p2, midY });
        }

        // 找到 y 值最大的边（最南）
        edges.sort((a, b) => b.midY - a.midY);
        const southEdge = edges[0];

        // 确保从西到东排序（x 从小到大）
        let start = southEdge.p1;
        let end = southEdge.p2;
        if (start.x > end.x) {
            [start, end] = [end, start];
        }

        return { start, end };
    }

    function getBuildingSplitAxis(building) {
        return axisFromAngleDeg(building?.unitSplitAngleDeg || 0);
    }

    /**
     * 计算所有外墙片段上的采光检测点
     */
    function calculateSamplingPoints(building, buildingIndex) {
        const points = [];
        const floors = Math.max(1, parseInt(building.floors || 1, 10));
        const floorHeight = building.floorHeight || 3;
        const units = Math.max(1, parseInt(building.units || 1, 10));
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
            const windowHeight = floor * floorHeight + floorHeight * 0.4 + 1.2;
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
                    if (subLen < 0.1) continue;

                    const midX = segment.start.x + tMid * (segment.end.x - segment.start.x);
                    const midY = segment.start.y + tMid * (segment.end.y - segment.start.y);
                    const dx = segment.end.x - segment.start.x;
                    const dy = segment.end.y - segment.start.y;
                    const tangent = segment.len > 1e-6
                        ? { x: dx / segment.len, y: dy / segment.len }
                        : { x: 1, y: 0 };

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

    /**
     * 计算太阳方向向量
     */
    function calculateSunDirection(hour, latitude, declination) {
        const rad = Math.PI / 180;
        const hAngle = (hour - 12) * 15 * rad;
        const lat = latitude * rad;
        const dec = declination * rad;

        const sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hAngle);
        const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));

        if (alt <= 0.01) return null; // 太阳在地平线以下或刚好在地平线

        const cosAz = (sinAlt * Math.sin(lat) - Math.sin(dec)) / (Math.cos(alt) * Math.cos(lat));
        let az = Math.acos(Math.min(1, Math.max(-1, cosAz)));
        if (hour >= 12) az = -az;

        // 返回指向太阳的方向向量
        const y = Math.sin(alt);
        const r = Math.cos(alt);
        const x = r * Math.sin(az);
        const z = r * Math.cos(az);

        return new THREE.Vector3(x, y, z).normalize();
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

    /**
     * 检查某点在某时刻是否有日照
     */
    function checkSunlight(point, sunDirection, buildingMeshes, raycaster) {
        if (!sunDirection) return false;

        // 转换坐标：数据中的 (x, y) -> 3D 中的 (x, z)，z 是高度变 y
        const origin = new THREE.Vector3(point.x, point.z, point.y);

        raycaster.set(origin, sunDirection);
        raycaster.near = 0.1;
        raycaster.far = 2000;

        const intersects = raycaster.intersectObjects(buildingMeshes, true);
        return intersects.length === 0;
    }

    function buildSunlightResultsFromPoints(allPoints, declination, latitude, timeStep) {
        const results = {
            points: allPoints,
            declination,
            latitude,
            timeStep,
            buildings: {}
        };

        let sumUnitHours = 0;
        let totalUnits = 0;
        let globalMin = Infinity;
        let globalMax = 0;
        const standardHours = CONFIG.SUNLIGHT_ANALYSIS.STANDARD_HOURS || 2;

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
                globalMin = Math.min(globalMin, unitMaxHours);
                globalMax = Math.max(globalMax, unitMaxHours);
            }

            buildingResult.avgHours = buildingResult.totalUnits > 0 ? (buildingSum / buildingResult.totalUnits) : 0;
            delete buildingResult.unitsMap;
        }

        results.totalUnits = totalUnits;
        results.minHours = globalMin === Infinity ? 0 : globalMin;
        results.maxHours = globalMax;
        results.avgHours = totalUnits > 0 ? (sumUnitHours / totalUnits) : 0;
        results.belowStandard = totalUnits === 0
            ? 0
            : allPoints.filter(point => point.unitMaxHours < standardHours)
                .reduce((set, point) => {
                    set.add(`${point.buildingIndex}-${point.floor}-${point.unit}`);
                    return set;
                }, new Set()).size;

        return results;
    }

    /**
     * 执行日照时长计算
     */
    async function calculateSunlightDuration(progressCallback) {
        if (!currentData || !currentData.buildings) {
            alert(i18n.t('viewer.errorNoData'));
            return null;
        }

        const seasonValue = document.getElementById('seasonSelect').value;
        let declination;
        if (seasonValue === 'custom') {
            declination = customDeclination || 0;
        } else {
            declination = parseFloat(seasonValue);
            if (isNaN(declination)) declination = 0;
        }
        
        const timeStep = CONFIG.SUNLIGHT_ANALYSIS.TIME_INTERVAL;

        const allPoints = [];
        currentData.buildings.forEach((building, idx) => {
            if (building.isThisCommunity) {
                allPoints.push(...calculateSamplingPoints(building, idx));
            }
        });

        if (allPoints.length === 0) {
            alert(i18n.t('viewer.errorNoBuilding'));
            return null;
        }

        const buildingMeshes = collectBuildingMeshes();
        const raycaster = new THREE.Raycaster();
        const timePoints = [];

        for (let hour = 6; hour <= 18; hour += timeStep) {
            timePoints.push(hour);
        }

        const totalSteps = allPoints.length * timePoints.length;
        let completedSteps = 0;

        for (let pointIdx = 0; pointIdx < allPoints.length; pointIdx++) {
            const point = allPoints[pointIdx];

            for (const hour of timePoints) {
                const sunDir = calculateSunDirection(hour, LATITUDE, declination);
                if (sunDir && checkSunlight(point, sunDir, buildingMeshes, raycaster)) {
                    point.sunlightHours += timeStep;
                }
                completedSteps++;
            }

            if (pointIdx % 10 === 0) {
                const progress = completedSteps / totalSteps;
                if (progressCallback) progressCallback(progress);
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        return buildSunlightResultsFromPoints(allPoints, declination, LATITUDE, timeStep);
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
        if (!results || !results.points) return;

        const maxHours = CONFIG.SUNLIGHT_ANALYSIS.MAX_HOURS; // 使用配置的8小时

        results.points.forEach(point => {
            const building = currentData.buildings[point.buildingIndex];
            if (!building) return;

            const floorHeight = building.floorHeight || 3;
            const cellHeight = floorHeight * 0.9;
            const cellWidth = Math.max(0.06, Number(point.cellWidth) || 0.6);

            const geometry = new THREE.PlaneGeometry(cellWidth, cellHeight);
            const color = getSunlightColor(point.sunlightHours, maxHours);
            const material = new THREE.MeshBasicMaterial({
                color: color,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.85,
                depthTest: true,
                polygonOffset: true,
                polygonOffsetFactor: -1,
                polygonOffsetUnits: -1
            });

            const mesh = new THREE.Mesh(geometry, material);
            const wallHeight = (point.floor - 0.5) * floorHeight;
            const normalX = point.outward?.x || 0;
            const normalZ = point.outward?.y || 0;
            const offset = 0.3;
            const wallDataX = point.wallDataX;
            const wallDataY = point.wallDataY;
            const tangentX = point.tangent?.x || 1;
            const tangentZ = point.tangent?.y || 0;

            mesh.position.set(wallDataX + normalX * offset, wallHeight, wallDataY + normalZ * offset);

            const upAxis = new THREE.Vector3(0, 1, 0);
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
            const rotationMatrix = new THREE.Matrix4().makeBasis(xAxis, upAxis, zAxis);
            mesh.quaternion.setFromRotationMatrix(rotationMatrix);

            mesh.userData = {
                type: 'heatmapCell',
                buildingName: point.buildingName,
                floor: point.floor,
                unit: point.unit,
                sunlightHours: point.sunlightHours,
                unitMaxHours: point.unitMaxHours
            };

            heatmapGroup.add(mesh);
        });
    }

    /**
     * 显示/隐藏热力图
     */
    function toggleHeatmap(show) {
        showHeatmap = show;
        heatmapGroup.visible = show;

        if (show && sunlightResults) {
            createHeatmapLayer(sunlightResults);
        }
    }

    // ========== 城市/纬度选择器初始化 ==========
    function initLocationSelector() {
        const citySelect = document.getElementById('citySelect');
        const latInput = document.getElementById('latitudeInput');
        const northAngleInput = document.getElementById('northAngleInput');
        if (typeof generateCityOptions === 'function') {
            citySelect.innerHTML = generateCityOptions('济南');
            LATITUDE = getLatitudeByCity('济南') || 36.65;
            latInput.value = LATITUDE;
        }
        northAngleInput.value = NORTH_ANGLE;

        citySelect.addEventListener('change', function() {
            const selectedOption = this.options[this.selectedIndex];
            const lat = selectedOption.dataset.lat;
            if (lat) {
                LATITUDE = parseFloat(lat);
                latInput.value = LATITUDE;
                updateSun();
                updateLatDisplay();
                // 清除之前的计算结果
                clearSunlightResults();
            }
        });

        latInput.addEventListener('change', function() {
            const inputLat = parseFloat(this.value);
            if (!isNaN(inputLat) && inputLat >= -90 && inputLat <= 90) {
                LATITUDE = inputLat;
                updateSun();
                updateLatDisplay();
                clearSunlightResults();

                let matched = false;
                for (const option of citySelect.options) {
                    if (option.dataset.lat && Math.abs(parseFloat(option.dataset.lat) - inputLat) < 0.01) {
                        citySelect.value = option.value;
                        matched = true;
                        break;
                    }
                }
                if (!matched) {
                    citySelect.value = '';
                }
            }
        });

        northAngleInput.addEventListener('change', function() {
            NORTH_ANGLE = Utils.normalizeAngle(parseFloat(this.value));
            this.value = NORTH_ANGLE;
            updateNorthAngleDisplay();

            if (rawData) {
                rebuildProjectScene();
                clearSunlightResults();
            }
        });

        updateLatDisplay();
        updateNorthAngleDisplay();
    }

    function clearSunlightResults() {
        sunlightResults = null;
        clearGroup(heatmapGroup);
        document.getElementById('toggleHeatmap').checked = false;
        document.getElementById('toggleHeatmap').disabled = true;
        document.getElementById('heatmapLegend').style.display = 'none';
        document.getElementById('sunlightStats').style.display = 'none';
    }

    // ========== 加载楼栋数据 ==========
    const jsonInput = document.getElementById('jsonInput');

    jsonInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                syncLatitudeControls(data.latitude);
                updateSun();
                rawData = data;
                NORTH_ANGLE = Utils.normalizeAngle(parseFloat(data.northAngle));
                document.getElementById('northAngleInput').value = NORTH_ANGLE;
                updateNorthAngleDisplay();
                rebuildProjectScene();
                clearSunlightResults();
                document.getElementById('empty-state').style.display = 'none';
            } catch (err) {
                alert(i18n.t('viewer.errorParseFailed'));
                console.error(err);
            }
        };
        reader.onerror = () => {
            alert(i18n.t('viewer.errorFileRead'));
        };
        reader.readAsText(file);
    });

    function disposeMaterial(m) {
        if (!m) return;
        if (m.map) m.map.dispose();
        if (m.dispose) m.dispose();
    }

    function clearGroup(group) {
        for (let i = group.children.length - 1; i >= 0; i--) {
            const obj = group.children[i];
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach(disposeMaterial);
                else disposeMaterial(obj.material);
            }
            group.remove(obj);
        }
    }

    function loadBuildings(data) {
        clearGroup(buildingsGroup);

        if (!data || !Array.isArray(data.buildings) || data.buildings.length === 0) return;

        data.buildings.forEach((b, index) => {
            if (!b.shape || b.shape.length < 3) return;

            const shape = new THREE.Shape();
            shape.moveTo(b.shape[0].x, -b.shape[0].y);
            for (let i = 1; i < b.shape.length; i++) {
                shape.lineTo(b.shape[i].x, -b.shape[i].y);
            }
            shape.closePath();

            const pts = b.shape.map(p => ({ x: p.x, y: -p.y }));
            const minX = Math.min(...pts.map(p => p.x));
            const maxX = Math.max(...pts.map(p => p.x));
            const minY = Math.min(...pts.map(p => p.y));
            const maxY = Math.max(...pts.map(p => p.y));

            const floors = Math.max(1, parseInt(b.floors || 1, 10));
            const totalHeight = typeof b.totalHeight === 'number' ? b.totalHeight : (floors * (b.floorHeight || 3));
            const unitsPerFloor = normalizeUnitsPerFloor({ floors, units: b.units, unitsPerFloor: b.unitsPerFloor });

            const extrudeSettings = {
                depth: totalHeight,
                bevelEnabled: false,
                UVGenerator: makeUVGenerator(minX, maxX, minY, maxY, totalHeight)
            };
            const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
            geometry.computeVertexNormals();

            const own = (typeof b.isThisCommunity === 'boolean') ? b.isThisCommunity : true;

            const node = new THREE.Group();
            node.userData = { own, name: b.name || '', buildingIndex: index };
            buildingsGroup.add(node);

            let mesh;
            if (own) {
                const sideTexture = createFacadeTexture(floors, unitsPerFloor);
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

        applyVisibilityFilter(false);
        fitViewToBuildings();
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
    }

    function applyVisibilityFilter(shouldFit = true) {
        buildingsGroup.children.forEach(node => {
            if (typeof node.userData?.own === 'boolean') {
                node.visible = showOwnOnly ? node.userData.own : true;
            }
        });
        if (shouldFit) fitViewToBuildings();
    }

    // ========== 光照 ==========
    const sunLight = new THREE.DirectionalLight(0xffffff, CONFIG.LIGHTING.SUN_INTENSITY);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = CONFIG.LIGHTING.SHADOW_MAP_SIZE;
    sunLight.shadow.mapSize.height = CONFIG.LIGHTING.SHADOW_MAP_SIZE;
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
        const h = Math.floor(hour);
        const m = Math.floor((hour - h) * 60);
        const text = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        const t1 = document.getElementById('timeText');
        const t2 = document.getElementById('timeTextDock');
        if (t1) t1.innerText = text;
        if (t2) t2.innerText = text;
    }

    function updateSun() {
        const hour = getCurrentHour();
        const seasonValue = document.getElementById('seasonSelect').value;
        let decl;
        if (seasonValue === 'custom') {
            decl = customDeclination || 0;
        } else {
            decl = parseFloat(seasonValue);
            if (isNaN(decl)) decl = 0;
        }

        setTimeText(hour);

        const rad = Math.PI / 180;
        const hAngle = (hour - 12) * 15 * rad;
        const lat = LATITUDE * rad;
        const dec = decl * rad;

        const sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hAngle);
        const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));

        const cosAz = (sinAlt * Math.sin(lat) - Math.sin(dec)) / (Math.cos(alt) * Math.cos(lat));
        let az = Math.acos(Math.min(1, Math.max(-1, cosAz)));
        if (hour >= 12) az = -az;

        const dist = 800;
        const y = dist * Math.sin(alt);
        const r = dist * Math.cos(alt);
        const x = r * Math.sin(az);
        const z = r * Math.cos(az);

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
    }

    // ========== 点击交互 ==========
    const raycasterClick = new THREE.Raycaster();
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

        if (intersects.length > 0) {
            const obj = intersects[0].object;
            if (obj.userData.type === 'heatmapCell') {
                showUnitInfo(obj.userData);
            }
        }
    }

    // ========== UI 绑定 ==========
    function bindUI() {
        // 语言切换
        initLanguageSwitcher();

        // 日期选择
        const seasonSelect = document.getElementById('seasonSelect');
        const customDatePicker = document.getElementById('customDatePicker');
        const customDateInput = document.getElementById('customDateInput');
        
        // 设置默认日期为今天
        customDateInput.value = Utils.formatDate(new Date());
        
        seasonSelect.addEventListener('change', (e) => {
            const value = e.target.value;
            
            if (value === 'custom') {
                // 显示日期选择器
                customDatePicker.style.display = 'block';
                // 计算当前选择日期的赤纬角
                customDeclination = Utils.calculateSolarDeclination(customDateInput.value);
            } else {
                // 隐藏日期选择器
                customDatePicker.style.display = 'none';
                customDeclination = null;
            }
            
            updateSun();
            clearSunlightResults();
        });
        
        // 自定义日期变化
        customDateInput.addEventListener('change', (e) => {
            customDeclination = Utils.calculateSolarDeclination(e.target.value);
            updateSun();
            clearSunlightResults();
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

        document.getElementById('toggleOwnOnly').addEventListener('change', (e) => {
            showOwnOnly = !!e.target.checked;
            applyVisibilityFilter(true);
        });

        // 日照分析按钮
        document.getElementById('calcSunlightBtn').addEventListener('click', async () => {
            const btn = document.getElementById('calcSunlightBtn');
            const progress = document.getElementById('calcProgress');
            const progressFill = document.getElementById('progressFill');
            const progressText = document.getElementById('progressText');

            btn.disabled = true;
            progress.style.display = 'block';

            try {
                sunlightResults = await calculateSunlightDuration((p) => {
                    const pct = Math.round(p * 100);
                    progressFill.style.width = pct + '%';
                    progressText.textContent = i18n.t('viewer.calculatingProgress').replace('{0}', pct);
                });

                if (sunlightResults) {
                    progressText.textContent = i18n.t('viewer.calculationComplete');
                    document.getElementById('toggleHeatmap').disabled = false;
                    document.getElementById('heatmapLegend').style.display = 'block';
                    showSunlightStats(sunlightResults);

                    // 自动显示热力图
                    document.getElementById('toggleHeatmap').checked = true;
                    toggleHeatmap(true);
                }
            } catch (err) {
                console.error('日照计算错误:', err);
                alert(i18n.t('viewer.errorCalcFailed'));
            }

            btn.disabled = false;
            setTimeout(() => {
                progress.style.display = 'none';
            }, 1500);
        });

        // 热力图开关
        document.getElementById('toggleHeatmap').addEventListener('change', (e) => {
            toggleHeatmap(e.target.checked);
        });

        // 关闭户型信息面板
        document.getElementById('closeUnitInfo').addEventListener('click', () => {
            document.getElementById('unitInfoPanel').style.display = 'none';
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

    // ========== 动画循环 ==========
    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }

    // ========== 窗口大小调整 ==========
    const debouncedFitView = Utils.debounce(() => fitViewToBuildings(), 150);
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        debouncedFitView();
    });

    // ========== 初始化 ==========
    initLocationSelector();
    bindUI();
    setHour(10);
    updateSun();
    animate();

    // 尝试加载默认数据
    if (typeof DEFAULT_DATA !== 'undefined') {
        console.log('检测到默认数据，正在加载...');
        rawData = DEFAULT_DATA;
        syncLatitudeControls(DEFAULT_DATA.latitude);
        updateSun();
        NORTH_ANGLE = Utils.normalizeAngle(parseFloat(DEFAULT_DATA.northAngle));
        document.getElementById('northAngleInput').value = NORTH_ANGLE;
        updateNorthAngleDisplay();
        rebuildProjectScene();
        document.getElementById('empty-state').style.display = 'none';
    } else {
        console.log('未检测到 DEFAULT_DATA 变量，等待手动上传文件');
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

        // 更新时间显示
        const hour = getCurrentHour();
        setTimeText(hour);
        
        // 如果有日照统计结果，更新显示
        if (sunlightResults) {
            showSunlightStats(sunlightResults);
        }
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

        let statusText = i18n.t('viewer.statusGood');
        let statusClass = 'good';
        if (statusHours < 2) {
            statusText = i18n.t('viewer.statusBad');
            statusClass = 'bad';
        } else if (statusHours < 3) {
            statusText = i18n.t('viewer.statusWarning');
            statusClass = 'warning';
        }

        const unitMaxText = unitMaxHours == null
            ? ''
            : (currentLang === 'zh'
                ? `（户最大 ${unitMaxHours.toFixed(1)}h）`
                : `(Unit max ${unitMaxHours.toFixed(1)}h)`);

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
                <span class="info-value ${statusClass}">${esc(statusText)}</span>
            </div>
            <div class="sunlight-bar">
                <div class="sunlight-fill" style="width: ${percent}%; background: ${colorHex};"></div>
                <span class="sunlight-text">${hours.toFixed(1)}h</span>
            </div>
        `;

        panel.style.display = 'block';
    }

    /**
     * 显示日照统计结果（支持多语言）
     */
    function showSunlightStats(results) {
        const statsDiv = document.getElementById('sunlightStats');
        if (!statsDiv || !results) return;

        const seasonNames = {
            'zh': {
                '-23.44': '冬至',
                '0': '春/秋分',
                '23.44': '夏至'
            },
            'en': {
                '-23.44': 'Winter Solstice',
                '0': 'Spring/Autumn Equinox',
                '23.44': 'Summer Solstice'
            }
        };

        const currentLang = i18n.getCurrentLanguage();
        let seasonName = seasonNames[currentLang][results.declination.toString()];
        
        // 如果是自定义日期，显示具体日期
        if (!seasonName) {
            const customDateInput = document.getElementById('customDateInput');
            if (customDateInput && customDateInput.value) {
                const date = new Date(customDateInput.value);
                const month = date.getMonth() + 1;
                const day = date.getDate();
                seasonName = currentLang === 'zh' ? `${month}月${day}日` : `${month}/${day}`;
            } else {
                seasonName = currentLang === 'zh' ? '自定义日期' : 'Custom Date';
            }
        }

        let html = `
            <div class="stat-row">
                <span class="stat-label">${Utils.escapeHtml(i18n.t('viewer.analysisDate'))}</span>
                <span class="stat-value">${Utils.escapeHtml(seasonName)}</span>
            </div>
        `;

        statsDiv.innerHTML = html;
        statsDiv.style.display = 'block';
    }

})();
