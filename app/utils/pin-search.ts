import type { Pin } from '~/types/pinatlas'
import { splitTerms } from '~/utils/chip-search'
import { pinAliases, pinPrimary } from '~/utils/pin-types'

/**
 * 引脚搜索（当前型号内，纯前端）。
 *
 * 为什么需要：大封装（LQFP144/208、BGA）在图上根本不画 pad 名。label-policy 的判据是
 * `块宽 ≥ 字号×1.15 + 2`，LQFP144 的块宽已经放不下字，每边 40+ 脚时连引脚号也不画，
 * 用户只能靠 hover 一个个试。搜索 + 图上强调是唯一现实的做法（硬画小字只会糊成一团）。
 *
 * 四类字段，权重按"用户最可能先打什么"定：
 *   引脚号（精确 100）> 焊盘名/主名（精确 90）> 别名 > 复用功能（信号 / 外设_信号 / 外设）。
 * 多词是 AND 语义（与型号搜索同一套 splitTerms，所以 "can1 tx" 也能搜到 CAN1_TX）。
 */

export interface PinSearchHit {
  pin: Pin
  score: number
}

const WEIGHT = {
  positionExact: 100,
  primaryExact: 90,
  position: 70,
  primary: 60,
  alias: 40,
  signal: 25,
  peripheralSignal: 20,
  peripheral: 15,
} as const

const lower = (text: unknown) => String(text ?? '').toLowerCase()

/** 引脚参与搜索的字段（每条自带权重） */
function fieldScores(pin: Pin): Array<{ value: string, weight: number }> {
  const fields: Array<{ value: string, weight: number }> = [
    { value: lower(pin.position), weight: WEIGHT.position },
    { value: lower(pinPrimary(pin)), weight: WEIGHT.primary },
  ]
  for (const alias of pinAliases(pin)) {
    fields.push({ value: lower(alias), weight: WEIGHT.alias })
  }
  for (const fn of pin.functions) {
    if (fn.signal) {
      fields.push({ value: lower(fn.signal), weight: WEIGHT.signal })
    }
    if (fn.peripheral && fn.signal) {
      fields.push({ value: lower(`${fn.peripheral}_${fn.signal}`), weight: WEIGHT.peripheralSignal })
    }
    if (fn.peripheral) {
      fields.push({ value: lower(fn.peripheral), weight: WEIGHT.peripheral })
    }
  }
  return fields
}

/** 全部词都命中才计分（AND）；返回命中的最低权重那档作为分数，保证"引脚号命中"排在"功能命中"前面 */
function scorePin(pin: Pin, terms: string[]): number {
  const fields = fieldScores(pin)
  const position = lower(pin.position)
  const primary = lower(pinPrimary(pin))
  let total = 0
  for (const term of terms) {
    let best = 0
    for (const field of fields) {
      if (field.value.includes(term)) {
        best = Math.max(best, field.weight)
      }
    }
    // 整串相等给更高的档
    if (position === term) {
      best = Math.max(best, WEIGHT.positionExact)
    }
    if (primary === term) {
      best = Math.max(best, WEIGHT.primaryExact)
    }
    if (!best) {
      return 0
    }
    total += best
  }
  return total
}

/** 位置比较：纯数字按数值，网格坐标（A1/B7）按字典序，保证 ↑↓ 顺序稳定可预期 */
export function comparePosition(a: string, b: string): number {
  const na = Number(a)
  const nb = Number(b)
  if (Number.isFinite(na) && Number.isFinite(nb)) {
    return na - nb
  }
  return a.localeCompare(b, undefined, { numeric: true })
}

/** 空 query 返回空数组（"没在搜"和"搜到 0 个"是两件事，调用方按 query 判空） */
export function searchPins(pins: Pin[], query: string): PinSearchHit[] {
  const terms = splitTerms(query)
  if (!terms.length) {
    return []
  }
  const hits: PinSearchHit[] = []
  for (const pin of pins) {
    const score = scorePin(pin, terms)
    if (score > 0) {
      hits.push({ pin, score })
    }
  }
  return hits.sort((a, b) => b.score - a.score || comparePosition(a.pin.position, b.pin.position))
}
