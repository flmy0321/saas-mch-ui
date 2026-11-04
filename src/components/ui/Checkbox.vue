<script setup lang="ts">
import { CheckboxIndicator, CheckboxRoot } from 'reka-ui'
import { Check } from '@lucide/vue'

defineProps<{ id?: string; disabled?: boolean }>()
const model = defineModel<boolean>({ default: false })
</script>

<template>
  <CheckboxRoot
    :id="id"
    v-model="model"
    :disabled="disabled"
    class="flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input bg-card shadow-card outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
  >
    <CheckboxIndicator><Check class="size-3" :stroke-width="3" /></CheckboxIndicator>
  </CheckboxRoot>
</template>
