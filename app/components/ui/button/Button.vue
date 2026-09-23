<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import type { ButtonVariants } from './variants'
import { cn } from '~/lib/utils'
import { buttonVariants } from './variants'

const props = withDefaults(defineProps<{
  variant?: ButtonVariants['variant']
  size?: ButtonVariants['size']
  class?: HTMLAttributes['class']
}>(), {
  variant: 'default',
  size: 'default',
})
</script>

<template>
  <button
    :class="cn(buttonVariants({ variant: props.variant, size: props.size }), props.class)"
    data-slot="button"
  >
    <slot />
  </button>
</template>
