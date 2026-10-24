import { describe, expect, it } from 'vitest'
import { groupByVendor, vendorLabel, vendorOfShardPath } from '~/utils/vendor-groups'

describe('vendorLabel', () => {
  it('清单分节的 vendorName 优先（数据仓库 config 维护，新厂商不用改前端）', () => {
    expect(vendorLabel('st', 'STMicroelectronics')).toBe('STMicroelectronics')
    expect(vendorLabel('espressif', 'Espressif Systems')).toBe('Espressif Systems')
  })

  it('没收录的厂商码大写显示，不出现裸小写码', () => {
    expect(vendorLabel('gd', null)).toBe('GD')
    expect(vendorLabel('gd', undefined)).toBe('GD')
  })

  it('旧清单/名字未配（null 或空串）时走兜底', () => {
    expect(vendorLabel('st', undefined)).toBe('ST')
    expect(vendorLabel('st', null)).toBe('ST')
    expect(vendorLabel('st', '')).toBe('ST')
  })
})

describe('vendorOfShardPath', () => {
  it('取 index/<vendor>/ 段作为厂商码', () => {
    expect(vendorOfShardPath('index/st/STM32C0.json')).toBe('st')
    expect(vendorOfShardPath('index/espressif/ESP32-C3.json')).toBe('espressif')
    // 厂商码里允许连字符这类目录名字符
    expect(vendorOfShardPath('index/my-vendor/F1.json')).toBe('my-vendor')
  })

  it('系列名带特殊字符也不影响（index/ 后的第一段才是厂商）', () => {
    expect(vendorOfShardPath('index/st/STM32L4+.json')).toBe('st')
  })

  it('不符合布局的路径返回 null（交给清单 vendor 兜底）', () => {
    expect(vendorOfShardPath('st/STM32C0.json')).toBeNull()
    expect(vendorOfShardPath('STM32C0.json')).toBeNull()
    expect(vendorOfShardPath('')).toBeNull()
  })
})

describe('groupByVendor', () => {
  it('按 vendor 聚合，组内保持传入顺序', () => {
    const groups = groupByVendor([
      { family: 'STM32F1', vendor: 'st', count: 125 },
      { family: 'ESP32-C3', vendor: 'espressif', count: 14 },
      { family: 'STM32F4', vendor: 'st', count: 211 },
    ])
    expect(groups.map(g => g.vendor)).toEqual(['st', 'espressif'])
    expect(groups[0].families.map(f => f.family)).toEqual(['STM32F1', 'STM32F4'])
    expect(groups[0].familyCount).toBe(2)
    expect(groups[0].count).toBe(336)
    expect(groups[1].familyCount).toBe(1)
    expect(groups[1].count).toBe(14)
  })

  it('组间按型号总数降序，同数按厂商码排序（大厂排前，顺序稳定）', () => {
    const vendors = [
      { family: 'A1', vendor: 'zz', count: 10 },
      { family: 'B1', vendor: 'aa', count: 50 },
      { family: 'C1', vendor: 'mm', count: 50 },
      { family: 'D1', vendor: 'aa', count: 20 },
    ]
    expect(groupByVendor(vendors).map(g => [g.vendor, g.count])).toEqual([
      ['aa', 70],
      ['mm', 50],
      ['zz', 10],
    ])
  })

  it('单厂商也成一个组（侧栏据此决定不渲染厂商层）', () => {
    const groups = groupByVendor([
      { family: 'STM32F1', vendor: 'st', count: 125 },
      { family: 'STM32F4', vendor: 'st', count: 211 },
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].vendor).toBe('st')
    expect(groups[0].familyCount).toBe(2)
  })

  it('空清单返回空数组', () => {
    expect(groupByVendor([])).toEqual([])
  })
})
