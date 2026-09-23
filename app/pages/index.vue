<script setup lang="ts">
import { strings } from '~/constants/strings'

const store = useChipsStore()
const route = useRoute()
const router = useRouter()

const DEFAULT_CHIP = 'STM32F103C8Tx'

const syncing = ref(false)

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

      <div v-else-if="store.loadingChip || store.resolving" class="space-y-3">
        <Skeleton class="mx-auto aspect-square w-full max-w-[720px] rounded-xl" />
        <Skeleton class="h-4 w-2/3" />
        <p class="text-muted-foreground text-center text-xs">
          {{ strings.loading }}
        </p>
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
