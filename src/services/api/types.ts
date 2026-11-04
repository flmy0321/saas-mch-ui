import type {
  AnalyticsQuery,
  AnalyticsResult,
  ApiKey,
  AuthTokens,
  Captcha,
  ChannelShare,
  CreateRefundInput,
  CreatedApiKey,
  CurrentUser,
  DashboardSummary,
  GlobalSearchResult,
  LoginInput,
  LoginResult,
  LoginSession,
  Merchant,
  MerchantApp,
  Notification,
  Paginated,
  Payment,
  PaymentQuery,
  Refund,
  RefundQuery,
  RefundableInfo,
  Store,
  StoreInput,
  StoreQuery,
  StoreStats,
  TrendPoint,
  WebhookConfig,
  WebhookDelivery,
  WebhookDeliveryQuery,
} from '@/types'

/**
 * 商户后台 API 契约。
 * Mock 实现与未来的真实 HTTP 实现都必须满足该接口，页面只依赖此接口。
 */
export interface MerchantApi {
  /** 认证接口：captcha / login / refresh 无需 Authorization 头；logout 需携带当前 access token */
  auth: {
    captcha(): Promise<Captcha>
    login(input: LoginInput): Promise<LoginResult>
    refresh(refreshToken: string): Promise<AuthTokens>
    logout(refreshToken: string): Promise<void>
  }
  dashboard: {
    summary(): Promise<DashboardSummary>
    trend(days: number): Promise<TrendPoint[]>
    channelShare(days: number): Promise<ChannelShare[]>
    recentPayments(limit: number): Promise<Payment[]>
  }
  payments: {
    list(query: PaymentQuery): Promise<Paginated<Payment>>
    get(id: string): Promise<Payment>
    refundable(id: string): Promise<RefundableInfo>
    exportCsv(query: PaymentQuery): Promise<{ filename: string; rows: number; content: string }>
  }
  refunds: {
    list(query: RefundQuery): Promise<Paginated<Refund>>
    get(id: string): Promise<Refund>
    create(input: CreateRefundInput): Promise<Refund>
  }
  analytics: {
    query(q: AnalyticsQuery): Promise<AnalyticsResult>
  }
  stores: {
    list(query: StoreQuery): Promise<Paginated<Store>>
    all(): Promise<Store[]>
    get(id: string): Promise<Store>
    stats(id: string): Promise<StoreStats>
    create(input: StoreInput): Promise<Store>
    update(id: string, input: StoreInput): Promise<Store>
  }
  apps: {
    list(): Promise<MerchantApp[]>
    get(appId: string): Promise<MerchantApp>
  }
  keys: {
    list(appId?: string): Promise<ApiKey[]>
    create(appId: string): Promise<CreatedApiKey>
    rotate(id: string): Promise<CreatedApiKey>
    revoke(id: string): Promise<ApiKey>
  }
  webhooks: {
    getConfig(appId: string): Promise<WebhookConfig>
    updateConfig(appId: string, input: Pick<WebhookConfig, 'url' | 'enabled' | 'events'>): Promise<WebhookConfig>
    sendTest(appId: string): Promise<{ httpStatus: number; durationMs: number }>
    deliveries(query: WebhookDeliveryQuery): Promise<Paginated<WebhookDelivery>>
    deliveriesFor(resourceId: string): Promise<WebhookDelivery[]>
  }
  account: {
    merchant(): Promise<Merchant>
    me(): Promise<CurrentUser>
    updateMe(input: Pick<CurrentUser, 'name'>): Promise<CurrentUser>
    changePassword(input: { current: string; next: string }): Promise<void>
    sessions(): Promise<LoginSession[]>
    revokeSession(id: string): Promise<void>
    notifications(): Promise<Notification[]>
    markAllRead(): Promise<void>
  }
  search(keyword: string): Promise<GlobalSearchResult[]>
}

export class ApiError extends Error {
  constructor(
    message: string,
    public code: string = 'UNKNOWN',
  ) {
    super(message)
    this.name = 'ApiError'
  }
}
