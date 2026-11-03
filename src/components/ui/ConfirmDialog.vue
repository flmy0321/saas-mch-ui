<script setup lang="ts">
import Dialog from './Dialog.vue'
import Button from './Button.vue'

withDefaults(
  defineProps<{
    title: string
    description?: string
    confirmText?: string
    danger?: boolean
    loading?: boolean
  }>(),
  { confirmText: '确认' },
)
const open = defineModel<boolean>('open', { default: false })
defineEmits<{ confirm: [] }>()
</script>

<template>
  <Dialog v-model:open="open" :title="title" :description="description" class="max-w-md" :dismissible="!loading">
    <slot />
    <template #footer>
      <Button :disabled="loading" @click="open = false">取消</Button>
      <Button :variant="danger ? 'danger' : 'primary'" :loading="loading" @click="$emit('confirm')">
        {{ confirmText }}
      </Button>
    </template>
  </Dialog>
</template>
