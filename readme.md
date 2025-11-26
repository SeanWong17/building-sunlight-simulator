# 楼盘采光模拟工具 (Building Sunlight Simulator)

一套轻量级、纯前端的楼盘规划与采光模拟工具链，支持从规划图标注到 3D 阴影可视化的完整工作流。

## ✨ 特性

- **零依赖部署** — 纯静态 HTML，无需后端，打开即用
- **可视化标注** — 在总平图/规划图上绘制楼栋轮廓，自动净化多边形
- **比例尺标定** — 两点标定，像素坐标自动转换为真实米制坐标
- **参数化配置** — 支持楼层数、层高、每层户数、是否本小区等属性
- **3D 采光模拟** — 基于太阳高度角/方位角的实时阴影投射
- **季节 × 时间** — 冬至/春秋分/夏至 + 06:00–18:00 连续调节
- **响应式设计** — 桌面端与移动端自适应布局

## 🚀 快速开始

```bash
# 克隆仓库
git clone https://github.com/seanwong17/building-sunlight-simulator.git
cd building-sunlight-simulator

# 直接打开即可使用（无需构建）
open editor.html      # 2D 规划图配置器
open viewer.html      # 3D 采光可视化
```

或者访问在线演示：[Live Demo](https://seanwong17.github.io/gsy_daylighting/)

## 📖 使用流程

```text
┌─────────────────┐      导出 JSON      ┌─────────────────┐
│  editor.html    │  ───────────────▶  │  viewer.html    │
│  规划图配置器    │                     │  采光可视化      │
└─────────────────┘                     └─────────────────┘
```

### 1. 规划图配置器 (editor.html)
**步骤：**
1. **上传底图**：支持 JPG/PNG 等常见格式的规划图或总平图
2. **标定比例尺**：点击图中两点，输入实际距离（米）
3. **绘制楼栋**：左键加点，双击闭合；右键撤销上一点
4. **编辑参数**：在右侧表格中修改楼栋名称、层数、层高等
5. **导出配置**：点击「导出 JSON 配置」保存文件

> **快捷操作**：
> - `滚轮` 缩放视图
> - `中键` / `空格+左键` 拖拽画布
> - `右键` 撤销上一个绘制点
> - `双击左键` 完成该轮廓绘制

### 2. 采光可视化 (viewer.html)
**步骤：**
1. **导入 JSON**：点击「选择 JSON 文件」加载配置
2. **选择日期**：冬至 / 春秋分 / 夏至
3. **调节时间**：拖动滑块查看 06:00–18:00 阴影变化
4. **过滤显示**：勾选「只显示本小区」隐藏周边楼栋


## 📁 项目结构

```text
building-sunlight-simulator/
├── editor.html          # 2D 规划图配置器（单文件）
├── viewer.html          # 3D 采光可视化（单文件）
├── examples/
│   ├── screenshots.jpg  # 示例俯视图
│   └── sample.json      # 示例配置文件
├── README.md
└── LICENSE
```

## 📐 JSON 数据格式

```jsonc
{
  "version": 1.5,
  "scaleRatio": 0.483,           // 1像素 = 多少米
  "latitude": 36.65,             // 纬度（可选，用于太阳轨迹计算）
  "origin": { "x": 306, "y": 336 },
  "buildings": [
    {
      "name": "1号楼",
      "floors": 18,               // 层数
      "floorHeight": 3,           // 层高（米）
      "units": 2,                 // 每层户数（或使用 unitsPerFloor 数组）
      "totalHeight": 54,          // 总高度（米）
      "isThisCommunity": true,    // 是否本小区
      "shape": [                  // 轮廓点（米，相对于 origin）
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

## 🛠️ 技术栈

| 模块 | 技术 |
| --- | --- |
| **2D 渲染** | Canvas 2D API |
| **3D 渲染** | Three.js r128 |
| **视角控制** | OrbitControls |
| **阴影** | PCFSoftShadowMap |
| **UI** | 原生 HTML/CSS（无框架依赖） |

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 开发建议
由于是纯静态文件，推荐使用 `live-server` 或 VS Code Live Server 插件进行本地开发。

```bash
npx live-server .
```

## 📄 许可证

本项目基于 [MIT License](LICENSE) 开源。

## 🙏 致谢

- **Three.js** — 强大的 WebGL 3D 库
- 灵感来源：城市规划日照分析需求

如果这个项目对你有帮助，欢迎 ⭐ Star 支持！