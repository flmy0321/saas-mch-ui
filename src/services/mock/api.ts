import type {
  AnalyticsBucket,
  ApiKey,
  ChannelShare,
  CompareValue,
  CreatedApiKey,
  Granularity,
  Paginated,
  Payment,
  PaymentQuery,
  Refund,
  RefundQuery,
  RefundableInfo,
  StatMetrics,
  Store,
  TrendPoint,
} from '@/types'
import { ApiError, type ApiErrorInit, type MerchantApi } from '@/services/api/types'
import { fenToAmount, isAmountInput, toFen } from '@/utils/money'
import { delay, getMockRefundFault } from './control'
import { assertAuthenticated, mockAuth } from './auth'
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
  type PaymentRow,
  type RefundRow,
} from './db'

const dayStartMs = (s: string) => new Date(`${s}T00:00:00`).getTime()
const dayEndMs = (s: string) => new Date(`${s}T23:59:59.999`).getTime()
const ms = (s: string | null) => (s ? new Date(s).getTime() : 0)
const asOf = () => new Date().toISOString()
const ymd = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const amt = (v: bigint | null) => (v === null ? null : fenToAmount(v))

function fail(message: string, code: string, httpStatus: number, extra: Omit<ApiErrorInit, 'httpStatus'> = {}): never {
  throw new ApiError(message, code, { httpStatus, requestId: `req_${randomHex(12)}`, ...extra })
}

/* ------------------------------------------------------------------ */
/* DTO 边界：内部 BigInt 分 → AmountDecimal 字符串                        */
/* ------------------------------------------------------------------ */

function paymentDto(p: PaymentRow): Payment {
  const { scope: _scope, pinnedEligibility: _pinned, ...rest } = p
  return {
    ...rest,
    amount: fenToAmount(p.amount),
    paidAmount: amt(p.paidAmount),
    refundedAmount: fenToAmount(p.refundedAmount),
    refundingAmount: fenToAmount(p.refundingAmount),
    refundPrincipalLimit: amt(p.refundPrincipalLimit),
    availableRefundAmount: amt(p.availableRefundAmount),
  }
}

function refundDto(r: RefundRow): Refund {
  const { scope: _scope, ...rest } = r
  return { ...rest, amount: fenToAmount(r.amount) }
}

/* ------------------------------------------------------------------ */
/* 查询                                                                 */
/* ------------------------------------------------------------------ */

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
    const av = (a as Record<string, unknown>)[key] as string | number | bigint | null | undefined
    const bv = (b as Record<string, unknown>)[key] as string | number | bigint | null | undefined
    if (av === bv) return 0
    if (av === null || av === undefined) return 1
    if (bv === null || bv === undefined) return -1
    return (av > bv ? 1 : -1) * dir
  })
}

function filterPayments(q: PaymentQuery): PaymentRow[] {
  return payments.filter((p) => {
    if (q.paymentId && !p.id.includes(q.paymentId.trim())) return false
    if (q.merchantOrderNo && !(p.merchantOrderNo ?? '').includes(q.merchantOrderNo.trim())) return false
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

function filterRefunds(q: RefundQuery): RefundRow[] {
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

/* ------------------------------------------------------------------ */
/* 统计（协议 5.1）：P 按 paidAt、R 按 finishedAt、C 按 createdAt           */
/* ------------------------------------------------------------------ */

const TERMINAL_PAYMENT = new Set(['SUCCESS', 'FAILED', 'CLOSED'])

interface Agg {
  successAmount: bigint
  successCount: number
  refundAmount: bigint
  refundCount: number
  totalCount: number
  terminalCount: number
  createdSuccessCount: number
}
const emptyAgg = (): Agg => ({
  successAmount: 0n,
  successCount: 0,
  refundAmount: 0n,
  refundCount: 0,
  totalCount: 0,
  terminalCount: 0,
  createdSuccessCount: 0,
})

type StatFilter = { storeId?: string; channel?: string }

function aggregate(from: number, to: number, f: StatFilter = {}): Agg {
  const a = emptyAgg()
  for (const p of payments) {
    if (f.storeId && p.storeId !== f.storeId) continue
    if (f.channel && p.channel !== f.channel) continue
    if (p.status === 'SUCCESS' && p.paidAt) {
      const t = ms(p.paidAt)
      if (t >= from && t <= to) {
        a.successCount++
        a.successAmount += p.paidAmount ?? p.amount
      }
    }
    const c = ms(p.createdAt)
    if (c >= from && c <= to) {
      a.totalCount++
      if (TERMINAL_PAYMENT.has(p.status)) a.terminalCount++
      if (p.status === 'SUCCESS') a.createdSuccessCount++
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

const rate = (a: Agg) => (a.terminalCount ? a.createdSuccessCount / a.terminalCount : 0)

function metrics(a: Agg): StatMetrics {
  return {
    successAmount: fenToAmount(a.successAmount),
    successCount: a.successCount,
    refundAmount: fenToAmount(a.refundAmount),
    refundCount: a.refundCount,
    totalCount: a.totalCount,
    terminalCount: a.terminalCount,
    createdSuccessCount: a.createdSuccessCount,
    successRate: rate(a),
  }
}

/** 分母为 0 返回 null（展示“—”） */
function ratio(cur: bigint | number, prev: bigint | number): CompareValue {
  const c = Number(cur)
  const p = Number(prev)
  return p === 0 ? null : (c - p) / p
}

const avg = (a: Agg) => (a.successCount ? fenToAmount(a.successAmount / BigInt(a.successCount)) : '0.00')

function dailyTrend(days: number, f: StatFilter = {}): TrendPoint[] {
  const today = startOfDay(NOW)
  const out: TrendPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const s = today - i * DAY
    out.push({ date: ymd(s), ...metrics(aggregate(s, s + DAY - 1, f)) })
  }
  return out
}

function bucketStarts(from: number, to: number, g: Granularity): number[] {
  const starts: number[] = []
  const d = new Date(startOfDay(from))
  if (g === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  if (g === 'month') d.setDate(1)
  while (d.getTime() <= to) {
    starts.push(d.getTime())
    if (g === 'day') d.setDate(d.getDate() + 1)
    else if (g === 'week') d.setDate(d.getDate() + 7)
    else d.setMonth(d.getMonth() + 1)
  }
  return starts
}

function channelShare(from: number, to: number, f: StatFilter = {}): ChannelShare[] {
  const map = new Map<string, { amount: bigint; count: number }>()
  for (const ch of ['WECHAT', 'ALIPAY', 'UNIONPAY']) map.set(ch, { amount: 0n, count: 0 })
  for (const p of payments) {
    if (p.status !== 'SUCCESS' || !p.paidAt) continue
    const t = ms(p.paidAt)
    if (t < from || t > to) continue
    if (f.storeId && p.storeId !== f.storeId) continue
    if (f.channel && p.channel !== f.channel) continue
    const s = map.get(p.channel) ?? { amount: 0n, count: 0 }
    s.amount += p.paidAmount ?? p.amount
    s.count++
    map.set(p.channel, s)
  }
  return [...map.entries()].map(([channel, s]) => ({ channel, amount: fenToAmount(s.amount), count: s.count }))
}

/* ------------------------------------------------------------------ */
/* 退款                                                                 */
/* ------------------------------------------------------------------ */

function findPayment(id: string) {
  const p = paymentIndex.get(id)
  if (!p) fail('支付订单不存在', 'NOT_FOUND', 404)
  return p
}

function findStore(id: string) {
  const s = stores.find((x) => x.id === id)
  if (!s) fail('门店不存在', 'NOT_FOUND', 404)
  return s
}

const INELIGIBLE_REASON: Record<string, string> = {
  NOT_COLLECTED: '订单尚未完成入账，暂不可退款',
  REVIEW_REQUIRED: '订单入账待复核，复核完成前不可退款',
  RULE_UNVERIFIED: '退款规则尚未核验，暂不可退款',
  BLOCKED: '订单退款已被限制',
  EXHAUSTED: '可退款金额已用尽',
}

function refundableInfo(p: PaymentRow): RefundableInfo {
  const e = p.refundEligibility
  return {
    paymentId: p.id,
    paymentAmount: fenToAmount(p.amount),
    refundedAmount: fenToAmount(p.refundedAmount),
    refundingAmount: fenToAmount(p.refundingAmount),
    refundPrincipalLimit: amt(p.refundPrincipalLimit),
    refundableAmount: amt(p.availableRefundAmount),
    refundEligibility: e,
    ineligibleReason: e && e !== 'ALLOWED' ? (INELIGIBLE_REASON[e] ?? '当前订单不可退款') : null,
    asOf: asOf(),
  }
}

function advanceRefund(r: RefundRow, status: RefundRow['status'], note: string) {
  const at = new Date().toISOString()
  r.status = status
  r.updatedAt = at
  r.progress.push({ status, at, note })
  if (status === 'SUCCESS' || status === 'FAILED' || status === 'CLOSED') r.finishedAt = at
  const p = paymentIndex.get(r.paymentId)
  if (p) recomputePayment(p)
  if (status === 'SUCCESS') {
    webhookDeliveries.unshift(buildDelivery('refund', r.id, 'REFUND.SUCCEEDED', Date.now(), 'SUCCESS'))
  }
}

/** 幂等作用域内（应用 scope + merchantRefundNo）精确查找 */
const findInScope = (scope: string, merchantRefundNo: string) =>
  refunds.find((r) => r.scope === scope && r.merchantRefundNo === merchantRefundNo)

function acceptRefund(p: PaymentRow, fen: bigint, merchantRefundNo: string, reason: string): RefundRow {
  const r = buildRefund(p, fen, Date.now(), 'CREATED', reason || '商户发起退款')
  r.merchantRefundNo = merchantRefundNo
  refunds.unshift(r)
  recomputePayment(p)
  setTimeout(() => advanceRefund(r, 'PROCESSING', '已提交至支付渠道处理'), 4000)
  setTimeout(() => advanceRefund(r, 'SUCCESS', '退款已原路退回至用户支付账户'), 12000)
  return r
}

async function createRefund(input: { paymentId: string; amount: string; merchantRefundNo: string; reason: string }): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 600))
  const no = input.merchantRefundNo.trim()
  if (!no || no.length > 64) fail('商户退款编号不合法', 'VALIDATION', 400, { outcome: 'REJECTED' })
  if (!isAmountInput(input.amount)) fail('退款金额格式不合法', 'VALIDATION', 400, { outcome: 'REJECTED' })
  const fen = toFen(input.amount)!
  if (fen <= 0n) fail('退款金额必须大于 0', 'VALIDATION', 400, { outcome: 'REJECTED' })
  const p = findPayment(input.paymentId)

  const fault = getMockRefundFault()
  if (fault === 'unavailable') fail('上游渠道暂不可用，本次请求未受理', 'UPSTREAM_UNAVAILABLE', 503, { outcome: 'NOT_ACCEPTED' })

  const existing = findInScope(p.scope, no)
  let row: RefundRow
  if (existing) {
    if (existing.paymentId !== p.id || existing.amount !== fen) {
      fail('商户退款编号已用于其他退款请求', 'IDEMPOTENCY_CONFLICT', 409, { outcome: 'REJECTED' })
    }
    row = existing
  } else {
    if (p.status !== 'SUCCESS') fail('仅支付成功的订单可发起退款', 'INVALID_STATUS', 409, { outcome: 'REJECTED' })
    if (p.refundEligibility !== 'ALLOWED') {
      fail(INELIGIBLE_REASON[p.refundEligibility ?? ''] ?? '当前订单不可退款', 'REFUND_NOT_ELIGIBLE', 409, { outcome: 'REJECTED' })
    }
    if (p.availableRefundAmount === null || fen > p.availableRefundAmount) {
      fail('退款金额超过当前可退款金额', 'EXCEED_REFUNDABLE', 409, { outcome: 'REJECTED' })
    }
    row = acceptRefund(p, fen, no, input.reason.trim())
  }

  if (fault === 'lost-after-accept') throw new ApiError('网络连接中断', 'NETWORK_ERROR')
  if (fault === 'upstream-unknown') fail('上游渠道响应超时，结果未知', 'UPSTREAM_UNKNOWN', 504, { outcome: 'UNKNOWN' })
  if (fault === 'malformed') return { id: row.id, status: row.status }
  const dto = structuredClone(refundDto(row))
  if (fault === 'mismatch') return { ...dto, amount: fenToAmount(row.amount + 1n) }
  return dto
}

/* ------------------------------------------------------------------ */
/* 其他                                                                 */
/* ------------------------------------------------------------------ */

function newSecret(env: 'production' | 'sandbox') {
  return `sk_${env === 'production' ? 'live' : 'test'}_${randomHex(40)}`
}

function issueKey(appId: string): CreatedApiKey {
  const app = apps.find((a) => a.appId === appId)
  if (!app) fail('应用不存在', 'NOT_FOUND', 404)
  if (app.status !== 'ACTIVE') fail('应用已停用，无法创建密钥', 'INVALID_STATUS', 409)
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
  if (!input.name.trim()) fail('门店名称不能为空', 'VALIDATION', 400)
  if (stores.some((s) => s.merchantStoreNo === input.merchantStoreNo.trim() && s.id !== exceptId)) {
    fail('商户门店编号已存在', 'VALIDATION', 400)
  }
}

const protectedApi: Omit<MerchantApi, 'auth'> = {
  dashboard: {
    summary: () =>
      delay(() => {
        const today = startOfDay(NOW)
        const now = Date.now()
        const cur = aggregate(today, now)
        const prev = aggregate(today - DAY, now - DAY)
        const prevRate = prev.terminalCount ? rate(prev) : null
        return {
          asOf: asOf(),
          todaySuccessAmount: fenToAmount(cur.successAmount),
          todaySuccessCount: cur.successCount,
          todayRefundAmount: fenToAmount(cur.refundAmount),
          todayRefundCount: cur.refundCount,
          todayTotalCount: cur.totalCount,
          todayTerminalCount: cur.terminalCount,
          todayCreatedSuccessCount: cur.createdSuccessCount,
          todaySuccessRate: rate(cur),
          processingCount: payments.filter((p) => p.status === 'PAYING' || p.status === 'CREATED' || p.status === 'CLOSING').length,
          compare: {
            successAmount: ratio(cur.successAmount, prev.successAmount),
            successCount: ratio(cur.successCount, prev.successCount),
            refundAmount: ratio(cur.refundAmount, prev.refundAmount),
            refundCount: ratio(cur.refundCount, prev.refundCount),
            successRate: prevRate === null || !cur.terminalCount ? null : rate(cur) - prevRate,
          },
        }
      }),
    trend: (days) => delay(() => ({ asOf: asOf(), points: dailyTrend(Math.min(days, 60)) })),
    channelShare: (days) =>
      delay(() => ({ asOf: asOf(), items: channelShare(startOfDay(NOW) - (days - 1) * DAY, Date.now()) })),
    recentPayments: (limit) => delay(() => payments.slice(0, limit).map(paymentDto)),
  },

  payments: {
    list: (q) =>
      delay(() => {
        const page = paginate(sortRows(filterPayments(q), q.sortBy, q.sortOrder), q.page, q.pageSize)
        return { ...page, items: page.items.map(paymentDto) }
      }),
    get: (id) => delay(() => paymentDto(findPayment(id))),
    refundable: (id) => delay(() => refundableInfo(findPayment(id))),
    exportCsv: (q) =>
      delay(() => {
        const rows = filterPayments(q).slice(0, 5000)
        const header = '平台支付订单号,商户订单号,门店,订单金额(元),支付渠道,支付方式,支付状态,创建时间,支付时间'
        const lines = rows.map((p) =>
          [p.id, p.merchantOrderNo ?? '', p.storeName ?? '', fenToAmount(p.amount), p.channel, p.method, p.status, p.createdAt, p.paidAt ?? ''].join(','),
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
    list: (q) =>
      delay(() => {
        const page = paginate(sortRows(filterRefunds(q), q.sortBy, q.sortOrder), q.page, q.pageSize)
        return { ...page, items: page.items.map(refundDto) }
      }),
    get: (id) =>
      delay(() => {
        const r = refunds.find((x) => x.id === id)
        if (!r) fail('退款记录不存在', 'NOT_FOUND', 404)
        return refundDto(r)
      }),
    create: (input) => createRefund(input),
    findByMerchantRefundNo: (paymentId, merchantRefundNo) =>
      delay(() => {
        const p = findPayment(paymentId)
        const r = findInScope(p.scope, merchantRefundNo.trim())
        if (!r) fail('未找到该商户退款编号对应的退款', 'NOT_FOUND', 404, { authoritative: true })
        return refundDto(r)
      }),
  },

  analytics: {
    query: (q) =>
      delay(() => {
        const from = dayStartMs(q.from)
        const to = Math.min(dayEndMs(q.to), Date.now())
        const f = { storeId: q.storeId, channel: q.channel }
        const starts = bucketStarts(from, to, q.granularity)
        const buckets: AnalyticsBucket[] = starts.map((s, i) => {
          const e = (starts[i + 1] ?? to + 1) - 1
          const bs = Math.max(s, from)
          const be = Math.min(e, to)
          const a = aggregate(bs, be, f)
          const d = new Date(s)
          const key = q.granularity === 'month' ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}` : ymd(s)
          const label =
            q.granularity === 'month'
              ? key
              : q.granularity === 'week'
                ? `${ymd(bs).slice(5)} 周`
                : ymd(s).slice(5)
          return { key, start: ymd(bs), end: ymd(be), label, ...metrics(a), avgAmount: avg(a) }
        })
        const t = aggregate(from, to, f)
        const byStore = stores
          .map((s) => {
            const a = aggregate(from, to, { storeId: s.id, channel: q.channel })
            return { storeId: s.id, storeName: s.name, fen: a.successAmount, count: a.successCount }
          })
          .filter((s) => !q.storeId || s.storeId === q.storeId)
          .sort((a, b) => (b.fen > a.fen ? 1 : b.fen < a.fen ? -1 : 0))
          .map(({ fen, ...rest }) => ({ ...rest, amount: fenToAmount(fen) }))
        return {
          asOf: asOf(),
          totals: { ...metrics(t), avgAmount: avg(t) },
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
        const a = aggregate(from, Date.now(), { storeId: id })
        return {
          asOf: asOf(),
          last30Amount: fenToAmount(a.successAmount),
          last30Count: a.successCount,
          last30RefundAmount: fenToAmount(a.refundAmount),
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
        if (!a) fail('应用不存在', 'NOT_FOUND', 404)
        return a
      }),
  },

  keys: {
    list: (appId) => delay(() => (appId ? apiKeys.filter((k) => k.appId === appId) : apiKeys)),
    create: (appId) => delay(() => issueKey(appId), 600),
    rotate: (id) =>
      delay(() => {
        const old = apiKeys.find((k) => k.id === id)
        if (!old) fail('密钥不存在', 'NOT_FOUND', 404)
        if (old.status === 'REVOKED' || old.status === 'EXPIRED') fail('该密钥已失效，无法轮换', 'INVALID_STATUS', 409)
        const created = issueKey(old.appId)
        old.status = 'EXPIRING'
        old.expireAt = new Date(Date.now() + 1 * DAY).toISOString()
        return created
      }, 700),
    revoke: (id) =>
      delay(() => {
        const k = apiKeys.find((x) => x.id === id)
        if (!k) fail('密钥不存在', 'NOT_FOUND', 404)
        k.status = 'REVOKED'
        k.expireAt = new Date().toISOString()
        return k
      }, 500),
  },

  webhooks: {
    getConfig: (appId) =>
      delay(() => {
        const c = webhookConfigs.find((x) => x.appId === appId)
        if (!c) fail('Webhook 配置不存在', 'NOT_FOUND', 404)
        return c
      }),
    updateConfig: (appId, input) =>
      delay(() => {
        const c = webhookConfigs.find((x) => x.appId === appId)
        if (!c) fail('Webhook 配置不存在', 'NOT_FOUND', 404)
        if (input.enabled && !/^https:\/\/[^\s]+$/.test(input.url)) fail('通知地址必须为 HTTPS 地址', 'VALIDATION', 400)
        Object.assign(c, input, { updatedAt: new Date().toISOString() })
        return c
      }, 500),
    sendTest: (appId) =>
      delay(() => {
        const c = webhookConfigs.find((x) => x.appId === appId)
        if (!c || !c.url) fail('请先配置通知地址', 'VALIDATION', 400)
        if (!c.enabled) fail('Webhook 未启用，请启用后再测试', 'VALIDATION', 400)
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
        if (!input.name.trim()) fail('姓名不能为空', 'VALIDATION', 400)
        currentUser.name = input.name.trim()
        return currentUser
      }, 500),
    changePassword: ({ current, next }) =>
      delay(() => {
        if (current !== 'Demo@123456') fail('当前密码不正确（演示密码：Demo@123456）', 'VALIDATION', 400)
        if (next.length < 8) fail('新密码至少 8 位', 'VALIDATION', 400)
      }, 700),
    sessions: () => delay(() => sessions),
    revokeSession: (id) =>
      delay(() => {
        const i = sessions.findIndex((s) => s.id === id && !s.current)
        if (i < 0) fail('会话不存在或不可下线', 'NOT_FOUND', 404)
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
      return [
        ...payments
          .filter((p) => p.id.includes(kw) || (p.merchantOrderNo ?? '').includes(kw))
          .slice(0, 5)
          .map((p) => ({
            type: 'payment' as const,
            id: p.id,
            title: p.id,
            subtitle: [p.merchantOrderNo ?? '无商户订单号', p.storeName ?? '无门店'].join(' · '),
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
    }, 180),
}

/** 为所有业务接口加上登录校验，模拟服务端对 Authorization 头的检查 */
function requireAuth<T extends object>(target: T): T {
  return Object.fromEntries(
    Object.entries(target).map(([key, value]) => [
      key,
      typeof value === 'function'
        ? async (...args: unknown[]) => {
            assertAuthenticated()
            return value(...args)
          }
        : requireAuth(value as object),
    ]),
  ) as T
}

export const mockApi: MerchantApi = { auth: mockAuth, ...requireAuth(protectedApi) }

export const MOCK_NOW = NOW
export const MOCK_MIN = MIN
export { COUNTED_REFUND }
