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
import { STORE_STATUS } from '@/utils/dictionaries'
import { formatDateTime, formatMoney, formatNumber, formatPercent } from '@/utils/format'
import type { PaymentListItem } from '@/types'

const route = useRoute()
const router = useRouter()
const id = computed(() => String(route.params.id))

const store = useAsync(() => api.stores.get(id.value))
const stats = useAsync(() => api.stores.stats(id.value))
const recent = useAsync(() => api.payments.list({ storeId: id.value, page: 1, pageSize: 8 }))

const s = computed(() => store.data.value)
const st = computed(() => stats.data.value)
const notFound = computed(() => store.error.value?.includes('不存在'))
const editOpen = ref(false)

const points = computed<SeriesPoint[]>(() => (st.value?.trend ?? []).map((p) => ({ ...p, label: p.date.slice(5).replace('-', '/') })))
const metric = ref<'amount' | 'count'>('amount')
const trendOption = useTradeCharts().amountTrend(points, metric)

const items = computed(() =>
  s.value
    ? [
        { key: 'storeNo', label: '平台门店编号', value: s.value.storeNo },
        { key: 'merchantStoreNo', label: '商户门店编号', value: s.value.merchantStoreNo },
        { key: 'contact', label: '联系人', value: `${s.value.contactName}  ${s.value.contactPhone}` },
        { key: 'createdAt', label: '创建时间', value: formatDateTime(s.value.createdAt) },
        { key: 'address', label: '门店地址', value: s.value.address },
      ]
    : [],
)

const columns = buildPaymentColumns<PaymentListItem>({ include: ['id', 'merchantOrderNo', 'amount', 'channel', 'status', 'createdAt'] })
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
            <StatusBadge v-if="s" :tone="STORE_STATUS[s.status].tone" dot>{{ STORE_STATUS[s.status].label }}</StatusBadge>
          </div>
        </template>
        <template #actions>
          <Button :disabled="!s" @click="editOpen = true"><Pencil aria-hidden="true" />编辑门店</Button>
        </template>
      </PageHeader>

      <section aria-label="近 30 天指标" class="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="近 30 天成功金额" :loading="!st" :value="st ? formatMoney(st.last30Amount) : undefined" />
        <MetricCard label="近 30 天成功笔数" :loading="!st" :value="st ? formatNumber(st.last30Count) : undefined" />
        <MetricCard label="近 30 天退款金额" :loading="!st" :value="st ? formatMoney(st.last30RefundAmount) : undefined" />
        <MetricCard label="支付成功率" :loading="!st" :value="st ? formatPercent(st.successRate) : undefined" />
      </section>

      <div class="grid gap-5 xl:grid-cols-3">
        <ChartCard
          class="xl:col-span-2"
          title="近 30 天成功交易"
          description="单位：元"
          :loading="stats.loading.value"
          :error="stats.error.value"
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

      <StoreFormDrawer v-model:open="editOpen" :store="s" @saved="store.reload()" />
    </template>
  </div>
</template>
