<script setup lang="ts">
import { computed } from 'vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import { refundStatusMeta } from '@/utils/dictionaries'
import type { RefundStatus } from '@/types'

const props = defineProps<{ status: RefundStatus }>()
const meta = computed(() => refundStatusMeta(props.status))
</script>

<template>
  <Tooltip v-if="meta.description && (status === 'SUSPENDED' || meta.tone === 'neutral')" :content="meta.description">
    <span tabindex="0" class="inline-flex rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
      <StatusBadge :tone="meta.tone">{{ meta.label }}</StatusBadge>
    </span>
  </Tooltip>
  <StatusBadge v-else :tone="meta.tone">{{ meta.label }}</StatusBadge>
</template>
