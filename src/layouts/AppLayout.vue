<script setup lang="ts">
import { watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { WifiOff } from '@lucide/vue'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import GlobalSearch from '@/components/layout/GlobalSearch.vue'
import { useAppStore } from '@/stores/app'
import { useSessionStore } from '@/stores/session'
import { cn } from '@/utils/cn'

const app = useAppStore()
const { sidebarCollapsed, mobileNavOpen, simulateNetworkError } = storeToRefs(app)
const route = useRoute()

useSessionStore().bootstrap()

watch(
  () => route.fullPath,
  () => (mobileNavOpen.value = false),
)
</script>

<template>
  <div class="flex min-h-dvh">
    <aside
      :class="
        cn(
          'sticky top-0 hidden h-dvh shrink-0 border-r border-border transition-[width] duration-200 lg:block',
          sidebarCollapsed ? 'w-[60px]' : 'w-60',
        )
      "
    >
      <AppSidebar />
    </aside>

    <DialogRoot v-model:open="mobileNavOpen">
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 z-50 bg-foreground/25 lg:hidden" />
        <DialogContent class="fixed inset-y-0 left-0 z-50 w-64 border-r border-border shadow-overlay outline-none lg:hidden">
          <DialogTitle class="sr-only">导航菜单</DialogTitle>
          <AppSidebar mobile />
        </DialogContent>
      </DialogPortal>
    </DialogRoot>

    <div class="flex min-w-0 flex-1 flex-col">
      <AppHeader />
      <div
        v-if="simulateNetworkError"
        role="status"
        class="flex items-center justify-center gap-2 border-b border-warning/30 bg-warning-soft px-4 py-1.5 text-xs text-foreground"
      >
        <WifiOff class="size-3.5 text-warning" aria-hidden="true" />
        已开启「模拟网络异常」，所有 Mock 请求将返回失败。可在右上角用户菜单中关闭。
      </div>
      <main class="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <RouterView v-slot="{ Component, route: r }">
          <component :is="Component" :key="r.path" />
        </RouterView>
      </main>
    </div>
    <GlobalSearch />
  </div>
</template>
