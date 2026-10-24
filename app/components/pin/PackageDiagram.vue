<script setup lang="ts">
import type { Pin } from '~/types/pinatlas'
import type { PinSide, PinSlot } from '~/utils/package-layout'
import type { PinCategoryId } from '~/utils/pin-categories'
import { strings } from '~/constants/strings'
import { cn } from '~/lib/utils'
import { fitText, labelPolicy, numberLabelBox, padLabelBox, rotateTransform } from '~/utils/label-policy'
import { bodyRect, layoutPackage, sortedRowLabels, VIEW } from '~/utils/package-layout'
import { categoryCounts, matchesCategory } from '~/utils/pin-categories'
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

/**
 * 整图旋转（0/90/180/270，按 90° 步进）：几何绕图心旋转，**标签跟着边走但永不倒立**。
 * 做法：把每个槽位的几何按角度旋转、把 side 映射到旋转后的边，然后标签（引脚名/引脚号）
 * 按"旋转后的边"用 label-policy 原生排版。转完的图与"原生就按该朝向画的"逐像素一致：
 * 左右边横排、上下边竖排（rotate −90），任何角度都可读。旋转只影响视图，
 * 不进 URL/不持久化，切型号不重置。
 */
const rotation = ref(0)
function rotateDiagram() {
  rotation.value = (rotation.value + 90) % 360
}
/** 焦点在图内时按 R 旋转（搜索框在图外，不冲突；带修饰键的组合如 ⌘R 不抢） */
function onDiagramKeydown(event: KeyboardEvent) {
  if (event.key.toLowerCase() === 'r' && !event.metaKey && !event.ctrlKey && !event.altKey) {
    rotateDiagram()
  }
}

const CENTER = VIEW / 2
/** 顺时针 90° 后各边落到哪（SVG y 向下，rotate(+90) = 屏幕顺时针） */
const SIDE_CW: Record<PinSide, PinSide> = { left: 'top', top: 'right', right: 'bottom', bottom: 'left' }

function pointAfter(x: number, y: number): [number, number] {
  switch (rotation.value) {
    case 90: return [CENTER * 2 - y, x]
    case 180: return [CENTER * 2 - x, CENTER * 2 - y]
    case 270: return [y, CENTER * 2 - x]
    default: return [x, y]
  }
}

/** side 经 N 次 90° 顺时针后的落点边 */
function sideAfter(side: PinSide): PinSide {
  let mapped = side
  for (let step = rotation.value / 90; step > 0; step--) {
    mapped = SIDE_CW[mapped]
  }
  return mapped
}

/** 槽位几何按角度旋转（矩形重排左上角与宽高；圆只有圆心，r 不变），side 换到落点边 */
function slotAfter(slot: PinSlot): PinSlot {
  if (!rotation.value) {
    return slot
  }
  const [cx, cy] = pointAfter(slot.cx, slot.cy)
  let x = 0
  let y = 0
  let w = slot.w
  let h = slot.h
  switch (rotation.value) {
    case 90:
      x = CENTER * 2 - (slot.y + slot.h)
      y = slot.x
      w = slot.h
      h = slot.w
      break
    case 180:
      x = CENTER * 2 - (slot.x + slot.w)
      y = CENTER * 2 - (slot.y + slot.h)
      break
    default:
      x = slot.y
      y = CENTER * 2 - (slot.x + slot.w)
      w = slot.h
      h = slot.w
      break
  }
  return { ...slot, x, y, w, h, cx, cy, side: slot.side ? sideAfter(slot.side) : undefined }
}

const layout = computed(() => layoutPackage({
  kind: store.chip?.packageKind ?? 'unknown',
  pins: store.effectivePins,
}))

/** 旋转后的槽位（块/球/文字都从这份渲染） */
const slotsView = computed(() => layout.value.slots.map(slotAfter))

/** pin 1 圆点跟着转（判断朝向的锚点，必须与几何一致） */
const pin1Dot = computed(() => pointAfter(bodyRect.x + 34, bodyRect.y + 34))

const pinsByPosition = computed(() => new Map(store.effectivePins.map(pin => [pin.position, pin])))

const activeType = ref<string | null>(null)
/** 功能类别过滤（图上方那排：GND / UART / I2C …）；'all' = 不过滤 */
const activeCategory = ref<PinCategoryId>('all')
const categories = computed(() => categoryCounts(store.effectivePins))
const categoryActive = computed(() => activeCategory.value !== 'all')
const container = ref<HTMLElement | null>(null)
const hover = ref<{ position: string, x: number, y: number } | null>(null)

const pinnedPosition = computed(() => store.selectedPosition)

/** 搜索与类别过滤不要同时淡化两套，否则"哪些是命中"读不出来：搜索优先 */
function isDimmed(pin: Pin) {
  if (store.pinSearchActive) {
    return !store.pinHitPositions.has(pin.position)
  }
  return Boolean(activeType.value && activeType.value !== pin.type)
    || (categoryActive.value && !matchesCategory(pin, activeCategory.value))
}

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

/** 坐标头锚点类型按"锚点所在的边"取：左右两端朝外延伸（end/start），上下居中（middle） */
const HEADER_ANCHOR: Record<PinSide, 'start' | 'middle' | 'end'> = {
  left: 'end',
  right: 'start',
  top: 'middle',
  bottom: 'middle',
}

/**
 * 网格坐标头（旋转感知）：先按原始位置算锚点，再随整图旋转锚点、按落点边换锚点类型，
 * 文字本身保持水平（单个字母/数字，竖排反而难读）。
 */
const axisHeaders = computed(() => {
  if (layout.value.meta.kind !== 'grid') {
    return []
  }
  const font = policy.value.axisFont
  const entries: Array<{ key: string, text: string, x: number, y: number, anchor: 'start' | 'middle' | 'end' }> = []
  const push = (key: string, text: string, x: number, y: number, side: PinSide) => {
    // 锚点带原始的基线偏移随图旋转；文字保持水平，锚点类型按旋转后落点所在的边取
    const [rx, ry] = pointAfter(x, y)
    entries.push({ key, text, x: rx, y: ry, anchor: HEADER_ANCHOR[sideAfter(side)] })
  }
  for (const label of rowLabels.value) {
    const cy = rowCenters.value.get(label) ?? 0
    push(`row-${label}`, label, bodyRect.x - 12, cy + font * 0.35, 'left')
    push(`row-r-${label}`, label, bodyRect.x + bodyRect.width + 12, cy + font * 0.35, 'right')
  }
  for (const col of colNumbers.value) {
    const cx = colCenters.value.get(col) ?? 0
    push(`col-${col}`, String(col), cx, bodyRect.y - font * 0.4, 'top')
    push(`col-b-${col}`, String(col), cx, bodyRect.y + bodyRect.height + font * 1.15, 'bottom')
  }
  return entries
})

function pinClass(slot: PinSlot) {
  const pin = pinsByPosition.value.get(slot.position)
  if (!pin) {
    return PIN_TYPE_FILL.other
  }
  // 两套过滤（引脚类型 / 功能类别）互斥生效，避免同时淡化造成误读；
  // 搜索优先于这两者（见 isDimmed）
  const dimmed = isDimmed(pin)
  const dim = dimmed ? 'opacity-25' : ''
  // 类别过滤 / 引脚搜索时把命中的引脚描边加粗，淡化之外还有一层正反馈
  const emphasis = !dimmed && (categoryActive.value || store.pinSearchActive) ? 'stroke-[3.5]' : ''
  const nc = pin.type === 'nc' ? '[stroke-dasharray:6_4]' : ''
  return cn(PIN_TYPE_FILL[pin.type], dim, emphasis, nc)
}

/** 点类别：再点一次取消；同时清掉类型过滤（两者互斥） */
function toggleCategory(id: PinCategoryId) {
  activeCategory.value = activeCategory.value === id ? 'all' : id
  activeType.value = null
}

/** 点类型图例：再点一次取消；同时清掉类别过滤 */
function toggleType(type: string) {
  activeType.value = activeType.value === type ? null : type
  activeCategory.value = 'all'
}

function isCategoryActive(id: PinCategoryId) {
  return id === 'all' ? !categoryActive.value : activeCategory.value === id
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
  `${store.chip?.package ?? ''} 引脚图，共 ${store.effectivePins.length} 脚${rotation.value ? `，已旋转 ${rotation.value}°` : ''}`)
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- 功能类别过滤：点一下高亮对应引脚（命中加粗、其余淡化），再点取消；计数 0 的禁用不隐藏 -->
    <div class="flex flex-wrap items-center gap-1.5">
      <Button
        v-for="category in categories"
        :key="category.id"
        type="button"
        :variant="isCategoryActive(category.id) ? 'default' : 'outline'"
        :disabled="category.disabled"
        :title="category.hint"
        class="h-6 gap-1 px-2 text-[11px] font-normal"
        @click="toggleCategory(category.id)"
      >
        {{ category.label }}
        <span class="opacity-70 tabular-nums">{{ category.count }}</span>
      </Button>

      <div
        ref="container"
        class="relative mx-auto w-full max-w-[860px]"
        @mousemove="onMove"
        @mouseleave="hover = null"
        @keydown="onDiagramKeydown"
      >
        <!-- 旋转：90° 步进循环；焦点在图内时也可按 R -->
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          class="absolute top-2 right-2 z-10 rounded-full bg-background/80 backdrop-blur"
          :title="`${strings.rotateDiagram}${rotation ? `（当前 ${rotation}°）` : ''}`"
          :aria-label="strings.rotateDiagram"
          @click="rotateDiagram"
        >
          <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
        </Button>
        <svg
          :viewBox="`0 0 ${VIEW} ${VIEW}`"
          class="h-auto w-full select-none"
          role="img"
          :aria-label="ariaLabel"
          :data-slots="layout.slots.length"
          :data-kind="layout.meta.kind"
          :data-number-font="policy.numberFont.toFixed(1)"
        >
          <!-- 封装本体（正方形居中，90° 步进旋转下形状不变） -->
          <rect
            :x="bodyRect.x"
            :y="bodyRect.y"
            :width="bodyRect.width"
            :height="bodyRect.height"
            rx="16"
            class="fill-muted/40 stroke-border"
            stroke-width="3"
          />
          <!-- pin 1 标记（随整图旋转：它是朝向的锚点） -->
          <circle :cx="pin1Dot[0]" :cy="pin1Dot[1]" r="11" class="fill-foreground" />

          <!-- 本体中心的丝印：型号 + 封装/引脚数。跟着芯片一起转（实物丝印就印在顶面） -->
          <g
            v-if="centerMark"
            text-anchor="middle"
            :transform="rotation ? `rotate(${rotation} ${centerMark.x} ${centerMark.titleY})` : undefined"
            :data-center="centerMark.title"
          >
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

          <!-- 网格封装的外围坐标头：锚点随图旋转、文字保持水平（axisHeaders 已按落点边选好锚点类型） -->
          <g v-if="layout.meta.kind === 'grid'" class="fill-muted-foreground">
            <text
              v-for="header in axisHeaders"
              :key="header.key"
              :x="header.x"
              :y="header.y"
              :text-anchor="header.anchor"
              :font-size="policy.axisFont"
            >{{ header.text }}</text>
          </g>

          <g
            v-for="slot in slotsView"
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
        <Button
          v-for="type in PIN_TYPE_ORDER"
          :key="type"
          type="button"
          :variant="activeType === type ? 'default' : 'outline'"
          :class="cn('h-6 gap-1 px-2 text-[11px] font-normal', activeType === type ? '' : PIN_TYPE_TEXT[type])"
          @click="toggleType(type)"
        >
          <span class="size-2 rounded-full border" :class="PIN_TYPE_TEXT[type]" />
          {{ PIN_TYPE_LABEL[type] }}
          <span class="opacity-70 tabular-nums">{{ typeCount.get(type) ?? 0 }}</span>
        </Button>
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
  </div>
</template>
