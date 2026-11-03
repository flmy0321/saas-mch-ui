<script setup lang="ts">
import StatusBadge from '@/components/ui/StatusBadge.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import { REFUND_STATUS } from '@/utils/dictionaries'
import type { RefundStatus } from '@/types'

defineProps<{ status: RefundStatus }>()
</script>

<template>
  <Tooltip v-if="status === 'SUSPENDED'" :content="REFUND_STATUS.SUSPENDED.description!">
    <span tabindex="0" class="inline-flex rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
      <StatusBadge :tone="REFUND_STATUS[status].tone">{{ REFUND_STATUS[status].label }}</StatusBadge>
    </span>
  </Tooltip>
  <StatusBadge v-else :tone="REFUND_STATUS[status].tone">{{ REFUND_STATUS[status].label }}</StatusBadge>
</template>
