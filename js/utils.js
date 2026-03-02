/**
 * 工具函数模块
 * Utility Functions Module
 * 
 * @description 提供通用的工具函数，避免代码重复
 * @author Building Sunlight Simulator Team
 * @version 1.0.0
 */

const Utils = (function() {
    'use strict';

    /**
     * 计算两点之间的距离
     * @param {Object} a - 点A {x, y}
     * @param {Object} b - 点B {x, y}
     * @returns {number} 距离
     */
    function distance(a, b) {
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    /**
     * 判断两点是否相等
     * @param {Object} a - 点A {x, y}
     * @param {Object} b - 点B {x, y}
     * @param {number} epsilon - 误差范围
     * @returns {boolean}
     */
    function pointsEqual(a, b, epsilon = 0) {
        if (!a || !b) return false;
        if (epsilon > 0) return distance(a, b) <= epsilon;
        return a.x === b.x && a.y === b.y;
    }

    /**
     * 限制整数值在指定范围内
     * @param {number} value - 输入值
     * @param {number} min - 最小值
     * @param {number} max - 最大值
     * @param {number} fallback - 无效时的默认值
     * @returns {number}
     */
    function clampInt(value, min, max, fallback) {
        if (Number.isNaN(value)) return fallback;
        return Math.min(Math.max(Math.round(value), min), max);
    }

    /**
     * 限制浮点数值在指定范围内
     * @param {number} value - 输入值
     * @param {number} min - 最小值
     * @param {number} max - 最大值
     * @param {number} fallback - 无效时的默认值
     * @returns {number}
     */
    function clampFloat(value, min, max, fallback) {
        if (Number.isNaN(value)) return fallback;
        return Math.min(Math.max(value, min), max);
    }

    /**
     * 保留指定小数位数
     * @param {number} value - 输入值
     * @param {number} decimals - 小数位数
     * @returns {number}
     */
    function roundTo(value, decimals = 2) {
        const multiplier = Math.pow(10, decimals);
        return Math.round(value * multiplier) / multiplier;
    }

    /**
     * 格式化时间显示
     * @param {number} hour - 小时数（可以是小数）
     * @returns {string} 格式化的时间字符串 (HH:MM)
     */
    function formatTime(hour) {
        const h = Math.floor(hour);
        const m = Math.floor((hour - h) * 60);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    /**
     * 防抖函数
     * @param {Function} func - 要防抖的函数
     * @param {number} wait - 等待时间（毫秒）
     * @returns {Function}
     */
    function debounce(func, wait = 300) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * 节流函数
     * @param {Function} func - 要节流的函数
     * @param {number} limit - 时间限制（毫秒）
     * @returns {Function}
     */
    function throttle(func, limit = 300) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    /**
     * 深拷贝对象
     * @param {*} obj - 要拷贝的对象
     * @returns {*}
     */
    function deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj.getTime());
        if (obj instanceof Array) return obj.map(item => deepClone(item));
        if (obj instanceof Object) {
            const clonedObj = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    clonedObj[key] = deepClone(obj[key]);
                }
            }
            return clonedObj;
        }
    }

    /**
     * 计算多边形中心点
     * @param {Array} points - 点数组 [{x, y}, ...]
     * @returns {Object} 中心点 {x, y}
     */
    function getPolygonCenter(points) {
        if (!points || points.length === 0) return { x: 0, y: 0 };
        
        let x = 0, y = 0;
        points.forEach(p => {
            x += p.x;
            y += p.y;
        });
        
        return {
            x: x / points.length,
            y: y / points.length
        };
    }

    /**
     * 计算多边形面积
     * @param {Array} points - 点数组 [{x, y}, ...]
     * @returns {number} 面积
     */
    function getPolygonArea(points) {
        if (!points || points.length < 3) return 0;
        
        let area = 0;
        for (let i = 0; i < points.length; i++) {
            const j = (i + 1) % points.length;
            area += points[i].x * points[j].y;
            area -= points[j].x * points[i].y;
        }
        
        return Math.abs(area / 2);
    }

    /**
     * 验证 JSON 数据格式
     * @param {Object} data - 要验证的数据
     * @returns {Object} {valid: boolean, errors: string[]}
     */
    function validateBuildingData(data) {
        const errors = [];
        
        if (!data) {
            errors.push('Data is null or undefined');
            return { valid: false, errors };
        }
        
        if (typeof data.latitude !== 'number' || isNaN(data.latitude)) {
            errors.push('Invalid latitude');
        }
        
        if (typeof data.scaleRatio !== 'number' || data.scaleRatio <= 0) {
            errors.push('Invalid scaleRatio');
        }
        
        if (!Array.isArray(data.buildings)) {
            errors.push('Buildings must be an array');
        } else {
            data.buildings.forEach((b, i) => {
                if (!b.name) errors.push(`Building ${i}: missing name`);
                if (!Array.isArray(b.shape) || b.shape.length < 3) {
                    errors.push(`Building ${i}: invalid shape`);
                }
                if (typeof b.floors !== 'number' || b.floors < 1) {
                    errors.push(`Building ${i}: invalid floors`);
                }
            });
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * 下载文件
     * @param {string} content - 文件内容
     * @param {string} filename - 文件名
     * @param {string} mimeType - MIME 类型
     */
    function downloadFile(content, filename, mimeType = 'text/plain') {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    /**
     * 显示加载提示
     * @param {string} message - 提示信息
     * @returns {Function} 关闭函数
     */
    function showLoading(message = 'Loading...') {
        const overlay = document.createElement('div');
        overlay.id = 'loading-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
        `;
        
        const content = document.createElement('div');
        content.style.cssText = `
            background: white;
            padding: 20px 40px;
            border-radius: 8px;
            font-size: 16px;
        `;
        content.textContent = message;
        
        overlay.appendChild(content);
        document.body.appendChild(overlay);
        
        return function close() {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        };
    }

    /**
     * 计算一年中的第几天
     * @param {Date} date - 日期对象
     * @returns {number} 一年中的第几天 (1-365/366)
     */
    function getDayOfYear(date) {
        const start = new Date(date.getFullYear(), 0, 0);
        const diff = date - start;
        const oneDay = 1000 * 60 * 60 * 24;
        return Math.floor(diff / oneDay);
    }

    /**
     * 根据日期计算太阳赤纬角
     * @param {Date|string} date - 日期对象或日期字符串 (YYYY-MM-DD)
     * @returns {number} 太阳赤纬角（度）
     * @description 使用简化公式：δ = 23.45° × sin(360° × (284 + N) / 365)
     */
    function calculateSolarDeclination(date) {
        const dateObj = typeof date === 'string' ? new Date(date) : date;
        const dayOfYear = getDayOfYear(dateObj);
        
        // 简化的太阳赤纬角计算公式
        // δ = 23.45° × sin(360° × (284 + N) / 365)
        // 其中 N 是一年中的第几天
        const angle = 360 * (284 + dayOfYear) / 365;
        const declination = 23.45 * Math.sin(angle * Math.PI / 180);
        
        return roundTo(declination, 2);
    }

    /**
     * 格式化日期为 YYYY-MM-DD
     * @param {Date} date - 日期对象
     * @returns {string} 格式化的日期字符串
     */
    function formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * 获取当前年份的节气日期
     * @param {string} solarTerm - 节气类型 ('winter'|'spring'|'autumn'|'summer')
     * @returns {string} 日期字符串 YYYY-MM-DD
     */
    function getSolarTermDate(solarTerm) {
        const year = new Date().getFullYear();
        const dates = {
            'winter': `${year}-12-22`,
            'spring': `${year}-03-20`,
            'autumn': `${year}-09-23`,
            'summer': `${year}-06-21`
        };
        return dates[solarTerm] || dates.winter;
    }

    // 公开 API
    return {
        distance,
        pointsEqual,
        clampInt,
        clampFloat,
        roundTo,
        formatTime,
        debounce,
        throttle,
        deepClone,
        getPolygonCenter,
        getPolygonArea,
        validateBuildingData,
        downloadFile,
        showLoading,
        getDayOfYear,
        calculateSolarDeclination,
        formatDate,
        getSolarTermDate
    };
})();

// 兼容 CommonJS 模块系统
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Utils;
}
