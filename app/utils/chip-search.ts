import type { ChipIndexEntry } from '~/types/pinatlas'

/**
 * 型号搜索内核（纯函数，可单测）：多词 AND + 相关度排序 + 高亮区间。
 *
 * 改造前的实现是把整串 query 当一个子串去 `includes`，两个实测硬伤：
 *   1. 按占位符的写法敲空格必然 0 命中：`"f407 lqfp100"` 0、`"stm32 f407"` 0、`"f103 lqfp48"` 0
 *      （数据是 chip/displayName/line/package 各含完整型号与封装名，跨字段的子串当然不存在）；
 *   2. 抄芯片丝印搜不到：`"C8T6"` 0 命中。索引主名是带通配后缀的 ref（`STM32F103C8Tx`），
 *      订货号在 `mpns[]` 里（数据 v1.3.0 起）。
 *
 * 字段权重按"用户先打什么"定：型号 > 订货号 > 展示名 > 子系列 > 封装。别随手调数字，
 * 单测里钉住了排序结果。
 */

export interface ChipSearchMatch {
  entry: ChipIndexEntry
  score: number
  /** 命中的订货号（用于列表副标题提示）：未命中 mpns 时为 null */
  matchedMpn: string | null
  /** chip 主名里要高亮的区间（原串下标，已排序合并） */
  chipSpans: Array<[number, number]>
}

/** 命中字段的权重 */
const WEIGHT = {
  chip: 100,
  mpn: 60,
  displayName: 40,
  line: 20,
  package: 15,
} as const

/** 搜索结果每组默认渲染条数上限（查 "stm32" 命中 2781 条，全渲染会塞几千行按钮） */
export const SEARCH_GROUP_LIMIT = 30

/**
 * 默认最多渲染多少个 line 分组。
 * 实测 "stm32" 命中 2312 条、分布在 60 多个子系列下，只按每组 30 条截断仍会渲染 1756 行；
 * 再加一道分组上限后初始 DOM 控制在 300 行内（相关度高的系列排在前，目标基本都在里面）。
 */
export const SEARCH_GROUP_PREVIEW = 10

const lower = (text: unknown) => String(text ?? '').toLowerCase()

/** 拆词：空白分隔（连续空白当一个），去空项 */
export function splitTerms(query: string): string[] {
  return lower(query).split(/\s+/).filter(Boolean)
}

/** 单个字段的两种干草堆：原样 + 去掉空格（"STM32 F407" 这类带空格的输入也能命中） */
function haystack(value: unknown): [string, string] {
  const text = lower(value)
  return [text, text.replace(/\s+/g, '')]
}

interface FieldHit {
  weight: number
  value: string
}

/** 所有可比字段（chip 与 mpns 各算一个字段，取最高分那条） */
function fields(entry: ChipIndexEntry): FieldHit[] {
  const out: FieldHit[] = [{ weight: WEIGHT.chip, value: lower(entry.chip) }]
  for (const mpn of entry.mpns ?? []) {
    out.push({ weight: WEIGHT.mpn, value: lower(mpn) })
  }
  out.push({ weight: WEIGHT.displayName, value: lower(entry.displayName) })
  out.push({ weight: WEIGHT.line, value: lower(entry.line) })
  out.push({ weight: WEIGHT.package, value: lower(entry.package) })
  return out
}

/** 一个词在某字段上命中就记分；返回命中的最高权重（未命中返回 0） */
function scoreTerm(term: string, list: FieldHit[]): number {
  let best = 0
  for (const field of list) {
    const [plain, compact] = haystack(field.value)
    if (plain.includes(term) || (term.length > 1 && compact.includes(term.replace(/\s+/g, '')))) {
      best = Math.max(best, field.weight)
    }
  }
  return best
}

/** 词是否命中「非订货号」字段（chip/displayName/line/package） */
function matchedOutsideMpn(term: string, list: FieldHit[]): boolean {
  for (const field of list) {
    if (field.weight === WEIGHT.mpn) {
      continue
    }
    const [plain, compact] = haystack(field.value)
    if (plain.includes(term) || (term.length > 1 && compact.includes(term.replace(/\s+/g, '')))) {
      return true
    }
  }
  return false
}

/** 命中的最高权重字段是不是 mpns（副标题要提示"你搜的是订货号"） */
function matchedMpnOf(term: string, entry: ChipIndexEntry): string | null {
  for (const mpn of entry.mpns ?? []) {
    if (lower(mpn).includes(term)) {
      return mpn
    }
  }
  return null
}

/** 原串里所有直接命中的区间（排序 + 合并重叠）；不做"去空格后命中"的反向映射，代价不值 */
export function findSpans(text: string, terms: string[]): Array<[number, number]> {
  const src = lower(text)
  const spans: Array<[number, number]> = []
  for (const term of terms) {
    if (!term) {
      continue
    }
    let from = 0
    while (from <= src.length - term.length) {
      const at = src.indexOf(term, from)
      if (at < 0) {
        break
      }
      spans.push([at, at + term.length])
      from = at + term.length
    }
  }
  spans.sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  for (const span of spans) {
    const last = merged.at(-1)
    if (last && span[0] <= last[1]) {
      last[1] = Math.max(last[1], span[1])
    }
    else {
      merged.push([...span])
    }
  }
  return merged
}

/** 把文本按命中区间切成 [未命中, 命中, …] 片段，供模板 <mark> 渲染 */
export function highlightParts(text: string, spans: Array<[number, number]>) {
  const parts: Array<{ text: string, hit: boolean }> = []
  let cursor = 0
  for (const [start, end] of spans) {
    if (start > cursor) {
      parts.push({ text: text.slice(cursor, start), hit: false })
    }
    parts.push({ text: text.slice(start, end), hit: true })
    cursor = end
  }
  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor), hit: false })
  }
  return parts.length ? parts : [{ text, hit: false }]
}

/** 单个型号对一组词的得分（未全命中返回 0：多词是 AND 语义） */
export function scoreEntry(entry: ChipIndexEntry, terms: string[]): ChipSearchMatch | null {
  if (!terms.length) {
    return { entry, score: 0, matchedMpn: null, chipSpans: [] }
  }
  const list = fields(entry)
  let score = 0
  let matchedMpn: string | null = null
  for (const term of terms) {
    const best = scoreTerm(term, list)
    if (!best) {
      return null
    }
    score += best
    // 只有当这个词在型号/展示名/子系列/封装里都找不到时，才把命中的订货号当副标题提示
    // （"C8T6" 必须提示 STM32F103C8T6；而搜 "f103 lqfp48" 时副标题不该再塞一串订货号）
    if (!matchedOutsideMpn(term, list)) {
      matchedMpn ??= matchedMpnOf(term, entry)
    }
  }

  // 排序加成：整串等于 chip > chip 以 query 开头 > chip 含 query
  const chip = lower(entry.chip)
  const whole = terms.join('')
  if (chip === whole) {
    score += 400
  }
  else if (chip.startsWith(whole)) {
    score += 120
  }
  else if (chip.includes(whole)) {
    score += 30 * terms.length
  }
  return { entry, score, matchedMpn, chipSpans: findSpans(entry.chip, terms) }
}

/** 搜索入口：空 query 返回原列表（不加分、不改序） */
export function searchChips(entries: ChipIndexEntry[], query: string): ChipSearchMatch[] {
  const terms = splitTerms(query)
  if (!terms.length) {
    return entries.map(entry => ({ entry, score: 0, matchedMpn: null, chipSpans: [] }))
  }
  const matches: ChipSearchMatch[] = []
  for (const entry of entries) {
    const match = scoreEntry(entry, terms)
    if (match) {
      matches.push(match)
    }
  }
  return matches.sort((a, b) =>
    b.score - a.score
    || String(a.entry.line).localeCompare(String(b.entry.line), undefined, { numeric: true })
    || String(a.entry.chip).localeCompare(String(b.entry.chip)))
}
