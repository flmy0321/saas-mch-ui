<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Webhook } from '@lucide/vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import WebhookStatusBadge from './WebhookStatusBadge.vue'
import { webhookEventLabel } from '@/utils/dictionaries'
import { formatDateTime } from '@/utils/format'
import type { WebhookDelivery } from '@/types'

defineProps<{ items: WebhookDelivery[]; loading?: boolean; error?: string | null }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div v-if="loading && !items.length" class="flex flex-col gap-3 p-5"><Skeleton v-for="i in 2" :key="i" class="h-10" /></div>
  <ErrorState v-else-if="error" :message="error" class="py-8" @retry="$emit('retry')" />
  <EmptyState v-else-if="!items.length" :icon="Webhook" title="暂无通知记录" class="py-10" />
  <ul v-else class="divide-y divide-border">
    <li v-for="d in items" :key="d.id" class="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
      <div class="min-w-0 flex-1">
        <p class="flex items-center gap-2 font-mono text-[13px]">
          {{ d.eventType }}
          <span v-if="d.isTest" class="rounded bg-muted px-1.5 py-0.5 font-sans text-[11px] text-muted-foreground">测试</span>
        </p>
        <p class="text-xs text-muted-foreground">{{ webhookEventLabel(d.eventType) }} · 最近推送 {{ formatDateTime(d.lastAttemptAt) }} · 共 {{ d.attempts }} 次</p>
      </div>
      <WebhookStatusBadge :status="d.status" />
      <RouterLink :to="{ path: '/developer/deliveries', query: { keyword: d.eventId } }" class="text-[13px] text-primary hover:underline">
        查看
      </RouterLink>
    </li>
  </ul>
</template>
