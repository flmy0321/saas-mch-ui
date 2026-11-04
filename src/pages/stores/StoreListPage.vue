<script setup lang="ts">
import { computed, h, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { ColumnDef } from '@tanstack/vue-table'
import { Pencil, Plus } from '@lucide/vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import Card from '@/components/ui/Card.vue'
import FilterPanel from '@/components/ui/FilterPanel.vue'
import FormField from '@/components/ui/FormField.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import DataTable from '@/components/ui/DataTable.vue'
import Pagination from '@/components/ui/Pagination.vue'
import Button from '@/components/ui/Button.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import OrderNumber from '@/components/business/OrderNumber.vue'
import StoreFormDrawer from '@/components/business/StoreFormDrawer.vue'
import { useAsync } from '@/composables/useAsync'
import { useQueryFilters } from '@/composables/useQueryFilters'
import { api } from '@/services/api'
import { STORE_STATUS, toOptions } from '@/utils/dictionaries'
import { formatDateTime, formatNumber } from '@/utils/format'
import type { Store, StoreStatus } from '@/types'

const router = useRouter()
const filters = useQueryFilters({ keyword: '', status: '' })
const { draft, applied, page, pageSize } = filters

const query = computed(() => ({
  page: page.value,
  pageSize: pageSize.value,
  keyword: applied.value.keyword || undefined,
  status: (applied.value.status || undefined) as StoreStatus | undefined,
}))
const list = useAsync(() => api.stores.list(query.value), { watch: query })

const drawerOpen = ref(false)
const editing = ref<Store | null>(null)
function openCreate() {
  editing.value = null
  drawerOpen.value = true
}
function openEdit(s: Store) {
  editing.value = s
  drawerOpen.value = true
}

const muted = (t: string) => h('span', { class: 'text-muted-foreground whitespace-nowrap' }, t)
const columns: ColumnDef<Store>[] = [
  {
    id: 'name',
    header: '门店名称',
    cell: ({ row }) =>
      h('div', { class: 'flex flex-col' }, [
        h('span', { class: 'font-medium' }, row.original.name),
        h('span', { class: 'text-xs text-muted-foreground truncate max-w-72' }, row.original.address),
      ]),
  },
  { id: 'storeNo', header: '平台门店编号', cell: ({ row }) => h(OrderNumber, { value: row.original.storeNo }) },
  { id: 'merchantStoreNo', header: '商户门店编号', cell: ({ row }) => h(OrderNumber, { value: row.original.merchantStoreNo, muted: true, copyable: false }) },
  {
    id: 'contact',
    header: '联系人',
    cell: ({ row }) =>
      h('div', { class: 'flex flex-col whitespace-nowrap' }, [
        h('span', row.original.contactName),
        h('span', { class: 'text-xs text-muted-foreground tabular' }, row.original.contactPhone),
      ]),
  },
  {
    id: 'status',
    header: '状态',
    cell: ({ row }) => h(StatusBadge, { tone: STORE_STATUS[row.original.status].tone, dot: true }, () => STORE_STATUS[row.original.status].label),
  },
  { id: 'createdAt', header: '创建时间', cell: ({ row }) => muted(formatDateTime(row.original.createdAt)) },
  {
    id: 'actions',
    header: () => h('span', { class: 'sr-only' }, '操作'),
    meta: { align: 'right' },
    cell: ({ row }) =>
      h(
        Button,
        {
          variant: 'ghost',
          size: 'sm',
          'aria-label': `编辑 ${row.original.name}`,
          onClick: (e: MouseEvent) => {
            e.stopPropagation()
            openEdit(row.original)
          },
        },
        () => [h(Pencil, { 'aria-hidden': 'true' }), '编辑'],
      ),
  },
]

function onSaved(s: Store) {
  list.reload()
  if (!editing.value) router.push(`/stores/${s.id}`)
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader title="门店管理" description="管理商户下的经营门店，交易数据可按门店进行统计与筛选。">
      <template #actions>
        <Button variant="primary" @click="openCreate"><Plus aria-hidden="true" />新建门店</Button>
      </template>
    </PageHeader>

    <Card body-class="p-0">
      <FilterPanel :active-count="filters.activeCount.value" @apply="filters.apply()" @reset="filters.reset()">
        <FormField label="关键词" for="st-kw" class="lg:col-span-2">
          <Input id="st-kw" v-model="draft.keyword" placeholder="门店名称、编号或联系人" />
        </FormField>
        <FormField label="状态" for="st-status">
          <Select id="st-status" v-model="draft.status" :options="toOptions(STORE_STATUS)" allow-all />
        </FormField>
      </FilterPanel>

      <div class="px-4 py-2.5 sm:px-5">
        <p class="text-[13px] text-muted-foreground" aria-live="polite">
          共 <span class="font-medium text-foreground tabular">{{ formatNumber(list.data.value?.total ?? 0) }}</span> 家门店
        </p>
      </div>

      <DataTable
        :columns="columns"
        :data="list.data.value?.items ?? []"
        :loading="list.loading.value"
        :error="list.error.value"
        :row-key="(r: Store) => r.id"
        clickable
        empty-title="暂无门店"
        empty-description="创建第一家门店，开始按门店统计交易。"
        @row-click="(r: Store) => router.push(`/stores/${r.id}`)"
        @retry="list.reload()"
      >
        <template #empty-actions>
          <Button size="sm" variant="primary" @click="openCreate"><Plus aria-hidden="true" />新建门店</Button>
        </template>
      </DataTable>

      <div class="border-t border-border px-4 py-3 sm:px-5">
        <Pagination v-model:page="page" v-model:page-size="pageSize" :total="list.data.value?.total ?? 0" />
      </div>
    </Card>

    <StoreFormDrawer v-model:open="drawerOpen" :store="editing" @saved="onSaved" />
  </div>
</template>
