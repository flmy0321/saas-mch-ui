<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { ChevronRight } from '@lucide/vue'

const props = defineProps<{ title?: string; description?: string; breadcrumb?: { label: string; to?: string }[] }>()
const route = useRoute()

const crumbs = computed(
  () => props.breadcrumb ?? (route.meta.breadcrumb ?? []).map((label) => ({ label, to: undefined as string | undefined })),
)
</script>

<template>
  <header class="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
    <div class="min-w-0">
      <nav v-if="crumbs.length" aria-label="面包屑" class="mb-2">
        <ol class="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <li v-for="(c, i) in crumbs" :key="i" class="flex items-center gap-1">
            <RouterLink v-if="c.to" :to="c.to" class="hover:text-foreground">{{ c.label }}</RouterLink>
            <span v-else :aria-current="i === crumbs.length - 1 ? 'page' : undefined">{{ c.label }}</span>
            <ChevronRight v-if="i < crumbs.length - 1" class="size-3" aria-hidden="true" />
          </li>
        </ol>
      </nav>
      <slot name="title">
        <h1 class="text-xl font-semibold tracking-tight text-balance">{{ title ?? route.meta.title }}</h1>
      </slot>
      <p v-if="description" class="mt-1 text-[13px] text-muted-foreground text-pretty">{{ description }}</p>
      <slot name="meta" />
    </div>
    <div v-if="$slots.actions" class="flex shrink-0 flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>
