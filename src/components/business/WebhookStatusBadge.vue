<script setup lang="ts">
import { computed } from 'vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { webhookStatusMeta } from '@/utils/dictionaries'
import type { WebhookDeliveryStatus } from '@/types'

const props = defineProps<{ status: WebhookDeliveryStatus }>()
const meta = computed(() => webhookStatusMeta(props.status))
</script>

<template>
  <StatusBadge :tone="meta.tone" :title="meta.description">{{ meta.label }}</StatusBadge>
</template>
