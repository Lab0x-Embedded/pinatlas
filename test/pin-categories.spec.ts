import type { Pin, PinFunction } from '~/types/pinatlas'
import { describe, expect, it } from 'vitest'
import { categoryCounts, isFiveVoltPin, matchesCategory, PIN_CATEGORIES } from '~/utils/pin-categories'

/**
 * 功能类别过滤（图上方那排 chip）。规则全部按实测数据定：
 *   - GND / 3V3 / GPIO 用 pin.type（实测 8 个值：gpio/power/ground/clock/mono/reset/boot/nc）；
 *   - UART / I2C 优先用 functions[].type（数据层给的大类），正则兜 v1.0.0 的旧数据；
 *   - QSPI / I2S / JTAG / PDM / PWM 数据里没有大类，按外设名/信号名匹配；
 *   - 5V 在芯片级数据里几乎不存在（整份取样只有 OTG_VBUS 一个），靠名字/信号里的 5V·VBUS·VIN。
 */

function pin(overrides: Partial<Pin> & { type: Pin['type'] }): Pin {
  return {
    position: '1',
    pad: 'PA0',
    name: 'PA0',
    functions: [],
    ...overrides,
  }
}

function fn(overrides: Partial<PinFunction> & { peripheral: string, signal: string }): PinFunction {
  return { af: null, ...overrides }
}

/** 一份"功能齐全"的脚集：每个类别各一个代表脚，外加几个典型干扰项 */
const FIXTURE: Pin[] = [
  pin({ position: '1', primary: 'VDD', type: 'power' }),
  pin({ position: '2', primary: 'VSSA', type: 'ground' }),
  pin({ position: '3', primary: 'OTG_VBUS', type: 'mono', functions: [fn({ peripheral: 'USB_OTG_HS', signal: 'VBUS' })] }),
  pin({ position: '4', primary: 'PA0', type: 'gpio', functions: [fn({ peripheral: 'USART2', signal: 'CTS', type: 'uart' })] }),
  pin({ position: '5', primary: 'PB6', type: 'gpio', functions: [fn({ peripheral: 'I2C1', signal: 'SCL', type: 'i2c', af: 4 })] }),
  pin({ position: '6', primary: 'PE2', type: 'gpio', functions: [fn({ peripheral: 'QUADSPI', signal: 'BK1_IO2', type: 'other', af: 9 })] }),
  pin({ position: '7', primary: 'PB3', type: 'gpio', functions: [fn({ peripheral: 'I2S3', signal: 'CK', type: 'spi', af: 6 })] }),
  pin({ position: '8', primary: 'PE4', type: 'gpio', functions: [fn({ peripheral: 'SAI1', signal: 'FS_A', type: 'other', af: 6 })] }),
  pin({ position: '9', primary: 'PA13', type: 'gpio', functions: [fn({ peripheral: 'SYS', signal: 'JTMS-SWDIO', type: 'system', system: true })] }),
  pin({ position: '10', primary: 'PD6', type: 'gpio', functions: [fn({ peripheral: 'DFSDM1', signal: 'DATIN0', type: 'other', af: 3 })] }),
  pin({ position: '11', primary: 'PA5', type: 'gpio', functions: [fn({ peripheral: 'TIM2', signal: 'CH1', type: 'timer', af: 1 })] }),
  // 旧数据（v1.0.0）：functions 没有 type 字段，只能靠外设名兜
  pin({ position: '12', primary: 'PA10', type: 'gpio', functions: [fn({ peripheral: 'USART1', signal: 'RX' })] }),
]

describe('matchesCategory：每个类别只命中该命中的脚', () => {
  it('全部：任何时候都命中', () => {
    for (const p of FIXTURE) {
      expect(matchesCategory(p, 'all')).toBe(true)
    }
  })

  it('按类型判定：GND / 3V3 / GPIO，且 3V3 排除 5V 类', () => {
    const vdd = FIXTURE[0]!
    const vss = FIXTURE[1]!
    const vbus = FIXTURE[2]!
    const gpio = FIXTURE[3]!
    expect(matchesCategory(vss, 'gnd')).toBe(true)
    expect(matchesCategory(vdd, 'gnd')).toBe(false)
    expect(matchesCategory(vdd, 'v3')).toBe(true)
    expect(matchesCategory(vbus, 'v3')).toBe(false) // VBUS 是 5V 那类
    expect(matchesCategory(vbus, 'v5')).toBe(true)
    expect(isFiveVoltPin(vbus)).toBe(true)
    expect(matchesCategory(gpio, 'gpio')).toBe(true)
    expect(matchesCategory(vss, 'gpio')).toBe(false)
  })

  it('按功能大类判定：UART / I2C（旧数据无 type 时靠外设名兜）', () => {
    const uartTyped = FIXTURE[3]!
    const uartLegacy = FIXTURE[11]!
    const i2c = FIXTURE[4]!
    expect(matchesCategory(uartTyped, 'uart')).toBe(true)
    expect(matchesCategory(uartLegacy, 'uart')).toBe(true)
    expect(matchesCategory(i2c, 'i2c')).toBe(true)
    expect(matchesCategory(uartTyped, 'i2c')).toBe(false)
  })

  it('按外设名/信号名判定：QSPI / I2S / JTAG / PDM / PWM', () => {
    expect(matchesCategory(FIXTURE[5]!, 'qspi')).toBe(true) // QUADSPI
    expect(matchesCategory(FIXTURE[6]!, 'i2s')).toBe(true) // I2S3_CK
    expect(matchesCategory(FIXTURE[7]!, 'i2s')).toBe(true) // SAI1_FS_A
    expect(matchesCategory(FIXTURE[8]!, 'jtag')).toBe(true) // SYS_JTMS-SWDIO
    expect(matchesCategory(FIXTURE[9]!, 'pdm')).toBe(true) // DFSDM1
    expect(matchesCategory(FIXTURE[10]!, 'pwm')).toBe(true) // TIM2_CH1
    // 交叉不误伤：TIM 的 ETR/BRK 不是通道，不该算 PWM
    const etr = pin({ type: 'gpio', functions: [fn({ peripheral: 'TIM2', signal: 'ETR', type: 'timer' })] })
    expect(matchesCategory(etr, 'pwm')).toBe(false)
    // SPI 的 SCK 不是 I2S
    const spi = pin({ type: 'gpio', functions: [fn({ peripheral: 'SPI1', signal: 'SCK', type: 'spi' })] })
    expect(matchesCategory(spi, 'i2s')).toBe(false)
  })
})

describe('categoryCounts：面板计数与禁用', () => {
  it('「全部」= 引脚总数，其余按规则计数', () => {
    const counts = Object.fromEntries(categoryCounts(FIXTURE).map(c => [c.id, c.count]))
    expect(counts.all).toBe(FIXTURE.length)
    expect(counts.gnd).toBe(1)
    expect(counts.v3).toBe(1)
    expect(counts.v5).toBe(1)
    expect(counts.gpio).toBe(9) // 去掉 VDD/VSSA/OTG_VBUS 三个非 gpio
    expect(counts.uart).toBe(2)
    expect(counts.i2c).toBe(1)
    expect(counts.qspi).toBe(1)
    expect(counts.i2s).toBe(2)
    expect(counts.jtag).toBe(1)
    expect(counts.pdm).toBe(1)
    expect(counts.pwm).toBe(1)
  })

  it('计数为 0 的类别被禁用（用户偏好禁用而不是隐藏）', () => {
    const only = [pin({ type: 'gpio' })]
    const counts = categoryCounts(only)
    const byId = Object.fromEntries(counts.map(c => [c.id, c]))
    expect(byId.all!.disabled).toBe(false)
    expect(byId.gpio!.disabled).toBe(false)
    expect(byId.qspi!.disabled).toBe(true)
    expect(byId.qspi!.count).toBe(0)
    // 顺序与用户给的清单一致
    expect(counts.map(c => c.id)).toEqual(PIN_CATEGORIES.map(c => c.id))
    expect(counts.map(c => c.label)).toEqual(['全部', 'GND', '5V', '3V3', 'GPIO', 'UART', 'I2C', 'QSPI', 'I2S', 'JTAG', 'PDM', 'PWM'])
  })

  it('每个类别都有说明文案（面板 title）', () => {
    for (const category of PIN_CATEGORIES) {
      expect(category.hint.length).toBeGreaterThan(4)
    }
  })
})
