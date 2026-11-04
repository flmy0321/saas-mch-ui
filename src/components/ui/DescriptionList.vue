<script setup lang="ts">
import { cn } from '@/utils/cn'

withDefaults(defineProps<{ items: { key: string; label: string; value?: string | null }[]; cols?: 1 | 2 | 3 }>(), {
  cols: 2,
})
</script>

<template>
  <dl
    :class="
      cn(
        'grid grid-cols-1 gap-x-8 gap-y-4',
        cols === 2 && 'sm:grid-cols-2',
        cols === 3 && 'sm:grid-cols-2 lg:grid-cols-3',
      )
    "
  >
    <div v-for="item in items" :key="item.key" class="min-w-0">
      <dt class="text-xs text-muted-foreground">{{ item.label }}</dt>
      <dd class="mt-1 text-sm break-all">
        <slot :name="item.key" :item="item">{{ item.value || '—' }}</slot>
      </dd>
    </div>
  </dl>
</template>
