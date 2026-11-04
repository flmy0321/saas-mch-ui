import type {
  ApiKeyStatus,
  AppEnv,
  PaymentChannel,
  PaymentMethod,
  PaymentStatus,
  RefundAggregateStatus,
  RefundStatus,
  StoreStatus,
  WebhookDeliveryStatus,
  WebhookEventType,
} from '@/types'

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary'

interface Meta {
  label: string
  tone: Tone
  description?: string
}

export const PAYMENT_STATUS: Record<PaymentStatus, Meta> = {
  CREATED: { label: '已创建', tone: 'neutral', description: '订单已创建，尚未提交支付' },
  PAYING: { label: '待支付', tone: 'info', description: '已提交支付，等待用户付款' },
  CLOSING: { label: '关闭中', tone: 'warning', description: '订单关闭请求处理中' },
  SUCCESS: { label: '支付成功', tone: 'success', description: '用户已完成付款' },
  FAILED: { label: '支付失败', tone: 'danger', description: '支付未成功' },
  CLOSED: { label: '已关闭', tone: 'neutral', description: '订单已关闭，不可再支付' },
}

export const REFUND_STATUS: Record<RefundStatus, Meta> = {
  CREATED: { label: '已受理', tone: 'info', description: '退款申请已受理' },
  PROCESSING: { label: '退款处理中', tone: 'warning', description: '退款正在处理中' },
  SUCCESS: { label: '退款成功', tone: 'success', description: '退款已完成' },
  FAILED: { label: '退款失败', tone: 'danger', description: '退款未成功' },
  CLOSED: { label: '退款已关闭', tone: 'neutral', description: '退款已关闭' },
  SUSPENDED: {
    label: '退款异常处理中',
    tone: 'warning',
    description: '退款异常处理中，请稍后查询或联系平台支持。',
  },
}

export const REFUND_AGGREGATE: Record<RefundAggregateStatus, Meta> = {
  NONE: { label: '无退款', tone: 'neutral' },
  PARTIAL: { label: '部分退款', tone: 'primary' },
  FULL: { label: '全额退款', tone: 'primary' },
}

export const CHANNEL: Record<PaymentChannel, { label: string; short: string; color: string }> = {
  WECHAT: { label: '微信支付', short: '微信', color: 'var(--chart-2)' },
  ALIPAY: { label: '支付宝', short: '支付宝', color: 'var(--chart-1)' },
  UNIONPAY: { label: '银联云闪付', short: '银联', color: 'var(--chart-3)' },
}

export const METHOD: Record<PaymentMethod, string> = {
  NATIVE: '扫码支付',
  JSAPI: '公众号支付',
  MINI_PROGRAM: '小程序支付',
  H5: 'H5 支付',
  APP: 'APP 支付',
  MICROPAY: '付款码支付',
}

export const STORE_STATUS: Record<StoreStatus, Meta> = {
  ACTIVE: { label: '营业中', tone: 'success' },
  DISABLED: { label: '已停用', tone: 'neutral' },
}

export const WEBHOOK_STATUS: Record<WebhookDeliveryStatus, Meta> = {
  SUCCESS: { label: '通知成功', tone: 'success' },
  FAILED: { label: '通知失败', tone: 'danger' },
  RETRYING: { label: '重试中', tone: 'warning' },
}

export const WEBHOOK_EVENT: Record<WebhookEventType, string> = {
  'payment.succeeded': '支付成功',
  'payment.failed': '支付失败',
  'payment.closed': '订单关闭',
  'refund.succeeded': '退款成功',
  'refund.failed': '退款失败',
  'refund.closed': '退款关闭',
}

export const API_KEY_STATUS: Record<ApiKeyStatus, Meta> = {
  ACTIVE: { label: '生效中', tone: 'success' },
  PENDING: { label: '待生效', tone: 'info' },
  EXPIRING: { label: '即将失效', tone: 'warning' },
  REVOKED: { label: '已撤销', tone: 'danger' },
  EXPIRED: { label: '已失效', tone: 'neutral' },
}

export const APP_ENV: Record<AppEnv, Meta> = {
  production: { label: '生产环境', tone: 'success' },
  sandbox: { label: '沙箱环境', tone: 'warning' },
}

export const API_PERMISSIONS: { key: string; label: string; description: string }[] = [
  { key: 'payment.create', label: '创建支付', description: '允许调用支付下单接口' },
  { key: 'payment.query', label: '查询支付', description: '允许查询支付订单状态' },
  { key: 'payment.close', label: '关闭订单', description: '允许关闭未支付订单' },
  { key: 'refund.create', label: '申请退款', description: '允许对已支付订单发起退款' },
  { key: 'refund.query', label: '查询退款', description: '允许查询退款状态' },
]

export function toOptions<T extends string>(map: Record<T, { label: string } | string>): { value: T; label: string }[] {
  return (Object.keys(map) as T[]).map((value) => {
    const m = map[value]
    return { value, label: typeof m === 'string' ? m : m.label }
  })
}
