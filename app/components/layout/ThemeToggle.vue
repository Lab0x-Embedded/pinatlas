<script setup lang="ts">
/** 主题切换：@nuxtjs/color-mode（class 策略），偏好持久化由模块负责。 */
const colorMode = useColorMode()
const isDark = computed({
  get: () => colorMode.value === 'dark',
  set: value => colorMode.preference = value ? 'dark' : 'light',
})
</script>

<template>
  <Button
    variant="ghost"
    size="icon-sm"
    class="text-muted-foreground hover:text-foreground"
    :aria-label="isDark ? '切换到亮色' : '切换到暗色'"
    @click="isDark = !isDark"
  >
    <svg v-if="isDark" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </svg>
    <svg v-else class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  </Button>
</template>
