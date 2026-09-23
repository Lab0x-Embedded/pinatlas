<script setup lang="ts">
import type { TooltipContentEmits, TooltipContentProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { TooltipContent, TooltipPortal, useForwardPropsEmits } from 'reka-ui'
import { cn } from '~/lib/utils'

const props = withDefaults(defineProps<TooltipContentProps & {
  class?: HTMLAttributes['class']
  hideArrow?: boolean
}>(), {
  sideOffset: 6,
})

const emits = defineEmits<TooltipContentEmits>()
const delegatedProps = reactiveOmit(props, 'class', 'hideArrow')
const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <TooltipPortal>
    <TooltipContent
      v-bind="forwarded"
      :class="cn(
        'bg-primary text-primary-foreground z-50 w-fit rounded-md px-2 py-1 text-xs shadow-md',
        props.class,
      )"
      data-slot="tooltip-content"
    >
      <slot />
    </TooltipContent>
  </TooltipPortal>
</template>
