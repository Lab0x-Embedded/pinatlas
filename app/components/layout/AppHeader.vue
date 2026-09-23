<script setup lang="ts">
import { buttonVariants } from '~/components/ui/button/variants'
import { appName, repoUrl } from '~/constants'
import { DATA_SOURCES, sourceLabel } from '~/constants/data-sources'
import { strings } from '~/constants/strings'
import { cn } from '~/lib/utils'

const store = useChipsStore()
const searchRef = ref<HTMLInputElement | null>(null)
const formatter = new Intl.NumberFormat('en-US')

function focusSearch() {
  searchRef.value?.focus()
  searchRef.value?.select()
}

function onKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    focusSearch()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

/** 数据源下拉：换镜像后 store 会清缓存并按新 host 重拉清单与当前型号 */
function onDataSourceChange(value: unknown) {
  if (typeof value === 'string') {
    void store.setDataSource(value)
  }
}
</script>

<template>
  <!-- 三列网格（1fr_搜索_1fr）：搜索框相对**页头**居中，而不是"在品牌与右侧操作区的
       缝隙里 mx-auto"。右侧加了下拉以后变宽，用 mx-auto 会把搜索框顶偏一个下拉的宽度。
       两侧用 minmax(min-content,1fr)：窄屏时让搜索框先缩，别让右侧按钮被它压住
       （实测 560px 下 28rem 固定宽度会与主题/仓库按钮重叠 28px）。 -->
  <header class="border-border bg-background/95 supports-backdrop-blur:bg-background/60 sticky top-0 z-30 grid h-14 shrink-0 grid-cols-[minmax(min-content,1fr)_minmax(0,28rem)_minmax(min-content,1fr)] items-center gap-3 border-b px-4 backdrop-blur">
    <div class="flex items-center gap-2">
      <img src="/logo-64.png" alt="" width="28" height="28" class="size-7 shrink-0 rounded-md">
      <span class="text-sm font-semibold tracking-tight">{{ appName }}</span>
    </div>

    <div class="relative w-full justify-self-center">
      <svg class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <Input
        ref="searchRef"
        v-model="store.query"
        class="h-9 pl-9"
        :placeholder="strings.searchPlaceholder"
        type="search"
        aria-label="搜索芯片型号"
      />
      <kbd class="border-border text-muted-foreground pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border px-1.5 py-0.5 text-[10px] sm:block">
        {{ strings.searchShortcut }}
      </kbd>
    </div>

    <div class="flex items-center justify-end gap-1 justify-self-end">
      <span class="text-muted-foreground hidden text-xs lg:inline">{{ formatter.format(store.totalChips) }} 个型号</span>
      <!-- 数据源（CDN 镜像）切换：不同运营商/地区哪个镜像快差别很大，用户自己切比我们赌一个准 -->
      <Select :model-value="store.dataSource" @update:model-value="onDataSourceChange">
        <SelectTrigger :title="store.dataBase" aria-label="数据源 CDN" class="hidden lg:flex">
          <SelectValue>{{ sourceLabel(store.dataSource) }}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="source in DATA_SOURCES"
            :key="source.value"
            :value="source.value"
            :hint="source.hint"
          >
            {{ source.label }}
          </SelectItem>
        </SelectContent>
      </Select>
      <ThemeToggle />
      <a
        :href="repoUrl"
        :class="cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'text-muted-foreground hover:text-foreground')"
        target="_blank"
        rel="noreferrer"
        aria-label="GitHub 仓库"
      >
        <svg class="size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.36 1.09 2.94.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
        </svg>
      </a>
    </div>
  </header>
</template>
