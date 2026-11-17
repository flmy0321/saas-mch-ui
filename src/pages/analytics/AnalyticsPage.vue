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
import { formatMoney } from '@/utils/format'
import { formatCount } from '@/utils/count'
import { toFen } from '@/utils/money'
import { averageAmount, chartPoint, reportErrorText, successRateText } from '@/utils/reporting'
import { DIRECTORY_MODE_OBSERVED_ONLY } from '@/types'
import type { AnalyticsBucketView, Granularity, PaymentChannel } from '@/types'

const DAY_MS = 86_400_000
/** +08:00 口径的 YYYY-MM-DD；当天未结束会被服务端以 422 REPORTING_DAY_INCOMPLETE 拒绝，默认取最近一个已完成营业日 */
const shanghaiYmd = (ms: number) => new Date(ms + 8 * 3_600_000).toISOString().slice(0, 10)
const lastCompletedYmd = shanghaiYmd(Date.now() - DAY_MS)
const defaultFromYmd = shanghaiYmd(new Date(`${lastCompletedYmd}T12:00:00+08:00`).getTime() - 29 * DAY_MS)

const { applied, draft, apply } = useQueryFilters({
  from: defaultFromYmd,
  to: lastCompletedYmd,
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
const t = computed(() => result.data.value?.current.metrics)
const pres = computed(() => result.data.value?.presentation)
const loading = computed(() => result.loading.value && !result.data.value)
const resultError = computed(() => reportErrorText(result))
const avgText = computed(() => {
  const v = averageAmount(pres.value)
  return v === null ? '不可计算' : formatMoney(v)
})

const points = computed<SeriesPoint[]>(() => (result.data.value?.buckets ?? []).map((b) => chartPoint(b.key, b)))
const shares = computed(() => result.data.value?.byChannel ?? [])
const observedOnly = computed(() => result.data.value?.directoryMode === DIRECTORY_MODE_OBSERVED_ONLY)
const storeByCode = computed(() => new Map((stores.data.value ?? []).map((s) => [s.id, s])))
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
  return rows.map((r, i) => {
    const known = r.storeCode ? storeByCode.value.get(r.storeCode) : undefined
    return {
      key: r.storeCode ?? `unlinked-${i}`,
      name: r.storeCode === null ? '未关联门店' : (known?.name ?? r.storeCode),
      to: known ? `/stores/${known.id}` : null,
      amount: r.amount,
      count: r.count,
      ratio: Number(((fens[i] ?? 0n) * 10000n) / max) / 10000,
    }
  })
})

const right = (text: string) => h('span', { class: 'tabular whitespace-nowrap' }, text)
const bucketAvg = (b: AnalyticsBucketView) => {
  const v = averageAmount(b.presentation)
  return v === null ? '不可计算' : formatMoney(v)
}
const columns: ColumnDef<AnalyticsBucketView>[] = [
  { id: 'label', header: '时间', cell: ({ row }) => h('span', { class: 'tabular' }, row.original.key) },
  { id: 'successAmount', header: '成功金额', meta: { align: 'right' }, cell: ({ row }) => h(MoneyDisplay, { amount: row.original.metrics.successAmount, class: 'font-medium' }) },
  { id: 'successCount', header: '成功笔数', meta: { align: 'right' }, cell: ({ row }) => right(formatCount(row.original.metrics.successCount)) },
  { id: 'successRate', header: '成功率', meta: { align: 'right' }, cell: ({ row }) => right(successRateText(row.original.presentation)) },
  { id: 'avgAmount', header: '笔均金额', meta: { align: 'right' }, cell: ({ row }) => right(bucketAvg(row.original)) },
  { id: 'refundAmount', header: '退款金额', meta: { align: 'right' }, cell: ({ row }) => right(formatMoney(row.original.metrics.refundAmount)) },
  { id: 'refundCount', header: '退款笔数', meta: { align: 'right' }, cell: ({ row }) => right(formatCount(row.original.metrics.refundCount)) },
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
      <MetricCard label="成功交易笔数" :loading="loading" :value="t ? formatCount(t.successCount) : undefined" />
      <MetricCard label="支付成功率" :loading="loading" :value="t ? successRateText(pres) : undefined" />
      <MetricCard label="笔均金额" :loading="loading" :value="t ? avgText : undefined" />
      <MetricCard label="退款金额" :loading="loading" :value="t ? formatMoney(t.refundAmount) : undefined" />
      <MetricCard label="退款笔数" :loading="loading" :value="t ? formatCount(t.refundCount) : undefined" />
    </section>
    <p v-if="resultError" role="alert" class="-mt-2 text-sm text-destructive">{{ resultError }}</p>
    <p v-else-if="result.data.value" class="-mt-2 text-xs text-muted-foreground">
      统计已完成营业日 {{ result.data.value.current.fromDate }} 至 {{ result.data.value.current.toDate }}（{{ result.data.value.timezone }}），数据截至 {{ result.data.value.asOf }}
    </p>

    <div class="grid gap-4 xl:grid-cols-3">
      <ChartCard
        class="xl:col-span-2"
        title="成功交易金额"
        description="单位：元"
        :loading="result.loading.value"
        :error="resultError"
        :empty="!points.length"
        :height="300"
        @retry="result.reload()"
      >
        <EChart :option="trendOption" label="成功交易金额趋势图" />
      </ChartCard>
      <ChartCard title="渠道分布" description="按成功金额" :loading="result.loading.value" :error="resultError" :empty="!shares.length" :height="300" @retry="result.reload()">
        <EChart :option="donutOption" label="渠道分布环形图" />
      </ChartCard>
      <ChartCard title="支付成功率" :loading="result.loading.value" :error="resultError" :empty="!points.length" :height="240" @retry="result.reload()">
        <EChart :option="rateOption" label="支付成功率趋势图" />
      </ChartCard>
      <ChartCard class="xl:col-span-2" title="支付与退款" description="单位：元" :loading="result.loading.value" :error="resultError" :empty="!points.length" :height="240" @retry="result.reload()">
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
      <Card title="门店排行" :description="observedOnly ? '按成功交易金额，仅列出有交易的门店，未列出不代表零交易' : '按成功交易金额'">
        <ol v-if="storeRank.length" class="flex flex-col gap-3.5">
          <li v-for="(s, i) in storeRank" :key="s.key" class="flex flex-col gap-1.5">
            <div class="flex items-center gap-2 text-[13px]">
              <span class="w-4 text-xs text-muted-foreground tabular">{{ i + 1 }}</span>
              <RouterLink v-if="s.to" :to="s.to" class="min-w-0 flex-1 truncate hover:text-primary">{{ s.name }}</RouterLink>
              <span v-else class="min-w-0 flex-1 truncate text-muted-foreground">{{ s.name }}</span>
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
        <DataTable :columns="columns" :data="tableRows" :loading="result.loading.value" :error="resultError" :skeleton-rows="6" @retry="result.reload()" />
      </Card>
    </div>
  </div>
</template>
