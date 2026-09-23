<script setup lang="ts">
import { strings } from '~/constants/strings'

const store = useChipsStore()
const route = useRoute()
const router = useRouter()

const DEFAULT_CHIP = 'STM32F103C8Tx'

const syncing = ref(false)

async function bootstrap() {
  // 三个 query 参数必须在任何 await 之前取出来：下面的 selectChip() 会改 currentChipId，
  // 触发 URL 同步 watcher 用 {chip} 覆写 query，把 pin / variant 冲掉。
  // 线上实测（生产构建）就是这个竞态：?chip=…&pin=96 打完只剩 chip，右侧面板一直停在
  // 「点击引脚查看复用功能」，而 dev 下时序不同看不出来。
  const wantedChip = typeof route.query.chip === 'string' ? route.query.chip : null
  const wantedPin = typeof route.query.pin === 'string' ? route.query.pin : null
  const wantedVariant = typeof route.query.variant === 'string' ? route.query.variant : null

  // 只拉清单（约 9 KB）+ 目标型号所在的系列；其余系列等用户展开或搜索时再拉。
  await store.loadManifest()
  await store.selectChip(wantedChip || DEFAULT_CHIP)
  if (wantedPin) {
    store.selectPin(wantedPin)
  }
  if (wantedVariant) {
    store.setVariant(wantedVariant)
  }
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

      <div v-else-if="store.loadingChip" class="space-y-3">
        <Skeleton class="mx-auto aspect-square w-full max-w-[720px] rounded-xl" />
        <Skeleton class="h-4 w-2/3" />
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
