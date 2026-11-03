<script setup lang="ts">
import Card from './Card.vue'
import Skeleton from './Skeleton.vue'
import EmptyState from './EmptyState.vue'
import ErrorState from './ErrorState.vue'
import { BarChart3 } from '@lucide/vue'

withDefaults(
  defineProps<{
    title: string
    description?: string
    loading?: boolean
    error?: string | null
    empty?: boolean
    height?: number
    class?: string
  }>(),
  { height: 280 },
)
defineEmits<{ retry: [] }>()
</script>

<template>
  <Card :title="title" :description="description" :class="$props.class" body-class="p-4 pt-3">
    <template v-if="$slots.actions" #actions><slot name="actions" /></template>
    <div v-if="$slots.legend" class="mb-2 flex flex-wrap items-center gap-4 px-1 text-xs text-muted-foreground">
      <slot name="legend" />
    </div>
    <div :style="{ height: `${height}px` }">
      <div v-if="loading" class="flex h-full items-end gap-2 px-2 pb-6">
        <Skeleton v-for="i in 12" :key="i" class="flex-1" :style="{ height: `${30 + ((i * 37) % 60)}%` }" />
      </div>
      <ErrorState v-else-if="error" :message="error" class="h-full py-0" @retry="$emit('retry')" />
      <EmptyState
        v-else-if="empty"
        :icon="BarChart3"
        title="所选范围内暂无数据"
        description="尝试调整时间范围或筛选条件"
        class="h-full py-0"
      />
      <slot v-else />
    </div>
  </Card>
</template>
