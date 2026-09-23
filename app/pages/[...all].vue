<script setup lang="ts">
import { strings } from '~/constants/strings'

useHead({ title: `404 · ${strings.appName}` })
</script>

<template>
  <main class="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
    <p class="text-muted-foreground text-sm">
      404
    </p>
    <h1 class="text-lg font-semibold">
      页面不存在
    </h1>
    <Button as-child variant="outline">
      <NuxtLink to="/">
        回到查询台
      </NuxtLink>
    </Button>
  </main>
</template>
