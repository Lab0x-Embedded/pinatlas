<script setup lang="ts">
import { buttonVariants } from '~/components/ui/button/variants'
import { appName, repoUrl } from '~/constants'
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

const dataHost = computed(() => {
  try {
    return new URL(store.dataBase).host
  }
  catch {
    return store.dataBase
  }
})
</script>

<template>
  <header class="border-border bg-background/95 supports-backdrop-blur:bg-background/60 sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b px-4 backdrop-blur">
    <div class="flex items-center gap-2">
      <img src="/logo-64.png" alt="" width="28" height="28" class="size-7 shrink-0 rounded-md">
      <span class="text-sm font-semibold tracking-tight">{{ appName }}</span>
    </div>

    <div class="relative mx-auto w-full max-w-md">
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

    <div class="ml-auto flex items-center gap-1">
      <span class="text-muted-foreground hidden text-xs lg:inline">{{ formatter.format(store.totalChips) }} 个型号 · {{ dataHost }}</span>
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
