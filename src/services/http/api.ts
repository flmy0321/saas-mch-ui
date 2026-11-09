import type { MerchantApi } from '@/services/api/types'
import { ApiError } from '@/services/api/types'
import type { AuthTokens, Captcha, LoginResult, MerchantSelection } from '@/types'
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
    list: (query) => request('/payments', { query: { ...query } }),
    get: (id) => request(`/payments/${seg(id)}`),
    refundable: (id) => request(`/payments/${seg(id)}/refundable`),
    exportCsv: (query) => request('/payments/export', { query: { ...query } }),
  },
  refunds: {
    list: (query) => request('/refunds', { query: { ...query } }),
    get: (id) => request(`/refunds/${seg(id)}`),
    create: (input) =>
      request<unknown>('/refunds', {
        method: 'POST',
        body: { paymentId: input.paymentId, amount: input.amount, merchantRefundNo: input.merchantRefundNo, reason: input.reason },
        rawSuccess: true,
      }),
    findByMerchantRefundNo: (paymentId, merchantRefundNo) =>
      request(`/refunds/by-merchant-refund-no/${seg(merchantRefundNo)}`, { query: { paymentId } }),
  },
  analytics: {
    query: (q) => request('/analytics', { query: { ...q } }),
  },
  stores: {
    list: (query) => request('/stores', { query: { ...query } }),
    all: () => request('/stores/options'),
    get: (id) => request(`/stores/${seg(id)}`),
    stats: (id) => request(`/stores/${seg(id)}/stats`),
    create: (input) => request('/stores', { method: 'POST', body: input }),
    update: (id, input) => request(`/stores/${seg(id)}`, { method: 'PUT', body: input }),
  },
  apps: {
    list: () => request('/apps'),
    get: (appId) => request(`/apps/${seg(appId)}`),
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
    merchant: () => request('/account/merchant'),
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
