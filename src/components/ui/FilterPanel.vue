<script setup lang="ts">
import { ref } from 'vue'
import { ChevronDown, RotateCcw, Search } from '@lucide/vue'
import Button from './Button.vue'
import { cn } from '@/utils/cn'

defineProps<{ activeCount?: number; collapsible?: boolean }>()
const emit = defineEmits<{ apply: []; reset: [] }>()
const expanded = ref(false)
</script>

<template>
  <form class="border-b border-border p-4 sm:px-5" @submit.prevent="emit('apply')">
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <slot />
      <template v-if="!collapsible || expanded"><slot name="more" /></template>
    </div>
    <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2 text-xs text-muted-foreground">
        <button
          v-if="collapsible && $slots.more"
          type="button"
          class="inline-flex items-center gap-1 rounded hover:text-foreground"
          :aria-expanded="expanded"
          @click="expanded = !expanded"
        >
          {{ expanded ? '收起筛选' : '更多筛选' }}
          <ChevronDown :class="cn('size-3.5 transition-transform', expanded && 'rotate-180')" />
        </button>
        <span v-if="activeCount">已应用 {{ activeCount }} 个筛选条件</span>
      </div>
      <div class="flex items-center gap-2">
        <slot name="extra" />
        <Button size="sm" @click="emit('reset')"><RotateCcw aria-hidden="true" />重置</Button>
        <Button size="sm" variant="primary" type="submit"><Search aria-hidden="true" />查询</Button>
      </div>
    </div>
  </form>
</template>
