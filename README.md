<div align="center">

# 🏢 Building Sunlight Simulator

**建筑采光模拟工具 -- 轻量级楼盘日照分析解决方案**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/seanwong17/building-sunlight-simulator/pulls)
[![Made with Three.js](https://img.shields.io/badge/Made%20with-Three.js-000000?logo=three.js)](https://threejs.org/)

[在线演示](https://guanshanyue-daylighting.netlify.app/) · [在线演示备用链接](https://building-sunlight-simulator.pages.dev/) · [问题反馈](https://github.com/seanwong17/building-sunlight-simulator/issues)

<img src="examples/vis.png" alt="效果预览" width="80%">

</div>

---

## 📋 项目简介

Building Sunlight Simulator 是一套**纯前端**的楼盘规划与采光模拟工具链，旨在帮助购房者、规划师和开发者快速评估建筑日照情况。从规划图标注到 3D 阴影可视化，无需安装任何软件，打开浏览器即可使用。

### 💡 为什么做这个工具？

在购房或城市规划过程中，日照时长是一个关键指标。然而，传统日照分析工具往往：
- 需要专业软件和学习成本
- 依赖后端服务部署复杂
- 缺乏直观的交互体验

本项目通过纯前端技术栈解决这些痛点，让每个人都能轻松进行日照模拟分析。

---

## ✨ 核心特性

| 特性 | 描述 |
|------|------|
| 🚀 **零依赖部署** | 纯静态 HTML/CSS/JS，无需后端，支持离线使用 |
| 🎨 **可视化标注** | 在规划图上绘制楼栋轮廓，自动净化多边形 |
| 📐 **比例尺标定** | 两点标定像素与米的转换比例 |
| 🌍 **多地区支持** | 内置 50+ 中国城市及国际城市纬度数据 |
| ☀️ **实时阴影** | 基于太阳高度角/方位角的精确阴影计算 |
| 📅 **季节模拟** | 冬至、春秋分、夏至三种典型日期 |
| ⏰ **时间连续调节** | 06:00–18:00 阴影动态变化 |
| 📱 **响应式设计** | 完美适配桌面端与移动端 |

---

## 🚀 快速开始

### 在线使用

直接访问 [在线演示](https://guanshanyue-daylighting.netlify.app/) 即可体验完整功能。

### 本地部署

```bash
# 克隆仓库
git clone https://github.com/seanwong17/building-sunlight-simulator.git
cd building-sunlight-simulator

# 方式一：直接打开（推荐）
open editor.html      # macOS
start editor.html     # Windows

# 方式二：使用本地服务器（支持热更新）
npx live-server .
# 或
python -m http.server 8080
```

---

## 📖 使用流程

> **editor.html** (规划图配置器) ➜ 导出 JSON ➜ **index.html** (采光可视化)

### Step 1: 规划图配置 (editor.html)

| 步骤 | 操作 |
|:----:|------|
| ① | **上传底图** — 支持 JPG/PNG 格式的规划图或总平图 |
| ② | **标定比例尺** — 点击图中两点，输入实际距离（米） |
| ③ | **绘制楼栋** — 左键加点，双击闭合；右键撤销 |
| ④ | **设置位置** — 选择城市或手动输入纬度 |
| ⑤ | **编辑参数** — 修改楼栋名称、层数、层高等 |
| ⑥ | **导出配置** — 生成 JSON 文件 |

<details>
<summary>📌 快捷键说明</summary>

| 操作 | 快捷键 |
|------|--------|
| 缩放视图 | 鼠标滚轮 |
| 拖拽画布 | 中键 / 空格+左键 |
| 撤销绘制点 | 右键 |
| 完成轮廓 | 双击左键 |

</details>

<img src="examples/editor.png" alt="编辑器界面" width="100%">

### Step 2: 采光可视化 (index.html)

| 步骤 | 操作 |
|:----:|------|
| ① | **导入 JSON** — 加载配置文件（自动读取纬度） |
| ② | **调整位置** — 可手动切换城市或微调纬度 |
| ③ | **选择日期** — 冬至 / 春秋分 / 夏至 |
| ④ | **调节时间** — 拖动滑块观察阴影变化 |
| ⑤ | **过滤显示** — 可仅显示本小区楼栋 |

<img src="examples/vis.png" alt="可视化界面" width="100%">

---

## 📁 项目结构

```
building-sunlight-simulator/
├── index.html              # 3D 采光可视化页面
├── editor.html             # 2D 规划图配置器
├── css/
│   ├── viewer.css          # 可视化页面样式
│   └── editor.css          # 配置器页面样式
├── js/
│   ├── viewer.js           # 可视化核心逻辑
│   ├── editor.js           # 配置器核心逻辑
│   └── cities.js           # 城市纬度数据库
├── examples/
│   ├── sample_data.js      # 默认演示数据
│   ├── sample.json         # 示例配置文件
│   ├── editor.png          # 文档截图
│   └── vis.png             # 文档截图
├── README.md
└── LICENSE
```

---

## 📐 数据格式

<details>
<summary>点击展开 JSON Schema</summary>

```jsonc
{
  "version": 1.7,                    // 数据版本
  "latitude": 36.65,                 // 项目纬度（用于太阳轨迹计算）
  "scaleRatio": 0.483,               // 比例尺：1像素 = 多少米
  "origin": { "x": 306, "y": 336 },  // 坐标原点（像素）
  "buildings": [
    {
      "name": "1号楼",                // 楼栋名称
      "floors": 18,                  // 层数
      "floorHeight": 3,              // 层高（米）
      "units": 2,                    // 每层户数
      "totalHeight": 54,             // 总高度（米）
      "isThisCommunity": true,       // 是否本小区
      "shape": [                     // 轮廓顶点（米，相对 origin）
        { "x": -19.18, "y": -107.28 },
        { "x": -19.18, "y": -115.55 },
        { "x": 2.51, "y": -115.31 },
        { "x": 2.39, "y": -107.64 }
      ],
      "center": { "x": -8.36, "y": -111.45 }
    }
  ]
}
```

</details>

---

## 🛠️ 技术栈

| 模块 | 技术方案 | 说明 |
|------|----------|------|
| **2D 编辑器** | Canvas 2D API | 多边形绘制、视图变换 |
| **3D 渲染** | Three.js r128 | 场景构建、材质系统 |
| **视角控制** | OrbitControls | 平滑阻尼、极角限制 |
| **阴影系统** | PCFSoftShadowMap | 4096px 高精度阴影贴图 |
| **太阳计算** | 球面三角学 | 基于纬度和时角的高度角/方位角 |
| **UI 框架** | 原生 HTML/CSS | 零依赖、无构建步骤 |

### 🌞 太阳位置计算原理

```
太阳高度角: sin(h) = sin(φ)sin(δ) + cos(φ)cos(δ)cos(ω)
太阳方位角: cos(A) = (sin(h)sin(φ) - sin(δ)) / (cos(h)cos(φ))

其中:
  φ = 观察者纬度
  δ = 太阳赤纬（冬至-23.44°，春秋分0°，夏至+23.44°）
  ω = 时角 = (当前小时 - 12) × 15°
```

---

## 🤝 贡献指南

我们欢迎各种形式的贡献！

### 如何贡献

1. **Fork** 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送分支 (`git push origin feature/AmazingFeature`)
5. 提交 **Pull Request**


### 待办事项 (Roadmap)

- [ ] 支持自定义日期（任意月/日）
- [ ] 添加日照时长统计
- [ ] 支持导入 DXF/DWG 格式
- [ ] 增加更多国际城市
- [ ] PWA 离线支持

---

## 📄 开源协议

本项目采用 [MIT License](LICENSE) 开源协议。

---

## 🙏 致谢

- [Three.js](https://threejs.org/) — 强大的 WebGL 3D 渲染库
- 项目灵感来源于城市规划日照分析需求

---

<div align="center">

**如果这个项目对你有帮助，欢迎 ⭐ Star 支持！**

Made with ❤️ by [seanwong17](https://github.com/seanwong17)

</div>