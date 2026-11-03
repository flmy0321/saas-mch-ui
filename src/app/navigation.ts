import type { Component } from 'vue'
import { Code2, LayoutDashboard, Receipt, Settings, Store } from '@lucide/vue'

export interface NavLeaf {
  label: string
  to: string
  /** 额外匹配的路径前缀（如详情页） */
  match?: string[]
}

export interface NavGroup {
  label: string
  icon: Component
  children: NavLeaf[]
}

export const NAVIGATION: NavGroup[] = [
  {
    label: '工作台',
    icon: LayoutDashboard,
    children: [{ label: '数据概览', to: '/dashboard' }],
  },
  {
    label: '交易管理',
    icon: Receipt,
    children: [
      { label: '支付订单', to: '/payments' },
      { label: '退款记录', to: '/refunds' },
      { label: '交易统计', to: '/analytics' },
    ],
  },
  {
    label: '门店管理',
    icon: Store,
    children: [{ label: '门店列表', to: '/stores' }],
  },
  {
    label: '开发者中心',
    icon: Code2,
    children: [
      { label: '应用管理', to: '/developer/apps' },
      { label: 'API 密钥', to: '/developer/keys' },
      { label: 'Webhook 配置', to: '/developer/webhooks' },
      { label: 'Webhook 通知记录', to: '/developer/deliveries' },
      { label: 'API 接入指南', to: '/developer/docs' },
    ],
  },
  {
    label: '账户设置',
    icon: Settings,
    children: [
      { label: '商户资料', to: '/settings/merchant' },
      { label: '安全设置', to: '/settings/security' },
      { label: '个人设置', to: '/settings/profile' },
    ],
  },
]

export function isLeafActive(leaf: NavLeaf, path: string) {
  return path === leaf.to || path.startsWith(`${leaf.to}/`)
}
