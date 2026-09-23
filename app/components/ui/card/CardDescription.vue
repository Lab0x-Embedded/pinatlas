<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '~/lib/utils'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <p :class="cn('text-muted-foreground text-xs', props.class)" data-slot="card-description">
    <slot />
  </p>
</template>
