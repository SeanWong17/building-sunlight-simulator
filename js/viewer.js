/**
 * 楼盘采光可视化 - 主逻辑
 */
(function() {
    'use strict';

    // ========== 场景初始化 ==========
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe6f3ff);
    scene.fog = new THREE.Fog(0xe6f3ff, 120, 1500);

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
    const planeMaterial = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, roughness: 0.95, metalness: 0.0 });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.x = -Math.PI / 2;
    plane.receiveShadow = true;
    scene.add(plane);

    // 网格
    const gridHelper = new THREE.GridHelper(2000, 100, 0xcfd8e3, 0xe9eff5);
    scene.add(gridHelper);

    // 北向箭头
    const northDir = new THREE.Vector3(0, 0, -1);
    const northOrigin = new THREE.Vector3(0, 1, 180);
    const arrowHelper = new THREE.ArrowHelper(northDir, northOrigin, 24, 0xff3b30, 10, 5);
    scene.add(arrowHelper);

    // 楼栋组
    const buildingsGroup = new THREE.Group();
    scene.add(buildingsGroup);

    // ========== 状态变量 ==========
    let LATITUDE = 36.65;
    let showOwnOnly = false;

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

    const roofMaterial = new THREE.MeshStandardMaterial({ color: 0xf5f7fa, roughness: 0.9, metalness: 0.0 });

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

    // ========== 城市/纬度选择器初始化 ==========
    function initLocationSelector() {
        const citySelect = document.getElementById('citySelect');
        const latInput = document.getElementById('latitudeInput');

        if (typeof generateCityOptions === 'function') {
            citySelect.innerHTML = generateCityOptions('济南');
            LATITUDE = getLatitudeByCity('济南') || 36.65;
            latInput.value = LATITUDE;
        }

        citySelect.addEventListener('change', function() {
            const selectedOption = this.options[this.selectedIndex];
            const lat = selectedOption.dataset.lat;
            if (lat) {
                LATITUDE = parseFloat(lat);
                latInput.value = LATITUDE;
                updateSun();
                updateLatDisplay();
            }
        });

        latInput.addEventListener('change', function() {
            const inputLat = parseFloat(this.value);
            if (!isNaN(inputLat) && inputLat >= -90 && inputLat <= 90) {
                LATITUDE = inputLat;
                updateSun();
                updateLatDisplay();

                // 尝试匹配城市
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

        updateLatDisplay();
    }

    function updateLatDisplay() {
        const latDisplay = document.getElementById('latDisplay');
        if (latDisplay) {
            const hemisphere = LATITUDE >= 0 ? '北纬' : '南纬';
            latDisplay.textContent = `当前: ${hemisphere} ${Math.abs(LATITUDE).toFixed(2)}°`;
        }
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
                if (typeof data.latitude === 'number' && isFinite(data.latitude)) {
                    LATITUDE = data.latitude;
                    document.getElementById('latitudeInput').value = LATITUDE;
                    updateLatDisplay();

                    // 尝试匹配城市
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
                loadBuildings(data);
                document.getElementById('empty-state').style.display = 'none';
            } catch (err) {
                alert('JSON 解析失败，请检查文件格式');
                console.error(err);
            }
        };
        reader.readAsText(file);
    });

    function clearGroup(group) {
        for (let i = group.children.length - 1; i >= 0; i--) {
            const obj = group.children[i];
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach(m => m && m.dispose && m.dispose());
                else obj.material.dispose && obj.material.dispose();
            }
            group.remove(obj);
        }
    }

    function loadBuildings(data) {
        clearGroup(buildingsGroup);
        if (data.latitude) LATITUDE = data.latitude;

        if (!data || !Array.isArray(data.buildings) || data.buildings.length === 0) return;

        data.buildings.forEach(b => {
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
            node.userData = { own, name: b.name || '' };
            buildingsGroup.add(node);

            let mesh;
            if (own) {
                const sideTexture = createFacadeTexture(floors, unitsPerFloor);
                const sideMaterial = new THREE.MeshStandardMaterial({
                    map: sideTexture,
                    color: 0x9fb0c4,
                    roughness: 0.7,
                    metalness: 0.05
                });
                mesh = new THREE.Mesh(geometry, [roofMaterial, sideMaterial]);
            } else {
                const neighborMaterial = new THREE.MeshStandardMaterial({
                    color: 0xb7c2cf,
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
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 4096;
    sunLight.shadow.mapSize.height = 4096;
    sunLight.shadow.bias = -0.0001;
    const d = 500;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 2000;
    scene.add(sunLight);
    scene.add(new THREE.AmbientLight(0x9fb3c8, 0.5));

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
        const decl = parseFloat(document.getElementById('seasonSelect').value);
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
        sunLight.intensity = alt > 0 ? 1.2 : 0.0;
    }

    // ========== UI 绑定 ==========
    function bindUI() {
        document.getElementById('seasonSelect').addEventListener('change', updateSun);
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

        // 侧边栏收起/展开
        const controlsPanel = document.getElementById('controls');
        const sidebarToggle = document.getElementById('sidebarToggle');

        // 移动端显示底部时间条 & 默认收起
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

        // 切换按钮点击
        sidebarToggle.addEventListener('click', () => {
            controlsPanel.classList.toggle('collapsed');
        });

        // 移动端点击场景自动收起
        document.getElementById('canvas-container').addEventListener('click', () => {
            if (window.innerWidth <= 600) {
                controlsPanel.classList.add('collapsed');
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
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        fitViewToBuildings();
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
        loadBuildings(DEFAULT_DATA);
        document.getElementById('empty-state').style.display = 'none';
    } else {
        console.log('未检测到 DEFAULT_DATA 变量，等待手动上传文件');
    }

})();