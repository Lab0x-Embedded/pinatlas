# 07 · 问题记录

按"症状 / 根因 / 解法"记录已踩过的坑。全部为实际发生并已解决或已规避的问题。

## 一、数据 / 上游

### 1. `pnpm install` 报告 lockfile 损坏（多个 YAML 文档）

**症状**：`WARN Ignoring broken lockfile: expected a single document in the stream, but found more`，然后重新解析全部依赖（`resolved 1287`），安装被拖慢/中断。

**根因**：`pnpm-lock.yaml` 里被写入了**两个 YAML 文档**：前 100 行是 pnpm 12.3.4 自己的"引导锁文件"（`importers..: packageManagerDependencies: pnpm 12.3.4` + `@pnpm/exe.*`），`---` 分隔之后才是本项目的锁文件。corepack 缓存显示 12.3.4 于 10:51 被拉取、10.52（packageManager 改回 10.22.0）之前那次运行留下了这段内容。pnpm 要求单文档，于是整份锁文件被丢弃。

**解法**：备份后删除前 100 行，保留项目锁文件；`pnpm install --frozen-lockfile` 校验通过后再正式安装。

**预防**：`packageManager` 字段与实际运行的 pnpm 版本保持一致；不要在两个大版本间来回切。

### 2. 并行抓取上游 CDN 会静默丢文件

**症状**：抓 49 个文件，其中 12 个（24%）拿不到数据，但 curl 单独复测全部 200。

**根因**：jsDelivr/代理在并发下的偶发失败，无重试就等于丢数据。

**解法**：`scripts/lib/http.mjs` 强制"重试 + JSON 校验 + 空响应视为失败"；实测 3 次重试后 492 个文件仍有 6 个（1.2%）失败 → 因此**失败必须写进 `meta.json` 并让进程退出码非 0**，绝不静默。

**预防**：前端不从上游 CDN 取数，只读 pinatlas-data 的固定 tag。

### 3. `pinout` 条目数 ≠ 封装引脚数

**症状**：`STM32G031K8Tx` 是 LQFP32，但 `pinout` 有 36 条、`position` 19/21/22/23 重复。

**根因**：上游用 `variant` 字段表达**引脚重映射**：同一物理引脚在不同变体下功能不同（甚至变 NC），所以一个 position 有多条记录。

**解法**：按 `position` 合并，变体进 `variants`（转换后 32 个引脚）。

### 4. 网格封装的坐标不能按 √N 推

**症状**：`TFBGA216` 若按 216 开方估行列会得到非整数/错误网格。

**根因**：BGA/WLCSP 是稀疏矩阵——15×15 只有 216 球（缺 9 格），`UFBGA100` 是 12×12 只有 100 球。

**解法**：行列取 position 的字母/数字极值；空格不画球但保留编号。

### 5. BGA 行字母跳过 I/O/Q/S/X/Z

**症状**：把第 k 个字母当第 k 行，`TFBGA216` 从第 10 行开始整体错位。

**根因**：JEDEC 约定行标不使用 `I O Q S X Z`（易与 1/0 混淆）。实测 `TFBGA216` 行字母为 `A…H J…N P R`。

**解法**：行字母 → 行号用白名单映射，不用字母表索引。

### 6. embassy 补源不能当引脚源用

**症状**：指望用 embassy 补缺失型号的引脚展示，结果 GPI Ox 外设的 `pins` 全空（实测 112 个 GPIO 外设、0 个有引脚）。

**根因**：它的数据是给 Rust 框架生成代码用的，引脚信息以"peripheral → pin → signal + af"组织（外设视角），且 F1 系列完全没有 AF。

**解法**：重定位为两件事——**AF 号来源**（反向 join，命中 93.6%）与**寄存器/手册/内存元数据**；封装与引脚展示一律以主源为准。

## 二、前端 / 工具链

### 7. `gh` 不走 git 的代理配置

**症状**：`git push` 正常，但 `gh repo create` / `gh api` 报 `TLS handshake timeout`。

**根因**：git 读 `http.proxy`（本机配了 `127.0.0.1:7899`），而 `gh` 只认 `HTTPS_PROXY`/`HTTP_PROXY` 环境变量。

**解法**：`export HTTPS_PROXY=http://127.0.0.1:7899 HTTP_PROXY=… && gh …`；同步脚本的 HTTP 层默认走 `curl` 并自动带上该代理，这样本机与 CI 都能跑。

### 8. Actions 定时任务 60 天无活动会被停用

**症状**：仓库安静两个月后，每周同步不再触发。

**根因**：GitHub 对 `schedule` 的规则：仓库 60 天无活动即暂停。

**解法**：同步脚本每轮都重写 `data/meta.json`（含 `checkedAt`），**必然产生一次提交**，等于心跳；同时保留 `workflow_dispatch` 手动兜底。

### 9. 分支 URL 的 jsDelivr 缓存不一致

**症状**：同一 URL 不同时间取到不同内容，导致数据版本漂移。

**根因**：jsDelivr 对分支引用有缓存。

**解法**：数据同步与前端引用**一律用 commit sha / tag**，绝不使用 `@master`/`@main`。

### 10. 前端仓库原本不是 git 仓库

**症状**：`git status` 报 `fatal: not a git repository`。

**根因**：pinatlas 是从 Vitesse 模板下载解压的目录，没有 `.git`。

**解法**：`git init -b main` → 首次提交（44 个源文件，`node_modules/.nuxt` 已被 `.gitignore` 拦住）→ 推送到 `Lab0x-Embedded/pinatlas`。

### 11. `pnpm lint --fix` 会改坏 `pnpm-workspace.yaml`

**症状**：跑完 `pnpm lint --fix` 后 `pnpm install` 直接报 `ERR_PNPM_CATALOG_ENTRY_INVALID_RECURSIVE_DEFINITION: The entry for '@antfu/eslint-config' in catalog 'dev' is invalid`。

**根因**：pnpm 的 eslint 插件在 autofix 时会把 `catalogs` 里的版本号改写成 `catalog:<同名组>`（例如 `catalogs.dev.'@antfu/eslint-config': catalog:dev`）。那是**自引用/递归定义**，pnpm 拒绝解析。本仓库实测复现过一次（工作区文件被改坏 → install 失败）。

**解法**：在 `eslint.config.js` 里对 `pnpm-workspace.yaml` 关掉相关规则（`yaml/sort-keys`、`pnpm/yaml-blank-lines`、`pnpm/yaml-no-duplicate-catalog-item`、`pnpm/yaml-no-unused-catalog-item`），并在文件里写了注释；`package.json` 一侧也关掉了 `pnpm/json-enforce-catalog`（因为它与 `pnpm install` 的写回行为互相打架，见下）。

### 12. `pnpm install` 会把 `catalog:` 写回字面版本

**症状**：`package.json` 写成 `"nuxt": "catalog:build"`，跑一次 `pnpm install` 之后变回 `"^4.5.2"`；而 eslint 又要求写 catalog，两个工具来回改。

**根因**：本仓库的 pnpm 配置（`trustPolicy: no-downgrade` / `update.ignoreDeps` 等）在重新解析依赖时会把 catalog 引用展开成具体版本写回 `package.json`。

**解法**：以 `pnpm install` 为准（装不上比风格问题严重），关掉 `pnpm/json-enforce-catalog`；版本仍集中在 `pnpm-workspace.yaml` 的 `catalogs` 里维护。

### 13. 迁移样式体系后必须重启 dev server

**症状**：把 UnoCSS 换成 Tailwind 后，浏览器刷新页面**没有任何样式**（纯 HTML）。

**根因**：正在跑的 dev server 是迁移前启动的进程，它的模块图里还有已删除的 `uno.config.ts`，也不会加载新的 `main.css`。
（本项目还额外踩到一条：浏览器经系统代理时 `http://127.0.0.1:<port>` 会被拦；页面在 `localhost` 上、数据在 `127.0.0.1` 上就会 `Failed to fetch`。）

**解法**：改完样式入口/配置后重启 dev server；数据统一走同源 `/data`（见 02-data-contract §1），避免 localhost 与 127.0.0.1 混用。

### 14. 引脚图从 SVG 改为 Canvas（按明确要求迁移）

**背景**：初版用 SVG（每脚一个 `<rect>`/`<circle>`），交互/主题/无障碍都白拿。按要求改成 Canvas。

**代价与补偿**（都在代码里落实了）：

| Canvas 丢掉的 | 补偿做法 |
|---|---|
| 元素即命中区 | `hitTestSlots()` 几何反查（矩形点在框内 + slack、球用半径），实测 361 球下无压力 |
| 每个引脚可聚焦 | 画布 `tabindex="0"` + `neighborSlot()` 方向键导航（四边沿边走、垂直跳对边；网格按方向加权） |
| 屏幕阅读器可读 | `role="img"` + `aria-label` + `aria-live="polite"` 播报"引脚号/名称/类型/功能数" |
| class 主题切换 | 绘制时从 CSS 变量读调色板，`colorMode` 变化重读重绘 |
| 矢量导出 | 未补（`canvas.toDataURL()` 可导出位图；要矢量得另说） |

**顺带的好处**：绘制逻辑只依赖最小 ctx 接口，于是能在 Node 里用记录式假 ctx 做单测（`test/canvas-render.spec.ts`：48 脚画 48 块 + 96 段文字、选中多一个环、NC 虚线、命中/导航规则），不需要截图比对。

**验证**：headless dump-dom 三个场景（LQFP48 / LQFP32+变体 / TFBGA361），canvas 上 `data-slots=48|32|361`、`data-kind=quad|grid`、`data-renders≥2`（说明绘制跑完没抛错），页面里已无 SVG 引脚元素。

## 三、待验证（已知风险，未闭环）

| 项 | 现状 | 计划 |
|---|---|---|
| BGA/WLCSP 视角约定（俯视 vs 底视） | 默认 grid 用底视、quad/dual 用顶视，图上标注 | M4 抽验 3 个封装，回写 05 文档 |
| 非方形四边封装每边引脚数 | 上游只有引脚号，无每边数 | 遇到时按数据手册补 `packageGeometry` 覆盖表 |
| STM32F1 的 AF 号 | 上游 embassy 完全没有 | 从数据手册 AF 表人工补一次（F1 只有 4–5 个 die） |
