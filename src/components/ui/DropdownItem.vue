<script setup lang="ts">
import { DropdownMenuItem } from 'reka-ui'
import { cn } from '@/utils/cn'

defineProps<{ danger?: boolean; disabled?: boolean; class?: string }>()
defineEmits<{ select: [e: Event] }>()
</script>

<template>
  <DropdownMenuItem
    :disabled="disabled"
    :class="
      cn(
        'flex h-8 cursor-default items-center gap-2 rounded-md px-2.5 text-sm outline-none select-none data-[disabled]:opacity-50 data-[highlighted]:bg-muted [&_svg]:size-4 [&_svg]:text-muted-foreground',
        danger && 'text-danger data-[highlighted]:bg-danger-soft [&_svg]:text-danger',
        $props.class,
      )
    "
    @select="$emit('select', $event)"
  >
    <slot />
  </DropdownMenuItem>
</template>
