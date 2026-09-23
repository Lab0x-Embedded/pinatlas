import type { Pin } from '~/types/pinatlas'
import { describe, expect, it } from 'vitest'
import { comparePosition, searchPins } from '~/utils/pin-search'

/**
 * 引脚搜索：大封装（LQFP144 起）图上不画 pad 名与引脚号，只能靠搜。
 * 用例按真实型号来：STM32F407Z(E-G)Tx 的 PB9 / PA13 / 96 号脚。
 */
function pin(partial: Partial<Pin> & { position: string, name: string }): Pin {
  const primary = partial.primary ?? partial.name.replace(/[- (].*$/, '').toUpperCase()
  return {
    pad: primary,
    primary,
    type: 'gpio',
    functions: [],
    ...partial,
  }
}

const PB9 = pin({
  position: '96',
  name: 'PB9',
  primary: 'PB9',
  functions: [
    { peripheral: 'CAN1', signal: 'TX', af: 9 },
    { peripheral: 'EXTI', signal: 'EXTI9', af: null, type: 'exti', system: true },
    { peripheral: 'DCMI', signal: 'D7', af: 13 },
  ],
})
const PA13 = pin({
  position: '77',
  name: 'PA13 (JTMS/SWDIO)',
  primary: 'PA13',
  aliases: ['JTMS', 'SWDIO'],
  functions: [{ peripheral: 'SYS', signal: 'JTMS-SWDIO', af: null, system: true }],
})
const PC13 = pin({
  position: '7',
  name: 'PC13-TAMPER-RTC',
  primary: 'PC13',
  aliases: ['TAMPER', 'RTC'],
})
const PA9 = pin({ position: '42', name: 'PA9', primary: 'PA9', functions: [{ peripheral: 'I2C1', signal: 'SCL', af: 4 }, { peripheral: 'DAC', signal: 'EXTI9', af: null }] })
const VDD = pin({ position: '30', name: 'VDD', primary: 'VDD', type: 'power' })

const PINS = [PB9, PA13, PC13, PA9, VDD]
const positions = (query: string) => searchPins(PINS, query).map(hit => hit.pin.position)

describe('引脚搜索：四类字段', () => {
  it('引脚号（精确命中排最前）', () => {
    expect(positions('96')).toEqual(['96'])
    // 「9」能同时命中 96 / 42(PA9) / 7(PC13→无) …按位置数值升序
    expect(positions('9')).toEqual(['96', '42'])
  })

  it('焊盘名 / 主名', () => {
    expect(positions('pb9')).toEqual(['96'])
    expect(positions('PA13')).toEqual(['77'])
  })

  it('别名（JTMS/SWDIO、TAMPER）', () => {
    expect(positions('swdio')).toEqual(['77'])
    expect(positions('tamper')).toEqual(['7'])
  })

  it('复用功能：信号、外设_信号、外设都能搜', () => {
    expect(positions('CAN1_TX')).toEqual(['96'])
    expect(positions('can1 tx')).toEqual(['96'])
    expect(positions('D7')).toEqual(['96'])
    expect(positions('i2c1')).toEqual(['42'])
    // PA9 的 DAC 组里也挂着 EXTI9（假前缀已被数据层归一，旧数据/缓存里可能还是这样）；
    // 同分按位置升序 → 42(PA9) 在 96(PB9) 前面
    expect(positions('EXTI9')).toEqual(['42', '96'])
  })

  it('多词是 AND：全命中才要', () => {
    expect(positions('pb 96')).toEqual(['96'])
    expect(positions('pb 77')).toEqual([])
  })

  it('大小写不敏感；无匹配返回空', () => {
    expect(positions('PB9')).toEqual(positions('pb9'))
    expect(searchPins(PINS, 'zzz')).toEqual([])
  })

  it('空 query 返回空数组（"没在搜"与"搜到 0 个"分开表达）', () => {
    expect(searchPins(PINS, '')).toEqual([])
    expect(searchPins(PINS, '   ')).toEqual([])
  })
})

describe('引脚搜索：排序稳定（↑↓ 导航依赖它）', () => {
  it('同分按位置升序（数值 / 网格坐标两种都稳）', () => {
    const g = pin({ position: 'A1', name: 'PA1', primary: 'PA1', functions: [{ peripheral: 'TIM2', signal: 'CH1', af: 1 }] })
    const h = pin({ position: 'B7', name: 'PB7', primary: 'PB7', functions: [{ peripheral: 'TIM2', signal: 'CH2', af: 2 }] })
    expect(searchPins([h, g], 'tim2').map(x => x.pin.position)).toEqual(['A1', 'B7'])
  })

  it('comparePosition：数字比数值，网格坐标比字典序', () => {
    expect(comparePosition('9', '10')).toBeLessThan(0)
    expect(comparePosition('A1', 'B7')).toBeLessThan(0)
    expect(comparePosition('96', '96')).toBe(0)
  })
})
