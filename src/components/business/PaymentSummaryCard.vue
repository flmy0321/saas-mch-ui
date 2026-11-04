<script setup lang="ts">
import MoneyDisplay from './MoneyDisplay.vue'
import PaymentStatusBadge from './PaymentStatusBadge.vue'
import RefundAggregateBadge from './RefundAggregateBadge.vue'
import ChannelBadge from './ChannelBadge.vue'
import OrderNumber from './OrderNumber.vue'
import { methodLabel } from '@/utils/dictionaries'
import { formatDateTime } from '@/utils/format'
import type { Payment } from '@/types'

defineProps<{ payment: Payment; linkable?: boolean }>()
</script>

<template>
  <div class="rounded-lg border border-border p-4">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="text-xs text-muted-foreground">原支付订单</p>
        <OrderNumber :value="payment.id" :to="linkable ? `/payments/${payment.id}` : undefined" class="mt-0.5" />
      </div>
      <div class="flex flex-wrap justify-end gap-1.5">
        <PaymentStatusBadge :status="payment.status" />
        <RefundAggregateBadge :payment="payment" />
      </div>
    </div>
    <dl class="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px]">
      <div>
        <dt class="text-muted-foreground">支付金额</dt>
        <dd class="mt-0.5"><MoneyDisplay :amount="payment.paidAmount ?? payment.amount" /></dd>
      </div>
      <div>
        <dt class="text-muted-foreground">门店</dt>
        <dd class="mt-0.5 truncate">{{ payment.storeName ?? '—' }}</dd>
      </div>
      <div>
        <dt class="text-muted-foreground">渠道 / 方式</dt>
        <dd class="mt-0.5 flex items-center gap-1.5">
          <ChannelBadge :channel="payment.channel" short />
          <span class="text-muted-foreground">· {{ methodLabel(payment.method) }}</span>
        </dd>
      </div>
      <div>
        <dt class="text-muted-foreground">支付时间</dt>
        <dd class="mt-0.5 tabular">{{ formatDateTime(payment.paidAt) }}</dd>
      </div>
    </dl>
  </div>
</template>
