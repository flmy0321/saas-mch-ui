<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CalendarDays, X } from '@lucide/vue'
import Popover from './Popover.vue'
import Button from './Button.vue'
import { toDateInput } from '@/utils/format'
import { cn } from '@/utils/cn'

const props = withDefaults(
  defineProps<{ placeholder?: string; class?: string; clearable?: boolean; maxDays?: number; ariaLabel?: string }>(),
  { placeholder: '选择日期范围', clearable: true },
)
const from = defineModel<string>('from', { default: '' })
const to = defineModel<string>('to', { default: '' })

const open = ref(false)
const draftFrom = ref(from.value)
const draftTo = ref(to.value)
const error = ref('')

watch(open, (v) => {
  if (v) {
    draftFrom.value = from.value
    draftTo.value = to.value
    error.value = ''
  }
})

const today = () => new Date()
const daysAgo = (n: number) => {
  const d = today()
  d.setDate(d.getDate() - n)
  return d
}
const presets = [
  { label: '今天', range: () => [today(), today()] },
  { label: '昨天', range: () => [daysAgo(1), daysAgo(1)] },
  { label: '近 7 天', range: () => [daysAgo(6), today()] },
  { label: '近 30 天', range: () => [daysAgo(29), today()] },
  {
    label: '本月',
    range: () => {
      const d = today()
      return [new Date(d.getFullYear(), d.getMonth(), 1), d]
    },
  },
]

function applyPreset(p: (typeof presets)[number]) {
  const [a, b] = p.range()
  from.value = toDateInput(a!)
  to.value = toDateInput(b!)
  open.value = false
}

function apply() {
  if (draftFrom.value && draftTo.value && draftFrom.value > draftTo.value) {
    error.value = '开始日期不能晚于结束日期'
    return
  }
  if (props.maxDays && draftFrom.value && draftTo.value) {
    const diff = (new Date(draftTo.value).getTime() - new Date(draftFrom.value).getTime()) / 86400000 + 1
    if (diff > props.maxDays) {
      error.value = `最长可选择 ${props.maxDays} 天`
      return
    }
  }
  from.value = draftFrom.value
  to.value = draftTo.value
  open.value = false
}

const display = computed(() => (from.value || to.value ? `${from.value || '…'} 至 ${to.value || '…'}` : ''))
const maxDate = toDateInput(today())
</script>

<template>
  <Popover v-model:open="open" class="w-[320px]">
    <template #trigger>
      <button
        type="button"
        :aria-label="ariaLabel || placeholder"
        :class="
          cn(
            'group flex h-9 w-full items-center gap-2 rounded-md border border-input bg-card px-3 text-left text-sm shadow-card outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20',
            props.class,
          )
        "
      >
        <CalendarDays class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span :class="cn('flex-1 truncate tabular', !display && 'text-muted-foreground/70')">{{ display || placeholder }}</span>
        <span
          v-if="clearable && display"
          role="button"
          tabindex="-1"
          aria-label="清除日期"
          class="rounded p-0.5 text-muted-foreground hover:bg-muted"
          @click.stop="((from = ''), (to = ''))"
        >
          <X class="size-3.5" />
        </span>
      </button>
    </template>
    <div class="flex flex-wrap gap-1.5">
      <button
        v-for="p in presets"
        :key="p.label"
        type="button"
        class="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground"
        @click="applyPreset(p)"
      >
        {{ p.label }}
      </button>
    </div>
    <div class="mt-3 grid grid-cols-2 gap-2">
      <label class="flex flex-col gap-1 text-xs text-muted-foreground">
        开始日期
        <input
          v-model="draftFrom"
          type="date"
          :max="maxDate"
          class="h-8 rounded-md border border-input bg-card px-2 text-[13px] text-foreground outline-none focus:border-ring"
        />
      </label>
      <label class="flex flex-col gap-1 text-xs text-muted-foreground">
        结束日期
        <input
          v-model="draftTo"
          type="date"
          :max="maxDate"
          class="h-8 rounded-md border border-input bg-card px-2 text-[13px] text-foreground outline-none focus:border-ring"
        />
      </label>
    </div>
    <p v-if="error" class="mt-2 text-xs text-danger">{{ error }}</p>
    <div class="mt-3 flex justify-end gap-2">
      <Button size="sm" variant="ghost" @click="open = false">取消</Button>
      <Button size="sm" variant="primary" @click="apply">确定</Button>
    </div>
  </Popover>
</template>
