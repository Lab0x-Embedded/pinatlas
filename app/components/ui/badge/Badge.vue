<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import type { BadgeVariants } from './variants'
import { cn } from '~/lib/utils'
import { badgeVariants } from './variants'

const props = withDefaults(defineProps<{
  variant?: BadgeVariants['variant']
  class?: HTMLAttributes['class']
}>(), {
  variant: 'default',
})
</script>

<template>
  <span
    :class="cn(badgeVariants({ variant: props.variant }), props.class)"
    data-slot="badge"
  >
    <slot />
  </span>
</template>
