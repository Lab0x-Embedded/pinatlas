<script setup lang="ts">
import { strings } from '~/constants/strings'
import { cn } from '~/lib/utils'

const store = useChipsStore()

const formatter = new Intl.NumberFormat('en-US')
const expanded = ref<Set<string>>(new Set())

const searching = computed(() => store.query.trim().length > 0)

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

/** 搜索时补齐剩余系列：结果随到随显示，不阻塞已加载部分 */
watch(() => store.query, (q) => {
  if (q.trim()) {
    void store.ensureAllShards()
  }
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

function chipSubtitle(entry: { package: string | null, pinCount: number | null, flashKb: number | null }) {
  return [entry.package, entry.pinCount ? `${entry.pinCount} 脚` : null, entry.flashKb ? `${entry.flashKb} KB` : null]
    .filter(Boolean)
    .join(' · ')
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
      <h2 class="text-xs font-semibold tracking-wide uppercase">
        {{ strings.chips }}
      </h2>
      <span class="text-muted-foreground text-xs tabular-nums">
        <template v-if="searching">{{ formatter.format(store.filteredChips.length) }} / {{ formatter.format(store.totalChips) }}</template>
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

    <!-- 搜索结果 -->
    <div v-else-if="searching" class="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
      <p v-if="!store.filteredChips.length" class="text-muted-foreground px-2 text-xs">
        {{ strings.noResult }}
        <br>
        {{ strings.noResultHint }}
      </p>
      <div v-for="group in store.groupedChips" :key="group.line" class="mb-3">
        <p class="text-muted-foreground px-2 py-1 text-[11px] font-medium">
          {{ group.line }}
        </p>
        <ul class="space-y-0.5">
          <li v-for="entry in group.chips" :key="entry.chip">
            <Button
              type="button"
              variant="ghost"
              :class="cn(
                'h-auto w-full flex-col items-stretch justify-start gap-0 rounded-md px-2 py-1.5 text-left whitespace-normal',
                store.currentChipId === entry.chip ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
              )"
              @click="store.selectChip(entry.chip)"
            >
              <span class="block truncate text-sm">{{ entry.displayName }}</span>
              <span class="text-muted-foreground block truncate text-[11px]">{{ chipSubtitle(entry) }}</span>
            </Button>
          </li>
        </ul>
      </div>
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
                    :class="cn(
                      'h-auto w-full flex-col items-stretch justify-start gap-0 rounded-md px-2 py-1.5 text-left whitespace-normal',
                      store.currentChipId === entry.chip ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
                    )"
                    @click="store.selectChip(entry.chip)"
                  >
                    <span class="block truncate text-sm">{{ entry.displayName }}</span>
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
