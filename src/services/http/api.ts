import type { MerchantApi } from '@/services/api/types'
import { ApiError } from '@/services/api/types'
import type {
  AppViewPage,
  AppViewSingle,
  AuthTokens,
  Captcha,
  LoginResult,
  MerchantProfileView,
  MerchantSelection,
  PaymentDetailView,
  PaymentListItem,
  PaymentListPage,
  RefundViewPage,
  RefundViewSingle,
  StoreViewPage,
  StoreViewSingle,
} from '@/types'
import {
  APP_VIEW_VERSION,
  MERCHANT_PROFILE_VIEW_VERSION,
  PAYMENT_DETAIL_VIEW_VERSION,
  PAYMENT_LIST_VIEW_VERSION,
  REFUND_VIEW_VERSION,
  STORE_VIEW_VERSION,
} from '@/types'
import { isExactCount, MAX_PAGE } from '@/utils/count'
import { request, seg } from './client'

const PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/

const malformed = (what: string) =>
  new ApiError(`服务端返回的${what}格式异常`, 'MALFORMED_RESPONSE', { httpStatus: 200 })

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const isPositiveNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0

/** 验证码图片只接受后台返回的 PNG data URL，直接作 <img src>；不接受远程 URL 或其他类型 */
function parseCaptcha(v: unknown): Captcha {
  const c = v as Partial<Captcha> | null
  if (!c || !isNonEmptyString(c.captchaId) || !isNonEmptyString(c.image) || !PNG_DATA_URL.test(c.image) || !isPositiveNumber(c.expiresIn)) {
    throw malformed('验证码')
  }
  return { captchaId: c.captchaId, image: c.image, expiresIn: c.expiresIn }
}

function parseSelection(v: unknown): MerchantSelection {
  const s = v as Partial<MerchantSelection> | null
  if (
    !s ||
    !isNonEmptyString(s.selectionToken) ||
    !isPositiveNumber(s.expiresAt) ||
    !Array.isArray(s.tenantIds) ||
    s.tenantIds.length === 0 ||
    !s.tenantIds.every(isNonEmptyString)
  ) {
    throw malformed('商户选择')
  }
  return { selectionToken: s.selectionToken, expiresAt: s.expiresAt, tenantIds: [...s.tenantIds] }
}

const LIST_ITEM_KEYS: readonly (keyof PaymentListItem)[] = [
  'id', 'source', 'merchantOrderNo', 'storeId', 'storeName', 'subject', 'amount', 'currency', 'channel', 'method',
  'createdAt', 'paidAt', 'expireAt', 'refundedAmount', 'refundingAmount', 'refundPrincipalLimit',
  'availableRefundAmount', 'refundEligibility', 'collectionVerification', 'status', 'coreStatus', 'refundAggregate',
]
const isIntIn = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max

/**
 * 支付列表精简视图（协议 4.1a）：校验版本、精确 total 与必需键（含必需 nullable）；
 * 不补默认值、不把 total 转 Number。字段级格式以服务端 Schema 为准。
 */
function parsePaymentListPage(v: unknown): PaymentListPage {
  const p = v as Partial<PaymentListPage> | null
  if (
    !p ||
    p.viewVersion !== PAYMENT_LIST_VIEW_VERSION ||
    !isExactCount(p.total) ||
    !isIntIn(p.page, 1, MAX_PAGE) ||
    !isIntIn(p.pageSize, 1, 100) ||
    !isNonEmptyString(p.asOf) ||
    !Array.isArray(p.items) ||
    p.items.length > 100
  ) {
    throw malformed('支付列表')
  }
  for (const item of p.items) checkPaymentItem(item, '支付列表项')
  return p as PaymentListPage
}

function checkPaymentItem(item: unknown, what: string): void {
  const o = item as Record<string, unknown> | null
  if (!hasExactKeys(o, LIST_ITEM_KEYS)) throw malformed(what)
  if (o.source === 'API' && (typeof o.merchantOrderNo !== 'string' || typeof o.subject !== 'string')) throw malformed(what)
  if (o.source === 'EXTERNAL' && o.merchantOrderNo !== null) throw malformed(what)
}

/* ---------- 严格视图校验（协议 3.1b / 3.8.0a） ---------- */

function hasExactKeys(o: unknown, keys: readonly string[]): o is Record<string, unknown> {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false
  const own = Object.keys(o)
  return own.length === keys.length && keys.every((k) => Object.prototype.hasOwnProperty.call(o, k))
}
const isStr = (v: unknown): v is string => typeof v === 'string'
const isStrOrNull = (v: unknown) => v === null || typeof v === 'string'

type FieldRule = (v: unknown) => boolean
type ItemRules = Record<string, FieldRule>

function checkItem(item: unknown, rules: ItemRules, what: string): void {
  const keys = Object.keys(rules)
  if (!hasExactKeys(item, keys)) throw malformed(what)
  for (const k of keys) if (!rules[k](item[k])) throw malformed(what)
}

/** 单项：恰好 viewVersion / 数据键 / asOf 三键 */
function parseSingle<T>(v: unknown, version: string, dataKey: string, check: (item: unknown) => void, what: string): T {
  if (!hasExactKeys(v, ['viewVersion', dataKey, 'asOf']) || v.viewVersion !== version || !isNonEmptyString(v.asOf)) {
    throw malformed(what)
  }
  check(v[dataKey])
  return v as T
}

/** 列表：恰好六键；total 为非负安全整数，不舍入不截断 */
function parsePage<T>(v: unknown, version: string, check: (item: unknown) => void, what: string): T {
  if (
    !hasExactKeys(v, ['viewVersion', 'items', 'total', 'page', 'pageSize', 'asOf']) ||
    v.viewVersion !== version ||
    !isIntIn(v.total, 0, Number.MAX_SAFE_INTEGER) ||
    !isIntIn(v.page, 1, MAX_PAGE) ||
    !isIntIn(v.pageSize, 1, 100) ||
    !isNonEmptyString(v.asOf) ||
    !Array.isArray(v.items) ||
    v.items.length > v.pageSize
  ) {
    throw malformed(what)
  }
  for (const item of v.items) check(item)
  return v as T
}

const MERCHANT_RULES: ItemRules = { merchantNo: isNonEmptyString, name: isStr, status: isNonEmptyString, createdAt: isNonEmptyString }
const STORE_RULES: ItemRules = {
  id: isNonEmptyString, storeNo: isNonEmptyString, merchantStoreNo: isStrOrNull, name: isStr, status: isNonEmptyString, createdAt: isNonEmptyString,
}
const APP_RULES: ItemRules = {
  id: isNonEmptyString, appId: isNonEmptyString, name: isStr, env: isNonEmptyString, status: isNonEmptyString, createdAt: isNonEmptyString,
}
const REFUND_RULES: ItemRules = {
  id: isNonEmptyString, merchantRefundNo: isStrOrNull, paymentId: isNonEmptyString, storeId: isStrOrNull, storeName: isStrOrNull,
  amount: isStr, status: isNonEmptyString, reason: isStrOrNull, createdAt: isNonEmptyString, finishedAt: isStrOrNull,
}
const checkStore = (i: unknown) => checkItem(i, STORE_RULES, '门店')
const checkApp = (i: unknown) => checkItem(i, APP_RULES, 'App')
const checkRefund = (i: unknown) => checkItem(i, REFUND_RULES, '退款')

/** 精确查询：返回的两个键必须与请求一致（null 视为不一致），否则按畸形响应处理 */
function parseRefundExact(v: unknown, paymentId: string, merchantRefundNo: string): RefundViewSingle {
  const r = parseSingle<RefundViewSingle>(v, REFUND_VIEW_VERSION, 'refund', checkRefund, '退款')
  if (r.refund.paymentId !== paymentId || r.refund.merchantRefundNo !== merchantRefundNo) throw malformed('退款精确查询')
  return r
}

/**
 * 真实 HTTP 实现（/api/portal/v1，identity-http v0.2 + 网页接口 v1.4 草案）。
 * captcha → login → select-merchant 由同一浏览器同源发出，服务端以 HttpOnly 匿名挑战 Cookie 绑定；
 * 该 Cookie 不是登录凭证，前端也不读写它。失败一律抛 ApiError，不回退 Mock。
 */
export const httpApi: MerchantApi = {
  auth: {
    async captcha() {
      return parseCaptcha(await request('/auth/captcha', { auth: { kind: 'anonymous' } }))
    },
    async login(input) {
      const body = { account: input.account, password: input.password, captchaId: input.captchaId, captchaCode: input.captchaCode }
      return parseSelection(await request('/auth/login', { method: 'POST', body, auth: { kind: 'anonymous' } }))
    },
    selectMerchant(input) {
      return request<LoginResult>('/auth/select-merchant', {
        method: 'POST',
        body: { selectionToken: input.selectionToken, tenantId: input.tenantId },
        auth: { kind: 'anonymous' },
      })
    },
    refresh(refreshToken) {
      return request<AuthTokens>('/auth/refresh', { method: 'POST', body: { refreshToken }, auth: { kind: 'anonymous' } })
    },
    async logout(accessToken) {
      await request<void>('/auth/logout', { method: 'POST', auth: { kind: 'bearer', token: accessToken } })
    },
  },
  dashboard: {
    summary: () => request('/dashboard/summary'),
    trend: (days) => request('/dashboard/trend', { query: { days } }),
    channelShare: (days) => request('/dashboard/channel-share', { query: { days } }),
    recentPayments: (limit) => request('/dashboard/recent-payments', { query: { limit } }),
  },
  payments: {
    list: async (query) => parsePaymentListPage(await request<unknown>('/payments', { query: { ...query } })),
    get: async (id) =>
      parseSingle<PaymentDetailView>(await request<unknown>(`/payments/${seg(id)}`), PAYMENT_DETAIL_VIEW_VERSION, 'payment', (i) => checkPaymentItem(i, '支付详情'), '支付详情'),
    refundable: (id) => request(`/payments/${seg(id)}/refundable`),
    exportCsv: (query) => request('/payments/export', { query: { ...query } }),
  },
  refunds: {
    list: async (query) => parsePage<RefundViewPage>(await request<unknown>('/refunds', { query: { ...query } }), REFUND_VIEW_VERSION, checkRefund, '退款列表'),
    get: async (id) => parseSingle<RefundViewSingle>(await request<unknown>(`/refunds/${seg(id)}`), REFUND_VIEW_VERSION, 'refund', checkRefund, '退款详情'),
    create: (input) =>
      request<unknown>('/refunds', {
        method: 'POST',
        body: { paymentId: input.paymentId, amount: input.amount, merchantRefundNo: input.merchantRefundNo, reason: input.reason },
        rawSuccess: true,
      }),
    findByMerchantRefundNo: async (paymentId, merchantRefundNo) =>
      parseRefundExact(
        await request<unknown>(`/refunds/by-merchant-refund-no/${seg(merchantRefundNo)}`, { query: { paymentId } }),
        paymentId,
        merchantRefundNo,
      ),
  },
  analytics: {
    query: (q) => request('/analytics', { query: { ...q } }),
  },
  stores: {
    list: async (query) => parsePage<StoreViewPage>(await request<unknown>('/stores', { query: { ...query } }), STORE_VIEW_VERSION, checkStore, '门店列表'),
    all: () => request('/stores/options'),
    get: async (id) => parseSingle<StoreViewSingle>(await request<unknown>(`/stores/${seg(id)}`), STORE_VIEW_VERSION, 'store', checkStore, '门店详情'),
    stats: (id) => request(`/stores/${seg(id)}/stats`),
    create: (input) => request('/stores', { method: 'POST', body: input }),
    update: (id, input) => request(`/stores/${seg(id)}`, { method: 'PUT', body: input }),
  },
  apps: {
    list: async (query) => parsePage<AppViewPage>(await request<unknown>('/apps', { query: { ...query } }), APP_VIEW_VERSION, checkApp, 'App 列表'),
    get: async (appId) => parseSingle<AppViewSingle>(await request<unknown>(`/apps/${seg(appId)}`), APP_VIEW_VERSION, 'app', checkApp, 'App 详情'),
  },
  keys: {
    list: (appId) => request('/api-keys', { query: { appId } }),
    create: (appId) => request(`/apps/${seg(appId)}/api-keys`, { method: 'POST' }),
    rotate: (id) => request(`/api-keys/${seg(id)}/rotate`, { method: 'POST' }),
    revoke: (id) => request(`/api-keys/${seg(id)}/revoke`, { method: 'POST' }),
  },
  webhooks: {
    getConfig: (appId) => request(`/apps/${seg(appId)}/webhook`),
    updateConfig: (appId, input) =>
      request(`/apps/${seg(appId)}/webhook`, { method: 'PUT', body: { url: input.url, enabled: input.enabled, events: input.events } }),
    sendTest: (appId) => request(`/apps/${seg(appId)}/webhook/test`, { method: 'POST' }),
    deliveries: (query) => request('/webhook-deliveries', { query: { ...query } }),
    deliveriesFor: (resourceId) => request(`/webhook-deliveries/by-resource/${seg(resourceId)}`),
  },
  account: {
    merchant: async () =>
      parseSingle<MerchantProfileView>(
        await request<unknown>('/account/merchant'),
        MERCHANT_PROFILE_VIEW_VERSION,
        'merchant',
        (i) => checkItem(i, MERCHANT_RULES, '商户资料'),
        '商户资料',
      ),
    me: () => request('/account/me'),
    updateMe: (input) => request('/account/me', { method: 'PATCH', body: { name: input.name } }),
    changePassword: async (input) => {
      await request<void>('/account/password', { method: 'POST', body: { current: input.current, next: input.next } })
    },
    sessions: () => request('/account/sessions'),
    revokeSession: async (id) => {
      await request<void>(`/account/sessions/${seg(id)}`, { method: 'DELETE' })
    },
    notifications: () => request('/account/notifications'),
    markAllRead: async () => {
      await request<void>('/account/notifications/read-all', { method: 'POST' })
    },
  },
  search: (keyword) => request('/search', { query: { keyword } }),
}
