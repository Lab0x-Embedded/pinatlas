/**
 * 左栏的厂商分组（docs/02 §6 多厂商）。
 *
 * 厂商不靠数据侧加字段：分片路径本来就带厂商段（index/st/STM32C0.json），
 * 从路径推出来即可，旧清单/单厂商清单都不用改。清单顶层的 `vendor` 只在路径
 * 推不出来时作兜底（它是单值，多厂商数据里不可信）。
 */

/** 分片路径里的厂商段：`index/st/STM32C0.json` → `st`；不是这个布局返回 null */
export function vendorOfShardPath(path: string): string | null {
  return path.match(/^index\/([^/]+)\//)?.[1] ?? null
}

/**
 * 厂商展示名：清单分节的 `vendorName`（数据仓库 config 维护）优先，没收录的厂商码
 * 大写显示。新厂商数据先到、名字还没配时也不至于出现一排裸 "gd"。
 */
export function vendorLabel(vendor: string, label: string | null | undefined): string {
  return label || vendor.toUpperCase()
}

/**
 * 把系列组按厂商聚合。组间按型号总数降序（最大的厂商排最前，多厂商时
 * 常用的那家不至于被字母序压到底），同数按厂商码稳定排序；组内保持传入顺序。
 */
export function groupByVendor<Family extends { vendor: string, count: number }>(
  families: Family[],
): Array<{ vendor: string, families: Family[], familyCount: number, count: number }> {
  const groups = new Map<string, Family[]>()
  for (const family of families) {
    const bucket = groups.get(family.vendor) ?? []
    bucket.push(family)
    groups.set(family.vendor, bucket)
  }
  return [...groups.entries()]
    .map(([vendor, list]) => ({
      vendor,
      families: list,
      familyCount: list.length,
      count: list.reduce((sum, family) => sum + family.count, 0),
    }))
    .sort((a, b) => b.count - a.count || a.vendor.localeCompare(b.vendor))
}
