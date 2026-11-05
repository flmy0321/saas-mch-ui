import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { api } from '@/services/api'
import { hasAuthLock, tokenStorage, withAuthLock } from '@/services/auth/token'
import type { CurrentUser, LoginInput, Merchant, Notification, Store } from '@/types'

/**
 * 登录状态机：
 * CREDENTIALS → VERIFYING → SELECT_MERCHANT → COMPLETING → AUTHENTICATED
 * 任一步失败回到 CREDENTIALS 或停在 SELECT_MERCHANT，错误另由页面展示。
 */
export type LoginPhase = 'CREDENTIALS' | 'VERIFYING' | 'SELECT_MERCHANT' | 'COMPLETING' | 'AUTHENTICATED'

export class AuthStateUncertain extends Error {
  constructor(message = '登录状态无法确认，请重新验证账号密码后登录') {
    super(message)
    this.name = 'AuthStateUncertain'
  }
}

/** 选择凭证只存在于本模块内存：不进入 Pinia 状态（避免 devtools/持久化插件）、URL、存储或日志 */
let selectionToken: string | null = null

export const useSessionStore = defineStore('session', () => {
  const user = ref<CurrentUser | null>(null)
  const merchant = ref<Merchant | null>(null)
  const stores = ref<Store[]>([])
  const notifications = ref<Notification[]>([])
  /** 本标签页当前使用的客户端登录 generation；用于丢弃过期的异步结果 */
  const generation = ref<string | null>(tokenStorage.version()?.generation ?? null)

  const phase = ref<LoginPhase>(tokenStorage.isAuthenticated() ? 'AUTHENTICATED' : 'CREDENTIALS')
  const selection = shallowRef<{ tenantIds: string[]; expiresAt: number } | null>(null)

  const unreadCount = computed(() => notifications.value.filter((n) => !n.read).length)
  const storeOptions = computed(() => stores.value.map((s) => ({ value: s.id, label: s.name })))

  const isCurrent = (gen: string | null) => !!gen && gen === generation.value && tokenStorage.version()?.generation === gen

  /** 受控 bootstrap：各结果仅在发起时的 generation 仍有效时写入，防止退出/换号后旧数据回填 */
  async function bootstrap() {
    const gen = tokenStorage.version()?.generation ?? null
    if (!gen) return
    generation.value = gen
    const [u, m, s, n] = await Promise.allSettled([
      api.account.me(),
      api.account.merchant(),
      api.stores.all(),
      api.account.notifications(),
    ])
    if (!isCurrent(gen)) return
    if (u.status === 'fulfilled') user.value = u.value
    if (m.status === 'fulfilled') merchant.value = m.value
    if (s.status === 'fulfilled') stores.value = s.value
    if (n.status === 'fulfilled') notifications.value = n.value
  }

  function clearSelection() {
    selectionToken = null
    selection.value = null
  }

  /** 第一步：仅验证凭据。成功只进入商户选择，不保存 token、不写 user、不 bootstrap */
  async function beginLogin(input: LoginInput) {
    if (phase.value === 'VERIFYING' || phase.value === 'COMPLETING') return
    if (!hasAuthLock()) throw new Error('当前浏览器不支持跨标签页登录协调，请使用最新版 Chrome、Edge、Firefox 或 Safari')
    clearSelection()
    phase.value = 'VERIFYING'
    try {
      const result = await api.auth.login(input)
      selectionToken = result.selectionToken
      selection.value = { tenantIds: [...result.tenantIds], expiresAt: result.expiresAt }
      phase.value = 'SELECT_MERCHANT'
    } catch (e) {
      phase.value = 'CREDENTIALS'
      throw e
    }
  }

  /** 取消/返回：仅丢弃本地选择凭证（无服务端撤销接口） */
  function cancelSelection() {
    clearSelection()
    if (phase.value !== 'AUTHENTICATED') phase.value = 'CREDENTIALS'
  }

  function resetTenantData() {
    user.value = null
    merchant.value = null
    stores.value = []
    notifications.value = []
  }

  /**
   * 第二步：用户显式选择商户后建立正式会话。
   * 401（选择失效/复用）、403（成员资格）由调用方据 code 处理并回到凭据步骤；
   * 网络/503 抛 AuthStateUncertain：会话可能已建立，不自动重试。
   */
  async function completeLogin(tenantId: string) {
    if (phase.value !== 'SELECT_MERCHANT' || !selectionToken || !selection.value) return
    if (!selection.value.tenantIds.includes(tenantId)) throw new Error('请选择列表中的商户')
    const token = selectionToken
    // 选择凭证一次性：发出即作废，不论结果
    selectionToken = null
    phase.value = 'COMPLETING'
    try {
      const { user: me, ...tokens } = await api.auth.selectMerchant({ selectionToken: token, tenantId })
      const version = await withAuthLock(() => tokenStorage.startGeneration(tokens))
      resetTenantData()
      generation.value = version.generation
      user.value = me
      selection.value = null
      phase.value = 'AUTHENTICATED'
    } catch (e) {
      selection.value = null
      phase.value = 'CREDENTIALS'
      const status = (e as { httpStatus?: number }).httpStatus
      if (status === 401 || status === 403 || status === 400) throw e
      throw new AuthStateUncertain()
    }
  }

  /** 本地登录态被外部（其他标签页/会话失效）结束时，同步清理本页 */
  function reset() {
    clearSelection()
    resetTenantData()
    generation.value = tokenStorage.version()?.generation ?? null
    phase.value = tokenStorage.isAuthenticated() ? 'AUTHENTICATED' : 'CREDENTIALS'
  }

  /** 退出：携带当前 access（不为退出先刷新）；无论结果都清理本 generation 的本地登录 */
  async function logout() {
    const snap = tokenStorage.snapshot()
    try {
      if (snap?.tokens) await api.auth.logout(snap.tokens.accessToken)
    } catch {
      // 服务端幂等；失败不阻止本地清理
    } finally {
      const gen = snap?.generation
      try {
        await withAuthLock(() => tokenStorage.endGeneration(gen))
      } catch {
        tokenStorage.endGeneration(gen)
      }
      generation.value = null
      clearSelection()
      resetTenantData()
      phase.value = 'CREDENTIALS'
    }
  }

  async function refreshStores() {
    const gen = generation.value
    const list = await api.stores.all()
    if (isCurrent(gen)) stores.value = list
  }

  async function markAllRead() {
    await api.account.markAllRead()
    notifications.value = notifications.value.map((n) => ({ ...n, read: true }))
  }

  return {
    user,
    merchant,
    stores,
    notifications,
    generation,
    phase,
    selection,
    unreadCount,
    storeOptions,
    bootstrap,
    beginLogin,
    completeLogin,
    cancelSelection,
    logout,
    reset,
    refreshStores,
    markAllRead,
  }
})
