/** PinAtlas 统一数据契约的类型定义（对应 pinatlas-data 的 docs/unified-schema.md v1.1.0）。 */

export type PinType = 'gpio' | 'power' | 'ground' | 'reset' | 'boot' | 'clock' | 'mono' | 'nc' | 'other'
export type PackageKind = 'quad' | 'dual' | 'grid' | 'unknown'
/** 功能大类（分组用；原始 peripheral 名始终保留） */
export type FunctionType = 'adc' | 'timer' | 'spi' | 'i2c' | 'uart' | 'can' | 'usb' | 'exti' | 'system' | 'other'

export interface PinFunction {
  peripheral: string
  signal: string
  /** null = 上游没有 AF 号（不是 0！） */
  af: number | null
  /** 功能大类（v1.1.0 起；旧数据可能没有） */
  type?: FunctionType
  /** RCC_* / SYS_* 这类系统信号，不是可配置外设 */
  system?: boolean
}

export interface PinVariant {
  name: string
  /** 主名（v1.1.0 起，旧数据可能没有，用 pinPrimary() 兜底） */
  primary?: string
  aliases?: string[]
  type: PinType
  functions: PinFunction[]
}

export interface Pin {
  /** 物理位置：线性引脚号（"1"）或网格坐标（"A1"）。同文件内唯一 */
  position: string
  /** 焊盘名（= primary，保留兼容旧前端） */
  pad: string
  /** 主显示名（v1.1.0 起，旧数据没有，用 pinPrimary() 从 name 兜底拆分） */
  primary?: string
  /** 从名字里拆出来的别名，如 PC13-TAMPER-RTC → ["TAMPER","RTC"] */
  aliases?: string[]
  /** 重映射标注指向的另一个 pad，如 "PA11 [PA9]" → "PA9" */
  variantOf?: string
  /** 上游原始引脚名，保留可追溯 */
  name: string
  type: PinType
  rawType?: string
  /** 晶振/时钟相关（v1.1.0 起这类脚 type 直接是 clock） */
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
