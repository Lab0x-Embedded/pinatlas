<script setup lang="ts">
import { strings } from '~/constants/strings'
import { cn } from '~/lib/utils'

const store = useChipsStore()
</script>

<template>
  <div v-if="store.sameDieChips.length" class="space-y-1.5">
    <p class="text-muted-foreground text-[11px] font-medium">
      {{ strings.sameDie }}（{{ store.chip?.die }}）
    </p>
    <div class="flex flex-wrap gap-1">
      <Button
        v-for="entry in store.sameDieChips"
        :key="entry.chip"
        :class="cn('h-7 font-normal')"
        size="sm"
        variant="outline"
        @click="store.selectChip(entry.chip, { keepPin: true })"
      >
        {{ entry.package }}<span class="text-muted-foreground">·{{ entry.pinCount }}脚</span>
      </Button>
    </div>
  </div>
</template>
