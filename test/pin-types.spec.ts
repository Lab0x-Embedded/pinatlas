import type { Pin } from '~/types/pinatlas'
import { describe, expect, it } from 'vitest'
import { groupFunctions, pinAliases, pinPrimary, splitPinName } from '~/utils/pin-types'

/**
 * 主名/别名拆分：前端与数据层（pinatlas-data scripts/lib/normalize.mjs 的 splitPinName）同规则。
 * 数据层负责写进 JSON，前端这份用于①旧数据（schema 1.0.0）兜底 ②万一字段缺失不至于显示成
 * "PC13-TAMPER-RTC" 这种把额外功能当主名的情况。
 */
describe('splitPinName：把混在名字里的三类信息拆开', () => {
  it('连字符后缀是额外功能（别名），不是第二主名', () => {
    expect(splitPinName('PC13-TAMPER-RTC')).toEqual({ primary: 'PC13', aliases: ['TAMPER', 'RTC'], variantOf: null })
    expect(splitPinName('PA0-WKUP')).toEqual({ primary: 'PA0', aliases: ['WKUP'], variantOf: null })
    expect(splitPinName('PA13-JTMS/SWDIO')).toEqual({ primary: 'PA13', aliases: ['JTMS', 'SWDIO'], variantOf: null })
  })

  it('斜杠是同一物理脚的第二个网络名', () => {
    expect(splitPinName('VDD/VDDA')).toEqual({ primary: 'VDD', aliases: ['VDDA'], variantOf: null })
    expect(splitPinName('VSS/VSSA')).toEqual({ primary: 'VSS', aliases: ['VSSA'], variantOf: null })
  })

  it('负参考的连字符属于名字本身，不能当分隔符吃掉', () => {
    expect(splitPinName('VSSA/VREF-')).toEqual({ primary: 'VSSA', aliases: ['VREF-'], variantOf: null })
  })

  it('圆括号注释要先摘再拆（L4/H7 家族的真实形态，曾把 AF join 键拆坏）', () => {
    expect(splitPinName('PA13 (JTMS/SWDIO)')).toEqual({ primary: 'PA13', aliases: ['JTMS', 'SWDIO'], variantOf: null })
    expect(splitPinName('PH0-OSC_IN (PH0)')).toEqual({ primary: 'PH0', aliases: ['OSC_IN'], variantOf: null })
    expect(splitPinName('PC14-OSC32_IN (PC14)')).toEqual({ primary: 'PC14', aliases: ['OSC32_IN'], variantOf: null })
  })

  it('字母+数字后缀（模拟开关脚）主名取焊盘 token：PC2_C → PC2', () => {
    expect(splitPinName('PC2_C')).toEqual({ primary: 'PC2', aliases: [], variantOf: null })
    expect(splitPinName('PB2_BOOT1')).toEqual({ primary: 'PB2', aliases: ['BOOT1'], variantOf: null })
  })

  it('主名不带任何注释残留（AF join 键就是它）', () => {
    for (const name of ['PA13 (JTMS/SWDIO)', 'PC14-OSC32_IN (PC14)', 'PA11 [PA9]', 'VDD/VDDA', 'PA0-WKUP']) {
      expect(splitPinName(name).primary).toMatch(/^[A-Z][A-Z0-9_+]*$/)
    }
  })

  it('方括号是重映射标注，指向另一个 pad 而不是别名', () => {
    expect(splitPinName('PA11 [PA9]')).toEqual({ primary: 'PA11', aliases: [], variantOf: 'PA9' })
  })

  it('没有分隔符时原样为主名', () => {
    expect(splitPinName('PDR_ON')).toEqual({ primary: 'PDR_ON', aliases: [], variantOf: null })
    expect(splitPinName('BOOT0')).toEqual({ primary: 'BOOT0', aliases: [], variantOf: null })
  })
})

describe('pinPrimary / pinAliases：新数据用字段，旧数据现场拆', () => {
  const base = { position: '7', pad: 'PC13', name: 'PC13-TAMPER-RTC', type: 'gpio' as const, functions: [] }

  it('数据带 primary/aliases 时直接用', () => {
    const pin: Pin = { ...base, primary: 'PC13', aliases: ['TAMPER'] }
    expect(pinPrimary(pin)).toBe('PC13')
    expect(pinAliases(pin)).toEqual(['TAMPER'])
  })

  it('旧数据（schema 1.0.0，没有 primary）从 name 兜底拆分', () => {
    expect(pinPrimary(base)).toBe('PC13')
    expect(pinAliases(base)).toEqual(['TAMPER', 'RTC'])
  })

  it('primary 为空字符串也走兜底', () => {
    expect(pinPrimary({ ...base, primary: '' })).toBe('PC13')
  })
})

describe('功能分组与类型', () => {
  it('按外设分组，系统信号单独成组（带 type 也不影响）', () => {
    const groups = groupFunctions([
      { peripheral: 'TIM2', signal: 'CH1', af: 2, type: 'timer' },
      { peripheral: 'RCC', signal: 'MCO', af: null, type: 'system', system: true },
      { peripheral: 'TIM2', signal: 'CH2', af: 2, type: 'timer' },
    ])
    expect(groups.map(g => g.peripheral)).toEqual(['TIM2', 'RCC'])
    expect(groups[0].functions).toHaveLength(2)
    expect(groups[1].system).toBe(true)
  })
})
