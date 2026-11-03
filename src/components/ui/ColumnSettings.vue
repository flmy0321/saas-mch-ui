<script setup lang="ts">
import { Columns3 } from '@lucide/vue'
import Popover from './Popover.vue'
import Button from './Button.vue'
import Checkbox from './Checkbox.vue'

defineProps<{ columns: { id: string; label: string; locked?: boolean }[] }>()
const visibility = defineModel<Record<string, boolean>>({ required: true })

function set(id: string, v: boolean) {
  visibility.value = { ...visibility.value, [id]: v }
}
</script>

<template>
  <Popover align="end" class="w-52 p-2">
    <template #trigger>
      <Button size="sm" aria-label="列显示设置"><Columns3 aria-hidden="true" /><span class="hidden sm:inline">列设置</span></Button>
    </template>
    <p class="px-2 pt-1 pb-2 text-xs font-medium text-muted-foreground">显示列</p>
    <label
      v-for="c in columns"
      :key="c.id"
      class="flex h-8 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm hover:bg-muted has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
    >
      <Checkbox
        :model-value="visibility[c.id] !== false"
        :disabled="c.locked"
        @update:model-value="(v: boolean | 'indeterminate') => set(c.id, v === true)"
      />
      {{ c.label }}
    </label>
  </Popover>
</template>
