<script setup lang="ts">
import type { FamilyGroupItem } from '~/types/pinatlas'
import { cn } from '~/lib/utils'

/**
 * 左栏的"系列树"：系列行（可展开，按需拉分片）→ 子系列标题 → 型号行。
 * 从 ChipSidebar 抽出来，让同一份渲染既服务单厂商平铺（无厂商层），
 * 也服务多厂商分组（挂在厂商层下面）。
 */
const props = defineProps<{
  families: FamilyGroupItem[]
  /** 已展开的系列（展开状态归 ChipSidebar 管，键盘/自动展开都作用在那里） */
  expanded: Set<string>
}>()

const emit = defineEmits<{ (e: 'toggle', family: string): void }>()

const store = useChipsStore()

/** 副标题：封装 · 脚数 · Flash */
function chipSubtitle(entry: { package: string | null, pinCount: number | null, flashKb: number | null }) {
  return [
    entry.package,
    entry.pinCount ? `${entry.pinCount} 脚` : null,
    entry.flashKb ? `${entry.flashKb} KB` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}
</script>

<template>
  <div v-for="group in props.families" :key="group.family" class="mb-1">
    <Button
      type="button"
      variant="ghost"
      class="h-auto w-full justify-start gap-2 rounded-md px-2 py-1.5 text-left font-normal"
      @click="emit('toggle', group.family)"
    >
      <svg
        class="text-muted-foreground size-3 shrink-0 transition-transform"
        :class="props.expanded.has(group.family) && 'rotate-90'"
        viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"
      >
        <path d="m9 6 6 6-6 6" />
      </svg>
      <span class="flex-1 truncate text-sm">{{ group.family }}</span>
      <span v-if="group.loading" class="border-border size-3 animate-spin rounded-full border-2 border-t-transparent" />
      <span v-else class="text-muted-foreground text-[11px] tabular-nums">{{ group.count }}</span>
    </Button>

    <div v-if="props.expanded.has(group.family)" class="mt-0.5 ml-3 border-l pl-2">
      <template v-if="group.loaded">
        <div v-for="lineGroup in store.groupedChips.filter(g => group.chips.some(c => c.line === g.line))" :key="lineGroup.line">
          <p class="text-foreground/75 border-border/60 mt-2 mb-0.5 truncate border-b px-2 pb-1 text-xs font-semibold tracking-wide" :title="lineGroup.line">
            {{ lineGroup.line }}
            <span class="text-muted-foreground font-normal tabular-nums">· {{ lineGroup.chips.length }}</span>
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
                <!-- 主名用唯一型号 id：displayName 是数据手册式合并名（STM32C011F(4-6)Px），
                     全库 24% 的条目会因为封装/脚数/Flash 都相同而显示得一模一样（见 docs/04 §3） -->
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
</template>
