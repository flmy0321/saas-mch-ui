<script setup lang="ts">
import { computed } from 'vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { paymentStatusMeta } from '@/utils/dictionaries'
import type { PaymentStatus } from '@/types'

const props = defineProps<{ status: PaymentStatus }>()
const meta = computed(() => paymentStatusMeta(props.status))
</script>

<template>
  <StatusBadge :tone="meta.tone" :title="meta.description">{{ meta.label }}</StatusBadge>
</template>
