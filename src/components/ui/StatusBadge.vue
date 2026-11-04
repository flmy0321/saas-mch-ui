<script setup lang="ts">
import { computed } from 'vue'
import type { Tone } from '@/utils/dictionaries'
import { cn } from '@/utils/cn'

const props = withDefaults(defineProps<{ tone?: Tone; dot?: boolean; class?: string; title?: string }>(), {
  tone: 'neutral',
  dot: true,
})

const toneClass: Record<Tone, string> = {
  success: 'bg-success-soft text-success ring-success/20',
  warning: 'bg-warning-soft text-[color-mix(in_oklch,var(--warning)_70%,var(--foreground))] ring-warning/25',
  danger: 'bg-danger-soft text-danger ring-danger/20',
  info: 'bg-info-soft text-info ring-info/20',
  primary: 'bg-accent text-accent-foreground ring-primary/20',
  neutral: 'bg-muted text-muted-foreground ring-border',
}
const dotClass: Record<Tone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  primary: 'bg-primary',
  neutral: 'bg-muted-foreground/60',
}

const cls = computed(() =>
  cn(
    'inline-flex h-[22px] items-center gap-1.5 rounded-full px-2 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
    toneClass[props.tone],
    props.class,
  ),
)
</script>

<template>
  <span :class="cls" :title="title">
    <span v-if="dot" :class="cn('size-1.5 rounded-full', dotClass[tone])" aria-hidden="true" />
    <slot />
  </span>
</template>
