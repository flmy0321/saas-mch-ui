<script setup lang="ts">
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { cn } from '@/utils/cn'

withDefaults(defineProps<{ align?: 'start' | 'center' | 'end'; class?: string }>(), { align: 'start' })
const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child><slot name="trigger" /></PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        :align="align"
        :side-offset="6"
        :class="cn('z-50 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-pop outline-none animate-fade-in', $props.class)"
      >
        <slot />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
