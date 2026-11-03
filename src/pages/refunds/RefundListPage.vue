<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/layout/PageHeader.vue'
import Card from '@/components/ui/Card.vue'
import FilterPanel from '@/components/ui/FilterPanel.vue'
import FormField from '@/components/ui/FormField.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import DateRangePicker from '@/components/ui/DateRangePicker.vue'
import DataTable from '@/components/ui/DataTable.vue'
import Pagination from '@/components/ui/Pagination.vue'
import Button from '@/components/ui/Button.vue'
import { useAsync } from '@/composables/useAsync'
import { useQueryFilters } from '@/composables/useQueryFilters'
import { buildRefundColumns } from './refundColumns'
import { api } from '@/services/api'
import { REFUND_STATUS, toOptions } from '@/utils/dictionaries'
import { formatNumber } from '@/utils/format'
import type { Refund, RefundQuery, RefundStatus } from '@/types'

const router = useRouter()
const filters = useQueryFilters({
  refundId: '',
  merchantRefundNo: '',
  paymentId: '',
  storeId: '',
  status: '',
  createdFrom: '',
  createdTo: '',
})
const { draft, applied, page, pageSize, sorting } = filters

const stores = useAsync(() => api.stores.all())
const storeOptions = computed(() => (stores.data.value ?? []).map((s) => ({ value: s.id, label: s.name })))
const statusOptions = toOptions(REFUND_STATUS)

const query = computed<RefundQuery>(() => {
  const a = applied.value
  const s = sorting.value[0]
  return {
    page: page.value,
    pageSize: pageSize.value,
    sortBy: s?.id,
    sortOrder: s ? (s.desc ? 'desc' : 'asc') : undefined,
    refundId: a.refundId || undefined,
    merchantRefundNo: a.merchantRefundNo || undefined,
    paymentId: a.paymentId || undefined,
    storeId: a.storeId || undefined,
    status: (a.status || undefined) as RefundStatus | undefined,
    createdFrom: a.createdFrom || undefined,
    createdTo: a.createdTo || undefined,
  }
})

const list = useAsync(() => api.refunds.list(query.value), { watch: query })
const columns = buildRefundColumns({ sortable: true })
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader title="退款订单" description="查看所有退款申请的处理进度。如需发起退款，请前往对应的支付订单详情页。" />

    <Card body-class="p-0">
      <FilterPanel :active-count="filters.activeCount.value" collapsible @apply="filters.apply()" @reset="filters.reset()">
        <FormField label="平台退款编号" for="r-id">
          <Input id="r-id" v-model="draft.refundId" placeholder="如 R2026…" class="font-mono" />
        </FormField>
        <FormField label="原支付订单号" for="r-pid">
          <Input id="r-pid" v-model="draft.paymentId" placeholder="如 P2026…" class="font-mono" />
        </FormField>
        <FormField label="退款状态" for="r-status">
          <Select id="r-status" v-model="draft.status" :options="statusOptions" allow-all />
        </FormField>
        <FormField label="创建时间">
          <DateRangePicker v-model:from="draft.createdFrom" v-model:to="draft.createdTo" aria-label="创建时间范围" clearable />
        </FormField>
        <template #more>
          <FormField label="商户退款编号" for="r-mno">
            <Input id="r-mno" v-model="draft.merchantRefundNo" class="font-mono" />
          </FormField>
          <FormField label="门店" for="r-store">
            <Select id="r-store" v-model="draft.storeId" :options="storeOptions" allow-all all-label="全部门店" />
          </FormField>
        </template>
      </FilterPanel>

      <div class="px-4 py-2.5 sm:px-5">
        <p class="text-[13px] text-muted-foreground" aria-live="polite">
          共 <span class="font-medium text-foreground tabular">{{ formatNumber(list.data.value?.total ?? 0) }}</span> 笔退款
        </p>
      </div>

      <DataTable
        v-model:sorting="sorting"
        :columns="columns"
        :data="list.data.value?.items ?? []"
        :loading="list.loading.value"
        :error="list.error.value"
        :row-key="(r: Refund) => r.id"
        clickable
        empty-title="没有符合条件的退款"
        empty-description="尝试调整筛选条件后重新查询。"
        @row-click="(r: Refund) => router.push(`/refunds/${r.id}`)"
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
