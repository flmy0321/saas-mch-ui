<script setup lang="ts">
import { computed } from 'vue'
import {
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from 'reka-ui'
import { Check, ChevronDown } from '@lucide/vue'
import { cn } from '@/utils/cn'

const ALL = '__all__'

const props = withDefaults(
  defineProps<{
    options: { value: string; label: string }[]
    placeholder?: string
    /** 为 true 时在顶部增加「全部」选项，值为空字符串 */
    allowAll?: boolean
    allLabel?: string
    class?: string
    id?: string
    ariaLabel?: string
    disabled?: boolean
  }>(),
  { placeholder: '请选择', allLabel: '全部' },
)
const model = defineModel<string>({ default: '' })

const inner = computed({
  get: () => (model.value === '' ? (props.allowAll ? ALL : undefined) : model.value),
  set: (v) => (model.value = !v || v === ALL ? '' : v),
})
</script>

<template>
  <SelectRoot v-model="inner" :disabled="disabled">
    <SelectTrigger
      :id="id"
      :aria-label="ariaLabel"
      :class="
        cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 text-left text-sm shadow-card outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:opacity-60 data-[placeholder]:text-muted-foreground/70',
          props.class,
        )
      "
    >
      <SelectValue :placeholder="placeholder" class="truncate" />
      <ChevronDown class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </SelectTrigger>
    <SelectPortal>
      <SelectContent
        position="popper"
        :side-offset="4"
        class="z-50 max-h-72 min-w-[var(--reka-select-trigger-width)] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-pop animate-fade-in"
      >
        <SelectViewport class="p-1">
          <SelectItem
            v-if="allowAll"
            :value="ALL"
            class="relative flex h-8 cursor-default items-center rounded-md pr-8 pl-2.5 text-sm outline-none select-none data-[highlighted]:bg-muted"
          >
            <SelectItemText>{{ allLabel }}</SelectItemText>
            <SelectItemIndicator class="absolute right-2"><Check class="size-4 text-primary" /></SelectItemIndicator>
          </SelectItem>
          <SelectItem
            v-for="o in options"
            :key="o.value"
            :value="o.value"
            class="relative flex h-8 cursor-default items-center rounded-md pr-8 pl-2.5 text-sm outline-none select-none data-[highlighted]:bg-muted data-[disabled]:opacity-50"
          >
            <SelectItemText>{{ o.label }}</SelectItemText>
            <SelectItemIndicator class="absolute right-2"><Check class="size-4 text-primary" /></SelectItemIndicator>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
