<script setup lang="ts">
import { Undo2 } from '@lucide/vue'
import { REFUND_AGGREGATE } from '@/utils/dictionaries'
import { formatMoney, isPositiveAmount } from '@/utils/money'
import type { Payment } from '@/types'

/** 退款聚合状态：作为支付状态的附加标签展示，不覆盖支付成功事实 */
defineProps<{ payment: Pick<Payment, 'refundAggregate' | 'refundedAmount' | 'refundingAmount'> }>()
</script>

<template>
  <span
    v-if="payment.refundAggregate !== 'NONE' || isPositiveAmount(payment.refundingAmount)"
    class="inline-flex h-[22px] items-center gap-1 rounded-full border border-dashed border-primary/30 px-2 text-xs font-medium whitespace-nowrap text-primary"
    :title="`已退款 ${formatMoney(payment.refundedAmount)}，处理中 ${formatMoney(payment.refundingAmount)}`"
  >
    <Undo2 class="size-3" aria-hidden="true" />
    {{ payment.refundAggregate === 'NONE' ? '退款处理中' : REFUND_AGGREGATE[payment.refundAggregate].label }}
  </span>
</template>
