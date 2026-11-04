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
import { formatDateTime, formatNumber } from '@/utils/format'
import type { WebhookDelivery, WebhookDeliveryStatus, WebhookEventType } from '@/types'

const filters = useQueryFilters({ keyword: '', eventType: '', status: '' })
const { draft, applied, page, pageSize } = filters

const query = computed(() => ({
  page: page.value,
  pageSize: pageSize.value,
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
    cell: ({ row }) => {
      const d = row.original
      return h(OrderNumber, { value: d.resourceId, to: d.resourceType === 'payment' ? `/payments/${d.resourceId}` : `/refunds/${d.resourceId}` })
    },
  },
  { id: 'status', header: '推送状态', cell: ({ row }) => h(WebhookStatusBadge, { status: row.original.status }) },
  { id: 'attempts', header: '推送次数', meta: { align: 'right' }, cell: ({ row }) => h('span', { class: 'tabular' }, String(row.original.attempts)) },
  { id: 'lastAttemptAt', header: '最近推送', cell: ({ row }) => muted(formatDateTime(row.original.lastAttemptAt)) },
  { id: 'nextRetryAt', header: '下次重试', cell: ({ row }) => muted(row.original.nextRetryAt ? formatDateTime(row.original.nextRetryAt) : '—') },
]

const detailItems = computed(() => {
  const d = selected.value
  if (!d) return []
  return [
    { key: 'eventId', label: '事件 ID', value: d.eventId },
    { key: 'eventType', label: '事件类型', value: d.eventType },
    { key: 'resourceId', label: '关联对象', value: d.resourceId },
    { key: 'appId', label: 'AppID', value: d.appId },
    { key: 'url', label: '回调地址', value: d.url },
    { key: 'nextRetryAt', label: '下次重试', value: d.nextRetryAt ? formatDateTime(d.nextRetryAt) : '—' },
  ]
})
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader title="通知记录" description="查看 Webhook 事件的推送结果与重试记录，用于排查回调接收问题。" />

    <Card body-class="p-0">
      <FilterPanel :active-count="filters.activeCount.value" @apply="filters.apply()" @reset="filters.reset()">
        <FormField label="关键词" for="wd-kw">
          <Input id="wd-kw" v-model="draft.keyword" placeholder="事件 ID / 订单号 / 退款编号" class="font-mono" />
        </FormField>
        <FormField label="事件类型" for="wd-type">
          <Select id="wd-type" v-model="draft.eventType" :options="eventOptions" allow-all />
        </FormField>
        <FormField label="推送状态" for="wd-status">
          <Select id="wd-status" v-model="draft.status" :options="toOptions(WEBHOOK_STATUS)" allow-all />
        </FormField>
      </FilterPanel>

      <div class="px-4 py-2.5 sm:px-5">
        <p class="text-[13px] text-muted-foreground" aria-live="polite">
          共 <span class="font-medium text-foreground tabular">{{ formatNumber(list.data.value?.total ?? 0) }}</span> 条记录
        </p>
      </div>

      <DataTable
        :columns="columns"
        :data="list.data.value?.items ?? []"
        :loading="list.loading.value"
        :error="list.error.value"
        :row-key="(r: WebhookDelivery) => r.id"
        clickable
        empty-title="暂无通知记录"
        @row-click="(r: WebhookDelivery) => (selected = r)"
        @retry="list.reload()"
      />

      <div class="border-t border-border px-4 py-3 sm:px-5">
        <Pagination v-model:page="page" v-model:page-size="pageSize" :total="list.data.value?.total ?? 0" />
      </div>
    </Card>

    <Drawer v-model:open="drawerOpen" title="通知详情" :description="selected ? webhookEventLabel(selected.eventType) : ''">
      <div v-if="selected" class="flex flex-col gap-6">
        <div class="flex items-center gap-2">
          <WebhookStatusBadge :status="selected.status" />
          <span class="text-[13px] text-muted-foreground">共推送 {{ selected.attempts }} 次</span>
        </div>
        <DescriptionList :items="detailItems" :cols="1">
          <template #eventId="{ item }">
            <span class="flex items-center gap-1 font-mono text-[13px]">{{ item.value }}<CopyButton :value="item.value!" /></span>
          </template>
          <template #url="{ item }"><span class="break-all font-mono text-xs">{{ item.value }}</span></template>
          <template #resourceId="{ item }"><span class="font-mono text-[13px]">{{ item.value }}</span></template>
          <template #appId="{ item }"><span class="font-mono text-[13px]">{{ item.value }}</span></template>
          <template #eventType="{ item }"><span class="font-mono text-[13px]">{{ item.value }}</span></template>
        </DescriptionList>

        <section aria-labelledby="attempts-title">
          <h3 id="attempts-title" class="mb-3 text-[13px] font-semibold">推送记录</h3>
          <ol class="flex flex-col gap-2">
            <li v-for="a in [...selected.attemptLog].reverse()" :key="a.attempt" class="rounded-lg border border-border p-3">
              <div class="flex items-center justify-between gap-2 text-[13px]">
                <span class="font-medium">第 {{ a.attempt }} 次</span>
                <span :class="a.result === 'SUCCESS' ? 'text-success' : 'text-danger'" class="font-mono text-xs">
                  {{ a.httpStatus ? `HTTP ${a.httpStatus}` : '无响应' }} · {{ a.durationMs }} ms
                </span>
              </div>
              <p class="mt-1 text-xs text-muted-foreground tabular">{{ formatDateTime(a.at) }}</p>
              <p v-if="a.errorSummary" class="mt-2 rounded bg-danger-soft px-2 py-1 font-mono text-xs text-danger">{{ a.errorSummary }}</p>
            </li>
          </ol>
        </section>
      </div>
    </Drawer>
  </div>
</template>
