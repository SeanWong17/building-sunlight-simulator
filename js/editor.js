/**
 * 楼盘规划图配置器 - 主逻辑
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

    const CLOSE_EPS_BASE = 8;

    // ========== 工具函数 ==========
    function dist(a, b) {
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function pointsEqual(a, b, eps = 0) {
        if (!a || !b) return false;
        if (eps > 0) return dist(a, b) <= eps;
        return a.x === b.x && a.y === b.y;
    }

    function clampInt(v, min, max, fallback) {
        if (Number.isNaN(v)) return fallback;
        return Math.min(Math.max(Math.round(v), min), max);
    }

    function clampNum(v, min, max, fallback) {
        if (Number.isNaN(v)) return fallback;
        return Math.min(Math.max(v, min), max);
    }

    /**
     * 多边形净化 - 移除重复点、过短边、共线点
     */
    function sanitizePolygon(rawPoints, epsPx = 0.5) {
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

        function edgeLen(i, j) { return dist(clean[i], clean[j]); }
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
            citySelectEl.innerHTML = generateCityOptions('济南'); // 默认济南
            // 设置默认纬度
            const defaultLat = getLatitudeByCity('济南');
            if (defaultLat) {
                projectLatEl.value = defaultLat;
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
        zoomInfo.innerText = `缩放: ${Math.round(viewScale * 100)}%`;
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
            const nearStart = dist(mousePos, first) <= eps && currentPoly.length > 2;

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

    function getPolygonCenter(points) {
        let x = 0, y = 0;
        points.forEach(p => { x += p.x; y += p.y; });
        return { x: x / points.length, y: y / points.length };
    }

    // ========== 多边形完成 ==========
    function finishPolygon() {
        if (scaleRatio === 0) {
            alert("请先标定比例尺！");
            currentPoly = [];
            draw();
            return;
        }
        if (currentPoly.length < 3) {
            alert("至少需要三个点才能闭合楼栋。");
            currentPoly = [];
            draw();
            return;
        }

        const eps = 0.75;
        const cleaned = sanitizePolygon(currentPoly, eps);
        if (cleaned.length < 3) {
            alert("绘制的多边形无效，请重画。");
            currentPoly = [];
            draw();
            return;
        }

        const idx = buildings.length + 1;
        const useDefaults = chkUseDefaults.checked;
        const b = {
            id: Date.now() + Math.random(),
            name: `${idx}号楼`,
            floors: useDefaults ? clampInt(parseInt(defFloorsEl.value), 1, 300, 18) : 18,
            floorHeight: useDefaults ? clampNum(parseFloat(defFloorHeightEl.value), 1, 20, 3) : 3,
            units: useDefaults ? clampInt(parseInt(defUnitsEl.value), 1, 50, 2) : 2,
            isThisCommunity: useDefaults ? !!defIsThisCommunityEl.checked : true,
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
        document.getElementById('scaleStatus').innerText = "请在图中点击两点";
        document.getElementById('scaleInputArea').style.display = 'none';
        draw();
    });

    document.getElementById('btnConfirmScale').addEventListener('click', () => {
        if (scalePoints.length < 2) {
            alert("请先在图上选择两点。");
            return;
        }
        const distPx = Math.hypot(scalePoints[1].x - scalePoints[0].x, scalePoints[1].y - scalePoints[0].y);
        const distReal = parseFloat(document.getElementById('realDistance').value);
        if (!(distReal > 0) || !(distPx > 0)) {
            alert("请输入正确的实际距离，并确保两点不重合。");
            return;
        }
        scaleRatio = distReal / distPx;
        document.getElementById('scaleStatus').innerText = `已标定 (1px ≈ ${scaleRatio.toFixed(4)}m)`;
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
            btnDrawMode.innerText = "当前: ✏️ 正在绘制 (双击结束 / 右键撤销)";
            btnDrawMode.style.background = "#28a745";
            btnDrawMode.style.color = "white";
        } else {
            mode = 'idle';
            btnDrawMode.innerText = "当前: ✋ 浏览模式";
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
            inpName.placeholder = '输入名称（如：1号楼/配建/幼儿园）';
            inpName.addEventListener('input', () => {
                b.name = inpName.value || `${i + 1}号楼`;
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
                b.floorHeight = clampNum(parseFloat(inpFloorH.value), 1, 20, b.floorHeight);
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
            const btnDel = document.createElement('button');
            btnDel.className = 'btn-mini btn-danger';
            btnDel.textContent = '删除';
            btnDel.addEventListener('click', () => {
                if (confirm('确定删除该楼栋吗？')) {
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
        });
    }

    // ========== 应用默认值到所有楼栋 ==========
    btnApplyDefaultsAll.addEventListener('click', () => {
        const f = clampInt(parseInt(defFloorsEl.value), 1, 300, 18);
        const h = clampNum(parseFloat(defFloorHeightEl.value), 1, 20, 3);
        const u = clampInt(parseInt(defUnitsEl.value), 1, 50, 2);
        const own = !!defIsThisCommunityEl.checked;
        buildings = buildings.map(b => ({ ...b, floors: f, floorHeight: h, units: u, isThisCommunity: own }));
        renderTable();
        draw();
    });

    // ========== 导出 JSON ==========
    document.getElementById('btnExport').addEventListener('click', () => {
        if (buildings.length === 0) {
            alert("没有数据可导出");
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

        const round2 = n => Math.round(n * 100) / 100;
        const lat = parseFloat(projectLatEl.value) || 36.65;

        const exportData = {
            version: 1.7,
            latitude: lat,
            scaleRatio: scaleRatio,
            origin: { x: centerX, y: centerY },
            buildings: buildings.map(b => {
                const c = getPolygonCenter(b.points);
                const cx = (c.x - centerX) * scaleRatio;
                const cy = (c.y - centerY) * scaleRatio;

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
                    center: { x: round2(cx), y: round2(cy) }
                };
            })
        };

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "buildings_config.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    });

    // ========== 默认参数输入校验 ==========
    [defFloorsEl, defFloorHeightEl, defUnitsEl].forEach(el => {
        el.addEventListener('change', () => {
            defFloorsEl.value = clampInt(parseInt(defFloorsEl.value), 1, 300, 18);
            defFloorHeightEl.value = clampNum(parseFloat(defFloorHeightEl.value), 1, 20, 3);
            defUnitsEl.value = clampInt(parseInt(defUnitsEl.value), 1, 50, 2);
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

        const initialTop = Math.max(160, Math.min(window.innerHeight * 0.6, window.innerHeight * 0.44));
        topPane.style.height = initialTop + 'px';
        const initialTable = Math.max(120, Math.min(window.innerHeight * 0.7, window.innerHeight * 0.28));
        tableWrapper.style.height = initialTable + 'px';
        clampTableHeightToBottomPane();
    });

    window.addEventListener('resize', () => {
        clampTableHeightToBottomPane();
    });

})();