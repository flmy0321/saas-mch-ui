<script setup lang="ts">
import { DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { X } from '@lucide/vue'
import { cn } from '@/utils/cn'

withDefaults(defineProps<{ title: string; description?: string; class?: string; dismissible?: boolean }>(), {
  dismissible: true,
})
const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] animate-fade-in" />
      <DialogContent
        :class="
          cn(
            'fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-popover text-popover-foreground shadow-pop outline-none animate-zoom-in',
            $props.class,
          )
        "
        @interact-outside="(e) => !dismissible && e.preventDefault()"
        @escape-key-down="(e) => !dismissible && e.preventDefault()"
      >
        <div class="flex items-start justify-between gap-4 px-6 pt-5 pb-2">
          <div>
            <DialogTitle class="text-base font-semibold">{{ title }}</DialogTitle>
            <DialogDescription v-if="description" class="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              {{ description }}
            </DialogDescription>
          </div>
          <DialogClose
            v-if="dismissible"
            class="-mr-2 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="关闭"
          >
            <X class="size-4" />
          </DialogClose>
        </div>
        <div class="scrollbar-thin overflow-y-auto px-6 py-3"><slot /></div>
        <div v-if="$slots.footer" class="flex justify-end gap-2 border-t border-border px-6 py-3.5">
          <slot name="footer" />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
