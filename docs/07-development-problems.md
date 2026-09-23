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

### 14. 引脚图改用 Canvas 试做后回退 SVG（结论：元素量级决定渲染方式）

**背景**：初版 SVG，按要求改成 Canvas，实测后按要求回退 SVG。

**Canvas 版暴露的两个真问题**：
1. **悬停卡顿**：单层实现每次 `mousemove` 都要重画整幅（361 球 + 文字），并且 `canvas.width = …` 会丢弃并重建整个位图缓冲区；改成分层（静态层 + 覆盖层）+ 只在尺寸变化时重分配才能压下去。
2. **文本挤压**：字号写死 26/22 逻辑单位，LQFP100 每边 25 脚、行距只有 23.2 单位 → 整片压叠（这条其实是渲染层与几何脱节，SVG 同版也有，见 §15）。

**Canvas 必须手工补偿的东西**（SVG 天然白拿）：命中区（`hitTestSlots` 几何反查）、per-pin 焦点（画布整体 `tabindex` + `neighborSlot` 方向键）、屏幕阅读器（`aria-live` 播报）、主题切换（绘制时读 CSS 变量重绘）、文字排版。

**回退结论**：本元素量级（最大 19×19/32×23 网格、几百个节点）SVG 完全够，且交互/无障碍/主题/矢量导出全部免费；Canvas 的收益（上万元素、逐帧动画）在这里不成立。

**保留的成果**（渲染方式无关，已抽成 `app/utils/label-policy.ts`）：
- **字号策略**：字号随行距/格子反推（`numberFont = clamp(pitch×0.52, 9, 26)` 等），放不下就不画 pad 名 / 球号 → 任何封装都不压叠；
- **`fitText()`**：SVG `<text>` 不自动收缩，超宽截断加省略号（中文按全宽计）。

**验证**：headless dump-dom 三个场景，DOM 里可直接量：LQFP48 → 48 个可聚焦引脚 + 字号 25.1/21.3；LQFP100 → 100 个引脚 + 字号 12.1 + 不画 pad 名；TFBGA361（实际 32 行 × 23 列，不是 19×19）→ 361 球 + 110 个行列坐标头（字号 10）。

### 15. 左右两边的引脚画成了竖条（与封装朝向相反，且同列压叠）

**症状**：`data-number-font` 之类的短封装看不出来，LQFP48 渲染后左右两列引脚是**竖向长条**（34 宽 × 64 高），与上下两边一样竖着；且 64 高 > 行距 48.3，同一列的引脚互相压叠。

**根因**：`package-layout.ts` 里 quad 分支只给了坐标、没给长宽方向，沿用了循环外的默认 `w = pinWidth, h = pinLength`（那是给上下两边准备的）。QFP 引脚应垂直伸出本体，左右两边必须是**横向**长条（`w = pinLength, h = pinWidth`）。dual 分支当时写了交换，所以只有 quad 出错。

**解法**：四个分支各自显式写 `w/h`；补 4 组断言（左右横向/上下竖向、贴本体边缘、同列不重叠、dual 两列顺序）——这类几何错误只能靠断言，截图对比看不出来。

**验证**：headless DOM 里数矩形：LQFP48 → 48 个矩形，横向 24（左右两列）+ 竖向 24（上下两边）。

### 16. 主名拆分把 AF join 键拆坏（覆盖率静默掉 1.2pp）

**症状**：schema v1.1.0 全量重跑后，数据集 AF 覆盖率 35.87% → 34.63%；`afSlots` 完全没变，说明不是功能数变了，而是**匹配数**掉了。掉幅集中在 L4/L4+/L5/H5/H7/N6/U0/U3/U5/WBA 十个家族。

**定位过程**（值得复用）：
1. 先在两个型号上做 A/B（`git stash push scripts/lib/normalize.mjs` 跑一遍旧代码）→ 命中数完全一致，**排除**改动本身；
2. 再比对两次 run 的 `meta.json`：上游 ref、补源体积、过滤器全部相同 → 排除上游漂移；
3. 最后直接用 `git show <rev>:data/st/.../X.json` 逐脚对比**新旧提交里的同一个型号文件**，差异立刻现形：
   `PA13 (JTMS/SWDIO)` 的 `pad` 从 `PA13` 变成了 `PA13 (JTMS`。

**根因**：`splitPinName()` 先按 `/` 拆、再摘圆括号，于是 `PA13 (JTMS/SWDIO)` 被斜杠切断，`primary` 残留了半个注释。而 `primary`（= `pad`）正是 **embassy AF join 的键**，键错了就静默丢匹配（STM32L412C8Ux 少 17 个 AF）。L4/H7 这类家族的行尾注释恰好带斜杠，所以只有它们掉。

**解法**：改成**先摘方括号标注、再摘圆括号注释、最后按 `/` 和 `-` 拆**；括号内容当别名，等于主名则丢弃。修复后 STM32L412C8Ux 回到旧的 154/217。

**防回归**：
- 校验器新增硬规则 `primary-clean`：`primary` 含空格或括号即判失败（不发布该文件）；
- 数据仓库加 `node --test scripts/lib/*.test.mjs`（12 例，含上游真实名字形态）并接进 CI，在同步前先跑。

**教训**：这类"字段拆错 → 下游 join 少匹配"的 bug 不会抛错，只会让指标悄悄变差。所以①任何派生字段都要有断言锁住真实形态；②跨版本的指标对比（这次是 meta.json 的家族级覆盖率）是发现它的主要手段。

## 三、待验证（已知风险，未闭环）

| 项 | 现状 | 计划 |
|---|---|---|
| BGA/WLCSP 视角约定（俯视 vs 底视） | 默认 grid 用底视、quad/dual 用顶视，图上标注 | M4 抽验 3 个封装，回写 05 文档 |
| 非方形四边封装每边引脚数 | 上游只有引脚号，无每边数 | 遇到时按数据手册补 `packageGeometry` 覆盖表 |
| STM32F1 的 AF 号 | 上游 embassy 完全没有 | 从数据手册 AF 表人工补一次（F1 只有 4–5 个 die） |
