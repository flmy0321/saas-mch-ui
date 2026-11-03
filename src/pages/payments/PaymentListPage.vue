<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useLocalStorage } from '@vueuse/core'
import { toast } from 'vue-sonner'
import { Download } from '@lucide/vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import Card from '@/components/ui/Card.vue'
import FilterPanel from '@/components/ui/FilterPanel.vue'
import FormField from '@/components/ui/FormField.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import DateRangePicker from '@/components/ui/DateRangePicker.vue'
import DataTable from '@/components/ui/DataTable.vue'
import Pagination from '@/components/ui/Pagination.vue'
import ColumnSettings from '@/components/ui/ColumnSettings.vue'
import Button from '@/components/ui/Button.vue'
import { useAsync } from '@/composables/useAsync'
import { useQueryFilters } from '@/composables/useQueryFilters'
import { buildPaymentColumns, PAYMENT_COLUMN_LABELS, type PaymentColumnId } from './paymentColumns'
import { api } from '@/services/api'
import { CHANNEL, METHOD, PAYMENT_STATUS, toOptions } from '@/utils/dictionaries'
import { formatNumber } from '@/utils/format'
import type { Payment, PaymentChannel, PaymentMethod, PaymentQuery, PaymentStatus } from '@/types'

const router = useRouter()

const filters = useQueryFilters({
  paymentId: '',
  merchantOrderNo: '',
  storeId: '',
  channel: '',
  method: '',
  status: '',
  createdFrom: '',
  createdTo: '',
  paidFrom: '',
  paidTo: '',
})
const { draft, applied, page, pageSize, sorting } = filters

const stores = useAsync(() => api.stores.all())
const storeOptions = computed(() => (stores.data.value ?? []).map((s) => ({ value: s.id, label: s.name })))
const channelOptions = toOptions(CHANNEL as Record<PaymentChannel, { label: string }>)
const methodOptions = toOptions(METHOD)
const statusOptions = toOptions(PAYMENT_STATUS)

const query = computed<PaymentQuery>(() => {
  const a = applied.value
  const s = sorting.value[0]
  return {
    page: page.value,
    pageSize: pageSize.value,
    sortBy: s?.id,
    sortOrder: s ? (s.desc ? 'desc' : 'asc') : undefined,
    paymentId: a.paymentId || undefined,
    merchantOrderNo: a.merchantOrderNo || undefined,
    storeId: a.storeId || undefined,
    channel: (a.channel || undefined) as PaymentChannel | undefined,
    method: (a.method || undefined) as PaymentMethod | undefined,
    status: (a.status || undefined) as PaymentStatus | undefined,
    createdFrom: a.createdFrom || undefined,
    createdTo: a.createdTo || undefined,
    paidFrom: a.paidFrom || undefined,
    paidTo: a.paidTo || undefined,
  } as PaymentQuery
})

const list = useAsync(() => api.payments.list(query.value), { watch: query })

const columns = buildPaymentColumns({ sortable: true })
const columnMeta = (Object.keys(PAYMENT_COLUMN_LABELS) as PaymentColumnId[]).map((id) => ({
  id,
  label: PAYMENT_COLUMN_LABELS[id],
  locked: id === 'id' || id === 'amount' || id === 'status',
}))
const visibility = useLocalStorage<Record<string, boolean>>('payhub:payment-columns', { method: false })

const exporting = ref(false)
async function exportCsv() {
  exporting.value = true
  try {
    const { filename, rows, content } = await api.payments.exportCsv(query.value)
    const blob = new Blob(['\uFEFF', content], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = Object.assign(document.createElement('a'), { href: url, download: filename })
    a.click()
    URL.revokeObjectURL(url)
    toast.success('导出成功', { description: `共 ${formatNumber(rows)} 条记录，已下载 ${filename}` })
  } catch (e) {
    toast.error('导出失败', { description: e instanceof Error ? e.message : undefined })
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader title="支付订单" description="查询商户全部门店的支付订单，支持按订单号、门店、渠道、状态及时间范围筛选。">
      <template #actions>
        <Button size="sm" :loading="exporting" :disabled="!list.data.value?.total" @click="exportCsv">
          <Download aria-hidden="true" />导出 CSV
        </Button>
      </template>
    </PageHeader>

    <Card body-class="p-0">
      <FilterPanel :active-count="filters.activeCount.value" collapsible @apply="filters.apply()" @reset="filters.reset()">
        <FormField label="平台支付订单号" for="f-pid">
          <Input id="f-pid" v-model="draft.paymentId" placeholder="如 P2026…" class="font-mono" />
        </FormField>
        <FormField label="商户订单号" for="f-mno">
          <Input id="f-mno" v-model="draft.merchantOrderNo" placeholder="商户系统订单号" class="font-mono" />
        </FormField>
        <FormField label="支付状态" for="f-status">
          <Select id="f-status" v-model="draft.status" :options="statusOptions" allow-all />
        </FormField>
        <FormField label="创建时间">
          <DateRangePicker v-model:from="draft.createdFrom" v-model:to="draft.createdTo" aria-label="创建时间范围" clearable />
        </FormField>
        <template #more>
          <FormField label="门店" for="f-store">
            <Select id="f-store" v-model="draft.storeId" :options="storeOptions" allow-all all-label="全部门店" />
          </FormField>
          <FormField label="支付渠道" for="f-channel">
            <Select id="f-channel" v-model="draft.channel" :options="channelOptions" allow-all />
          </FormField>
          <FormField label="支付方式" for="f-method">
            <Select id="f-method" v-model="draft.method" :options="methodOptions" allow-all />
          </FormField>
          <FormField label="支付时间">
            <DateRangePicker v-model:from="draft.paidFrom" v-model:to="draft.paidTo" aria-label="支付时间范围" clearable />
          </FormField>
        </template>
      </FilterPanel>

      <div class="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
        <p class="text-[13px] text-muted-foreground" aria-live="polite">
          共 <span class="font-medium text-foreground tabular">{{ formatNumber(list.data.value?.total ?? 0) }}</span> 笔订单
        </p>
        <ColumnSettings v-model="visibility" :columns="columnMeta" />
      </div>

      <DataTable
        v-model:sorting="sorting"
        :columns="columns"
        :data="list.data.value?.items ?? []"
        :loading="list.loading.value"
        :error="list.error.value"
        :column-visibility="visibility"
        :row-key="(r: Payment) => r.id"
        clickable
        empty-title="没有符合条件的订单"
        empty-description="尝试调整筛选条件，或重置后重新查询。"
        @row-click="(r: Payment) => router.push(`/payments/${r.id}`)"
        @retry="list.reload()"
      >
        <template #empty-actions>
          <Button size="sm" @click="filters.reset()">重置筛选</Button>
        </template>
      </DataTable>

      <div class="border-t border-border px-4 py-3 sm:px-5">
        <Pagination v-model:page="page" v-model:page-size="pageSize" :total="list.data.value?.total ?? 0" />
      </div>
    </Card>
  </div>
</template>
