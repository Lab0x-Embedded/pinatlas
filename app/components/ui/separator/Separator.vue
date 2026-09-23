<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { Separator } from 'reka-ui'
import { cn } from '~/lib/utils'

const props = withDefaults(defineProps<{
  orientation?: 'horizontal' | 'vertical'
  decorative?: boolean
  class?: HTMLAttributes['class']
}>(), {
  orientation: 'horizontal',
  decorative: true,
})

const delegatedProps = reactiveOmit(props, 'class', 'orientation', 'decorative')
</script>

<template>
  <Separator
    v-bind="delegatedProps"
    :orientation="props.orientation"
    :decorative="props.decorative"
    :class="cn(
      'bg-border shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px',
      props.class,
    )"
    data-slot="separator"
  />
</template>
