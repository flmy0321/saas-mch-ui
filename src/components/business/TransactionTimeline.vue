<script setup lang="ts">
import { Check, Circle, X, Loader } from '@lucide/vue'
import { formatDateTime } from '@/utils/format'
import { cn } from '@/utils/cn'

export interface TimelineStep {
  title: string
  at?: string | null
  note?: string | null
  state: 'done' | 'current' | 'failed' | 'pending' | 'neutral'
}

defineProps<{ steps: TimelineStep[] }>()

const dotClass: Record<TimelineStep['state'], string> = {
  done: 'bg-success text-white',
  current: 'bg-warning-soft text-warning ring-1 ring-warning/40',
  failed: 'bg-danger text-white',
  pending: 'bg-muted text-muted-foreground ring-1 ring-border',
  neutral: 'bg-muted-foreground/70 text-white',
}
</script>

<template>
  <ol class="relative">
    <li v-for="(s, i) in steps" :key="i" class="relative flex gap-3.5 pb-6 last:pb-0">
      <span
        v-if="i < steps.length - 1"
        :class="cn('absolute top-6 left-[11px] h-[calc(100%-24px)] w-px', s.state === 'done' ? 'bg-success/40' : 'bg-border')"
        aria-hidden="true"
      />
      <span :class="cn('z-[1] flex size-6 shrink-0 items-center justify-center rounded-full', dotClass[s.state])">
        <Check v-if="s.state === 'done'" class="size-3.5" :stroke-width="3" />
        <X v-else-if="s.state === 'failed'" class="size-3.5" :stroke-width="3" />
        <Loader v-else-if="s.state === 'current'" class="size-3.5 animate-[spin_2.4s_linear_infinite]" />
        <Circle v-else class="size-2 fill-current" />
      </span>
      <div class="min-w-0 pt-0.5">
        <p :class="cn('text-sm font-medium', s.state === 'pending' && 'text-muted-foreground')">{{ s.title }}</p>
        <p class="mt-0.5 text-xs text-muted-foreground tabular">
          {{ s.at ? formatDateTime(s.at) : s.state === 'pending' ? '未发生' : '进行中' }}
        </p>
        <p v-if="s.note" class="mt-1.5 rounded-md bg-muted px-2.5 py-1.5 text-xs leading-relaxed text-muted-foreground">
          {{ s.note }}
        </p>
      </div>
    </li>
  </ol>
</template>
