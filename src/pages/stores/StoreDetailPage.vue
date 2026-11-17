<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { ArrowLeft, ArrowRight, FileSearch, Pencil } from '@lucide/vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import Card from '@/components/ui/Card.vue'
import Button from '@/components/ui/Button.vue'
import MetricCard from '@/components/ui/MetricCard.vue'
import ChartCard from '@/components/ui/ChartCard.vue'
import EChart from '@/components/ui/EChart.vue'
import DataTable from '@/components/ui/DataTable.vue'
import DescriptionList from '@/components/ui/DescriptionList.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import StoreFormDrawer from '@/components/business/StoreFormDrawer.vue'
import { useAsync } from '@/composables/useAsync'
import { useTradeCharts, type SeriesPoint } from '@/composables/useTradeCharts'
import { buildPaymentColumns } from '@/pages/payments/paymentColumns'
import { api } from '@/services/api'
import { storeViewStatusMeta } from '@/utils/dictionaries'
import { formatDateTime, formatMoney } from '@/utils/format'
import { formatCount } from '@/utils/count'
import { chartPoint, dateLabel, reportErrorText, successRateText } from '@/utils/reporting'
import type { PaymentListItem } from '@/types'

const route = useRoute()
const router = useRouter()
const id = computed(() => String(route.params.id))

const store = useAsync(() => api.stores.get(id.value))
const s = computed(() => store.data.value?.store ?? null)
const storeCode = computed(() => s.value?.id ?? null)
const stats = useAsync(
  async () => {
    if (!storeCode.value) return null
    return api.stores.stats(storeCode.value)
  },
  { watch: storeCode, immediate: false },
)
const recent = useAsync(() => api.payments.list({ storeId: id.value, page: 1, pageSize: 8 }))
const statsError = computed(() => reportErrorText(stats))
const statusMeta = computed(() => storeViewStatusMeta(s.value?.status))
const st = computed(() => stats.data.value)
const notFound = computed(() => store.error.value?.includes('不存在'))

const points = computed<SeriesPoint[]>(() => (st.value?.points ?? []).map((p) => chartPoint(dateLabel(p.date), p)))
const metric = ref<'amount' | 'count'>('amount')
const trendOption = useTradeCharts().amountTrend(points, metric)

const items = computed(() =>
  s.value
    ? [
        { key: 'storeNo', label: '平台门店编号', value: s.value.storeNo },
        { key: 'merchantStoreNo', label: '商户门店编号', value: s.value.merchantStoreNo ?? '—' },
        { key: 'createdAt', label: '创建时间', value: formatDateTime(s.value.createdAt) },
      ]
    : [],
)

const columns = buildPaymentColumns<PaymentListItem>({ include: ['id', 'merchantOrderNo', 'amount', 'channel', 'status', 'createdAt'] })

const editOpen = ref(false)
function onSaved(code: string | null) {
  if (code) store.reload()
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <EmptyState v-if="notFound" :icon="FileSearch" title="门店不存在" class="py-28">
      <Button :as="RouterLink" to="/stores" variant="primary">返回门店列表</Button>
    </EmptyState>
    <ErrorState v-else-if="store.error.value" :message="store.error.value" class="py-28" @retry="store.reload()" />

    <template v-else>
      <PageHeader :breadcrumb="[{ label: '门店管理', to: '/stores' }, { label: s?.name ?? '门店详情' }]">
        <template #title>
          <div class="flex flex-wrap items-center gap-3">
            <Button :as="RouterLink" to="/stores" variant="ghost" size="icon" class="size-8" aria-label="返回门店列表">
              <ArrowLeft aria-hidden="true" />
            </Button>
            <h1 v-if="s" class="text-xl font-semibold tracking-tight">{{ s.name }}</h1>
            <Skeleton v-else class="h-7 w-48" />
            <StatusBadge v-if="s" :tone="statusMeta.tone" dot>{{ statusMeta.label }}</StatusBadge>
          </div>
        </template>
        <template #actions>
          <Button :disabled="!storeCode" @click="editOpen = true"><Pencil aria-hidden="true" />编辑门店</Button>
        </template>
      </PageHeader>

      <section aria-label="近 30 个已完成营业日指标" class="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="近 30 天成功金额" :loading="!st && !statsError" :value="st ? formatMoney(st.metrics.successAmount) : statsError ? '—' : undefined" />
        <MetricCard label="近 30 天成功笔数" :loading="!st && !statsError" :value="st ? formatCount(st.metrics.successCount) : statsError ? '—' : undefined" />
        <MetricCard label="近 30 天退款金额" :loading="!st && !statsError" :value="st ? formatMoney(st.metrics.refundAmount) : statsError ? '—' : undefined" />
        <MetricCard label="支付成功率" :loading="!st && !statsError" :value="st ? successRateText(st.presentation) : statsError ? '—' : undefined" />
      </section>
      <p v-if="st" class="-mt-2 text-xs text-muted-foreground">
        统计已完成营业日 {{ st.fromDate }} 至 {{ st.toDate }}（{{ st.timezone }}），数据截至 {{ st.asOf }}
      </p>

      <div class="grid gap-5 xl:grid-cols-3">
        <ChartCard
          class="xl:col-span-2"
          title="近 30 天成功交易"
          description="单位：元"
          :loading="stats.loading.value"
          :error="statsError"
          :empty="!points.length"
          :height="260"
          @retry="stats.reload()"
        >
          <EChart :option="trendOption" label="门店近 30 天交易趋势" />
        </ChartCard>
        <Card title="门店信息">
          <div v-if="!s" class="flex flex-col gap-3"><Skeleton v-for="i in 5" :key="i" class="h-9" /></div>
          <DescriptionList v-else :items="items" :cols="1">
            <template #storeNo="{ item }"><span class="font-mono text-[13px]">{{ item.value }}</span></template>
            <template #merchantStoreNo="{ item }"><span class="font-mono text-[13px]">{{ item.value }}</span></template>
          </DescriptionList>
        </Card>
      </div>

      <Card title="最近订单" body-class="p-0">
        <template #actions>
          <Button :as="RouterLink" :to="{ path: '/payments', query: { storeId: id } }" variant="ghost" size="sm">
            查看全部<ArrowRight aria-hidden="true" />
          </Button>
        </template>
        <DataTable
          :columns="columns"
          :data="recent.data.value?.items ?? []"
          :loading="recent.loading.value"
          :error="recent.error.value"
          :skeleton-rows="5"
          :row-key="(r: PaymentListItem) => r.id"
          clickable
          empty-title="该门店暂无订单"
          @row-click="(r: PaymentListItem) => router.push(`/payments/${r.id}`)"
          @retry="recent.reload()"
        />
      </Card>

      <StoreFormDrawer v-model:open="editOpen" :store-code="storeCode" @saved="onSaved" />
    </template>
  </div>
</template>
