# 02 · 数据契约

前端只依赖 [pinatlas-data](https://github.com/Lab0x-Embedded/pinatlas-data) 产出的统一 JSON。**完整字段定义以该仓库的 `docs/unified-schema.md` 为准**，本文只记前端必须知道的约定。

## 1. 路径布局与 dataBase

```
{dataBase}/index.json                清单：上游 commit、总量、分片表
{dataBase}/index/{family}.json       分片索引：该系列的型号列表
{dataBase}/st/{family}/{chip}.json   单个封装的数据
{dataBase}/meta.json                 同步元信息（前端一般不用，可用于"数据更新时间"展示）
```

`dataBase` 按环境解析（`nuxt.config.ts`）：

| 场景 | dataBase | 怎么来 |
|---|---|---|
| 默认（开发 + 部署） | `https://fastly.jsdelivr.net/gh/Lab0x-Embedded/pinatlas-data@main/data` | jsDelivr 的 **fastly** 镜像（国内直连实测最快） |
| 换镜像 | `https://<host>/gh/…` | `NUXT_PUBLIC_DATA_CDN_HOST=cdn|fastly|gcore|testingcf.jsdelivr.net` |
| 固定版本（生产推荐） | 同上但用 tag | `NUXT_PUBLIC_DATA_TAG=data-2026.09.23` |
| 完全离线 / 自托管 | `/data`（**同源**） | `pnpm data:pull` 解快照到 `public/data/`，再 `NUXT_PUBLIC_DATA_LOCAL=true` |
| 任意基址 | 自定义 | `NUXT_PUBLIC_DATA_BASE=<完整 URL>` |

**为什么镜像可选**：本机实测直连 `fastly` 1.4s、`cdn` 2.5s、`gcore` 3.9s、`testingcf` 1.3s（都通，主站偶发抖动）。
浏览器经系统代理时**不要**把 `http://127.0.0.1:<port>` 当数据源（实测会被拦成 `Failed to fetch`），需要离线就用同源 `/data`。

`pnpm data:pull` 取的是数据仓库的 tarball（一次下载，不是 2800 次请求），可用 `DATA_REF=<tag|sha>` 固定版本：

```bash
pnpm data:pull                        # main
DATA_REF=data-2026.09.23 pnpm data:pull   # 固定 tag（生产推荐）
HTTPS_PROXY=http://127.0.0.1:7899 pnpm data:pull   # 需要代理的环境
```

## 2. 前端用到的字段

### 索引项（`index/{family}.json` → `chips[]`）

| 字段 | 用途 |
|---|---|
| `chip` | 唯一 id（含封装），如 `STM32F103C8Tx` |
| `displayName` | 列表主标题（`STM32F103C(8-B)Tx`） |
| `line` | 分组：`STM32F103` |
| `die` | **封装切换的分组键**：同一 die 的不同 package 互为"同芯片换封装" |
| `package` / `packageKind` | 显示封装名 + 决定布局引擎 |
| `pinCount` / `flashKb` | 列表副标题、筛选 |
| `part` | 实际数据文件路径（相对 `data/`） |

### 芯片数据（`st/{family}/{chip}.json`）

| 字段 | 用途 |
|---|---|
| `die` / `line` / `family` | 分组与面包屑 |
| `packageKind` | `quad` / `dual` / `grid` → 选布局引擎 |
| `pinCount` | **已合并变体**的物理引脚数，画图以此为准 |
| `memory` / `parts` | 侧栏信息卡（flash/ram/IO 数、订货号、状态） |
| `source` | 页脚"数据来源"（含上游 commit，可追溯） |
| `pins[]` | 见下 |

### pin 对象

数据契约版本：**v1.1.0**（数据仓库 `docs/unified-schema.md`）。

```jsonc
{
  "position": "22",           // 物理位置：线性引脚号，或网格坐标 "A1"；同文件内唯一
  "primary": "PA11",          // 主显示名：图上只渲染这个
  "aliases": ["VDDA"],        // 从名字拆出来的别名（可省略）
  "variantOf": "PA9",         // 可选：重映射标注指向的 pad（"PA11 [PA9]"）
  "pad": "PA11",              // 焊盘名（= primary）
  "name": "PA11 [PA9]",       // 上游原始名，保留可追溯
  "type": "gpio",             // gpio | power | ground | reset | boot | clock | mono | nc | other
  "osc": true,                // 可选：晶振相关（这类脚 type 直接是 clock）
  "functions": [ { "peripheral": "TIM1", "signal": "CH4", "af": 2, "type": "timer" } ],
  "variants": { "PINREMAP": { "name": "PA9 [PA11]", "primary": "PA9", "type": "gpio", "functions": [...] } }
}
```

**为什么拆 `primary` / `aliases` / `variantOf`**：上游把"主名 + 额外功能提示 + 第二个网络名 + 重映射标注"全塞在 `name` 里，直接渲染会出现「一个物理脚两个名字」并且分不清哪个是主名（`PC13-TAMPER-RTC`、`VDD/VDDA`、`PA11 [PA9]`）。拆分规则见数据仓库 `docs/unified-schema.md` 的对照表。

**兼容**：前端对 v1.0.0 数据（没有 `primary`）有兜底——`pinPrimary()` / `pinAliases()` 会按同一套规则现场拆分，所以新旧数据都能正确显示主名。

## 3. 前端必须遵守的三条

0. **图上只画 `primary`**，别直接画 `name`（否则会把别名当成主名，出现 `VDD/VDDA` 这种合成标签）；别名、重映射标注放 hover 和 Inspector。
1. **引脚数看 `pinCount`，不要看数组长度**（上游 14% 的线性封装文件存在重复 `position`，数据层已合并）。
2. **`af` 可能为 `null`**：表示"上游没有 AF 数据"，**不是 0**。整片 STM32F1 都是 `null`，UI 要显示成"—"而不是 `AF0`，并在型号页给一句说明。
3. **`functions[].system: true`** 的条目（`RCC_*`、`SYS_*`）不是可配置外设，详情面板单独分组（"系统/时钟"），不要和外设混排。

## 4. 数据缺口怎么表达

| 缺口 | 数据表现 | UI 处理 |
|---|---|---|
| 型号不在数据集 | 索引里没有 | 搜索空态给出"未收录" + 数据源链接 |
| 没有 AF 号 | `af: null` | 显示 `—`，面板顶部标注"该系列上游无 AF 数据" |
| 上游没有该型号 | `meta.json.enrichment.chipsNotPublishedUpstream` | 不展示（数据层负责） |
| 封装无几何（pitch/尺寸） | 数据里本来就没有 | 引脚图标注"示意排布，非按比例" |

## 5. 加载与缓存策略（按需，不一次拉全量）

| 时机 | 拉取 | 体积 |
|---|---|---|
| 首屏 | `index.json` 清单 | 8.7 KB |
| 选定型号 | 该型号**所在系列**的分片（其余 26 个系列不动） | 单系列几 KB ~ 30 KB |
| 展开某个系列 | 该系列分片 | 同上 |
| 开始搜索 | 后台补齐剩余系列，结果随到随显示（显示"已加载 X/27"） | 全量索引约 250 KB（gzip 32 KB） |
| 点某个型号 | 该型号的芯片文件（按 chip id 缓存，来回切不重复请求） | 平均 12 KB（gzip 2.4 KB） |

- 2781 个芯片文件（约 34 MB）**永不预取**。
- 型号 → 系列用"系列名是型号前缀"推导（`STM32F103C8Tx` → `STM32F1`、`STM32MP151AACx` → `STM32MP1`）；命中后只拉那一个分片。
- 同一 die 的其它封装同属一个系列，所以加载当前系列就能支撑封装切换。
- 请求失败：重试 2 次（指数退避）→ 失败展示错误态 + 重试按钮；**不要静默空白**（上游抖动实测 24% 静默失败）。
- 数据版本：`runtimeConfig.public.dataTag` 里记 tag，页脚显示"数据版本"，便于问题定位。

## 6. 新增厂商（未来）

数据仓库加 `convert-{vendor}.mjs`，输出同一份契约即可；前端只需要保证 `packageKind` 与 `type` 枚举在映射表内，其余字段原样渲染。**前端不做厂商判断。**
