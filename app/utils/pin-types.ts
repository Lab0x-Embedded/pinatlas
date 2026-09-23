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

/**
 * 历史别名 → 契约类型。
 * 数据仓库 v1.0.0 把 GPIO 写成 `io`（v1.1.0 起统一为 `gpio`），而 jsDelivr 对分支引用
 * 有缓存（docs/07 §9），线上可能同时拿到新旧两份数据 → 只认 `gpio` 会让整批 IO 脚
 * 查表失败、class 为空、SVG 用默认填充渲染成**纯黑块**（docs/07 §17）。
 */
const PIN_TYPE_ALIASES: Record<string, PinType> = { io: 'gpio' }

/**
 * 把任意来源的 `type` 归一成契约类型，无法识别时兜底 `other`。
 * 不变式：返回值一定在 `PIN_TYPE_FILL` / `PIN_TYPE_LABEL` 里存在；否则引脚会静默变黑。
 */
export function normalizePinType(raw: unknown): PinType {
  const key = String(raw ?? '').trim().toLowerCase()
  if (Object.hasOwn(PIN_TYPE_LABEL, key)) {
    return key as PinType
  }
  return PIN_TYPE_ALIASES[key] ?? 'other'
}

/** 归一化单个引脚（含它的 `variants`），在数据入口调用一次，下游无需再防 */
export function normalizePin(pin: Pin): Pin {
  const type = normalizePinType(pin.type)
  if (!pin.variants) {
    return { ...pin, type }
  }
  return {
    ...pin,
    type,
    variants: Object.fromEntries(
      Object.entries(pin.variants).map(([key, variant]) => [key, { ...variant, type: normalizePinType(variant.type) }]),
    ),
  }
}

/** 批量归一化引脚（store 在芯片文档载入时调用；新旧两份数据都能正确着色） */
export function normalizePins(pins: Pin[]): Pin[] {
  return pins.map(normalizePin)
}

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
 *   "PA13 (JTMS/SWDIO)" → primary=PA13, aliases=[JTMS, SWDIO]（括号注释，先摘再拆！）
 *   "PC2_C"             → primary=PC2（_C 是模拟开关后缀，主名取焊盘 token）
 *   "PA11 [PA9]"      → primary=PA11, variantOf=PA9
 */
/** 摘掉行尾的 [] 重映射标注（"PA11 [PA9]" → head=PA11, variantOf=PA9） */
function stripVariantMark(raw: string): { head: string, variantOf: string | null } {
  const bracket = raw.lastIndexOf('[')
  if (bracket < 0 || !raw.endsWith(']')) {
    return { head: raw, variantOf: null }
  }
  return {
    head: raw.slice(0, bracket).trim(),
    variantOf: raw.slice(bracket + 1, raw.length - 1).trim().toUpperCase() || null,
  }
}

/** 摘掉行尾圆括号注释并拆成别名（"PA13 (JTMS/SWDIO)" → head=PA13, aliases=[JTMS, SWDIO]） */
function stripParenNote(raw: string): { head: string, aliases: string[] } {
  const paren = raw.lastIndexOf('(')
  if (paren < 0 || !raw.endsWith(')')) {
    return { head: raw, aliases: [] }
  }
  const aliases = raw.slice(paren + 1, raw.length - 1)
    .split(/[/-]/)
    .map(s => s.trim().toUpperCase())
    .filter(Boolean)
  return { head: raw.slice(0, paren).trim(), aliases }
}

/** 按 / 和 - 拆（下划线属于信号名，不拆）：第一段是主名，其余是别名 */
function splitBySeparators(raw: string): { primary: string, aliases: string[] } {
  const segments = raw.split('/').map(s => s.trim()).filter(Boolean)
  const dashParts = (segments[0] || raw).split('-').map(s => s.trim())
  const aliases = [
    ...dashParts.slice(1).filter(Boolean).map(s => s.toUpperCase()),
    ...segments.slice(1).filter(Boolean).map(s => s.toUpperCase()),
  ]
  return { primary: (dashParts[0] || raw).toUpperCase(), aliases }
}

/**
 * 主名优先取"字母 + 数字"的焊盘 token：这正是 embassy AF join 的键。
 *   "PC2_C"     → PC2 + 别名（_C 是模拟开关后缀，单字符别名丢弃）
 *   "PB2_BOOT1" → PB2 + [BOOT1]
 *   "VDD/VDDA"  → 无 token，退回按分隔符拆
 */
function splitByPadToken(raw: string): { primary: string, aliases: string[] } | null {
  const token = /^([a-z]+\d+)/i.exec(raw)
  const pad = token?.[1]
  if (!pad) {
    return null
  }
  const aliases = raw.slice(pad.length)
    .split(/[/-]/)
    .map(s => s.trim().replace(/^[\s_]+|[\s_]+$/g, '').toUpperCase())
    .filter(part => part.length > 1)
  return { primary: pad.toUpperCase(), aliases }
}

/**
 * 主名拆分（与数据层 `splitPinName()` 同规则，前端作为旧数据兜底 + 零信任校验）。
 *
 * 顺序很重要，别调换（踩过坑，见 docs/07 §16）：
 *   1. 摘 [] 重映射标注 → 2. 摘 () 行尾注释 → 3. 优先取焊盘 token → 4. 否则按 / 和 - 拆
 * primary 必须干净，因为它就是 AF join 的键。
 */
export function splitPinName(name: string) {
  const { head: withoutVariant, variantOf } = stripVariantMark(String(name || '').trim())
  const { head, aliases: noteAliases } = stripParenNote(withoutVariant)
  const split = splitByPadToken(head) ?? splitBySeparators(head)
  const aliases = [...new Set([...split.aliases, ...noteAliases])].filter(a => a && a !== split.primary)
  return { primary: split.primary, aliases, variantOf }
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
