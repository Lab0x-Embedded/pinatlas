<script setup lang="ts">
import { dataRepoUrl, repoUrl } from '~/constants'
import { strings } from '~/constants/strings'

const store = useChipsStore()
const generatedAt = computed(() => store.manifest?.generatedAt ?? null)
const formatted = computed(() =>
  generatedAt.value ? new Date(generatedAt.value).toISOString().slice(0, 10) : null)
</script>

<template>
  <footer class="border-border text-muted-foreground mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-4 py-3 text-xs">
    <span>{{ strings.dataSource }}：</span>
    <a class="hover:text-foreground underline underline-offset-2" :href="repoUrl" target="_blank" rel="noreferrer">pinatlas</a>
    <span aria-hidden="true">·</span>
    <a class="hover:text-foreground underline underline-offset-2" :href="dataRepoUrl" target="_blank" rel="noreferrer">pinatlas-data</a>
    <span class="ml-auto flex items-center gap-2">
      <span v-if="store.dataTag">{{ strings.dataVersion }}：{{ store.dataTag }}</span>
      <span v-if="formatted">· {{ formatted }}</span>
    </span>
  </footer>
</template>
