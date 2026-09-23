<script setup lang="ts">
import type { CanvasLike, NavDirection, Palette } from '~/utils/canvas-render'
import type { PinSlot } from '~/utils/package-layout'
import { strings } from '~/constants/strings'
import { cn } from '~/lib/utils'
import { drawPackage, hitTestSlots, neighborSlot, readPalette } from '~/utils/canvas-render'
import { bodyRect, layoutPackage, VIEW } from '~/utils/package-layout'
import { functionLabel, PIN_TYPE_LABEL, PIN_TYPE_ORDER, PIN_TYPE_TEXT } from '~/utils/pin-types'

/**
 * 引脚图渲染：Canvas。
 * - 几何来自纯函数 layoutPackage()（与渲染解耦，测试覆盖 quad/dual/grid）
 * - 命中检测/方向键导航是几何计算（canvas 没有 per-pin DOM 节点），见 utils/canvas-render.ts
 * - 颜色在绘制时从 CSS 变量读，主题切换重读并重绘
 */
const store = useChipsStore()
const colorMode = useColorMode()

const canvasEl = ref<HTMLCanvasElement | null>(null)
const wrapper = ref<HTMLElement | null>(null)
const palette = ref<Palette | null>(null)
const size = ref({ width: 720, height: 720 })

const layout = computed(() => layoutPackage({
  kind: store.chip?.packageKind ?? 'unknown',
  pins: store.effectivePins,
}))

const pinInfo = computed(() => {
  const map = new Map<string, { type: string, pad: string }>()
  for (const pin of store.effectivePins) {
    map.set(pin.position, { type: pin.type, pad: pin.pad })
  }
  return map
})

const pinsByPosition = computed(() => new Map(store.effectivePins.map(pin => [pin.position, pin])))

const activeType = ref<string | null>(null)
const hover = ref<{ position: string, x: number, y: number } | null>(null)
const focusedSlot = ref<PinSlot | null>(null)
const liveMessage = ref('')
/** 成功绘制次数：dump-dom/调试时能确认 drawPackage 真的跑完了 */
const renderCount = ref(0)

const perSide = computed(() => layout.value.meta.pinsPerSide ?? 0)
const showPadLabels = computed(() => (layout.value.meta.kind === 'grid' ? false : perSide.value <= 24))

const typeCount = computed(() => {
  const counts = new Map<string, number>()
  for (const pin of store.effectivePins) {
    counts.set(pin.type, (counts.get(pin.type) ?? 0) + 1)
  }
  return counts
})

const ariaLabel = computed(() =>
  `${store.chip?.package ?? ''} 引脚图，共 ${store.effectivePins.length} 脚。用方向键移动、回车选中。`)

function render() {
  const canvas = canvasEl.value
  const pal = palette.value
  if (!canvas || !pal) {
    return
  }
  const dpr = window.devicePixelRatio || 1
  const { width, height } = size.value
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return
  }
  drawPackage(ctx as unknown as CanvasLike, {
    slots: layout.value.slots,
    pinInfo: pinInfo.value,
    palette: pal,
    view: VIEW,
    cssWidth: width,
    cssHeight: height,
    dpr,
    selected: store.selectedPosition,
    hovered: hover.value?.position ?? null,
    activeType: activeType.value,
    showPadLabels: showPadLabels.value,
    body: bodyRect,
  })
  renderCount.value++
}

function toViewCoords(event: MouseEvent) {
  const canvas = canvasEl.value
  if (!canvas) {
    return null
  }
  const rect = canvas.getBoundingClientRect()
  return {
    x: (event.clientX - rect.left) * (VIEW / rect.width),
    y: (event.clientY - rect.top) * (VIEW / rect.height),
  }
}

function onMouseMove(event: MouseEvent) {
  const point = toViewCoords(event)
  if (!point) {
    return
  }
  const slot = hitTestSlots(layout.value.slots, point.x, point.y)
  const wrapperRect = wrapper.value?.getBoundingClientRect()
  hover.value = slot && wrapperRect
    ? { position: slot.position, x: event.clientX - wrapperRect.left, y: event.clientY - wrapperRect.top }
    : null
}

function onClick(event: MouseEvent) {
  const point = toViewCoords(event)
  if (!point) {
    return
  }
  const slot = hitTestSlots(layout.value.slots, point.x, point.y)
  if (slot) {
    store.selectPin(slot.position)
    announce(slot.position)
  }
}

function announce(position: string) {
  const pin = pinsByPosition.value.get(position)
  if (!pin) {
    return
  }
  liveMessage.value = `引脚 ${position}，${pin.name}，${PIN_TYPE_LABEL[pin.type]}，${pin.functions.length} 个功能`
}

function onKeydown(event: KeyboardEvent) {
  const slots = layout.value.slots
  if (!slots.length) {
    return
  }
  const current: PinSlot | undefined = focusedSlot.value
    ?? slots.find(s => s.position === store.selectedPosition)
    ?? slots[0]
  if (!current) {
    return
  }

  const move = (direction: NavDirection) => {
    const next = neighborSlot(slots, current, direction)
    if (next) {
      focusedSlot.value = next
      store.selectPin(next.position)
      announce(next.position)
      event.preventDefault()
    }
  }

  switch (event.key) {
    case 'ArrowLeft': {
      move('ArrowLeft')
      break
    }
    case 'ArrowRight': {
      move('ArrowRight')
      break
    }
    case 'ArrowUp': {
      move('ArrowUp')
      break
    }
    case 'ArrowDown': {
      move('ArrowDown')
      break
    }
    case 'Enter':
    case ' ': {
      focusedSlot.value = current
      store.selectPin(current.position)
      announce(current.position)
      event.preventDefault()
      break
    }
    default:
      break
  }
}

const hoveredPin = computed(() => (hover.value ? pinsByPosition.value.get(hover.value.position) : null))

let observer: ResizeObserver | null = null

onMounted(() => {
  palette.value = readPalette()
  const measure = () => {
    const width = wrapper.value?.clientWidth ?? 720
    size.value = { width, height: width }
    render()
  }
  measure()
  observer = new ResizeObserver(measure)
  if (wrapper.value) {
    observer.observe(wrapper.value)
  }
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})

watch(
  [layout, () => store.selectedPosition, hover, activeType, showPadLabels],
  () => render(),
  { deep: false },
)

// 主题切换：CSS 变量变了要重读并重绘
watch(() => colorMode.value, () => {
  palette.value = readPalette()
  render()
})
</script>

<template>
  <div class="flex flex-col gap-3">
    <div
      ref="wrapper"
      class="relative mx-auto w-full max-w-[720px]"
    >
      <canvas
        ref="canvasEl"
        class="block w-full cursor-pointer rounded-lg outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
        role="img"
        tabindex="0"
        :aria-label="ariaLabel"
        :data-slots="layout.slots.length"
        :data-renders="renderCount"
        :data-selected="store.selectedPosition ?? ''"
        :data-kind="layout.meta.kind"
        @mousemove="onMouseMove"
        @mouseleave="hover = null"
        @click="onClick"
        @keydown="onKeydown"
      />
      <p aria-live="polite" class="sr-only">
        {{ liveMessage }}
      </p>

      <!-- 悬停提示（HTML 覆盖层，文字不受画布分辨率影响） -->
      <div
        v-if="hover && hoveredPin"
        class="border-border bg-popover text-popover-foreground pointer-events-none absolute z-20 w-56 rounded-md border px-3 py-2 text-xs shadow-md"
        :style="{ left: `${hover.x + 12}px`, top: `${hover.y + 12}px` }"
      >
        <p class="font-medium">
          {{ hoveredPin.position }} · {{ hoveredPin.name }}
        </p>
        <p class="text-muted-foreground">
          {{ PIN_TYPE_LABEL[hoveredPin.type] }} · {{ hoveredPin.pad }}
        </p>
        <ul v-if="hoveredPin.functions.length" class="mt-1 space-y-0.5">
          <li v-for="fn in hoveredPin.functions.slice(0, 3)" :key="`${fn.peripheral}_${fn.signal}`">
            {{ fn.peripheral }}<span class="text-muted-foreground"> · {{ functionLabel(fn) }}</span>
          </li>
          <li v-if="hoveredPin.functions.length > 3" class="text-muted-foreground">
            还有 {{ hoveredPin.functions.length - 3 }} 个…
          </li>
        </ul>
      </div>
    </div>

    <!-- 图例（点击过滤） -->
    <div class="flex flex-wrap items-center gap-1.5">
      <button
        v-for="type in PIN_TYPE_ORDER"
        :key="type"
        type="button"
        class="text-muted-foreground hover:text-foreground flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] transition-colors"
        :class="cn(activeType === type && 'bg-accent text-accent-foreground', PIN_TYPE_TEXT[type])"
        @click="activeType = activeType === type ? null : type"
      >
        <span class="size-2 rounded-full border" :class="PIN_TYPE_TEXT[type]" />
        {{ PIN_TYPE_LABEL[type] }}
        <span class="tabular-nums">{{ typeCount.get(type) ?? 0 }}</span>
      </button>
    </div>

    <div class="text-muted-foreground space-y-0.5 text-[11px]">
      <p>{{ strings.disclaimer }}</p>
      <p v-if="layout.meta.kind === 'grid'">
        {{ strings.gridViewNote }}
      </p>
      <p v-for="warning in layout.meta.warnings" :key="warning" class="text-destructive">
        {{ strings.layoutWarning }}：{{ warning }}
      </p>
    </div>
  </div>
</template>
