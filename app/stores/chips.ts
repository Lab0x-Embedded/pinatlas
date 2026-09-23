import type { ChipDoc, ChipIndexEntry, DatasetManifest, FamilyShard, Pin } from '~/types/pinatlas'
import type { ChipSearchMatch } from '~/utils/chip-search'
import { buildDataBase, DATA_HOST_STORAGE_KEY, DATA_SOURCES, hostOf } from '~/constants/data-sources'
import { searchChips } from '~/utils/chip-search'
import { fetchJson } from '~/utils/http'
import { searchPins } from '~/utils/pin-search'
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
  const dataTag = computed(() => String(runtimeConfig.public.dataTag || ''))
  /** 构建期的默认数据根（CDN 或同源快照）+ 路径前缀，见 nuxt.config.ts */
  const defaultDataBase = computed(() => String(runtimeConfig.public.dataBase || '').replace(/\/+$/, ''))
  const dataPath = computed(() => String(runtimeConfig.public.dataPath || ''))
  const configuredHost = computed(() => String(runtimeConfig.public.dataHost || ''))

  const manifest = ref<DatasetManifest | null>(null)
  const shards = ref<Record<string, ChipIndexEntry[]>>({})
  const loadingFamilies = ref<Set<string>>(new Set())
  const loadingAll = ref(false)
  const indexError = ref<string | null>(null)

  const chip = ref<ChipDoc | null>(null)
  const chipError = ref<string | null>(null)
  const loadingChip = ref(false)
  /**
   * 正在解析/拉取当前型号（含"等家族分片"那段）：光靠 loadingChip 不够，
   * 分片还没回来时 loadingChip 仍是 false、chip 又是 null，页面会先闪一下空态
   * （数据源切换、首屏、搜索结果点进新子系列时都能看到那段空白）。
   */
  const resolving = ref(false)

  const query = ref('')
  const currentChipId = ref<string | null>(null)
  const selectedPosition = ref<string | null>(null)
  const variantKey = ref<string | null>(null)

  const chipCache = new Map<string, ChipDoc>()
  const shardPromises = new Map<string, Promise<void>>()

  /**
   * 数据源（CDN 镜像）可在页头切换，见 `~/constants/data-sources`。
   *   - `savedHost === null`：没选过 → 用构建期默认（nuxt.config 的 dataBase，本地离线模式就是 /data）
   *   - 其它：`https://<host><dataPath>`
   * 只存 host 不存整串 URL，所以换数据 tag（dataPath 变）不会让 localStorage 里的选择失效。
   */
  const savedHost = ref<string | null>(null)
  let hostInitialized = false

  const dataBase = computed(() => {
    if (savedHost.value === null) {
      return defaultDataBase.value
    }
    return buildDataBase(savedHost.value, dataPath.value, defaultDataBase.value)
  })
  const dataHost = computed(() => hostOf(dataBase.value || configuredHost.value))
  /** 当前生效的数据源（Select 的绑定值）：没选过时就是构建期默认那个镜像 */
  const dataSource = computed(() => savedHost.value ?? configuredHost.value)

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

  /**
   * 搜索结果（多词 AND + 相关度排序 + 高亮区间），见 `~/utils/chip-search`。
   * 键盘导航（↑↓）用这份扁平有序列表，所以顺序必须稳定：相关度 → 子系列 → 主名。
   */
  const searchMatches = computed(() => searchChips(loadedChips.value, query.value))

  /** 只取条目（未搜索时就是全部已加载型号，顺序同索引） */
  const filteredChips = computed(() => searchMatches.value.map(match => match.entry))

  /** 搜索结果的 line 分组：组内按相关度，组间按该组最高分（相关度高的系列先出现） */
  const searchGroups = computed(() => {
    const groups = new Map<string, ChipSearchMatch[]>()
    for (const match of searchMatches.value) {
      const key = match.entry.line || '未分组'
      const bucket = groups.get(key) ?? []
      bucket.push(match)
      groups.set(key, bucket)
    }
    return [...groups.entries()]
      .map(([line, matches]) => ({
        line,
        matches: [...matches].sort((a, b) =>
          b.score - a.score
          || String(a.entry.package).localeCompare(String(b.entry.package))
          || (a.entry.flashKb ?? 0) - (b.entry.flashKb ?? 0)),
      }))
      .sort((a, b) => Math.max(...b.matches.map(m => m.score)) - Math.max(...a.matches.map(m => m.score)))
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

  /**
   * 引脚搜索（当前型号内）：输入框在芯片名那一行的右端（index.vue），图上的淡化/强调在
   * PackageDiagram（两处都要用，所以状态放在 store）。大封装（LQFP144/208/BGA）图上不画
   * pad 名与引脚号，只能靠它找某个脚。
   */
  const pinQuery = ref('')
  const pinHits = computed(() => searchPins(effectivePins.value, pinQuery.value))
  const pinSearchActive = computed(() => pinQuery.value.trim().length > 0)
  const pinHitPositions = computed(() => new Set(pinHits.value.map(hit => hit.pin.position)))
  /** ↑↓ 在命中结果里移动的下标（-1 = 未进入键盘模式） */
  const pinHitIndex = ref(-1)
  const activePinHit = computed(() => pinHits.value[pinHitIndex.value]?.pin ?? null)

  function selectPinHit(index: number) {
    const hit = pinHits.value[index]
    if (hit) {
      pinHitIndex.value = index
      selectedPosition.value = hit.pin.position
    }
  }

  /** 唯一的命中就直接选中它（省一次 ↑↓ 或点图） */
  watch(pinHits, (hits) => {
    pinHitIndex.value = -1
    const [only] = hits
    if (pinSearchActive.value && hits.length === 1 && only) {
      selectedPosition.value = only.pin.position
    }
  })

  function clearPinSearch() {
    pinQuery.value = ''
    pinHitIndex.value = -1
  }

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
    applySavedHostOnce()
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

  /** 首次进入时恢复用户上次选的镜像（只认清单里的值，避免旧版本留下的无效值把数据根拼歪） */
  function applySavedHostOnce() {
    if (hostInitialized) {
      return
    }
    hostInitialized = true
    if (typeof window === 'undefined') {
      return
    }
    try {
      const saved = window.localStorage.getItem(DATA_HOST_STORAGE_KEY)
      if (saved !== null && DATA_SOURCES.some(source => source.value === saved)) {
        savedHost.value = saved
      }
    }
    catch {
      // 隐私模式下 localStorage 可能直接抛错：忽略，用构建期默认
    }
  }

  /** 切换数据源：清掉已加载的清单/分片/芯片缓存，再用新 host 重新拉一遍（保留当前型号与选中引脚） */
  async function setDataSource(host: string) {
    if (host === dataSource.value) {
      return
    }
    savedHost.value = host
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(DATA_HOST_STORAGE_KEY, host)
      }
      catch {
        // 存不进去不影响本次会话
      }
    }
    resetDataset()
    await loadManifest(true)
    const id = currentChipId.value
    if (id) {
      currentChipId.value = null
      await selectChip(id, { keepPin: true })
    }
  }

  /** 丢清已加载的数据（换数据源时必须做，否则会把旧 host 的分片和芯片文档混着用） */
  function resetDataset() {
    manifest.value = null
    shards.value = {}
    chipCache.clear()
    shardPromises.clear()
    loadingFamilies.value = new Set()
    loadingAll.value = false
    indexError.value = null
    chip.value = null
    chipError.value = null
    resolving.value = false
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

    resolving.value = true
    try {
      await fetchChip(chipId)
    }
    finally {
      resolving.value = false
    }
  }

  /** 真正去取芯片文档（可能要先把所在家族的索引分片拉下来） */
  async function fetchChip(chipId: string) {
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
    dataHost,
    dataSource,
    setDataSource,
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
    resolving,
    query,
    currentChipId,
    selectedPosition,
    variantKey,
    loadedChips,
    filteredChips,
    searchMatches,
    searchGroups,
    groupedChips,
    sameDieChips,
    effectivePins,
    selectedPin,
    variantsAvailable,
    hasAfData,
    pinQuery,
    pinHits,
    pinSearchActive,
    pinHitPositions,
    pinHitIndex,
    activePinHit,
    selectPinHit,
    clearPinSearch,
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
