<script setup lang="ts">
import { computed } from 'vue'
import { channelMeta } from '@/utils/dictionaries'
import type { PaymentChannel } from '@/types'

const props = defineProps<{ channel: PaymentChannel; short?: boolean }>()
const meta = computed(() => channelMeta(props.channel))
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap"
    :title="meta.unknown ? '平台新增渠道，当前版本暂未识别' : undefined"
  >
    <span class="size-2 rounded-[3px]" :style="{ background: meta.color }" aria-hidden="true" />
    <span :class="meta.unknown ? 'font-mono text-muted-foreground' : ''">{{ short ? meta.short : meta.label }}</span>
  </span>
</template>
