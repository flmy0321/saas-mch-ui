<script setup lang="ts">
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { WEBHOOK_STATUS } from '@/utils/dictionaries'
import type { WebhookDeliveryStatus } from '@/types'

defineProps<{ status: WebhookDeliveryStatus }>()
</script>

<template>
  <StatusBadge :tone="WEBHOOK_STATUS[status].tone">{{ WEBHOOK_STATUS[status].label }}</StatusBadge>
</template>
