import type { Pin } from '~/types/pinatlas'
import { describe, expect, it } from 'vitest'
import { fitText, labelPolicy, numberLabelBox, PAD_INLINE_INSET, padLabelBox, rotateTransform } from '~/utils/label-policy'
import { bodyRect, layoutPackage, ROW_LETTERS } from '~/utils/package-layout'

/**
 * 字号策略：引脚图最初把字号写死（26/22 逻辑单位），LQFP100 每边 25 脚、行距只有 23.2 单位，
 * 整片文字压叠。这里锁住"跟着行距/格子走 + 放不下就不画"的行为。
 */

function linearPins(n: number): Pin[] {
  return Array.from({ length: n }, (_, i) => ({
    position: String(i + 1),
    pad: `P${i + 1}`,
    name: `P${i + 1}`,
    type: 'gpio' as const,
    functions: [],
  }))
}

/** 行标：前 21 行用 JEDEC 基础字母，再往后按真实数据的 AA/AB/AC… 递进 */
function rowLabelAt(index: number): string {
  if (index < ROW_LETTERS.length) {
    return ROW_LETTERS[index]!
  }
  const base = ROW_LETTERS[Math.floor(index / ROW_LETTERS.length) - 1] ?? 'A'
  return `${base}${ROW_LETTERS[index % ROW_LETTERS.length]}`
}

function gridPins(rows: number, cols: number): Pin[] {
  const out: Pin[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 1; c <= cols; c++) {
      const position = `${rowLabelAt(r)}${c}`
      out.push({ position, pad: position, name: position, type: 'gpio', functions: [] })
    }
  }
  return out
}

function policyFor(kind: 'quad' | 'dual' | 'grid', pins: Pin[], showPadLabels = true) {
  const layout = layoutPackage({ kind, pins })
  return {
    layout,
    policy: labelPolicy({ meta: layout.meta, body: bodyRect, slots: layout.slots, showPadLabels }),
  }
}

describe('字号跟着行距/格子走（不写死像素）', () => {
  it('任何封装下文字高度都小于行距（不压叠）', () => {
    for (const count of [8, 32, 48, 64, 100, 144, 176, 208]) {
      const { policy } = policyFor('quad', linearPins(count))
      // 文字高度 ≈ 1.15×字号
      expect(policy.numberFont * 1.15).toBeLessThanOrEqual(policy.pitch + 0.001)
      expect(policy.numberFont).toBeGreaterThanOrEqual(9)
      expect(policy.numberFont).toBeLessThanOrEqual(26)
    }
  })

  it('具体封装下的字号（本体 580 单位内反推，可核对）', () => {
    // LQFP48：每边 12 脚 → 行距 48.33，号字 25.1 / pad 名 21.3（块宽 30 容得下）
    const lqfp48 = policyFor('quad', linearPins(48))
    expect(lqfp48.policy.pitch).toBeCloseTo(48.33, 1)
    expect(lqfp48.policy.numberFont).toBeCloseTo(25.13, 1)
    expect(lqfp48.policy.padFont).toBeCloseTo(21.27, 1)
    expect(lqfp48.policy.showPadName).toBe(true)

    // LQFP100：每边 25 脚 → 行距 23.2，号字缩到 12.1；名字写进块里以后
    // 块宽 14.4 还容得下 9.0 号字 → **名字能显示了**（旧规则行距 <26 是整体不画的）
    const lqfp100 = policyFor('quad', linearPins(100))
    expect(lqfp100.policy.pitch).toBeCloseTo(23.2, 1)
    expect(lqfp100.policy.numberFont).toBeCloseTo(12.06, 1)
    expect(lqfp100.policy.padFont).toBeCloseTo(9.04, 1)
    expect(lqfp100.policy.showPadName).toBe(true)

    // 合成 19×19 网格：格子 30.5，球号 13.4，行列头 15.3（球号画得下）
    const dense = policyFor('grid', gridPins(19, 19))
    expect(dense.policy.cell).toBeCloseTo(30.53, 1)
    expect(dense.policy.ballFont).toBeCloseTo(13.43, 1)
    expect(dense.policy.axisFont).toBeCloseTo(15.26, 1)
    expect(dense.policy.showBallText).toBe(true)
    // 网格封装没有引脚块，名字不画（球内写球号，名字靠悬停/Inspector）
    expect(dense.policy.showPadName).toBe(false)

    // 真实 TFBGA361（STM32MP151AACx）：32 行 × 23 列、361 球 → 格子 18.1，
    // 球号画不下（18.1 < 26）只留行列坐标头，轴字号被下限抬到 10
    const tfbga361 = policyFor('grid', gridPins(32, 23))
    expect(tfbga361.policy.cell).toBeCloseTo(18.13, 1)
    expect(tfbga361.policy.showBallText).toBe(false)
    expect(tfbga361.policy.axisFont).toBe(10)
  })

  it('格子太密时球号不画（靠行列坐标头 + 悬停读）', () => {
    const { policy } = policyFor('grid', gridPins(21, 26))
    expect(policy.cell).toBeLessThan(26)
    expect(policy.showBallText).toBe(false)
  })

  it('组件层要求不看 pad 名时不画', () => {
    expect(policyFor('quad', linearPins(48), false).policy.showPadName).toBe(false)
  })

  it('density Mode：行距过小连引脚号也不画（LQFP208 每边 52 脚 → 行距 11.2）', () => {
    expect(policyFor('quad', linearPins(100)).policy.showNumber).toBe(true)
    const huge = policyFor('quad', linearPins(208))
    expect(huge.policy.pitch).toBeCloseTo(11.15, 1)
    expect(huge.policy.showNumber).toBe(false)
    expect(huge.policy.showPadName).toBe(false)
  })

  it('pad 名可用长度 = 块长 − 两侧内边距（名字写在块里）', () => {
    const { policy, layout } = policyFor('quad', linearPins(48))
    expect(policy.padMaxLength).toBeCloseTo(layout.meta.pinLength! - PAD_INLINE_INSET * 2, 5)
    // LQFP48 的块长 64 → 可用 52：4 字符的主名（PC13/VSSA）放得下
    expect(fitText('PC13', policy.padMaxLength, policy.padFont)).toBe('PC13')
  })
})

/**
 * 名字写进引脚块里（CubeMX 风格）：块内空间就是"内接矩形"，
 * 于是四角不再有"左右文字 vs 上下文字"的互侵，本体内侧也腾空；密封装还能多显示名字。
 * 这里锁住两条不变式：①能画就说明字高放得进块宽 ②横排/竖排都把字身居在块的中线上。
 */
describe('块内 pad 名（CubeMX 风格）', () => {
  it('不变式：只要画名字，字高就放得进块宽', () => {
    for (const count of [32, 48, 64, 88, 100, 144, 208]) {
      const { policy, layout } = policyFor('quad', linearPins(count))
      if (policy.showPadName) {
        expect(policy.padFont * 1.15 + 2).toBeLessThanOrEqual(layout.meta.pinWidth! + 0.001)
      }
    }
  })

  it('块宽太小就不画（LQFP208 块宽 6.9 放不下 9 号字）', () => {
    const { policy, layout } = policyFor('quad', linearPins(208))
    expect(layout.meta.pinWidth!).toBeCloseTo(6.91, 1)
    expect(policy.showPadName).toBe(false)
  })

  it('左右两侧横排、基线放在 cy+0.35×字号（字身居中）', () => {
    const { policy, layout } = policyFor('quad', linearPins(48))
    const left = layout.slots.find(s => s.side === 'left')!
    const right = layout.slots.find(s => s.side === 'right')!
    const boxL = padLabelBox(left, policy.padFont)
    const boxR = padLabelBox(right, policy.padFont)
    expect(boxL.x).toBeCloseTo(left.x + PAD_INLINE_INSET, 5)
    expect(boxL.y).toBeCloseTo(left.cy + policy.padFont * 0.35, 5)
    expect(boxL.anchor).toBe('start')
    expect(boxL.rotate).toBe(0)
    expect(boxR.x).toBeCloseTo(right.x + right.w - PAD_INLINE_INSET, 5)
    expect(boxR.anchor).toBe('end')
  })

  it('上下两排竖排、基线放在 cx+0.35×字号（rotate −90 后字身才居中在块中线上）', () => {
    const { policy, layout } = policyFor('quad', linearPins(48))
    for (const side of ['top', 'bottom'] as const) {
      const slot = layout.slots.find(s => s.side === side)!
      const box = padLabelBox(slot, policy.padFont)
      expect(box.rotate).toBe(-90)
      expect(box.anchor).toBe('middle')
      expect(box.x).toBeCloseTo(slot.cx + policy.padFont * 0.35, 5)
      expect(box.y).toBeCloseTo(slot.cy, 5)
      // 竖排后字身横向占 ≈0.92×字号（字高），必须整段落在块宽以内，否则就是没居中
      const bodyLeft = box.x - policy.padFont * 0.72
      const bodyRight = box.x + policy.padFont * 0.2
      expect(bodyLeft).toBeGreaterThan(slot.x)
      expect(bodyRight).toBeLessThan(slot.x + slot.w)
    }
  })

  it('引脚号与同一条边同向：上下两排也竖排，且整段都在块外', () => {
    const { policy, layout } = policyFor('quad', linearPins(48))
    const font = policy.numberFont
    const len = 2 * 0.58 * font // "48" 这类两位数的宽度
    for (const side of ['top', 'bottom'] as const) {
      const slot = layout.slots.find(s => s.side === side)!
      const box = numberLabelBox(slot, font)
      expect(box.rotate).toBe(-90)
      expect(box.x).toBeCloseTo(slot.cx + font * 0.35, 5)
      if (side === 'top') {
        expect(box.y + 0.001).toBeLessThanOrEqual(slot.y) // 整段在块上方（rotate −90 + start 向上延伸）
        expect(box.anchor).toBe('start')
      }
      else {
        expect(box.y).toBeGreaterThanOrEqual(slot.y + slot.h) // 整段在块下方
        expect(box.anchor).toBe('end')
      }
      expect(box.y - (side === 'top' ? len : 0)).toBeGreaterThan(0)
      expect(box.y + (side === 'top' ? 0 : len)).toBeLessThan(1000)
    }
    // 左右两列保持横排，号在块外侧
    const left = layout.slots.find(s => s.side === 'left')!
    const boxL = numberLabelBox(left, font)
    expect(boxL.rotate).toBe(0)
    expect(boxL.x).toBeLessThan(left.x)
    expect(boxL.anchor).toBe('end')
  })

  it('rotateTransform 只对竖排产生 transform', () => {
    expect(rotateTransform({ x: 10, y: 20, rotate: 0 })).toBeUndefined()
    expect(rotateTransform({ x: 10, y: 20, rotate: -90 })).toBe('rotate(-90 10 20)')
  })
})

describe('fitText：SVG 的 text 不会自动收缩，超宽必须截断', () => {
  it('放得下就原样返回', () => {
    expect(fitText('PA10', 200, 21)).toBe('PA10')
  })

  it('放不下截断并加省略号', () => {
    const result = fitText('VERY_LONG_PAD_NAME_HERE', 100, 21)
    expect(result.endsWith('…')).toBe(true)
    expect(result.length).toBeLessThan('VERY_LONG_PAD_NAME_HERE'.length)
  })

  it('中日韩字符按全宽算，更早截断', () => {
    // 同样 10 个字符、同样 130 宽度：ASCII 放得下（10×12.2=122），中文放不下（10×21=210）
    expect(fitText('AAAAAAAAAA', 130, 21)).toBe('AAAAAAAAAA')
    expect(fitText('测试测试测试测试测试', 130, 21).endsWith('…')).toBe(true)
  })

  it('宽度为 0 或空串返回空', () => {
    expect(fitText('PA0', 0, 21)).toBe('')
    expect(fitText('', 100, 21)).toBe('')
  })
})
