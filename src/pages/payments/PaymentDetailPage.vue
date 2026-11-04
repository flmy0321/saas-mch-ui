<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { ArrowLeft, FileSearch, Undo2 } from '@lucide/vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import Card from '@/components/ui/Card.vue'
import Button from '@/components/ui/Button.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import DescriptionList from '@/components/ui/DescriptionList.vue'
import DataTable from '@/components/ui/DataTable.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import MoneyDisplay from '@/components/business/MoneyDisplay.vue'
import PaymentStatusBadge from '@/components/business/PaymentStatusBadge.vue'
import RefundAggregateBadge from '@/components/business/RefundAggregateBadge.vue'
import ChannelBadge from '@/components/business/ChannelBadge.vue'
import TransactionTimeline, { type TimelineStep } from '@/components/business/TransactionTimeline.vue'
import RefundSummaryCard from '@/components/business/RefundSummaryCard.vue'
import CreateRefundDialog from '@/components/business/CreateRefundDialog.vue'
import WebhookDeliveryList from '@/components/business/WebhookDeliveryList.vue'
import { useAsync } from '@/composables/useAsync'
import { buildRefundColumns } from '@/pages/refunds/refundColumns'
import { api } from '@/services/api'
import { methodLabel, paymentSourceLabel } from '@/utils/dictionaries'
import { formatDateTime, formatMoney } from '@/utils/format'
import { isPositiveAmount } from '@/utils/money'
import type { Refund } from '@/types'

const route = useRoute()
const router = useRouter()
const id = computed(() => String(route.params.id))

const detail = useAsync(() => api.payments.get(id.value))
const refunds = useAsync(() => api.refunds.list({ paymentId: id.value, page: 1, pageSize: 50 }))
const info = useAsync(() => api.payments.refundable(id.value))
const deliveries = useAsync(() => api.webhooks.deliveriesFor(id.value))

const p = computed(() => detail.data.value)
const refundOpen = ref(false)

const notFound = computed(() => detail.error.value?.includes('不存在'))

const canRefund = computed(
  () =>
    p.value?.status === 'SUCCESS' &&
    info.data.value?.refundEligibility === 'ALLOWED' &&
    isPositiveAmount(info.data.value.refundableAmount),
)
const refundDisabledReason = computed(() => {
  if (!p.value) return ''
  if (p.value.status !== 'SUCCESS') return '仅支付成功的订单可以发起退款'
  const i = info.data.value
  if (!i) return '正在查询可退金额'
  if (i.refundEligibility !== 'ALLOWED') return i.ineligibleReason ?? '该订单当前不可退款'
  if (i.refundableAmount === null) return '可退金额暂不可确定'
  if (!isPositiveAmount(i.refundableAmount)) return '该订单已无可退金额'
  return ''
})

const steps = computed<TimelineStep[]>(() => {
  const x = p.value
  if (!x) return []
  const s: TimelineStep[] = [{ title: '订单创建', at: x.createdAt, state: 'done' }]
  s.push(
    x.submittedAt
      ? { title: '用户提交支付', at: x.submittedAt, state: 'done', note: `${methodLabel(x.method)}` }
      : { title: '用户提交支付', state: x.status === 'CREATED' ? 'current' : 'pending' },
  )
  if (x.status === 'SUCCESS') s.push({ title: '支付成功', at: x.paidAt, state: 'done', note: `实收 ${formatMoney(x.paidAmount)}` })
  else if (x.status === 'FAILED') s.push({ title: '支付失败', at: x.failedAt, state: 'failed', note: x.failReason })
  else if (x.status === 'CLOSED') s.push({ title: '订单关闭', at: x.closedAt, state: 'neutral', note: '超时未支付或商户主动关闭' })
  else if (x.status === 'CLOSING') s.push({ title: '关单处理中', state: 'current' })
  else if (x.status === 'PAYING') s.push({ title: '等待支付结果', state: 'current', note: x.expireAt ? `订单将于 ${formatDateTime(x.expireAt)} 过期` : undefined })
  else s.push({ title: '等待用户支付', state: 'pending', note: x.expireAt ? `订单将于 ${formatDateTime(x.expireAt)} 过期` : undefined })
  for (const r of [...(refunds.data.value?.items ?? [])].reverse()) {
    s.push({
      title: `退款 ${formatMoney(r.amount)}`,
      at: r.finishedAt ?? r.createdAt,
      state: r.status === 'SUCCESS' ? 'done' : r.status === 'FAILED' || r.status === 'CLOSED' ? 'failed' : 'current',
      note: `${r.id} · ${r.reason}`,
    })
  }
  return s
})

const baseItems = computed(() => {
  const x = p.value
  if (!x) return []
  return [
    { key: 'id', label: '平台支付订单号', value: x.id },
    { key: 'merchantOrderNo', label: '商户订单号', value: x.merchantOrderNo },
    { key: 'subject', label: '商品描述', value: x.subject },
    { key: 'store', label: '门店', value: x.storeName },
    { key: 'channel', label: '支付渠道', value: x.channel },
    { key: 'method', label: '支付方式', value: methodLabel(x.method) },
    { key: 'source', label: '订单来源', value: paymentSourceLabel(x.source) },
    { key: 'coreStatus', label: '核心状态', value: x.coreStatus || '—' },
    { key: 'createdAt', label: '创建时间', value: formatDateTime(x.createdAt) },
    { key: 'paidAt', label: '支付时间', value: formatDateTime(x.paidAt) },
  ]
})

const refundColumns = buildRefundColumns({ withPayment: false })

function onRefundCreated(r: Refund) {
  detail.reload()
  refunds.reload()
  info.reload()
  deliveries.reload()
  router.push(`/refunds/${r.id}`)
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <EmptyState v-if="notFound" :icon="FileSearch" title="订单不存在" description="请检查订单号是否正确，或该订单不属于当前商户。" class="py-28">
      <Button :as="RouterLink" to="/payments" variant="primary">返回订单列表</Button>
    </EmptyState>
    <ErrorState v-else-if="detail.error.value" :message="detail.error.value" class="py-28" @retry="detail.reload()" />

    <template v-else>
      <PageHeader :breadcrumb="[{ label: '支付订单', to: '/payments' }, { label: '订单详情' }]">
        <template #title>
          <div class="flex flex-wrap items-center gap-3">
            <Button :as="RouterLink" to="/payments" variant="ghost" size="icon" class="size-8" aria-label="返回订单列表">
              <ArrowLeft aria-hidden="true" />
            </Button>
            <h1 class="text-xl font-semibold tracking-tight">支付订单详情</h1>
            <template v-if="p">
              <PaymentStatusBadge :status="p.status" />
              <RefundAggregateBadge v-if="p.refundAggregate !== 'NONE'" :payment="p" />
            </template>
          </div>
        </template>
        <template #meta>
          <span v-if="p" class="flex items-center gap-1 font-mono text-[13px] text-muted-foreground">
            {{ p.id }}<CopyButton :value="p.id" label="复制订单号" />
          </span>
          <Skeleton v-else class="h-4 w-56" />
        </template>
        <template #actions>
          <Tooltip :content="refundDisabledReason" :disabled="canRefund || !p">
            <span tabindex="-1">
              <Button variant="primary" :disabled="!canRefund" @click="refundOpen = true">
                <Undo2 aria-hidden="true" />发起退款
              </Button>
            </span>
          </Tooltip>
        </template>
      </PageHeader>

      <div class="grid gap-5 xl:grid-cols-3">
        <div class="flex min-w-0 flex-col gap-5 xl:col-span-2">
          <Card padded>
            <div v-if="!p" class="flex flex-col gap-3"><Skeleton class="h-4 w-24" /><Skeleton class="h-9 w-48" /></div>
            <div v-else class="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p class="text-[13px] text-muted-foreground">订单金额</p>
                <MoneyDisplay :amount="p.amount" size="xl" class="mt-1 block" />
              </div>
              <dl class="flex flex-wrap gap-x-8 gap-y-3 text-[13px]">
                <div>
                  <dt class="text-muted-foreground">实收金额</dt>
                  <dd class="mt-1 font-medium tabular">{{ formatMoney(p.paidAmount) }}</dd>
                </div>
                <div>
                  <dt class="text-muted-foreground">已退款</dt>
                  <dd class="mt-1 font-medium tabular">{{ formatMoney(p.refundedAmount) }}</dd>
                </div>
                <div>
                  <dt class="text-muted-foreground">退款中</dt>
                  <dd class="mt-1 font-medium tabular">{{ formatMoney(p.refundingAmount) }}</dd>
                </div>
              </dl>
            </div>
            <p
              v-if="p?.status === 'FAILED' && p.failReason"
              class="mt-4 rounded-md border border-danger/20 bg-danger-soft px-3 py-2 text-[13px] text-danger"
            >
              失败原因：{{ p.failReason }}
            </p>
          </Card>

          <Card title="订单信息">
            <div v-if="!p" class="grid gap-4 sm:grid-cols-2"><Skeleton v-for="i in 8" :key="i" class="h-10" /></div>
            <DescriptionList v-else :items="baseItems" :cols="2">
              <template #id="{ item }">
                <span class="flex items-center gap-1 font-mono text-[13px]">{{ item.value }}<CopyButton :value="item.value!" /></span>
              </template>
              <template #merchantOrderNo="{ item }">
                <span v-if="item.value" class="flex items-center gap-1 font-mono text-[13px]">{{ item.value }}<CopyButton :value="item.value" /></span>
                <span v-else class="text-muted-foreground">—</span>
              </template>
              <template #store>
                <RouterLink v-if="p.storeId" :to="`/stores/${p.storeId}`" class="text-primary hover:underline">{{ p.storeName ?? p.storeId }}</RouterLink>
                <span v-else class="text-muted-foreground">{{ p.storeName ?? '—' }}</span>
              </template>
              <template #coreStatus="{ item }"><span class="font-mono text-[13px]">{{ item.value }}</span></template>
              <template #channel><ChannelBadge :channel="p.channel" /></template>
            </DescriptionList>
          </Card>

          <Card :title="`退款记录（${refunds.data.value?.total ?? 0}）`" body-class="p-0">
            <DataTable
              :columns="refundColumns"
              :data="refunds.data.value?.items ?? []"
              :loading="refunds.loading.value"
              :error="refunds.error.value"
              :skeleton-rows="2"
              :row-key="(r: Refund) => r.id"
              clickable
              empty-title="暂无退款记录"
              @row-click="(r: Refund) => router.push(`/refunds/${r.id}`)"
              @retry="refunds.reload()"
            />
          </Card>

          <Card title="Webhook 通知" description="与该订单相关的事件通知" body-class="p-0">
            <WebhookDeliveryList :items="deliveries.data.value ?? []" :loading="deliveries.loading.value" :error="deliveries.error.value" @retry="deliveries.reload()" />
          </Card>
        </div>

        <div class="flex flex-col gap-5">
          <Card title="可退款信息">
            <Skeleton v-if="!info.data.value" class="h-32" />
            <RefundSummaryCard v-else :info="info.data.value" />
          </Card>
          <Card title="交易时间线">
            <div v-if="!p" class="flex flex-col gap-4"><Skeleton v-for="i in 3" :key="i" class="h-10" /></div>
            <TransactionTimeline v-else :steps="steps" />
          </Card>
        </div>
      </div>

      <CreateRefundDialog v-if="p" v-model:open="refundOpen" :payment="p" @created="onRefundCreated" />
    </template>
  </div>
</template>
