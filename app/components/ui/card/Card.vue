<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '~/lib/utils'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <div
    :class="cn('bg-card text-card-foreground flex flex-col gap-4 rounded-xl border py-4 shadow-sm', props.class)"
    data-slot="card"
  >
    <slot />
  </div>
</template>
