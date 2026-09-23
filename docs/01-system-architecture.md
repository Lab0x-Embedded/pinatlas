# 01 · 系统架构

## 1. 为什么是这个形态

最初想做的是"在线图形化配置引脚"。调研结论：现有工具要么是桌面软件（STM32CubeMX），要么是单芯片的博客表格，没有面向多厂商的在线引脚库。

而且**引脚与复用功能查询**这件事本身是可控的：数据公开、结构固定、可离线转换。因此 PinAtlas 定位为：

> **通用芯片引脚数据库与可视化查询平台**——不绑定 STM32，不做工程级代码生成。

## 2. 系统组成

```mermaid
graph TB
  subgraph UP["上游数据源（第三方）"]
    A1["LibrePCB/stm-db<br/>2952 个 JSON<br/>每封装一个文件"]
    A2["embassy-rs/stm32-data-generated<br/>1616 个 die JSON<br/>AF 号 / 寄存器 / 手册链接"]
  end

  subgraph DATA["pinatlas-data（数据仓库）"]
    B1["sync.mjs<br/>每周一 UTC 03:17"]
    B2["统一 JSON<br/>data/st/{family}/{chip}.json"]
    B3["index.json + index/{family}.json<br/>清单与分片索引"]
    B4["meta.json<br/>上游 sha / 覆盖率 / 失败清单"]
  end

  subgraph FE["pinatlas（前端仓库）"]
    C1["数据访问层<br/>composables/useChipData"]
    C2["封装布局引擎<br/>utils/package-layout"]
    C3["视图层<br/>列表 / 引脚图 / 详情面板"]
  end

  D["工程师浏览器"]

  A1 --> B1
  A2 --> B1
  B1 --> B2 --> B3
  B1 --> B4
  B2 -. "同源 /data（本地快照）或 jsDelivr 固定 tag" .-> C1
  B3 -. "索引按需加载" .-> C1
  C1 --> C2 --> C3 --> D
```

## 3. 职责边界

| 层 | 负责 | 不负责 |
|---|---|---|
| 上游仓库 | 原始引脚/功能数据 | 统一格式、校验、可用性 |
| **pinatlas-data** | 抓取、归一化、AF join、校验、版本化发布 | 任何 UI 逻辑 |
| **pinatlas**（前端） | 展示、交互、几何布局、缓存 | 数据转换（前端不做厂商适配） |
| 浏览器 | 渲染与交互 | — |

这条边界的关键是：**前端永远只读一套格式**。新增厂商（ESP32/RP2040/GD32）= 在数据仓库加一个 `convert-xxx` 适配器，前端零改动。

## 4. 运行时数据流

```mermaid
sequenceDiagram
  participant U as 用户
  participant FE as 前端
  participant CDN as jsDelivr(pinatlas-data@tag)
  U->>FE: 打开首页
  FE->>CDN: GET data/index.json（清单，约 1 KB）
  FE->>CDN: GET data/index/STM32F1.json（分片，按需）
  CDN-->>FE: 型号列表（line / die / package / pinCount / flash）
  U->>FE: 搜索并选中型号
  FE->>CDN: GET data/st/STM32F1/STM32F103C8Tx.json（平均 12 KB，gzip 2.4 KB）
  CDN-->>FE: 统一 JSON
  FE->>FE: 布局引擎按 packageKind 摆位 → SVG
  U->>FE: 点击引脚
  FE->>U: 详情面板（按外设分组的复用功能 + AF 号 + 变体）
```

## 5. 技术选型

| 部分 | 选型 | 理由 |
|---|---|---|
| 前端框架 | **Nuxt 4**（Vue 3.5 + Vite） | 现有仓库基线；SSR/静态生成对文档型站点友好；`nitro.prerender` 可预渲染索引页 |
| 样式 | **Tailwind CSS + shadcn-vue** | 用户指定；shadcn 组件是"源码内"的，样式可控、无运行时 UI 库依赖 |
| 组件原语 | Reka UI（shadcn-vue 底层） | 无障碍交互（对话框/下拉/提示）不自己造 |
| 状态 | Pinia（已在基线）+ 组合式函数 | 全局仅"当前选中芯片/主题"这点状态，其余用 composable 局部状态 |
| 引脚图 | 纯 SVG（无 D3） | 引脚矩形 + 文字标签，无需物理力导向；手写能精确控制可点击区域与 label 布局 |
| 数据 | 静态 JSON + fetch（默认同源 `/data`，可切 CDN） | 无后端；数据集由 CI 每周产出；避免浏览器受系统代理/跨域影响 |
| 部署 | Cloudflare Pages / Netlify / GitHub Pages | 纯静态，任选；仓库已含 `netlify.toml` |

### 明确不用

- **UnoCSS**：与 Tailwind 二选一，shadcn-vue 生态基于 Tailwind，故迁移掉 UnoCSS（原 Vitesse 模板残留）。
- **D3**：见上。
- **运行时调用上游 CDN**：上游抖动实测 24% 静默失败（见 `docs/07-development-problems.md`），一律读 `pinatlas-data`。

## 6. 构建与部署

```bash
pnpm build            # Nitro 产物
pnpm generate         # 纯静态（推荐给 Pages）
node .output/server/index.mjs   # 本地预览
```

缓存策略：

- `index/*.json`、`st/**/*.json` 内容随 tag 变化 → `Cache-Control: public, max-age=3600`（CDN 侧 jsDelivr 自身有长期缓存）。
- 前端引用**固定 tag**（如 `@data-2026.09.23`），不要跟 `main`，否则 CDN 缓存会让数据与页面版本错配。
