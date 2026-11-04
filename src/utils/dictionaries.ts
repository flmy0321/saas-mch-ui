import type {
  ApiKeyStatus,
  AppEnv,
  KnownCollectionVerification,
  KnownPaymentChannel,
  KnownPaymentMethod,
  KnownPaymentStatus,
  KnownRefundEligibility,
  KnownRefundStatus,
  KnownWebhookEventType,
  RefundAggregateStatus,
  StoreStatus,
} from '@/types'

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary'

export interface Meta {
  label: string
  tone: Tone
  description?: string
}

/** 未知枚举：原值展示 + 中性色 + 统一提示，不参与业务判断（协议 1.4） */
const UNKNOWN_HINT = '平台新增状态，当前版本暂未识别'
const unknownMeta = (value: string | null | undefined): Meta => ({
  label: value || '—',
  tone: 'neutral',
  description: value ? UNKNOWN_HINT : undefined,
})

function lookup<T>(map: Record<string, T>, key: string | null | undefined): T | undefined {
  return key && Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined
}

export const PAYMENT_STATUS: Record<KnownPaymentStatus, Meta> = {
  CREATED: { label: '已创建', tone: 'neutral', description: '订单已创建，尚未提交支付' },
  PAYING: { label: '待支付', tone: 'info', description: '已提交支付，等待用户付款' },
  CLOSING: { label: '关闭中', tone: 'warning', description: '订单关闭请求处理中' },
  SUCCESS: { label: '支付成功', tone: 'success', description: '用户已完成付款' },
  FAILED: { label: '支付失败', tone: 'danger', description: '支付未成功' },
  CLOSED: { label: '已关闭', tone: 'neutral', description: '订单已关闭，不可再支付' },
}

export const REFUND_STATUS: Record<KnownRefundStatus, Meta> = {
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

export const REFUND_ELIGIBILITY: Record<KnownRefundEligibility, Meta> = {
  ALLOWED: { label: '可退款', tone: 'success' },
  NOT_COLLECTED: { label: '未入账', tone: 'neutral', description: '订单尚未完成入账，暂不可退款' },
  REVIEW_REQUIRED: { label: '待复核', tone: 'warning', description: '订单入账待复核，复核完成前不可退款' },
  RULE_UNVERIFIED: { label: '规则未核验', tone: 'warning', description: '退款规则尚未核验，暂不可退款' },
  BLOCKED: { label: '已限制', tone: 'danger', description: '订单退款已被限制' },
  EXHAUSTED: { label: '已退尽', tone: 'neutral', description: '可退款金额已用尽' },
}

export const COLLECTION_VERIFICATION: Record<KnownCollectionVerification, Meta> = {
  PENDING: { label: '待核验', tone: 'info' },
  VERIFIED: { label: '已核验', tone: 'success' },
  REVIEW_REQUIRED: { label: '待复核', tone: 'warning' },
}

interface ChannelMeta {
  label: string
  short: string
  color: string
}

export const CHANNEL: Record<KnownPaymentChannel, ChannelMeta> = {
  WECHAT: { label: '微信支付', short: '微信', color: 'var(--chart-2)' },
  ALIPAY: { label: '支付宝', short: '支付宝', color: 'var(--chart-1)' },
  UNIONPAY: { label: '银联云闪付', short: '银联', color: 'var(--chart-3)' },
  DCEP: { label: '数字人民币', short: '数币', color: 'var(--chart-4)' },
  JD: { label: '京东支付', short: '京东', color: 'var(--chart-5)' },
  HUAWEI: { label: '华为支付', short: '华为', color: 'var(--chart-4)' },
  TIKTOK: { label: '抖音支付', short: '抖音', color: 'var(--chart-5)' },
}

export const METHOD: Record<KnownPaymentMethod, string> = {
  QR: '扫码支付',
  MINI_PROGRAM: '小程序支付',
  OFFICIAL_ACCOUNT: '公众号支付',
  H5: 'H5 支付',
  SDK: 'APP 支付',
  JS: 'JS 支付',
  MERCHANT_SCAN: '付款码支付',
  STATIC_QR: '静态码支付',
  POS: 'POS 支付',
}

export const STORE_STATUS: Record<StoreStatus, Meta> = {
  ACTIVE: { label: '营业中', tone: 'success' },
  DISABLED: { label: '已停用', tone: 'neutral' },
}

export const WEBHOOK_STATUS: Record<'SUCCESS' | 'FAILED' | 'RETRYING', Meta> = {
  SUCCESS: { label: '通知成功', tone: 'success' },
  FAILED: { label: '通知失败', tone: 'danger' },
  RETRYING: { label: '重试中', tone: 'warning' },
}

export const WEBHOOK_EVENT: Record<KnownWebhookEventType, string> = {
  'PAYMENT.SUCCEEDED': '支付成功',
  'PAYMENT.FAILED': '支付失败',
  'PAYMENT.CLOSED': '订单关闭',
  'REFUND.SUCCEEDED': '退款成功',
  'REFUND.FAILED': '退款失败',
  'REFUND.CLOSED': '退款关闭',
  'REFUND.SUSPENDED': '退款异常',
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

/* 带兜底的查询：未知值原样展示，不抛错、不映射为已知状态 */
export const paymentStatusMeta = (v: string | null | undefined) => lookup(PAYMENT_STATUS, v) ?? unknownMeta(v)
export const refundStatusMeta = (v: string | null | undefined) => lookup(REFUND_STATUS, v) ?? unknownMeta(v)
export const refundEligibilityMeta = (v: string | null | undefined) => lookup(REFUND_ELIGIBILITY, v) ?? unknownMeta(v)
export const collectionVerificationMeta = (v: string | null | undefined) =>
  lookup(COLLECTION_VERIFICATION, v) ?? unknownMeta(v)
export const webhookStatusMeta = (v: string | null | undefined) => lookup(WEBHOOK_STATUS, v) ?? unknownMeta(v)
export const channelMeta = (v: string | null | undefined): ChannelMeta & { unknown?: boolean } =>
  lookup(CHANNEL, v) ?? { label: v || '—', short: v || '—', color: 'var(--muted-foreground)', unknown: true }
export const methodLabel = (v: string | null | undefined) => lookup(METHOD, v) ?? (v || '—')
export const webhookEventLabel = (v: string | null | undefined) => lookup(WEBHOOK_EVENT, v) ?? (v || '—')
export const isKnown = (map: Record<string, unknown>, v: string | null | undefined) => lookup(map, v) !== undefined

export function toOptions<T extends string>(map: Record<T, { label: string } | string>): { value: T; label: string }[] {
  return (Object.keys(map) as T[]).map((value) => {
    const m = map[value]
    return { value, label: typeof m === 'string' ? m : m.label }
  })
}
