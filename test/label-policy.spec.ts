import type { Pin } from '~/types/pinatlas'
import { describe, expect, it } from 'vitest'
import { fitText, labelPolicy } from '~/utils/label-policy'
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
    // LQFP48：每边 12 脚 → 行距 48.33，号字 25.1 / pad 名 21.3
    const lqfp48 = policyFor('quad', linearPins(48))
    expect(lqfp48.policy.pitch).toBeCloseTo(48.33, 1)
    expect(lqfp48.policy.numberFont).toBeCloseTo(25.13, 1)
    expect(lqfp48.policy.padFont).toBeCloseTo(21.27, 1)
    expect(lqfp48.policy.showPadName).toBe(true)

    // LQFP100：每边 25 脚 → 行距 23.2，号字缩到 12.1，pad 名不画
    const lqfp100 = policyFor('quad', linearPins(100))
    expect(lqfp100.policy.pitch).toBeCloseTo(23.2, 1)
    expect(lqfp100.policy.numberFont).toBeCloseTo(12.06, 1)
    expect(lqfp100.policy.showPadName).toBe(false)

    // 合成 19×19 网格：格子 30.5，球号 13.4，行列头 15.3（球号画得下）
    const dense = policyFor('grid', gridPins(19, 19))
    expect(dense.policy.cell).toBeCloseTo(30.53, 1)
    expect(dense.policy.ballFont).toBeCloseTo(13.43, 1)
    expect(dense.policy.axisFont).toBeCloseTo(15.26, 1)
    expect(dense.policy.showBallText).toBe(true)

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

  it('pad 名可用宽度是本体内侧一半（左右两侧不会在中线相遇）', () => {
    const { policy } = policyFor('quad', linearPins(48))
    expect(policy.padMaxWidth).toBeCloseTo(bodyRect.width / 2 - 24, 5)
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
