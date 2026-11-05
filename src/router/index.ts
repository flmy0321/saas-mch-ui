import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { toast } from 'vue-sonner'
import AppLayout from '@/layouts/AppLayout.vue'
import { tokenStorage } from '@/services/auth/token'
import { setUnauthenticatedHandler, type AuthLossReason } from '@/services/api'
import { pinia } from '@/stores'
import { useSessionStore } from '@/stores/session'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    component: () => import('@/pages/auth/LoginPage.vue'),
    meta: { title: '登录', public: true },
  },
  {
    path: '/',
    component: AppLayout,
    children: [
      { path: '', redirect: '/dashboard' },
      {
        path: 'dashboard',
        component: () => import('@/pages/dashboard/DashboardPage.vue'),
        meta: { title: '数据概览', breadcrumb: ['工作台', '数据概览'] },
      },
      {
        path: 'payments',
        component: () => import('@/pages/payments/PaymentListPage.vue'),
        meta: { title: '支付订单', breadcrumb: ['交易管理', '支付订单'] },
      },
      {
        path: 'payments/:id',
        component: () => import('@/pages/payments/PaymentDetailPage.vue'),
        meta: { title: '支付订单详情', breadcrumb: ['交易管理', '支付订单', '订单详情'] },
      },
      {
        path: 'refunds',
        component: () => import('@/pages/refunds/RefundListPage.vue'),
        meta: { title: '退款记录', breadcrumb: ['交易管理', '退款记录'] },
      },
      {
        path: 'refunds/:id',
        component: () => import('@/pages/refunds/RefundDetailPage.vue'),
        meta: { title: '退款详情', breadcrumb: ['交易管理', '退款记录', '退款详情'] },
      },
      {
        path: 'analytics',
        component: () => import('@/pages/analytics/AnalyticsPage.vue'),
        meta: { title: '交易统计', breadcrumb: ['交易管理', '交易统计'] },
      },
      {
        path: 'stores',
        component: () => import('@/pages/stores/StoreListPage.vue'),
        meta: { title: '门店列表', breadcrumb: ['门店管理', '门店列表'] },
      },
      {
        path: 'stores/:id',
        component: () => import('@/pages/stores/StoreDetailPage.vue'),
        meta: { title: '门店详情', breadcrumb: ['门店管理', '门店列表', '门店详情'] },
      },
      {
        path: 'developer/apps',
        component: () => import('@/pages/developer/AppListPage.vue'),
        meta: { title: '应用管理', breadcrumb: ['开发者中心', '应用管理'] },
      },
      {
        path: 'developer/apps/:appId',
        component: () => import('@/pages/developer/AppDetailPage.vue'),
        meta: { title: '应用详情', breadcrumb: ['开发者中心', '应用管理', '应用详情'] },
      },
      {
        path: 'developer/keys',
        component: () => import('@/pages/developer/ApiKeysPage.vue'),
        meta: { title: 'API 密钥', breadcrumb: ['开发者中心', 'API 密钥'] },
      },
      {
        path: 'developer/webhooks',
        component: () => import('@/pages/developer/WebhookConfigPage.vue'),
        meta: { title: 'Webhook 配置', breadcrumb: ['开发者中心', 'Webhook 配置'] },
      },
      {
        path: 'developer/deliveries',
        component: () => import('@/pages/developer/WebhookDeliveriesPage.vue'),
        meta: { title: 'Webhook 通知记录', breadcrumb: ['开发者中心', 'Webhook 通知记录'] },
      },
      {
        path: 'developer/docs',
        component: () => import('@/pages/developer/DocsPage.vue'),
        meta: { title: 'API 接入指南', breadcrumb: ['开发者中心', 'API 接入指南'] },
      },
      {
        path: 'settings/merchant',
        component: () => import('@/pages/settings/MerchantProfilePage.vue'),
        meta: { title: '商户资料', breadcrumb: ['账户设置', '商户资料'] },
      },
      {
        path: 'settings/security',
        component: () => import('@/pages/settings/SecurityPage.vue'),
        meta: { title: '安全设置', breadcrumb: ['账户设置', '安全设置'] },
      },
      {
        path: 'settings/profile',
        component: () => import('@/pages/settings/ProfilePage.vue'),
        meta: { title: '个人设置', breadcrumb: ['账户设置', '个人设置'] },
      },
      {
        path: ':pathMatch(.*)*',
        component: () => import('@/pages/NotFoundPage.vue'),
        meta: { title: '页面不存在' },
      },
    ],
  },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: (to, from, saved) => {
    if (saved) return saved
    if (to.path === from.path) return false
    return { top: 0 }
  },
})

/** 只允许站内相对路径，防止 ?redirect= 被用于开放重定向 */
export function safeRedirect(value: unknown) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/login')
    ? value
    : '/dashboard'
}

router.beforeEach((to) => {
  const authed = tokenStorage.isAuthenticated()
  if (to.meta.public) {
    return to.path === '/login' && authed ? safeRedirect(to.query.redirect) : true
  }
  if (!authed) return { path: '/login', query: { redirect: to.fullPath } }
  return true
})

const LOSS_MESSAGE: Record<AuthLossReason, string> = {
  expired: '登录已过期，请重新登录',
  uncertain: '登录状态无法确认，请重新登录',
  superseded: '登录状态已在其他页面变更',
}

/** 本页登录被结束：清理本页租户数据并回到登录页；新登录由其他页面写入时整页重载，丢弃旧页面缓存 */
function leaveSession(reason: AuthLossReason) {
  const session = useSessionStore(pinia)
  const current = router.currentRoute.value
  if (tokenStorage.isAuthenticated() && tokenStorage.version()?.generation !== session.generation) {
    window.location.assign(current.meta.public ? '/dashboard' : current.fullPath)
    return
  }
  session.reset()
  if (current.meta.public) return
  toast.error(LOSS_MESSAGE[reason])
  router.replace({ path: '/login', query: { redirect: current.fullPath } })
}

setUnauthenticatedHandler(leaveSession)

/** 跨标签页：只监听 generation/revision 的变化，不广播任何凭据 */
tokenStorage.subscribe((snap) => {
  const session = useSessionStore(pinia)
  const gen = snap?.tokens ? snap.generation : null
  if (gen === session.generation) return
  if (!gen && !session.generation) return
  leaveSession('superseded')
})

router.afterEach((to) => {
  document.title = `${to.meta.title ?? '商户管理后台'} · PayHub Merchant Portal`
})
