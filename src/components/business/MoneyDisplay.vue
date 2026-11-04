<script setup lang="ts">
import { computed } from 'vue'
import { formatMoney } from '@/utils/money'
import { cn } from '@/utils/cn'
import type { AmountDecimal } from '@/types'

const props = withDefaults(
  defineProps<{ amount: AmountDecimal | null | undefined; size?: 'sm' | 'md' | 'lg' | 'xl'; negative?: boolean; class?: string }>(),
  { size: 'md' },
)

/** 金额按原字符串精确展示，不经过 Number，避免大金额精度丢失 */
const parts = computed(() => {
  if (props.amount === null || props.amount === undefined) return null
  const s = formatMoney(props.amount, { symbol: false })
  if (s === '金额异常') return { invalid: true as const }
  const [int, dec] = s.split('.')
  return { invalid: false as const, int, dec }
})

const sizeClass = { sm: 'text-[13px]', md: 'text-sm', lg: 'text-xl', xl: 'text-[28px] leading-none' }
</script>

<template>
  <span v-if="!parts" class="text-muted-foreground">—</span>
  <span v-else-if="parts.invalid" class="text-destructive text-sm" title="服务端返回的金额格式不合法">金额异常</span>
  <span v-else :class="cn('font-medium whitespace-nowrap tabular', sizeClass[size], props.class)">
    <span :class="size === 'xl' || size === 'lg' ? 'mr-0.5 text-[0.6em] text-muted-foreground' : ''">{{ negative ? '-' : '' }}¥</span>{{ parts.int }}<span :class="size === 'xl' || size === 'lg' ? 'text-[0.6em] text-muted-foreground' : ''">.{{ parts.dec }}</span>
  </span>
</template>
