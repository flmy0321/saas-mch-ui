<script setup lang="ts">
import { cn } from '@/utils/cn'

withDefaults(
  defineProps<{ title?: string; description?: string; class?: string; bodyClass?: string; padded?: boolean }>(),
  { padded: true },
)
</script>

<template>
  <section :class="cn('rounded-xl border border-border bg-card text-card-foreground shadow-card', $props.class)">
    <header
      v-if="title || $slots.header || $slots.actions"
      class="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-3.5"
    >
      <slot name="header">
        <div class="min-w-0">
          <h2 class="text-sm font-semibold text-foreground">{{ title }}</h2>
          <p v-if="description" class="mt-0.5 text-xs text-muted-foreground">{{ description }}</p>
        </div>
      </slot>
      <div v-if="$slots.actions" class="flex items-center gap-2">
        <slot name="actions" />
      </div>
    </header>
    <div :class="cn(padded !== false && 'p-5', bodyClass)">
      <slot />
    </div>
  </section>
</template>
