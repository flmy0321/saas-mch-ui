<script setup lang="ts">
import { computed, type Component } from 'vue'
import { TrendingDown, TrendingUp } from '@lucide/vue'
import Skeleton from './Skeleton.vue'
import { formatDelta } from '@/utils/format'
import { cn } from '@/utils/cn'

const props = defineProps<{
  label: string
  value?: string
  delta?: number | null
  deltaLabel?: string
  /** 为 true 时，增长代表负面（如退款金额） */
  invertDelta?: boolean
  icon?: Component
  loading?: boolean
  hint?: string
  active?: boolean
  interactive?: boolean
}>()
defineEmits<{ select: [] }>()

const good = computed(() => (props.delta ?? 0) >= 0 !== !!props.invertDelta)
</script>

<template>
  <component
    :is="interactive ? 'button' : 'div'"
    :type="interactive ? 'button' : undefined"
    :aria-pressed="interactive ? active : undefined"
    :class="
      cn(
        'relative flex flex-col rounded-xl border border-border bg-card p-4 text-left shadow-card transition-colors',
        interactive && 'hover:border-primary/30 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none',
        active && 'border-primary/50 ring-1 ring-primary/20',
      )
    "
    @click="interactive && $emit('select')"
  >
    <div class="flex items-center justify-between gap-2">
      <span class="text-[13px] text-muted-foreground">{{ label }}</span>
      <component :is="icon" v-if="icon" class="size-4 text-muted-foreground/70" aria-hidden="true" />
    </div>
    <template v-if="loading">
      <Skeleton class="mt-3 h-7 w-32" />
      <Skeleton class="mt-2.5 h-3.5 w-20" />
    </template>
    <template v-else>
      <p class="mt-2 text-2xl leading-tight font-semibold tracking-tight tabular">
        <slot name="value">{{ value }}</slot>
      </p>
      <p class="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span v-if="delta === null" class="font-medium tabular" title="对比基数为 0，无法计算变化">—</span>
        <span
          v-else-if="delta !== undefined"
          :class="cn('inline-flex items-center gap-0.5 font-medium tabular', good ? 'text-success' : 'text-danger')"
        >
          <TrendingUp v-if="delta >= 0" class="size-3.5" aria-hidden="true" />
          <TrendingDown v-else class="size-3.5" aria-hidden="true" />
          {{ formatDelta(delta) }}
        </span>
        <span>{{ deltaLabel ?? hint }}</span>
      </p>
    </template>
  </component>
</template>
