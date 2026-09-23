/**
 * 数据源（CDN 镜像）清单：页头右上角的下拉就是这份列表。
 *
 * 为什么做成可切换：同一份数据在不同运营商/地区走哪个 jsDelivr 镜像快慢差很多（本机实测同一个
 * index.json：jsdelivr.b-cdn.net 0.6s / fastly 0.9s / testingcf 1.3s / gcore 1.3s / cdn 2.4s），
 * 与其赌一个默认值，不如让用户自己切；切换后立刻按新 host 重新拉清单与当前型号。
 *
 * 只列 jsDelivr 镜像，不放「同源快照」：部署产物不带 public/data，那一项在线上永远是灰的。
 * 本地离线模式（NUXT_PUBLIC_DATA_LOCAL=true，数据根是 /data）仍然是**构建期默认值**，
 * 不出现在下拉里；一旦选了某个镜像就走镜像，刷新页面回到构建期默认。
 *
 * 注意：写进 localStorage 的只有 host，路径前缀（/gh/<repo>@<tag>/data）在 nuxt.config 里拼好，
 * 换数据 tag 不会让这里的缓存失效。
 */

export interface DataSource {
  /** 真实 host，也是 localStorage 里存的值 */
  value: string
  label: string
  hint: string
}

export const DATA_SOURCES: DataSource[] = [
  { value: 'fastly.jsdelivr.net', label: 'Fastly', hint: 'jsDelivr 的 Fastly 节点（默认）' },
  { value: 'jsdelivr.b-cdn.net', label: 'BlockCDN', hint: 'jsDelivr 的 BlockCDN 节点' },
  { value: 'testingcf.jsdelivr.net', label: 'Cloudflare 测试节点', hint: 'jsDelivr 的 Cloudflare 测试节点' },
  { value: 'gcore.jsdelivr.net', label: 'Gcore', hint: 'jsDelivr 的 Gcore 节点' },
  { value: 'cdn.jsdelivr.net', label: 'jsDelivr 主站', hint: 'jsDelivr 主站（国内通常最慢）' },
]

/** localStorage 键：只存 host，不存完整 URL */
export const DATA_HOST_STORAGE_KEY = 'pinatlas:data-host'

/** 拼数据根地址：host 为空走兜底根（同源快照 / 本地离线模式），否则 <host><path> */
export function buildDataBase(host: string, path: string, fallback: string): string {
  if (!host) {
    return fallback
  }
  return `https://${host}${path}`.replace(/\/+$/, '')
}

/** 从地址反推 host（相对路径 /data 这类也要能显示，不该抛错） */
export function hostOf(base: string): string {
  try {
    return new URL(base, 'http://localhost').host
  }
  catch {
    return base
  }
}

/** 当前值的展示名（未知 host 直接显示 host 本身，别让页头空着） */
export function sourceLabel(value: string): string {
  return DATA_SOURCES.find(source => source.value === value)?.label ?? value
}
