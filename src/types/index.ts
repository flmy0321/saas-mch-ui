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

export type AppStatus = 'ACTIVE' | 'DISABLED'

export interface MerchantApp {
  id: string
  appId: string
  name: string
  description: string
  env: AppEnv
  status: AppStatus
  createdAt: string
  permissions: string[]
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

export interface Merchant {
  merchantNo: string
  name: string
  shortName: string
  status: 'ACTIVE' | 'RESTRICTED'
  legalName: string
  creditCode: string
  industry: string
  contactEmail: string
  contactPhone: string
  address: string
  createdAt: string
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
  status?: StoreStatus
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

export interface GlobalSearchResult {
  type: 'payment' | 'refund' | 'store'
  id: string
  title: string
  subtitle: string
  to: string
}
