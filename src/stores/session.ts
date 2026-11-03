import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@/services/api'
import type { CurrentUser, Merchant, Notification, Store } from '@/types'

/** 会话级共享数据：当前用户、商户、门店字典、消息通知 */
export const useSessionStore = defineStore('session', () => {
  const user = ref<CurrentUser | null>(null)
  const merchant = ref<Merchant | null>(null)
  const stores = ref<Store[]>([])
  const notifications = ref<Notification[]>([])

  const unreadCount = computed(() => notifications.value.filter((n) => !n.read).length)
  const storeOptions = computed(() => stores.value.map((s) => ({ value: s.id, label: s.name })))

  async function bootstrap() {
    const [u, m, s, n] = await Promise.allSettled([
      api.account.me(),
      api.account.merchant(),
      api.stores.all(),
      api.account.notifications(),
    ])
    if (u.status === 'fulfilled') user.value = u.value
    if (m.status === 'fulfilled') merchant.value = m.value
    if (s.status === 'fulfilled') stores.value = s.value
    if (n.status === 'fulfilled') notifications.value = n.value
  }

  async function refreshStores() {
    stores.value = await api.stores.all()
  }

  async function markAllRead() {
    await api.account.markAllRead()
    notifications.value = notifications.value.map((n) => ({ ...n, read: true }))
  }

  return { user, merchant, stores, notifications, unreadCount, storeOptions, bootstrap, refreshStores, markAllRead }
})
