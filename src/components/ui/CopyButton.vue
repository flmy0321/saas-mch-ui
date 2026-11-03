<script setup lang="ts">
import { ref } from 'vue'
import { Check, Copy } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { cn } from '@/utils/cn'

const props = withDefaults(defineProps<{ value: string; label?: string; class?: string; toastText?: string }>(), {
  label: '复制',
  toastText: '已复制到剪贴板',
})
const copied = ref(false)

async function copy() {
  try {
    await navigator.clipboard.writeText(props.value)
    copied.value = true
    toast.success(props.toastText)
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    toast.error('复制失败，请手动选择复制')
  }
}
</script>

<template>
  <button
    type="button"
    :aria-label="`${label} ${value}`"
    :title="label"
    :class="
      cn(
        'inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none',
        props.class,
      )
    "
    @click.stop.prevent="copy"
  >
    <Check v-if="copied" class="size-3.5 text-success" aria-hidden="true" />
    <Copy v-else class="size-3.5" aria-hidden="true" />
  </button>
</template>
