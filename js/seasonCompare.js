/**
 * 四季日照对比分屏模块
 * Seasonal Sunlight Comparison Module
 * 
 * @description 提供四宫格视图同时显示冬至/春分/夏至/秋分，支持同步相机控制和动画
 * @author Building Sunlight Simulator Team
 * @version 1.0.0
 */

const SeasonCompare = (function() {
    'use strict';

    // 季节配置
    const Seasons = {
        WINTER_SOLSTICE: { name: 'winter', declination: -23.44, label: '冬至', labelEn: 'Winter Solstice', date: '12-22' },
        SPRING_EQUINOX: { name: 'spring', declination: 0, label: '春分', labelEn: 'Spring Equinox', date: '03-20' },
        SUMMER_SOLSTICE: { name: 'summer', declination: 23.44, label: '夏至', labelEn: 'Summer Solstice', date: '06-21' },
        AUTUMN_EQUINOX: { name: 'autumn', declination: 0, label: '秋分', labelEn: 'Autumn Equinox', date: '09-23' }
    };

    // 模块状态
    let isActive = false;
    let mainScene = null;
    let mainCamera = null;
    let mainRenderer = null;
    let mainControls = null;
    let buildingsData = null;
    let latitude = 36.65;
    
    // 四个视口
    let viewports = [];
    let container = null;
    
    // 同步控制
    let isSyncing = false;
    let isPlaying = false;
    let playInterval = null;
    let currentTime = 10; // 当前时间（小时）
    
    // 原始容器
    let originalContainer = null;
    let originalCanvas = null;

    /**
     * 初始化四季对比
     */
    function init(mainScene_, mainCamera_, mainRenderer_, mainControls_, containerId) {
        mainScene = mainScene_;
        mainCamera = mainCamera_;
        mainRenderer = mainRenderer_;
        mainControls = mainControls_;
        container = document.getElementById(containerId);
        
        if (!container) {
            console.error('Container not found:', containerId);
            return false;
        }
        
        // 保存原始画布引用
        originalCanvas = mainRenderer.domElement;
        
        return true;
    }

    /**
     * 激活/停用四季对比模式
     */
    function toggle(buildingsData_, lat) {
        if (isActive) {
            deactivate();
        } else {
            activate(buildingsData_, lat);
        }
        return isActive;
    }

    /**
     * 激活四季对比模式
     */
    function activate(data, lat) {
        buildingsData = data;
        latitude = lat || 36.65;
        
        // 保存原始容器
        originalContainer = originalCanvas.parentElement;
        
        // 创建四宫格容器
        createQuadViewContainer();
        
        // 创建四个视口
        createViewports();
        
        // 绑定同步控制
        bindSyncControls();
        
        isActive = true;
        
        // 开始动画循环
        animate();
        
        return true;
    }

    /**
     * 停用四季对比模式
     */
    function deactivate() {
        if (!isActive) return;
        
        // 停止播放
        stopPlay();
        
        // 清理视口
        viewports.forEach(vp => {
            if (vp.renderer) {
                vp.renderer.dispose();
            }
            if (vp.controls) {
                vp.controls.dispose();
            }
        });
        viewports = [];
        
        // 移除四宫格容器
        const quadContainer = document.getElementById('season-compare-container');
        if (quadContainer) {
            quadContainer.remove();
        }
        
        // 恢复原始画布
        if (originalContainer && originalCanvas) {
            originalContainer.appendChild(originalCanvas);
            originalCanvas.style.display = 'block';
        }
        
        // 恢复原始渲染器大小
        mainRenderer.setSize(window.innerWidth, window.innerHeight);
        
        isActive = false;
    }

    /**
     * 创建四宫格容器
     */
    function createQuadViewContainer() {
        // 隐藏原始画布
        originalCanvas.style.display = 'none';
        
        // 创建四宫格容器
        const quadContainer = document.createElement('div');
        quadContainer.id = 'season-compare-container';
        quadContainer.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            display: grid;
            grid-template-columns: 1fr 1fr;
            grid-template-rows: 1fr 1fr;
            gap: 4px;
            background: #1a1a1a;
            z-index: 5;
        `;
        
        container.appendChild(quadContainer);
    }

    /**
     * 创建四个视口
     */
    function createViewports() {
        const seasons = [
            Seasons.WINTER_SOLSTICE,
            Seasons.SPRING_EQUINOX,
            Seasons.SUMMER_SOLSTICE,
            Seasons.AUTUMN_EQUINOX
        ];
        
        const quadContainer = document.getElementById('season-compare-container');
        
        seasons.forEach((season, index) => {
            const viewport = createViewport(season, index);
            viewports.push(viewport);
            quadContainer.appendChild(viewport.container);
        });
        
        // 同步初始相机位置
        syncCameraFromMain();
    }

    /**
     * 创建单个视口
     */
    function createViewport(season, index) {
        // 创建视口容器
        const bgColor = mainScene ? mainScene.background.getHex() : 0xd8e8f5;
        const vpContainer = document.createElement('div');
        vpContainer.style.cssText = `
            position: relative;
            width: 100%;
            height: 100%;
            overflow: hidden;
            background: #${bgColor.toString(16).padStart(6, '0')};
        `;
        
        // 创建标签
        const label = document.createElement('div');
        label.className = 'season-label';
        const lang = window.i18n ? window.i18n.getCurrentLanguage() : 'zh';
        label.textContent = lang === 'zh' ? season.label : season.labelEn;
        label.style.cssText = `
            position: absolute;
            top: 10px;
            left: 10px;
            background: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 8px 16px;
            border-radius: 8px;
            font-weight: bold;
            font-size: 14px;
            z-index: 10;
            pointer-events: none;
        `;
        vpContainer.appendChild(label);
        
        // 创建时间显示
        const timeDisplay = document.createElement('div');
        timeDisplay.className = 'time-display';
        timeDisplay.textContent = formatTime(currentTime);
        timeDisplay.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 13px;
            z-index: 10;
            pointer-events: none;
        `;
        vpContainer.appendChild(timeDisplay);
        
        // 创建渲染器
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        vpContainer.appendChild(renderer.domElement);
        
        // 创建相机
        const camera = new THREE.PerspectiveCamera(
            mainCamera.fov,
            1, // 临时值，会在resize中更新
            mainCamera.near,
            mainCamera.far
        );
        camera.position.copy(mainCamera.position);
        camera.rotation.copy(mainCamera.rotation);
        
        // 创建控制器
        const controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.maxPolarAngle = Math.PI / 2 - 0.1;
        
        // 绑定相机同步事件
        controls.addEventListener('change', () => {
            if (!isSyncing) {
                syncCameras(index);
            }
        });
        
        // 创建场景副本
        const scene = createSceneCopy(season);
        
        // 创建视口对象
        const viewport = {
            index,
            season,
            container: vpContainer,
            renderer,
            camera,
            controls,
            scene,
            label,
            timeDisplay,
            sunLight: null,
            ambientLight: null
        };
        
        // 初始化光照
        initViewportLighting(viewport);
        
        // 更新太阳位置
        updateViewportSun(viewport, currentTime);
        
        // 初始调整大小
        updateViewportSize(viewport);
        
        return viewport;
    }

    /**
     * 创建场景副本
     */
    function createSceneCopy(season) {
        const scene = new THREE.Scene();
        // 使用与主场景相同的配置
        const bgColor = mainScene ? mainScene.background.getHex() : 0xd8e8f5;
        const fogColor = mainScene && mainScene.fog ? mainScene.fog.color.getHex() : 0xd8e8f5;
        const fogNear = mainScene && mainScene.fog ? mainScene.fog.near : 120;
        const fogFar = mainScene && mainScene.fog ? mainScene.fog.far : 1500;
        
        scene.background = new THREE.Color(bgColor);
        scene.fog = new THREE.Fog(fogColor, fogNear, fogFar);
        
        // 复制地面
        mainScene.children.forEach(child => {
            if (child.geometry && child.geometry.type === 'PlaneGeometry') {
                const ground = child.clone();
                scene.add(ground);
            } else if (child.type === 'GridHelper') {
                const grid = child.clone();
                scene.add(grid);
            } else if (child.name === 'compassGroup') {
                const compass = child.clone();
                scene.add(compass);
            }
        });
        
        // 添加建筑物
        if (buildingsData && buildingsData.buildings) {
            loadBuildingsIntoScene(scene, buildingsData);
        }
        
        return scene;
    }

    /**
     * 加载建筑物到场景
     */
    function loadBuildingsIntoScene(scene, data) {
        // 从主场景复制建筑物组
        if (mainScene) {
            mainScene.traverse(child => {
                if (child.name === 'buildingsGroup') {
                    const buildingsCopy = child.clone();
                    scene.add(buildingsCopy);
                }
            });
        }
    }

    /**
     * 初始化视口光照
     */
    function initViewportLighting(viewport) {
        // 创建太阳光 - 使用默认配置
        const sunLight = new THREE.DirectionalLight(0xffffff, 0.9);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.width = 2048;
        sunLight.shadow.mapSize.height = 2048;
        sunLight.shadow.bias = -0.0001;
        const d = 500;
        sunLight.shadow.camera.left = -d;
        sunLight.shadow.camera.right = d;
        sunLight.shadow.camera.top = d;
        sunLight.shadow.camera.bottom = -d;
        sunLight.shadow.camera.near = 1;
        sunLight.shadow.camera.far = 2000;
        viewport.scene.add(sunLight);
        viewport.sunLight = sunLight;
        
        // 创建环境光 - 使用默认配置
        const ambientLight = new THREE.AmbientLight(0x9fb3c8, 0.42);
        viewport.scene.add(ambientLight);
        viewport.ambientLight = ambientLight;
    }

    /**
     * 更新视口太阳位置
     */
    function updateViewportSun(viewport, hour) {
        const decl = viewport.season.declination;
        
        const rad = Math.PI / 180;
        const hAngle = (hour - 12) * 15 * rad;
        const lat = latitude * rad;
        const dec = decl * rad;
        
        const sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hAngle);
        const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
        
        if (alt > 0) {
            const cosAz = (sinAlt * Math.sin(lat) - Math.sin(dec)) / (Math.cos(alt) * Math.cos(lat));
            let az = Math.acos(Math.min(1, Math.max(-1, cosAz)));
            if (hour >= 12) az = -az;
            
            const dist = 800;
            const y = dist * Math.sin(alt);
            const r = dist * Math.cos(alt);
            const x = r * Math.sin(az);
            const z = r * Math.cos(az);
            
            viewport.sunLight.position.set(x, y, z);
            viewport.sunLight.intensity = 0.9;
            
            // 根据太阳高度调整光照强度
            const altDeg = alt * 180 / Math.PI;
            const intensity = 0.3 + (altDeg / 90) * 0.6;
            viewport.sunLight.intensity = intensity;
            viewport.ambientLight.intensity = 0.3 + (altDeg / 90) * 0.3;
        } else {
            viewport.sunLight.intensity = 0;
            viewport.ambientLight.intensity = 0.15;
        }
    }

    /**
     * 同步所有相机
     */
    function syncCameras(sourceIndex) {
        isSyncing = true;
        
        const sourceViewport = viewports[sourceIndex];
        
        viewports.forEach((vp, index) => {
            if (index !== sourceIndex) {
                vp.camera.position.copy(sourceViewport.camera.position);
                vp.camera.rotation.copy(sourceViewport.camera.rotation);
                vp.camera.zoom = sourceViewport.camera.zoom;
                vp.camera.updateProjectionMatrix();
                vp.controls.target.copy(sourceViewport.controls.target);
                vp.controls.update();
            }
        });
        
        // 同时同步主相机
        mainCamera.position.copy(sourceViewport.camera.position);
        mainCamera.rotation.copy(sourceViewport.camera.rotation);
        mainControls.target.copy(sourceViewport.controls.target);
        mainControls.update();
        
        isSyncing = false;
    }

    /**
     * 从主相机同步
     */
    function syncCameraFromMain() {
        isSyncing = true;
        
        viewports.forEach(vp => {
            vp.camera.position.copy(mainCamera.position);
            vp.camera.rotation.copy(mainCamera.rotation);
            vp.controls.target.copy(mainControls.target);
            vp.controls.update();
        });
        
        isSyncing = false;
    }

    /**
     * 绑定同步控制
     */
    function bindSyncControls() {
        // 窗口大小改变时更新所有视口
        window.addEventListener('resize', onWindowResize);
    }

    /**
     * 窗口大小改变处理
     */
    function onWindowResize() {
        viewports.forEach(vp => {
            updateViewportSize(vp);
        });
    }

    /**
     * 更新视口大小
     */
    function updateViewportSize(viewport) {
        const rect = viewport.container.getBoundingClientRect();
        viewport.renderer.setSize(rect.width, rect.height);
        viewport.camera.aspect = rect.width / rect.height;
        viewport.camera.updateProjectionMatrix();
    }

    /**
     * 动画循环
     */
    function animate() {
        if (!isActive) return;
        
        requestAnimationFrame(animate);
        
        viewports.forEach(vp => {
            vp.controls.update();
            vp.renderer.render(vp.scene, vp.camera);
        });
    }

    /**
     * 设置时间（所有视口同步）
     */
    function setTime(hour) {
        currentTime = hour;
        
        viewports.forEach(vp => {
            updateViewportSun(vp, hour);
            vp.timeDisplay.textContent = formatTime(hour);
        });
    }

    /**
     * 获取当前时间
     */
    function getTime() {
        return currentTime;
    }

    /**
     * 开始同步播放
     */
    function startPlay() {
        if (isPlaying) return;
        
        isPlaying = true;
        playInterval = setInterval(() => {
            currentTime += 0.05;
            if (currentTime > 18) {
                currentTime = 6;
            }
            setTime(currentTime);
        }, 100);
    }

    /**
     * 停止播放
     */
    function stopPlay() {
        isPlaying = false;
        if (playInterval) {
            clearInterval(playInterval);
            playInterval = null;
        }
    }

    /**
     * 切换播放状态
     */
    function togglePlay() {
        if (isPlaying) {
            stopPlay();
        } else {
            startPlay();
        }
        return isPlaying;
    }

    /**
     * 格式化时间显示
     */
    function formatTime(hour) {
        const h = Math.floor(hour);
        const m = Math.floor((hour - h) * 60);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    /**
     * 检查是否处于激活状态
     */
    function checkIsActive() {
        return isActive;
    }

    /**
     * 获取季节配置
     */
    function getSeasons() {
        return Seasons;
    }

    // 公开API
    return {
        init,
        toggle,
        activate,
        deactivate,
        setTime,
        getTime,
        startPlay,
        stopPlay,
        togglePlay,
        isActive: checkIsActive,
        getSeasons
    };
})();

// 兼容 CommonJS 模块系统
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SeasonCompare;
}
