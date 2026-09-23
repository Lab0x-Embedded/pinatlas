import type { Pin } from '~/types/pinatlas'
import { describe, expect, it } from 'vitest'
import { layoutPackage, ROW_LETTERS, rowIndexOf } from '~/utils/package-layout'
import { groupFunctions } from '~/utils/pin-types'

/** 造 n 个引脚，position 为 1..n（线性封装） */
function linearPins(n: number): Pin[] {
  return Array.from({ length: n }, (_, i) => ({
    position: String(i + 1),
    pad: `P${i + 1}`,
    name: `P${i + 1}`,
    type: 'io' as const,
    functions: [],
  }))
}

/** 造网格引脚：rows × cols 的完整矩阵（列 1..cols，行取 JEDEC 字母） */
function gridPins(rows: number, cols: number): Pin[] {
  const out: Pin[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 1; c <= cols; c++) {
      const position = `${ROW_LETTERS[r]}${c}`
      out.push({ position, pad: position, name: position, type: 'io', functions: [] })
    }
  }
  return out
}

function slotOf(result: ReturnType<typeof layoutPackage>, position: string) {
  const slot = result.slots.find(s => s.position === position)
  if (!slot) {
    throw new Error(`没有 position=${position} 的引脚`)
  }
  return slot
}

describe('quad（QFP/QFN）：每边 N/4，pin1 在左上、逆时针', () => {
  const result = layoutPackage({ kind: 'quad', pins: linearPins(48) })

  it('四个边各 12 脚', () => {
    expect(result.meta.pinsPerSide).toBe(12)
    const sides = result.slots.map(s => s.side)
    expect(sides.filter(s => s === 'left')).toHaveLength(12)
    expect(sides.filter(s => s === 'bottom')).toHaveLength(12)
    expect(sides.filter(s => s === 'right')).toHaveLength(12)
    expect(sides.filter(s => s === 'top')).toHaveLength(12)
  })

  it('1 在左边最上，12 在左边最下', () => {
    const first = slotOf(result, '1')
    const last = slotOf(result, '12')
    expect(first.side).toBe('left')
    expect(last.side).toBe('left')
    expect(first.cy).toBeLessThan(last.cy)
  })

  it('13 在下边最左，24 在下边最右（左→右）', () => {
    expect(slotOf(result, '13').side).toBe('bottom')
    expect(slotOf(result, '13').cx).toBeLessThan(slotOf(result, '24').cx)
    expect(slotOf(result, '24').side).toBe('bottom')
  })

  it('25 在右边最下，36 在右边最上（自下而上）', () => {
    expect(slotOf(result, '25').side).toBe('right')
    expect(slotOf(result, '25').cy).toBeGreaterThan(slotOf(result, '36').cy)
  })

  it('37 在上边最右，48 在上边最左（右→左）', () => {
    expect(slotOf(result, '37').side).toBe('top')
    expect(slotOf(result, '37').cx).toBeGreaterThan(slotOf(result, '48').cx)
  })

  it('无警告，且每个引脚坐标唯一', () => {
    expect(result.meta.warnings).toHaveLength(0)
    const keys = new Set(result.slots.map(s => `${s.cx},${s.cy}`))
    expect(keys.size).toBe(48)
  })
})

describe('lQFP32（实测存在重映射变体的封装）', () => {
  it('每边 8 脚', () => {
    const result = layoutPackage({ kind: 'quad', pins: linearPins(32) })
    expect(result.meta.pinsPerSide).toBe(8)
    expect(slotOf(result, '9').side).toBe('bottom')
  })
})

describe('dual（TSSOP）：左列自上而下、右列自下而上', () => {
  const result = layoutPackage({ kind: 'dual', pins: linearPins(20) })

  it('1..10 在左列（自上而下）', () => {
    expect(slotOf(result, '1').side).toBe('left')
    expect(slotOf(result, '1').cy).toBeLessThan(slotOf(result, '10').cy)
  })

  it('11..20 在右列（自下而上）', () => {
    expect(slotOf(result, '11').side).toBe('right')
    expect(slotOf(result, '11').cy).toBeGreaterThan(slotOf(result, '20').cy)
  })
})

describe('grid（BGA/WLCSP）：行列取极值，行字母跳过 JEDEC 保留字母', () => {
  it('jEDEC 保留字母 I O Q S X Z 不参与行标', () => {
    for (const letter of ['I', 'O', 'Q', 'S', 'X', 'Z']) {
      expect(rowIndexOf(letter)).toBe(-1)
    }
    expect(ROW_LETTERS).toBe('ABCDEFGHJKLMNPRTUVWY')
  })

  it('tFBGA64（8×8，64 球）行字母为 A..H', () => {
    const result = layoutPackage({ kind: 'grid', pins: gridPins(8, 8) })
    expect(result.meta.rows).toBe(8)
    expect(result.meta.cols).toBe(8)
    expect(result.meta.warnings).toHaveLength(0)
  })

  it('tFBGA216（15×15 网格，216 球）行列按极值推，而非 √N', () => {
    // 真实 TFBGA216 的行字母：A..H J K L M N P R（15 个，跳 I/O/Q）
    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'R']
    const pins: Pin[] = []
    for (let r = 0; r < letters.length; r++) {
      for (let c = 1; c <= 15; c++) {
        const position = `${letters[r]}${c}`
        // 去掉 9 个球，模拟真实稀疏矩阵
        if (pins.length < 216) {
          pins.push({ position, pad: position, name: position, type: 'io', functions: [] })
        }
      }
    }
    const result = layoutPackage({ kind: 'grid', pins })
    expect(result.meta.rows).toBe(15)
    expect(result.meta.cols).toBe(15)
    expect(result.meta.warnings.join(' ')).toContain('稀疏')
    expect(slotOf(result, 'A1').cx).toBeLessThan(slotOf(result, 'A15').cx)
    expect(slotOf(result, 'A1').cy).toBeLessThan(slotOf(result, 'R1').cy)
  })

  it('大封装混用 A1 / AA1 / 1J3 三种编码时按 (前缀, 字母序) 排行', () => {
    const pins: Pin[] = ['A1', 'A2', 'AA1', 'AA2', '1J1', '1J2'].map(position => ({
      position,
      pad: position,
      name: position,
      type: 'io' as const,
      functions: [],
    }))
    const result = layoutPackage({ kind: 'grid', pins })
    expect(result.meta.rows).toBe(3)
    expect(result.meta.cols).toBe(2)
    expect(result.meta.warnings.join(' ')).toContain('数字前缀')
    // A 行在最上，1J 行在最下
    expect(slotOf(result, 'A1').cy).toBeLessThan(slotOf(result, 'AA1').cy)
    expect(slotOf(result, 'AA1').cy).toBeLessThan(slotOf(result, '1J1').cy)
  })

  it('列号从 position 取，不按引脚个数推', () => {
    const pins: Pin[] = [
      { position: 'A1', pad: 'A1', name: 'A1', type: 'io', functions: [] },
      { position: 'B7', pad: 'B7', name: 'B7', type: 'io', functions: [] },
    ]
    const result = layoutPackage({ kind: 'grid', pins })
    expect(result.meta.cols).toBe(7)
    expect(result.meta.rows).toBe(2)
  })
})

describe('边界情况', () => {
  it('空引脚列表不抛错', () => {
    expect(layoutPackage({ kind: 'quad', pins: [] }).slots).toHaveLength(0)
    expect(layoutPackage({ kind: 'grid', pins: [] }).slots).toHaveLength(0)
  })

  it('引脚数不整除时给出警告但仍出图', () => {
    const result = layoutPackage({ kind: 'quad', pins: linearPins(30) })
    expect(result.meta.warnings.length).toBeGreaterThan(0)
    expect(result.slots).toHaveLength(30)
  })

  it('未知封装按 quad 处理并警告由数据层给出（引擎不猜）', () => {
    const result = layoutPackage({ kind: 'unknown', pins: linearPins(8) })
    expect(result.slots).toHaveLength(8)
  })
})

describe('功能分组（RCC_/SYS_ 归到系统组）', () => {
  it('系统信号排在外设之后', () => {
    const groups = groupFunctions([
      { peripheral: 'RCC', signal: 'MCO', af: null, system: true },
      { peripheral: 'TIM2', signal: 'CH1', af: 2 },
      { peripheral: 'TIM2', signal: 'ETR', af: 2 },
    ])
    expect(groups.map(g => g.peripheral)).toEqual(['TIM2', 'RCC'])
    expect(groups[0].functions).toHaveLength(2)
    expect(groups[1].system).toBe(true)
  })
})
