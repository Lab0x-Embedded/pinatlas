import type { PackageKind, Pin } from '~/types/pinatlas'

/**
 * 封装布局引擎：把"引脚号列表"变成屏幕坐标。
 *
 * 上游数据只有引脚号/球坐标，**没有任何几何信息**（无坐标、无 pitch、无本体尺寸、无视角）。
 * 规则与验证见 docs/05-package-layout-engine.md：
 *   - quad：每边 N/4，pin1 在左上角，逆时针（左→下→右→上），已对照 STM32F103C8T6 数据手册验证
 *   - dual：左列自上而下 1..N/2，右列自下而上 N/2+1..N
 *   - grid：行列取 position 极值（BGA 常是稀疏矩阵），行字母跳过 JEDEC 保留字母 I O Q S X Z
 */

/** JEDEC 行标不使用 I O Q S X Z（易与 1/0 混淆），实测 TFBGA216 行为 A…H J…N P R */
export const ROW_LETTERS = 'ABCDEFGHJKLMNPRTUVWY'

export type PinSide = 'left' | 'bottom' | 'right' | 'top'

export interface PinSlot {
  position: string
  cx: number
  cy: number
  w: number
  h: number
  shape: 'rect' | 'ball'
  side?: PinSide
  /** rect 的左上角坐标 */
  x: number
  y: number
}

export interface LayoutResult {
  slots: PinSlot[]
  meta: {
    kind: PackageKind
    view: 'top' | 'bottom'
    rows?: number
    cols?: number
    pinsPerSide?: number
    warnings: string[]
  }
  viewBox: { width: number, height: number }
}

export const VIEW = 1000
const BODY_INSET = 210
const BODY_SIZE = VIEW - BODY_INSET * 2
const ROW_INDEX = new Map([...ROW_LETTERS].map((letter, index) => [letter, index]))

/** 行标签 = position 去掉末尾列号（上游大封装会带数字前缀，如 "1J3" → "1J"） */
export function rowLabelOf(position: string) {
  return String(position).replace(/\d+$/, '')
}

/** 列号 = position 末尾的数字 */
export function colOf(position: string) {
  return Number(/(\d+)$/.exec(String(position))?.[1] ?? '0')
}

function gridRows(positions: string[]) {
  return new Set(positions.map(rowLabelOf))
}

function gridCols(positions: string[]) {
  return new Set(positions.map(colOf))
}

/** 行标签排序：先按数字前缀，再按字母序列（A, B, … AA, AB），JEDEC 保留字母跳过 */
function rowSortKey(label: string): [number, number[]] {
  const m = /^(\d*)([A-Z]+)$/.exec(label)
  if (!m) {
    return [99, [99]]
  }
  return [Number(m[1] || 0), [...(m[2] ?? '')].map(letter => ROW_INDEX.get(letter) ?? 90)]
}

/** 把 position 标签排成物理顺序（大封装可能混用 A1 / AA1 / 1J3 三种编码） */
export function sortedRowLabels(positions: string[]) {
  return [...gridRows(positions)].sort((a, b) => {
    const [prefixA, lettersA] = rowSortKey(a)
    const [prefixB, lettersB] = rowSortKey(b)
    if (prefixA !== prefixB) {
      return prefixA - prefixB
    }
    for (let i = 0; i < Math.max(lettersA.length, lettersB.length); i++) {
      const diff = (lettersA[i] ?? -1) - (lettersB[i] ?? -1)
      if (diff !== 0) {
        return diff
      }
    }
    return 0
  })
}

/** grid 的行号：按 JEDEC 字母表映射，返回 0 起始序号；非法字母返回 -1 */
export const rowIndexOf = (letter: string) => ROW_INDEX.get(letter) ?? -1

export function layoutPackage(input: { kind: PackageKind, pins: Pin[] }): LayoutResult {
  const { kind, pins } = input
  const warnings: string[] = []
  const count = pins.length

  if (kind === 'grid') {
    return layoutGrid(pins, warnings)
  }

  if (count === 0) {
    return { slots: [], meta: { kind, view: 'top', warnings: [...warnings, '没有引脚'] }, viewBox: { width: VIEW, height: VIEW } }
  }

  if (kind === 'quad' && count % 4 !== 0) {
    warnings.push(`${count} 个引脚不能被 4 整除，按向上取整分配`)
  }
  if (kind === 'dual' && count % 2 !== 0) {
    warnings.push(`${count} 个引脚不是偶数，按向上取整分配`)
  }

  const sides = kind === 'dual' ? 2 : 4
  const perSide = Math.ceil(count / sides)
  const pitch = ((kind === 'dual' ? VIEW - BODY_INSET * 2 : BODY_SIZE)) / perSide
  const pinLength = kind === 'dual' ? 70 : 64
  const pinWidth = Math.max(6, Math.min(pitch * 0.62, 34))

  const slots: PinSlot[] = []

  pins.forEach((pin, index) => {
    const sideIndex = Math.floor(index / perSide)
    const within = index % perSide
    let x = 0
    let y = 0
    // 每个分支都会赋值，这里只声明
    let w: number
    let h: number
    let side: PinSide

    if (kind === 'dual') {
      const left = sideIndex === 0
      side = left ? 'left' : 'right'
      const row = left ? within : perSide - 1 - within
      x = left ? BODY_INSET - pinLength : VIEW - BODY_INSET
      y = BODY_INSET + row * pitch + (pitch - pinWidth) / 2
      w = pinLength
      h = pinWidth
    }
    else {
      switch (sideIndex) {
        case 0:
          side = 'left'
          // QFP 引脚垂直伸出本体：左右两边是「横向」长条（长=pinLength），不是竖条
          w = pinLength
          h = pinWidth
          x = BODY_INSET - pinLength
          y = BODY_INSET + within * pitch + (pitch - pinWidth) / 2
          break
        case 1:
          side = 'bottom'
          w = pinWidth
          h = pinLength
          x = BODY_INSET + within * pitch + (pitch - pinWidth) / 2
          y = VIEW - BODY_INSET
          break
        case 2:
          side = 'right'
          w = pinLength
          h = pinWidth
          x = VIEW - BODY_INSET
          y = VIEW - BODY_INSET - (within + 1) * pitch + (pitch - pinWidth) / 2
          break
        default:
          side = 'top'
          w = pinWidth
          h = pinLength
          x = VIEW - BODY_INSET - (within + 1) * pitch + (pitch - pinWidth) / 2
          y = BODY_INSET - pinLength
          break
      }
    }

    slots.push({
      position: pin.position,
      x,
      y,
      w,
      h,
      cx: x + w / 2,
      cy: y + h / 2,
      shape: 'rect',
      side,
    })
  })

  return {
    slots,
    meta: { kind, view: 'top', pinsPerSide: perSide, warnings },
    viewBox: { width: VIEW, height: VIEW },
  }
}

function layoutGrid(pins: Pin[], warnings: string[]): LayoutResult {
  if (pins.length === 0) {
    return { slots: [], meta: { kind: 'grid', view: 'bottom', warnings: [...warnings, '没有引脚'] }, viewBox: { width: VIEW, height: VIEW } }
  }

  const positions = pins.map(p => p.position)
  // 行按物理顺序排（大封装可能混用 A1 / AA1 / 1J3 三种编码，见 docs/05）
  const labels = sortedRowLabels(positions)
  const rowOf = new Map(labels.map((label, index) => [label, index]))
  const badLabels = labels.filter(label => !/^[A-Z]+$/.test(label))
  if (badLabels.length) {
    warnings.push(`行标签含数字前缀，已按 (前缀, 字母序) 排列：${badLabels.slice(0, 4).join(', ')}${badLabels.length > 4 ? ' …' : ''}`)
  }

  const rows = labels.length
  const cols = Math.max(...gridCols(positions))
  if (rows * cols > pins.length) {
    warnings.push(`网格 ${cols}×${rows} 是稀疏矩阵（${pins.length} 球 / ${rows * cols} 格）`)
  }

  const cell = BODY_SIZE / Math.max(rows, cols)
  const radius = Math.max(5, cell * 0.28)
  const offsetX = BODY_INSET + (BODY_SIZE - cell * cols) / 2 + cell / 2
  const offsetY = BODY_INSET + (BODY_SIZE - cell * rows) / 2 + cell / 2

  const slots: PinSlot[] = pins.map((pin) => {
    const col = colOf(pin.position)
    const row = rowOf.get(rowLabelOf(pin.position)) ?? 0
    const cx = offsetX + (col - 1) * cell
    const cy = offsetY + row * cell
    return {
      position: pin.position,
      cx,
      cy,
      x: cx - radius,
      y: cy - radius,
      w: radius * 2,
      h: radius * 2,
      shape: 'ball',
    }
  })

  return {
    slots,
    meta: { kind: 'grid', view: 'bottom', rows, cols, warnings },
    viewBox: { width: VIEW, height: VIEW },
  }
}

/** 引脚图外框（封装本体） */
export const bodyRect = { x: BODY_INSET, y: BODY_INSET, width: BODY_SIZE, height: BODY_SIZE }
