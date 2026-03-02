/**
 * 全局配置文件
 * Global Configuration
 * 
 * @description 统一管理项目中的常量和配置项
 * @author Building Sunlight Simulator Team
 * @version 1.0.0
 */

const CONFIG = (function() {
    'use strict';

    return {
        // 应用信息
        APP: {
            NAME: 'Building Sunlight Simulator',
            VERSION: '3.0.0',
            AUTHOR: 'seanwong17'
        },

        // 默认值
        DEFAULTS: {
            LATITUDE: 36.65,           // 默认纬度（济南）
            CITY: '济南',              // 默认城市
            FLOORS: 18,                // 默认层数
            FLOOR_HEIGHT: 3,           // 默认层高（米）
            UNITS_PER_FLOOR: 2,        // 默认每层户数
            IS_THIS_COMMUNITY: true,   // 默认标记为本小区
            SCALE_DISTANCE: 50,        // 默认比例尺距离（米）
            TIME_HOUR: 10,             // 默认时间（小时）
            SEASON: -23.44             // 默认季节（冬至）
        },

        // 太阳赤纬角
        SOLAR_DECLINATION: {
            WINTER_SOLSTICE: -23.44,   // 冬至
            EQUINOX: 0,                // 春分/秋分
            SUMMER_SOLSTICE: 23.44     // 夏至
        },

        // 节气日期（近似值，用于显示）
        SOLAR_TERMS_DATES: {
            WINTER_SOLSTICE: '12-22',  // 冬至
            SPRING_EQUINOX: '03-20',   // 春分
            AUTUMN_EQUINOX: '09-23',   // 秋分
            SUMMER_SOLSTICE: '06-21'   // 夏至
        },

        // 时间范围
        TIME: {
            MIN_HOUR: 6,               // 最小时间（6:00）
            MAX_HOUR: 18,              // 最大时间（18:00）
            STEP: 0.05                 // 时间滑块步长
        },

        // 日照分析
        SUNLIGHT_ANALYSIS: {
            TIME_INTERVAL: 0.1,        // 固定6分钟间隔
            WINDOW_HEIGHT_OFFSET: 1.2, // 窗户高度偏移（米）
            FLOOR_HEIGHT_RATIO: 0.4,   // 楼层高度比例
            MAX_HOURS: 8,              // 热力图最大显示时长（小时）- 行业标准
            STANDARD_HOURS: 2          // 日照标准时长（小时）
        },

        // 3D 场景配置
        SCENE: {
            BACKGROUND_COLOR: 0xd8e8f5,    // 优化后的背景色（更柔和的蓝灰色）
            FOG_COLOR: 0xd8e8f5,
            FOG_NEAR: 120,
            FOG_FAR: 1500,
            CAMERA_FOV: 45,
            CAMERA_NEAR: 1,
            CAMERA_FAR: 5000,
            CAMERA_POSITION: { x: 200, y: 260, z: 320 }
        },

        // 光照配置
        LIGHTING: {
            SUN_INTENSITY: 0.9,
            AMBIENT_INTENSITY: 0.42,
            AMBIENT_COLOR: 0x9fb3c8,
            SHADOW_MAP_SIZE: 4096,
            SHADOW_BIAS: -0.0001,
            // 动态光照调整参数
            MIN_SUN_INTENSITY: 0.75,     // 最小太阳光强度（提高冬季亮度）
            MAX_SUN_INTENSITY: 0.85,     // 最大太阳光强度
            MIN_AMBIENT_INTENSITY: 0.35, // 最小环境光强度（提高冬季亮度）
            MAX_AMBIENT_INTENSITY: 0.45  // 最大环境光强度
        },

        // 材质配置
        MATERIALS: {
            GROUND_COLOR: 0xc8ddf0,        // 地面颜色调暗（从 0xe6f3ff 改为更深的蓝灰色）
            ROOF_COLOR: 0xe8eaed,          // 楼顶颜色也稍微调暗
            BUILDING_COLOR: 0x9fb0c4,
            BUILDING_ROUGHNESS: 0.6,       // 降低粗糙度，增加反射
            NEIGHBOR_COLOR: 0xb7c2cf,
            NEIGHBOR_OPACITY: 0.92
        },

        // 编辑器配置
        EDITOR: {
            CLOSE_EPSILON: 8,          // 闭合多边形的像素阈值
            SANITIZE_EPSILON: 0.75,    // 多边形净化的像素阈值
            MIN_POLYGON_POINTS: 3,     // 最小多边形点数
            ZOOM_SPEED: 0.1,           // 缩放速度
            MIN_ZOOM: 0.1,             // 最小缩放比例
            MAX_ZOOM: 10,              // 最大缩放比例
            CANVAS_PADDING: 40         // 画布边距
        },

        // 验证范围
        VALIDATION: {
            LATITUDE: { MIN: -90, MAX: 90 },
            FLOORS: { MIN: 1, MAX: 300 },
            FLOOR_HEIGHT: { MIN: 1, MAX: 20 },
            UNITS: { MIN: 1, MAX: 50 }
        },

        // 本地存储键名
        STORAGE_KEYS: {
            LANGUAGE: 'buildingSunlight_lang'
        }
    };
})();

// 兼容 CommonJS 模块系统
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
