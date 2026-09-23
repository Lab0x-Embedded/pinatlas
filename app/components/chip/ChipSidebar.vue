<script setup lang="ts">
import type { ChipSearchMatch } from '~/utils/chip-search'
import { strings } from '~/constants/strings'
import { cn } from '~/lib/utils'
import { highlightParts, SEARCH_GROUP_LIMIT, SEARCH_GROUP_PREVIEW } from '~/utils/chip-search'

const store = useChipsStore()

const formatter = new Intl.NumberFormat('en-US')
const expanded = ref<Set<string>>(new Set())

/** 每组"展开其余"的 line 集合 */
const uncapped = ref<Set<string>>(new Set())
/** 是否展开全部 line 分组（默认只渲染相关度最高的前 N 个系列） */
const allGroups = ref(false)

const searching = computed(() => store.query.trim().length > 0)

/** 键盘导航：当前高亮的结果下标（-1 = 未进入键盘模式） */
const activeIndex = ref(-1)
const sidebarRef = ref<HTMLElement | null>(null)
const itemRefs = ref<Array<{ $el?: HTMLElement } | HTMLElement | null>>([])

/** 实际渲染的分组（超出上限时只渲染前 N 个） */
const visibleGroups = computed(() => allGroups.value ? store.searchGroups : store.searchGroups.slice(0, SEARCH_GROUP_PREVIEW))

function hiddenGroups() {
  return allGroups.value ? 0 : Math.max(0, store.searchGroups.length - SEARCH_GROUP_PREVIEW)
}

/** 每组实际渲染的条目（超上限时只渲染前 N 条，避免 "stm32" 这种查询塞几千行按钮） */
function visibleMatches(matches: ChipSearchMatch[], line: string) {
  if (uncapped.value.has(line) || matches.length <= SEARCH_GROUP_LIMIT) {
    return matches
  }
  return matches.slice(0, SEARCH_GROUP_LIMIT)
}

function hiddenCount(matches: ChipSearchMatch[], line: string) {
  return uncapped.value.has(line) ? 0 : Math.max(0, matches.length - SEARCH_GROUP_LIMIT)
}

function expandGroup(line: string) {
  const next = new Set(uncapped.value)
  next.add(line)
  uncapped.value = next
  activeIndex.value = -1
}

function expandGroups() {
  allGroups.value = true
  activeIndex.value = -1
}

/**
 * 键盘导航作用的列表 = 实际渲染出来的顺序（组间按相关度、组内按相关度、每组与分组都截断后）。
 * 必须与 DOM 顺序一致，否则 ↑↓ 会跳到没渲染出来的条目上。
 */
const navigableMatches = computed<ChipSearchMatch[]>(() =>
  visibleGroups.value.flatMap(group => visibleMatches(group.matches, group.line)))

const activeChipId = computed(() => navigableMatches.value[activeIndex.value]?.entry.chip ?? null)

/** 展开系列 → 按需拉该系列分片 */
function toggle(family: string) {
  const next = new Set(expanded.value)
  if (next.has(family)) {
    next.delete(family)
  }
  else {
    next.add(family)
    void store.ensureShard(family)
  }
  expanded.value = next
}

/**
 * 搜索时补齐剩余系列：结果随到随显示，不阻塞已加载部分。
 * 去抖 180ms：原来每敲一个字符都触发一次，第一次按键就并发拉 27 个分片（551 KB），
 * 快速改词/清空时全是白拉的请求。
 */
let shardTimer: ReturnType<typeof setTimeout> | undefined
watch(() => store.query, (q) => {
  activeIndex.value = -1
  // 换关键词时把"展开"状态清掉，否则上一轮的展开会带着一堆无关行一起渲染
  uncapped.value = new Set()
  allGroups.value = false
  clearTimeout(shardTimer)
  if (!q.trim()) {
    return
  }
  shardTimer = setTimeout(() => void store.ensureAllShards(), 180)
})

/**
 * ↑↓ 移动、Enter 选中、Esc 清空。
 * 监听挂在 window 上：焦点在页头的搜索框里，键事件到不了侧栏容器（原来结果只能用鼠标点）。
 */
function onWindowKeydown(event: KeyboardEvent) {
  if (!searching.value) {
    return
  }
  const target = event.target as HTMLElement | null
  if (target?.tagName !== 'INPUT' && !sidebarRef.value?.contains(target)) {
    return
  }
  const total = navigableMatches.value.length
  if (!total) {
    return
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const step = event.key === 'ArrowDown' ? 1 : -1
    activeIndex.value = activeIndex.value < 0
      ? (step > 0 ? 0 : total - 1)
      : (activeIndex.value + step + total) % total
    void nextTick(() => scrollActiveIntoView())
    return
  }
  if (event.key === 'Enter' && activeIndex.value >= 0) {
    event.preventDefault()
    const match = navigableMatches.value[activeIndex.value]
    if (match) {
      store.selectChip(match.entry.chip)
    }
    return
  }
  if (event.key === 'Escape') {
    store.query = ''
    activeIndex.value = -1
  }
}

function scrollActiveIntoView() {
  const node = itemRefs.value[activeIndex.value]
  const el = node instanceof HTMLElement ? node : node?.$el
  el?.scrollIntoView({ block: 'nearest' })
}

onMounted(() => window.addEventListener('keydown', onWindowKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown)
  clearTimeout(shardTimer)
})

/** 当前型号所在系列自动展开 */
watch(() => store.currentChipId, (id) => {
  if (!id) {
    return
  }
  const family = store.familyForChip(id)
  if (family && !expanded.value.has(family)) {
    const next = new Set(expanded.value)
    next.add(family)
    expanded.value = next
    void store.ensureShard(family)
  }
})

/** 副标题：封装 · 脚数 · Flash，命中订货号时把它带出来（搜 "C8T6" 否则看不到命中原因） */
function chipSubtitle(entry: { package: string | null, pinCount: number | null, flashKb: number | null }, matchedMpn: string | null = null) {
  return [
    entry.package,
    entry.pinCount ? `${entry.pinCount} 脚` : null,
    entry.flashKb ? `${entry.flashKb} KB` : null,
    matchedMpn,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** 型号名按命中区间切段，供 <mark> 渲染 */
function chipIdParts(match: ChipSearchMatch) {
  return highlightParts(match.entry.chip, match.chipSpans)
}
</script>

<template>
  <div ref="sidebarRef" class="flex h-full min-h-0 flex-col">
    <div class="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
      <h2 class="text-xs font-semibold tracking-wide uppercase">
        {{ strings.chips }}
      </h2>
      <span class="text-muted-foreground text-xs tabular-nums">
        <template v-if="searching">{{ formatter.format(store.searchMatches.length) }} / {{ formatter.format(store.totalChips) }}</template>
        <template v-else>{{ store.loadedFamilies.length }} / {{ store.families.length }} 系列</template>
      </span>
    </div>

    <Alert v-if="store.indexError" variant="destructive" class="mx-4 mb-2">
      <AlertTitle>{{ strings.loadFailed }}</AlertTitle>
      <AlertDescription class="gap-2">
        <span class="break-all">{{ store.indexError }}</span>
        <Button size="sm" variant="outline" @click="store.loadManifest(true).then(() => store.ensureAllShards())">
          {{ strings.retry }}
        </Button>
      </AlertDescription>
    </Alert>

    <div v-else-if="!store.families.length" class="space-y-2 px-4">
      <Skeleton class="h-8 w-full" />
      <Skeleton class="h-8 w-5/6" />
      <Skeleton class="h-8 w-4/6" />
    </div>

    <!-- 搜索结果（多词 AND + 相关度排序；↑↓ 移动、Enter 选中、Esc 清空） -->
    <div v-else-if="searching" class="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
      <p v-if="!store.searchMatches.length" class="text-muted-foreground px-2 text-xs">
        {{ strings.noResult }}
        <br>
        {{ strings.noResultHint }}
      </p>
      <template v-else>
        <p class="text-muted-foreground px-2 pb-1 text-[11px]">
          {{ strings.searchHint }}
        </p>
        <div v-for="group in visibleGroups" :key="group.line" class="mb-3">
          <p class="text-muted-foreground px-2 py-1 text-[11px] font-medium">
            {{ group.line }}
          </p>
          <ul class="space-y-0.5">
            <li v-for="match in visibleMatches(group.matches, group.line)" :key="match.entry.chip">
              <Button
                ref="itemRefs"
                type="button"
                variant="ghost"
                :title="match.entry.displayName"
                :class="cn(
                  'h-auto w-full flex-col items-stretch justify-start gap-0 rounded-md px-2 py-1.5 text-left whitespace-normal',
                  store.currentChipId === match.entry.chip ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
                  activeChipId === match.entry.chip && 'ring-ring ring-1',
                )"
                @click="store.selectChip(match.entry.chip)"
              >
                <!-- 主名用唯一型号 id：displayName 是数据手册式合并名（STM32C011F(4-6)Px），
                     全库 24% 的条目会因为封装/脚数/Flash 都相同而显示得一模一样（见 docs/04 §3） -->
                <span class="block truncate text-sm">
                  <template v-for="(part, i) in chipIdParts(match)" :key="i">
                    <mark v-if="part.hit" class="bg-primary/20 text-foreground rounded-sm">{{ part.text }}</mark>
                    <template v-else>{{ part.text }}</template>
                  </template>
                </span>
                <span class="text-muted-foreground block truncate text-[11px]">{{ chipSubtitle(match.entry, match.matchedMpn) }}</span>
              </Button>
            </li>
          </ul>
          <Button
            v-if="hiddenCount(group.matches, group.line)"
            type="button"
            variant="ghost"
            class="text-muted-foreground mt-0.5 h-7 w-full justify-start px-2 text-[11px] font-normal hover:bg-accent/60"
            @click="expandGroup(group.line)"
          >
            还有 {{ formatter.format(hiddenCount(group.matches, group.line)) }} 条 · {{ strings.expandAll }}
          </Button>
        </div>
        <Button
          v-if="hiddenGroups()"
          type="button"
          variant="ghost"
          class="text-muted-foreground h-7 w-full justify-start px-2 text-[11px] font-normal hover:bg-accent/60"
          @click="expandGroups"
        >
          还有 {{ formatter.format(hiddenGroups()) }} 个子系列 · {{ strings.expandAll }}
        </Button>
      </template>
      <p v-if="!store.allLoaded" class="text-muted-foreground flex items-center gap-2 px-2 py-2 text-[11px]">
        <span class="border-border size-3 animate-spin rounded-full border-2 border-t-transparent" />
        正在补齐其余系列（{{ store.loadedFamilies.length }}/{{ store.families.length }}）…
      </p>
    </div>

    <!-- 系列树：未加载的系列只显示计数，展开才拉数据 -->
    <div v-else class="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
      <div v-for="group in store.familyGroups" :key="group.family" class="mb-1">
        <Button
          type="button"
          variant="ghost"
          class="h-auto w-full justify-start gap-2 rounded-md px-2 py-1.5 text-left font-normal"
          @click="toggle(group.family)"
        >
          <svg
            class="text-muted-foreground size-3 shrink-0 transition-transform"
            :class="expanded.has(group.family) && 'rotate-90'"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"
          >
            <path d="m9 6 6 6-6 6" />
          </svg>
          <span class="flex-1 truncate text-sm">{{ group.family }}</span>
          <span v-if="group.loading" class="border-border size-3 animate-spin rounded-full border-2 border-t-transparent" />
          <span v-else class="text-muted-foreground text-[11px] tabular-nums">{{ group.count }}</span>
        </Button>

        <div v-if="expanded.has(group.family)" class="mt-0.5 ml-3 border-l pl-2">
          <template v-if="group.loaded">
            <div v-for="lineGroup in store.groupedChips.filter(g => group.chips.some(c => c.line === g.line))" :key="lineGroup.line">
              <p class="text-muted-foreground px-2 py-1 text-[11px] font-medium">
                {{ lineGroup.line }}
              </p>
              <ul class="space-y-0.5">
                <li v-for="entry in lineGroup.chips" :key="entry.chip">
                  <Button
                    type="button"
                    variant="ghost"
                    :title="entry.displayName"
                    :class="cn(
                      'h-auto w-full flex-col items-stretch justify-start gap-0 rounded-md px-2 py-1.5 text-left whitespace-normal',
                      store.currentChipId === entry.chip ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
                    )"
                    @click="store.selectChip(entry.chip)"
                  >
                    <span class="block truncate text-sm">{{ entry.chip }}</span>
                    <span class="text-muted-foreground block truncate text-[11px]">{{ chipSubtitle(entry) }}</span>
                  </Button>
                </li>
              </ul>
            </div>
          </template>
          <div v-else class="space-y-1 px-2 py-2">
            <Skeleton class="h-6 w-full" />
            <Skeleton class="h-6 w-5/6" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
