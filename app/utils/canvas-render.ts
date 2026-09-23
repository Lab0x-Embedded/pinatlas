import type { PinSlot } from './package-layout'

/**
 * Canvas 渲染层。
 *
 * 设计要点（见 docs/04 §5、docs/07 §14）：
 *   - 几何来自纯函数 `layoutPackage()`，与渲染解耦；
 *   - 颜色在绘制时从 CSS 变量读（主题切换只重读一次，不写死颜色）；
 *   - 渲染函数只依赖一个最小 ctx 接口，测试里用记录式假 ctx 断言绘制调用；
 *   - canvas 没有 per-pin DOM 节点，命中检测与键盘导航都得靠几何反查（本文件下半部分）。
 */

export interface Palette {
  io: string
  power: string
  ground: string
  reset: string
  boot: string
  mono: string
  nc: string
  other: string
  body: string
  border: string
  foreground: string
  mutedForeground: string
  ring: string
  fontFamily: string
}

const PIN_TYPE_KEYS = ['io', 'power', 'ground', 'reset', 'boot', 'mono', 'nc', 'other'] as const
type PinTypeKey = typeof PIN_TYPE_KEYS[number]

/** 类型 → 颜色；未知类型回落到 other（避免任何 as 断言） */
export function pinColor(palette: Palette, type: string): string {
  return PIN_TYPE_KEYS.includes(type as PinTypeKey)
    ? palette[type as PinTypeKey]
    : palette.other
}

/** 从 CSS 变量读调色板（主题切换后重新读一次即可） */
export function readPalette(el?: HTMLElement): Palette {
  const root = el ?? (typeof document === 'undefined' ? null : document.documentElement)
  const css = (name: string, fallback: string) => {
    if (!root) {
      return fallback
    }
    const value = getComputedStyle(root).getPropertyValue(name).trim()
    return value || fallback
  }
  return {
    io: css('--pin-io', '#64748b'),
    power: css('--pin-power', '#dc2626'),
    ground: css('--pin-ground', '#334155'),
    reset: css('--pin-reset', '#ea580c'),
    boot: css('--pin-boot', '#7c3aed'),
    mono: css('--pin-mono', '#0891b2'),
    nc: css('--pin-nc', '#cbd5e1'),
    other: css('--pin-other', '#64748b'),
    body: css('--muted', '#f1f5f9'),
    border: css('--border', '#e2e8f0'),
    foreground: css('--foreground', '#0f172a'),
    mutedForeground: css('--muted-foreground', '#64748b'),
    ring: css('--ring', '#94a3b8'),
    fontFamily: root ? getComputedStyle(root).fontFamily : 'sans-serif',
  }
}

export interface CanvasLike {
  setTransform: (...args: number[]) => void
  clearRect: (...args: number[]) => void
  beginPath: () => void
  closePath: () => void
  moveTo: (...args: number[]) => void
  lineTo: (...args: number[]) => void
  arc: (...args: number[]) => void
  rect: (...args: number[]) => void
  roundRect?: (...args: number[]) => void
  fill: () => void
  stroke: () => void
  fillRect: (...args: number[]) => void
  strokeRect: (...args: number[]) => void
  fillText: (...args: unknown[]) => void
  setLineDash: (dash: number[]) => void
  save: () => void
  restore: () => void
  fillStyle: string | CanvasGradient
  strokeStyle: string | CanvasGradient
  lineWidth: number
  font: string
  textAlign: string
  textBaseline: string
  globalAlpha: number
}

export interface RenderOptions {
  slots: PinSlot[]
  /** position → { type, pad } */
  pinInfo: Map<string, { type: string, pad: string }>
  palette: Palette
  /** 逻辑坐标系边长（layoutPackage 的 VIEW） */
  view: number
  cssWidth: number
  cssHeight: number
  dpr: number
  selected: string | null
  hovered: string | null
  activeType: string | null
  showPadLabels: boolean
  body: { x: number, y: number, width: number, height: number }
}

const FILL_ALPHA = 0.18
const DIM_ALPHA = 0.22
const MARKER_RADIUS = 11
const BODY_RADIUS = 16

function drawBody(ctx: CanvasLike, body: RenderOptions['body'], palette: Palette) {
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(body.x, body.y, body.width, body.height, BODY_RADIUS)
  }
  else {
    ctx.rect(body.x, body.y, body.width, body.height)
  }
  ctx.globalAlpha = 0.5
  ctx.fillStyle = palette.body
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.strokeStyle = palette.border
  ctx.lineWidth = 3
  ctx.stroke()
}

/** pin 1 标记（左上角，与数据手册一致：俯视逆时针） */
function drawPinOneMarker(ctx: CanvasLike, body: RenderOptions['body'], palette: Palette) {
  ctx.beginPath()
  ctx.arc(body.x + 34, body.y + 34, MARKER_RADIUS, 0, Math.PI * 2)
  ctx.fillStyle = palette.foreground
  ctx.fill()
}

function traceShape(ctx: CanvasLike, slot: PinSlot) {
  ctx.beginPath()
  if (slot.shape === 'rect') {
    ctx.rect(slot.x, slot.y, slot.w, slot.h)
  }
  else {
    ctx.arc(slot.cx, slot.cy, slot.w / 2, 0, Math.PI * 2)
  }
}

function drawPinShape(ctx: CanvasLike, slot: PinSlot, color: string, dimmed: boolean, isNc: boolean, selected: boolean, palette: Palette) {
  traceShape(ctx, slot)
  ctx.setLineDash(isNc ? [6, 4] : [])
  ctx.globalAlpha = dimmed ? DIM_ALPHA : FILL_ALPHA
  ctx.fillStyle = color
  ctx.fill()
  ctx.globalAlpha = dimmed ? DIM_ALPHA : 1
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.setLineDash([])

  if (selected) {
    ctx.beginPath()
    ctx.rect(slot.x - 5, slot.y - 5, slot.w + 10, slot.h + 10)
    ctx.strokeStyle = palette.ring
    ctx.lineWidth = 3
    ctx.stroke()
  }
}

/** 引脚号/pad 名摆放（四边外侧标号、内侧标名；网格在球心标号） */
function labelPlacement(slot: PinSlot) {
  switch (slot.side) {
    case 'left':
      return { numberX: slot.x - 8, numberY: slot.cy, numberAlign: 'right', padX: 220, padY: slot.cy, padAlign: 'left' }
    case 'right':
      return { numberX: slot.x + slot.w + 8, numberY: slot.cy, numberAlign: 'left', padX: 780, padY: slot.cy, padAlign: 'right' }
    case 'top':
      return { numberX: slot.cx, numberY: slot.y - 10, numberAlign: 'center', padX: slot.cx, padY: 240, padAlign: 'center' }
    case 'bottom':
      return { numberX: slot.cx, numberY: slot.y + slot.h + 30, numberAlign: 'center', padX: slot.cx, padY: 760, padAlign: 'center' }
    default:
      return null
  }
}

function drawPinLabels(ctx: CanvasLike, slot: PinSlot, info: { pad: string } | undefined, palette: Palette, showPadLabels: boolean) {
  const place = labelPlacement(slot)
  ctx.textBaseline = 'middle'

  if (!place) {
    ctx.textAlign = 'center'
    ctx.font = `20px ${palette.fontFamily}`
    ctx.fillStyle = palette.foreground
    ctx.fillText(slot.position, slot.cx, slot.cy)
    return
  }

  ctx.font = `26px ${palette.fontFamily}`
  ctx.fillStyle = palette.mutedForeground
  ctx.textAlign = place.numberAlign
  ctx.fillText(slot.position, place.numberX, place.numberY)

  if (showPadLabels && info?.pad) {
    ctx.font = `22px ${palette.fontFamily}`
    ctx.fillStyle = palette.foreground
    ctx.textAlign = place.padAlign
    ctx.fillText(info.pad, place.padX, place.padY)
  }
}

export function drawPackage(ctx: CanvasLike, options: RenderOptions) {
  const { slots, pinInfo, palette, view, cssWidth, cssHeight, dpr, body } = options
  const scale = Math.min(cssWidth / view, cssHeight / view)

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, cssWidth * dpr, cssHeight * dpr)
  // 之后都用逻辑坐标（0..view）作画
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0)

  drawBody(ctx, body, palette)
  drawPinOneMarker(ctx, body, palette)

  for (const slot of slots) {
    const info = pinInfo.get(slot.position)
    const color = pinColor(palette, info?.type ?? 'other')
    const dimmed = Boolean(options.activeType && options.activeType !== info?.type)
    drawPinShape(ctx, slot, color, dimmed, info?.type === 'nc', options.selected === slot.position, palette)
    ctx.globalAlpha = dimmed ? DIM_ALPHA : 1
    drawPinLabels(ctx, slot, info, palette, options.showPadLabels)
    ctx.globalAlpha = 1
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0)
}

/** 命中检测：矩形用点在框内（外扩 slack 更好点），球用距离 */
export function hitTestSlots(slots: PinSlot[], x: number, y: number, slack = 2): PinSlot | null {
  for (const slot of slots) {
    if (slot.shape === 'rect') {
      if (x >= slot.x - slack && x <= slot.x + slot.w + slack && y >= slot.y - slack && y <= slot.y + slot.h + slack) {
        return slot
      }
    }
    else {
      const dx = x - slot.cx
      const dy = y - slot.cy
      const r = slot.w / 2 + slack
      if (dx * dx + dy * dy <= r * r) {
        return slot
      }
    }
  }
  return null
}

export type NavDirection = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'

const OPPOSITE = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' } as const

/** 同边顺序移动：能沿着一圈引脚走 */
function neighborAlongSide(slots: PinSlot[], current: PinSlot, forward: boolean): PinSlot | null {
  const sideIsVertical = current.side === 'left' || current.side === 'right'
  const axis = sideIsVertical ? 'cy' : 'cx'
  const ordered = slots
    .filter(s => s.side === current.side)
    .sort((a, b) => a[axis] - b[axis])
  const index = ordered.findIndex(s => s.position === current.position)
  return ordered[index + (forward ? 1 : -1)] ?? null
}

/** 跳到对边：轴向坐标最接近的那个引脚 */
function neighborAcrossSide(slots: PinSlot[], current: PinSlot): PinSlot | null {
  const sideIsVertical = current.side === 'left' || current.side === 'right'
  const axis = sideIsVertical ? 'cy' : 'cx'
  return slots
    .filter(s => s.side === OPPOSITE[current.side as keyof typeof OPPOSITE])
    .reduce<PinSlot | null>((best, slot) =>
      !best || Math.abs(slot[axis] - current[axis]) < Math.abs(best[axis] - current[axis]) ? slot : best, null)
}

/** 网格封装用几何邻近（方向加权，沿方向越近越优先） */
function neighborByGeometry(slots: PinSlot[], current: PinSlot, direction: NavDirection): PinSlot | null {
  const dx = direction === 'ArrowRight' ? 1 : direction === 'ArrowLeft' ? -1 : 0
  const dy = direction === 'ArrowDown' ? 1 : direction === 'ArrowUp' ? -1 : 0

  let best: PinSlot | null = null
  let bestScore = Number.POSITIVE_INFINITY
  for (const slot of slots) {
    if (slot === current) {
      continue
    }
    const vx = slot.cx - current.cx
    const vy = slot.cy - current.cy
    const along = vx * dx + vy * dy
    if (along <= 0) {
      continue
    }
    const perp = Math.abs(vx * dy - vy * dx)
    const score = along + perp * 2
    if (score < bestScore) {
      bestScore = score
      best = slot
    }
  }
  return best
}

/**
 * 键盘导航（canvas 没有 per-pin DOM 焦点，只能自己算）。
 *
 * 四边封装照工程师看图的直觉：沿当前边方向 → 同边相邻引脚；垂直当前边方向 → 跳到对边同轴向位置
 * （1 号脚按 → 直接到右列对应行，而不是绕到顶边）。网格封装没有"边"，用几何邻近。
 */
export function neighborSlot(slots: PinSlot[], current: PinSlot, direction: NavDirection): PinSlot | null {
  if (!current.side) {
    return neighborByGeometry(slots, current, direction)
  }
  const vertical = direction === 'ArrowUp' || direction === 'ArrowDown'
  const sideIsVertical = current.side === 'left' || current.side === 'right'

  if (vertical === sideIsVertical) {
    return neighborAlongSide(slots, current, direction === 'ArrowDown' || direction === 'ArrowRight')
  }
  return neighborAcrossSide(slots, current)
}
