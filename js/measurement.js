/**
 * 楼间距测量工具模块
 * Building Distance Measurement Tool Module
 * 
 * @description 提供实时楼间距测量、日照间距合规检测、遮挡范围高亮等功能
 * @author Building Sunlight Simulator Team
 * @version 1.0.0
 */

const MeasurementTool = (function() {
    'use strict';

    // 模块状态
    let isActive = false;
    let selectedBuildings = [];
    let measurementGroup = null;
    let highlightGroup = null;
    let scene = null;
    let camera = null;
    let renderer = null;
    let buildingsGroup = null;
    let raycaster = null;
    let mouse = null;
    
    // 测量结果
    let currentMeasurement = null;
    
    // 配置
    const CONFIG = {
        LINE_COLOR: 0x00ff00,
        LINE_COLOR_NON_COMPLIANT: 0xff0000,
        HIGHLIGHT_COLOR: 0xffaa00,
        LABEL_BG_COLOR: 'rgba(0, 0, 0, 0.8)',
        COMPLIANT_RATIO: 1.2, // 日照间距系数（根据纬度调整）
        MIN_SPACING_RATIO: 1.0 // 最小间距系数
    };

    /**
     * 初始化测量工具
     */
    function init(threeScene, threeCamera, threeRenderer, bldgGroup) {
        scene = threeScene;
        camera = threeCamera;
        renderer = threeRenderer;
        buildingsGroup = bldgGroup;
        
        // 创建测量组
        measurementGroup = new THREE.Group();
        measurementGroup.name = 'measurementGroup';
        scene.add(measurementGroup);
        
        // 创建高亮组
        highlightGroup = new THREE.Group();
        highlightGroup.name = 'highlightGroup';
        scene.add(highlightGroup);
        
        // 初始化射线检测
        raycaster = new THREE.Raycaster();
        mouse = new THREE.Vector2();
        
        return true;
    }

    /**
     * 激活/停用测量工具
     */
    function toggle() {
        isActive = !isActive;
        if (!isActive) {
            clearMeasurement();
        } else {
            selectedBuildings = [];
        }
        return isActive;
    }

    /**
     * 检查是否处于激活状态
     */
    function isToolActive() {
        return isActive;
    }

    /**
     * 处理点击事件
     */
    function handleClick(event) {
        if (!isActive || !scene) return false;
        
        const rect = renderer.domElement.getBoundingClientRect();
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
        
        raycaster.setFromCamera(mouse, camera);
        
        // 检测建筑物点击
        const intersects = raycaster.intersectObjects(buildingsGroup.children, true);
        
        if (intersects.length > 0) {
            // 找到被点击的建筑物组
            let target = intersects[0].object;
            while (target.parent && target.parent !== buildingsGroup) {
                target = target.parent;
            }
            
            if (target.userData && target.userData.buildingIndex !== undefined) {
                selectBuilding(target);
                return true;
            }
        }
        
        return false;
    }

    /**
     * 选择建筑物
     */
    function selectBuilding(building) {
        // 如果已经选中了这个建筑，不做任何事
        if (selectedBuildings.find(b => b.userData.buildingIndex === building.userData.buildingIndex)) {
            return;
        }
        
        selectedBuildings.push(building);
        
        // 高亮选中的建筑
        highlightBuilding(building, selectedBuildings.length === 1 ? 0x00ff00 : 0x0000ff);
        
        // 如果选中了两个建筑，进行测量
        if (selectedBuildings.length >= 2) {
            performMeasurement();
            // 重置选择，但保留测量结果显示
            setTimeout(() => {
                selectedBuildings = [];
                clearHighlights();
            }, 100);
        }
    }

    /**
     * 高亮建筑物
     */
    function highlightBuilding(building, color) {
        const box = new THREE.Box3().setFromObject(building);
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);
        
        // 创建高亮框
        const geometry = new THREE.BoxGeometry(size.x + 2, size.y + 2, size.z + 2);
        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.3,
            depthTest: false
        });
        
        const highlightMesh = new THREE.Mesh(geometry, material);
        highlightMesh.position.copy(center);
        highlightMesh.userData.isHighlight = true;
        highlightGroup.add(highlightMesh);
        
        // 添加边框
        const edges = new THREE.EdgesGeometry(geometry);
        const lineMaterial = new THREE.LineBasicMaterial({ 
            color: color, 
            linewidth: 2,
            depthTest: false
        });
        const line = new THREE.LineSegments(edges, lineMaterial);
        line.position.copy(center);
        line.userData.isHighlight = true;
        highlightGroup.add(line);
    }

    /**
     * 执行测量
     */
    function performMeasurement() {
        if (selectedBuildings.length < 2) return;
        
        const b1 = selectedBuildings[0];
        const b2 = selectedBuildings[1];
        
        // 获取建筑物的边界框
        const box1 = new THREE.Box3().setFromObject(b1);
        const box2 = new THREE.Box3().setFromObject(b2);
        
        // 计算两个建筑物之间的最短距离
        const distance = calculateBuildingDistance(box1, box2);
        
        // 获取建筑物高度
        const height1 = box1.max.y - box1.min.y;
        const height2 = box2.max.y - box2.min.y;
        const maxHeight = Math.max(height1, height2);
        
        // 计算日照间距要求（根据当前纬度）
        const latitude = window.LATITUDE || 36.65;
        const requiredSpacing = calculateRequiredSpacing(maxHeight, latitude);
        
        // 判断是否合规
        const isCompliant = distance.horizontal >= requiredSpacing;
        
        // 创建测量线
        createMeasurementLine(box1, box2, distance, isCompliant);
        
        // 创建距离标签
        createDistanceLabel(distance, box1, box2, isCompliant, requiredSpacing);
        
        // 如果遮挡影响，高亮显示
        if (!isCompliant) {
            highlightShadowImpact(box1, box2, distance);
        }
        
        // 保存测量结果
        currentMeasurement = {
            building1: b1.userData.name || `建筑${b1.userData.buildingIndex + 1}`,
            building2: b2.userData.name || `建筑${b2.userData.buildingIndex + 1}`,
            distance: distance.horizontal,
            height: maxHeight,
            requiredSpacing: requiredSpacing,
            isCompliant: isCompliant,
            latitude: latitude
        };
        
        // 触发回调
        if (typeof window.onMeasurementComplete === 'function') {
            window.onMeasurementComplete(currentMeasurement);
        }
    }

    /**
     * 计算两个建筑物之间的距离
     */
    function calculateBuildingDistance(box1, box2) {
        // 计算水平距离（在XZ平面）
        const dx = Math.max(0, Math.max(box1.min.x - box2.max.x, box2.min.x - box1.max.x));
        const dz = Math.max(0, Math.max(box1.min.z - box2.max.z, box2.min.z - box1.max.z));
        
        // 如果建筑物在水平方向上有重叠，计算中心点距离
        let horizontalDistance;
        if (dx === 0 && dz === 0) {
            const center1 = new THREE.Vector3();
            const center2 = new THREE.Vector3();
            box1.getCenter(center1);
            box2.getCenter(center2);
            center1.y = 0;
            center2.y = 0;
            horizontalDistance = center1.distanceTo(center2);
        } else {
            horizontalDistance = Math.sqrt(dx * dx + dz * dz);
        }
        
        // 计算3D空间距离
        const dy = Math.max(0, Math.max(box1.min.y - box2.max.y, box2.min.y - box1.max.y));
        const threeDDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        return {
            horizontal: horizontalDistance,
            vertical: dy,
            threeD: threeDDistance
        };
    }

    /**
     * 计算日照间距要求
     * 根据《城市居住区规划设计标准》GB 50180-2018
     */
    function calculateRequiredSpacing(height, latitude) {
        // 根据纬度确定日照间距系数
        // 纬度越高，系数越大
        let spacingRatio;
        
        const absLat = Math.abs(latitude);
        if (absLat < 24) {
            spacingRatio = 0.9; // 低纬度地区
        } else if (absLat < 32) {
            spacingRatio = 1.0; // 中低纬度
        } else if (absLat < 40) {
            spacingRatio = 1.2; // 中纬度（如济南36.65°）
        } else if (absLat < 48) {
            spacingRatio = 1.5; // 中高纬度
        } else {
            spacingRatio = 1.8; // 高纬度地区
        }
        
        return height * spacingRatio;
    }

    /**
     * 创建测量线
     */
    function createMeasurementLine(box1, box2, distance, isCompliant) {
        // 找到两个建筑物最近的点
        const center1 = new THREE.Vector3();
        const center2 = new THREE.Vector3();
        box1.getCenter(center1);
        box2.getCenter(center2);
        
        // 计算连接两建筑物中心的线
        const startPoint = center1.clone();
        const endPoint = center2.clone();
        startPoint.y = Math.max(box1.min.y, 5);
        endPoint.y = Math.max(box2.min.y, 5);
        
        // 创建3D测量线
        const points = [startPoint, endPoint];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
            color: isCompliant ? CONFIG.LINE_COLOR : CONFIG.LINE_COLOR_NON_COMPLIANT,
            linewidth: 3,
            depthTest: false
        });
        
        const line = new THREE.Line(geometry, material);
        line.userData.isMeasurement = true;
        line.renderOrder = 1000;
        measurementGroup.add(line);
        
        // 添加端点标记
        createEndpointMarker(startPoint, isCompliant ? CONFIG.LINE_COLOR : CONFIG.LINE_COLOR_NON_COMPLIANT);
        createEndpointMarker(endPoint, isCompliant ? CONFIG.LINE_COLOR : CONFIG.LINE_COLOR_NON_COMPLIANT);
    }

    /**
     * 创建端点标记
     */
    function createEndpointMarker(position, color) {
        const geometry = new THREE.SphereGeometry(1.5, 16, 16);
        const material = new THREE.MeshBasicMaterial({
            color: color,
            depthTest: false
        });
        const marker = new THREE.Mesh(geometry, material);
        marker.position.copy(position);
        marker.userData.isMeasurement = true;
        marker.renderOrder = 1001;
        measurementGroup.add(marker);
    }

    /**
     * 创建距离标签
     */
    function createDistanceLabel(distance, box1, box2, isCompliant, requiredSpacing) {
        const center1 = new THREE.Vector3();
        const center2 = new THREE.Vector3();
        box1.getCenter(center1);
        box2.getCenter(center2);
        
        const midPoint = new THREE.Vector3().addVectors(center1, center2).multiplyScalar(0.5);
        midPoint.y = Math.max(Math.max(box1.max.y, box2.max.y) + 10, 30);
        
        // 创建Canvas纹理
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        
        // 背景
        ctx.fillStyle = isCompliant ? 'rgba(0, 128, 0, 0.9)' : 'rgba(200, 0, 0, 0.9)';
        ctx.beginPath();
        ctx.roundRect(10, 10, 492, 236, 20);
        ctx.fill();
        
        // 边框
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 4;
        ctx.stroke();
        
        // 标题
        ctx.fillStyle = 'white';
        ctx.font = 'bold 36px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('楼间距测量', 256, 55);
        
        // 距离
        ctx.font = 'bold 48px Arial';
        ctx.fillText(`${distance.horizontal.toFixed(2)}m`, 256, 115);
        
        // 状态
        ctx.font = '28px Arial';
        if (isCompliant) {
            ctx.fillText('✓ 符合日照间距要求', 256, 160);
        } else {
            ctx.fillText(`✗ 不符合要求 (需≥${requiredSpacing.toFixed(1)}m)`, 256, 160);
        }
        
        // 高度信息
        ctx.font = '22px Arial';
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillText(`建筑高度: ${Math.max(box1.max.y-box1.min.y, box2.max.y-box2.min.y).toFixed(1)}m`, 256, 210);
        
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false
        });
        
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.position.copy(midPoint);
        sprite.scale.set(40, 20, 1);
        sprite.userData.isMeasurement = true;
        sprite.renderOrder = 1002;
        measurementGroup.add(sprite);
    }

    /**
     * 高亮显示遮挡影响范围
     */
    function highlightShadowImpact(box1, box2, distance) {
        // 计算遮挡区域（在两楼之间）
        const center1 = new THREE.Vector3();
        const center2 = new THREE.Vector3();
        box1.getCenter(center1);
        box2.getCenter(center2);
        
        // 创建遮挡区域可视化
        const direction = new THREE.Vector3().subVectors(center2, center1).normalize();
        const impactLength = distance.horizontal * 0.5;
        
        // 创建半透明区域表示遮挡影响
        const geometry = new THREE.PlaneGeometry(20, impactLength);
        const material = new THREE.MeshBasicMaterial({
            color: 0xff6600,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide,
            depthTest: false
        });
        
        const impactPlane = new THREE.Mesh(geometry, material);
        const midPoint = new THREE.Vector3().addVectors(center1, center2).multiplyScalar(0.5);
        impactPlane.position.copy(midPoint);
        impactPlane.position.y = 5;
        
        // 让平面朝向两楼连线方向
        impactPlane.lookAt(center2.x, 5, center2.z);
        impactPlane.rotateX(Math.PI / 2);
        
        impactPlane.userData.isMeasurement = true;
        impactPlane.renderOrder = 999;
        measurementGroup.add(impactPlane);
    }

    /**
     * 清除所有高亮
     */
    function clearHighlights() {
        for (let i = highlightGroup.children.length - 1; i >= 0; i--) {
            const obj = highlightGroup.children[i];
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(m => m && m.dispose && m.dispose());
                } else {
                    obj.material.dispose && obj.material.dispose();
                }
            }
            highlightGroup.remove(obj);
        }
    }

    /**
     * 清除测量结果
     */
    function clearMeasurement() {
        clearHighlights();
        
        for (let i = measurementGroup.children.length - 1; i >= 0; i--) {
            const obj = measurementGroup.children[i];
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(m => m && m.dispose && m.dispose());
                } else {
                    if (obj.material.map) obj.material.map.dispose();
                    obj.material.dispose && obj.material.dispose();
                }
            }
            measurementGroup.remove(obj);
        }
        
        selectedBuildings = [];
        currentMeasurement = null;
    }

    /**
     * 获取当前测量结果
     */
    function getCurrentMeasurement() {
        return currentMeasurement;
    }

    /**
     * 销毁工具
     */
    function destroy() {
        clearMeasurement();
        if (measurementGroup && scene) {
            scene.remove(measurementGroup);
        }
        if (highlightGroup && scene) {
            scene.remove(highlightGroup);
        }
        isActive = false;
        scene = null;
        camera = null;
        renderer = null;
        buildingsGroup = null;
    }

    // 公开API
    return {
        init,
        toggle,
        isToolActive,
        handleClick,
        clearMeasurement,
        getCurrentMeasurement,
        destroy,
        calculateRequiredSpacing
    };
})();

// 兼容 CommonJS 模块系统
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MeasurementTool;
}
