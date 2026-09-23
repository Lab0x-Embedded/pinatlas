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
  /** 是否画 pad 名（行距不够就不画，避免压叠） */
  showPadName: boolean
  /** 是否画引脚号：行距过小（每边 40+ 脚）时连号也不画，靠 hover / Navigator 读 */
  showNumber: boolean
  /** 是否在球上写球号（格子太小就不写，靠行列坐标头 + 悬停读） */
  showBallText: boolean
  /** pad 名可用宽度（本体一半再留白），超了截断 */
  padMaxWidth: number
}

export interface LabelPolicyInput {
  meta: { kind: string, pinsPerSide?: number, rows?: number, cols?: number }
  body: { x: number, y: number, width: number, height: number }
  slots: PinSlot[]
  /** 组件层开关：密封装时用户可以要求完全不看 pad 名 */
  showPadLabels: boolean
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

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

  return {
    pitch,
    cell,
    // 文字高度约 1.15×字号，取 0.52/0.44 留足行间空隙
    numberFont: clamp(pitch * 0.52, 9, 26),
    padFont: clamp(pitch * 0.44, 9, 22),
    ballFont: clamp(cell * 0.44, 8, 20),
    // 下限 10：格子再小也要让行列坐标头在屏幕上可读（720px 容器里 10 单位 ≈ 7px，配 860px 容器 ≈ 9px）。
    // 行距 18 时 10 号字仍不重叠（文字高约 11.5），所以放宽下限是安全的。
    axisFont: clamp(cell * 0.5, 10, 20),
    // 24 单位以下画 pad 名就会和相邻行贴上（LQFP100 每边 25 脚 → 行距 23.2）
    showPadName: pitch >= 26 && showPadLabels !== false,
    // 行距 14 以下文字高约 16 > 行距，必然叠；这类封装（如 LQFP208 每边 52 脚）只画引脚块
    showNumber: pitch >= 14,
    // 球号最长 3~4 字符，需要 ~2.4×字号宽度
    showBallText: cell >= 26,
    padMaxWidth: body.width / 2 - 24,
  }
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
