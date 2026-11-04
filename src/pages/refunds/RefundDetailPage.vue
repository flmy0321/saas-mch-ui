<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { ArrowLeft, FileSearch, Info } from '@lucide/vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import Card from '@/components/ui/Card.vue'
import Button from '@/components/ui/Button.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import DescriptionList from '@/components/ui/DescriptionList.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import MoneyDisplay from '@/components/business/MoneyDisplay.vue'
import RefundStatusBadge from '@/components/business/RefundStatusBadge.vue'
import ChannelBadge from '@/components/business/ChannelBadge.vue'
import TransactionTimeline, { type TimelineStep } from '@/components/business/TransactionTimeline.vue'
import WebhookDeliveryList from '@/components/business/WebhookDeliveryList.vue'
import { useAsync } from '@/composables/useAsync'
import { api } from '@/services/api'
import { REFUND_STATUS } from '@/utils/dictionaries'
import { formatDateTime } from '@/utils/format'

const route = useRoute()
const id = computed(() => String(route.params.id))
const detail = useAsync(() => api.refunds.get(id.value))
const deliveries = useAsync(() => api.webhooks.deliveriesFor(id.value))
const r = computed(() => detail.data.value)
const notFound = computed(() => detail.error.value?.includes('不存在'))

const steps = computed<TimelineStep[]>(() => {
  const x = r.value
  if (!x) return []
  const last = x.progress.length - 1
  return x.progress.map((e, i) => ({
    title: REFUND_STATUS[e.status].label,
    at: e.at,
    note: e.note,
    state:
      e.status === 'SUCCESS'
        ? 'done'
        : e.status === 'FAILED' || e.status === 'CLOSED'
          ? 'failed'
          : e.status === 'SUSPENDED'
            ? 'current'
            : i === last
              ? 'current'
              : 'done',
  }))
})

const items = computed(() => {
  const x = r.value
  if (!x) return []
  return [
    { key: 'id', label: '平台退款编号', value: x.id },
    { key: 'merchantRefundNo', label: '商户退款编号', value: x.merchantRefundNo },
    { key: 'paymentId', label: '原支付订单号', value: x.paymentId },
    { key: 'merchantOrderNo', label: '原商户订单号', value: x.merchantOrderNo },
    { key: 'store', label: '门店', value: x.storeName },
    { key: 'channel', label: '退款渠道', value: x.channel },
    { key: 'reason', label: '退款原因', value: x.reason },
    { key: 'createdAt', label: '申请时间', value: formatDateTime(x.createdAt) },
    { key: 'updatedAt', label: '最近更新', value: formatDateTime(x.updatedAt) },
    { key: 'finishedAt', label: '完成时间', value: formatDateTime(x.finishedAt) },
  ]
})

const statusHint = computed(() => {
  switch (r.value?.status) {
    case 'PROCESSING':
    case 'CREATED':
      return '退款正在渠道处理中，通常 1-3 个工作日内完成，结果会通过 Webhook 通知。'
    case 'SUSPENDED':
      return '退款被渠道挂起，通常因用户账户状态异常，平台会持续重试，如长时间未恢复请联系客服。'
    case 'FAILED':
      return r.value?.failReason ? `退款失败：${r.value.failReason}` : '退款失败，可重新发起退款。'
    default:
      return ''
  }
})
</script>

<template>
  <div class="flex flex-col gap-5">
    <EmptyState v-if="notFound" :icon="FileSearch" title="退款记录不存在" description="请检查退款编号是否正确。" class="py-28">
      <Button :as="RouterLink" to="/refunds" variant="primary">返回退款列表</Button>
    </EmptyState>
    <ErrorState v-else-if="detail.error.value" :message="detail.error.value" class="py-28" @retry="detail.reload()" />

    <template v-else>
      <PageHeader :breadcrumb="[{ label: '退款订单', to: '/refunds' }, { label: '退款详情' }]">
        <template #title>
          <div class="flex flex-wrap items-center gap-3">
            <Button :as="RouterLink" to="/refunds" variant="ghost" size="icon" class="size-8" aria-label="返回退款列表">
              <ArrowLeft aria-hidden="true" />
            </Button>
            <h1 class="text-xl font-semibold tracking-tight">退款详情</h1>
            <RefundStatusBadge v-if="r" :status="r.status" />
          </div>
        </template>
        <template #meta>
          <span v-if="r" class="flex items-center gap-1 font-mono text-[13px] text-muted-foreground">{{ r.id }}<CopyButton :value="r.id" /></span>
          <Skeleton v-else class="h-4 w-56" />
        </template>
        <template #actions>
          <Button v-if="r" :as="RouterLink" :to="`/payments/${r.paymentId}`">查看原支付订单</Button>
        </template>
      </PageHeader>

      <div class="grid gap-5 xl:grid-cols-3">
        <div class="flex min-w-0 flex-col gap-5 xl:col-span-2">
          <Card padded>
            <Skeleton v-if="!r" class="h-14 w-48" />
            <template v-else>
              <p class="text-[13px] text-muted-foreground">退款金额</p>
              <MoneyDisplay :amount="r.amount" size="xl" class="mt-1 block" />
              <p
                v-if="statusHint"
                class="mt-4 flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-[13px] leading-relaxed"
                :class="r.status === 'FAILED' ? 'bg-danger-soft text-danger' : 'text-muted-foreground'"
              >
                <Info class="mt-0.5 size-4 shrink-0" aria-hidden="true" />{{ statusHint }}
              </p>
            </template>
          </Card>

          <Card title="退款信息">
            <div v-if="!r" class="grid gap-4 sm:grid-cols-2"><Skeleton v-for="i in 8" :key="i" class="h-10" /></div>
            <DescriptionList v-else :items="items" :cols="2">
              <template #id="{ item }">
                <span class="flex items-center gap-1 font-mono text-[13px]">{{ item.value }}<CopyButton :value="item.value!" /></span>
              </template>
              <template #merchantRefundNo="{ item }"><span class="font-mono text-[13px]">{{ item.value }}</span></template>
              <template #merchantOrderNo="{ item }"><span class="font-mono text-[13px]">{{ item.value }}</span></template>
              <template #paymentId="{ item }">
                <RouterLink :to="`/payments/${item.value}`" class="font-mono text-[13px] text-primary hover:underline">{{ item.value }}</RouterLink>
              </template>
              <template #store>
                <RouterLink :to="`/stores/${r.storeId}`" class="text-primary hover:underline">{{ r.storeName }}</RouterLink>
              </template>
              <template #channel><ChannelBadge :channel="r.channel" /></template>
            </DescriptionList>
          </Card>

          <Card title="Webhook 通知" description="与该退款相关的事件通知" body-class="p-0">
            <WebhookDeliveryList :items="deliveries.data.value ?? []" :loading="deliveries.loading.value" :error="deliveries.error.value" @retry="deliveries.reload()" />
          </Card>
        </div>

        <Card title="处理进度">
          <div v-if="!r" class="flex flex-col gap-4"><Skeleton v-for="i in 3" :key="i" class="h-10" /></div>
          <TransactionTimeline v-else :steps="steps" />
        </Card>
      </div>
    </template>
  </div>
</template>
