<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '~/lib/utils'

const props = withDefaults(defineProps<{
  variant?: 'default' | 'destructive'
  class?: HTMLAttributes['class']
}>(), {
  variant: 'default',
})
</script>

<template>
  <div
    :class="cn(
      'relative w-full rounded-lg border px-4 py-3 text-sm grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-0.5 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current',
      props.variant === 'destructive'
        ? 'text-destructive bg-card [&>svg]:text-current *:data-[slot=alert-description]:text-destructive/90'
        : 'bg-card text-card-foreground',
      props.class,
    )"
    data-slot="alert"
  >
    <slot />
  </div>
</template>
