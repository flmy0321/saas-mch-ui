<script setup lang="ts">
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { PAYMENT_STATUS } from '@/utils/dictionaries'
import type { PaymentStatus } from '@/types'

defineProps<{ status: PaymentStatus }>()
</script>

<template>
  <StatusBadge :tone="PAYMENT_STATUS[status].tone" :title="PAYMENT_STATUS[status].description">
    {{ PAYMENT_STATUS[status].label }}
  </StatusBadge>
</template>
