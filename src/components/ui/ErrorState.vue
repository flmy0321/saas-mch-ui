<script setup lang="ts">
import { RefreshCw, TriangleAlert } from '@lucide/vue'
import Button from './Button.vue'
import { cn } from '@/utils/cn'

defineProps<{ message?: string; class?: string }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div :class="cn('flex flex-col items-center justify-center px-6 py-14 text-center', $props.class)" role="alert">
    <div class="mb-4 flex size-12 items-center justify-center rounded-xl bg-danger-soft text-danger">
      <TriangleAlert class="size-5" aria-hidden="true" />
    </div>
    <p class="text-sm font-medium text-foreground">数据加载失败</p>
    <p class="mt-1 max-w-sm text-xs text-muted-foreground">{{ message || '请稍后重试，如问题持续请联系平台支持。' }}</p>
    <Button class="mt-4" size="sm" @click="$emit('retry')">
      <RefreshCw aria-hidden="true" />
      重新加载
    </Button>
  </div>
</template>
