import type { Pin, PinFunction, PinType } from '~/types/pinatlas'

/** 引脚语义类型 → 中文名（对应 pinatlas-data 的类型映射表） */
export const PIN_TYPE_LABEL: Record<PinType, string> = {
  gpio: 'GPIO / 复用',
  power: '电源',
  ground: '地',
  reset: '复位',
  boot: '启动',
  clock: '时钟',
  mono: '单功能',
  nc: '未连接',
  other: '其他',
}

/** 引脚语义类型 → 填充/描边 class（颜色令牌定义在 app/assets/css/main.css） */
export const PIN_TYPE_FILL: Record<PinType, string> = {
  gpio: 'fill-pin-gpio/15 stroke-pin-gpio',
  power: 'fill-pin-power/15 stroke-pin-power',
  ground: 'fill-pin-ground/15 stroke-pin-ground',
  reset: 'fill-pin-reset/15 stroke-pin-reset',
  boot: 'fill-pin-boot/15 stroke-pin-boot',
  clock: 'fill-pin-clock/15 stroke-pin-clock',
  mono: 'fill-pin-mono/15 stroke-pin-mono',
  nc: 'fill-pin-nc/15 stroke-pin-nc',
  other: 'fill-pin-other/15 stroke-pin-other',
}

/** 图例文本色 */
export const PIN_TYPE_TEXT: Record<PinType, string> = {
  gpio: 'text-pin-gpio border-pin-gpio',
  power: 'text-pin-power border-pin-power',
  ground: 'text-pin-ground border-pin-ground',
  reset: 'text-pin-reset border-pin-reset',
  boot: 'text-pin-boot border-pin-boot',
  clock: 'text-pin-clock border-pin-clock',
  mono: 'text-pin-mono border-pin-mono',
  nc: 'text-pin-nc border-pin-nc',
  other: 'text-pin-other border-pin-other',
}

/** 图例顺序：功能脚在前，电源/复位类在后（与数据手册的阅读习惯一致） */
export const PIN_TYPE_ORDER: PinType[] = ['gpio', 'clock', 'mono', 'power', 'ground', 'reset', 'boot', 'nc', 'other']

/** 功能大类 → 中文名（用于 Inspector 的分组标签） */
export const FUNCTION_TYPE_LABEL: Record<string, string> = {
  adc: 'ADC',
  timer: '定时器',
  spi: 'SPI / I2S',
  i2c: 'I2C',
  uart: '串口',
  can: 'CAN',
  usb: 'USB',
  system: '系统',
  other: '其他',
}

/**
 * 主名拆分（与数据层 `splitPinName()` 同规则，前端作为旧数据兜底 + 校验）。
 *   "PC13-TAMPER-RTC" → primary=PC13, aliases=[TAMPER, RTC]
 *   "VDD/VDDA"        → primary=VDD,  aliases=[VDDA]
 *   "VSSA/VREF-"      → primary=VSSA, aliases=[VREF-]（负参考的连字符属于名字）
 *   "PA11 [PA9]"      → primary=PA11, variantOf=PA9
 */
export function splitPinName(name: string) {
  const raw = String(name || '').trim()
  // 手动解析方括号（正则版会触发回溯告警，且行为等价）："PA11 [PA9]" → head=PA11, variantOf=PA9
  const open = raw.lastIndexOf('[')
  const closable = open >= 0 && raw.endsWith(']')
  const head = closable ? raw.slice(0, open).trim() : raw
  const variantOf = closable ? raw.slice(open + 1, raw.length - 1).trim().toUpperCase() || null : null

  const segments = head.split('/').map(s => s.trim()).filter(Boolean)
  const dashParts = (segments[0] || head).split('-').map(s => s.trim())
  const primary = (dashParts[0] || head).toUpperCase()

  const aliases: string[] = []
  for (const part of dashParts.slice(1)) {
    if (part) {
      aliases.push(part.toUpperCase())
    }
  }
  for (const part of segments.slice(1)) {
    if (part) {
      aliases.push(part.toUpperCase())
    }
  }
  return { primary, aliases: [...new Set(aliases)], variantOf }
}

/** 主显示名：优先用数据里的 primary，旧数据（schema 1.0.0）现场拆一次 */
export function pinPrimary(pin: Pick<Pin, 'primary' | 'name' | 'pad'>): string {
  if (pin.primary) {
    return pin.primary
  }
  return splitPinName(pin.name || pin.pad).primary
}

/** 别名：优先用数据里的 aliases，旧数据现场拆 */
export function pinAliases(pin: Pick<Pin, 'aliases' | 'name'>): string[] {
  return pin.aliases ?? splitPinName(pin.name).aliases
}

export interface FunctionGroup {
  peripheral: string
  system: boolean
  functions: PinFunction[]
}

/** 按外设分组；RCC_/SYS_ 这类系统信号单独一组（docs/02-data-contract.md §3.3） */
export function groupFunctions(functions: PinFunction[]): FunctionGroup[] {
  const groups = new Map<string, FunctionGroup>()
  for (const fn of functions) {
    const key = fn.peripheral || '其他'
    const group = groups.get(key) ?? { peripheral: key, system: Boolean(fn.system), functions: [] }
    group.functions.push(fn)
    groups.set(key, group)
  }
  return [...groups.values()].sort((a, b) => {
    if (a.system !== b.system) {
      return a.system ? 1 : -1
    }
    return a.peripheral.localeCompare(b.peripheral, undefined, { numeric: true })
  })
}

/** 功能显示文本：有 signal 时 "CH1"，否则退回外设名 */
export const functionLabel = (fn: PinFunction) => fn.signal || fn.peripheral

export const afLabel = (fn: PinFunction) => (fn.af === null || fn.af === undefined ? '-' : `AF${fn.af}`)
