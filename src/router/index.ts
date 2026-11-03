import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import AppLayout from '@/layouts/AppLayout.vue'

const routes: RouteRecordRaw[] = [
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

router.afterEach((to) => {
  document.title = `${to.meta.title ?? '商户管理后台'} · PayHub Merchant Portal`
})
