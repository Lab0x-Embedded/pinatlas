import type { ChipDoc, ChipIndexEntry, DatasetManifest, FamilyShard, Pin } from '~/types/pinatlas'
import { fetchJson } from '~/utils/http'
import { normalizePins } from '~/utils/pin-types'

/**
 * 数据集与当前选中状态。
 *
 * 加载策略（按需，不一次拉全量，见 docs/02-data-contract.md §5）：
 *   1. 首屏只拉 `index.json` 清单（约 9 KB）；
 *   2. 再拉**当前型号所在系列**的分片（其余 26 个系列不动）；
 *   3. 用户展开某个系列 → 拉该系列分片；
 *   4. 用户开始搜索 → 后台补齐剩余分片，结果随到随显示（`loadingAll` 驱动提示）。
 * 芯片数据永远按需：点哪个型号才拉那一个文件，并按 chip id 缓存。
 */
export const useChipsStore = defineStore('chips', () => {
  const runtimeConfig = useRuntimeConfig()
  const dataBase = computed(() => String(runtimeConfig.public.dataBase || '').replace(/\/+$/, ''))
  const dataTag = computed(() => String(runtimeConfig.public.dataTag || ''))

  const manifest = ref<DatasetManifest | null>(null)
  const shards = ref<Record<string, ChipIndexEntry[]>>({})
  const loadingFamilies = ref<Set<string>>(new Set())
  const loadingAll = ref(false)
  const indexError = ref<string | null>(null)

  const chip = ref<ChipDoc | null>(null)
  const chipError = ref<string | null>(null)
  const loadingChip = ref(false)

  const query = ref('')
  const currentChipId = ref<string | null>(null)
  const selectedPosition = ref<string | null>(null)
  const variantKey = ref<string | null>(null)

  const chipCache = new Map<string, ChipDoc>()
  const shardPromises = new Map<string, Promise<void>>()

  /** 已加载的系列（含芯片数据） */
  const loadedChips = computed(() => Object.values(shards.value).flat())
  const loadedFamilies = computed(() => Object.keys(shards.value))
  const families = computed(() => manifest.value?.shards ?? [])
  const allLoaded = computed(() =>
    families.value.length > 0 && loadedFamilies.value.length >= families.value.length)
  const totalChips = computed(() =>
    manifest.value?.totals?.chips ?? manifest.value?.shards.reduce((sum, s) => sum + s.count, 0) ?? 0)

  /** 左栏：系列 → 型号（未加载的系列只显示计数） */
  const familyGroups = computed(() => families.value.map(shard => ({
    family: shard.family,
    count: shard.count,
    loaded: Boolean(shards.value[shard.family]),
    loading: loadingFamilies.value.has(shard.family),
    chips: shards.value[shard.family] ?? [],
  })))

  const filteredChips = computed(() => {
    const q = query.value.trim().toLowerCase()
    const list = loadedChips.value
    if (!q) {
      return list
    }
    return list.filter(entry =>
      entry.chip.toLowerCase().includes(q)
      || entry.displayName.toLowerCase().includes(q)
      || (entry.line ?? '').toLowerCase().includes(q)
      || (entry.package ?? '').toLowerCase().includes(q),
    )
  })

  /** 搜索结果的 line 分组 */
  const groupedChips = computed(() => {
    const groups = new Map<string, ChipIndexEntry[]>()
    for (const entry of filteredChips.value) {
      const key = entry.line || '未分组'
      const bucket = groups.get(key) ?? []
      bucket.push(entry)
      groups.set(key, bucket)
    }
    return [...groups.entries()]
      .map(([line, chips]) => ({
        line,
        chips: [...chips].sort((a, b) =>
          a.package === b.package
            ? (a.flashKb ?? 0) - (b.flashKb ?? 0)
            : String(a.package).localeCompare(String(b.package))),
      }))
      .sort((a, b) => a.line.localeCompare(b.line, undefined, { numeric: true }))
  })

  /** 同一 die 的其它封装 → 封装切换（docs/05 §1） */
  const sameDieChips = computed(() => {
    const die = chip.value?.die
    if (!die) {
      return []
    }
    return loadedChips.value
      .filter(entry => entry.die === die && entry.chip !== chip.value?.chip)
      .sort((a, b) => String(a.package).localeCompare(String(b.package)))
  })

  /** 当前生效的引脚定义：基础态 + 变体覆盖（变体下为 NC 的引脚要跟着变） */
  const effectivePins = computed<Pin[]>(() => {
    const doc = chip.value
    if (!doc) {
      return []
    }
    const key = variantKey.value
    if (!key) {
      return doc.pins
    }
    return doc.pins.map((pin) => {
      const variant = pin.variants?.[key]
      if (!variant) {
        return pin
      }
      return { ...pin, name: variant.name, type: variant.type, functions: variant.functions, variants: pin.variants }
    })
  })

  const selectedPin = computed<Pin | null>(() => {
    if (!selectedPosition.value) {
      return null
    }
    return effectivePins.value.find(pin => pin.position === selectedPosition.value) ?? null
  })

  const variantsAvailable = computed(() => {
    const keys = new Set<string>()
    for (const pin of chip.value?.pins ?? []) {
      for (const key of Object.keys(pin.variants ?? {})) {
        keys.add(key)
      }
    }
    return [...keys].sort()
  })

  const hasAfData = computed(() => {
    for (const pin of chip.value?.pins ?? []) {
      for (const fn of pin.functions) {
        if (typeof fn.af === 'number') {
          return true
        }
      }
    }
    return false
  })

  /** 从型号名推系列（清单里的系列名是型号前缀：STM32F103C8Tx → STM32F1、STM32MP151AACx → STM32MP1） */
  function familyForChip(chipId: string): string | null {
    const candidates = families.value
      .map(s => s.family)
      .filter(family => chipId.startsWith(family))
      .sort((a, b) => b.length - a.length)
    return candidates[0] ?? null
  }

  async function loadManifest(force = false) {
    if (manifest.value && !force) {
      return
    }
    indexError.value = null
    try {
      manifest.value = await fetchJson<DatasetManifest>(`${dataBase.value}/index.json`)
    }
    catch (error) {
      indexError.value = (error as Error).message
      manifest.value = null
    }
  }

  async function ensureShard(family: string) {
    if (shards.value[family]) {
      return
    }
    const inflight = shardPromises.get(family)
    if (inflight) {
      return inflight
    }
    const shardMeta = families.value.find(s => s.family === family)
    if (!shardMeta) {
      return
    }
    const next = new Set(loadingFamilies.value)
    next.add(family)
    loadingFamilies.value = next

    const task = (async () => {
      try {
        const shard = await fetchJson<FamilyShard>(`${dataBase.value}/${shardMeta.path}`)
        shards.value = { ...shards.value, [family]: shard.chips }
      }
      catch (error) {
        indexError.value = (error as Error).message
      }
      finally {
        const done = new Set(loadingFamilies.value)
        done.delete(family)
        loadingFamilies.value = done
        shardPromises.delete(family)
      }
    })()
    shardPromises.set(family, task)
    return task
  }

  /** 补齐剩余分片（搜索时触发；不阻塞已加载内容的显示） */
  async function ensureAllShards() {
    if (allLoaded.value || loadingAll.value) {
      return
    }
    loadingAll.value = true
    try {
      await Promise.all(families.value.map(s => ensureShard(s.family)))
    }
    finally {
      loadingAll.value = false
    }
  }

  async function selectChip(chipId: string, options: { keepPin?: boolean } = {}) {
    if (currentChipId.value === chipId && chip.value) {
      return
    }
    currentChipId.value = chipId
    chipError.value = null
    if (!options.keepPin) {
      selectedPosition.value = null
      variantKey.value = null
    }

    const cached = chipCache.get(chipId)
    if (cached) {
      chip.value = cached
      return
    }

    // 目标芯片可能在尚未加载的系列里：先把它的系列拉下来（同 die 的其它封装也在同一系列）
    let entry = loadedChips.value.find(e => e.chip === chipId)
    if (!entry) {
      const family = familyForChip(chipId)
      if (family) {
        await ensureShard(family)
        entry = loadedChips.value.find(e => e.chip === chipId)
      }
    }
    if (!entry) {
      chipError.value = `索引里没有 ${chipId}`
      return
    }

    loadingChip.value = true
    chip.value = null
    try {
      const doc = await fetchJson<ChipDoc>(`${dataBase.value}/${entry.part}`)
      // 数据入口归一化一次：type 的历史别名（io → gpio）与未知值都在这里收口，
      // 下游（配色表 / 图例计数 / 标签）不必再防，见 docs/07 §17
      const normalized: ChipDoc = { ...doc, pins: normalizePins(doc.pins) }
      chipCache.set(chipId, normalized)
      chip.value = normalized
    }
    catch (error) {
      chipError.value = (error as Error).message
    }
    finally {
      loadingChip.value = false
    }
  }

  async function reloadChip() {
    const id = currentChipId.value
    if (!id) {
      return
    }
    chipCache.delete(id)
    currentChipId.value = null
    await selectChip(id)
  }

  function selectPin(position: string | null) {
    selectedPosition.value = position
  }

  function setVariant(key: string | null) {
    variantKey.value = key
  }

  return {
    dataBase,
    dataTag,
    manifest,
    families,
    familyGroups,
    shards,
    loadedFamilies,
    loadingFamilies,
    loadingAll,
    allLoaded,
    totalChips,
    indexError,
    chip,
    chipError,
    loadingChip,
    query,
    currentChipId,
    selectedPosition,
    variantKey,
    loadedChips,
    filteredChips,
    groupedChips,
    sameDieChips,
    effectivePins,
    selectedPin,
    variantsAvailable,
    hasAfData,
    familyForChip,
    loadManifest,
    ensureShard,
    ensureAllShards,
    selectChip,
    reloadChip,
    selectPin,
    setVariant,
  }
})
