<p align="center">
  <img src="./public/logo.png" alt="PinAtlas" width="132" />
</p>

<h1 align="center">PinAtlas</h1>

<p align="center">通用芯片引脚查询与可视化：封装引脚图 · 复用功能 · AF 号</p>

<p align="center">
  <a href="https://pinatlas-six.vercel.app">在线预览</a> ·
  <a href="./docs">开发文档</a> ·
  <a href="https://github.com/Lab0x-Embedded/pinatlas-data">数据集仓库</a>
</p>

---

## 是什么

输入型号 → 看封装引脚图 → 点引脚看复用功能与 AF 号。目标是**通用**（不限 STM32，后续 ESP32 / RP2040 / GD32 / CH32），
前端只依赖统一 JSON 契约，**不做厂商判断**。

- 数据：[Lab0x-Embedded/pinatlas-data](https://github.com/Lab0x-Embedded/pinatlas-data)（主源 LibrePCB/stm-db，AF 号由 embassy-rs/stm32-data-generated 补全）
- 规模：**2781 个型号 / 27 个家族分片**，前端按需拉取（首屏只拉 9 KB 清单 + 当前家族分片，点哪个型号才拉哪个文件）
- 线上：<https://pinatlas-six.vercel.app>（Vercel，Git 集成自动部署）

## 功能

**封装引脚图**（SVG，几何由纯函数 `layoutPackage()` 算出，与渲染解耦）

- 三套布局：`quad`（QFP/QFN）/ `dual`（SOP/TSSOP）/ `grid`（BGA/WLCSP，行列取 position 极值，稀疏矩阵如实呈现）
- 引脚名写在**引脚块里**（CubeMX 风格，块内垂直居中、上下两排竖排），引脚号在块外；本体中心印型号丝印
- **字号全部由几何反推**：引脚号 `0.52×行距`、引脚名 `min(0.44×行距, (块宽−4)/1.15)`，放不下就不画（Density Mode），
  所以 LQFP208 这类密脚封装也不会压叠；LQFP100 反而因为名字进了块内而能显示
- 交互：悬停看 pad 名与前 3 个功能、点击选中引脚、键盘 Tab 聚焦 + Enter/Space 选中（方向键按封装顺序跳相邻脚只在 Canvas 实验版做过，见 `docs/07 §14`）

**过滤与高亮**

- 功能类别（图上方）：`全部 / GND / 5V / 3V3 / GPIO / UART / I2C / QSPI / I2S / JTAG / PDM / PWM`，
  点击高亮命中引脚（加粗描边、其余淡化），带匹配计数，计数为 0 的禁用不隐藏
- 引脚类型图例：按语义类型着色（GPIO/时钟/单功能/电源/地/复位/启动/未连接），点击只看某一类

**引脚详情**

- 主名 / 别名 / 重映射标注（`PA11 [PA9]`、`PC2_C`）与变体切换（基础定义 / `PINREMAP` / `PINREMAP_10_12`）
- 按外设分组的复用功能 + AF 号；**上游没有 AF 数据时显示 `-` 而不是 `AF0`**（F1 全系如此）
- 变体下变 NC 的脚跟着变，详情随变体切换

**其它**：状态进 URL 可分享（`?chip=STM32F103C8Tx&pin=20&variant=PINREMAP`）、深浅主题、PWA 离线（自动更新）。

## 技术栈

|      |                                                                                  |
| ---- | -------------------------------------------------------------------------------- |
| 框架 | Nuxt 4.5 + Vue 3.5 + TypeScript（`future.compatibilityVersion: 4`）              |
| 样式 | Tailwind v4 + shadcn-vue（reka-ui），令牌定义在 `app/assets/css/main.css`        |
| 状态 | Pinia（`app/stores/chips.ts`）                                                   |
| 数据 | 客户端按需拉取 jsDelivr 上的数据集，**固定不可变 tag**（见下）                   |
| PWA  | @vite-pwa/nuxt（workbox，离线 + autoUpdate）                                     |
| 规范 | ESLint（@antfu/eslint-config）、Vitest、`nuxt typecheck`，CI 跑 lint + typecheck |

## 快速开始

```bash
pnpm install
pnpm dev --port 3001        # 开发（本仓库日常用 3001）
pnpm test                   # Vitest（几何/字号/类型/类别规则都有单测）
pnpm lint && pnpm typecheck
pnpm build                  # 产物 .output（Vercel 会自动识别 nitro 预设）
```

数据默认走 `https://fastly.jsdelivr.net/gh/Lab0x-Embedded/pinatlas-data@<tag>/data`，`<tag>` 写在 `nuxt.config.ts`：

- **不要用 `main`**：jsDelivr 对分支引用有缓存，同一 URL 会拿到新旧两份数据，枚举不一致会让引脚整批变黑（见 `docs/07 §17`）
- 换版本：改 `NUXT_PUBLIC_DATA_TAG`（或用 `NUXT_PUBLIC_DATA_BASE` 指向自建/镜像）
- 完全离线：`pnpm data:pull` 解一份快照到 `public/data/`，再设 `NUXT_PUBLIC_DATA_LOCAL=true`

## 部署

Vercel 官方 Git 集成，默认配置即可（框架预设 Nuxt.js、`pnpm build`、Node 22）。
稳定域名 <https://pinatlas-six.vercel.app>；注意**部署专属 URL**（`pinatlas-xxx-<user>.vercel.app`）默认开着访问保护，会 302 到验证页。

图标与品牌资源统一从 `public/logo.png` 派生（`favicon.ico` / `apple-touch-icon.png` / PWA 三件套），见 `docs/04 §1.1`。

## 文档

| 文档                                                            | 内容                                                       |
| --------------------------------------------------------------- | ---------------------------------------------------------- |
| [01 系统架构](./docs/01-system-architecture.md)                 | 数据流与分层                                               |
| [02 数据契约](./docs/02-data-contract.md)                       | 前端依赖的字段、路径布局、数据版本策略                     |
| [03 前端架构](./docs/03-frontend-architecture.md)               | 目录结构、store、URL 状态                                  |
| [04 UI 设计规范](./docs/04-ui-design.md)                        | 令牌、组件清单、引脚图视觉规范、品牌资源                   |
| [05 封装布局引擎](./docs/05-package-layout-engine.md)           | `layoutPackage()` 的规则与验证                             |
| [06 里程碑与验收](./docs/06-roadmap-milestones.md)              | 阶段目标                                                   |
| [07 问题记录](./docs/07-development-problems.md)                | 踩过的坑与定位方法（含 canvas/svg、jsDelivr 缓存、黑块等） |
| [08 Pin 模型与 UI 重构](./docs/08-pin-model-and-ui-redesign.md) | 以物理 pin 为核心的重构计划                                |
| [09 部署（Cloudflare）](./docs/09-deploy-cloudflare.md)         | 历史部署路径与相关排查记录                                 |

## 数据来源与许可

- 主源 [LibrePCB/stm-db](https://github.com/LibrePCB/stm-db)，AF/寄存器等补源 [embassy-rs/stm32-data-generated](https://github.com/embassy-rs/stm32-data-generated)；
  上游数据源自 ST 官方文档，**版权归 STMicroelectronics**，本项目只做格式统一与展示。
- 本仓库代码 MIT（`LICENSE`，模板来自 [antfu/vitesse](https://github.com/antfu/vitesse)）。
- 引脚图是**示意排布**，非按比例；工程使用请以数据手册为准。
