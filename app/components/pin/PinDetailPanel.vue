<script setup lang="ts">
import { strings } from '~/constants/strings'
import { afLabel, FUNCTION_TYPE_LABEL, functionLabel, groupFunctions, PIN_TYPE_LABEL, pinAliases, pinPrimary } from '~/utils/pin-types'

const store = useChipsStore()

const pin = computed(() => store.selectedPin)
const groups = computed(() => (pin.value ? groupFunctions(pin.value.functions) : []))
const variantTabs = computed(() => [{ key: null as string | null, label: strings.baseVariant }, ...store.variantsAvailable.map(key => ({ key, label: key }))])

/** 分组的技能大类：取该组第一个带 type 的功能（v1.1.0 起数据里有） */
function functionTypeOf(group: { functions: { type?: string }[] }) {
  return group.functions.find(fn => fn.type)?.type ?? ''
}

function variantOf(position: string, key: string | null) {
  if (!key) {
    return null
  }
  return store.chip?.pins.find(p => p.position === position)?.variants?.[key] ?? null
}
</script>

<template>
  <Card class="gap-3 py-3">
    <CardHeader v-if="pin" class="gap-1">
      <CardTitle class="flex items-center gap-2 text-base">
        <span class="tabnum">{{ pin.position }}</span>
        <span class="truncate">{{ pinPrimary(pin) }}</span>
      </CardTitle>
      <CardDescription class="space-y-1">
        <span class="block">
          pin <span class="tabular-nums">{{ pin.position }}</span> · {{ PIN_TYPE_LABEL[pin.type] }}
        </span>
        <span v-if="pinAliases(pin).length" class="block">
          别名 {{ pinAliases(pin).join(' / ') }}
        </span>
        <span v-if="pin.variantOf" class="block">
          重映射标注 {{ pin.variantOf }}
        </span>
        <span v-if="pin.name !== pinPrimary(pin)" class="text-muted-foreground block font-mono text-[11px]">
          上游原名 {{ pin.name }}
        </span>
      </CardDescription>
    </CardHeader>

    <!-- 未选中引脚的空态：做成居中的图标 + 一行说明，比"卡片里孤零零一行字"体面得多 -->
    <CardContent v-else class="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <svg class="text-muted-foreground/50 size-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <rect x="7" y="7" width="10" height="10" rx="2" />
        <path d="M4 10h3M4 14h3M17 10h3M17 14h3M10 4v3M14 4v3M10 17v3M14 17v3" />
      </svg>
      <p class="text-sm font-medium">
        {{ strings.selectPin }}
      </p>
      <p class="text-muted-foreground text-xs">
        {{ strings.selectPinHint }}
      </p>
    </CardContent>

    <CardContent v-if="pin" class="space-y-3">
      <div class="flex flex-wrap gap-1">
        <Badge variant="secondary">
          {{ PIN_TYPE_LABEL[pin.type] }}
        </Badge>
        <Badge v-if="pin.osc" variant="outline">
          晶振 / 时钟
        </Badge>
        <Badge v-if="!store.hasAfData" variant="outline" class="text-muted-foreground">
          无 AF 数据
        </Badge>
      </div>

      <Tabs :default-value="variantTabs[0]?.key ?? 'base'">
        <!-- 变体名可能很长（PINREMAP_10_12 …）：容器可横向滚动 + 小字号，避免在 340px 右栏被挤破 -->
        <TabsList class="w-full justify-start overflow-x-auto">
          <TabsTrigger
            v-for="tab in variantTabs"
            :key="tab.key ?? 'base'"
            :value="tab.key ?? 'base'"
            class="px-2 text-xs"
            @click="store.setVariant(tab.key)"
          >
            {{ tab.label }}
          </TabsTrigger>
        </TabsList>

        <TabsContent v-for="tab in variantTabs" :key="tab.key ?? 'base'" :value="tab.key ?? 'base'" class="mt-3 space-y-3">
          <template v-if="tab.key && variantOf(pin.position, tab.key)">
            <p class="text-muted-foreground text-xs">
              {{ variantOf(pin.position, tab.key)?.primary ?? variantOf(pin.position, tab.key)?.name }} ·
              {{ PIN_TYPE_LABEL[variantOf(pin.position, tab.key)!.type] }}
            </p>
          </template>
          <p v-else-if="tab.key" class="text-muted-foreground text-xs">
            {{ strings.variantNone }}
          </p>

          <p v-if="pin.functions.length === 0" class="text-muted-foreground text-xs">
            该引脚没有复用功能（电源 / 地 / 复位类引脚）。
          </p>

          <div v-for="group in groups" :key="group.peripheral" class="space-y-1">
            <div class="flex items-center gap-2">
              <span class="text-xs font-medium">{{ group.peripheral }}</span>
              <Badge v-if="group.exti" variant="outline" class="text-[10px]">
                {{ FUNCTION_TYPE_LABEL.exti }}
              </Badge>
              <Badge v-else-if="group.system" variant="outline" class="text-[10px]">
                {{ strings.systemGroup }}
              </Badge>
              <span v-else-if="FUNCTION_TYPE_LABEL[functionTypeOf(group)]" class="text-muted-foreground text-[10px]">
                {{ FUNCTION_TYPE_LABEL[functionTypeOf(group)] }}
              </span>
            </div>
            <p v-if="group.exti" class="text-muted-foreground text-[11px]">
              {{ strings.extiHint }}
            </p>
            <ul class="space-y-0.5">
              <li
                v-for="fn in group.functions"
                :key="`${group.peripheral}_${fn.signal}`"
                class="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-xs hover:bg-accent/50"
              >
                <span class="truncate">{{ functionLabel(fn) }}</span>
                <span
                  class="text-muted-foreground shrink-0 font-mono text-[11px] tabular-nums"
                  :title="fn.type === 'exti' ? strings.afExtiNone : fn.af === null ? strings.afUnknown : `AF${fn.af}`"
                >{{ afLabel(fn) }}</span>
              </li>
            </ul>
          </div>

          <p v-if="!store.hasAfData" class="text-muted-foreground text-[11px]">
            {{ strings.afUnknown }}
          </p>
        </TabsContent>
      </Tabs>
    </CardContent>
  </Card>
</template>
