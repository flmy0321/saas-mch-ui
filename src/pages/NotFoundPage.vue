<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Compass } from '@lucide/vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Button from '@/components/ui/Button.vue'
</script>

<template>
  <EmptyState :icon="Compass" title="页面不存在" description="您访问的页面可能已被移除，或链接地址有误。" class="py-32">
    <Button :as="RouterLink" to="/dashboard" variant="primary">返回工作台</Button>
  </EmptyState>
</template>
