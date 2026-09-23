# 06 · 里程碑与验收标准

每个里程碑都必须有"可验证的产出"，不用"完成度百分比"衡量。

## 已完成

| 里程碑 | 产出 | 验收证据 |
|---|---|---|
| **M0 数据基础设施** | [pinatlas-data](https://github.com/Lab0x-Embedded/pinatlas-data)：同步脚本 + 每周 CI + 统一 JSON + 索引 | 本机试跑 F1(40)/G0(25) 零失败；AF join 命中 60–84% |
| **M1 数据契约与探针** | 统一 Schema v1.0.0、双源调查报告、上游结构坑清单 | `pinatlas-data/docs/data-report.md`（覆盖率、AF 命中率、CDN 抖动等实测数字） |
| **M2 封装布局规则** | quad/dual/grid 三套摆位规则 + 校验清单 | LQFP48 逐脚对照 ST 数据手册一致；TFBGA216 行字母跳字实测（见 05） |
| **M3 前端骨架 + quad/dual 引脚图** | Nuxt 4 + Tailwind v4 + shadcn-vue 基座；左栏列表、中栏引脚图、右栏详情；`layoutPackage()` 支持 quad/dual | `pnpm lint/test/typecheck/build` 全绿（42 用例）；LQFP48 → 48 个可聚焦引脚、字号 25.1、横向/竖向引脚各 24 |
| **M4 网格封装** | grid 引擎（行列极值 + JEDEC 跳字 + 稀疏网格 + 外围行列坐标头） | TFBGA361（实际 32 行×23 列）→ 361 球、110 个坐标头、稀疏告警、球号因格子 18.1 < 26 不画 |
| **M5 封装切换 + 变体** | 同 `die` 的其它封装列表、切换不丢上下文；变体切换（`PINREMAP`…） | `STM32G031K8Tx` 切到 `PINREMAP` 后画 32 脚（上游 36 条已合并） |
| **M6 搜索与分享** | 索引搜索（chip/displayName/line）、URL query 状态、按需分片加载 | `?chip=…&pin=…&variant=…` 刷新可复现；首屏只拉当前系列分片（DOM 203 KB vs 全量 939 KB） |

## 待办

| 里程碑 | 范围 | 验收标准 |
|---|---|---|
| **M7 物理 Pin 数据模型 v1.1 + 三层 UI** | 见 `docs/08-pin-model-and-ui-redesign.md`：`primary`/`aliases` 拆分、`functions[].type`、类型枚举改名、校验器门禁；Navigator + Package View + Inspector + Pin Matrix + 功能搜索 | ① 数据仓库校验器 0 violation；② 图上不再出现 `VDD/VDDA`、`PA11 [PA9]` 这类合成名；③ 144 脚封装 Density Mode 只显号，名称靠 hover/Inspector |视图；③ 数据不可用时显示错误态 + 重试 |
| **M7 部署与缓存** | Cloudflare Pages / Netlify / GitHub Pages 三选一；数据固定 tag；页脚数据版本 | ① 线上可访问、Lighthouse 性能 ≥ 90；② 页脚显示数据 tag 与上游 commit；③ 切换数据 tag 无需改代码，只改构建变量 |
| **M8 多厂商** | 数据侧新增适配器（ESP32 / RP2040 / GD32 / CH32），前端零改动 | ① 数据集里出现第二个 vendor；② 前端只靠 `packageKind`/`type` 即可正确渲染，无厂商判断分支 |

## 明确不做

- 工程级代码生成（不替代 STM32CubeMX）。
- 全量型号覆盖（优先 STM32 主流，其余逐步补）。
- 电气参数/时序/封装机械图（pitch、本体尺寸上游没有，不臆造）。

## 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 上游格式变化 | 同步失败 | 数据层校验 + 非零退出 + 失败清单；前端只依赖契约 |
| 上游停更（stm-db 由个人维护） | 数据陈旧 | 保留本地生成能力（CubeMX `extract.py` 路径），必要时 fork |
| BGA 视角约定未抽验 | 图方向可能反 | 图上明确标注视角；M4 抽验 3 个封装并回写本文档 |
| 数据集体积增长 | 仓库/加载变慢 | 单封装一文件、gzip 后约 2.4 KB；索引分片 |
| 数据版权 | 合规 | NOTICE 标注来源与 ST 版权，不暗示背书 |
