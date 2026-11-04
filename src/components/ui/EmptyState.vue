<script setup lang="ts">
import type { Component } from 'vue'
import { Inbox } from '@lucide/vue'
import { cn } from '@/utils/cn'

withDefaults(defineProps<{ title?: string; description?: string; icon?: Component; class?: string }>(), {
  title: '暂无数据',
  icon: () => Inbox,
})
</script>

<template>
  <div :class="cn('flex flex-col items-center justify-center px-6 py-14 text-center', $props.class)">
    <div class="mb-4 flex size-12 items-center justify-center rounded-xl border border-border bg-muted/60 text-muted-foreground">
      <component :is="icon" class="size-5" aria-hidden="true" />
    </div>
    <p class="text-sm font-medium text-foreground">{{ title }}</p>
    <p v-if="description" class="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">{{ description }}</p>
    <div v-if="$slots.default" class="mt-4 flex gap-2"><slot /></div>
  </div>
</template>
