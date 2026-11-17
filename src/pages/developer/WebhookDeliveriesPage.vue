<script setup lang="ts">
import { computed, h, ref } from 'vue'
import type { ColumnDef } from '@tanstack/vue-table'
import PageHeader from '@/components/layout/PageHeader.vue'
import Card from '@/components/ui/Card.vue'
import FilterPanel from '@/components/ui/FilterPanel.vue'
import FormField from '@/components/ui/FormField.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import DataTable from '@/components/ui/DataTable.vue'
import Pagination from '@/components/ui/Pagination.vue'
import Drawer from '@/components/ui/Drawer.vue'
import DescriptionList from '@/components/ui/DescriptionList.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import WebhookStatusBadge from '@/components/business/WebhookStatusBadge.vue'
import OrderNumber from '@/components/business/OrderNumber.vue'
import { useAsync } from '@/composables/useAsync'
import { useQueryFilters } from '@/composables/useQueryFilters'
import { api } from '@/services/api'
import { WEBHOOK_EVENT, WEBHOOK_STATUS, webhookEventLabel, toOptions } from '@/utils/dictionaries'
import { formatDateTime } from '@/utils/format'
import type { WebhookDelivery, WebhookDeliveryStatus, WebhookEventType } from '@/types'

const filters = useQueryFilters({ keyword: '', eventType: '', status: '', appId: '' })
const { draft, applied, page, pageSize } = filters

const query = computed(() => ({
  page: page.value,
  pageSize: pageSize.value,
  appId: applied.value.appId || undefined,
  keyword: applied.value.keyword || undefined,
  eventType: (applied.value.eventType || undefined) as WebhookEventType | undefined,
  status: (applied.value.status || undefined) as WebhookDeliveryStatus | undefined,
}))
const list = useAsync(() => api.webhooks.deliveries(query.value), { watch: query })

const selected = ref<WebhookDelivery | null>(null)
const drawerOpen = computed({
  get: () => !!selected.value,
  set: (v: boolean) => {
    if (!v) selected.value = null
  },
})

const eventOptions = (Object.keys(WEBHOOK_EVENT) as WebhookEventType[]).map((k) => ({ value: k, label: k }))
const muted = (t: string) => h('span', { class: 'whitespace-nowrap text-muted-foreground tabular' }, t)
const timeOrDash = (t: string | null) => (t ? formatDateTime(t) : '—')
const resourceLink = (d: WebhookDelivery) =>
  d.resource.type === 'payment' ? `/payments/${d.resource.id}` : `/refunds/${d.resource.id}`

const columns: ColumnDef<WebhookDelivery>[] = [
  {
    id: 'event',
    header: '事件',
    cell: ({ row }) =>
      h('div', { class: 'flex flex-col' }, [
        h('span', { class: 'font-mono text-[13px]' }, row.original.eventType),
        h('span', { class: 'text-xs text-muted-foreground' }, webhookEventLabel(row.original.eventType)),
      ]),
  },
  {
    id: 'resource',
    header: '关联对象',
    cell: ({ row }) => h(OrderNumber, { value: row.original.resource.id, to: resourceLink(row.original) }),
  },
  { id: 'status', header: '投递状态', cell: ({ row }) => h(WebhookStatusBadge, { status: row.original.status }) },
  {
    id: 'allocatedAttempts',
    header: '已分配次数',
    meta: { align: 'right' },
    cell: ({ row }) => h('span', { class: 'tabular' }, row.original.allocatedAttempts),
  },
  { id: 'createdAt', header: '创建时间', cell: ({ row }) => muted(formatDateTime(row.original.createdAt)) },
  { id: 'nextAttemptAt', header: '下次投递', cell: ({ row }) => muted(timeOrDash(row.original.nextAttemptAt)) },
]

const detailItems = computed(() => {
  const d = selected.value
  if (!d) return []
  return [
    { key: 'eventId', label: '事件 ID', value: d.eventId },
    { key: 'eventType', label: '事件类型', value: d.eventType },
    { key: 'resourceId', label: d.resource.type === 'payment' ? '关联订单' : '关联退款', value: d.resource.id },
    { key: 'appId', label: 'AppID', value: d.appId },
    { key: 'createdAt', label: '创建时间', value: formatDateTime(d.createdAt) },
    { key: 'nextAttemptAt', label: '下次投递', value: timeOrDash(d.nextAttemptAt) },
    { key: 'acknowledgedAt', label: '确认时间', value: timeOrDash(d.acknowledgedAt) },
    { key: 'lastHttpStatus', label: '最近 HTTP 状态', value: d.lastHttpStatus === null ? '—' : String(d.lastHttpStatus) },
    { key: 'lastErrorCode', label: '最近错误码', value: d.lastErrorCode ?? '—' },
  ]
})
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader
      title="通知记录"
      description="查看 Webhook 事件的投递状态。只有回调地址返回 HTTP 2xx 才视为已确认。"
    />

    <Card body-class="p-0">
      <FilterPanel :active-count="filters.activeCount.value" @apply="filters.apply()" @reset="filters.reset()">
        <FormField label="关键词" for="wd-kw">
          <Input id="wd-kw" v-model="draft.keyword" placeholder="事件 ID / 订单号 / 退款编号" class="font-mono" />
        </FormField>
        <FormField label="事件类型" for="wd-type">
          <Select id="wd-type" v-model="draft.eventType" :options="eventOptions" allow-all />
        </FormField>
        <FormField label="投递状态" for="wd-status">
          <Select id="wd-status" v-model="draft.status" :options="toOptions(WEBHOOK_STATUS)" allow-all />
        </FormField>
      </FilterPanel>

      <div class="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-5">
        <p class="text-[13px] text-muted-foreground" aria-live="polite">
          共 <span class="font-medium text-foreground tabular">{{ list.data.value?.total ?? '0' }}</span> 条记录
        </p>
        <p v-if="list.data.value" class="text-xs text-muted-foreground tabular">数据截至 {{ formatDateTime(list.data.value.asOf) }}</p>
      </div>

      <DataTable
        :columns="columns"
        :data="list.data.value?.items ?? []"
        :loading="list.loading.value"
        :error="list.error.value"
        :row-key="(r: WebhookDelivery) => `${r.appId}:${r.eventId}`"
        clickable
        empty-title="暂无通知记录"
        @row-click="(r: WebhookDelivery) => (selected = r)"
        @retry="list.reload()"
      />

      <div class="border-t border-border px-4 py-3 sm:px-5">
        <Pagination v-model:page="page" v-model:page-size="pageSize" :total="list.data.value?.total ?? '0'" />
      </div>
    </Card>

    <Drawer v-model:open="drawerOpen" title="通知详情" :description="selected ? webhookEventLabel(selected.eventType) : ''">
      <div v-if="selected" class="flex flex-col gap-6">
        <div class="flex items-center gap-2">
          <WebhookStatusBadge :status="selected.status" />
          <span class="text-[13px] text-muted-foreground">已分配 {{ selected.allocatedAttempts }} 次投递</span>
        </div>
        <DescriptionList :items="detailItems" :cols="1">
          <template #eventId="{ item }">
            <span class="flex items-center gap-1 font-mono text-[13px]">{{ item.value }}<CopyButton :value="item.value!" /></span>
          </template>
          <template #resourceId="{ item }"><span class="font-mono text-[13px]">{{ item.value }}</span></template>
          <template #appId="{ item }"><span class="font-mono text-[13px]">{{ item.value }}</span></template>
          <template #eventType="{ item }"><span class="font-mono text-[13px]">{{ item.value }}</span></template>
          <template #lastErrorCode="{ item }"><span class="font-mono text-[13px]">{{ item.value }}</span></template>
        </DescriptionList>
      </div>
    </Drawer>
  </div>
</template>
