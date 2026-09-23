# 05 · 封装布局引擎

引脚图是这个项目的核心，也是唯一必须自己造轮子的地方：上游数据**只有引脚号/球坐标，没有几何**（无坐标、无 pitch、无本体尺寸、无视角约定）。本文定义把"引脚列表"变成"屏幕坐标"的规则，以及每条规则的验证状态。

## 1. 输入

```ts
type LayoutInput = {
  packageKind: 'quad' | 'dual' | 'grid' | 'unknown'
  package: string         // 'LQFP48' | 'TFBGA216' | 'TSSOP20' …
  pins: Pin[]             // position 唯一，已合并变体
}
```

输出：`PinSlot[] = { position, x, y, w, h, shape: 'rect'|'ball', side?: 'left'|'bottom'|'right'|'top', labelAnchor }`

## 2. quad（QFP / QFN / TQFP / UFQFPN）

**规则**：每边 `n = pinCount / 4`；pin 1 在**左上角**，编号**逆时针**：

```
左边（自上而下）      1 .. n
下边（左 → 右）       n+1 .. 2n
右边（自下而上）       2n+1 .. 3n
上边（右 → 左）       3n+1 .. 4n
```

**已验证**（对照 ST 数据手册 STM32F103C8T6 LQFP48 实测）：

| 边 | position | 数据实测值 | 与数据手册 |
|---|---|---|---|
| 左（自上而下） | 1–12 | VBAT, PC13-TAMPER-RTC, PC14-OSC32_IN, PC15-OSC32_OUT, PD0-OSC_IN, PD1-OSC_OUT, NRST, VSSA, VDDA, PA0-WKUP, PA1, PA2 | ✅ |
| 下（左→右） | 13–24 | PA3, PA4, PA5, PA6, PA7, PB0, PB1, PB2, PB10, PB11, VSS, VDD | ✅ |
| 右（自下而上） | 25–36 | PB12, PB13, PB14, PB15, PA8, PA9, PA10, PA11, PA12, PA13, VSS, VDD | ✅ |
| 上（右→左） | 37–48 | PA14, PA15, PB3, PB4, PB5, PB6, PB7, BOOT0, PB8, PB9, VSS, VDD | ✅ |

约束与兜底：

- `pinCount % 4 !== 0` → 按 `ceil` 分配并给 warning（数据层已记 warning），渲染仍尽量成图。
- 矩形封装（非正方形）：用 `package` 名里的信息或默认按 1:1 画，**图底部注明"示意排布，非按比例"**。
- 引脚 1 标记：左上角外沿画一个实心圆 + 加粗边，与数据手册一致。

## 3. dual（TSSOP / SSOP / SO / DIP）

同"逆时针"约定，双列即：

```
左列（自上而下）  1 .. N/2
右列（自下而上）  N/2+1 .. N
```

`N % 2 !== 0` → warning。

## 4. grid（BGA / WLCSP / CSP）

**规则**：

1. 行列**从 position 极值推**，不能按 `√N` 猜：上游实测 201 个网格封装里 **91 个是稀疏矩阵**（如 `TFBGA216` = 15×15 网格只有 216 球；`UFBGA100` = 12×12 只有 100 球）。
2. 行字母**必须跳过 JEDEC 保留字母 `I O Q S X Z`**。实测证据：

   | 封装 | 网格 | 实际行字母 | 列 |
   |---|---|---|---|
   | TFBGA64 | 8×8，64 球 | `A B C D E F G H` | 1..8 |
   | TFBGA216 | 15×15，216 球 | `A B C D E F G H J K L M N P R`（跳 I/O/Q） | 1..15 |

   若直接把 `第 k 个字母` 当第 k 行，`TFBGA216` 的第 10 行会算错（应为 `K`，会算成 `I`）→ 后面所有球错位。
3. 空格：网格里没有球的坐标不画（稀疏），但**保留网格编号**，用户才能对着数据手册找。
4. 视角：QFP 按**俯视**；BGA/WLCSP 数据手册常给**底视（看球面）**。默认 `view: 'top'` 用于 quad/dual，`view: 'bottom'` 用于 grid，并在图上明确标注；**这条尚未逐个对照数据手册抽验（待办）**，先按此约定 + 标注。

## 5. 变体（重映射）

同一 `position` 可能在变体下换成别的功能甚至变 NC。引擎输入是"当前生效的引脚定义"：

```
基础态：pins[i] 的 name/type/functions
变体态：pins[i].variants[variantKey]，缺失则回落到基础态
```

实测案例（STM32G031K8Tx，LQFP32）：

| position | 基础 | `PINREMAP` | `PINREMAP_10_12` |
|---|---|---|---|
| 19 | PA9 | **NC** | — |
| 21 | PA10 | — | **NC** |
| 22 | `PA11 [PA9]` | `PA9 [PA11]` | — |
| 23 | `PA12 [PA10]` | — | `PA10 [PA12]` |

→ 切到某个变体时，该变体下为 NC 的引脚按 NC 样式渲染（虚线、极浅），tooltip 明确写"该变体下未连接"。

## 6. 类型 → 视觉

映射表在 `app/utils/pin-types.ts`（与 `docs/04-ui-design.md` 的颜色令牌一一对应）：

```
io / power / ground / reset / boot / mono / nc / other
```

`clock` 不臆造：晶振相关引脚用 `osc: true` 打标，用引脚名旁的图标表达（`PD0-OSC_IN`），类型仍是 `io`。

## 7. 校验清单（实现时逐条断言）

| # | 断言 | 依据 |
|---|---|---|
| 1 | `pins.length === pinCount`（数据层已保证） | 上游 14% 线性封装存在重复 position |
| 2 | quad：`pinCount % 4 === 0` 否则 warning | LQFP32/48/64/100/144/176 均满足 |
| 3 | dual：`pinCount % 2 === 0` | TSSOP20 |
| 4 | grid：position 全匹配 `/^[A-Z]{1,2}\d{1,2}$/` | 数据层已断言 |
| 5 | grid：行字母集合 ⊆ JEDEC 合法集（无 I/O/Q/S/X/Z） | 实测 TFBGA64/216 |
| 6 | grid：列号连续（1..max，无缺号） | 实测 TFBGA216 列完整 |
| 7 | 渲染格子数 ≥ 引脚数（稀疏网格允许空位） | TFBGA216: 225 ≥ 216 |
| 8 | 布局后每个引脚坐标唯一（无重叠） | 防止非方形封装/异常 pinCount 时叠框 |

单元测试放在 `test/package-layout.spec.ts`，用真实数据样本（LQFP48 / LQFP32 / TSSOP20 / TFBGA64 / TFBGA216 / UFBGA100）做快照。

## 8. 实现要点

- 纯函数：`layoutPackage(input) → { slots, meta: { kind, view, warnings, pinsPerSide, rows, cols } }`，与 Vue **和渲染方式都解耦**，便于单测。
- 逻辑坐标系固定 `0..1000`：Canvas 用 `setTransform(dpr*scale, …)` 映射，CSS 尺寸变化只影响 scale，不影响几何计算。
- **Canvas 渲染**（`utils/canvas-render.ts`）：
  - 调色板绘制时从 CSS 变量读 → 主题切换重读重绘，不在代码里维护颜色表；
  - 命中检测 `hitTestSlots()`（矩形点在框内 + slack、球用半径）；
  - 方向键导航 `neighborSlot()`：四边封装沿当前边顺序移动、垂直方向跳对边同轴向位置（1 号脚按 → 到右列对应行）；网格封装按方向加权找几何邻居；
  - 渲染函数只依赖最小 ctx 接口 → Node 里用记录式假 ctx 断言绘制调用（`test/canvas-render.spec.ts`）。
- 大封装（TFBGA436）不画 pad 名（按 `pinsPerSide`/网格半径判断），功能列表放悬停提示（HTML 覆盖层，最多前 3 个 + "还有 N 个"）。
