<script setup lang="ts">
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import CopyButton from '@/components/ui/CopyButton.vue'
import { cn } from '@/utils/cn'

withDefaults(defineProps<{ value: string; to?: RouteLocationRaw; copyable?: boolean; class?: string; muted?: boolean }>(), {
  copyable: true,
})
</script>

<template>
  <span :class="cn('group/num inline-flex items-center gap-0.5', $props.class)">
    <RouterLink
      v-if="to"
      :to="to"
      class="font-mono text-[12.5px] text-primary hover:underline underline-offset-2"
      @click.stop
    >
      {{ value }}
    </RouterLink>
    <span v-else :class="cn('font-mono text-[12.5px]', muted ? 'text-muted-foreground' : 'text-foreground')">{{ value }}</span>
    <CopyButton
      v-if="copyable"
      :value="value"
      label="复制编号"
      class="opacity-0 group-hover/num:opacity-100 focus-visible:opacity-100"
    />
  </span>
</template>
