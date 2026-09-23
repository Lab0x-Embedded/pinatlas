# PinAtlas 开发文档

通用芯片引脚数据库与可视化查询平台。输入型号 → 看封装引脚排列 → 点引脚看全部复用功能 → 按封装/密度切换。

## 文档索引

| 文档 | 内容 |
|---|---|
| [01-system-architecture](01-system-architecture.md) | 系统架构、两个仓库的职责、运行时数据流、技术选型 |
| [02-data-contract](02-data-contract.md) | 统一 JSON 契约、数据加载与缓存策略、数据缺口如何表达 |
| [03-frontend-architecture](03-frontend-architecture.md) | Nuxt 4 目录结构、组合式函数、状态管理、错误处理 |
| [04-ui-design](04-ui-design.md) | shadcn-vue 风格规范：设计令牌、组件清单、布局与交互 |
| [05-package-layout-engine](05-package-layout-engine.md) | 封装几何：quad / dual / grid 三套摆位引擎与视角约定 |
| [06-roadmap-milestones](06-roadmap-milestones.md) | 里程碑与验收标准 |
| [07-development-problems](07-development-problems.md) | 问题记录（已踩的坑 + 根因 + 解法） |

## 相关仓库

| 仓库 | 作用 |
|---|---|
| [Lab0x-Embedded/pinatlas](https://github.com/Lab0x-Embedded/pinatlas) | 前端（本仓库） |
| [Lab0x-Embedded/pinatlas-data](https://github.com/Lab0x-Embedded/pinatlas-data) | 统一引脚数据集 + 同步脚本（每周自动更新） |
| [LibrePCB/stm-db](https://github.com/LibrePCB/stm-db) | 主数据源（上游） |
| [embassy-rs/stm32-data-generated](https://github.com/embassy-rs/stm32-data-generated) | AF 号与寄存器元数据补源（上游） |

## 本地开发

```bash
pnpm install
pnpm data:pull    # 拉数据集快照到 public/data/（同源 /data）
pnpm dev          # http://localhost:3000
pnpm lint && pnpm test && pnpm typecheck
pnpm build
```

数据默认从 jsDelivr 读取（镜像默认 **fastly**，见 `docs/02-data-contract.md` §1）：

```bash
NUXT_PUBLIC_DATA_CDN_HOST=gcore.jsdelivr.net pnpm dev   # 换镜像
NUXT_PUBLIC_DATA_TAG=data-2026.09.23 pnpm dev           # 固定数据版本（生产推荐）
pnpm data:pull && NUXT_PUBLIC_DATA_LOCAL=true pnpm dev  # 完全离线（同源 /data 快照）
```

## 一句话范围

**做**：引脚查阅与可视化、跨封装切换、复用功能（含 AF 号）展示、数据来源可追溯。
**不做**：工程级代码生成（不替代 STM32CubeMX）。
