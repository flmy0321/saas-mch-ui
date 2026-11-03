<script setup lang="ts">
import { cn } from '@/utils/cn'

defineOptions({ inheritAttrs: false })
const props = defineProps<{ class?: string; invalid?: boolean }>()
const model = defineModel<string | number>()
</script>

<template>
  <div :class="cn('relative flex items-center', props.class)">
    <span v-if="$slots.prefix" class="pointer-events-none absolute left-2.5 flex text-muted-foreground [&_svg]:size-4">
      <slot name="prefix" />
    </span>
    <input
      v-model="model"
      v-bind="$attrs"
      :aria-invalid="invalid || undefined"
      :class="
        cn(
          'h-9 w-full min-w-0 rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-card transition-colors outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60',
          $slots.prefix && 'pl-8',
          $slots.suffix && 'pr-9',
          invalid && 'border-danger focus-visible:border-danger focus-visible:ring-danger/20',
        )
      "
    />
    <span v-if="$slots.suffix" class="absolute right-2.5 flex text-muted-foreground [&_svg]:size-4">
      <slot name="suffix" />
    </span>
  </div>
</template>
