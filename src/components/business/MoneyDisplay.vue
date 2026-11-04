<script setup lang="ts">
import { computed } from 'vue'
import { fenToYuan } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { AmountFen } from '@/types'

const props = withDefaults(
  defineProps<{ amount: AmountFen | null | undefined; size?: 'sm' | 'md' | 'lg' | 'xl'; negative?: boolean; class?: string }>(),
  { size: 'md' },
)

const parts = computed(() => {
  if (props.amount === null || props.amount === undefined) return null
  const s = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    fenToYuan(props.amount),
  )
  const [int, dec] = s.split('.')
  return { int, dec }
})

const sizeClass = { sm: 'text-[13px]', md: 'text-sm', lg: 'text-xl', xl: 'text-[28px] leading-none' }
</script>

<template>
  <span v-if="!parts" class="text-muted-foreground">—</span>
  <span v-else :class="cn('font-medium whitespace-nowrap tabular', sizeClass[size], props.class)">
    <span :class="size === 'xl' || size === 'lg' ? 'mr-0.5 text-[0.6em] text-muted-foreground' : ''">{{ negative ? '-' : '' }}¥</span>{{ parts.int }}<span :class="size === 'xl' || size === 'lg' ? 'text-[0.6em] text-muted-foreground' : ''">.{{ parts.dec }}</span>
  </span>
</template>
