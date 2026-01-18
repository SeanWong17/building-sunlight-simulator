/**
 * 城市纬度数据库
 * 包含中国主要城市及部分国际城市
 */
const CITY_DATA = {
    // 中国城市 - 按区域分组
    china: {
        label: '🇨🇳 中国城市',
        cities: [
            { name: '北京', lat: 39.90 },
            { name: '上海', lat: 31.23 },
            { name: '广州', lat: 23.13 },
            { name: '深圳', lat: 22.54 },
            { name: '天津', lat: 39.13 },
            { name: '重庆', lat: 29.56 },
            { name: '成都', lat: 30.57 },
            { name: '杭州', lat: 30.27 },
            { name: '武汉', lat: 30.58 },
            { name: '南京', lat: 32.06 },
            { name: '西安', lat: 34.27 },
            { name: '苏州', lat: 31.30 },
            { name: '郑州', lat: 34.75 },
            { name: '长沙', lat: 28.23 },
            { name: '青岛', lat: 36.07 },
            { name: '济南', lat: 36.65 },
            { name: '沈阳', lat: 41.80 },
            { name: '大连', lat: 38.91 },
            { name: '哈尔滨', lat: 45.75 },
            { name: '长春', lat: 43.88 },
            { name: '厦门', lat: 24.48 },
            { name: '福州', lat: 26.08 },
            { name: '合肥', lat: 31.86 },
            { name: '昆明', lat: 25.04 },
            { name: '贵阳', lat: 26.58 },
            { name: '南昌', lat: 28.68 },
            { name: '南宁', lat: 22.82 },
            { name: '石家庄', lat: 38.04 },
            { name: '太原', lat: 37.87 },
            { name: '兰州', lat: 36.06 },
            { name: '西宁', lat: 36.62 },
            { name: '银川', lat: 38.47 },
            { name: '呼和浩特', lat: 40.84 },
            { name: '乌鲁木齐', lat: 43.83 },
            { name: '拉萨', lat: 29.65 },
            { name: '海口', lat: 20.04 },
            { name: '三亚', lat: 18.25 },
            { name: '珠海', lat: 22.27 },
            { name: '无锡', lat: 31.49 },
            { name: '宁波', lat: 29.87 },
            { name: '温州', lat: 28.00 },
            { name: '东莞', lat: 23.02 },
            { name: '佛山', lat: 23.02 },
            { name: '烟台', lat: 37.46 },
            { name: '威海', lat: 37.51 },
            { name: '洛阳', lat: 34.62 },
            { name: '徐州', lat: 34.26 },
            { name: '常州', lat: 31.79 },
            { name: '扬州', lat: 32.39 },
            { name: '绍兴', lat: 30.00 },
        ]
    },
    // 国际城市
    international: {
        label: '🌍 国际城市',
        cities: [
            { name: '东京', lat: 35.68 },
            { name: '首尔', lat: 37.57 },
            { name: '新加坡', lat: 1.35 },
            { name: '曼谷', lat: 13.76 },
            { name: '悉尼', lat: -33.87 },
            { name: '墨尔本', lat: -37.81 },
            { name: '纽约', lat: 40.71 },
            { name: '洛杉矶', lat: 34.05 },
            { name: '伦敦', lat: 51.51 },
            { name: '巴黎', lat: 48.86 },
            { name: '柏林', lat: 52.52 },
            { name: '迪拜', lat: 25.20 },
            { name: '莫斯科', lat: 55.76 },
            { name: '多伦多', lat: 43.65 },
            { name: '温哥华', lat: 49.28 },
        ]
    }
};

/**
 * 获取所有城市的扁平列表
 * @returns {Array<{name: string, lat: number, group: string}>}
 */
function getAllCities() {
    const result = [];
    for (const [groupKey, group] of Object.entries(CITY_DATA)) {
        for (const city of group.cities) {
            result.push({
                name: city.name,
                lat: city.lat,
                group: group.label
            });
        }
    }
    return result;
}

/**
 * 根据城市名查找纬度
 * @param {string} cityName 
 * @returns {number|null}
 */
function getLatitudeByCity(cityName) {
    for (const group of Object.values(CITY_DATA)) {
        const city = group.cities.find(c => c.name === cityName);
        if (city) return city.lat;
    }
    return null;
}

/**
 * 生成城市选择器的 HTML options
 * @param {string} selectedCity 当前选中的城市名
 * @returns {string} HTML字符串
 */
function generateCityOptions(selectedCity = '') {
    let html = '<option value="">-- 选择城市 --</option>';
    
    for (const [groupKey, group] of Object.entries(CITY_DATA)) {
        html += `<optgroup label="${group.label}">`;
        for (const city of group.cities) {
            const selected = city.name === selectedCity ? 'selected' : '';
            html += `<option value="${city.name}" data-lat="${city.lat}" ${selected}>${city.name} (${city.lat}°)</option>`;
        }
        html += '</optgroup>';
    }
    
    return html;
}

// 导出（如果是模块环境）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CITY_DATA, getAllCities, getLatitudeByCity, generateCityOptions };
}