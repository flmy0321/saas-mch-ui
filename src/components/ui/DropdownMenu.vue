<script setup lang="ts">
import { DropdownMenuContent, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { cn } from '@/utils/cn'

withDefaults(defineProps<{ align?: 'start' | 'center' | 'end'; class?: string }>(), { align: 'end' })
</script>

<template>
  <DropdownMenuRoot :modal="false">
    <DropdownMenuTrigger as-child><slot name="trigger" /></DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        :align="align"
        :side-offset="6"
        :class="cn('z-50 min-w-44 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-pop outline-none animate-fade-in', $props.class)"
      >
        <slot />
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
