/**
 * 国际化 (i18n) 语言配置模块
 * Internationalization (i18n) Language Configuration Module
 * 
 * @description 提供中英文双语支持，自动检测浏览器语言，支持语言切换和持久化存储
 * @author Building Sunlight Simulator Team
 * @version 1.0.0
 */

const i18n = (function() {
    'use strict';

    // 私有变量
    let currentLang = 'zh';
    const STORAGE_KEY = 'buildingSunlight_lang';

    // 语言包配置
    const translations = {
        zh: {
            // 通用
            common: {
                north: '北',
                loading: '加载中',
                confirm: '确认',
                cancel: '取消',
                delete: '删除',
                save: '保存',
                export: '导出',
                import: '导入',
                close: '关闭',
                expand: '展开'
            },

            // 查看器 (index.html)
            viewer: {
                title: '楼盘采光可视化 - 日照模拟系统',
                emptyState: '请在右上角导入 JSON 配置文件',
                pageTitle: '☀️ 楼盘采光模拟',
                
                // 状态块
                statusLabel: '当前状态',
                statusCoord: '坐标对齐规划图',
                statusOrientation: '方位：',
                statusNorth: '↑ 上北下南',
                
                // 控制面板
                step1: '1. 导入数据',
                selectJson: '📂 选择 JSON 文件',
                
                step2: '2. 项目位置',
                selectCity: '选择城市',
                inputLatitude: '手动输入纬度',
                currentLat: '当前',
                northLat: '北纬',
                southLat: '南纬',
                
                step3: '3. 选择日期',
                winterSolstice: '冬至',
                springAutumn: '春/秋分',
                summerSolstice: '夏至',
                customDate: '自定义日期',
                selectDate: '选择日期',
                
                displayRange: '显示范围',
                ownOnly: '只显示本小区',
                
                timeLabel: '时间 (06:00 - 18:00)',
                
                // 日照分析
                step4: '4. 日照分析',
                calcButton: '🔬 计算日照时长',
                calculating: '计算中...',
                showHeatmap: '显示日照热力图',
                
                // 热力图图例
                legendHours: ['0h', '4h', '8h'],
                
                // 提示
                tip: '💡 提示: 拖动查看阴影变化',
                
                // 统计信息
                analysisDate: '分析日期',
                
                // 户型信息面板
                unitInfo: '户型信息',
                floor: '楼层',
                floorUnit: '层',
                unitNumber: '户号',
                unitFrom: '第',
                unitTo: '户(1→N)',
                sunlightDuration: '日照时长',
                sunlightHours: '小时',
                sunlightStatus: '日照状态',
                statusGood: '良好',
                statusWarning: '偏少',
                statusBad: '不达标',
                
                // 错误提示
                errorNoData: '请先导入建筑数据',
                errorNoBuilding: '没有找到本小区的建筑（isThisCommunity: true）',
                errorParseFailed: 'JSON 解析失败，请检查文件格式',
                errorCalcFailed: '计算过程中出错，请重试',
                errorFileRead: '文件读取失败，请重试',

                // 计算进度
                calculatingProgress: '计算中... {0}%',
                calculationComplete: '计算完成！',

                // 城市选择器
                selectCityPlaceholder: '-- 选择城市 --',

                // 默认楼名
                defaultBuildingName: '{0}号楼'
            },

            // 编辑器 (editor.html)
            editor: {
                title: '楼盘规划图配置器',
                emptyTip: '请在右侧上传图片开始规划',
                pageTitle: '🛠️ 楼盘数据配置',
                
                // 步骤1
                step1Title: '1. 上传规划图/总平图',
                step1Hint: '支持拖拽、缩放、绘制多边形表示楼栋轮廓。',
                
                // 步骤2
                step2Title: '2. 标定比例尺',
                scaleStatus: '状态',
                scaleNotSet: '未标定',
                scaleSet: '已标定',
                startScale: '开始标定 (点击两点)',
                scalePrompt: '请在图中点击两点',
                realDistance: '两点间实际距离 (米):',
                confirmScale: '确认比例',
                
                // 步骤3
                step3Title: '3. 绘制楼栋',
                step3Hint: '🖱️ 滚轮缩放，按住中键或空格拖拽视图',
                step3Operation: '操作: 左键加点，左键双击结束；右键撤销上个点。',
                modeIdle: '当前: ✋ 浏览模式',
                modeDrawing: '当前: ✏️ 正在绘制 (双击结束 / 右键撤销)',
                resetView: '⟲ 重置视角',
                
                // 步骤4
                step4Title: '4. 全局参数 & 默认值',
                projectLocation: '📍 项目位置（用于日照计算）',
                selectCity: '选择城市',
                orInputLat: '或输入纬度',
                defaultParams: '新楼栋默认参数:',
                defaultFloors: '默认层数',
                defaultFloorHeight: '默认层高(米)',
                defaultUnits: '默认户数/层',
                defaultIsOwn: '默认标记为本小区',
                useDefaults: '新楼栋使用默认值',
                applyToAll: '应用到所有楼栋',
                
                // 步骤5
                step5Title: '5. 楼栋参数表（统一填写/编辑）',
                
                // 表格
                tableName: '名称（可编辑）',
                tableFloors: '层数',
                tableFloorHeight: '层高(米)',
                tableUnits: '户/层',
                tableIsOwn: '本小区',
                tableActions: '操作',
                tableDelete: '删除',
                tableSplit: '分割',
                namePlaceholder: '输入名称（如：1号楼/配建/幼儿园）',
                
                // 导出
                exportButton: '导出 JSON 配置',
                importJsonButton: '导入 JSON',
                exportFilenameLabel: '导出文件名',
                
                // 提示信息
                alertNoScale: '请先标定比例尺！',
                alertMinPoints: '至少需要三个点才能闭合楼栋。',
                alertInvalidPoly: '绘制的多边形无效，请重画。',
                alertNoData: '没有数据可导出',
                alertImportFailed: '导入失败，请检查 JSON 文件格式',
                alertImportMissingTransform: '导入失败：缺少 scaleRatio 或 origin',
                alertInvalidDistance: '请输入正确的实际距离，并确保两点不重合。',
                alertConfirmDelete: '确定删除该楼栋吗？',
                
                // 缩放信息
                zoomInfo: '缩放',

                splitModalTitle: '分户分割（按分割角度 1→N）',
                splitFloor: '楼层',
                splitUnits: '户数/层',
                splitMode: '分割模式',
                splitModeBasic: '单轴等比',
                splitModeAdvanced: '自由划线',
                splitTools: '高级工具',
                splitToolLine: '画线切割',
                splitToolUnit: '指定户属',
                splitToolClear: '清空线段',
                splitAngle: '分割角度',
                splitRotateLeft: '左转',
                splitRotateRight: '右转',
                splitPreview: '分割示意',
                splitResetEqual: '等分',
                splitApplyAllFloors: '应用到所有楼层',
                splitUnitIndex: '户号(1→N)',
                splitRatio: '比例(%)',
                splitArea: '面积(㎡)',
                splitUseAreas: '按面积输入并实时换算',
                splitAreasTitle: '面积输入'
            }
        },

        en: {
            // Common
            common: {
                north: 'N',
                loading: 'Loading',
                confirm: 'Confirm',
                cancel: 'Cancel',
                delete: 'Delete',
                save: 'Save',
                export: 'Export',
                import: 'Import',
                close: 'Close',
                expand: 'Expand'
            },

            // Viewer (index.html)
            viewer: {
                title: 'Building Sunlight Visualization - Sunlight Simulation System',
                emptyState: 'Please import JSON configuration file in the top right corner',
                pageTitle: '☀️ Building Sunlight Simulation',
                
                // Status block
                statusLabel: 'Current Status',
                statusCoord: 'Coordinates aligned with plan',
                statusOrientation: 'Orientation:',
                statusNorth: '↑ North Up',
                
                // Control panel
                step1: '1. Import Data',
                selectJson: '📂 Select JSON File',
                
                step2: '2. Project Location',
                selectCity: 'Select City',
                inputLatitude: 'Manual Input Latitude',
                currentLat: 'Current',
                northLat: 'N',
                southLat: 'S',
                
                step3: '3. Select Date',
                winterSolstice: 'Winter Solstice',
                springAutumn: 'Spring/Autumn Equinox',
                summerSolstice: 'Summer Solstice',
                customDate: 'Custom Date',
                selectDate: 'Select Date',
                
                displayRange: 'Display Range',
                ownOnly: 'Show Only This Community',
                
                timeLabel: 'Time (06:00 - 18:00)',
                
                // Sunlight analysis
                step4: '4. Sunlight Analysis',
                calcButton: '🔬 Calculate Sunlight Duration',
                calculating: 'Calculating...',
                showHeatmap: 'Show Sunlight Heatmap',
                
                // Heatmap legend
                legendHours: ['0h', '4h', '8h'],
                
                // Tips
                tip: '💡 Tip: Drag to view shadow changes',
                
                // Statistics
                analysisDate: 'Analysis Date',
                
                // Unit info panel
                unitInfo: 'Unit Information',
                floor: 'Floor',
                floorUnit: 'F',
                unitNumber: 'Unit Number',
                unitFrom: 'Unit',
                unitTo: '(1→N)',
                sunlightDuration: 'Sunlight Duration',
                sunlightHours: 'hours',
                sunlightStatus: 'Sunlight Status',
                statusGood: 'Good',
                statusWarning: 'Fair',
                statusBad: 'Below Standard',
                
                // Error messages
                errorNoData: 'Please import building data first',
                errorNoBuilding: 'No buildings found in this community (isThisCommunity: true)',
                errorParseFailed: 'JSON parsing failed, please check file format',
                errorCalcFailed: 'Error during calculation, please try again',
                errorFileRead: 'File read failed, please try again',

                // Calculation progress
                calculatingProgress: 'Calculating... {0}%',
                calculationComplete: 'Calculation complete!',

                // City selector
                selectCityPlaceholder: '-- Select City --',

                // Default building name
                defaultBuildingName: 'Building {0}'
            },

            // Editor (editor.html)
            editor: {
                title: 'Building Plan Configurator',
                emptyTip: 'Please upload an image on the right to start planning',
                pageTitle: '🛠️ Building Data Configuration',
                
                // Step 1
                step1Title: '1. Upload Plan/Site Plan',
                step1Hint: 'Supports drag, zoom, and draw polygons to represent building outlines.',
                
                // Step 2
                step2Title: '2. Calibrate Scale',
                scaleStatus: 'Status',
                scaleNotSet: 'Not Calibrated',
                scaleSet: 'Calibrated',
                startScale: 'Start Calibration (Click Two Points)',
                scalePrompt: 'Please click two points on the image',
                realDistance: 'Actual Distance Between Two Points (meters):',
                confirmScale: 'Confirm Scale',
                
                // Step 3
                step3Title: '3. Draw Buildings',
                step3Hint: '🖱️ Scroll to zoom, hold middle button or space to drag view',
                step3Operation: 'Operation: Left click to add point, double-click to finish; right click to undo last point.',
                modeIdle: 'Current: ✋ Browse Mode',
                modeDrawing: 'Current: ✏️ Drawing (Double-click to finish / Right-click to undo)',
                resetView: '⟲ Reset View',
                
                // Step 4
                step4Title: '4. Global Parameters & Defaults',
                projectLocation: '📍 Project Location (for sunlight calculation)',
                selectCity: 'Select City',
                orInputLat: 'Or Input Latitude',
                defaultParams: 'Default Parameters for New Buildings:',
                defaultFloors: 'Default Floors',
                defaultFloorHeight: 'Default Floor Height (m)',
                defaultUnits: 'Default Units/Floor',
                defaultIsOwn: 'Mark as This Community by Default',
                useDefaults: 'Use Defaults for New Buildings',
                applyToAll: 'Apply to All Buildings',
                
                // Step 5
                step5Title: '5. Building Parameters Table (Unified Editing)',
                
                // Table
                tableName: 'Name (Editable)',
                tableFloors: 'Floors',
                tableFloorHeight: 'Floor Height (m)',
                tableUnits: 'Units/Floor',
                tableIsOwn: 'This Community',
                tableActions: 'Actions',
                tableDelete: 'Delete',
                tableSplit: 'Split',
                namePlaceholder: 'Enter name (e.g., Building 1/Ancillary/Kindergarten)',
                
                // Export
                exportButton: 'Export JSON Configuration',
                importJsonButton: 'Import JSON',
                exportFilenameLabel: 'Export Filename',
                
                // Alert messages
                alertNoScale: 'Please calibrate the scale first!',
                alertMinPoints: 'At least three points are required to close the building.',
                alertInvalidPoly: 'The drawn polygon is invalid, please redraw.',
                alertNoData: 'No data to export',
                alertImportFailed: 'Import failed. Please check the JSON file format.',
                alertImportMissingTransform: 'Import failed: missing scaleRatio or origin.',
                alertInvalidDistance: 'Please enter a valid actual distance and ensure the two points are not coincident.',
                alertConfirmDelete: 'Are you sure you want to delete this building?',
                
                // Zoom info
                zoomInfo: 'Zoom',

                splitModalTitle: 'Unit Split (Angle 1→N)',
                splitFloor: 'Floor',
                splitUnits: 'Units/Floor',
                splitMode: 'Split Mode',
                splitModeBasic: 'Axis Ratio',
                splitModeAdvanced: 'Free Draw',
                splitTools: 'Advanced Tools',
                splitToolLine: 'Draw Cut Line',
                splitToolUnit: 'Assign Unit',
                splitToolClear: 'Clear Lines',
                splitAngle: 'Split Angle',
                splitRotateLeft: 'Rotate Left',
                splitRotateRight: 'Rotate Right',
                splitPreview: 'Preview',
                splitResetEqual: 'Equal Split',
                splitApplyAllFloors: 'Apply to All Floors',
                splitUnitIndex: 'Unit (1→N)',
                splitRatio: 'Ratio (%)',
                splitArea: 'Area (㎡)',
                splitUseAreas: 'Use Areas and Update Live',
                splitAreasTitle: 'Areas'
            }
        }
    };

    /**
     * 初始化语言设置
     * 优先级: localStorage > 浏览器语言 > 默认中文
     */
    function init() {
        // 从 localStorage 读取用户偏好
        const savedLang = localStorage.getItem(STORAGE_KEY);
        if (savedLang && translations[savedLang]) {
            currentLang = savedLang;
            return;
        }
        
        // 根据浏览器语言自动选择
        const browserLang = navigator.language || navigator.userLanguage;
        currentLang = browserLang.startsWith('zh') ? 'zh' : 'en';
    }

    /**
     * 切换语言
     * @param {string} lang - 语言代码 ('zh' | 'en')
     * @returns {boolean} 是否切换成功
     */
    function setLanguage(lang) {
        if (!translations[lang]) {
            console.warn(`Language '${lang}' not supported`);
            return false;
        }
        
        currentLang = lang;
        localStorage.setItem(STORAGE_KEY, lang);
        return true;
    }

    /**
     * 获取翻译文本
     * @param {string} key - 翻译键，支持点号分隔的路径 (如 'viewer.pageTitle')
     * @returns {string} 翻译后的文本，如果找不到则返回 key 本身
     */
    function t(key) {
        const keys = key.split('.');
        let value = translations[currentLang];
        
        for (const k of keys) {
            if (value && typeof value === 'object') {
                value = value[k];
            } else {
                console.warn(`Translation key '${key}' not found`);
                return key;
            }
        }
        
        return value !== undefined ? value : key;
    }

    /**
     * 获取当前语言
     * @returns {string} 当前语言代码
     */
    function getCurrentLanguage() {
        return currentLang;
    }

    /**
     * 获取所有支持的语言
     * @returns {string[]} 支持的语言代码数组
     */
    function getSupportedLanguages() {
        return Object.keys(translations);
    }

    // 自动初始化
    init();

    // 公开 API
    return {
        t,
        setLanguage,
        getCurrentLanguage,
        getSupportedLanguages
    };
})();

// 兼容旧版本的直接访问方式（可选）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = i18n;
}
