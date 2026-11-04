<script setup lang="ts">
import { DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { X } from '@lucide/vue'
import { cn } from '@/utils/cn'

defineProps<{ title: string; description?: string; class?: string }>()
const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] animate-fade-in" />
      <DialogContent
        :class="
          cn(
            'fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-popover text-popover-foreground shadow-pop outline-none animate-slide-in-right',
            $props.class,
          )
        "
      >
        <div class="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div>
            <DialogTitle class="text-base font-semibold">{{ title }}</DialogTitle>
            <DialogDescription v-if="description" class="mt-1 text-[13px] text-muted-foreground">
              {{ description }}
            </DialogDescription>
          </div>
          <DialogClose class="-mr-2 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="关闭">
            <X class="size-4" />
          </DialogClose>
        </div>
        <div class="scrollbar-thin flex-1 overflow-y-auto px-6 py-5"><slot /></div>
        <div v-if="$slots.footer" class="flex justify-end gap-2 border-t border-border px-6 py-3.5">
          <slot name="footer" />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
