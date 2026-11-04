<script setup lang="ts">
import { computed } from 'vue'
import MoneyDisplay from './MoneyDisplay.vue'
import { toFen } from '@/utils/money'
import type { AmountDecimal, RefundableInfo } from '@/types'

const props = defineProps<{ info: RefundableInfo }>()

/** 进度条宽度仅用于视觉比例，按分精确相除后转为百分比 */
const pct = (v: AmountDecimal) => {
  const total = toFen(props.info.paymentAmount)
  const part = toFen(v)
  if (!total || part === null) return 0
  return Number((part * 10000n) / total) / 100
}
const bars = computed(() => [
  { key: 'refunded', w: pct(props.info.refundedAmount), cls: 'bg-primary' },
  { key: 'refunding', w: pct(props.info.refundingAmount), cls: 'bg-warning' },
])
</script>

<template>
  <div class="rounded-lg border border-border bg-muted/30 p-4">
    <div class="flex h-1.5 overflow-hidden rounded-full bg-success/25" aria-hidden="true">
      <span v-for="b in bars" :key="b.key" :class="b.cls" :style="{ width: `${b.w}%` }" />
    </div>
    <dl class="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
      <div>
        <dt class="text-muted-foreground">订单支付金额</dt>
        <dd class="mt-0.5"><MoneyDisplay :amount="info.paymentAmount" /></dd>
      </div>
      <div>
        <dt class="flex items-center gap-1.5 text-muted-foreground">
          <span class="size-1.5 rounded-full bg-primary" aria-hidden="true" />已成功退款
        </dt>
        <dd class="mt-0.5"><MoneyDisplay :amount="info.refundedAmount" /></dd>
      </div>
      <div>
        <dt class="flex items-center gap-1.5 text-muted-foreground">
          <span class="size-1.5 rounded-full bg-warning" aria-hidden="true" />处理中退款
        </dt>
        <dd class="mt-0.5"><MoneyDisplay :amount="info.refundingAmount" /></dd>
      </div>
      <div>
        <dt class="flex items-center gap-1.5 text-muted-foreground">
          <span class="size-1.5 rounded-full bg-success" aria-hidden="true" />当前可申请退款
        </dt>
        <dd class="mt-0.5">
          <MoneyDisplay v-if="info.refundableAmount !== null" :amount="info.refundableAmount" class="font-semibold text-success" />
          <span v-else class="text-muted-foreground" title="核心未给出可退金额">不可退款</span>
        </dd>
      </div>
    </dl>
  </div>
</template>
