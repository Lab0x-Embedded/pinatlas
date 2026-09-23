<script setup lang="ts">
import type { ChipDoc } from '~/types/pinatlas'
import { strings } from '~/constants/strings'

const props = defineProps<{ chip: ChipDoc }>()

const rows = computed(() => {
  const doc = props.chip
  const out: { label: string, value: string }[] = [
    { label: '封装', value: doc.package ?? '-' },
    { label: strings.pins, value: String(doc.pinCount ?? '-') },
    { label: 'die', value: doc.die ?? '-' },
  ]
  if (doc.memory?.flashKb != null) {
    out.push({ label: strings.flash, value: `${doc.memory.flashKb} KB` })
  }
  if (doc.memory?.ramKb != null) {
    out.push({ label: strings.ram, value: `${doc.memory.ramKb} KB` })
  }
  if (doc.memory?.ioCount != null) {
    out.push({ label: strings.ioCount, value: String(doc.memory.ioCount) })
  }
  return out
})

const upstream = computed(() => props.chip.source?.primary?.ref?.slice(0, 10) ?? null)
</script>

<template>
  <Card class="gap-3 py-3">
    <CardHeader class="gap-1">
      <CardTitle class="text-base">
        {{ chip.displayName }}
      </CardTitle>
      <CardDescription>
        {{ chip.vendor }} · {{ chip.family }} / {{ chip.line }}
      </CardDescription>
    </CardHeader>
    <CardContent class="space-y-2">
      <dl class="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <template v-for="row in rows" :key="row.label">
          <dt class="text-muted-foreground">
            {{ row.label }}
          </dt>
          <dd class="text-right font-medium tabular-nums">
            {{ row.value }}
          </dd>
        </template>
      </dl>

      <template v-if="chip.parts?.length">
        <Separator />
        <div class="space-y-1">
          <p class="text-muted-foreground text-[11px] font-medium">
            {{ strings.parts }}
          </p>
          <div class="flex flex-wrap gap-1">
            <Badge
              v-for="part in chip.parts.slice(0, 4)"
              :key="part.mpn"
              variant="outline"
              class="font-mono text-[10px]"
            >
              {{ part.mpn }}<span v-if="part.status" class="text-muted-foreground">· {{ part.status }}</span>
            </Badge>
          </div>
        </div>
      </template>

      <p v-if="upstream" class="text-muted-foreground text-[10px] break-all">
        {{ chip.source?.primary?.repo }}@{{ upstream }}
      </p>
    </CardContent>
  </Card>
</template>
