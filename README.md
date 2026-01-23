<p align="center">
  <a href="./README_en.md">English</a> | <span>简体中文</span>
</p>

<div align="center">

# 🏢 Building Sunlight Simulator

**建筑采光模拟工具 · 轻量级楼盘日照分析解决方案**

<p>
    <a href="https://github.com/ruanyf/weekly/blob/master/docs/issue-382.md">
        <img src="https://img.shields.io/badge/科技爱好者周刊-第382期推荐-ff69b4?style=flat-square&logo=rss" alt="Tech Enthusiast Weekly">
    </a>
  <a href="https://opensource.org/licenses/MIT">
    <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" alt="License">
  </a>
  <a href="https://threejs.org/">
    <img src="https://img.shields.io/badge/Three.js-r128-black?style=flat-square&logo=three.js" alt="Made with Three.js">
  </a>
  <a href="https://github.com/seanwong17/building-sunlight-simulator/pulls">
    <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square" alt="PRs Welcome">
  </a>
</p>

<h3>
  👉 <a href="https://seanwong17.github.io/building-sunlight-simulator/">点击查看在线演示 (Live Demo)</a> 👈
</h3>

<p style="font-size: 13px; color: #666;">
  注：在线演示仅展示默认数据，如需自定义规划图请参考下文“本地使用”。
</p>

<img src="examples/vis.png" alt="效果预览" width="80%">

</div>

---

## 📋 项目简介

**Building Sunlight Simulator** 是一套基于 Web 技术的楼盘规划与采光模拟工具。

它允许用户直接在浏览器中通过规划图（JPG/PNG）绘制建筑轮廓，生成 3D 场景，并结合地理纬度和太阳轨迹算法，对目标建筑进行精确的日照遮挡分析。项目纯前端实现，无后端依赖，支持离线使用。

---

## ✨ 核心特性

| 模块 | 功能描述 |
|------|----------|
| **部署** | 纯静态 HTML/CSS/JS，下载即用，无需安装环境 |
| **编辑** | 2D 平面图转 3D 模型，支持楼栋轮廓绘制、层高设置、比例尺标定 |
| **计算** | 基于球面三角学计算太阳轨迹，内置 50+ 城市纬度数据 |
| **可视** | 4096px 高精度阴影贴图，支持冬至/夏至/春秋分及 06:00-18:00 实时调节 |
| **交互** | 支持 PC 端及移动端触控，可过滤非本小区建筑 |

---

## 🚀 快速开始

本项目包含两个核心文件：`editor.html`（数据生产）和 `index.html`（数据消费）。

### 1. 获取项目
```bash
git clone [https://github.com/seanwong17/building-sunlight-simulator.git](https://github.com/seanwong17/building-sunlight-simulator.git)
# 或者直接下载 ZIP 解压
```

### 2. 运行方式
本项目不依赖构建工具，选择以下任一方式打开：

* **直接打开**：双击文件夹中的 `editor.html` 或 `index.html` 即可在浏览器运行。
* **本地服务（可选）**：如果需要热更新或解决跨域限制，可使用 `live-server` 或 `python -m http.server`。

---

## 📖 使用流程

流程：**规划图配置 (Editor)** ➜ **导出 JSON** ➜ **采光分析 (Viewer)**

### Step 1: 制作数据 (editor.html)
打开 `editor.html`，将平面的规划图转化为 3D 模拟所需的 JSON 数据。

1.  **上传底图**：支持 JPG/PNG 格式的规划图或总平图。
2.  **标定比例**：在图上选取已知距离的两点（如标尺），输入实际距离（米）。
3.  **绘制楼栋**：左键点击描点，双击闭合生成轮廓。
4.  **设置属性**：选中楼栋，设置层数、层高、地理位置等参数。
5.  **导出配置**：点击保存，生成配置文件（默认为 `data.json`）。

<details>
<summary>📌 编辑器快捷键</summary>

| 操作 | 快捷键 |
|------|--------|
| 缩放视图 | 鼠标滚轮 |
| 拖拽画布 | 鼠标中键 / 空格+左键 |
| 撤销绘制 | 鼠标右键 |
| 完成闭合 | 双击左键 |

</details>

<img src="examples/editor.png" alt="编辑器界面" width="100%">

### Step 2: 模拟分析 (index.html)
打开 `index.html`，进行 3D 可视化分析。

1.  **导入数据**：点击按钮加载上一步导出的 JSON 文件（或使用仓库内的 `examples/sample.json` 进行测试）。
2.  **调整环境**：选择预设城市或手动输入纬度，切换日期（冬至/夏至）。
3.  **观察阴影**：拖动时间滑块，观察目标楼层的日照遮挡情况。

---

## 📐 数据协议

项目通过 JSON 格式传递建筑数据。`examples/sample.json` 提供了完整的示例数据。

<details>
<summary>点击查看 JSON 结构说明</summary>

```jsonc
{
  "version": 1.7,                  // 数据版本
  "latitude": 36.65,               // 项目纬度（影响太阳高度角）
  "scaleRatio": 0.483,             // 比例尺：1像素 = N米
  "origin": { "x": 306, "y": 336 },// 坐标系原点（像素）
  "buildings": [
    {
      "name": "1号楼",
      "floors": 18,                // 层数
      "floorHeight": 3,            // 层高（米）
      "totalHeight": 54,           // 总高度（可选，默认自动计算）
      "isThisCommunity": true,     // 是否为目标小区（用于高亮/过滤）
      "shape": [                   // 轮廓顶点坐标（相对于 origin 的米数）
        { "x": -19.18, "y": -107.28 },
        { "x": -19.18, "y": -115.55 },
        { "x": 2.51, "y": -115.31 }
      ],
      "center": { "x": -8.36, "y": -111.45 }
    }
  ]
}
```

</details>

---

## 🛠️ 技术实现

* **渲染引擎**: Three.js (WebGL)
* **阴影方案**: PCFSoftShadowMap
* **太阳算法**:
    * 太阳高度角: $\sin(h) = \sin(\phi)\sin(\delta) + \cos(\phi)\cos(\delta)\cos(\omega)$
    * 太阳方位角: $\cos(A) = (\sin(h)\sin(\phi) - \sin(\delta)) / (\cos(h)\cos(\phi))$

---

## 🤝 贡献与反馈

欢迎提交 Issue 或 Pull Request。

* **Issues**: [Bug 反馈与功能建议](https://github.com/seanwong17/building-sunlight-simulator/issues)
* **待办事项**: 自定义日期选择、日照时长统计导出、DXF 导入支持。

---

## 📄 License

[MIT License](LICENSE) © 2023 seanwong17

---

## 📈 Star History

[![Star History Chart](https://api.star-history.com/svg?repos=SeanWong17/building-sunlight-simulator&type=Date)](https://star-history.com/#SeanWong17/building-sunlight-simulator&Date)

---

<div align="center">
  <br>
  Made with ❤️ by <a href="https://github.com/seanwong17">seanwong17</a>
</div>
