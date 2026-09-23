<script setup lang="ts">
import { strings } from '~/constants/strings'

const store = useChipsStore()
const route = useRoute()
const router = useRouter()

const DEFAULT_CHIP = 'STM32F103C8Tx'

const syncing = ref(false)

/**
 * 中间区域的加载态判定：清单还没到（index.json 在路上）/ 正在解析型号 / 正在拉芯片文档，
 * 都算 loading。
 * 之前只判 loadingChip || resolving，首屏最前面那段（清单还没回来时）会被当成空态，
 * 于是先闪一下「从左侧选择一个型号」，看起来就是"没有 loading 效果"。
 * 清单报错时不进 loading，否则会一直转圈（错误由列表区和下方 Alert 呈现）。
 */
const loading = computed(() =>
  (!store.manifest && !store.indexError) || store.loadingChip || store.resolving)

/** 引脚搜索的键盘交互：↑↓ 在命中间移动并选中，Enter 选中当前，Esc 清空 */
function onPinSearchKeydown(event: KeyboardEvent) {
  const total = store.pinHits.length
  if (!total) {
    return
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const step = event.key === 'ArrowDown' ? 1 : -1
    const current = store.pinHitIndex
    store.selectPinHit(current < 0 ? (step > 0 ? 0 : total - 1) : (current + step + total) % total)
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    store.selectPinHit(store.pinHitIndex < 0 ? 0 : store.pinHitIndex)
    return
  }
  if (event.key === 'Escape') {
    store.clearPinSearch()
  }
}

async function bootstrap() {
  // 参数必须在「loadManifest 之后、selectChip 之前」取好，两个坑都实测过：
  //   ① 生产构建是预渲染页（nitro.prerender '/'）：onMounted 时 router 还没把地址栏的 query
  //      同步进 route，此时同步读 route.query 恒为空，深链会静默退化成默认型号
  //      （dev 不做预渲染，route.query 立刻可用，所以开发时看不出来）。
  //   ② 取完再用，不能等到 selectChip 之后再读：selectChip 会改 currentChipId，触发 URL 同步
  //      watcher 用 {chip} 覆写 query，把 pin / variant 冲掉（线上实测过）。
  await store.loadManifest()
  const fromUrl = new URLSearchParams(import.meta.client ? window.location.search : '')
  const wantedChip = queryParam('chip') || fromUrl.get('chip')
  const wantedPin = queryParam('pin') || fromUrl.get('pin')
  const wantedVariant = queryParam('variant') || fromUrl.get('variant')

  await store.selectChip(wantedChip || DEFAULT_CHIP)
  if (wantedPin) {
    store.selectPin(wantedPin)
  }
  if (wantedVariant) {
    store.setVariant(wantedVariant)
  }
}

/** route.query 里的字符串参数（非字符串/缺失时返回空串） */
function queryParam(key: string): string {
  const value = route.query[key]
  return typeof value === 'string' ? value : ''
}

onMounted(bootstrap)

// 状态进 URL，便于分享同一条视图（docs/03-frontend-architecture.md §4）
watch(
  [() => store.currentChipId, () => store.selectedPosition, () => store.variantKey],
  ([chip, pin, variant]) => {
    if (syncing.value) {
      return
    }
    syncing.value = true
    const query: Record<string, string> = {}
    if (chip) {
      query.chip = chip
    }
    if (pin) {
      query.pin = pin
    }
    if (variant) {
      query.variant = variant
    }
    void router.replace({ query }).finally(() => {
      syncing.value = false
    })
  },
)

useHead({ title: `${strings.appName} · ${strings.tagline}` })
</script>

<template>
  <main class="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-4 p-4 lg:grid lg:grid-cols-[280px_minmax(0,1fr)_340px]">
    <!-- 左：型号列表 -->
    <aside class="border-border order-2 min-h-0 rounded-xl border lg:order-1 lg:max-h-[calc(100vh-7rem)]">
      <ChipSidebar />
    </aside>

    <!-- 中：引脚图 -->
    <section class="order-1 min-w-0 space-y-3 lg:order-2">
      <div class="flex flex-wrap items-center gap-2">
        <template v-if="store.chip">
          <h1 class="text-sm font-semibold">
            {{ store.chip.displayName }}
          </h1>
          <Badge variant="secondary">
            {{ store.chip.package }}
          </Badge>
          <Badge variant="outline">
            {{ store.chip.pinCount }} 脚
          </Badge>
          <Badge v-if="store.variantKey" variant="outline">
            变体 {{ store.variantKey }}
          </Badge>
        </template>
        <span v-else class="text-muted-foreground text-sm">{{ strings.selectChip }}</span>

        <!-- 引脚搜索：放芯片名 / 封装 / 脚数这一行的右端（大封装图上不画 pad 名与引脚号，
             只能靠搜 + 图上的淡化强调找某个脚）。命中计数**贴在输入框内**（绝对定位）：
             单独占一行会挤，而且它出现/消失时会把下面的引脚图顶一下（看起来会"跳"） -->
        <div v-if="store.chip" class="relative ml-auto w-full sm:w-64">
          <Input
            v-model="store.pinQuery"
            type="search"
            class="h-7 pr-16 pl-2 text-xs"
            :placeholder="strings.pinSearchPlaceholder"
            aria-label="搜索引脚"
            :title="strings.pinSearchNav"
            @keydown="onPinSearchKeydown"
          />
          <span
            v-if="store.pinSearchActive"
            class="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[10px] tabular-nums"
            :class="store.pinHits.length ? 'text-muted-foreground' : 'text-destructive'"
          >{{ store.pinHits.length }}/{{ store.effectivePins.length }}</span>
        </div>
      </div>

      <Alert v-if="store.chipError" variant="destructive">
        <AlertTitle>{{ strings.loadFailed }}</AlertTitle>
        <AlertDescription class="gap-2">
          <span class="break-all">{{ store.chipError }}</span>
          <Button size="sm" variant="outline" @click="store.reloadChip()">
            {{ strings.retry }}
          </Button>
        </AlertDescription>
      </Alert>

      <!-- 加载态：套用与引脚图**同一个外层容器**（border + rounded-xl + p-4）与同一块方形区域
           （mx-auto w-full max-w-[860px] aspect-square，就是 SVG 待会儿占的位置），里面只放一个
           转圈。不放文案、也不铺灰色骨架：灰骨架看着像"中间堆了一坨灰"，尺寸对不上时 SVG 冒出来还很突兀。 -->
      <div v-else-if="loading" class="border-border rounded-xl border p-4">
        <div class="mx-auto flex aspect-square w-full max-w-[860px] items-center justify-center">
          <span class="border-muted-foreground/40 size-12 animate-spin rounded-full border-[3px] border-t-transparent" aria-hidden="true" />
        </div>
      </div>

      <div v-else-if="store.chip" class="border-border rounded-xl border p-4">
        <PackageDiagram />
      </div>

      <Card v-else class="text-muted-foreground items-center justify-center p-10 text-center text-sm">
        <p>{{ strings.selectChip }}</p>
        <p class="text-xs">
          {{ strings.exampleHint }}
        </p>
      </Card>
    </section>

    <!-- 右：详情 -->
    <aside class="order-3 space-y-3">
      <PinDetailPanel />
      <ChipInfoCard v-if="store.chip" :chip="store.chip" />
      <PackageSwitcher v-if="store.chip" />
    </aside>
  </main>
</template>
