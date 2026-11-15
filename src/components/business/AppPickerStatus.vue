<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import { formatNumber } from '@/utils/format'
import type { useAppCollection } from '@/composables/useAppPicker'

defineProps<{ apps: ReturnType<typeof useAppCollection> }>()
</script>

<template>
  <div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
    <span v-if="apps.error.value" class="text-destructive">应用列表加载失败：{{ apps.error.value }}</span>
    <span v-else-if="apps.total.value !== null" class="tabular">
      已加载 {{ formatNumber(apps.loadedCount.value) }} / 共 {{ formatNumber(apps.total.value) }} 个
    </span>
    <span v-if="apps.changed.value" class="text-warning-foreground">{{ apps.changed.value }}，列表可能不完整</span>
    <Button v-if="apps.changed.value || apps.error.value" size="sm" variant="ghost" :loading="apps.loading.value" @click="apps.reload()">
      重新加载
    </Button>
    <Button v-else-if="apps.hasMore.value" size="sm" variant="ghost" :loading="apps.loading.value" @click="apps.loadMore()">
      加载更多
    </Button>
  </div>
</template>
