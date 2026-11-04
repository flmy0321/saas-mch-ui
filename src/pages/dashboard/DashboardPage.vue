<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { ArrowRight, CircleCheck, Clock, Receipt, RotateCcw, Undo2, Wallet } from '@lucide/vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import MetricCard from '@/components/ui/MetricCard.vue'
import ChartCard from '@/components/ui/ChartCard.vue'
import EChart from '@/components/ui/EChart.vue'
import Card from '@/components/ui/Card.vue'
import DataTable from '@/components/ui/DataTable.vue'
import Button from '@/components/ui/Button.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import { useAsync } from '@/composables/useAsync'
import { useTradeCharts, type SeriesPoint } from '@/composables/useTradeCharts'
import { buildPaymentColumns } from '@/pages/payments/paymentColumns'
import { useSessionStore } from '@/stores/session'
import { api } from '@/services/api'
import { channelMeta } from '@/utils/dictionaries'
import { formatMoney, formatNumber, formatPercent, toDateInput } from '@/utils/format'
import { fenToAmount, toFen } from '@/utils/money'
import type { ChannelShare, Payment } from '@/types'

const router = useRouter()
const { user } = storeToRefs(useSessionStore())
const days = ref<number>(7)
const metric = ref<'amount' | 'count'>('amount')

const summary = useAsync(() => api.dashboard.summary())
const trend = useAsync(() => api.dashboard.trend(30))
const share = useAsync(() => api.dashboard.channelShare(days.value), { watch: days })
const recent = useAsync(() => api.dashboard.recentPayments(8))

const points = computed<SeriesPoint[]>(() =>
  (trend.data.value?.points ?? []).map((p) => ({ ...p, label: p.date.slice(5).replace('-', '/') })),
)
const windowed = computed(() => points.value.slice(-days.value))

const charts = useTradeCharts()
const trendOption = charts.amountTrend(windowed, metric)
const rateOption = charts.successRate(points)
const compareOption = charts.payVsRefund(windowed)
const shares = computed<ChannelShare[]>(() => share.data.value?.items ?? [])
const donutOption = charts.channelDonut(shares)
const shareTotalFen = computed(() => shares.value.reduce((s, c) => s + (toFen(c.amount) ?? 0n), 0n))
const shareTotal = computed(() => fenToAmount(shareTotalFen.value))
const sharePercent = (amount: string) => {
  const part = toFen(amount)
  if (!shareTotalFen.value || part === null) return '-'
  return formatPercent(Number((part * 10000n) / shareTotalFen.value) / 10000, 1)
}

const greeting = computed(() => {
  const h = new Date().getHours()
  return h < 6 ? '夜深了' : h < 12 ? '早上好' : h < 18 ? '下午好' : '晚上好'
})

const today = toDateInput(new Date())
const columns = buildPaymentColumns({ include: ['id', 'storeName', 'amount', 'channel', 'status', 'createdAt'] })

function reloadAll() {
  summary.reload()
  trend.reload()
  share.reload()
  recent.reload()
}

const s = computed(() => summary.data.value)
const dayOptions = [
  { value: 7, label: '近 7 天' },
  { value: 14, label: '近 14 天' },
  { value: 30, label: '近 30 天' },
]
</script>

<template>
  <div class="flex flex-col gap-6">
    <PageHeader :title="`${greeting}，${user?.name ?? ''}`" description="以下为今日 00:00 至当前的实时交易数据，与昨日同时段对比。">
      <template #actions>
        <Button variant="secondary" size="sm" :loading="summary.loading.value" @click="reloadAll">
          <RotateCcw aria-hidden="true" />刷新
        </Button>
        <Button :as="RouterLink" to="/payments" variant="primary" size="sm">查看全部订单</Button>
      </template>
    </PageHeader>

    <ErrorState v-if="summary.error.value" :message="summary.error.value" @retry="summary.reload()" />
    <section v-else aria-label="今日核心指标" class="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      <MetricCard
        class="col-span-2 lg:col-span-1 xl:col-span-2"
        label="今日成功交易金额"
        :icon="Wallet"
        :loading="summary.loading.value && !s"
        :value="s ? formatMoney(s.todaySuccessAmount) : undefined"
        :delta="s?.compare.successAmount"
        delta-label="较昨日"
        interactive
        @select="router.push({ path: '/payments', query: { status: 'SUCCESS', paidFrom: today, paidTo: today } })"
      />
      <MetricCard
        label="今日成功笔数"
        :icon="Receipt"
        :loading="summary.loading.value && !s"
        :value="s ? formatNumber(s.todaySuccessCount) : undefined"
        :delta="s?.compare.successCount"
        delta-label="较昨日"
      />
      <MetricCard
        label="支付成功率"
        :icon="CircleCheck"
        :loading="summary.loading.value && !s"
        :value="s ? formatPercent(s.todaySuccessRate) : undefined"
        :delta="s?.compare.successRate"
        delta-label="较昨日"
        hint="成功笔数 / 已提交支付笔数"
      />
      <MetricCard
        label="今日退款金额"
        :icon="Undo2"
        :loading="summary.loading.value && !s"
        :value="s ? formatMoney(s.todayRefundAmount) : undefined"
        :delta="s?.compare.refundAmount"
        delta-label="较昨日"
        invert-delta
        interactive
        @select="router.push({ path: '/refunds', query: { createdFrom: today, createdTo: today } })"
      />
      <MetricCard
        label="处理中订单"
        :icon="Clock"
        :loading="summary.loading.value && !s"
        :value="s ? formatNumber(s.processingCount) : undefined"
        hint="支付中 / 关闭中"
        interactive
        @select="router.push({ path: '/payments', query: { status: 'PAYING' } })"
      />
    </section>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-sm font-semibold">交易趋势</h2>
      <SegmentedControl v-model="days" :options="dayOptions" aria-label="统计周期" size="sm" />
    </div>

    <div class="grid gap-4 xl:grid-cols-3">
      <ChartCard
        class="xl:col-span-2"
        title="成功交易走势"
        :description="metric === 'amount' ? '按支付成功时间统计，单位：元' : '按支付成功时间统计，单位：笔'"
        :loading="trend.loading.value"
        :error="trend.error.value"
        :empty="!windowed.length"
        :height="300"
        @retry="trend.reload()"
      >
        <template #actions>
          <SegmentedControl
            v-model="metric"
            size="sm"
            aria-label="指标"
            :options="[
              { value: 'amount', label: '金额' },
              { value: 'count', label: '笔数' },
            ]"
          />
        </template>
        <EChart :option="trendOption" label="成功交易走势图" />
      </ChartCard>

      <ChartCard
        title="支付渠道占比"
        description="按成功交易金额"
        :loading="share.loading.value"
        :error="share.error.value"
        :empty="!shares.length"
        :height="300"
        @retry="share.reload()"
      >
        <div class="flex h-full flex-col">
          <div class="relative min-h-0 flex-1">
            <EChart :option="donutOption" label="支付渠道占比环形图" />
            <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span class="text-xs text-muted-foreground">合计</span>
              <span class="text-base font-semibold tabular">{{ formatMoney(shareTotal) }}</span>
            </div>
          </div>
          <ul class="mt-3 flex flex-col gap-2">
            <li v-for="c in shares" :key="c.channel" class="flex items-center gap-2 text-[13px]">
              <span class="size-2 rounded-sm" :style="{ background: c.channel === 'ALIPAY' ? charts.colors.value.chart1 : c.channel === 'WECHAT' ? charts.colors.value.chart2 : c.channel === 'UNIONPAY' ? charts.colors.value.chart3 : channelMeta(c.channel).color }" />
              <span class="flex-1">{{ channelMeta(c.channel).label }}</span>
              <span class="text-muted-foreground tabular">{{ formatNumber(c.count) }} 笔</span>
              <span class="w-14 text-right font-medium tabular">{{ sharePercent(c.amount) }}</span>
            </li>
          </ul>
        </div>
      </ChartCard>

      <ChartCard
        title="支付成功率"
        description="近 30 天每日成功率"
        :loading="trend.loading.value"
        :error="trend.error.value"
        :empty="!points.length"
        :height="240"
        @retry="trend.reload()"
      >
        <EChart :option="rateOption" label="支付成功率走势图" />
      </ChartCard>

      <ChartCard
        class="xl:col-span-2"
        title="支付与退款对比"
        description="单位：元"
        :loading="trend.loading.value"
        :error="trend.error.value"
        :empty="!windowed.length"
        :height="240"
        @retry="trend.reload()"
      >
        <template #legend>
          <div class="flex items-center gap-4 text-xs text-muted-foreground">
            <span class="flex items-center gap-1.5"><span class="size-2 rounded-sm bg-chart-1" />支付金额</span>
            <span class="flex items-center gap-1.5"><span class="size-2 rounded-sm bg-chart-4" />退款金额</span>
          </div>
        </template>
        <EChart :option="compareOption" label="支付与退款金额对比柱状图" />
      </ChartCard>
    </div>

    <Card title="最近交易" description="最新创建的支付订单" body-class="p-0">
      <template #actions>
        <Button :as="RouterLink" to="/payments" variant="ghost" size="sm">全部订单<ArrowRight aria-hidden="true" /></Button>
      </template>
      <DataTable
        :columns="columns"
        :data="recent.data.value ?? []"
        :loading="recent.loading.value"
        :error="recent.error.value"
        :skeleton-rows="6"
        :row-key="(r: Payment) => r.id"
        clickable
        empty-title="今日暂无交易"
        @row-click="(r: Payment) => router.push(`/payments/${r.id}`)"
        @retry="recent.reload()"
      />
    </Card>
  </div>
</template>
