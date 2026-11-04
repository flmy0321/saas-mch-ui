<script setup lang="ts">
import { computed, h, ref } from 'vue'
import { RouterLink } from 'vue-router'
import type { ColumnDef } from '@tanstack/vue-table'
import PageHeader from '@/components/layout/PageHeader.vue'
import Card from '@/components/ui/Card.vue'
import MetricCard from '@/components/ui/MetricCard.vue'
import ChartCard from '@/components/ui/ChartCard.vue'
import EChart from '@/components/ui/EChart.vue'
import DataTable from '@/components/ui/DataTable.vue'
import Select from '@/components/ui/Select.vue'
import DateRangePicker from '@/components/ui/DateRangePicker.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import MoneyDisplay from '@/components/business/MoneyDisplay.vue'
import { useAsync } from '@/composables/useAsync'
import { useQueryFilters } from '@/composables/useQueryFilters'
import { useTradeCharts, type SeriesPoint } from '@/composables/useTradeCharts'
import { api } from '@/services/api'
import { CHANNEL, toOptions } from '@/utils/dictionaries'
import { formatMoney, formatNumber, formatPercent, toDateInput } from '@/utils/format'
import { toFen } from '@/utils/money'
import type { AnalyticsBucket, Granularity, PaymentChannel } from '@/types'

const end = new Date()
const start = new Date(end.getTime() - 29 * 86400000)

const { applied, draft, apply } = useQueryFilters({
  from: toDateInput(start),
  to: toDateInput(end),
  granularity: 'day',
  storeId: '',
  channel: '',
})

function set<K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) {
  draft[k] = v
  apply()
}

const stores = useAsync(() => api.stores.all())
const storeOptions = computed(() => (stores.data.value ?? []).map((s) => ({ value: s.id, label: s.name })))
const channelOptions = toOptions(CHANNEL as Record<PaymentChannel, { label: string }>)

const q = computed(() => ({
  from: applied.value.from,
  to: applied.value.to,
  granularity: applied.value.granularity as Granularity,
  storeId: applied.value.storeId || undefined,
  channel: (applied.value.channel || undefined) as PaymentChannel | undefined,
}))
const result = useAsync(() => api.analytics.query(q.value), { watch: q })
const t = computed(() => result.data.value?.totals)
const loading = computed(() => result.loading.value && !result.data.value)

const points = computed<SeriesPoint[]>(() => (result.data.value?.buckets ?? []).map((b) => ({ ...b })))
const shares = computed(() => result.data.value?.byChannel ?? [])
const metric = ref<'amount' | 'count'>('amount')
const charts = useTradeCharts()
const trendOption = charts.amountTrend(points, metric)
const rateOption = charts.successRate(points)
const compareOption = charts.payVsRefund(points)
const donutOption = charts.channelDonut(shares)

const storeRank = computed(() => {
  const rows = result.data.value?.byStore ?? []
  const fens = rows.map((r) => toFen(r.amount) ?? 0n)
  const max = fens.reduce((m, f) => (f > m ? f : m), 1n)
  return rows.map((r, i) => ({ ...r, ratio: Number(((fens[i] ?? 0n) * 10000n) / max) / 10000 }))
})

const refundRate = computed(() => {
  const success = toFen(t.value?.successAmount)
  const refund = toFen(t.value?.refundAmount)
  if (!success || refund === null) return '—'
  return formatPercent(Number((refund * 1000000n) / success) / 1000000)
})

const right = (text: string) => h('span', { class: 'tabular whitespace-nowrap' }, text)
const columns: ColumnDef<AnalyticsBucket>[] = [
  { id: 'label', header: '时间', cell: ({ row }) => h('span', { class: 'tabular' }, row.original.label) },
  { id: 'successAmount', header: '成功金额', meta: { align: 'right' }, cell: ({ row }) => h(MoneyDisplay, { amount: row.original.successAmount, class: 'font-medium' }) },
  { id: 'successCount', header: '成功笔数', meta: { align: 'right' }, cell: ({ row }) => right(formatNumber(row.original.successCount)) },
  { id: 'successRate', header: '成功率', meta: { align: 'right' }, cell: ({ row }) => right(formatPercent(row.original.successRate)) },
  { id: 'avgAmount', header: '客单价', meta: { align: 'right' }, cell: ({ row }) => right(formatMoney(row.original.avgAmount)) },
  { id: 'refundAmount', header: '退款金额', meta: { align: 'right' }, cell: ({ row }) => right(formatMoney(row.original.refundAmount)) },
  { id: 'refundCount', header: '退款笔数', meta: { align: 'right' }, cell: ({ row }) => right(formatNumber(row.original.refundCount)) },
]
const tableRows = computed(() => [...(result.data.value?.buckets ?? [])].reverse())
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader title="交易统计" description="按时间、门店、渠道维度分析交易表现。金额统计口径为支付成功时间。" />

    <Card padded>
      <div class="flex flex-wrap items-end gap-3">
        <div class="flex flex-col gap-1.5">
          <span class="text-xs font-medium text-muted-foreground">统计时间</span>
          <DateRangePicker
            :from="draft.from"
            :to="draft.to"
            :max-days="366"
            aria-label="统计时间范围"
            class="w-64"
            @update:from="(v: string) => set('from', v)"
            @update:to="(v: string) => set('to', v)"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <span class="text-xs font-medium text-muted-foreground">门店</span>
          <Select
            :model-value="draft.storeId"
            :options="storeOptions"
            allow-all
            all-label="全部门店"
            aria-label="门店"
            class="w-44"
            @update:model-value="(v: string) => set('storeId', v)"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <span class="text-xs font-medium text-muted-foreground">支付渠道</span>
          <Select
            :model-value="draft.channel"
            :options="channelOptions"
            allow-all
            aria-label="支付渠道"
            class="w-36"
            @update:model-value="(v: string) => set('channel', v)"
          />
        </div>
        <div class="ml-auto flex flex-col gap-1.5">
          <span class="text-xs font-medium text-muted-foreground">统计粒度</span>
          <SegmentedControl
            :model-value="draft.granularity"
            aria-label="统计粒度"
            :options="[
              { value: 'day', label: '按日' },
              { value: 'week', label: '按周' },
              { value: 'month', label: '按月' },
            ]"
            @update:model-value="(v: string) => set('granularity', v)"
          />
        </div>
      </div>
    </Card>

    <section aria-label="汇总指标" class="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      <MetricCard label="成功交易金额" :loading="loading" :value="t ? formatMoney(t.successAmount) : undefined" class="col-span-2 lg:col-span-1" />
      <MetricCard label="成功交易笔数" :loading="loading" :value="t ? formatNumber(t.successCount) : undefined" />
      <MetricCard label="支付成功率" :loading="loading" :value="t ? formatPercent(t.successRate) : undefined" />
      <MetricCard label="客单价" :loading="loading" :value="t ? formatMoney(t.avgAmount) : undefined" />
      <MetricCard label="退款金额" :loading="loading" :value="t ? formatMoney(t.refundAmount) : undefined" />
      <MetricCard
        label="退款率"
        hint="退款金额 / 成功金额"
        :loading="loading"
        :value="t ? refundRate : undefined"
      />
    </section>

    <div class="grid gap-4 xl:grid-cols-3">
      <ChartCard
        class="xl:col-span-2"
        title="成功交易金额"
        description="单位：元"
        :loading="result.loading.value"
        :error="result.error.value"
        :empty="!points.length"
        :height="300"
        @retry="result.reload()"
      >
        <EChart :option="trendOption" label="成功交易金额趋势图" />
      </ChartCard>
      <ChartCard title="渠道分布" description="按成功金额" :loading="result.loading.value" :error="result.error.value" :empty="!shares.length" :height="300" @retry="result.reload()">
        <EChart :option="donutOption" label="渠道分布环形图" />
      </ChartCard>
      <ChartCard title="支付成功率" :loading="result.loading.value" :error="result.error.value" :empty="!points.length" :height="240" @retry="result.reload()">
        <EChart :option="rateOption" label="支付成功率趋势图" />
      </ChartCard>
      <ChartCard class="xl:col-span-2" title="支付与退款" description="单位：元" :loading="result.loading.value" :error="result.error.value" :empty="!points.length" :height="240" @retry="result.reload()">
        <template #legend>
          <div class="flex items-center gap-4 text-xs text-muted-foreground">
            <span class="flex items-center gap-1.5"><span class="size-2 rounded-sm bg-chart-1" />支付金额</span>
            <span class="flex items-center gap-1.5"><span class="size-2 rounded-sm bg-chart-4" />退款金额</span>
          </div>
        </template>
        <EChart :option="compareOption" label="支付与退款对比图" />
      </ChartCard>
    </div>

    <div class="grid gap-4 xl:grid-cols-3">
      <Card title="门店排行" description="按成功交易金额">
        <ol v-if="storeRank.length" class="flex flex-col gap-3.5">
          <li v-for="(s, i) in storeRank" :key="s.storeId" class="flex flex-col gap-1.5">
            <div class="flex items-center gap-2 text-[13px]">
              <span class="w-4 text-xs text-muted-foreground tabular">{{ i + 1 }}</span>
              <RouterLink :to="`/stores/${s.storeId}`" class="min-w-0 flex-1 truncate hover:text-primary">{{ s.storeName }}</RouterLink>
              <span class="font-medium tabular">{{ formatMoney(s.amount) }}</span>
            </div>
            <div class="ml-6 h-1.5 overflow-hidden rounded-full bg-muted">
              <div class="h-full rounded-full bg-primary" :style="{ width: `${Math.max(2, s.ratio * 100)}%` }" />
            </div>
          </li>
        </ol>
        <p v-else class="py-8 text-center text-sm text-muted-foreground">暂无数据</p>
      </Card>
      <Card class="xl:col-span-2" title="明细数据" body-class="p-0 max-h-[420px] overflow-auto">
        <DataTable :columns="columns" :data="tableRows" :loading="result.loading.value" :error="result.error.value" :skeleton-rows="6" @retry="result.reload()" />
      </Card>
    </div>
  </div>
</template>
