/**
 * 金额：元十进制字符串（协议 1.1 方案 A）。
 * 输出恰好两位小数，如 "128.00"；输入允许 0~2 位小数。运算统一使用 `@/utils/money`。
 */
export type AmountDecimal = string

/** 服务端可能返回本文未列出的新枚举值，类型层保留原始字符串 */
type Open<T extends string> = T | (string & {})

export type AppEnv = 'production' | 'sandbox'

export type KnownPaymentStatus = 'CREATED' | 'PAYING' | 'CLOSING' | 'SUCCESS' | 'FAILED' | 'CLOSED'
export type PaymentStatus = Open<KnownPaymentStatus>
export type KnownRefundStatus = 'CREATED' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'CLOSED' | 'SUSPENDED'
export type RefundStatus = Open<KnownRefundStatus>
/** 退款聚合状态：由核心状态映射，Portal 不自行计算 */
export type RefundAggregateStatus = 'NONE' | 'PARTIAL' | 'FULL'

export type KnownPaymentChannel = 'WECHAT' | 'ALIPAY' | 'UNIONPAY' | 'DCEP' | 'JD' | 'HUAWEI' | 'TIKTOK'
export type PaymentChannel = Open<KnownPaymentChannel>
export type KnownPaymentMethod =
  | 'QR'
  | 'MINI_PROGRAM'
  | 'OFFICIAL_ACCOUNT'
  | 'H5'
  | 'SDK'
  | 'JS'
  | 'MERCHANT_SCAN'
  | 'STATIC_QR'
  | 'POS'
export type PaymentMethod = Open<KnownPaymentMethod>
/** 【待核对】取值以核心为准 */
export type PaymentSource = Open<'API' | 'EXTERNAL'>

export type KnownRefundEligibility =
  | 'NOT_COLLECTED'
  | 'REVIEW_REQUIRED'
  | 'RULE_UNVERIFIED'
  | 'BLOCKED'
  | 'EXHAUSTED'
  | 'ALLOWED'
export type RefundEligibility = Open<KnownRefundEligibility>
export type KnownCollectionVerification = 'PENDING' | 'VERIFIED' | 'REVIEW_REQUIRED'
export type CollectionVerification = Open<KnownCollectionVerification>

export type StoreStatus = 'ACTIVE' | 'DISABLED'

export interface Store {
  id: string
  storeNo: string
  merchantStoreNo: string
  name: string
  status: StoreStatus
  address: string
  contactName: string
  contactPhone: string
  createdAt: string
}

export interface Payment {
  id: string
  source: PaymentSource
  merchantOrderNo: string | null
  storeId: string | null
  storeName: string | null
  subject: string
  amount: AmountDecimal
  paidAmount: AmountDecimal | null
  channel: PaymentChannel
  method: PaymentMethod
  /** 网页视图状态（核心 PART_REFUNDED / REFUNDED 映射为 SUCCESS） */
  status: PaymentStatus
  /** 核心原始状态，便于排查 */
  coreStatus: string
  createdAt: string
  submittedAt: string | null
  paidAt: string | null
  closedAt: string | null
  failedAt: string | null
  failReason: string | null
  expireAt: string | null
  /** 展示用，不得用于判断能否退款 */
  refundedAmount: AmountDecimal
  /** 占用中的退款金额（CREATED + PROCESSING + SUSPENDED），展示用 */
  refundingAmount: AmountDecimal
  refundAggregate: RefundAggregateStatus
  refundCount: number
  refundPrincipalLimit: AmountDecimal | null
  availableRefundAmount: AmountDecimal | null
  refundEligibility: RefundEligibility | null
  collectionVerification: CollectionVerification | null
}

/**
 * 支付列表精简视图（协议 4.1a，portal-payment-list-view/0.1-draft）。
 * 与详情 Payment 独立：不含 paidAmount / submittedAt / closedAt / failedAt / failReason / refundCount，
 * 这些字段在核心列表投影交付前不出现在列表中，也不以 null / 0 / '' 占位。
 */
export interface PaymentListItem {
  id: string
  source: PaymentSource
  /** source=API 必为字符串；EXTERNAL 必为 null */
  merchantOrderNo: string | null
  /** 核心 storeCode（sto_ 业务编号） */
  storeId: string | null
  storeName: string | null
  /** source=API 必为字符串；EXTERNAL 可为 null（合法未知事实，页面占位仅用于渲染） */
  subject: string | null
  amount: AmountDecimal
  currency: 'CNY'
  channel: PaymentChannel
  method: PaymentMethod
  createdAt: string
  paidAt: string | null
  expireAt: string | null
  refundedAmount: AmountDecimal
  refundingAmount: AmountDecimal
  refundPrincipalLimit: AmountDecimal | null
  availableRefundAmount: AmountDecimal | null
  refundEligibility: RefundEligibility
  collectionVerification: CollectionVerification
  /** 网页视图状态：PART_REFUNDED / REFUNDED → SUCCESS */
  status: PaymentStatus
  coreStatus: string
  refundAggregate: RefundAggregateStatus
}

export const PAYMENT_LIST_VIEW_VERSION = 'portal-payment-list-view/0.1-draft'

/** 精确十进制计数字符串（uint64 语义，^(0|[1-9][0-9]{0,19})$），不得先转 Number */
export type ExactCount = string

export interface PaymentListPage {
  viewVersion: typeof PAYMENT_LIST_VIEW_VERSION
  items: PaymentListItem[]
  total: ExactCount
  page: number
  pageSize: number
  asOf: string
}

/** 支付详情视图（协议 3.1b / 037）：与列表项同一组 22 键，不含六个无来源字段 */
export const PAYMENT_DETAIL_VIEW_VERSION = 'portal-payment-detail-view/0.1-draft'
export type PaymentDetailItem = PaymentListItem
export interface PaymentDetailView {
  viewVersion: typeof PAYMENT_DETAIL_VIEW_VERSION
  payment: PaymentDetailItem
  asOf: string
}

/* ---------- 038 资源精简视图（协议 3.8） ---------- */

export const MERCHANT_PROFILE_VIEW_VERSION = 'portal-merchant-profile-view/0.1-draft'
export const STORE_VIEW_VERSION = 'portal-store-view/0.1-draft'
export const APP_VIEW_VERSION = 'portal-app-view/0.1-draft'
export const REFUND_VIEW_VERSION = 'portal-refund-view/0.1-draft'

/** 列表包装：恰好 6 键；total 为非负安全整数 */
export interface ViewPage<V extends string, T> {
  viewVersion: V
  items: T[]
  total: number
  page: number
  pageSize: number
  asOf: string
}

export type MerchantStatus = Open<'ACTIVE' | 'DISABLED' | 'CLOSED'>
export interface MerchantProfile {
  merchantNo: string
  name: string
  status: MerchantStatus
  createdAt: string
}
export interface MerchantProfileView {
  viewVersion: typeof MERCHANT_PROFILE_VIEW_VERSION
  merchant: MerchantProfile
  asOf: string
}

export type StoreViewStatus = Open<'ACTIVE' | 'DISABLED' | 'CLOSED'>
export interface StoreView {
  id: string
  storeNo: string
  /** 可为 null：核心无此值 */
  merchantStoreNo: string | null
  name: string
  status: StoreViewStatus
  createdAt: string
}
export interface StoreViewSingle {
  viewVersion: typeof STORE_VIEW_VERSION
  store: StoreView
  asOf: string
}
export type StoreViewPage = ViewPage<typeof STORE_VIEW_VERSION, StoreView>

export type AppViewStatus = Open<'ACTIVE' | 'DISABLED' | 'REVOKED'>
export interface AppView {
  id: string
  appId: string
  name: string
  env: Open<AppEnv>
  status: AppViewStatus
  createdAt: string
}
export interface AppViewSingle {
  viewVersion: typeof APP_VIEW_VERSION
  app: AppView
  asOf: string
}
export type AppViewPage = ViewPage<typeof APP_VIEW_VERSION, AppView>
export interface AppQuery {
  page?: number
  pageSize?: number
  sortBy?: 'createdAt'
  sortOrder?: SortOrder
}

export interface RefundView {
  id: string
  /** 可为 null（如非经本门户创建的退款） */
  merchantRefundNo: string | null
  paymentId: string
  storeId: string | null
  storeName: string | null
  amount: AmountDecimal
  status: RefundStatus
  reason: string | null
  createdAt: string
  /** SUCCESS→refundSuccessAt，FAILED→failedAt，CLOSED→closedAt；其他状态 null，来源为空也为 null */
  finishedAt: string | null
}
export interface RefundViewSingle {
  viewVersion: typeof REFUND_VIEW_VERSION
  refund: RefundView
  asOf: string
}
export type RefundViewPage = ViewPage<typeof REFUND_VIEW_VERSION, RefundView>

export interface RefundProgressEvent {
  status: RefundStatus
  at: string
  note?: string
}

export interface Refund {
  id: string
  merchantRefundNo: string
  paymentId: string
  merchantOrderNo: string | null
  storeId: string | null
  storeName: string | null
  channel: PaymentChannel
  amount: AmountDecimal
  status: RefundStatus
  reason: string
  createdAt: string
  updatedAt: string
  finishedAt: string | null
  failReason: string | null
  progress: RefundProgressEvent[]
}

/**
 * 核心 merchant_event Schema 的 eventType（7 个，含 REFUND.SUSPENDED）。
 * 【待核对】完整取值以锁定 Schema 为准；当前列表为 Mock 演示值。
 */
export type KnownWebhookEventType =
  | 'PAYMENT.SUCCEEDED'
  | 'PAYMENT.FAILED'
  | 'PAYMENT.CLOSED'
  | 'REFUND.SUCCEEDED'
  | 'REFUND.FAILED'
  | 'REFUND.CLOSED'
  | 'REFUND.SUSPENDED'
export type WebhookEventType = Open<KnownWebhookEventType>

export type WebhookDeliveryStatus = Open<'SUCCESS' | 'FAILED' | 'RETRYING'>

export interface WebhookAttempt {
  attempt: number
  at: string
  httpStatus: number | null
  durationMs: number
  result: 'SUCCESS' | 'FAILED'
  errorSummary: string | null
}

export interface WebhookDelivery {
  id: string
  eventId: string
  eventType: WebhookEventType
  resourceType: 'payment' | 'refund'
  resourceId: string
  appId: string
  url: string
  status: WebhookDeliveryStatus
  attempts: number
  lastAttemptAt: string
  nextRetryAt: string | null
  attemptLog: WebhookAttempt[]
  /** 测试投递标识，不写入正式事件 Schema */
  isTest: boolean
}

export type ApiKeyStatus = 'ACTIVE' | 'PENDING' | 'EXPIRING' | 'REVOKED' | 'EXPIRED'

export interface ApiKey {
  id: string
  keyId: string
  appId: string
  status: ApiKeyStatus
  maskedSecret: string
  createdAt: string
  effectiveAt: string
  expireAt: string | null
  lastUsedAt: string | null
}

export interface CreatedApiKey extends ApiKey {
  /** 仅在创建成功的响应中返回一次 */
  plainSecret: string
}

export interface WebhookConfig {
  appId: string
  url: string
  enabled: boolean
  events: WebhookEventType[]
  /** 从未配置为 null */
  updatedAt: string | null
}

export interface CurrentUser {
  id: string
  name: string
  email: string
  phone: string
  /** 仅用于展示，不得据此推导授权 */
  role: string
  lastLoginAt: string
  lastLoginIp: string
}

export interface Captcha {
  captchaId: string
  /** 验证码图片，data URL（image/svg+xml 或 image/png） */
  image: string
  /** 有效期，秒 */
  expiresIn: number
}

export interface LoginInput {
  /** 登录邮箱或手机号 */
  account: string
  password: string
  captchaId: string
  captchaCode: string
}

export interface AuthTokens {
  tokenType: 'Bearer'
  accessToken: string
  /** access token 有效期，秒 */
  expiresIn: number
  refreshToken: string
  /** refresh token 有效期，秒 */
  refreshExpiresIn: number
}

/** 第一步（POST /auth/login）结果：仅表示凭据已验证，尚未建立正式登录 */
export interface MerchantSelection {
  /** 一次性选择凭证：只留在当前页面内存，不得持久化或写入 URL/日志 */
  selectionToken: string
  /** UTC epoch 毫秒（不是 expiresIn 秒） */
  expiresAt: number
  /** 可选商户标识；当前契约只有 ID，没有名称/Logo */
  tenantIds: string[]
}

export interface SelectMerchantInput {
  selectionToken: string
  tenantId: string
}

/** 第二步（POST /auth/select-merchant）结果：正式 token 绑定所选商户 */
export interface LoginResult extends AuthTokens {
  user: CurrentUser
}

export interface LoginSession {
  id: string
  device: string
  browser: string
  ip: string
  location: string
  lastActiveAt: string
  current: boolean
}

export interface Notification {
  id: string
  title: string
  description: string
  createdAt: string
  read: boolean
  level: 'info' | 'warning' | 'danger'
  link?: string
}

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export type SortOrder = 'asc' | 'desc'

export interface PageQuery {
  page?: number
  pageSize?: number
  sortBy?: string
  sortOrder?: SortOrder
}

export interface PaymentQuery extends PageQuery {
  paymentId?: string
  merchantOrderNo?: string
  storeId?: string
  channel?: PaymentChannel
  method?: PaymentMethod
  status?: PaymentStatus
  createdFrom?: string
  createdTo?: string
  paidFrom?: string
  paidTo?: string
}

export interface RefundQuery extends PageQuery {
  refundId?: string
  merchantRefundNo?: string
  paymentId?: string
  storeId?: string
  status?: RefundStatus
  createdFrom?: string
  createdTo?: string
}

export interface StoreQuery extends PageQuery {
  keyword?: string
  status?: StoreViewStatus
}

export interface WebhookDeliveryQuery extends PageQuery {
  keyword?: string
  eventType?: WebhookEventType
  status?: WebhookDeliveryStatus
}

export interface StoreInput {
  name: string
  merchantStoreNo: string
  address: string
  contactName: string
  contactPhone: string
  status: StoreStatus
}

export interface CreateRefundInput {
  paymentId: string
  /** 输入格式：0~2 位小数的元字符串 */
  amount: string
  merchantRefundNo: string
  reason: string
}

export interface RefundableInfo {
  paymentId: string
  paymentAmount: AmountDecimal
  refundedAmount: AmountDecimal
  refundingAmount: AmountDecimal
  refundPrincipalLimit: AmountDecimal | null
  /** 权威可退金额；未知为 null */
  refundableAmount: AmountDecimal | null
  refundEligibility: RefundEligibility | null
  ineligibleReason: string | null
  asOf: string
}

/** 统计比较值：分母为 0 时为 null，展示为“—” */
export type CompareValue = number | null

/* ---------- 工作台 / 门店选项视图（HTTP 接入第一阶段） ---------- */

export const DASHBOARD_SUMMARY_VIEW_VERSION = 'merchant-dashboard-summary/1-draft'
export const RECENT_PAYMENTS_VIEW_VERSION = 'portal-recent-payments-view/0.1-draft'
export const STORE_OPTIONS_VIEW_VERSION = 'portal-store-options-view/0.1-draft'

/** 报表指标：金额与计数均为十进制字符串，保留后端精度，不转 Number 参与计算 */
export interface ReportMetrics {
  successAmount: AmountDecimal
  successCount: ExactCount
  refundAmount: AmountDecimal
  refundCount: ExactCount
  totalCount: ExactCount
  terminalCount: ExactCount
  createdSuccessCount: ExactCount
}

/** 后端展示字段：派生值只读后端结果，前端不自行计算；null 表示不可比较/不可计算 */
export type ReportPresentation = Record<string, string | null>

export interface DashboardPeriod {
  /** 营业日 YYYY-MM-DD */
  date: string
  fromInclusive: string
  toExclusive: string
  metrics: ReportMetrics
}

export interface DashboardSummaryView {
  viewVersion: typeof DASHBOARD_SUMMARY_VIEW_VERSION
  asOf: string
  timezone: string
  /** 历史数据覆盖起点；null 表示后端未声明 */
  coverageStart: string | null
  current: DashboardPeriod
  previous: DashboardPeriod
  /** totalCount 为两个 uint64 之和，上限 2 × UINT64_MAX，不能按单个 ExactCount 校验或格式化 */
  processing: { payingCount: ExactCount; refundProcessingCount: ExactCount; totalCount: string }
  presentation: ReportPresentation
}

export interface RecentPaymentsView {
  viewVersion: typeof RECENT_PAYMENTS_VIEW_VERSION
  items: PaymentListItem[]
  asOf: string
}

export interface StoreOption {
  id: string
  storeNo: string
  merchantStoreNo: string | null
  name: string
  status: StoreViewStatus
}

export interface StoreOptionsView {
  viewVersion: typeof STORE_OPTIONS_VIEW_VERSION
  items: StoreOption[]
  /** JSON 非负安全整数（Portal 取自 items.length，0–100），不是精确计数字符串 */
  total: number
  /** false 表示只返回了部分门店，筛选器需提示不完整 */
  complete: boolean
  asOf: string
}

export interface DashboardSummary {
  asOf: string
  todaySuccessAmount: AmountDecimal
  todaySuccessCount: number
  todayRefundAmount: AmountDecimal
  todayRefundCount: number
  todayTotalCount: number
  todayTerminalCount: number
  todayCreatedSuccessCount: number
  todaySuccessRate: number
  processingCount: number
  compare: {
    successAmount: CompareValue
    successCount: CompareValue
    refundAmount: CompareValue
    refundCount: CompareValue
    successRate: CompareValue
  }
}

/** 集合 P（成功金额/笔数）、R（退款）、C（总数/终态/成功率）分开计算，见协议 5.1 */
export interface StatMetrics {
  successAmount: AmountDecimal
  successCount: number
  refundAmount: AmountDecimal
  refundCount: number
  totalCount: number
  terminalCount: number
  createdSuccessCount: number
  successRate: number
}

export interface TrendPoint extends StatMetrics {
  /** YYYY-MM-DD，唯一 key */
  date: string
}

export interface TrendReport {
  asOf: string
  points: TrendPoint[]
}

export interface ChannelShare {
  channel: PaymentChannel
  amount: AmountDecimal
  count: number
}

export interface ChannelShareReport {
  asOf: string
  items: ChannelShare[]
}

export * from './report'

export type Granularity = 'day' | 'week' | 'month'

export interface AnalyticsQuery {
  from: string
  to: string
  granularity: Granularity
  storeId?: string
  channel?: PaymentChannel
}

export interface AnalyticsTotals extends StatMetrics {
  avgAmount: AmountDecimal
}

export interface AnalyticsBucket extends AnalyticsTotals {
  /** 唯一完整日期 key（day/week: YYYY-MM-DD，month: YYYY-MM） */
  key: string
  start: string
  end: string
  /** 仅用于展示 */
  label: string
}

export interface AnalyticsResult {
  asOf: string
  totals: AnalyticsTotals
  buckets: AnalyticsBucket[]
  byChannel: ChannelShare[]
  byStore: { storeId: string; storeName: string; amount: AmountDecimal; count: number }[]
}

export interface StoreStats {
  asOf: string
  last30Amount: AmountDecimal
  last30Count: number
  last30RefundAmount: AmountDecimal
  successRate: number
  trend: TrendPoint[]
}

export const GLOBAL_SEARCH_VIEW_VERSION = 'portal-global-search-view/0.1-draft'

export const SEARCH_GROUP_TYPES = ['payment', 'refund', 'store'] as const
export type SearchGroupType = (typeof SEARCH_GROUP_TYPES)[number]

/** OK：已检索；NOT_AUTHORIZED：无权限；NOT_APPLICABLE：关键词不适用于该类型 */
export const SEARCH_GROUP_STATES = ['OK', 'NOT_AUTHORIZED', 'NOT_APPLICABLE'] as const
export type SearchGroupState = (typeof SEARCH_GROUP_STATES)[number]

export interface GlobalSearchItem {
  type: SearchGroupType
  id: string
  title: string
  /** 站内路径，必须以单个 / 开头 */
  to: string
}

export interface GlobalSearchGroup {
  type: SearchGroupType
  state: SearchGroupState
  items: GlobalSearchItem[]
  hasMore: boolean
  asOf: string
}

export interface GlobalSearchView {
  viewVersion: typeof GLOBAL_SEARCH_VIEW_VERSION
  groups: GlobalSearchGroup[]
}
