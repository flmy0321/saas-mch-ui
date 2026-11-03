<script setup lang="ts">
import { cn } from '@/utils/cn'

const props = defineProps<{ class?: string; invalid?: boolean }>()
const model = defineModel<string>()
</script>

<template>
  <textarea
    v-model="model"
    :aria-invalid="invalid || undefined"
    :class="
      cn(
        'min-h-20 w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-card outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20',
        invalid && 'border-danger',
        props.class,
      )
    "
  />
</template>
