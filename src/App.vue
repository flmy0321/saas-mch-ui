<script setup lang="ts">
import { RouterView } from 'vue-router'
import { storeToRefs } from 'pinia'
import { Toaster } from 'vue-sonner'
import { TooltipProvider } from 'reka-ui'
import { useAppStore } from '@/stores/app'

const { isDark } = storeToRefs(useAppStore())
</script>

<template>
  <TooltipProvider :delay-duration="250">
    <RouterView />
  </TooltipProvider>
  <Toaster
    position="top-center"
    :theme="isDark ? 'dark' : 'light'"
    rich-colors
    close-button
    :toast-options="{ style: { fontFamily: 'var(--font-sans)' } }"
  />
</template>
