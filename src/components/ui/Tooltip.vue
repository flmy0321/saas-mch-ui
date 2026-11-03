<script setup lang="ts">
import { TooltipArrow, TooltipContent, TooltipPortal, TooltipRoot, TooltipTrigger } from 'reka-ui'

withDefaults(defineProps<{ content: string; side?: 'top' | 'bottom' | 'left' | 'right'; disabled?: boolean }>(), {
  side: 'top',
})
</script>

<template>
  <TooltipRoot :disabled="disabled">
    <TooltipTrigger as-child><slot /></TooltipTrigger>
    <TooltipPortal>
      <TooltipContent
        :side="side"
        :side-offset="6"
        class="z-50 max-w-xs rounded-md bg-foreground px-2.5 py-1.5 text-xs leading-relaxed text-background shadow-pop animate-fade-in"
      >
        {{ content }}
        <TooltipArrow class="fill-foreground" :width="10" :height="5" />
      </TooltipContent>
    </TooltipPortal>
  </TooltipRoot>
</template>
