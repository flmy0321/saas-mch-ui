import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { usePreferredDark, useStorage } from '@vueuse/core'
import { setMockNetworkFailure } from '@/services/mock/control'
import type { AppEnv } from '@/types'

export type ThemePreference = 'light' | 'dark' | 'system'

export const useAppStore = defineStore('app', () => {
  const theme = useStorage<ThemePreference>('mp-theme', 'light')
  const sidebarCollapsed = useStorage('mp-sidebar-collapsed', false)
  const env = useStorage<AppEnv>('mp-env', 'production')
  const density = useStorage<'comfortable' | 'compact'>('mp-density', 'comfortable')
  const mobileNavOpen = ref(false)
  const simulateNetworkError = ref(false)
  const searchOpen = ref(false)

  const prefersDark = usePreferredDark()
  const isDark = computed(() => theme.value === 'dark' || (theme.value === 'system' && prefersDark.value))

  watch(isDark, (v) => document.documentElement.classList.toggle('dark', v), { immediate: true })
  watch(simulateNetworkError, (v) => setMockNetworkFailure(v), { immediate: true })

  function toggleTheme() {
    theme.value = isDark.value ? 'light' : 'dark'
  }

  return {
    theme,
    isDark,
    sidebarCollapsed,
    env,
    density,
    mobileNavOpen,
    simulateNetworkError,
    searchOpen,
    toggleTheme,
  }
})
