<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Webhook } from '@lucide/vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import WebhookStatusBadge from './WebhookStatusBadge.vue'
import { webhookEventLabel } from '@/utils/dictionaries'
import { formatDateTime } from '@/utils/format'
import type { WebhookDelivery } from '@/types'

const props = defineProps<{
  items: WebhookDelivery[]
  /** 服务端总数（十进制字符串）；大于当前条数时提示前往通知记录查看全部 */
  total?: string
  resourceId?: string
  loading?: boolean
  error?: string | null
}>()
defineEmits<{ retry: [] }>()

const hasMore = computed(() => !!props.total && BigInt(props.total) > BigInt(props.items.length))
</script>

<template>
  <div v-if="loading && !items.length" class="flex flex-col gap-3 p-5"><Skeleton v-for="i in 2" :key="i" class="h-10" /></div>
  <ErrorState v-else-if="error" :message="error" class="py-8" @retry="$emit('retry')" />
  <EmptyState v-else-if="!items.length" :icon="Webhook" title="暂无通知记录" class="py-10" />
  <div v-else>
    <ul class="divide-y divide-border">
      <li v-for="d in items" :key="`${d.appId}:${d.eventId}`" class="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
        <div class="min-w-0 flex-1">
          <p class="font-mono text-[13px]">{{ d.eventType }}</p>
          <p class="text-xs text-muted-foreground">
            {{ webhookEventLabel(d.eventType) }} · 创建于 {{ formatDateTime(d.createdAt) }} · 已分配 {{ d.allocatedAttempts }} 次
          </p>
        </div>
        <WebhookStatusBadge :status="d.status" />
        <RouterLink
          :to="{ path: '/developer/deliveries', query: { keyword: d.eventId, appId: d.appId } }"
          class="text-[13px] text-primary hover:underline"
        >
          查看
        </RouterLink>
      </li>
    </ul>
    <p v-if="hasMore" class="border-t border-border px-5 py-2.5 text-xs text-muted-foreground">
      仅显示最近 {{ items.length }} 条，共 {{ total }} 条。
      <RouterLink
        :to="{ path: '/developer/deliveries', query: resourceId ? { keyword: resourceId } : {} }"
        class="text-primary hover:underline"
      >
        查看全部
      </RouterLink>
    </p>
  </div>
</template>
