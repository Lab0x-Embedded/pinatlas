import type { ChipIndexEntry } from '~/types/pinatlas'
import { describe, expect, it } from 'vitest'
import { findSpans, highlightParts, scoreEntry, searchChips, splitTerms } from '~/utils/chip-search'

/**
 * 搜索内核回归测试。用例全部来自真实索引（pinatlas-data 的 index/st/*.json）与实测缺口：
 *   改造前 "f407 lqfp100" / "stm32 f407" / "f103 lqfp48" 都是 0 命中（整串当一个子串），
 *   "c8t6" 也是 0（订货号不在索引里，v1.3.0 才有 mpns[]）。
 */
function entry(partial: Partial<ChipIndexEntry> & { chip: string }): ChipIndexEntry {
  return {
    displayName: partial.chip,
    line: partial.chip.replace(/^STM32(\w{3}).*$/, 'STM32$1'),
    die: null,
    package: null,
    packageKind: null,
    pinCount: null,
    flashKb: null,
    part: `st/x/${partial.chip}.json`,
    ...partial,
  }
}

const F103C8 = entry({
  chip: 'STM32F103C8Tx',
  displayName: 'STM32F103C(8-B)Tx',
  line: 'STM32F103',
  package: 'LQFP48',
  pinCount: 48,
  flashKb: 64,
  mpns: ['STM32F103C8T6', 'STM32F103C8T6TR'],
})
const F407VG = entry({ chip: 'STM32F407VGTx', displayName: 'STM32F407V(E-G)Tx', line: 'STM32F407', package: 'LQFP100', pinCount: 100, flashKb: 512, mpns: ['STM32F407VGT6'] })
const F407VG_ALT = entry({ chip: 'STM32F407VETx', line: 'STM32F407', package: 'LQFP100', pinCount: 100, flashKb: 512 })
const F407ZG = entry({ chip: 'STM32F407ZGTx', line: 'STM32F407', package: 'LQFP144', pinCount: 144, flashKb: 1024, mpns: ['STM32F407ZGT6'] })
const G031K8 = entry({ chip: 'STM32G031K8Tx', line: 'STM32G031', package: 'LQFP32', pinCount: 32, flashKb: 64 })

const INDEX = [F103C8, F407VG, F407VG_ALT, F407ZG, G031K8]

describe('splitTerms：空白切词', () => {
  it('多个空格/前后空格都归一', () => {
    expect(splitTerms('  F103   LQFP48 ')).toEqual(['f103', 'lqfp48'])
    expect(splitTerms('')).toEqual([])
  })
})

describe('searchChips：多词是 AND 语义（改造前整串子串匹配必然 0 命中）', () => {
  it('跨字段的多词查询能命中', () => {
    // 型号片段 + 封装：改造前 0 命中（同分时按主名字典序，顺序稳定可断言）
    expect(searchChips(INDEX, 'f407 lqfp100').map(m => m.entry.chip))
      .toEqual(['STM32F407VETx', 'STM32F407VGTx'])
    // 系列片段 + 封装
    expect(searchChips(INDEX, 'f103 lqfp48').map(m => m.entry.chip)).toEqual(['STM32F103C8Tx'])
  })

  it('带空格的型号写法（"STM32 F407"）也能命中', () => {
    expect(searchChips(INDEX, 'stm32 f407').map(m => m.entry.chip))
      .toEqual(['STM32F407VETx', 'STM32F407VGTx', 'STM32F407ZGTx'])
  })

  it('任一词不命中就整体不命中', () => {
    expect(searchChips(INDEX, 'f407 lqfp48')).toEqual([])
  })
})

describe('searchChips：订货号（mpns[]）', () => {
  it('抄丝印的订货号能搜到（改造前 0 命中）', () => {
    const hits = searchChips(INDEX, 'c8t6')
    expect(hits.map(m => m.entry.chip)).toEqual(['STM32F103C8Tx'])
    expect(hits[0].matchedMpn).toBe('STM32F103C8T6')
  })

  it('完整订货号（STM32F407VGT6）命中对应型号并按订货号定位', () => {
    const hits = searchChips(INDEX, 'STM32F407VGT6')
    expect(hits.map(m => m.entry.chip)).toEqual(['STM32F407VGTx'])
    expect(hits[0].matchedMpn).toBe('STM32F407VGT6')
    // 型号名里没有 "VGT6"（ref 是 VGTx）→ 无可高亮区间，但仍要显示命中的订货号
    expect(hits[0].chipSpans).toEqual([])
  })

  it('老数据（没有 mpns）不会报错', () => {
    const legacy = entry({ chip: 'STM32F103C8Tx', line: 'STM32F103', package: 'LQFP48' })
    expect(searchChips([legacy], 'f103 lqfp48')).toHaveLength(1)
    expect(searchChips([legacy], 'c8t6')).toEqual([])
  })

  it('型号/封装已经命中时不再塞订货号提示（副标题只留必要信息）', () => {
    const hits = searchChips(INDEX, 'f103 lqfp48')
    expect(hits[0].matchedMpn).toBeNull()
    // 只有靠订货号才命中的词才提示
    expect(searchChips(INDEX, 'c8t6')[0].matchedMpn).toBe('STM32F103C8T6')
  })
})

describe('searchChips：相关度排序', () => {
  it('整串等于型号 id 的排最前，前缀次之', () => {
    const hits = searchChips(INDEX, 'STM32F407VGTx')
    expect(hits[0].entry.chip).toBe('STM32F407VGTx')
    expect(hits[0].score).toBeGreaterThan(searchChips(INDEX, 'f407')[0].score)
  })

  it('同分时按子系列、主名稳定排序（键盘导航依赖这个顺序）', () => {
    const hits = searchChips(INDEX, 'lqfp100')
    expect(hits.map(m => m.entry.chip)).toEqual(['STM32F407VETx', 'STM32F407VGTx'])
  })

  it('空 query 返回原列表且不加分、不改序', () => {
    const hits = searchChips(INDEX, '   ')
    expect(hits.map(m => m.entry.chip)).toEqual(INDEX.map(e => e.chip))
    expect(hits.every(m => m.score === 0)).toBe(true)
  })
})

describe('高亮区间', () => {
  it('findSpans 找全部出现位置，相邻/重叠的合并成一个区间', () => {
    expect(findSpans('STM32F103C8Tx', ['f103'])).toEqual([[5, 9]])
    // 相邻（0-3 与 3-6）会被合并，视觉上等价
    expect(findSpans('abcabc', ['abc'])).toEqual([[0, 6]])
    // 不连续的两段保持分开
    expect(findSpans('abXab', ['ab'])).toEqual([[0, 2], [3, 5]])
  })

  it('scoreEntry 给出的 chipSpans 能把命中片段切出来', () => {
    const match = scoreEntry(F407VG, ['f407'])!
    const parts = highlightParts(F407VG.chip, match.chipSpans)
    expect(parts.filter(p => p.hit).map(p => p.text)).toEqual(['F407'])
    expect(parts.map(p => p.text).join('')).toBe(F407VG.chip)
  })

  it('没有命中区间时原样返回一段', () => {
    expect(highlightParts('STM32F103C8Tx', [])).toEqual([{ text: 'STM32F103C8Tx', hit: false }])
  })
})
