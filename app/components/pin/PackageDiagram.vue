<script setup lang="ts">
import type { PinSlot } from '~/utils/package-layout'
import { strings } from '~/constants/strings'
import { cn } from '~/lib/utils'
import { fitText, labelPolicy, numberLabelBox, padLabelBox, rotateTransform } from '~/utils/label-policy'
import { bodyRect, layoutPackage, sortedRowLabels, VIEW } from '~/utils/package-layout'
import { functionLabel, PIN_TYPE_FILL, PIN_TYPE_LABEL, PIN_TYPE_ORDER, PIN_TYPE_TEXT, pinAliases, pinPrimary } from '~/utils/pin-types'

/**
 * 引脚图：SVG。
 *
 * 为什么最终选 SVG（Canvas 试过又回退，见 docs/07 §14）：
 *   - 元素量级只有几百（最大 19×19 = 361 球），SVG 性能完全够；
 *   - 每个引脚天然是独立 DOM 节点 → 命中、悬停、Tab 聚焦、键盘选中、屏幕阅读器都白拿；
 *   - 颜色走 Tailwind class + CSS 变量 → 明暗主题切换不用重绘；
 *   - 文字由浏览器排版（清晰、可选中、可缩放）；矢量导出以后直接可用。
 * Canvas 版把这些全部改成手工实现（几何反查命中、方向键导航、aria-live 播报、绘制时读色重绘），
 * 而且每次悬停要重画整幅，反而更卡。
 *
 * 唯一从 Canvas 版保留下来的东西：**字号策略**（utils/label-policy.ts）。按行距/格子反推字号，
 * 密引脚时自动缩小，放不下就干脆不画（原来写死 26/22 单位，LQFP100 会整片压叠）。
 */
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
const showPadLabels = computed(() => (layout.value.meta.kind === 'grid' ? false : perSide.value <= 24))

const policy = computed(() => labelPolicy({
  meta: layout.value.meta,
  body: bodyRect,
  slots: layout.value.slots,
  showPadLabels: showPadLabels.value,
}))

/** 网格行标（物理顺序）：A…Z 里跳过 JEDEC 保留字母，已按 (前缀, 字母序) 排好 */
const rowLabels = computed(() => layout.value.meta.kind === 'grid'
  ? sortedRowLabels(store.effectivePins.map(pin => pin.position))
  : [])

const colNumbers = computed(() => {
  const cols = layout.value.meta.cols ?? 0
  return Array.from({ length: cols }, (_, i) => i + 1)
})

const typeCount = computed(() => {
  const counts = new Map<string, number>()
  for (const pin of store.effectivePins) {
    counts.set(pin.type, (counts.get(pin.type) ?? 0) + 1)
  }
  return counts
})

/** 球心 / 行标 / 列标的坐标：从 slots 反查，避免再算一遍网格 */
const colCenters = computed(() => {
  const map = new Map<number, number>()
  for (const slot of layout.value.slots) {
    map.set(Number(/(\d+)$/.exec(slot.position)?.[1] ?? 0), slot.cx)
  }
  return map
})

const rowCenters = computed(() => {
  const map = new Map<string, number>()
  for (const slot of layout.value.slots) {
    map.set(slot.position.replace(/\d+$/, ''), slot.cy)
  }
  return map
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

/** pad 名写在块里（块内垂直居中）；引脚号在块外侧，方向与同一条边的 pad 名一致 */
const padStyle = (slot: PinSlot) => padLabelBox(slot, policy.value.padFont)
const numStyle = (slot: PinSlot) => numberLabelBox(slot, policy.value.numberFont)

/**
 * 本体中心的"丝印"：型号 + 封装/引脚数（实物芯片顶面就是这么印的）。
 * 名字搬进引脚块后本体内侧空出来了，这里正好放它；字号按型号长度和本体宽反推。
 * 网格封装不放（球阵铺满本体，会与丝印互相盖住）。
 */
const centerMark = computed(() => {
  const doc = store.chip
  if (!doc || layout.value.meta.kind === 'grid') {
    return null
  }
  const title = doc.chip
  const titleFont = Math.max(12, Math.min((bodyRect.width * 0.72) / Math.max(1, title.length * 0.58), 44))
  const centerY = bodyRect.y + bodyRect.height / 2
  return {
    title,
    subtitle: `${doc.package} · ${doc.pinCount} 脚`,
    x: bodyRect.x + bodyRect.width / 2,
    titleFont,
    subtitleFont: Math.max(9, titleFont * 0.46),
    titleY: centerY - titleFont * 0.15,
    subtitleY: centerY + titleFont * 0.85,
  }
})

/** 图上只画主名（v1.1.0 的 primary；旧数据现场拆分），别名与变体标注交给 hover / Inspector */
function padText(slot: PinSlot) {
  const pin = pinsByPosition.value.get(slot.position)
  if (!pin) {
    return ''
  }
  // 名字写在块里，可用的就是块长（超了截断；引脚号仍在块外侧，两者不会混）
  return fitText(pinPrimary(pin), policy.value.padMaxLength, policy.value.padFont)
}

function slotLabel(slot: PinSlot) {
  const pin = pinsByPosition.value.get(slot.position)
  return pin ? pinPrimary(pin) : slot.position
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

const ariaLabel = computed(() =>
  `${store.chip?.package ?? ''} 引脚图，共 ${store.effectivePins.length} 脚`)
</script>

<template>
  <div class="flex flex-col gap-3">
    <div
      ref="container"
      class="relative mx-auto w-full max-w-[860px]"
      @mousemove="onMove"
      @mouseleave="hover = null"
    >
      <svg
        :viewBox="`0 0 ${VIEW} ${VIEW}`"
        class="h-auto w-full select-none"
        role="img"
        :aria-label="ariaLabel"
        :data-slots="layout.slots.length"
        :data-kind="layout.meta.kind"
        :data-number-font="policy.numberFont.toFixed(1)"
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

        <!-- 本体中心的丝印：型号 + 封装/引脚数（与实物芯片顶面一致；网格封装的球会盖住，不放） -->
        <g v-if="centerMark" text-anchor="middle" :data-center="centerMark.title">
          <text
            :x="centerMark.x"
            :y="centerMark.titleY"
            :font-size="centerMark.titleFont"
            class="fill-muted-foreground/70 font-medium"
          >{{ centerMark.title }}</text>
          <text
            :x="centerMark.x"
            :y="centerMark.subtitleY"
            :font-size="centerMark.subtitleFont"
            class="fill-muted-foreground/55"
          >{{ centerMark.subtitle }}</text>
        </g>

        <!-- 网格封装的外围坐标头：球号画不下时靠它读位置（BGA 数据手册也是这么标的） -->
        <g v-if="layout.meta.kind === 'grid'" class="fill-muted-foreground">
          <text
            v-for="label in rowLabels"
            :key="`row-${label}`"
            :x="bodyRect.x - 12"
            :y="(rowCenters.get(label) ?? 0) + policy.axisFont * 0.35"
            text-anchor="end"
            :font-size="policy.axisFont"
          >{{ label }}</text>
          <text
            v-for="label in rowLabels"
            :key="`row-r-${label}`"
            :x="bodyRect.x + bodyRect.width + 12"
            :y="(rowCenters.get(label) ?? 0) + policy.axisFont * 0.35"
            text-anchor="start"
            :font-size="policy.axisFont"
          >{{ label }}</text>
          <text
            v-for="col in colNumbers"
            :key="`col-${col}`"
            :x="colCenters.get(col) ?? 0"
            :y="bodyRect.y - policy.axisFont * 0.4"
            text-anchor="middle"
            :font-size="policy.axisFont"
          >{{ col }}</text>
          <text
            v-for="col in colNumbers"
            :key="`col-b-${col}`"
            :x="colCenters.get(col) ?? 0"
            :y="bodyRect.y + bodyRect.height + policy.axisFont * 1.15"
            text-anchor="middle"
            :font-size="policy.axisFont"
          >{{ col }}</text>
        </g>

        <g
          v-for="slot in layout.slots"
          :key="slot.position"
          class="cursor-pointer outline-none"
          role="button"
          tabindex="0"
          :data-position="slot.position"
          :aria-label="`引脚 ${slot.position} ${slotLabel(slot)}`"
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
              v-if="policy.showNumber"
              :x="numStyle(slot).x"
              :y="numStyle(slot).y"
              :text-anchor="numStyle(slot).anchor"
              :transform="rotateTransform(numStyle(slot))"
              :font-size="policy.numberFont"
              class="fill-muted-foreground tabular-nums"
            >{{ slot.position }}</text>
            <text
              v-if="policy.showPadName && padText(slot)"
              :x="padStyle(slot).x"
              :y="padStyle(slot).y"
              :text-anchor="padStyle(slot).anchor"
              :transform="rotateTransform(padStyle(slot))"
              :font-size="policy.padFont"
              class="fill-foreground"
            >{{ padText(slot) }}</text>
          </template>
          <text
            v-else-if="policy.showBallText"
            :x="slot.cx"
            :y="slot.cy + policy.ballFont * 0.35"
            text-anchor="middle"
            :font-size="policy.ballFont"
            class="fill-foreground tabular-nums"
          >{{ slot.position }}</text>
        </g>
      </svg>

      <!-- 悬停提示（只在进入引脚时更新，不跟随每一帧鼠标移动重排） -->
      <div
        v-if="hover && hoveredPin"
        class="border-border bg-popover text-popover-foreground pointer-events-none absolute z-20 w-56 rounded-md border px-3 py-2 text-xs shadow-md"
        :style="{ left: `${hover.x + 12}px`, top: `${hover.y + 12}px` }"
      >
        <p class="font-medium">
          {{ hoveredPin.position }} · {{ pinPrimary(hoveredPin) }}
        </p>
        <p class="text-muted-foreground">
          {{ PIN_TYPE_LABEL[hoveredPin.type] }}
          <template v-if="pinAliases(hoveredPin).length">
            · 别名 {{ pinAliases(hoveredPin).join(' / ') }}
          </template>
          <template v-if="hoveredPin.variantOf">
            · 重映射 {{ hoveredPin.variantOf }}
          </template>
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
