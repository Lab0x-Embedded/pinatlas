# 08 · 以物理 Pin 为核心：数据模型与三层 UI 重构计划

> 本文是设计评审稿，落地前请确认 §7 的三个决策点。
> 对齐用户提出的「PinAtlas 不是把 JSON 画成芯片的组件，而是以物理 Pin 为核心的 MCU 引脚浏览器」。

## 1. 现状核对（实测，不是印象）

抽样 12 个型号 / 510 个引脚（STM32F1/F4/G0，LQFP48・UFQFPN48・WLCSP49・TSSOP20・SO8N）核对：

| 用户提议 | 现状 | 差距 |
|---|---|---|
| 物理 Pin 与主信号名、复用功能分离 | `pin = {position, pad, name, type, rawType, functions[], osc?}`，`functions[] = {peripheral, signal, af, system?}` | **部分**。`position` 已独立且唯一（510 脚重复 0）；脏的是 `name`/`pad`：`VDD/VDDA` 12 例、`PA11 [PA9]` 7 例、`PC13-TAMPER-RTC` 一类 `-` 后缀 67 例 |
| 一个物理 Pin = 一个主名称 | 一个 Pin 一条记录，但**主名里塞了别名/后缀**：`pad` 也可能是 `VSSA/VREF-` | 需要 `primary` + `aliases[]` 拆分 |
| `type` 枚举 power/ground/gpio/analog/reset/clock/nc | 实际输出：`io` 400、`power` 52、`ground` 36、`reset` 12、`boot` 8、`mono` 2 | 命名不一致（`io` vs `gpio`）；**`analog` 上游不存在**；`clock` 可由 `osc:true` / `OSC_*` 派生 |
| `functions[].type`（adc/timer/spi/…） | 没有。只有 `peripheral` + `signal` | 可从 `peripheral` 前缀派生，成本低 |
| `functions[].alternate`（AF 号） | 已有 `af`（embassy 补源 join） | 达标（F1 系列上游缺失，已文档化） |
| `aliases` | 无 | 新增 |
| `position.side` / `index` | 数据里没有；前端布局引擎算 `slot.side`，左边同理可给 `index` | **建议不写进数据**（同一 die 多个封装，side/index 随封装变），作为视图模型派生（§2.4） |
| 数据校验器 | 数据仓库有 per-chip 校验（position 唯一/格式/网格编码），失败降级为告警 | 需要按你的清单补全并在 CI 里作为**门禁**（§2.5） |
| 四边通用布局（不写 `if (pinCount === 32)`） | 已经是 `perSide = ceil(count / sides)`，quad/dual/grid 三套 | 达标 |
| Pin Number 在外侧、Pin Name 在本体内侧 | 已实现（`labelStyle()`，见 docs/04 §5） | 达标 |
| 密封装降级（只显号/点） | 有字号策略（`labelPolicy`）：行距 <26 单位不画 pad 名 | 需要「Density Mode」显式化（§3.2） |
| Pin 1 标识 | 已画黑点（本体内左上角） | 需随封装朝向旋转（后置，见 §6 第 5 阶段） |
| 按功能搜索并高亮所有对应脚 | store 只有型号级搜索 | 需要功能级搜索 + 列表 + 图上高亮（§4.4） |
| Pin Matrix 表格与图/详情联动 | 无 | 新增（§4.3） |
| 左侧 Pin Navigator / 右侧 Inspector 三层布局 | 现为「左芯片列表 + 中图 + 右引脚详情」，中间层还没升级成 Navigator+Inspector | 需要重构页面壳（§4） |
| Datasheet / Explorer 双模式 | 无 | 后置（§6 第 4 阶段） |

## 2. 数据模型（schema v1.1，数据仓库改动）

### 2.1 Pin 结构

```jsonc
{
  "position": "7",          // 物理位置，唯一（网格封装为 "A1"）
  "pad": "PA0",             // 焊盘名（保持上游原样，便于对照数据手册）
  "primary": "PA0",         // 主显示名：从 name 剥离别名/后缀后的干净名字
  "name": "PA0-WKUP",       // 上游原名，保留可追溯
  "aliases": ["WKUP"],      // 别名/后缀拆出来的部分
  "type": "gpio",           // 见 2.2
  "rawType": "I/O",         // 上游原始类型
  "osc": true,              // 时钟相关（派生 clock 类型的依据）
  "variant": "PA11 [PA9]",  // 变体重映射（若存在）：原样保留
  "functions": [
    { "peripheral": "ADC1", "signal": "IN0", "af": null, "type": "adc" }
  ]
}
```

**拆分顺序（踩过坑，别改）**：先摘方括号重映射标注 → 再摘行尾圆括号注释 → 最后按 `/` 和 `-` 拆。
`primary` 必须干净（`^[A-Z][A-Z0-9_+]*$`），因为它就是 **embassy AF join 的键**：拆错不会报错，只会让
AF 覆盖率静默下降（`PA13 (JTMS/SWDIO)` 曾被拆成 `PA13 (JTMS`，整片 L4/L5/H7/U5 掉 1.4~7pp，见 docs/07 §16）。
数据仓库已加 `primary-clean` 校验规则与 `node --test` 单测兜底。

### 2.2 类型枚举（命名对齐）

| 新枚举 | 旧值 | 判定依据 |
|---|---|---|
| `gpio` | `io` | 上游 `I/O`；命名改为 gpio（用户提议） |
| `power` | `power` | 上游 `Power` / `VDD*` |
| `ground` | `ground` | 引脚名 `VSS*` |
| `reset` | `reset` | 上游 `Reset` / `NRST` |
| `boot` | `boot` | 上游 `Boot` / `BOOT0` |
| `clock` | 新增 | `osc:true` 或 `OSC_IN`/`OSC_OUT`/`OSC32_*` |
| `nc` | `nc` | 上游 `NC` |
| `mono` | `mono` | 上游 `MonoIO`（VREF+/DNU/PDR_ON 等单功能脚，保留，不硬塞进别的类） |
| `other` | `other` | 兜底 |

> `analog` 单独成类的证据不足（上游无此值），ADC 类引脚保留 `gpio`/`mono` 类型 + `functions[].type='adc'` 表达，避免造一个没有数据支撑的类。

### 2.3 functions[].type 派生

`peripheral` 前缀 → `gpio | adc | timer | spi | i2c | uart | can | usb | system | other`（`system:true` 的 RCC/NVIC 类归 `system`）。

### 2.4 side / index 不写进数据

理由：同一片 die 出现在多个封装（`STM32F401CBUx` UFQFPN48 vs `STM32F401CCFx` WLCSP49），side/index 随封装变，写进数据会立刻过期。改由布局引擎输出视图模型：`slot.side`（已有）+ `indexInSide`（新增，用于 Pin Navigator 与 Inspector 的「Package Position」）。

### 2.5 校验器（CI 门禁，按用户清单）

```
✓ pin position 唯一
✓ pin 数与封装名一致（LQFP48 → 48）
✓ 每个 pin 恰好一个物理位置
✓ side/index 不冲突（视图层校验）
✗ 物理 pin 不可重复
✓ functions 可重复
✓ aliases 可重复
```
输出写入 `meta.json` 的 `validation` 块（`checked` / `violations[]`），CI 有 violation 即失败。

## 3. 渲染器

### 3.1 已完成（保持）

- 四边通用：`perSide = ceil(count / sides)`，无 `pinCount` 分支；quad/dual/grid 三套几何。
- 引脚号在外侧、pad 名在本体内侧；左右两边引脚为横向长条（伸出本体）。
- 字号策略 `utils/label-policy.ts`：字号随行距/格子反推，放不下就不画（解决密封装压叠）。
- BGA 行列坐标头；变体合并（`position` 唯一）；稀疏网格告警。

### 3.2 待做

1. **Density Mode**：`pinsPerSide > 24` 时只画引脚号；`> 40` 时只画引脚块（号也省），名称全靠 hover + Navigator。以 `pinCount`/`pinsPerSide` 为唯一判据，不写具体型号。
2. **显示名切换**：图上画 `primary`（干净名）+ 别名折叠进 hover/Inspector，彻底消除 `VDD/VDDA`、`PA11 [PA9]` 这类合成标签。
3. **搜索高亮层**：命中的引脚加环/加粗，其余降透明度（与图例过滤同一套视觉语言）。

## 4. 三层 UI

```
┌ PinAtlas ─ STM32F407ZET6 · LQFP144 ──────────── 🔍 搜索 ─┐
├──────────────┬──────────────────────────┬────────────────┤
│ Pin Navigator│      Package View        │  Pin Inspector │
│ 1 VDD        │      （SVG，当前组件）    │  PA0 / Pin 23  │
│ 2 VSS        │      hover/click/高亮     │  GPIOA.0       │
│ 3 PC0 …      │                          │  AF 列表        │
│ [Pin Matrix] │                          │  电气属性/位置   │
└──────────────┴──────────────────────────┴────────────────┘
```

- **共享同一个 Pin 对象**：Navigator、Package View、Matrix、Inspector 都由 `store.pinByPosition` / `store.selectedPosition` 驱动，不各自复制状态。
- **Inspector 是重点**：主名、别名、AF 列表（含 AF 号）、电气属性、封装位置（side + indexInSide）。
- **Pin Matrix**：可排序表格（Pin / Primary / Functions / Type），点行 → 图与 Inspector 同步；表格接入现有 shadcn-vue Table 风格。
- **功能搜索**：输入 `TIM3_CH1` → 列出所有支持该功能的脚（Pin + 主名），图上高亮，点击跳转。

## 5. 视觉

- 保持 shadcn-vue 令牌与柔和配色；类型色沿用现有语义色（不引入高饱和"电子商城"色）。
- 收敛装饰：少边框、少卡片，向 GitHub / VS Code / KiCad 的克制工具感靠（与 docs/04 现有规范一致，只需去掉多余容器）。

## 6. 实施顺序（对齐你给的五阶段）

1. **数据模型**（数据仓库）：§2 全部 + 校验器门禁 + 重新发布数据（CI 跑一轮）。
2. **前端接线**：类型枚举改名、`primary`/`aliases` 显示、`functions[].type`、视图模型加 `indexInSide`。
3. **三层 UI 壳**：Navigator + Package View + Inspector + Pin Matrix。
4. **交互**：hover/click 已有；补功能搜索高亮、关键字过滤、Datasheet/Explorer 双模式。
5. **封装扩展**：QFN/BGA 细节、封装朝向（俯视/底视）+ Pin 1 方位、异构布局（如 LGA 线性编号）。

验收方式沿用现有：`pnpm lint` / `pnpm test` / `pnpm typecheck` / `pnpm build` + headless DOM 核对（元素数、字号、坐标、可聚焦数）+ 数据核验（类型分布、别名拆分比例、校验器 0 violation）。

## 7. 待确认的三个决策点

1. **类型枚举改名**：`io → gpio` 会让数据仓库与前端同时改（一次全量重跑），是否接受？`mono`（单功能脚）保留还是并入 `gpio`？
2. **`primary` 的剥离规则**：`PC13-TAMPER-RTC` → `primary=PC13`、`aliases=[TAMPER, RTC]`；`VDD/VDDA` → `primary=VDD`、`aliases=[VDDA]`；`PA11 [PA9]` → `primary=PA11`、`variants=[PA9]`。按此执行还是另有偏好？
3. **首屏顺序**：是否先只做「数据模型 + 显示名修正 + Density Mode」（小而快的可见改善），再进三层 UI 壳？还是按 §6 严格顺序一次做完？
