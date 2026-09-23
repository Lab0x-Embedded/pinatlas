import { describe, expect, it } from 'vitest'
import { buildDataBase, DATA_SOURCES, hostOf, sourceLabel } from '~/constants/data-sources'

const PATH = '/gh/Lab0x-Embedded/pinatlas-data@data-2026.09.23.3/data'

describe('数据源切换：URL 拼接', () => {
  it('选了 host 就拼成 https://<host><path>', () => {
    expect(buildDataBase('fastly.jsdelivr.net', PATH, '/data'))
      .toBe(`https://fastly.jsdelivr.net${PATH}`)
  })

  it('host 为空（同源快照）时用兜底根 /data', () => {
    expect(buildDataBase('', PATH, '/data')).toBe('/data')
  })

  it('不会留下重复的斜杠', () => {
    expect(buildDataBase('gcore.jsdelivr.net', `${PATH}/`, '/data'))
      .toBe(`https://gcore.jsdelivr.net${PATH}`)
  })

  it('只换 host 后缀就够：换数据 tag 不会让已存的 host 失效', () => {
    const base = buildDataBase('testingcf.jsdelivr.net', PATH, '/data')
    expect(base.startsWith('https://testingcf.jsdelivr.net/gh/')).toBe(true)
    expect(base.endsWith('/data')).toBe(true)
  })
})

describe('数据源切换：host 解析与展示名', () => {
  it('从数据根反推 host', () => {
    expect(hostOf(`https://fastly.jsdelivr.net${PATH}`)).toBe('fastly.jsdelivr.net')
    // 本地离线模式的相对根 /data 不该抛错
    expect(hostOf('/data')).toBe('localhost')
  })

  it('每个可选项都有中文名；未知 host 显示 host 本身', () => {
    for (const source of DATA_SOURCES) {
      expect(sourceLabel(source.value)).toBe(source.label)
      expect(source.label.length).toBeGreaterThan(0)
    }
    expect(sourceLabel('whatever.example.com')).toBe('whatever.example.com')
  })

  it('清单里只有 jsDelivr 镜像（线上部署不带 public/data，同源快照不该出现在下拉里）', () => {
    expect(DATA_SOURCES.length).toBe(5)
    for (const source of DATA_SOURCES) {
      expect(source.value).toMatch(/^[a-z0-9.-]+\.(jsdelivr\.net|b-cdn\.net)$/)
      expect(source.hint.length).toBeGreaterThan(0)
    }
  })
})
