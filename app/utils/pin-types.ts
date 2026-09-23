import type { PinFunction, PinType } from '~/types/pinatlas'

/** 引脚语义类型 → 中文名（对应 pinatlas-data 的类型映射表） */
export const PIN_TYPE_LABEL: Record<PinType, string> = {
  io: 'GPIO / 复用',
  power: '电源',
  ground: '地',
  reset: '复位',
  boot: '启动',
  mono: '单功能',
  nc: '未连接',
  other: '其他',
}

/** 引脚语义类型 → 填充/描边 class（颜色令牌定义在 app/assets/css/main.css） */
export const PIN_TYPE_FILL: Record<PinType, string> = {
  io: 'fill-pin-io/15 stroke-pin-io',
  power: 'fill-pin-power/15 stroke-pin-power',
  ground: 'fill-pin-ground/15 stroke-pin-ground',
  reset: 'fill-pin-reset/15 stroke-pin-reset',
  boot: 'fill-pin-boot/15 stroke-pin-boot',
  mono: 'fill-pin-mono/15 stroke-pin-mono',
  nc: 'fill-pin-nc/15 stroke-pin-nc',
  other: 'fill-pin-other/15 stroke-pin-other',
}

/** 图例文本色 */
export const PIN_TYPE_TEXT: Record<PinType, string> = {
  io: 'text-pin-io border-pin-io',
  power: 'text-pin-power border-pin-power',
  ground: 'text-pin-ground border-pin-ground',
  reset: 'text-pin-reset border-pin-reset',
  boot: 'text-pin-boot border-pin-boot',
  mono: 'text-pin-mono border-pin-mono',
  nc: 'text-pin-nc border-pin-nc',
  other: 'text-pin-other border-pin-other',
}

export const PIN_TYPE_ORDER: PinType[] = ['io', 'power', 'ground', 'reset', 'boot', 'mono', 'nc', 'other']

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
