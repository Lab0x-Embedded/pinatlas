<script setup lang="ts">
import type { PinSlot } from '~/utils/package-layout'
import { strings } from '~/constants/strings'
import { cn } from '~/lib/utils'
import { bodyRect, layoutPackage, VIEW } from '~/utils/package-layout'
import { functionLabel, PIN_TYPE_FILL, PIN_TYPE_LABEL, PIN_TYPE_ORDER, PIN_TYPE_TEXT } from '~/utils/pin-types'

const store = useChipsStore()

const layout = computed(() => layoutPackage({
  kind: store.chip?.packageKind ?? 'unknown',
  pins: store.effectivePins,
}))

const pinsByPosition = computed(() => new Map(store.effectivePins.map(pin => [pin.position, pin])))

const activeType = ref<string | null>(null)
const container = ref<HTMLElement | null>(null)
const hover = ref<{ position: string, x: number, y: number } | null>(null)

const pinnedPosition = computed(() => store.selectedPosition)

const perSide = computed(() => layout.value.meta.pinsPerSide ?? 0)
/** 引脚密时只标引脚号，pad 名交给 tooltip（docs/04-ui-design.md §5） */
const showPadLabels = computed(() =>
  layout.value.meta.kind === 'grid'
    ? false
    : perSide.value <= 24)

const typeCount = computed(() => {
  const counts = new Map<string, number>()
  for (const pin of store.effectivePins) {
    counts.set(pin.type, (counts.get(pin.type) ?? 0) + 1)
  }
  return counts
})

function pinClass(slot: PinSlot) {
  const pin = pinsByPosition.value.get(slot.position)
  if (!pin) {
    return PIN_TYPE_FILL.other
  }
  const dim = activeType.value && activeType.value !== pin.type ? 'opacity-25' : ''
  const nc = pin.type === 'nc' ? '[stroke-dasharray:6_4]' : ''
  return cn(PIN_TYPE_FILL[pin.type], dim, nc)
}

function labelStyle(slot: PinSlot) {
  switch (slot.side) {
    case 'left':
      return {
        number: { x: slot.x - 8, y: slot.cy + 7, anchor: 'end' as const },
        pad: { x: bodyRect.x + 10, y: slot.cy + 7, anchor: 'start' as const },
      }
    case 'right':
      return {
        number: { x: slot.x + slot.w + 8, y: slot.cy + 7, anchor: 'start' as const },
        pad: { x: bodyRect.x + bodyRect.width - 10, y: slot.cy + 7, anchor: 'end' as const },
      }
    case 'top':
      return {
        number: { x: slot.cx, y: slot.y - 8, anchor: 'middle' as const },
        pad: { x: slot.cx, y: bodyRect.y + 30, anchor: 'middle' as const },
      }
    default:
      return {
        number: { x: slot.cx, y: slot.y + slot.h + 30, anchor: 'middle' as const },
        pad: { x: slot.cx, y: bodyRect.y + bodyRect.height - 12, anchor: 'middle' as const },
      }
  }
}

function onEnter(position: string, event: MouseEvent) {
  const rect = container.value?.getBoundingClientRect()
  hover.value = rect
    ? { position, x: event.clientX - rect.left, y: event.clientY - rect.top }
    : { position, x: 0, y: 0 }
}

function onMove(event: MouseEvent) {
  const rect = container.value?.getBoundingClientRect()
  if (hover.value && rect) {
    hover.value = { ...hover.value, x: event.clientX - rect.left, y: event.clientY - rect.top }
  }
}

const hoveredPin = computed(() => (hover.value ? pinsByPosition.value.get(hover.value.position) : null))
</script>

<template>
  <div class="flex flex-col gap-3">
    <div
      ref="container"
      class="relative mx-auto w-full max-w-[720px]"
      @mousemove="onMove"
      @mouseleave="hover = null"
    >
      <svg
        :viewBox="`0 0 ${VIEW} ${VIEW}`"
        class="h-auto w-full select-none"
        role="img"
        :aria-label="`${store.chip?.package} 引脚图，共 ${store.effectivePins.length} 脚`"
      >
        <!-- 封装本体 -->
        <rect
          :x="bodyRect.x"
          :y="bodyRect.y"
          :width="bodyRect.width"
          :height="bodyRect.height"
          rx="16"
          class="fill-muted/40 stroke-border"
          stroke-width="3"
        />
        <!-- pin 1 标记（左上角，与数据手册一致：俯视逆时针） -->
        <circle :cx="bodyRect.x + 34" :cy="bodyRect.y + 34" r="11" class="fill-foreground" />

        <g
          v-for="slot in layout.slots"
          :key="slot.position"
          class="cursor-pointer outline-none"
          role="button"
          tabindex="0"
          :aria-label="`引脚 ${slot.position}`"
          @click="store.selectPin(slot.position)"
          @keydown.enter.prevent="store.selectPin(slot.position)"
          @keydown.space.prevent="store.selectPin(slot.position)"
          @mouseenter="onEnter(slot.position, $event)"
          @focus="store.selectPin(slot.position)"
        >
          <rect
            v-if="slot.shape === 'rect'"
            :x="slot.x"
            :y="slot.y"
            :width="slot.w"
            :height="slot.h"
            rx="3"
            stroke-width="2"
            :class="pinClass(slot)"
          />
          <circle
            v-else
            :cx="slot.cx"
            :cy="slot.cy"
            :r="slot.w / 2"
            stroke-width="2"
            :class="pinClass(slot)"
          />
          <!-- 选中态 -->
          <rect
            v-if="pinnedPosition === slot.position"
            :x="slot.x - 5"
            :y="slot.y - 5"
            :width="slot.w + 10"
            :height="slot.h + 10"
            rx="5"
            class="fill-none stroke-ring"
            stroke-width="3"
          />

          <template v-if="slot.side">
            <text
              :x="labelStyle(slot).number.x"
              :y="labelStyle(slot).number.y"
              :text-anchor="labelStyle(slot).number.anchor"
              class="fill-muted-foreground text-[26px] tabular-nums"
            >{{ slot.position }}</text>
            <text
              v-if="showPadLabels"
              :x="labelStyle(slot).pad.x"
              :y="labelStyle(slot).pad.y"
              :text-anchor="labelStyle(slot).pad.anchor"
              class="fill-foreground text-[22px]"
            >{{ pinsByPosition.get(slot.position)?.pad }}</text>
          </template>
          <text
            v-else
            :x="slot.cx"
            :y="slot.cy + 7"
            text-anchor="middle"
            class="fill-foreground text-[20px] tabular-nums"
          >{{ slot.position }}</text>
        </g>
      </svg>

      <!-- 悬停提示 -->
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

    <!-- 图例（可点击过滤） -->
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
