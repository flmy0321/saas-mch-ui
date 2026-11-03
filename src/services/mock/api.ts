import type {
  AnalyticsBucket,
  ApiKey,
  ChannelShare,
  CreatedApiKey,
  Granularity,
  Paginated,
  Payment,
  PaymentQuery,
  Refund,
  RefundQuery,
  Store,
  TrendPoint,
} from '@/types'
import { ApiError, type MerchantApi } from '@/services/api/types'
import { delay } from './control'
import {
  COUNTED_REFUND,
  DAY,
  MIN,
  NOW,
  apiKeys,
  apps,
  buildDelivery,
  buildRefund,
  currentUser,
  merchant,
  notifications,
  pad,
  paymentIndex,
  payments,
  randomHex,
  recomputePayment,
  refunds,
  sessions,
  startOfDay,
  stores,
  webhookConfigs,
  webhookDeliveries,
} from './db'

const dayStartMs = (s: string) => new Date(`${s}T00:00:00`).getTime()
const dayEndMs = (s: string) => new Date(`${s}T23:59:59.999`).getTime()
const ms = (s: string | null) => (s ? new Date(s).getTime() : 0)

function paginate<T>(rows: T[], page = 1, pageSize = 20): Paginated<T> {
  const safeSize = Math.min(Math.max(pageSize, 1), 100)
  const total = rows.length
  const maxPage = Math.max(1, Math.ceil(total / safeSize))
  const p = Math.min(Math.max(page, 1), maxPage)
  return { items: rows.slice((p - 1) * safeSize, p * safeSize), total, page: p, pageSize: safeSize }
}

function sortRows<T>(rows: T[], key: string | undefined, order: 'asc' | 'desc' | undefined) {
  if (!key) return rows
  const dir = order === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const av = (a as Record<string, unknown>)[key]
    const bv = (b as Record<string, unknown>)[key]
    if (av === bv) return 0
    if (av === null || av === undefined) return 1
    if (bv === null || bv === undefined) return -1
    return (av > bv ? 1 : -1) * dir
  })
}

function filterPayments(q: PaymentQuery): Payment[] {
  return payments.filter((p) => {
    if (q.paymentId && !p.id.includes(q.paymentId.trim())) return false
    if (q.merchantOrderNo && !p.merchantOrderNo.includes(q.merchantOrderNo.trim())) return false
    if (q.storeId && p.storeId !== q.storeId) return false
    if (q.channel && p.channel !== q.channel) return false
    if (q.method && p.method !== q.method) return false
    if (q.status && p.status !== q.status) return false
    const c = ms(p.createdAt)
    if (q.createdFrom && c < dayStartMs(q.createdFrom)) return false
    if (q.createdTo && c > dayEndMs(q.createdTo)) return false
    if (q.paidFrom || q.paidTo) {
      if (!p.paidAt) return false
      const pt = ms(p.paidAt)
      if (q.paidFrom && pt < dayStartMs(q.paidFrom)) return false
      if (q.paidTo && pt > dayEndMs(q.paidTo)) return false
    }
    return true
  })
}

function filterRefunds(q: RefundQuery): Refund[] {
  return refunds.filter((r) => {
    if (q.refundId && !r.id.includes(q.refundId.trim())) return false
    if (q.merchantRefundNo && !r.merchantRefundNo.includes(q.merchantRefundNo.trim())) return false
    if (q.paymentId && !r.paymentId.includes(q.paymentId.trim())) return false
    if (q.storeId && r.storeId !== q.storeId) return false
    if (q.status && r.status !== q.status) return false
    const c = ms(r.createdAt)
    if (q.createdFrom && c < dayStartMs(q.createdFrom)) return false
    if (q.createdTo && c > dayEndMs(q.createdTo)) return false
    return true
  })
}

const isFinal = (p: Payment) => p.status === 'SUCCESS' || p.status === 'FAILED' || p.status === 'CLOSED'

interface Agg {
  successAmount: number
  successCount: number
  refundAmount: number
  refundCount: number
  totalCount: number
  finalCount: number
}
const emptyAgg = (): Agg => ({ successAmount: 0, successCount: 0, refundAmount: 0, refundCount: 0, totalCount: 0, finalCount: 0 })

function aggregate(from: number, to: number, f: { storeId?: string; channel?: string } = {}): Agg {
  const a = emptyAgg()
  for (const p of payments) {
    const c = ms(p.createdAt)
    if (c < from || c > to) continue
    if (f.storeId && p.storeId !== f.storeId) continue
    if (f.channel && p.channel !== f.channel) continue
    a.totalCount++
    if (isFinal(p)) a.finalCount++
    if (p.status === 'SUCCESS') {
      a.successCount++
      a.successAmount += p.amount
    }
  }
  for (const r of refunds) {
    if (r.status !== 'SUCCESS' || !r.finishedAt) continue
    const t = ms(r.finishedAt)
    if (t < from || t > to) continue
    if (f.storeId && r.storeId !== f.storeId) continue
    if (f.channel && r.channel !== f.channel) continue
    a.refundCount++
    a.refundAmount += r.amount
  }
  return a
}

const rate = (a: Agg) => (a.finalCount ? a.successCount / a.finalCount : 0)
const ratio = (cur: number, prev: number) => (prev ? (cur - prev) / prev : cur ? 1 : 0)
const label = (t: number) => {
  const d = new Date(t)
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function dailyTrend(days: number, f: { storeId?: string } = {}): TrendPoint[] {
  const today = startOfDay(NOW)
  const out: TrendPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const s = today - i * DAY
    const a = aggregate(s, s + DAY - 1, f)
    out.push({
      date: label(s),
      successAmount: a.successAmount,
      successCount: a.successCount,
      refundAmount: a.refundAmount,
      refundCount: a.refundCount,
      totalCount: a.totalCount,
      successRate: rate(a),
    })
  }
  return out
}

function bucketStarts(from: number, to: number, g: Granularity): number[] {
  const starts: number[] = []
  const d = new Date(startOfDay(from))
  if (g === 'week') {
    const wd = (d.getDay() + 6) % 7
    d.setDate(d.getDate() - wd)
  }
  if (g === 'month') d.setDate(1)
  while (d.getTime() <= to) {
    starts.push(d.getTime())
    if (g === 'day') d.setDate(d.getDate() + 1)
    else if (g === 'week') d.setDate(d.getDate() + 7)
    else d.setMonth(d.getMonth() + 1)
  }
  return starts
}

function channelShare(from: number, to: number, f: { storeId?: string; channel?: string } = {}): ChannelShare[] {
  const map = new Map<string, ChannelShare>()
  for (const ch of ['WECHAT', 'ALIPAY', 'UNIONPAY'] as const) map.set(ch, { channel: ch, amount: 0, count: 0 })
  for (const p of payments) {
    if (p.status !== 'SUCCESS') continue
    const c = ms(p.createdAt)
    if (c < from || c > to) continue
    if (f.storeId && p.storeId !== f.storeId) continue
    if (f.channel && p.channel !== f.channel) continue
    const s = map.get(p.channel)!
    s.amount += p.amount
    s.count++
  }
  return [...map.values()]
}

function findPayment(id: string) {
  const p = paymentIndex.get(id)
  if (!p) throw new ApiError('支付订单不存在', 'NOT_FOUND')
  return p
}

function findStore(id: string) {
  const s = stores.find((x) => x.id === id)
  if (!s) throw new ApiError('门店不存在', 'NOT_FOUND')
  return s
}

function refundableOf(p: Payment) {
  const counted = refunds
    .filter((r) => r.paymentId === p.id && COUNTED_REFUND.includes(r.status))
    .reduce((s, r) => s + r.amount, 0)
  return Math.max(0, p.amount - counted)
}

function advanceRefund(r: Refund, status: Refund['status'], note: string) {
  const at = new Date().toISOString()
  r.status = status
  r.updatedAt = at
  r.progress.push({ status, at, note })
  if (status === 'SUCCESS' || status === 'FAILED' || status === 'CLOSED') r.finishedAt = at
  const p = paymentIndex.get(r.paymentId)
  if (p) recomputePayment(p)
  if (status === 'SUCCESS') {
    webhookDeliveries.unshift(buildDelivery('refund', r.id, 'refund.succeeded', Date.now(), 'SUCCESS'))
  }
}

function newSecret(env: 'production' | 'sandbox') {
  return `sk_${env === 'production' ? 'live' : 'test'}_${randomHex(40)}`
}

function issueKey(appId: string): CreatedApiKey {
  const app = apps.find((a) => a.appId === appId)
  if (!app) throw new ApiError('应用不存在', 'NOT_FOUND')
  if (app.status !== 'ACTIVE') throw new ApiError('应用已停用，无法创建密钥', 'APP_DISABLED')
  const plain = newSecret(app.env)
  const now = new Date().toISOString()
  const key: ApiKey = {
    id: `k_${randomHex(8)}`,
    keyId: `kid_${randomHex(12)}`,
    appId,
    status: 'ACTIVE',
    maskedSecret: `${plain.slice(0, 8)}••••••••${plain.slice(-4)}`,
    createdAt: now,
    effectiveAt: now,
    expireAt: null,
    lastUsedAt: null,
  }
  apiKeys.unshift(key)
  return { ...key, plainSecret: plain }
}

function validateStore(input: { name: string; merchantStoreNo: string }, exceptId?: string) {
  if (!input.name.trim()) throw new ApiError('门店名称不能为空', 'VALIDATION')
  if (stores.some((s) => s.merchantStoreNo === input.merchantStoreNo.trim() && s.id !== exceptId)) {
    throw new ApiError('商户门店编号已存在', 'DUPLICATE')
  }
}

export const mockApi: MerchantApi = {
  dashboard: {
    summary: () =>
      delay(() => {
        const today = startOfDay(NOW)
        const cur = aggregate(today, NOW)
        const prev = aggregate(today - DAY, NOW - DAY)
        return {
          todaySuccessAmount: cur.successAmount,
          todaySuccessCount: cur.successCount,
          todayRefundAmount: cur.refundAmount,
          todayRefundCount: cur.refundCount,
          todaySuccessRate: rate(cur),
          processingCount: payments.filter((p) => p.status === 'PAYING' || p.status === 'CREATED' || p.status === 'CLOSING').length,
          compare: {
            successAmount: ratio(cur.successAmount, prev.successAmount),
            successCount: ratio(cur.successCount, prev.successCount),
            refundAmount: ratio(cur.refundAmount, prev.refundAmount),
            refundCount: ratio(cur.refundCount, prev.refundCount),
            successRate: rate(cur) - rate(prev),
          },
        }
      }),
    trend: (days) => delay(() => dailyTrend(Math.min(days, 60))),
    channelShare: (days) => delay(() => channelShare(startOfDay(NOW) - (days - 1) * DAY, NOW)),
    recentPayments: (limit) => delay(() => payments.slice(0, limit)),
  },

  payments: {
    list: (q) =>
      delay(() => paginate(sortRows(filterPayments(q), q.sortBy, q.sortOrder), q.page, q.pageSize)),
    get: (id) => delay(() => findPayment(id)),
    refundable: (id) =>
      delay(() => {
        const p = findPayment(id)
        return {
          paymentId: p.id,
          paymentAmount: p.amount,
          refundedAmount: p.refundedAmount,
          refundingAmount: p.refundingAmount,
          refundableAmount: p.status === 'SUCCESS' ? refundableOf(p) : 0,
        }
      }),
    exportCsv: (q) =>
      delay(() => {
        const rows = filterPayments(q).slice(0, 5000)
        const header = '平台支付订单号,商户订单号,门店,订单金额(元),支付渠道,支付方式,支付状态,创建时间,支付时间'
        const lines = rows.map((p) =>
          [p.id, p.merchantOrderNo, p.storeName, (p.amount / 100).toFixed(2), p.channel, p.method, p.status, p.createdAt, p.paidAt ?? ''].join(','),
        )
        const d = new Date()
        return {
          filename: `payments_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.csv`,
          rows: rows.length,
          content: '\uFEFF' + [header, ...lines].join('\n'),
        }
      }, 700),
  },

  refunds: {
    list: (q) => delay(() => paginate(sortRows(filterRefunds(q), q.sortBy, q.sortOrder), q.page, q.pageSize)),
    get: (id) =>
      delay(() => {
        const r = refunds.find((x) => x.id === id)
        if (!r) throw new ApiError('退款记录不存在', 'NOT_FOUND')
        return r
      }),
    create: (input) =>
      delay(() => {
        const p = findPayment(input.paymentId)
        if (p.status !== 'SUCCESS') throw new ApiError('仅支付成功的订单可发起退款', 'INVALID_STATUS')
        if (!Number.isInteger(input.amount) || input.amount <= 0) throw new ApiError('退款金额不合法', 'VALIDATION')
        const available = refundableOf(p)
        if (input.amount > available) throw new ApiError('退款金额超过当前可退款金额', 'EXCEED_REFUNDABLE')
        if (refunds.some((r) => r.merchantRefundNo === input.merchantRefundNo.trim())) {
          throw new ApiError('商户退款编号已存在，请勿重复提交', 'DUPLICATE')
        }
        const r = buildRefund(p, input.amount, Date.now(), 'CREATED', input.reason.trim() || '商户发起退款')
        r.merchantRefundNo = input.merchantRefundNo.trim()
        refunds.unshift(r)
        recomputePayment(p)
        setTimeout(() => advanceRefund(r, 'PROCESSING', '已提交至支付渠道处理'), 4000)
        setTimeout(() => advanceRefund(r, 'SUCCESS', '退款已原路退回至用户支付账户'), 12000)
        return r
      }, 600),
  },

  analytics: {
    query: (q) =>
      delay(() => {
        const from = dayStartMs(q.from)
        const to = Math.min(dayEndMs(q.to), NOW)
        const f = { storeId: q.storeId, channel: q.channel }
        const starts = bucketStarts(from, to, q.granularity)
        const buckets: AnalyticsBucket[] = starts.map((s, i) => {
          const e = (starts[i + 1] ?? to + 1) - 1
          const a = aggregate(Math.max(s, from), Math.min(e, to), f)
          const d = new Date(s)
          const lbl =
            q.granularity === 'month'
              ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
              : q.granularity === 'week'
                ? `${label(Math.max(s, from))} 周`
                : label(s)
          return {
            label: lbl,
            successAmount: a.successAmount,
            successCount: a.successCount,
            refundAmount: a.refundAmount,
            refundCount: a.refundCount,
            totalCount: a.totalCount,
            successRate: rate(a),
            avgAmount: a.successCount ? Math.round(a.successAmount / a.successCount) : 0,
          }
        })
        const t = aggregate(from, to, f)
        const byStore = stores
          .map((s) => {
            const a = aggregate(from, to, { storeId: s.id, channel: q.channel })
            return { storeId: s.id, storeName: s.name, amount: a.successAmount, count: a.successCount }
          })
          .filter((s) => !q.storeId || s.storeId === q.storeId)
          .sort((a, b) => b.amount - a.amount)
        return {
          totals: {
            successAmount: t.successAmount,
            successCount: t.successCount,
            refundAmount: t.refundAmount,
            refundCount: t.refundCount,
            totalCount: t.totalCount,
            successRate: rate(t),
            avgAmount: t.successCount ? Math.round(t.successAmount / t.successCount) : 0,
          },
          buckets,
          byChannel: channelShare(from, to, f),
          byStore,
        }
      }, 450),
  },

  stores: {
    list: (q) =>
      delay(() => {
        const kw = q.keyword?.trim()
        const rows = stores.filter((s) => {
          if (q.status && s.status !== q.status) return false
          if (kw && !s.name.includes(kw) && !s.storeNo.includes(kw) && !s.merchantStoreNo.includes(kw)) return false
          return true
        })
        return paginate(sortRows(rows, q.sortBy ?? 'createdAt', q.sortOrder ?? 'desc'), q.page, q.pageSize)
      }),
    all: () => delay(() => stores, 120),
    get: (id) => delay(() => findStore(id)),
    stats: (id) =>
      delay(() => {
        findStore(id)
        const from = startOfDay(NOW) - 29 * DAY
        const a = aggregate(from, NOW, { storeId: id })
        return {
          last30Amount: a.successAmount,
          last30Count: a.successCount,
          last30RefundAmount: a.refundAmount,
          successRate: rate(a),
          trend: dailyTrend(30, { storeId: id }),
        }
      }),
    create: (input) =>
      delay(() => {
        validateStore(input)
        const seq = stores.length + 1
        const s: Store = {
          id: `st_${seq}_${randomHex(4)}`,
          storeNo: `S${merchant.merchantNo.slice(1)}${pad(seq, 3)}`,
          merchantStoreNo: input.merchantStoreNo.trim(),
          name: input.name.trim(),
          status: input.status,
          address: input.address.trim(),
          contactName: input.contactName.trim(),
          contactPhone: input.contactPhone.trim(),
          createdAt: new Date().toISOString(),
        }
        stores.unshift(s)
        return s
      }, 500),
    update: (id, input) =>
      delay(() => {
        const s = findStore(id)
        validateStore(input, id)
        Object.assign(s, {
          name: input.name.trim(),
          merchantStoreNo: input.merchantStoreNo.trim(),
          address: input.address.trim(),
          contactName: input.contactName.trim(),
          contactPhone: input.contactPhone.trim(),
          status: input.status,
        })
        payments.forEach((p) => p.storeId === id && (p.storeName = s.name))
        return s
      }, 500),
  },

  apps: {
    list: () => delay(() => apps),
    get: (appId) =>
      delay(() => {
        const a = apps.find((x) => x.appId === appId)
        if (!a) throw new ApiError('应用不存在', 'NOT_FOUND')
        return a
      }),
  },

  keys: {
    list: (appId) => delay(() => (appId ? apiKeys.filter((k) => k.appId === appId) : apiKeys)),
    create: (appId) => delay(() => issueKey(appId), 600),
    rotate: (id) =>
      delay(() => {
        const old = apiKeys.find((k) => k.id === id)
        if (!old) throw new ApiError('密钥不存在', 'NOT_FOUND')
        if (old.status === 'REVOKED' || old.status === 'EXPIRED') throw new ApiError('该密钥已失效，无法轮换', 'INVALID_STATUS')
        const created = issueKey(old.appId)
        old.status = 'EXPIRING'
        old.expireAt = new Date(Date.now() + 1 * DAY).toISOString()
        return created
      }, 700),
    revoke: (id) =>
      delay(() => {
        const k = apiKeys.find((x) => x.id === id)
        if (!k) throw new ApiError('密钥不存在', 'NOT_FOUND')
        k.status = 'REVOKED'
        k.expireAt = new Date().toISOString()
        return k
      }, 500),
  },

  webhooks: {
    getConfig: (appId) =>
      delay(() => {
        const c = webhookConfigs.find((x) => x.appId === appId)
        if (!c) throw new ApiError('Webhook 配置不存在', 'NOT_FOUND')
        return c
      }),
    updateConfig: (appId, input) =>
      delay(() => {
        const c = webhookConfigs.find((x) => x.appId === appId)
        if (!c) throw new ApiError('Webhook 配置不存在', 'NOT_FOUND')
        if (input.enabled && !/^https:\/\/[^\s]+$/.test(input.url)) throw new ApiError('通知地址必须为 HTTPS 地址', 'VALIDATION')
        Object.assign(c, input, { updatedAt: new Date().toISOString() })
        return c
      }, 500),
    sendTest: (appId) =>
      delay(() => {
        const c = webhookConfigs.find((x) => x.appId === appId)
        if (!c || !c.url) throw new ApiError('请先配置通知地址', 'VALIDATION')
        if (!c.enabled) throw new ApiError('Webhook 未启用，请启用后再测试', 'VALIDATION')
        return { httpStatus: 200, durationMs: 120 + Math.round(Math.random() * 180) }
      }, 900),
    deliveries: (q) =>
      delay(() => {
        const kw = q.keyword?.trim()
        const rows = webhookDeliveries.filter((w) => {
          if (q.eventType && w.eventType !== q.eventType) return false
          if (q.status && w.status !== q.status) return false
          if (kw && !w.eventId.includes(kw) && !w.resourceId.includes(kw)) return false
          return true
        })
        return paginate(rows, q.page, q.pageSize)
      }),
    deliveriesFor: (resourceId) => delay(() => webhookDeliveries.filter((w) => w.resourceId === resourceId)),
  },

  account: {
    merchant: () => delay(() => merchant),
    me: () => delay(() => currentUser, 150),
    updateMe: (input) =>
      delay(() => {
        if (!input.name.trim()) throw new ApiError('姓名不能为空', 'VALIDATION')
        currentUser.name = input.name.trim()
        return currentUser
      }, 500),
    changePassword: ({ current, next }) =>
      delay(() => {
        if (current !== 'Demo@123456') throw new ApiError('当前密码不正确（演示密码：Demo@123456）', 'INVALID_PASSWORD')
        if (next.length < 8) throw new ApiError('新密码至少 8 位', 'VALIDATION')
      }, 700),
    sessions: () => delay(() => sessions),
    revokeSession: (id) =>
      delay(() => {
        const i = sessions.findIndex((s) => s.id === id && !s.current)
        if (i < 0) throw new ApiError('会话不存在或不可下线', 'NOT_FOUND')
        sessions.splice(i, 1)
      }, 400),
    notifications: () => delay(() => notifications, 200),
    markAllRead: () =>
      delay(() => {
        notifications.forEach((n) => (n.read = true))
      }, 200),
  },

  search: (keyword) =>
    delay(() => {
      const kw = keyword.trim()
      if (kw.length < 2) return []
      const out = [
        ...payments
          .filter((p) => p.id.includes(kw) || p.merchantOrderNo.includes(kw))
          .slice(0, 5)
          .map((p) => ({
            type: 'payment' as const,
            id: p.id,
            title: p.id,
            subtitle: `${p.merchantOrderNo} · ${p.storeName}`,
            to: `/payments/${p.id}`,
          })),
        ...refunds
          .filter((r) => r.id.includes(kw) || r.merchantRefundNo.includes(kw))
          .slice(0, 3)
          .map((r) => ({
            type: 'refund' as const,
            id: r.id,
            title: r.id,
            subtitle: `${r.merchantRefundNo} · 原订单 ${r.paymentId}`,
            to: `/refunds/${r.id}`,
          })),
        ...stores
          .filter((s) => s.name.includes(kw) || s.storeNo.includes(kw) || s.merchantStoreNo.includes(kw))
          .slice(0, 3)
          .map((s) => ({ type: 'store' as const, id: s.id, title: s.name, subtitle: s.storeNo, to: `/stores/${s.id}` })),
      ]
      return out
    }, 180),
}

export const MOCK_NOW = NOW
export const MOCK_MIN = MIN
