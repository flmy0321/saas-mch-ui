<script setup lang="ts">
import { CHANNEL } from '@/utils/dictionaries'
import type { PaymentChannel } from '@/types'

defineProps<{ channel: PaymentChannel; short?: boolean }>()
</script>

<template>
  <span class="inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap">
    <span class="size-2 rounded-[3px]" :style="{ background: CHANNEL[channel].color }" aria-hidden="true" />
    {{ short ? CHANNEL[channel].short : CHANNEL[channel].label }}
  </span>
</template>
