/** 金额在数据层统一以「分」为整数传输，展示层统一转换为人民币元。 */
export type AmountFen = number

export type AppEnv = 'production' | 'sandbox'

export type PaymentStatus = 'CREATED' | 'PAYING' | 'CLOSING' | 'SUCCESS' | 'FAILED' | 'CLOSED'
export type RefundStatus = 'CREATED' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'CLOSED' | 'SUSPENDED'
/** 退款聚合状态：与支付状态相互独立，仅描述该笔已成功支付订单的退款情况 */
export type RefundAggregateStatus = 'NONE' | 'PARTIAL' | 'FULL'

export type PaymentChannel = 'WECHAT' | 'ALIPAY' | 'UNIONPAY'
export type PaymentMethod = 'NATIVE' | 'JSAPI' | 'MINI_PROGRAM' | 'H5' | 'APP' | 'MICROPAY'

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
  merchantOrderNo: string
  storeId: string
  storeName: string
  subject: string
  amount: AmountFen
  paidAmount: AmountFen | null
  channel: PaymentChannel
  method: PaymentMethod
  status: PaymentStatus
  createdAt: string
  submittedAt: string | null
  paidAt: string | null
  closedAt: string | null
  failedAt: string | null
  failReason: string | null
  expireAt: string
  refundedAmount: AmountFen
  refundingAmount: AmountFen
  refundAggregate: RefundAggregateStatus
  refundCount: number
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
  merchantOrderNo: string
  storeId: string
  storeName: string
  channel: PaymentChannel
  amount: AmountFen
  status: RefundStatus
  reason: string
  createdAt: string
  updatedAt: string
  finishedAt: string | null
  failReason: string | null
  progress: RefundProgressEvent[]
}

export type WebhookEventType =
  | 'payment.succeeded'
  | 'payment.failed'
  | 'payment.closed'
  | 'refund.succeeded'
  | 'refund.failed'
  | 'refund.closed'

export type WebhookDeliveryStatus = 'SUCCESS' | 'FAILED' | 'RETRYING'

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
  updatedAt: string
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
  amount: AmountFen
  merchantRefundNo: string
  reason: string
}

export interface RefundableInfo {
  paymentId: string
  paymentAmount: AmountFen
  refundedAmount: AmountFen
  refundingAmount: AmountFen
  refundableAmount: AmountFen
}

export interface DashboardSummary {
  todaySuccessAmount: AmountFen
  todaySuccessCount: number
  todayRefundAmount: AmountFen
  todayRefundCount: number
  todaySuccessRate: number
  processingCount: number
  compare: {
    successAmount: number
    successCount: number
    refundAmount: number
    refundCount: number
    successRate: number
  }
}

export interface TrendPoint {
  date: string
  successAmount: AmountFen
  successCount: number
  refundAmount: AmountFen
  refundCount: number
  totalCount: number
  successRate: number
}

export interface ChannelShare {
  channel: PaymentChannel
  amount: AmountFen
  count: number
}

export type Granularity = 'day' | 'week' | 'month'

export interface AnalyticsQuery {
  from: string
  to: string
  granularity: Granularity
  storeId?: string
  channel?: PaymentChannel
}

export interface AnalyticsBucket {
  label: string
  successAmount: AmountFen
  successCount: number
  refundAmount: AmountFen
  refundCount: number
  totalCount: number
  successRate: number
  avgAmount: AmountFen
}

export interface AnalyticsResult {
  totals: Omit<AnalyticsBucket, 'label'>
  buckets: AnalyticsBucket[]
  byChannel: ChannelShare[]
  byStore: { storeId: string; storeName: string; amount: AmountFen; count: number }[]
}

export interface StoreStats {
  last30Amount: AmountFen
  last30Count: number
  last30RefundAmount: AmountFen
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
