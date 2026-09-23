import type { Pin } from '~/types/pinatlas'

/**
 * 引脚「功能类别」过滤：图上方那排 chip（全部 / GND / 5V / 3V3 / GPIO / UART / I2C / QSPI / I2S /
 * JTAG / PDM / PWM），点一下就把对应引脚高亮、其余淡化。
 *
 * 每条规则的来源都是**实测数据**（9 个家族各取引脚最多的型号，共 2100 个脚采样，2026-09-23）：
 *   - `pin.type` 有 8 个值：gpio 1221 / power 228 / ground 271 / mono 119 / clock 32 / reset 14 /
 *     nc 11 / boot 7 → GND 直接用 type，3V3 = power（VDD/VBAT/VDDA/VREF+ 这一族）。
 *   - `functions[].type`（数据层给的功能大类）实测分布：timer 1154 / spi 1042 / uart 769 / adc 688 /
 *     i2c 334 / system 159 / usb 107 / can 59 / other 2788 → UART、I2C 优先用它，正则只作旧数据兜底。
 *   - QSPI（外设 QUADSPI/OCTOSPI/XSPI，实测 191 个）、I2S（外设 I2S 或 SAI，715 个）、
 *     PWM（外设 TIMx 且信号 CHx，749 个）、
 *     JTAG（SYS_JTMS/JTCK/JTDI/JTDO + SWDIO/SWCLK，144 个）、PDM（DFSDM*，即 PDM 麦克风通道）
 *     在数据里**没有对应的大类**，只能按外设/信号名匹配。
 *   - **芯片级数据里没有 5V/3V3 这种电源轨名**：整份取样里只有 1 个命中（STM32MP151 的 OTG_VBUS）。
 *     所以 5V 这条规则命中率天然很低（多数型号是 0），UI 上计数为 0 时禁用而不是隐藏。
 */

export type PinCategoryId
  = 'all' | 'gnd' | 'v5' | 'v3' | 'gpio' | 'uart' | 'i2c' | 'qspi' | 'i2s' | 'jtag' | 'pdm' | 'pwm'

export interface PinCategory {
  id: PinCategoryId
  label: string
  /** 面板上的悬停说明（规则来源） */
  hint: string
}

/** 顺序即面板顺序（与用户给的清单一致） */
export const PIN_CATEGORIES: PinCategory[] = [
  { id: 'all', label: '全部', hint: '取消过滤，显示全部引脚' },
  { id: 'gnd', label: 'GND', hint: '引脚类型 = 地（VSS / VSSA / VSSRF …）' },
  { id: 'v5', label: '5V', hint: '名字或功能含 5V / VBUS / VIN（芯片级数据里很少，多数型号为 0）' },
  { id: 'v3', label: '3V3', hint: '引脚类型 = 电源（VDD / VBAT / VDDA / VREF+ …）' },
  { id: 'gpio', label: 'GPIO', hint: '引脚类型 = 普通 IO（可复用）' },
  { id: 'uart', label: 'UART', hint: '功能大类 = uart（USART / UART / LPUART）' },
  { id: 'i2c', label: 'I2C', hint: '功能大类 = i2c（I2C / I3C）' },
  { id: 'qspi', label: 'QSPI', hint: '外设 = QUADSPI / OCTOSPI / XSPI' },
  { id: 'i2s', label: 'I2S', hint: '外设 = I2S / SAI，或信号名含 I2S' },
  { id: 'jtag', label: 'JTAG', hint: '信号 = JTMS / JTCK / JTDI / JTDO / NJTRST / SWDIO / SWCLK' },
  { id: 'pdm', label: 'PDM', hint: '外设 = DFSDM（PDM 麦克风的标准通道）' },
  { id: 'pwm', label: 'PWM', hint: '外设 = TIMx 且信号 = CHx（定时器通道）' },
]

const FIVE_VOLT = /5V|VBUS|VIN/
const UART = /^(?:US?ART|LPUART)/
const I2C = /^(?:I2C|I3C)/
const QSPI = /^(?:QUADSPI|OCTOSPI|XSPI|QSPI)|OSPIM/
const I2S = /^(?:I2S|SAI)/
const PDM = /^DFSDM/
const JTAG = /JTMS|JTCK|JTDI|JTDO|NJTRST|SWDIO|SWCLK/
const TIMER = /^TIM\d/
const TIMER_CHANNEL = /CH\d/

/** 5V 轨：芯片级数据里几乎没有，靠名字/信号里的 5V、VBUS、VIN 兜 */
export function isFiveVoltPin(pin: Pin): boolean {
  if (FIVE_VOLT.test(pinPrimaryName(pin))) {
    return true
  }
  return pin.functions.some(fn => FIVE_VOLT.test(fn.peripheral) || FIVE_VOLT.test(fn.signal))
}

function pinPrimaryName(pin: Pin): string {
  return String(pin.primary || pin.pad || pin.name || '').toUpperCase()
}

export function matchesCategory(pin: Pin, id: PinCategoryId): boolean {
  switch (id) {
    case 'all':
      return true
    case 'gnd':
      return pin.type === 'ground'
    case 'v5':
      return isFiveVoltPin(pin)
    case 'v3':
      // 电源脚里排除掉 5V 那类（VBUS/VIN），剩下的就是 VDD 域
      return pin.type === 'power' && !isFiveVoltPin(pin)
    case 'gpio':
      return pin.type === 'gpio'
    case 'qspi':
      return pin.functions.some(fn => QSPI.test(fn.peripheral) || QSPI.test(fn.signal))
    case 'i2s':
      return pin.functions.some(fn => I2S.test(fn.peripheral) || /I2S/.test(fn.signal))
    case 'jtag':
      return pin.functions.some(fn => JTAG.test(fn.signal) || JTAG.test(fn.peripheral))
    case 'pdm':
      return pin.functions.some(fn => PDM.test(fn.peripheral) || PDM.test(fn.signal))
    case 'pwm':
      return pin.functions.some(fn => TIMER.test(fn.peripheral) && TIMER_CHANNEL.test(fn.signal))
    case 'uart':
      // 功能大类优先（v1.1.0），正则兜旧数据（v1.0.0 没有 functions[].type）
      return pin.functions.some(fn => fn.type === 'uart' || UART.test(fn.peripheral))
    case 'i2c':
      return pin.functions.some(fn => fn.type === 'i2c' || I2C.test(fn.peripheral))
    default:
      return false
  }
}

export interface PinCategoryCount extends PinCategory {
  count: number
  /** 计数为 0 时禁用（用户偏好禁用而不是隐藏） */
  disabled: boolean
}

/** 面板数据：每类的匹配引脚数（「全部」= 引脚总数） */
export function categoryCounts(pins: Pin[]): PinCategoryCount[] {
  return PIN_CATEGORIES.map(category => ({
    ...category,
    count: category.id === 'all' ? pins.length : pins.filter(pin => matchesCategory(pin, category.id)).length,
  })).map(category => ({ ...category, disabled: category.count === 0 }))
}
