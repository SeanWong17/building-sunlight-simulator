/**
 * 天气系统模块
 * Weather System Module
 * 
 * @description 提供多种天气效果（晴天/多云/阴天/雨天/雪天），影响光照和环境
 * @author Building Sunlight Simulator Team
 * @version 1.0.0
 */

const WeatherSystem = (function() {
    'use strict';

    // 天气类型
    const WeatherType = {
        SUNNY: 'sunny',
        CLOUDY: 'cloudy',
        OVERCAST: 'overcast',
        RAINY: 'rainy',
        SNOWY: 'snowy'
    };

    // 模块状态
    let currentWeather = WeatherType.SUNNY;
    let scene = null;
    let camera = null;
    let renderer = null;
    let sunLight = null;
    let ambientLight = null;
    let particleSystem = null;
    let fogMesh = null;
    
    // 动画ID
    let animationId = null;
    
    // 天气配置
    const weatherConfig = {
        [WeatherType.SUNNY]: {
            sunIntensity: 0.9,
            ambientIntensity: 0.42,
            ambientColor: 0x9fb3c8,
            backgroundColor: 0xd8e8f5,
            fogColor: 0xd8e8f5,
            fogDensity: 0.001,
            hasParticles: false,
            hasFog: false
        },
        [WeatherType.CLOUDY]: {
            sunIntensity: 0.6,
            ambientIntensity: 0.55,
            ambientColor: 0xb8c5d1,
            backgroundColor: 0xc8d8e5,
            fogColor: 0xc8d8e5,
            fogDensity: 0.003,
            hasParticles: false,
            hasFog: true
        },
        [WeatherType.OVERCAST]: {
            sunIntensity: 0.35,
            ambientIntensity: 0.7,
            ambientColor: 0x9ca8b3,
            backgroundColor: 0xa8b8c5,
            fogColor: 0xa8b8c5,
            fogDensity: 0.005,
            hasParticles: false,
            hasFog: false
        },
        [WeatherType.RAINY]: {
            sunIntensity: 0.25,
            ambientIntensity: 0.6,
            ambientColor: 0x8a94a0,
            backgroundColor: 0x8a9aaa,
            fogColor: 0x8a9aaa,
            fogDensity: 0.008,
            hasParticles: true,
            particleCount: 8000,
            particleType: 'rain',
            hasFog: true
        },
        [WeatherType.SNOWY]: {
            sunIntensity: 0.4,
            ambientIntensity: 0.65,
            ambientColor: 0xc5d0d8,
            backgroundColor: 0xd0dce8,
            fogColor: 0xd0dce8,
            fogDensity: 0.006,
            hasParticles: true,
            particleCount: 5000,
            particleType: 'snow',
            hasFog: true
        }
    };

    /**
     * 初始化天气系统
     */
    function init(threeScene, threeCamera, threeRenderer, sun, ambient) {
        scene = threeScene;
        camera = threeCamera;
        renderer = threeRenderer;
        sunLight = sun;
        ambientLight = ambient;
        
        // 创建粒子系统组
        particleSystem = new THREE.Group();
        particleSystem.name = 'weatherParticles';
        scene.add(particleSystem);
        
        return true;
    }

    /**
     * 设置天气
     */
    function setWeather(weatherType) {
        if (!weatherConfig[weatherType]) {
            console.warn(`Unknown weather type: ${weatherType}`);
            return false;
        }
        
        currentWeather = weatherType;
        const config = weatherConfig[weatherType];
        
        // 更新光照
        updateLighting(config);
        
        // 更新背景和雾
        updateEnvironment(config);
        
        // 更新粒子效果
        updateParticles(config);
        
        // 更新体积雾
        updateVolumetricFog(config);
        
        return true;
    }

    /**
     * 更新光照
     */
    function updateLighting(config) {
        if (sunLight) {
            // 使用平滑过渡
            animateValue(sunLight, 'intensity', config.sunIntensity, 1000);
        }
        
        if (ambientLight) {
            animateValue(ambientLight, 'intensity', config.ambientIntensity, 1000);
            ambientLight.color.setHex(config.ambientColor);
        }
    }

    /**
     * 更新环境（背景和雾）
     */
    function updateEnvironment(config) {
        if (scene) {
            scene.background.setHex(config.backgroundColor);
            if (scene.fog) {
                scene.fog.color.setHex(config.fogColor);
                scene.fog.density = config.fogDensity;
            }
        }
    }

    /**
     * 更新粒子效果
     */
    function updateParticles(config) {
        // 清除现有粒子
        clearParticles();
        
        if (!config.hasParticles) {
            return;
        }
        
        if (config.particleType === 'rain') {
            createRainParticles(config.particleCount);
        } else if (config.particleType === 'snow') {
            createSnowParticles(config.particleCount);
        }
    }

    /**
     * 创建雨粒子
     */
    function createRainParticles(count) {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const velocities = new Float32Array(count);
        
        for (let i = 0; i < count; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 1000;
            positions[i * 3 + 1] = Math.random() * 500 + 100;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 1000;
            velocities[i] = Math.random() * 0.5 + 0.5;
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 1));
        
        const material = new THREE.PointsMaterial({
            color: 0xaaaaaa,
            size: 0.8,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending
        });
        
        const rain = new THREE.Points(geometry, material);
        rain.userData.isWeatherParticle = true;
        rain.userData.type = 'rain';
        particleSystem.add(rain);
        
        // 开始动画
        startParticleAnimation();
    }

    /**
     * 创建雪粒子
     */
    function createSnowParticles(count) {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const velocities = new Float32Array(count * 3);
        
        for (let i = 0; i < count; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 1000;
            positions[i * 3 + 1] = Math.random() * 500 + 100;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 1000;
            
            velocities[i * 3] = (Math.random() - 0.5) * 0.3;
            velocities[i * 3 + 1] = -(Math.random() * 0.3 + 0.2);
            velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
        
        // 创建雪的纹理
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        
        const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.5, 'rgba(255,255,255,0.5)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 32, 32);
        
        const texture = new THREE.CanvasTexture(canvas);
        
        const material = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 4,
            map: texture,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        
        const snow = new THREE.Points(geometry, material);
        snow.userData.isWeatherParticle = true;
        snow.userData.type = 'snow';
        particleSystem.add(snow);
        
        // 开始动画
        startParticleAnimation();
    }

    /**
     * 清除粒子
     */
    function clearParticles() {
        stopParticleAnimation();
        
        for (let i = particleSystem.children.length - 1; i >= 0; i--) {
            const obj = particleSystem.children[i];
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (obj.material.map) obj.material.map.dispose();
                obj.material.dispose();
            }
            particleSystem.remove(obj);
        }
    }

    /**
     * 开始粒子动画
     */
    function startParticleAnimation() {
        if (animationId) {
            cancelAnimationFrame(animationId);
        }
        
        function animate() {
            animationId = requestAnimationFrame(animate);
            
            particleSystem.children.forEach(particle => {
                if (particle.userData.type === 'rain') {
                    animateRain(particle);
                } else if (particle.userData.type === 'snow') {
                    animateSnow(particle);
                }
            });
        }
        
        animate();
    }

    /**
     * 停止粒子动画
     */
    function stopParticleAnimation() {
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
    }

    /**
     * 雨滴动画
     */
    function animateRain(particle) {
        const positions = particle.geometry.attributes.position.array;
        const velocities = particle.geometry.attributes.velocity.array;
        
        for (let i = 0; i < velocities.length; i++) {
            positions[i * 3 + 1] -= velocities[i] * 8;
            
            // 如果落到地面以下，重置到顶部
            if (positions[i * 3 + 1] < 0) {
                positions[i * 3 + 1] = 500 + Math.random() * 100;
                positions[i * 3] = camera.position.x + (Math.random() - 0.5) * 800;
                positions[i * 3 + 2] = camera.position.z + (Math.random() - 0.5) * 800;
            }
        }
        
        particle.geometry.attributes.position.needsUpdate = true;
    }

    /**
     * 雪花动画
     */
    function animateSnow(particle) {
        const positions = particle.geometry.attributes.position.array;
        const velocities = particle.geometry.attributes.velocity.array;
        
        for (let i = 0; i < velocities.length / 3; i++) {
            positions[i * 3] += velocities[i * 3] + Math.sin(Date.now() * 0.001 + i) * 0.02;
            positions[i * 3 + 1] += velocities[i * 3 + 1];
            positions[i * 3 + 2] += velocities[i * 3 + 2] + Math.cos(Date.now() * 0.001 + i) * 0.02;
            
            // 如果落到地面以下，重置到顶部
            if (positions[i * 3 + 1] < 0) {
                positions[i * 3 + 1] = 500 + Math.random() * 100;
                positions[i * 3] = camera.position.x + (Math.random() - 0.5) * 800;
                positions[i * 3 + 2] = camera.position.z + (Math.random() - 0.5) * 800;
            }
        }
        
        particle.geometry.attributes.position.needsUpdate = true;
    }

    /**
     * 更新体积雾效果
     */
    function updateVolumetricFog(config) {
        // 移除现有的体积雾
        if (fogMesh) {
            scene.remove(fogMesh);
            fogMesh = null;
        }
        
        if (!config.hasFog) {
            return;
        }
        
        // 创建体积雾效果（使用半透明球体模拟）
        const geometry = new THREE.SphereGeometry(800, 32, 32);
        const material = new THREE.MeshBasicMaterial({
            color: config.fogColor,
            transparent: true,
            opacity: 0.15,
            side: THREE.BackSide,
            depthWrite: false
        });
        
        fogMesh = new THREE.Mesh(geometry, material);
        fogMesh.position.copy(camera.position);
        fogMesh.userData.isWeatherFog = true;
        scene.add(fogMesh);
    }

    /**
     * 更新体积雾位置（跟随相机）
     */
    function updateFogPosition() {
        if (fogMesh && camera) {
            fogMesh.position.copy(camera.position);
        }
    }

    /**
     * 数值动画
     */
    function animateValue(target, property, endValue, duration) {
        const startValue = target[property];
        const startTime = Date.now();
        
        function update() {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // 使用缓动函数
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            target[property] = startValue + (endValue - startValue) * easeProgress;
            
            if (progress < 1) {
                requestAnimationFrame(update);
            }
        }
        
        update();
    }

    /**
     * 获取当前天气
     */
    function getCurrentWeather() {
        return currentWeather;
    }

    /**
     * 获取所有天气类型
     */
    function getWeatherTypes() {
        return WeatherType;
    }

    /**
     * 获取天气显示名称
     */
    function getWeatherDisplayName(weatherType, lang = 'zh') {
        const names = {
            zh: {
                [WeatherType.SUNNY]: '晴天',
                [WeatherType.CLOUDY]: '多云',
                [WeatherType.OVERCAST]: '阴天',
                [WeatherType.RAINY]: '雨天',
                [WeatherType.SNOWY]: '雪天'
            },
            en: {
                [WeatherType.SUNNY]: 'Sunny',
                [WeatherType.CLOUDY]: 'Cloudy',
                [WeatherType.OVERCAST]: 'Overcast',
                [WeatherType.RAINY]: 'Rainy',
                [WeatherType.SNOWY]: 'Snowy'
            }
        };
        
        return names[lang]?.[weatherType] || weatherType;
    }

    /**
     * 销毁天气系统
     */
    function destroy() {
        stopParticleAnimation();
        clearParticles();
        
        if (fogMesh && scene) {
            scene.remove(fogMesh);
            fogMesh = null;
        }
        
        if (particleSystem && scene) {
            scene.remove(particleSystem);
        }
        
        scene = null;
        camera = null;
        renderer = null;
        sunLight = null;
        ambientLight = null;
    }

    // 公开API
    return {
        init,
        setWeather,
        getCurrentWeather,
        getWeatherTypes,
        getWeatherDisplayName,
        updateFogPosition,
        destroy
    };
})();

// 兼容 CommonJS 模块系统
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WeatherSystem;
}
