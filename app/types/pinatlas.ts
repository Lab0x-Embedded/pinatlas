/** PinAtlas 统一数据契约的类型定义（对应 pinatlas-data 的 docs/unified-schema.md）。 */

export type PinType = 'io' | 'power' | 'ground' | 'reset' | 'boot' | 'mono' | 'nc' | 'other'
export type PackageKind = 'quad' | 'dual' | 'grid' | 'unknown'

export interface PinFunction {
  peripheral: string
  signal: string
  /** null = 上游没有 AF 号（不是 0！） */
  af: number | null
  /** RCC_* / SYS_* 这类系统信号，不是可配置外设 */
  system?: boolean
}

export interface PinVariant {
  name: string
  type: PinType
  functions: PinFunction[]
}

export interface Pin {
  /** 线性引脚号（"1"）或网格坐标（"A1"） */
  position: string
  /** 去掉重映射注解的焊盘名，如 "PA11 [PA9]" → "PA11" */
  pad: string
  name: string
  type: PinType
  rawType?: string
  /** 晶振/时钟相关（不臆造 clock 类型） */
  osc?: boolean
  functions: PinFunction[]
  variants?: Record<string, PinVariant>
}

export interface ChipPart {
  mpn: string
  status: string | null
  temperature: [number, number] | null
}

export interface ChipDoc {
  schemaVersion: string
  vendor: string
  chip: string
  displayName: string
  family: string | null
  line: string | null
  die: string | null
  package: string
  packageKind: PackageKind
  pinCount: number
  memory: {
    flashKb: number | null
    ramKb: number | null
    ioCount: number | null
    voltage?: { min: number, max: number } | null
    temperature?: { min: number, max: number } | null
  }
  parts: ChipPart[]
  source: {
    primary?: { repo: string, ref: string, path: string | null, license?: string }
    enrichment?: { repo: string, ref: string | null, used: string[] }
  }
  pins: Pin[]
}

/** 索引项（data/index/{family}.json → chips[]） */
export interface ChipIndexEntry {
  chip: string
  displayName: string
  line: string | null
  die: string | null
  package: string | null
  packageKind: PackageKind | null
  pinCount: number | null
  flashKb: number | null
  part: string
}

export interface FamilyShard {
  schemaVersion: string
  family: string
  count: number
  generatedAt?: string
  chips: ChipIndexEntry[]
}

export interface DatasetManifest {
  schemaVersion: string
  generatedAt?: string
  vendor: string
  upstream?: Record<string, unknown>
  totals?: { chips: number, pins: number, afSlots: number, afCoverage: number }
  shards: { family: string, count: number, path: string }[]
}
