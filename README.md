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

它允许用户直接在浏览器中通过规划图（JPG/PNG）绘制建筑轮廓，生成 3D 场景，并结合项目位置和太阳轨迹算法，对目标建筑进行日照遮挡可视化估算。项目纯前端实现，运行依赖已随仓库发布，无后端和联网依赖。

---

## ✨ 核心特性

| 模块 | 功能描述 |
|------|----------|
| **部署** | 浏览器静态版 + Tauri 原生桌面版；桌面版不依赖 Node.js 运行时 |
| **编辑** | 2D 平面图转 3D 模型，支持 JSON/底图拖放导入、楼栋选择移动、撤销编辑和可视化分户配置 |
| **计算** | 基于球面三角学计算太阳轨迹，内置 50+ 城市经纬度与 IANA 时区数据 |
| **可视** | 4096px 高精度阴影贴图，支持按半球显示的冬至/夏至/春分/秋分及自定义日期，06:00-18:00 当地民用时间实时调节，配备专业罗盘指南针 |
| **量化** | 每户累计日照估算与热力图展示（淡黄到深橙色阶），支持单户详情、可配置参考时长及分析结果导入复用 |
| **交互** | 支持 PC 端及移动端触控、文件拖放，可过滤非本小区建筑且保留当前相机视角 |
| **多语言** | 支持中英文切换，界面右上角可自由切换语言 |

### 📊 日照时长量化分析
* **采光检测点计算**：对每栋本小区建筑（`isThisCommunity: true`），按分户轴将所有外墙片段映射到各户，并在每层窗高位置生成检测点。同一户可能对应多个外墙片段，户级统计取这些片段中日照时长的最大值。
* **日照时长计算**：从当地民用时间 6:00 到 18:00，按 6 分钟区间的中点进行射线检测，并结合经度、时区和均时差换算真太阳时。如果该区间太阳方向的射线未被任何建筑物遮挡，则累计该区间的日照。
* **热力图显示**：计算完成后可开启热力图模式，在实际外墙采样片段上显示彩色方块。采用温暖色系，从淡黄色（0小时）渐变到深橙色（8小时及以上）。
* **交互功能**：开启热力图后点击任意户型方块，可查看该户的详细信息（楼层、户号、累计日照与参考值状态）。参考时长可在分析前调整，默认 2 小时。

> **适用边界**：结果是按 6 分钟离散区间累计、并取同户多个外墙采样片段最大值的方案可视化估算，不是通用行业合规结论。不同地区对检测日期、检测点和连续日照时长的要求不同，正式判断应按当地规则复核。

### 🧭 专业罗盘指南针
* 地面配备专业3D罗盘，清晰标注东南西北方位，北方用红色突出显示，替代传统简单箭头，提供更专业的方位指示。

---

## 🚀 快速开始

本项目包含两个核心文件：`editor.html`（数据生产）和 `index.html`（数据消费）。

### 1. 获取项目
```bash
git clone [https://github.com/seanwong17/building-sunlight-simulator.git](https://github.com/seanwong17/building-sunlight-simulator.git)
# 或者直接下载 ZIP 解压
```

### 2. 运行方式
浏览器版本不依赖构建工具，选择以下任一方式打开：

* **直接打开**：双击文件夹中的 `editor.html` 或 `index.html` 即可在浏览器运行。
* **本地服务（可选）**：如果需要热更新或解决跨域限制，可使用 `live-server` 或 `python -m http.server`。

### 3. 桌面版开发与构建

桌面版使用 [Tauri 2](https://v2.tauri.app/) 封装同一套前端和日照算法。Tauri 只提供原生窗口和安装包，不引入 Electron 的完整 Chromium 运行时，因此发行包更小。

```bash
npm ci
npm run desktop:dev       # 开发模式
npm run desktop:build     # 当前平台 Release 安装包
npm test                  # 单元测试 + 桌面前端包检查
```

桌面包只会复制白名单中的运行时文件到 `dist/`，不会包含源码说明、测试、脚本或示例截图。Release 使用 GitHub Actions 按平台构建：

| 平台 | Release 资产 |
|---|---|
| Windows | NSIS Setup `.exe` + MSI `.msi` |
| macOS | `.dmg` |
| Linux | AppImage + Debian `.deb` |

发布方式是推送 `v*` 标签。CI 会先运行 Node 测试和浏览器回归测试，再构建三平台安装包；Release 保持为草稿，全部平台成功并生成 `SHA256SUMS.txt` 后才会公开。仓库不保存任何证书或私钥；当前未配置平台证书时会生成未签名包，正式公开分发前应在 GitHub Secrets 中接入 Windows Authenticode 和 macOS Developer ID / notarization。

---

## 📖 使用流程

流程：**规划图配置 (Editor)** ➜ **导出 JSON** ➜ **采光分析 (Viewer)**

### Step 1: 制作数据 (editor.html)
打开 `editor.html`，将平面的规划图转化为 3D 模拟所需的 JSON 数据。

1.  **导入项目**：点击或拖入 JPG/PNG 底图开始新项目；也可导入此前导出的 JSON 继续编辑。
2.  **标定比例**：在图上选取已知距离的两点（如标尺），输入实际距离（米）。
3.  **绘制与调整楼栋**：左键点击描点，通过“完成轮廓”按钮或双击闭合；退出绘制模式后可选择并拖动楼栋，“撤销编辑”可恢复创建、移动、删除和参数修改。
4.  **设置属性**：设置层数、层高、每层户数和地理位置；使用“可视化编辑”调整分户轴、各户宽度比例，并按需应用到全部楼层。导入的逐层户数配置也会保留；增减楼层时，逐层比例会自动裁剪或沿用最后一层。可视化编辑会保证每户至少占 1%，并相应限制单户最大比例。
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

1.  **导入数据**：点击按钮或将 JSON 拖入页面，加载上一步导出的项目（也可使用 `examples/sample.json` 测试）。
2.  **调整环境**：选择预设城市，或手动输入经度、纬度和 IANA 时区；切换日期（冬至/夏至/春分/秋分/自定义日期）。
3.  **观察阴影**：拖动时间滑块，观察目标楼层的日照遮挡情况。地面罗盘指示方位。
4.  **量化分析**：设置参考时长后点击“计算日照时长”，查看热力图（淡黄到深橙色阶）及具体户型数据。点击热力图方块可查看单户详情。
5.  **复用结果**：计算完成后可导出“项目和结果”。再次导入时，如项目几何、地点、北向角和采样参数均未改变，Viewer 会恢复导出时使用的节气或精确自定义日期，并直接加载结果；只修改参考时长会复用已有时长并重新统计。

---

## 📐 数据协议

项目通过 JSON 格式传递建筑数据。`examples/sample.json` 提供了完整的示例数据。

<details>
<summary>点击查看 JSON 结构说明</summary>

```jsonc
{
  "version": 1.7,                  // 数据版本
  "latitude": 36.65,               // 项目纬度（影响太阳高度角）
  "longitude": 117.12,             // 项目经度，东经为正
  "timeZone": "Asia/Shanghai",   // IANA 时区（用于民用时间换算）
  "scaleRatio": 0.483,             // 比例尺：1像素 = N米
  "origin": { "x": 306, "y": 336 },// 坐标系原点（像素）
  "buildings": [
    {
      "name": "1号楼",
      "floors": 18,                // 层数
      "floorHeight": 3,            // 层高（米）
      "totalHeight": 54,           // 可选；如提供，必须等于 floors * floorHeight
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

Viewer 导出的文件可附带 `precomputedSunlight` 缓存及当前活动分析日期。该字段由程序维护，并同时校验项目指纹、采样点指纹、算法版本和分析参数；不匹配或超出限制的数据会被安全忽略并要求重新计算。

---

## 🛠️ 技术实现

* **渲染引擎**: Three.js (WebGL)
* **阴影方案**: PCFSoftShadowMap
* **离线计算**: 自包含 Web Worker + 三角形 BVH；Three.js r128 与 OrbitControls 固定版本存放于 `vendor/three-r128/`
* **太阳算法**:
    * 太阳高度角: $\sin(h) = \sin(\phi)\sin(\delta) + \cos(\phi)\cos(\delta)\cos(\omega)$
    * 太阳方位角: $\cos(A) = (\sin(h)\sin(\phi) - \sin(\delta)) / (\cos(h)\cos(\phi))$

### 项目结构

```
building-sunlight-simulator/
├── css/                    # 样式文件
├── js/
│   ├── config.js          # 全局配置
│   ├── utils.js           # 工具函数
│   ├── i18n.js            # 国际化
│   ├── cities.js          # 城市数据
│   ├── editor.js          # 编辑器逻辑
│   ├── sunlight-worker.js # 离线日照射线计算 Worker
│   └── viewer.js          # 查看器逻辑
├── examples/              # 示例数据
├── tests/                 # 单元和浏览器回归测试
├── vendor/three-r128/     # Three.js、OrbitControls 与第三方许可证
├── scripts/               # 桌面运行时准备与产物检查
├── src-tauri/             # Tauri 原生壳层和跨平台打包配置
├── .github/workflows/     # CI 与标签发布流水线
├── editor.html            # 编辑器页面
└── index.html             # 查看器页面
```

---

## 🤝 贡献与反馈

欢迎提交 Issue 或 Pull Request。

* **Issues**: [Bug 反馈与功能建议](https://github.com/seanwong17/building-sunlight-simulator/issues)

---

## 🙏 致谢

多立面采样、热力图贴附、分户配置与整户交互这部分能力的演进，参考了 [@wingkinl](https://github.com/wingkinl) 基于 MIT License 发布的 Fork 项目 [building-sunlight-simulator](https://github.com/wingkinl/building-sunlight-simulator) 中的相关实现与思路，在此表示感谢。

---

## 📄 License

[MIT License](LICENSE) © 2026 SeanWong17

仓库内固定版本的 Three.js 与 OrbitControls 依其 MIT License 发布，详见 [`vendor/three-r128/LICENSE`](vendor/three-r128/LICENSE)。

---

## 📈 Star History

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/SeanWong17/building-sunlight-simulator/star-history-assets/assets/star-history/star-history-dark.svg">
  <img alt="Star History Chart" src="https://raw.githubusercontent.com/SeanWong17/building-sunlight-simulator/star-history-assets/assets/star-history/star-history-light.svg">
</picture>

---

<div align="center">
  <br>
  Made with ❤️ by <a href="https://github.com/seanwong17">seanwong17</a>
</div>
