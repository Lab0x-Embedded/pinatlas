import type { PinSlot } from './package-layout'

/**
 * 标签策略：字号、要不要画 pad 名 / 球号，**全部从几何反推**，不写死像素。
 *
 * 背景：引脚图最初把字号写死（引脚号 26、pad 名 22 逻辑单位），48 脚还看得过去，
 * LQFP100（每边 25 脚 → 行距只有 23.2 单位）就整片文字压叠。所以字号必须跟着行距/格子走，
 * 并且宁可少画文字也不要叠。
 *
 * 与渲染方式无关（SVG / Canvas 都能用），因此单独成模块并有单测覆盖
 * （test/label-policy.spec.ts）。
 */

export interface LabelPolicy {
  /** 四边封装的引脚行距（逻辑坐标） */
  pitch: number
  /** 网格封装的格子边长（非网格为 0） */
  cell: number
  numberFont: number
  padFont: number
  ballFont: number
  axisFont: number
  /** 是否画 pad 名（块内放不下就不画，靠 hover / Inspector 读） */
  showPadName: boolean
  /** 是否画引脚号：行距过小（每边 40+ 脚）时连号也不画，靠 hover / Navigator 读 */
  showNumber: boolean
  /** 是否在球上写球号（格子太小就不写，靠行列坐标头 + 悬停读） */
  showBallText: boolean
  /** 块内 pad 名的可用长度（块长 − 两侧内边距），超了截断 */
  padMaxLength: number
}

export interface LabelPolicyInput {
  meta: { kind: string, pinsPerSide?: number, rows?: number, cols?: number, pinWidth?: number, pinLength?: number }
  body: { x: number, y: number, width: number, height: number }
  slots: PinSlot[]
  /** 组件层开关：密封装时用户可以要求完全不看 pad 名 */
  showPadLabels: boolean
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

/** 块内标签离引脚块两侧的内边距（左右两端各留这么多，见 §5） */
export const PAD_INLINE_INSET = 6

export function labelPolicy(input: LabelPolicyInput): LabelPolicy {
  const { meta, body, slots, showPadLabels } = input
  const kind = meta.kind
  const perSide = meta.pinsPerSide ?? (kind === 'dual' ? Math.ceil(slots.length / 2) : Math.ceil(slots.length / 4))
  const pitch = perSide > 0 ? body.height / perSide : body.height
  const rows = meta.rows ?? 0
  const cols = meta.cols ?? 0
  const cell = kind === 'grid' && rows > 0 && cols > 0
    ? Math.min(body.width / cols, body.height / rows)
    : 0

  // 引脚名写进**引脚块**里（CubeMX 风格，见 docs/04 §5）：可用空间就是块的内接矩形，
  // 所以字号由块宽反推（字高 ≈ 1.15×字号 必须放得进），行距只作为上限。
  const blockWidth = meta.pinWidth ?? 0
  const blockLength = meta.pinLength ?? 0
  const padFont = clamp(Math.min(pitch * 0.44, (blockWidth - 4) / 1.15), 9, 22)

  return {
    pitch,
    cell,
    // 文字高度约 1.15×字号，取 0.52/0.44 留足行间空隙
    numberFont: clamp(pitch * 0.52, 9, 26),
    padFont,
    ballFont: clamp(cell * 0.44, 8, 20),
    // 下限 10：格子再小也要让行列坐标头在屏幕上可读（720px 容器里 10 单位 ≈ 7px，配 860px 容器 ≈ 9px）。
    // 行距 18 时 10 号字仍不重叠（文字高约 11.5），所以放宽下限是安全的。
    axisFont: clamp(cell * 0.5, 10, 20),
    // 块里放得下才画：块宽要容得下字高（+2 的呼吸量）。LQFP48 块宽 30 → 字号 21.3；
    // LQFP100 块宽 14.4 → 9.0（还能读，比"整体关掉"好）；LQFP208 块宽 6.9 → 画不下就不画。
    showPadName: showPadLabels !== false && blockWidth >= padFont * 1.15 + 2,
    // 行距 14 以下文字高约 16 > 行距，必然叠；这类封装（如 LQFP208 每边 52 脚）只画引脚块
    showNumber: pitch >= 14,
    // 球号最长 3~4 字符，需要 ~2.4×字号宽度
    showBallText: cell >= 26,
    padMaxLength: Math.max(0, blockLength - PAD_INLINE_INSET * 2),
  }
}

/**
 * 块内 pad 名的锚点与旋转：名字写进引脚块里，**在块内垂直居中**。
 *   - 左右两侧的块是横长条 → 横排，基线落在 `cy + 0.35×字号`（视觉居中），左块左对齐、右块右对齐；
 *   - 上下两排的块是竖长条 → 竖排（rotate −90），局部 +y 映射到全局 +x，
 *     所以基线要放在 `cx − 0.35×字号`，字身才居中在块的竖中线上；沿块长用 text-anchor=middle 居中。
 */
export function padLabelBox(slot: PinSlot, font: number) {
  const half = font * 0.35
  switch (slot.side) {
    case 'left':
      return { x: slot.x + PAD_INLINE_INSET, y: slot.cy + half, anchor: 'start' as const, rotate: 0 }
    case 'right':
      return { x: slot.x + slot.w - PAD_INLINE_INSET, y: slot.cy + half, anchor: 'end' as const, rotate: 0 }
    default:
      // 竖排：rotate(-90) 下字身在全局 −x 方向（局部 −y → 全局 −x），
      // 所以基线要放在块中线**偏右** half，字身才落在块中间（放左边会偏出块外）
      return { x: slot.cx + half, y: slot.cy, anchor: 'middle' as const, rotate: -90 }
  }
}

/**
 * 引脚号的锚点，与 pad 名的方向保持一致（整条边的文字同向）：
 *   - 左右两列：块外侧横排；
 *   - 上下两排：块外侧**竖排**（rotate −90）。rotate(−90) 下 anchor=start 的文本向全局 −y 延伸，
 *     所以上排把锚点放在块上边再往上写；下排用 anchor=end 从块下边往下写。
 */
export function numberLabelBox(slot: PinSlot, font: number) {
  const half = font * 0.35
  switch (slot.side) {
    case 'left':
      return { x: slot.x - 8, y: slot.cy + half, anchor: 'end' as const, rotate: 0 }
    case 'right':
      return { x: slot.x + slot.w + 8, y: slot.cy + half, anchor: 'start' as const, rotate: 0 }
    case 'top':
      return { x: slot.cx + half, y: slot.y - 10, anchor: 'start' as const, rotate: -90 }
    default:
      return { x: slot.cx + half, y: slot.y + slot.h + 10, anchor: 'end' as const, rotate: -90 }
  }
}

/** SVG transform：只有竖排的才需要绕锚点旋转（必须写绝对坐标，否则会绕 viewBox 原点转） */
export function rotateTransform(box: { x: number, y: number, rotate: number }) {
  return box.rotate ? `rotate(${box.rotate} ${box.x} ${box.y})` : undefined
}

/**
 * 文本截断（SVG 的 <text> 不会自动换行/收缩，超宽会糊到本体中间）。
 * 纯估算：0.58×字号/字符，中英文混排偏保守，宁可早一点截。
 */
export function fitText(text: string, maxWidth: number, fontSize: number): string {
  if (!text || maxWidth <= 0) {
    return ''
  }
  const widthOf = (value: string) => [...value].reduce((sum, ch) => sum + (/[\u4E00-\u9FFF]/.test(ch) ? fontSize : fontSize * 0.58), 0)
  if (widthOf(text) <= maxWidth) {
    return text
  }
  let cut = text
  while (cut.length > 1 && widthOf(`${cut}…`) > maxWidth) {
    cut = cut.slice(0, -1)
  }
  return `${cut}…`
}
