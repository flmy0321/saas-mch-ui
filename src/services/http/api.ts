import { GLOBAL_SEARCH_VIEW_VERSION, SEARCH_GROUP_STATES, SEARCH_GROUP_TYPES, type GlobalSearchView } from '@/types'
import {
  API_KEY_STATUSES,
  DEVELOPER_READ_VIEW_VERSION,
  WEBHOOK_DELIVERY_STATUSES,
  type ApiKey,
  type DeveloperPage,
  type WebhookConfigView,
  type WebhookDelivery,
} from '@/types'
import type { MerchantApi } from '@/services/api/types'
import { ApiError } from '@/services/api/types'
import type {
  AppViewPage,
  AppViewSingle,
  AuthTokens,
  Captcha,
  DashboardSummaryView,
  LoginResult,
  RecentPaymentsView,
  StoreOptionsView,
  MerchantProfileView,
  MerchantSelection,
  PaymentDetailView,
  PaymentListItem,
  PaymentListPage,
  RefundViewPage,
  RefundViewSingle,
  StoreViewPage,
  StoreViewSingle,
  AnalyticsView,
  ChannelShareView,
  StoreStatsView,
  TrendView,
} from '@/types'
import {
  COMPLETED_REPORT_VIEW_VERSION,
  APP_VIEW_VERSION,
  DASHBOARD_SUMMARY_VIEW_VERSION,
  MERCHANT_PROFILE_VIEW_VERSION,
  RECENT_PAYMENTS_VIEW_VERSION,
  STORE_OPTIONS_VIEW_VERSION,
  PAYMENT_DETAIL_VIEW_VERSION,
  PAYMENT_LIST_VIEW_VERSION,
  REFUND_VIEW_VERSION,
  STORE_VIEW_VERSION,
} from '@/types'
import { isCountSum, isExactCount, MAX_PAGE } from '@/utils/count'
import { isConsistentPage } from '@/utils/page'
import { request, seg } from './client'
import {
  KEY_COMMAND_VIEW_VERSION,
  STORE_COMMAND_VIEW_VERSION,
  WEBHOOK_COMMAND_VIEW_VERSION,
  type StoreCommandInput,
} from '@/types/command'
import {
  parseKeyCommand,
  parseStoreCommand,
  parseStoreEdit,
  parseWebhookCommand,
  parseWebhookEdit,
  parseWebhookTest,
} from './commands'

const storeBody = (input: StoreCommandInput) => ({
  merchantStoreNo: input.merchantStoreNo.trim(),
  name: input.name.trim(),
  status: input.status,
})

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
    !isUtcTime(p.asOf) ||
    !Array.isArray(p.items) ||
    p.items.length > 100
  ) {
    throw malformed('支付列表')
  }
  for (const item of p.items) checkPaymentItem(item, '支付列表项')
  return p as PaymentListPage
}

/* ---------- 严格视图校验（协议 1.1 / 3.1a / 3.1b / 3.8.0a） ---------- */

function hasExactKeys(o: unknown, keys: readonly string[]): o is Record<string, unknown> {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false
  const own = Object.keys(o)
  return own.length === keys.length && keys.every((k) => Object.prototype.hasOwnProperty.call(o, k))
}
const isStr = (v: unknown): v is string => typeof v === 'string'
const isStrOrNull = (v: unknown) => v === null || typeof v === 'string'
const oneOf = (...allowed: string[]) => (v: unknown) => typeof v === 'string' && allowed.includes(v)

/** 1.1 输出金额：恰好两位小数、非负，如 "128.00"；不接受 number、空串或其他写法 */
const AMOUNT_OUTPUT = /^(0|[1-9]\d*)\.\d{2}$/
const isAmount = (v: unknown): v is string => typeof v === 'string' && AMOUNT_OUTPUT.test(v)
const isAmountOrNull = (v: unknown) => v === null || isAmount(v)

/** ISO 8601 UTC 带毫秒，且是真实存在的日历时刻（如拒绝 2026-02-30） */
const UTC_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
function isUtcTime(v: unknown): v is string {
  if (typeof v !== 'string' || !UTC_MS.test(v)) return false
  const d = new Date(v)
  return !Number.isNaN(d.getTime()) && d.toISOString() === v
}
const isUtcTimeOrNull = (v: unknown) => v === null || isUtcTime(v)

type FieldRule = (v: unknown) => boolean
type ItemRules = Record<string, FieldRule>

function checkItem(item: unknown, rules: ItemRules, what: string): asserts item is Record<string, unknown> {
  const keys = Object.keys(rules)
  if (!hasExactKeys(item, keys)) throw malformed(what)
  for (const k of keys) if (!rules[k](item[k])) throw malformed(what)
}

/**
 * 3.1a/3.1b 22 键：逐字段校验类型与格式。
 * source、currency、refundAggregate 为合同闭集；channel/method/status/coreStatus/refundEligibility/
 * collectionVerification 为开放字符串（未知值保留原值展示），但必须是非空字符串。
 */
const PAYMENT_RULES: ItemRules = {
  id: isNonEmptyString,
  source: oneOf('API', 'EXTERNAL'),
  merchantOrderNo: isStrOrNull,
  storeId: isStrOrNull,
  storeName: isStrOrNull,
  subject: isStrOrNull,
  amount: isAmount,
  currency: oneOf('CNY'),
  channel: isNonEmptyString,
  method: isNonEmptyString,
  createdAt: isUtcTime,
  paidAt: isUtcTimeOrNull,
  expireAt: isUtcTimeOrNull,
  refundedAmount: isAmount,
  refundingAmount: isAmount,
  refundPrincipalLimit: isAmountOrNull,
  availableRefundAmount: isAmountOrNull,
  refundEligibility: isNonEmptyString,
  collectionVerification: isNonEmptyString,
  status: isNonEmptyString,
  coreStatus: isNonEmptyString,
  refundAggregate: oneOf('NONE', 'PARTIAL', 'FULL'),
}
if (Object.keys(PAYMENT_RULES).length !== LIST_ITEM_KEYS.length) throw new Error('PAYMENT_RULES 与 22 键不一致')

function checkPaymentItem(item: unknown, what: string): void {
  checkItem(item, PAYMENT_RULES, what)
  // 来源联动按合同：API 的订单号与商品描述必为字符串；EXTERNAL 订单号必为 null，商品描述可为 null 或真实字符串
  if (item.source === 'API' && (typeof item.merchantOrderNo !== 'string' || typeof item.subject !== 'string')) throw malformed(what)
  if (item.source === 'EXTERNAL' && item.merchantOrderNo !== null) throw malformed(what)
}

/** 单项：恰好 viewVersion / 数据键 / asOf 三键 */
function parseSingle<T>(v: unknown, version: string, dataKey: string, check: (item: unknown) => void, what: string): T {
  if (!hasExactKeys(v, ['viewVersion', dataKey, 'asOf']) || v.viewVersion !== version || !isUtcTime(v.asOf)) {
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
    !isUtcTime(v.asOf) ||
    !Array.isArray(v.items) ||
    !isConsistentPage(v.total, v.page, v.pageSize, v.items.length)
  ) {
    throw malformed(what)
  }
  for (const item of v.items) check(item)
  return v as T
}

const MERCHANT_RULES: ItemRules = { merchantNo: isNonEmptyString, name: isStr, status: isNonEmptyString, createdAt: isUtcTime }
const STORE_RULES: ItemRules = {
  id: isNonEmptyString, storeNo: isNonEmptyString, merchantStoreNo: isStrOrNull, name: isStr, status: isNonEmptyString, createdAt: isUtcTime,
}
const APP_RULES: ItemRules = {
  id: isNonEmptyString, appId: isNonEmptyString, name: isStr, env: isNonEmptyString, status: isNonEmptyString, createdAt: isUtcTime,
}
const REFUND_RULES: ItemRules = {
  id: isNonEmptyString, merchantRefundNo: isStrOrNull, paymentId: isNonEmptyString, storeId: isStrOrNull, storeName: isStrOrNull,
  amount: isAmount, status: isNonEmptyString, reason: isStrOrNull, createdAt: isUtcTime, finishedAt: isUtcTimeOrNull,
}
/** 3.8.4：只有 SUCCESS/FAILED/CLOSED 可携带终态时间；其他状态（含 SUSPENDED 与未知值）finishedAt 必为 null */
const REFUND_TERMINAL = new Set(['SUCCESS', 'FAILED', 'CLOSED'])
const checkStore = (i: unknown) => checkItem(i, STORE_RULES, '门店')
const checkApp = (i: unknown) => checkItem(i, APP_RULES, 'App')
function checkRefund(i: unknown): void {
  checkItem(i, REFUND_RULES, '退款')
  if (!REFUND_TERMINAL.has(i.status as string) && i.finishedAt !== null) throw malformed('退款')
}

/** 精确查询：返回的两个键必须与请求一致（null 视为不一致），否则按畸形响应处理 */
function parseRefundExact(v: unknown, paymentId: string, merchantRefundNo: string): RefundViewSingle {
  const r = parseSingle<RefundViewSingle>(v, REFUND_VIEW_VERSION, 'refund', checkRefund, '退款')
  if (r.refund.paymentId !== paymentId || r.refund.merchantRefundNo !== merchantRefundNo) throw malformed('退款精确查询')
  return r
}

/* ---------- 第一阶段：工作台摘要 / 近期订单 / 门店选项 ---------- */

const YMD = /^\d{4}-\d{2}-\d{2}$/
const isYmd = (v: unknown): v is string => typeof v === 'string' && YMD.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime())
/** 时刻：ISO 8601，带 Z 或显式偏移（报表窗口可能按商户时区表达） */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/
const isInstant = (v: unknown): v is string => typeof v === 'string' && ISO_INSTANT.test(v) && !Number.isNaN(new Date(v).getTime())

/* ---------- 开发者中心读取视图（portal-developer-read-view/0.1-draft） ---------- */

const isInstantOrNull = (v: unknown) => v === null || isInstant(v)
const isHttpStatusOrNull = (v: unknown) => v === null || isIntIn(v, 100, 599)

function parseDeveloperPage<T>(
  v: unknown,
  rules: ItemRules,
  what: string,
  isConsistent: (item: Record<string, unknown>) => boolean,
): DeveloperPage<T> {
  if (!hasExactKeys(v, ['viewVersion', 'asOf', 'items', 'total', 'page', 'pageSize'])) throw malformed(what)
  const { viewVersion, asOf, items, total, page, pageSize } = v
  if (
    viewVersion !== DEVELOPER_READ_VIEW_VERSION ||
    !isInstant(asOf) ||
    !isExactCount(total) ||
    !isIntIn(page, 1, MAX_PAGE) ||
    !isIntIn(pageSize, 1, 100) ||
    !Array.isArray(items) ||
    items.length > pageSize ||
    /* 条目减少后请求页可能已越过末页：{page:2,total:"1",items:[]} 是合法空页，由页面回到有效页重查 */
    (items.length > 0 && BigInt(total) < BigInt((page - 1) * pageSize + items.length))
  ) {
    throw malformed(what)
  }
  for (const item of items) {
    checkItem(item, rules, `${what}项`)
    if (!isConsistent(item)) throw malformed(`${what}项`)
  }
  return v as unknown as DeveloperPage<T>
}

const API_KEY_RULES: ItemRules = {
  appId: isNonEmptyString,
  keyId: isNonEmptyString,
  status: oneOf(...API_KEY_STATUSES),
  createdAt: isInstant,
  validFrom: isInstant,
  validUntil: isInstantOrNull,
  revokedAt: isInstantOrNull,
}

/** 仅 REVOKED 带 revokedAt；GRACE 必须给出截止时间 */
const isConsistentKey = (appId: string) => (k: Record<string, unknown>) =>
  k.appId === appId && (k.status === 'REVOKED') === (k.revokedAt !== null) && (k.status !== 'GRACE' || k.validUntil !== null)

const isDeliveryResource = (v: unknown) =>
  hasExactKeys(v, ['type', 'id']) && oneOf('payment', 'refund')(v.type) && isNonEmptyString(v.id)

const DELIVERY_RULES: ItemRules = {
  eventId: isNonEmptyString,
  eventType: isNonEmptyString,
  resource: isDeliveryResource,
  appId: isNonEmptyString,
  status: oneOf(...WEBHOOK_DELIVERY_STATUSES),
  allocatedAttempts: isExactCount,
  createdAt: isInstant,
  nextAttemptAt: isInstantOrNull,
  acknowledgedAt: isInstantOrNull,
  lastHttpStatus: isHttpStatusOrNull,
  lastErrorCode: isStrOrNull,
}

/** 只有 COMPLETED 带确认时间；等待重试必须给出下次投递时间 */
const isConsistentDelivery = (d: Record<string, unknown>) =>
  (d.status === 'COMPLETED') === (d.acknowledgedAt !== null) && (d.status !== 'RETRY_WAIT' || d.nextAttemptAt !== null)

const isDeliveryFor = (resourceId: string) => (d: Record<string, unknown>) =>
  isConsistentDelivery(d) && (d.resource as { id: string }).id === resourceId

export function parseDeliveryPage(v: unknown): DeveloperPage<WebhookDelivery> {
  return parseDeveloperPage<WebhookDelivery>(v, DELIVERY_RULES, 'Webhook 投递记录', isConsistentDelivery)
}

function parseWebhookConfigView(v: unknown, appId: string): WebhookConfigView {
  if (!hasExactKeys(v, ['viewVersion', 'asOf', 'config']) || v.viewVersion !== DEVELOPER_READ_VIEW_VERSION || !isInstant(v.asOf)) {
    throw malformed('Webhook 配置')
  }
  const c = v.config
  if (
    !hasExactKeys(c, ['appId', 'url', 'enabled']) ||
    c.appId !== appId ||
    typeof c.enabled !== 'boolean' ||
    !(c.url === null || isNonEmptyString(c.url)) ||
    (c.enabled && c.url === null)
  ) {
    throw malformed('Webhook 配置')
  }
  return v as unknown as WebhookConfigView
}

const METRIC_RULES: ItemRules = {
  successAmount: isAmount,
  successCount: isExactCount,
  refundAmount: isAmount,
  refundCount: isExactCount,
  totalCount: isExactCount,
  terminalCount: isExactCount,
  createdSuccessCount: isExactCount,
}
export function checkMetrics(v: unknown, what: string): void {
  checkItem(v, METRIC_RULES, what)
}

/** presentation：只接受字符串或 null 值；派生值以后端为准，前端不重算 */
export function checkPresentation(v: unknown, what: string): void {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw malformed(what)
  for (const val of Object.values(v)) if (!(val === null || typeof val === 'string')) throw malformed(what)
}

function checkPeriod(v: unknown, what: string): void {
  if (!hasExactKeys(v, ['date', 'fromInclusive', 'toExclusive', 'metrics'])) throw malformed(what)
  if (!isYmd(v.date) || !isInstant(v.fromInclusive) || !isInstant(v.toExclusive)) throw malformed(what)
  // 营业日刚开始（午夜）时窗口为零宽，from === to 合法；只拒绝倒置
  if (new Date(v.fromInclusive).getTime() > new Date(v.toExclusive).getTime()) throw malformed(what)
  checkMetrics(v.metrics, what)
}

export function parseDashboardSummary(v: unknown): DashboardSummaryView {
  const what = '工作台摘要'
  if (
    !hasExactKeys(v, ['viewVersion', 'asOf', 'timezone', 'coverageStart', 'current', 'previous', 'processing', 'presentation']) ||
    v.viewVersion !== DASHBOARD_SUMMARY_VIEW_VERSION ||
    !isInstant(v.asOf) ||
    !isNonEmptyString(v.timezone) ||
    !(v.coverageStart === null || isYmd(v.coverageStart) || isInstant(v.coverageStart))
  ) {
    throw malformed(what)
  }
  checkPeriod(v.current, what)
  checkPeriod(v.previous, what)
  checkItem(v.processing, { payingCount: isExactCount, refundProcessingCount: isExactCount, totalCount: isCountSum }, what)
  checkPresentation(v.presentation, what)
  return v as unknown as DashboardSummaryView
}

export function parseRecentPayments(v: unknown, limit: number): RecentPaymentsView {
  const what = '近期订单'
  if (
    !hasExactKeys(v, ['viewVersion', 'items', 'asOf']) ||
    v.viewVersion !== RECENT_PAYMENTS_VIEW_VERSION ||
    !isInstant(v.asOf) ||
    !Array.isArray(v.items) ||
    v.items.length > limit
  ) {
    throw malformed(what)
  }
  for (const item of v.items) checkPaymentItem(item, '近期订单项')
  return v as unknown as RecentPaymentsView
}

const STORE_OPTION_RULES: ItemRules = {
  id: isNonEmptyString, storeNo: isNonEmptyString, merchantStoreNo: isStrOrNull, name: isStr, status: isNonEmptyString,
}
const STORE_OPTIONS_MAX_ITEMS = 100
export function parseStoreOptions(v: unknown): StoreOptionsView {
  const what = '门店选项'
  if (
    !hasExactKeys(v, ['viewVersion', 'items', 'total', 'complete', 'asOf']) ||
    v.viewVersion !== STORE_OPTIONS_VIEW_VERSION ||
    !isIntIn(v.total, 0, Number.MAX_SAFE_INTEGER) ||
    typeof v.complete !== 'boolean' ||
    !isInstant(v.asOf) ||
    !Array.isArray(v.items) ||
    v.items.length > STORE_OPTIONS_MAX_ITEMS
  ) {
    throw malformed(what)
  }
  // total 为 JSON 数字；complete=true 时 items 必须是全集，否则 items 不得多于 total
  const count = v.items.length
  if (v.complete ? count !== v.total : count > v.total) throw malformed(what)
  for (const item of v.items) checkItem(item, STORE_OPTION_RULES, '门店选项项')
  return v as unknown as StoreOptionsView
}

/* ---------- 已完成营业日报表：趋势 / 渠道占比 / 经营分析 / 门店统计 ---------- */

const REPORT_BASE_KEYS = ['viewVersion', 'asOf', 'timezone', 'coverageStart', 'fromDate', 'toDate'] as const

function checkReportBase(v: unknown, extra: readonly string[], what: string): asserts v is Record<string, unknown> {
  if (
    !hasExactKeys(v, [...REPORT_BASE_KEYS, ...extra]) ||
    v.viewVersion !== COMPLETED_REPORT_VIEW_VERSION ||
    !isInstant(v.asOf) ||
    !isNonEmptyString(v.timezone) ||
    !(v.coverageStart === null || isYmd(v.coverageStart) || isInstant(v.coverageStart)) ||
    !isYmd(v.fromDate) ||
    !isYmd(v.toDate) ||
    v.fromDate > v.toDate
  ) {
    throw malformed(what)
  }
}

const inWindow = (d: string, base: Record<string, unknown>) => d >= (base.fromDate as string) && d <= (base.toDate as string)

/** 日序列：营业日唯一、升序，且落在报表窗口内 */
function checkPoints(points: unknown, base: Record<string, unknown>, maxLen: number, what: string): void {
  if (!Array.isArray(points) || points.length > maxLen) throw malformed(what)
  let prev = ''
  for (const p of points) {
    if (!hasExactKeys(p, ['date', 'metrics', 'presentation']) || !isYmd(p.date) || p.date <= prev || !inWindow(p.date, base)) {
      throw malformed(what)
    }
    prev = p.date
    checkMetrics(p.metrics, what)
    checkPresentation(p.presentation, what)
  }
}

const CHANNEL_AMOUNT_RULES: ItemRules = { channel: isNonEmptyString, amount: isAmount, count: isExactCount }
function checkChannelItems(items: unknown, what: string): void {
  if (!Array.isArray(items)) throw malformed(what)
  const seen = new Set<string>()
  for (const i of items) {
    checkItem(i, CHANNEL_AMOUNT_RULES, what)
    if (seen.has(i.channel as string)) throw malformed(what)
    seen.add(i.channel as string)
  }
}

export function parseTrend(v: unknown, days: number): TrendView {
  const what = '交易趋势'
  checkReportBase(v, ['points'], what)
  checkPoints(v.points, v, days, what)
  return v as unknown as TrendView
}

export function parseChannelShare(v: unknown): ChannelShareView {
  const what = '渠道占比'
  checkReportBase(v, ['items'], what)
  checkChannelItems(v.items, what)
  return v as unknown as ChannelShareView
}

function checkAnalyticsPeriod(p: unknown, what: string): void {
  if (!hasExactKeys(p, ['fromDate', 'toDate', 'metrics']) || !isYmd(p.fromDate) || !isYmd(p.toDate) || p.fromDate > p.toDate) {
    throw malformed(what)
  }
  checkMetrics(p.metrics, what)
}

/** 只接受站内路径，拒绝协议相对地址和反斜杠，防止开放跳转 */
const isInternalPath = (v: unknown): v is string =>
  typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') && !v.includes('\\') && !/[\s]/.test(v)

const SEARCH_MAX_ITEMS = 50

export function parseGlobalSearch(v: unknown): GlobalSearchView {
  const what = '全局搜索'
  if (!hasExactKeys(v, ['viewVersion', 'groups']) || v.viewVersion !== GLOBAL_SEARCH_VIEW_VERSION || !Array.isArray(v.groups)) {
    throw malformed(what)
  }
  if (v.groups.length > SEARCH_GROUP_TYPES.length) throw malformed(what)
  const seen = new Set<unknown>()
  for (const g of v.groups) {
    if (!hasExactKeys(g, ['type', 'state', 'items', 'hasMore', 'asOf'])) throw malformed(what)
    if (!oneOf(...SEARCH_GROUP_TYPES)(g.type) || seen.has(g.type)) throw malformed(what)
    seen.add(g.type)
    if (!oneOf(...SEARCH_GROUP_STATES)(g.state)) throw malformed(what)
    if (!Array.isArray(g.items) || g.items.length > SEARCH_MAX_ITEMS) throw malformed(what)
    if (g.state === 'OK') {
      if (typeof g.hasMore !== 'boolean' || !isInstant(g.asOf)) throw malformed(what)
    } else if (g.items.length > 0 || g.hasMore !== null || g.asOf !== null) {
      throw malformed(what)
    }
    const groupType = g.type
    for (const it of g.items) {
      checkItem(it, { type: (t: unknown) => t === groupType, id: isNonEmptyString, title: isNonEmptyString, to: isInternalPath }, what)
    }
  }
  return v as unknown as GlobalSearchView
}

const ANALYTICS_MAX_BUCKETS = 400
const STORE_AMOUNT_RULES: ItemRules = { storeCode: isStrOrNull, amount: isAmount, count: isExactCount }

export function parseAnalytics(v: unknown): AnalyticsView {
  const what = '经营分析'
  checkReportBase(v, ['granularity', 'current', 'previous', 'presentation', 'buckets', 'byChannel', 'byStore', 'directoryMode'], what)
  if (!oneOf('day', 'week', 'month')(v.granularity)) throw malformed(what)
  checkAnalyticsPeriod(v.current, what)
  checkAnalyticsPeriod(v.previous, what)
  checkPresentation(v.presentation, what)
  if (!isNonEmptyString(v.directoryMode)) throw malformed(what)
  if (!Array.isArray(v.buckets) || v.buckets.length > ANALYTICS_MAX_BUCKETS) throw malformed(what)
  const keys = new Set<string>()
  let prevFrom = ''
  for (const b of v.buckets) {
    if (
      !hasExactKeys(b, ['key', 'fromDate', 'toDate', 'metrics', 'presentation']) ||
      !isNonEmptyString(b.key) ||
      keys.has(b.key) ||
      !isYmd(b.fromDate) ||
      !isYmd(b.toDate) ||
      b.fromDate > b.toDate ||
      b.fromDate <= prevFrom ||
      !inWindow(b.fromDate, v) ||
      !inWindow(b.toDate, v)
    ) {
      throw malformed(what)
    }
    keys.add(b.key)
    prevFrom = b.fromDate
    checkMetrics(b.metrics, what)
    checkPresentation(b.presentation, what)
  }
  checkChannelItems(v.byChannel, what)
  if (!Array.isArray(v.byStore)) throw malformed(what)
  for (const s of v.byStore) checkItem(s, STORE_AMOUNT_RULES, what)
  return v as unknown as AnalyticsView
}

const STORE_STATS_DAYS = 30
export function parseStoreStats(v: unknown): StoreStatsView {
  const what = '门店统计'
  checkReportBase(v, ['storeId', 'metrics', 'presentation', 'points'], what)
  if (!isNonEmptyString(v.storeId)) throw malformed(what)
  checkMetrics(v.metrics, what)
  checkPresentation(v.presentation, what)
  checkPoints(v.points, v, STORE_STATS_DAYS, what)
  return v as unknown as StoreStatsView
}

const REPORT_QUERY = { viewVersion: COMPLETED_REPORT_VIEW_VERSION }

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
    summary: async () =>
      parseDashboardSummary(await request<unknown>('/dashboard/summary', { query: { viewVersion: DASHBOARD_SUMMARY_VIEW_VERSION } })),
    trend: async (days) => parseTrend(await request<unknown>('/dashboard/trend', { query: { days, ...REPORT_QUERY } }), days),
    channelShare: async (days) => parseChannelShare(await request<unknown>('/dashboard/channel-share', { query: { days, ...REPORT_QUERY } })),
    recentPayments: async (limit) =>
      parseRecentPayments(
        await request<unknown>('/dashboard/recent-payments', { query: { limit, viewVersion: RECENT_PAYMENTS_VIEW_VERSION } }),
        limit,
      ),
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
    query: async (q) => parseAnalytics(await request<unknown>('/analytics', { query: { ...q, ...REPORT_QUERY } })),
  },
  stores: {
    list: async (query) => parsePage<StoreViewPage>(await request<unknown>('/stores', { query: { ...query } }), STORE_VIEW_VERSION, checkStore, '门店列表'),
    options: async () => parseStoreOptions(await request<unknown>('/stores/options', { query: { viewVersion: STORE_OPTIONS_VIEW_VERSION } })),
    all: async () => (await httpApi.stores.options()).items,
    get: async (id) => parseSingle<StoreViewSingle>(await request<unknown>(`/stores/${seg(id)}`), STORE_VIEW_VERSION, 'store', checkStore, '门店详情'),
    stats: async (storeCode) => parseStoreStats(await request<unknown>(`/stores/${seg(storeCode)}/stats`, { query: REPORT_QUERY })),
    editView: async (storeCode) =>
      parseStoreEdit(
        await request<unknown>(`/stores/${seg(storeCode)}/edit`, { query: { viewVersion: STORE_COMMAND_VIEW_VERSION } }),
        storeCode,
      ),
    create: async (commandId, input) =>
      parseStoreCommand(
        await request<unknown>('/stores', {
          method: 'POST',
          body: { viewVersion: STORE_COMMAND_VIEW_VERSION, commandId, ...storeBody(input) },
        }),
        commandId,
      ),
    update: async (commandId, storeCode, expectedConfigurationVersion, input) =>
      parseStoreCommand(
        await request<unknown>(`/stores/${seg(storeCode)}`, {
          method: 'PUT',
          body: { viewVersion: STORE_COMMAND_VIEW_VERSION, commandId, expectedConfigurationVersion, ...storeBody(input) },
        }),
        commandId,
      ),
    lookupCommand: async (commandId, q) =>
      parseStoreCommand(
        await request<unknown>(`/store-commands/${seg(commandId)}`, {
          query: {
            viewVersion: STORE_COMMAND_VIEW_VERSION,
            operation: q.operation,
            ...(q.operation === 'stores.update' ? { storeCode: q.storeCode } : {}),
          },
        }),
        commandId,
      ),
  },
  apps: {
    list: async (query) => parsePage<AppViewPage>(await request<unknown>('/apps', { query: { ...query } }), APP_VIEW_VERSION, checkApp, 'App 列表'),
    get: async (appId) => parseSingle<AppViewSingle>(await request<unknown>(`/apps/${seg(appId)}`), APP_VIEW_VERSION, 'app', checkApp, 'App 详情'),
  },
  keys: {
    list: async (query) =>
      parseDeveloperPage<ApiKey>(
        await request<unknown>('/api-keys', { query: { ...query, viewVersion: DEVELOPER_READ_VIEW_VERSION } }),
        API_KEY_RULES,
        'API Key 列表',
        isConsistentKey(query.appId),
      ),
    create: async (commandId, appId) =>
      parseKeyCommand(
        await request<unknown>(`/apps/${seg(appId)}/api-keys`, {
          method: 'POST',
          body: { viewVersion: KEY_COMMAND_VIEW_VERSION, commandId },
        }),
        commandId,
        appId,
      ),
    rotate: async (commandId, appId, keyId) =>
      parseKeyCommand(
        await request<unknown>(`/api-keys/${seg(keyId)}/rotate`, {
          method: 'POST',
          body: { viewVersion: KEY_COMMAND_VIEW_VERSION, commandId, appId },
        }),
        commandId,
        appId,
      ),
    revoke: async (commandId, appId, keyId) =>
      parseKeyCommand(
        await request<unknown>(`/api-keys/${seg(keyId)}/revoke`, {
          method: 'POST',
          body: { viewVersion: KEY_COMMAND_VIEW_VERSION, commandId, appId },
        }),
        commandId,
        appId,
      ),
    lookupCommand: async (commandId, q) =>
      parseKeyCommand(
        await request<unknown>(`/api-key-commands/${seg(commandId)}`, {
          query: {
            viewVersion: KEY_COMMAND_VIEW_VERSION,
            appId: q.appId,
            operation: q.operation,
            ...(q.operation === 'keys.create' ? {} : { keyId: q.keyId }),
          },
        }),
        commandId,
        q.appId,
      ),
  },
  webhooks: {
    getConfig: async (appId) =>
      parseWebhookConfigView(
        await request<unknown>(`/apps/${seg(appId)}/webhook`, { query: { viewVersion: DEVELOPER_READ_VIEW_VERSION } }),
        appId,
      ),
    editView: async (appId) =>
      parseWebhookEdit(
        await request<unknown>(`/apps/${seg(appId)}/webhook/edit`, { query: { viewVersion: WEBHOOK_COMMAND_VIEW_VERSION } }),
        appId,
      ),
    updateConfig: async (commandId, appId, expectedConfigurationVersion, input) =>
      parseWebhookCommand(
        await request<unknown>(`/apps/${seg(appId)}/webhook`, {
          method: 'PUT',
          body: {
            viewVersion: WEBHOOK_COMMAND_VIEW_VERSION,
            commandId,
            expectedConfigurationVersion,
            url: input.url,
            enabled: input.enabled,
          },
        }),
        commandId,
      ),
    lookupSave: async (commandId, appId) =>
      parseWebhookCommand(
        await request<unknown>(`/apps/${seg(appId)}/webhook/commands/${seg(commandId)}`, {
          query: { viewVersion: WEBHOOK_COMMAND_VIEW_VERSION },
        }),
        commandId,
      ),
    sendTest: async (commandId, appId) =>
      parseWebhookTest(
        await request<unknown>(`/apps/${seg(appId)}/webhook/test`, {
          method: 'POST',
          body: { viewVersion: WEBHOOK_COMMAND_VIEW_VERSION, commandId },
        }),
        commandId,
      ),
    lookupTest: async (commandId, appId) =>
      parseWebhookTest(
        await request<unknown>(`/apps/${seg(appId)}/webhook/test/commands/${seg(commandId)}`, {
          query: { viewVersion: WEBHOOK_COMMAND_VIEW_VERSION },
        }),
        commandId,
      ),
    deliveries: async (query) =>
      parseDeliveryPage(
        await request<unknown>('/webhook-deliveries', { query: { ...query, viewVersion: DEVELOPER_READ_VIEW_VERSION } }),
      ),
    deliveriesFor: async (resourceId, query) =>
      parseDeveloperPage<WebhookDelivery>(
        await request<unknown>(`/webhook-deliveries/by-resource/${seg(resourceId)}`, {
          query: { ...query, viewVersion: DEVELOPER_READ_VIEW_VERSION },
        }),
        DELIVERY_RULES,
        'Webhook 投递记录',
        isDeliveryFor(resourceId),
      ),
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
  search: async (keyword) =>
    parseGlobalSearch(await request<unknown>('/search', { query: { keyword, viewVersion: GLOBAL_SEARCH_VIEW_VERSION } })),
}
