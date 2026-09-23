<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '~/lib/utils'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()

/**
 * `v-model` 必须显式声明（defineModel）：只声明 `class` 时，`modelValue` 与
 * `onUpdate:modelValue` 会被当成 fallthrough attrs 落到原生 `<input>` 上，等于给 input
 * 挂了一个永远不触发的事件名；结果是页头搜索框可以敲字、`store.query` 一直是空字符串，
 * 整个搜索（以及"展开分片"的懒加载）都不工作。
 * 本地 CDP 实测：input.value = "f103 lqfp48" 而侧栏仍停在系列树（searching 为 false）。
 */
const modelValue = defineModel<string | number | null>()

const inputRef = ref<HTMLInputElement | null>(null)

/**
 * 暴露 focus/select：外面用 `ref` 拿到的是**组件实例**，实例上没有原生 input 的
 * `focus()`/`select()`（页头的 ⌘K 就是这样静默失败的：`searchRef.value?.focus()` 抛
 * "focus is not a function"，快捷键按了没反应）。要操作原生元素就得显式暴露。
 */
defineExpose({
  inputRef,
  focus: () => inputRef.value?.focus(),
  select: () => inputRef.value?.select(),
})
</script>

<template>
  <input
    ref="inputRef"
    v-model="modelValue"
    :class="cn(
      'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
      'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
      props.class,
    )"
    data-slot="input"
  >
</template>
