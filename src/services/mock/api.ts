import type {
  ApiKey,
  CompareValue,
  CreatedApiKey,
  Granularity,
  Paginated,
  PaymentListItem,
  PaymentListPage,
  PaymentQuery,
  Refund,
  RefundQuery,
  RefundableInfo,
  Store,
} from '@/types'
import {
  APP_VIEW_VERSION,
  DASHBOARD_SUMMARY_VIEW_VERSION,
  MERCHANT_PROFILE_VIEW_VERSION,
  PAYMENT_DETAIL_VIEW_VERSION,
  PAYMENT_LIST_VIEW_VERSION,
  RECENT_PAYMENTS_VIEW_VERSION,
  REFUND_VIEW_VERSION,
  STORE_OPTIONS_VIEW_VERSION,
  STORE_VIEW_VERSION,
  type AppView,
  type DashboardSummaryView,
  type ReportMetrics,
  type StoreOptionsView,
  type RefundView,
  type StoreView,
} from '@/types'
import { ApiError, type ApiErrorInit, type MerchantApi } from '@/services/api/types'
import {
  STORE_COMMAND_VIEW_VERSION,
  WEBHOOK_COMMAND_VIEW_VERSION,
  type CommandReply,
  type KeyCommandApplied,
  type StoreCommandInput,
  type StoreCommandStore,
} from '@/types/command'
import {
  GLOBAL_SEARCH_VIEW_VERSION,
  type GlobalSearchGroup,
  type GlobalSearchItem,
  type GlobalSearchView,
  type ReportPresentation,
  type SearchGroupState,
  type SearchGroupType,
} from '@/types'
import {
  COMPLETED_REPORT_VIEW_VERSION,
  DIRECTORY_MODE_OBSERVED_ONLY,
  REPORT_WINDOW_DAYS,
  type AnalyticsBucketView,
  type AnalyticsView,
  type ChannelAmountItem,
  type ChannelShareView,
  type CompletedReportBase,
  type ReportPoint,
  type StoreStatsView,
  type TrendView,
} from '@/types/report'
import { DEVELOPER_READ_VIEW_VERSION, type DeveloperPage, type WebhookDelivery } from '@/types'
import { fenToAmount, isAmountInput, toFen } from '@/utils/money'
import { PRESENTATION_COMPARE_KEYS, SUCCESS_RATE_DIFFERENCE_KEY } from '@/utils/report'
import { delay, getMockRefundFault } from './control'
import { assertAuthenticated, mockAuth, mockIdentitySessions } from './auth'
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
  startOfDay,
  stores,
  toShanghaiWall,
  webhookConfigs,
  webhookDeliveries,
  type ApiKeyRow,
  type WebhookDeliveryRow,
  type PaymentRow,
  type RefundRow,
} from './db'

const dayStartMs = (s: string) => new Date(`${s}T00:00:00+08:00`).getTime()
const dayEndMs = (s: string) => new Date(`${s}T23:59:59.999+08:00`).getTime()
const ms = (s: string | null) => (s ? new Date(s).getTime() : 0)
const asOf = () => new Date().toISOString()
const ymd = (t: number) => {
  const d = toShanghaiWall(t)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}
const amt = (v: bigint | null) => (v === null ? null : fenToAmount(v))

function fail(message: string, code: string, httpStatus: number, extra: Omit<ApiErrorInit, 'httpStatus'> = {}): never {
  throw new ApiError(message, code, { httpStatus, requestId: `req_${randomHex(12)}`, ...extra })
}

/* ------------------------------------------------------------------ */
/* DTO 边界：内部 BigInt 分 → AmountDecimal 字符串                        */
/* ------------------------------------------------------------------ */

/** Mock 数据不变量：列表必需字段缺失时直接报错，不以默认值伪装 */
function required<T>(v: T | null, field: string, id: string): T {
  if (v === null) fail(`Mock 数据缺少列表必需字段 ${field}（${id}）`, 'MOCK_INVARIANT', 500)
  return v
}

/** 列表精简视图：显式逐字段投影，详情专属字段（paidAmount 等）不进入列表 */
function paymentListItemDto(p: PaymentRow): PaymentListItem {
  return {
    id: p.id,
    source: p.source,
    merchantOrderNo: p.merchantOrderNo,
    storeId: p.storeId,
    storeName: p.storeName,
    subject: p.subject,
    amount: fenToAmount(p.amount),
    currency: 'CNY',
    channel: p.channel,
    method: p.method,
    createdAt: p.createdAt,
    paidAt: p.paidAt,
    expireAt: p.expireAt,
    refundedAmount: fenToAmount(p.refundedAmount),
    refundingAmount: fenToAmount(p.refundingAmount),
    refundPrincipalLimit: amt(p.refundPrincipalLimit),
    availableRefundAmount: amt(p.availableRefundAmount),
    refundEligibility: required(p.refundEligibility, 'refundEligibility', p.id),
    collectionVerification: required(p.collectionVerification, 'collectionVerification', p.id),
    status: p.status,
    coreStatus: p.coreStatus,
    refundAggregate: p.refundAggregate,
  }
}

function refundDto(r: RefundRow): Refund {
  const { scope: _scope, ...rest } = r
  return { ...rest, amount: fenToAmount(r.amount) }
}

const TERMINAL_REFUND = new Set(['SUCCESS', 'FAILED', 'CLOSED'])

/** 退款精简视图（协议 3.8.4）：finishedAt 只在 SUCCESS/FAILED/CLOSED 取对应终态时间，其他状态为 null */
function refundViewDto(r: RefundRow): RefundView {
  return {
    id: r.id,
    merchantRefundNo: r.merchantRefundNo,
    paymentId: r.paymentId,
    storeId: r.storeId,
    storeName: r.storeName,
    amount: fenToAmount(r.amount),
    status: r.status,
    reason: r.reason,
    createdAt: r.createdAt,
    finishedAt: TERMINAL_REFUND.has(r.status) ? r.finishedAt : null,
  }
}

function storeViewDto(s: Store): StoreView {
  return { id: s.id, storeNo: s.storeNo, merchantStoreNo: s.merchantStoreNo || null, name: s.name, status: s.status, createdAt: s.createdAt }
}

function viewPage<V extends string, T>(viewVersion: V, page: Paginated<T>) {
  return { viewVersion, items: page.items, total: page.total, page: page.page, pageSize: page.pageSize, asOf: asOf() }
}

/** 协议 1.4 / 3.8.3：page 非整数或越界报 VALIDATION；pageSize 非整数报 VALIDATION，整数截断到 1–100 */
function assertPageParams(page: unknown, pageSize: unknown) {
  if (page !== undefined && !(Number.isInteger(page) && (page as number) >= 1 && (page as number) <= 1_000_000)) {
    fail('page 参数不合法', 'VALIDATION', 400)
  }
  if (pageSize !== undefined && !Number.isInteger(pageSize)) fail('pageSize 参数不合法', 'VALIDATION', 400)
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
    if (q.paymentId && p.id !== q.paymentId.trim()) return false
    if (q.merchantOrderNo && p.merchantOrderNo !== q.merchantOrderNo.trim()) return false
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
    if (q.refundId && r.id !== q.refundId.trim()) return false
    if (q.merchantRefundNo && r.merchantRefundNo !== q.merchantRefundNo.trim()) return false
    if (q.paymentId && r.paymentId !== q.paymentId.trim()) return false
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

function reportMetrics(a: Agg): ReportMetrics {
  return {
    successAmount: fenToAmount(a.successAmount),
    successCount: String(a.successCount),
    refundAmount: fenToAmount(a.refundAmount),
    refundCount: String(a.refundCount),
    totalCount: String(a.totalCount),
    terminalCount: String(a.terminalCount),
    createdSuccessCount: String(a.createdSuccessCount),
  }
}

/** 营业日窗口 [当日 00:00, 次日 00:00)，按 +08:00 表达 */
function period(dayStart: number, a: Agg) {
  const iso = (t: number) => new Date(t + 8 * 3600_000).toISOString().replace('Z', '+08:00')
  return { date: ymd(dayStart), fromInclusive: iso(dayStart), toExclusive: iso(dayStart + DAY), metrics: reportMetrics(a) }
}

function storeOptionsView(): StoreOptionsView {
  const items = stores.map((s) => ({ id: s.id, storeNo: s.storeNo, merchantStoreNo: s.merchantStoreNo || null, name: s.name, status: s.status }))
  return { viewVersion: STORE_OPTIONS_VIEW_VERSION, items, total: items.length, complete: true, asOf: asOf() }
}

/** 分母为 0 返回 null（展示“—”） */
function ratio(cur: bigint | number, prev: bigint | number): CompareValue {
  const c = Number(cur)
  const p = Number(prev)
  return p === 0 ? null : (c - p) / p
}

const pctOf = (v: CompareValue) => (v === null ? null : (v * 100).toFixed(2))

function presentationOf(a: Agg, prev?: Agg): ReportPresentation {
  const p: ReportPresentation = {
    averageAmount: a.successCount ? fenToAmount(a.successAmount / BigInt(a.successCount)) : null,
    successRatePercent: a.terminalCount ? (rate(a) * 100).toFixed(2) : null,
  }
  if (prev) {
    p[PRESENTATION_COMPARE_KEYS.successAmount] = pctOf(ratio(a.successAmount, prev.successAmount))
    p[PRESENTATION_COMPARE_KEYS.successCount] = pctOf(ratio(a.successCount, prev.successCount))
    p[PRESENTATION_COMPARE_KEYS.refundAmount] = pctOf(ratio(a.refundAmount, prev.refundAmount))
    p[PRESENTATION_COMPARE_KEYS.refundCount] = pctOf(ratio(a.refundCount, prev.refundCount))
    p[SUCCESS_RATE_DIFFERENCE_KEY] =
      prev.terminalCount && a.terminalCount ? ((rate(a) - rate(prev)) * 100).toFixed(1) : null
  }
  return p
}

/** 已完成营业日：截至昨日 */
const lastCompletedDay = () => startOfDay(NOW) - DAY

function completedBase(fromDay: number, toDay: number): CompletedReportBase {
  return {
    viewVersion: COMPLETED_REPORT_VIEW_VERSION,
    asOf: asOf(),
    timezone: 'Asia/Shanghai',
    coverageStart: ymd(startOfDay(NOW) - 59 * DAY),
    fromDate: ymd(fromDay),
    toDate: ymd(toDay),
  }
}

function assertWindowDays(days: number) {
  if (!(REPORT_WINDOW_DAYS as readonly number[]).includes(days)) fail('统计窗口仅支持 7 或 30 天', 'INVALID_ARGUMENT', 400)
}

function completedPoints(days: number, f: StatFilter = {}): ReportPoint[] {
  const last = lastCompletedDay()
  const out: ReportPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const s = last - i * DAY
    const a = aggregate(s, s + DAY - 1, f)
    out.push({ date: ymd(s), metrics: reportMetrics(a), presentation: presentationOf(a) })
  }
  return out
}

function bucketStarts(from: number, to: number, g: Granularity): number[] {
  const starts: number[] = []
  // 在上海墙钟（UTC getter）上推进日/周/月，再换回真实时间戳
  const d = toShanghaiWall(startOfDay(from))
  if (g === 'week') d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  if (g === 'month') d.setUTCDate(1)
  const real = () => d.getTime() - 8 * 60 * 60 * 1000
  while (real() <= to) {
    starts.push(real())
    if (g === 'day') d.setUTCDate(d.getUTCDate() + 1)
    else if (g === 'week') d.setUTCDate(d.getUTCDate() + 7)
    else d.setUTCMonth(d.getUTCMonth() + 1)
  }
  return starts
}

function channelShare(from: number, to: number, f: StatFilter = {}): ChannelAmountItem[] {
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
  return [...map.entries()].map(([channel, s]) => ({ channel, amount: fenToAmount(s.amount), count: String(s.count) }))
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

function developerPage<T>(rows: T[], page = 1, pageSize = 20): DeveloperPage<T> {
  const size = Math.min(Math.max(pageSize, 1), 100)
  const p = Math.max(page, 1)
  return {
    viewVersion: DEVELOPER_READ_VIEW_VERSION,
    asOf: asOf(),
    items: rows.slice((p - 1) * size, p * size),
    total: String(rows.length),
    page: p,
    pageSize: size,
  }
}

function keyView(k: ApiKeyRow): ApiKey {
  const revoked = k.status === 'REVOKED' || k.status === 'EXPIRED'
  return {
    appId: k.appId,
    keyId: k.keyId,
    status: revoked ? 'REVOKED' : k.status === 'EXPIRING' ? 'GRACE' : 'ACTIVE',
    createdAt: k.createdAt,
    validFrom: k.effectiveAt,
    validUntil: k.expireAt,
    revokedAt: revoked ? (k.expireAt ?? k.createdAt) : null,
  }
}

const DELIVERY_STATUS_VIEW = { SUCCESS: 'COMPLETED', FAILED: 'EXHAUSTED', RETRYING: 'RETRY_WAIT' } as const

function deliveryView(d: WebhookDeliveryRow): WebhookDelivery {
  const last = d.attemptLog[d.attemptLog.length - 1]
  const status = DELIVERY_STATUS_VIEW[d.status]
  return {
    eventId: d.eventId,
    eventType: d.eventType,
    resource: { type: d.resourceType, id: d.resourceId },
    appId: d.appId,
    status,
    allocatedAttempts: String(d.attempts),
    createdAt: d.attemptLog[0]?.at ?? d.lastAttemptAt,
    nextAttemptAt: status === 'RETRY_WAIT' ? (d.nextRetryAt ?? d.lastAttemptAt) : null,
    acknowledgedAt: status === 'COMPLETED' ? d.lastAttemptAt : null,
    lastHttpStatus: last?.httpStatus ?? null,
    lastErrorCode: last && last.result === 'FAILED' ? (last.httpStatus ? 'HTTP_NON_2XX' : 'NO_RESPONSE') : null,
  }
}

function newSecret(env: 'production' | 'sandbox') {
  return `sk_${env === 'production' ? 'live' : 'test'}_${randomHex(40)}`
}

function issueKey(appId: string): CreatedApiKey {
  const app = apps.find((a) => a.appId === appId)
  if (!app) fail('应用不存在', 'NOT_FOUND', 404)
  if (app.status !== 'ACTIVE') fail('应用已停用，无法创建密钥', 'INVALID_STATUS', 409)
  const plain = newSecret(app.env === 'sandbox' ? 'sandbox' : 'production')
  const now = new Date().toISOString()
  const key: ApiKeyRow = {
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
  return { ...keyView(key), plainSecret: plain }
}

function validateStore(input: { name: string; merchantStoreNo: string }, exceptId?: string) {
  if (!input.name.trim()) fail('门店名称不能为空', 'VALIDATION', 400)
  if (stores.some((s) => s.merchantStoreNo === input.merchantStoreNo.trim() && s.id !== exceptId)) {
    fail('商户门店编号已存在', 'VALIDATION', 400)
  }
}

/* ------------------------------------------------------------------ */
/* 写命令：同一 commandId 只生效一次，可按原号查询                       */
/* ------------------------------------------------------------------ */

interface LoggedCommand {
  operation: string
  ref: string
  reply: CommandReply<unknown>
}

const commandLog = new Map<string, LoggedCommand>()
const configVersions = new Map<string, bigint>()
const storeUpdatedAt = new Map<string, string>()

/** 测试注入：下一次匹配的操作照常生效，但丢弃响应（模拟断线），用于验证按原号恢复 */
export const mockCommandFaults = {
  dropResponse: new Set<string>(),
  /** 下一次查询仍返回 NOT_OBSERVED 的次数 */
  hideFromLookup: 0,
}

function versionOf(key: string): string {
  return (configVersions.get(key) ?? BigInt(1)).toString()
}

function bumpVersion(key: string): string {
  const next = (configVersions.get(key) ?? BigInt(1)) + BigInt(1)
  configVersions.set(key, next)
  return next.toString()
}

function assertVersion(key: string, expected: string) {
  if (!/^(0|[1-9]\d*)$/.test(expected)) fail('expectedConfigurationVersion 必须为十进制字符串', 'VALIDATION', 400)
  if (expected !== versionOf(key)) fail('配置已被其他操作修改，请重新读取后再保存', 'VERSION_CONFLICT', 409)
}

function runOnce<T>(commandId: string, operation: string, ref: string, run: () => T): CommandReply<T> {
  if (!commandId) fail('缺少 commandId', 'VALIDATION', 400)
  const prior = commandLog.get(commandId)
  if (prior) {
    if (prior.operation !== operation || prior.ref !== ref) fail('该命令号已用于其他操作', 'COMMAND_ID_CONFLICT', 409)
    return prior.reply as CommandReply<T>
  }
  const reply: CommandReply<T> = { status: 'APPLIED', result: run() }
  commandLog.set(commandId, { operation, ref, reply })
  if (mockCommandFaults.dropResponse.delete(operation)) fail('网络连接中断（Mock 注入）', 'NETWORK', 0)
  return reply
}

function lookupOnce<T>(commandId: string, operation: string, ref: string, redact?: (r: T) => T): CommandReply<T> {
  if (mockCommandFaults.hideFromLookup > 0) {
    mockCommandFaults.hideFromLookup--
    return { status: 'NOT_OBSERVED' }
  }
  const prior = commandLog.get(commandId)
  if (!prior || prior.operation !== operation || prior.ref !== ref) return { status: 'NOT_OBSERVED' }
  const reply = prior.reply as CommandReply<T>
  return reply.status === 'APPLIED' && redact ? { status: 'APPLIED', result: redact(reply.result) } : reply
}

function storeCommandStore(s: Store): StoreCommandStore {
  return {
    storeCode: s.id,
    merchantStoreNo: s.merchantStoreNo,
    name: s.name,
    status: s.status,
    createdAt: s.createdAt,
    updatedAt: storeUpdatedAt.get(s.id) ?? s.createdAt,
  }
}

function validateStoreCommand(input: StoreCommandInput, exceptId?: string) {
  if (!input.merchantStoreNo.trim()) fail('商户门店编号不能为空', 'VALIDATION', 400)
  if (input.status !== 'ACTIVE' && input.status !== 'DISABLED') fail('门店状态只能为 ACTIVE 或 DISABLED', 'VALIDATION', 400)
  validateStore(input, exceptId)
}

/** 查询结果不再包含明文密钥 */
const withoutSecret = (r: KeyCommandApplied): KeyCommandApplied => ({ ...r, secret: null })

const protectedApi: Omit<MerchantApi, 'auth'> = {
  dashboard: {
    summary: () =>
      delay((): DashboardSummaryView => {
        const today = startOfDay(NOW)
        const now = Date.now()
        const cur = aggregate(today, now)
        const prev = aggregate(today - DAY, today - 1)
        const prevRate = prev.terminalCount ? rate(prev) : null
        const pct = (v: CompareValue) => (v === null ? null : (v * 100).toFixed(2))
        const paying = payments.filter((p) => p.status === 'PAYING' || p.status === 'CREATED' || p.status === 'CLOSING').length
        const refundProcessing = refunds.filter((r) => r.status === 'PROCESSING').length
        return {
          viewVersion: DASHBOARD_SUMMARY_VIEW_VERSION,
          asOf: asOf(),
          timezone: 'Asia/Shanghai',
          coverageStart: ymd(today - 59 * DAY),
          current: period(today, cur),
          previous: period(today - DAY, prev),
          processing: {
            payingCount: String(paying),
            refundProcessingCount: String(refundProcessing),
            totalCount: String(paying + refundProcessing),
          },
          presentation: {
            averageAmount: cur.successCount ? fenToAmount(cur.successAmount / BigInt(cur.successCount)) : null,
            successRatePercent: cur.terminalCount ? (rate(cur) * 100).toFixed(2) : null,
            [PRESENTATION_COMPARE_KEYS.successAmount]: pct(ratio(cur.successAmount, prev.successAmount)),
            [PRESENTATION_COMPARE_KEYS.successCount]: pct(ratio(cur.successCount, prev.successCount)),
            [PRESENTATION_COMPARE_KEYS.refundAmount]: pct(ratio(cur.refundAmount, prev.refundAmount)),
            [PRESENTATION_COMPARE_KEYS.refundCount]: pct(ratio(cur.refundCount, prev.refundCount)),
            [SUCCESS_RATE_DIFFERENCE_KEY]:
              prevRate === null || !cur.terminalCount ? null : ((rate(cur) - prevRate) * 100).toFixed(1),
          },
        }
      }),
    trend: (days) =>
      delay((): TrendView => {
        assertWindowDays(days)
        const last = lastCompletedDay()
        return { ...completedBase(last - (days - 1) * DAY, last), points: completedPoints(days) }
      }),
    channelShare: (days) =>
      delay((): ChannelShareView => {
        assertWindowDays(days)
        const last = lastCompletedDay()
        const from = last - (days - 1) * DAY
        return { ...completedBase(from, last), items: channelShare(from, last + DAY - 1) }
      }),
    recentPayments: (limit) =>
      delay(() => ({
        viewVersion: RECENT_PAYMENTS_VIEW_VERSION,
        items: payments.slice(0, Math.min(Math.max(limit, 1), 20)).map(paymentListItemDto),
        asOf: asOf(),
      })),
  },

  payments: {
    list: (q) =>
      delay(() => {
        const page = paginate(sortRows(filterPayments(q), q.sortBy, q.sortOrder), q.page, q.pageSize)
        const view: PaymentListPage = {
          viewVersion: PAYMENT_LIST_VIEW_VERSION,
          items: page.items.map(paymentListItemDto),
          total: String(page.total),
          page: page.page,
          pageSize: page.pageSize,
          asOf: asOf(),
        }
        return view
      }),
    get: (id) =>
      delay(() => ({ viewVersion: PAYMENT_DETAIL_VIEW_VERSION, payment: paymentListItemDto(findPayment(id)), asOf: asOf() })),
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
        assertPageParams(q.page, q.pageSize)
        const page = paginate(sortRows(filterRefunds(q), q.sortBy, q.sortOrder), q.page, q.pageSize)
        return viewPage(REFUND_VIEW_VERSION, { ...page, items: page.items.map(refundViewDto) })
      }),
    get: (id) =>
      delay(() => {
        const r = refunds.find((x) => x.id === id)
        if (!r) fail('退款记录不存在', 'NOT_FOUND', 404)
        return { viewVersion: REFUND_VIEW_VERSION, refund: refundViewDto(r), asOf: asOf() }
      }),
    create: (input) => createRefund(input),
    findByMerchantRefundNo: (paymentId, merchantRefundNo) =>
      delay(() => {
        // 协议 3.8.4：支付不存在与退款不存在统一 404 NOT_FOUND，不区分，不带 authoritative
        const p = payments.find((x) => x.id === paymentId)
        const r = p ? findInScope(p.scope, merchantRefundNo) : undefined
        if (!r || r.paymentId !== paymentId) fail('资源不存在或不可见', 'NOT_FOUND', 404)
        return { viewVersion: REFUND_VIEW_VERSION, refund: refundViewDto(r), asOf: asOf() }
      }),
  },

  analytics: {
    query: (q) =>
      delay((): AnalyticsView => {
        const from = dayStartMs(q.from)
        if (dayStartMs(q.to) > lastCompletedDay()) fail('所选营业日尚未结束，暂无已完成数据', 'REPORTING_DAY_INCOMPLETE', 422)
        const toDay = dayStartMs(q.to)
        if (from > toDay) fail('开始日期不能晚于结束日期', 'INVALID_REQUEST', 400)
        const to = toDay + DAY - 1
        const f = { storeId: q.storeId, channel: q.channel }
        const starts = bucketStarts(from, to, q.granularity)
        const buckets: AnalyticsBucketView[] = starts.map((s, i) => {
          const e = (starts[i + 1] ?? to + 1) - 1
          const bs = Math.max(s, from)
          const be = Math.min(e, to)
          const a = aggregate(bs, be, f)
          const key = q.granularity === 'month' ? ymd(s).slice(0, 7) : ymd(bs)
          return { key, fromDate: ymd(bs), toDate: ymd(be), metrics: reportMetrics(a), presentation: presentationOf(a) }
        })
        const len = to - from + 1
        const cur = aggregate(from, to, f)
        const prev = aggregate(from - len, from - 1, f)
        const byStore = stores
          .filter((s) => !q.storeId || s.id === q.storeId)
          .map((s) => ({ s, a: aggregate(from, to, { storeId: s.id, channel: q.channel }) }))
          .filter(({ a }) => a.successCount > 0)
          .sort((x, y) => (y.a.successAmount > x.a.successAmount ? 1 : y.a.successAmount < x.a.successAmount ? -1 : 0))
          .map(({ s, a }) => ({ storeCode: s.id, amount: fenToAmount(a.successAmount), count: String(a.successCount) }))
        return {
          ...completedBase(from, toDay),
          granularity: q.granularity,
          current: { fromDate: ymd(from), toDate: ymd(toDay), metrics: reportMetrics(cur) },
          previous: { fromDate: ymd(from - len), toDate: ymd(from - DAY), metrics: reportMetrics(prev) },
          presentation: presentationOf(cur, prev),
          buckets,
          byChannel: channelShare(from, to, f),
          byStore,
          directoryMode: DIRECTORY_MODE_OBSERVED_ONLY,
        }
      }, 450),
  },

  stores: {
    list: (q) =>
      delay(() => {
        assertPageParams(q.page, q.pageSize)
        const kw = q.keyword?.trim()
        const rows = stores.map(storeViewDto).filter((s) => {
          if (q.status && s.status !== q.status) return false
          if (kw && !s.name.includes(kw) && !s.storeNo.includes(kw) && !(s.merchantStoreNo !== null && s.merchantStoreNo.includes(kw))) return false
          return true
        })
        return viewPage(STORE_VIEW_VERSION, paginate(sortRows(rows, q.sortBy ?? 'createdAt', q.sortOrder ?? 'desc'), q.page, q.pageSize))
      }),
    options: () => delay(() => storeOptionsView(), 120),
    all: () => delay(() => storeOptionsView().items, 120),
    get: (id) => delay(() => ({ viewVersion: STORE_VIEW_VERSION, store: storeViewDto(findStore(id)), asOf: asOf() })),
    stats: (storeCode) =>
      delay((): StoreStatsView => {
        const s = stores.find((x) => x.id === storeCode)
        if (!s) fail('门店不存在', 'STORE_NOT_FOUND', 404)
        const last = lastCompletedDay()
        const from = last - 29 * DAY
        const a = aggregate(from, last + DAY - 1, { storeId: s.id })
        return {
          ...completedBase(from, last),
          storeId: s.id,
          metrics: reportMetrics(a),
          presentation: presentationOf(a),
          points: completedPoints(30, { storeId: s.id }),
        }
      }),
    editView: (storeCode) =>
      delay(() => ({
        viewVersion: STORE_COMMAND_VIEW_VERSION,
        configurationVersion: versionOf(`store:${storeCode}`),
        store: storeCommandStore(findStore(storeCode)),
      })),
    create: (commandId, input) =>
      delay(
        () =>
          runOnce(commandId, 'stores.create', '', () => {
            validateStoreCommand(input)
            const seq = stores.length + 1
            const s: Store = {
              id: `st_${seq}_${randomHex(4)}`,
              storeNo: `S${merchant.merchantNo.slice(1)}${pad(seq, 3)}`,
              merchantStoreNo: input.merchantStoreNo.trim(),
              name: input.name.trim(),
              status: input.status,
              address: '',
              contactName: '',
              contactPhone: '',
              createdAt: new Date().toISOString(),
            }
            stores.unshift(s)
            return { commandId, configurationVersion: versionOf(`store:${s.id}`), store: storeCommandStore(s) }
          }),
        500,
      ),
    update: (commandId, storeCode, expectedConfigurationVersion, input) =>
      delay(
        () =>
          runOnce(commandId, 'stores.update', storeCode, () => {
            const s = findStore(storeCode)
            assertVersion(`store:${storeCode}`, expectedConfigurationVersion)
            validateStoreCommand(input, storeCode)
            Object.assign(s, { name: input.name.trim(), merchantStoreNo: input.merchantStoreNo.trim(), status: input.status })
            storeUpdatedAt.set(storeCode, new Date().toISOString())
            payments.forEach((p) => p.storeId === storeCode && (p.storeName = s.name))
            return { commandId, configurationVersion: bumpVersion(`store:${storeCode}`), store: storeCommandStore(s) }
          }),
        500,
      ),
    lookupCommand: (commandId, q) =>
      delay(() => lookupOnce(commandId, q.operation, q.operation === 'stores.update' ? (q.storeCode ?? '') : '')),
  },

  apps: {
    list: (q) =>
      delay(() => {
        assertPageParams(q.page, q.pageSize)
        if (q.sortBy !== undefined && q.sortBy !== 'createdAt') fail('sortBy 参数不合法', 'VALIDATION', 400)
        if (q.sortOrder !== undefined && q.sortOrder !== 'asc' && q.sortOrder !== 'desc') fail('sortOrder 参数不合法', 'VALIDATION', 400)
        const dir = q.sortOrder === 'asc' ? 1 : -1
        // 稳定排序：createdAt 相同时按 appId 同方向
        const rows = [...apps].sort((a, b) =>
          a.createdAt !== b.createdAt ? (a.createdAt > b.createdAt ? dir : -dir) : a.appId === b.appId ? 0 : a.appId > b.appId ? dir : -dir,
        )
        return viewPage<typeof APP_VIEW_VERSION, AppView>(APP_VIEW_VERSION, paginate(rows, q.page, q.pageSize))
      }),
    get: (appId) =>
      delay(() => {
        const a = apps.find((x) => x.appId === appId)
        if (!a) fail('应用不存在', 'NOT_FOUND', 404)
        return { viewVersion: APP_VIEW_VERSION, app: a, asOf: asOf() }
      }),
  },

  keys: {
    list: (q) =>
      delay(() => developerPage(apiKeys.filter((k) => k.appId === q.appId).map(keyView), q.page, q.pageSize)),
    create: (commandId, appId) =>
      delay(
        () =>
          runOnce(commandId, 'keys.create', appId, () => {
            const { plainSecret, ...key } = issueKey(appId)
            return { commandId, configurationVersion: bumpVersion(`keys:${appId}`), key, secret: plainSecret }
          }),
        600,
      ),
    rotate: (commandId, appId, keyId) =>
      delay(
        () =>
          runOnce(commandId, 'keys.rotate', `${appId}/${keyId}`, () => {
            const old = apiKeys.find((k) => k.keyId === keyId && k.appId === appId)
            if (!old) fail('密钥不存在', 'NOT_FOUND', 404)
            if (old.status === 'REVOKED' || old.status === 'EXPIRED') fail('该密钥已失效，无法轮换', 'INVALID_STATUS', 409)
            if (old.status === 'EXPIRING') fail('该密钥处于过渡期，无法再次轮换', 'INVALID_STATUS', 409)
            const { plainSecret, ...key } = issueKey(appId)
            old.status = 'EXPIRING'
            old.expireAt = new Date(Date.now() + 1 * DAY).toISOString()
            return { commandId, configurationVersion: bumpVersion(`keys:${appId}`), key, secret: plainSecret }
          }),
        700,
      ),
    revoke: (commandId, appId, keyId) =>
      delay(
        () =>
          runOnce(commandId, 'keys.revoke', `${appId}/${keyId}`, () => {
            const k = apiKeys.find((x) => x.keyId === keyId && x.appId === appId)
            if (!k) fail('密钥不存在', 'NOT_FOUND', 404)
            if (k.status === 'REVOKED') fail('该密钥已撤销', 'INVALID_STATUS', 409)
            k.status = 'REVOKED'
            k.expireAt = new Date().toISOString()
            return { commandId, configurationVersion: bumpVersion(`keys:${appId}`), key: keyView(k), secret: null }
          }),
        500,
      ),
    lookupCommand: (commandId, q) =>
      delay(() =>
        lookupOnce(commandId, q.operation, q.operation === 'keys.create' ? q.appId : `${q.appId}/${q.keyId ?? ''}`, withoutSecret),
      ),
  },

  webhooks: {
    getConfig: (appId) =>
      delay(() => {
        const c = webhookConfigs.find((x) => x.appId === appId)
        if (!c) fail('Webhook 配置不存在', 'NOT_FOUND', 404)
        return {
          viewVersion: DEVELOPER_READ_VIEW_VERSION,
          asOf: asOf(),
          config: { appId: c.appId, url: c.url || null, enabled: c.enabled },
        }
      }),
    editView: (appId) =>
      delay(() => {
        const c = webhookConfigs.find((x) => x.appId === appId)
        if (!c) fail('Webhook 配置不存在', 'NOT_FOUND', 404)
        return {
          viewVersion: WEBHOOK_COMMAND_VIEW_VERSION,
          configurationVersion: versionOf(`webhook:${appId}`),
          config: { appId: c.appId, url: c.url || null, enabled: c.enabled },
        }
      }),
    updateConfig: (commandId, appId, expectedConfigurationVersion, input) =>
      delay(
        () =>
          runOnce(commandId, 'webhooks.save', appId, () => {
            const c = webhookConfigs.find((x) => x.appId === appId)
            if (!c) fail('Webhook 配置不存在', 'NOT_FOUND', 404)
            assertVersion(`webhook:${appId}`, expectedConfigurationVersion)
            if (input.enabled && input.url === null) fail('启用通知时必须填写回调地址', 'VALIDATION', 400)
            if (input.url !== null && !/^https:\/\/[^\s]+$/.test(input.url)) fail('通知地址必须为 HTTPS 地址', 'VALIDATION', 400)
            Object.assign(c, { url: input.url ?? '', enabled: input.enabled, updatedAt: new Date().toISOString() })
            return { commandId, configurationVersion: bumpVersion(`webhook:${appId}`) }
          }),
        500,
      ),
    lookupSave: (commandId, appId) => delay(() => lookupOnce(commandId, 'webhooks.save', appId)),
    sendTest: (commandId, appId) =>
      delay(
        () =>
          runOnce(commandId, 'webhooks.test', appId, () => {
            const c = webhookConfigs.find((x) => x.appId === appId)
            if (!c || !c.url) fail('请先配置通知地址', 'VALIDATION', 400)
            if (!c.enabled) fail('Webhook 未启用，请启用后再测试', 'VALIDATION', 400)
            // Mock 约定：地址含 unreachable 视为无法发出；含 mockStatus=NNN 时对端按该状态码响应
            if (c.url.includes('unreachable')) return { status: 'NOT_SENT' as const, httpStatus: 0, durationMs: 3000 }
            const forced = /[?&]mockStatus=(\d{3})\b/.exec(c.url)
            return {
              status: 'COMPLETED' as const,
              httpStatus: forced ? Number(forced[1]) : 200,
              durationMs: 120 + Math.round(Math.random() * 180),
            }
          }),
        900,
      ),
    lookupTest: (commandId, appId) => delay(() => lookupOnce(commandId, 'webhooks.test', appId)),
    deliveries: (q) =>
      delay(() => {
        const kw = q.keyword?.trim()
        const rows = webhookDeliveries.map(deliveryView).filter((w) => {
          if (q.appId && w.appId !== q.appId) return false
          if (q.eventType && w.eventType !== q.eventType) return false
          if (q.status && w.status !== q.status) return false
          if (kw && !w.eventId.includes(kw) && !w.resource.id.includes(kw)) return false
          return true
        })
        return developerPage(rows, q.page, q.pageSize)
      }),
    deliveriesFor: (resourceId, q) =>
      delay(() =>
        developerPage(
          webhookDeliveries.filter((w) => w.resourceId === resourceId).map(deliveryView),
          q?.page,
          q?.pageSize,
        ),
      ),
  },

  account: {
    merchant: () => delay(() => ({ viewVersion: MERCHANT_PROFILE_VIEW_VERSION, merchant, asOf: asOf() })),
    me: () => delay(() => currentUser, 150),
    updateMe: (input) =>
      delay(() => {
        if (!input.name.trim()) fail('姓名不能为空', 'VALIDATION', 400)
        currentUser.name = input.name.trim()
        return currentUser
      }, 500),
    changePassword: ({ current, next }) =>
      delay(() => {
        const sid = assertAuthenticated()
        if (!mockIdentitySessions.checkPassword(current)) fail('当前密码不正确', 'INVALID_PASSWORD', 400)
        if (next.length < 8 || !/[A-Za-z]/.test(next) || !/\d/.test(next) || next === current) {
          fail('新密码不符合安全策略', 'VALIDATION', 400)
        }
        mockIdentitySessions.setPassword(next)
        mockIdentitySessions.revokeOthers(sid)
      }, 700),
    sessions: () => delay(() => mockIdentitySessions.list(assertAuthenticated())),
    revokeSession: (id) =>
      delay(() => {
        if (!mockIdentitySessions.revoke(assertAuthenticated(), id)) fail('会话不存在或不可下线', 'NOT_FOUND', 404)
      }, 400),
    notifications: () => delay(() => notifications, 200),
    markAllRead: () =>
      delay(() => {
        notifications.forEach((n) => (n.read = true))
      }, 200),
  },

  search: (keyword) =>
    delay((): GlobalSearchView => {
      const kw = keyword.trim()
      const at = asOf()
      const LIMIT = 5
      const empty = (type: SearchGroupType, state: Exclude<SearchGroupState, 'OK'>): GlobalSearchGroup => ({
        type,
        state,
        items: [],
        hasMore: null,
        asOf: null,
      })
      const ok = (type: SearchGroupType, all: GlobalSearchItem[]): GlobalSearchGroup => ({
        type,
        state: 'OK',
        items: all.slice(0, LIMIT),
        hasMore: all.length > LIMIT,
        asOf: at,
      })
      /** 订单号/退款号类关键词：2-64 位字母数字、下划线或连字符 */
      const idLike = /^[A-Za-z0-9_-]{2,64}$/.test(kw)
      /** Mock 约定：以 deny 开头的关键词模拟无退款查看权限 */
      const refundDenied = kw.toLowerCase().startsWith('deny')
      const payment = idLike
        ? ok(
            'payment',
            payments
              .filter((p) => p.id.includes(kw) || (p.merchantOrderNo ?? '').includes(kw))
              .map((p) => ({ type: 'payment', id: p.id, title: p.merchantOrderNo ? `${p.id} · ${p.merchantOrderNo}` : p.id, to: `/payments/${p.id}` })),
          )
        : empty('payment', 'NOT_APPLICABLE')
      const refund = refundDenied
        ? empty('refund', 'NOT_AUTHORIZED')
        : idLike
          ? ok(
              'refund',
              refunds
                .filter((r) => r.id.includes(kw) || r.merchantRefundNo.includes(kw))
                .map((r) => ({ type: 'refund', id: r.id, title: `${r.id} · ${r.merchantRefundNo}`, to: `/refunds/${r.id}` })),
            )
          : empty('refund', 'NOT_APPLICABLE')
      const store = kw
        ? ok(
            'store',
            stores
              .filter((s) => s.name.includes(kw) || s.storeNo.includes(kw) || (s.merchantStoreNo ?? '').includes(kw))
              .map((s) => ({ type: 'store', id: s.id, title: `${s.name} · ${s.storeNo}`, to: `/stores/${s.id}` })),
          )
        : empty('store', 'NOT_APPLICABLE')
      return { viewVersion: GLOBAL_SEARCH_VIEW_VERSION, groups: [payment, refund, store] }
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
