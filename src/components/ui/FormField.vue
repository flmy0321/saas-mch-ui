<script setup lang="ts">
import { cn } from '@/utils/cn'

defineProps<{ label?: string; for?: string; error?: string | null; hint?: string; required?: boolean; class?: string }>()
</script>

<template>
  <div :class="cn('flex flex-col gap-1.5', $props.class)">
    <label v-if="label" :for="$props.for" class="text-[13px] font-medium text-foreground">
      {{ label }}<span v-if="required" class="ml-0.5 text-danger" aria-hidden="true">*</span>
    </label>
    <slot />
    <p v-if="error" class="text-xs text-danger" role="alert">{{ error }}</p>
    <p v-else-if="hint" class="text-xs text-muted-foreground">{{ hint }}</p>
  </div>
</template>
