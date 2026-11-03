<script setup lang="ts">
import { TabsContent, TabsIndicator, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import { cn } from '@/utils/cn'

defineProps<{ items: { value: string; label: string; count?: number }[]; class?: string; listClass?: string }>()
const model = defineModel<string>({ required: true })
</script>

<template>
  <TabsRoot v-model="model" :class="$props.class">
    <TabsList :class="cn('relative flex gap-5 overflow-x-auto border-b border-border', listClass)">
      <TabsTrigger
        v-for="t in items"
        :key="t.value"
        :value="t.value"
        class="flex h-10 shrink-0 items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:text-foreground data-[state=active]:text-foreground"
      >
        {{ t.label }}
        <span
          v-if="t.count !== undefined"
          class="rounded-full bg-muted px-1.5 text-[11px] leading-[18px] font-medium text-muted-foreground tabular"
        >
          {{ t.count }}
        </span>
      </TabsTrigger>
      <TabsIndicator
        class="absolute bottom-0 left-0 h-0.5 w-[var(--reka-tabs-indicator-size)] translate-x-[var(--reka-tabs-indicator-position)] rounded-full bg-primary transition-[width,transform] duration-200"
      />
    </TabsList>
    <TabsContent v-for="t in items" :key="t.value" :value="t.value" class="pt-5 outline-none">
      <slot :name="t.value" />
    </TabsContent>
  </TabsRoot>
</template>
