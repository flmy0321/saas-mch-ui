<script setup lang="ts" generic="T extends string | number">
import { cn } from '@/utils/cn'

defineProps<{ options: { value: T; label: string }[]; ariaLabel?: string; size?: 'sm' | 'md' }>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <div role="radiogroup" :aria-label="ariaLabel" class="inline-flex rounded-lg bg-muted p-0.5">
    <button
      v-for="o in options"
      :key="String(o.value)"
      type="button"
      role="radio"
      :aria-checked="model === o.value"
      :class="
        cn(
          'rounded-md px-2.5 font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40',
          size === 'md' ? 'h-8 text-sm' : 'h-7 text-xs',
          model === o.value && 'bg-card text-foreground shadow-card',
        )
      "
      @click="model = o.value"
    >
      {{ o.label }}
    </button>
  </div>
</template>
