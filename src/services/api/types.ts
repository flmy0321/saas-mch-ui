import type {
  AnalyticsQuery,
  AnalyticsResult,
  ApiKey,
  AuthTokens,
  Captcha,
  ChannelShareReport,
  CreateRefundInput,
  CreatedApiKey,
  CurrentUser,
  DashboardSummary,
  GlobalSearchResult,
  LoginInput,
  LoginResult,
  LoginSession,
  Merchant,
  MerchantSelection,
  SelectMerchantInput,
  MerchantApp,
  Notification,
  Paginated,
  PaymentListPage,
  Payment,
  PaymentQuery,
  Refund,
  RefundQuery,
  RefundableInfo,
  Store,
  StoreInput,
  StoreQuery,
  StoreStats,
  TrendReport,
  WebhookConfig,
  WebhookDelivery,
  WebhookDeliveryQuery,
} from '@/types'

/**
 * 商户后台网页接口契约（协议 v1.4 候选草案）。
 * Mock 实现与未来的真实 HTTP 实现都必须满足该接口，页面只依赖此接口。
 */
export interface MerchantApi {
  /**
   * 身份接口（identity-http v0.2，Base URL /api/portal/v1）：captcha / login / selectMerchant / refresh 无需 Authorization；
   * logout 携带当前 access 的 Bearer 头。auth.* 均不套业务自动刷新包装。
   */
  auth: {
    captcha(): Promise<Captcha>
    /** 第一步：只验证凭据，返回商户选择；不得据此保存 token 或进入工作台 */
    login(input: LoginInput): Promise<MerchantSelection>
    /** 第二步：显式选择商户后才建立正式会话 */
    selectMerchant(input: SelectMerchantInput): Promise<LoginResult>
    /** 一次性：并发时仅一个成功，其余 409 REFRESH_ALREADY_USED（不撤销赢家） */
    refresh(refreshToken: string): Promise<AuthTokens>
    /** 幂等 204；accessToken 作为 Bearer 头 */
    logout(accessToken: string): Promise<void>
  }
  dashboard: {
    summary(): Promise<DashboardSummary>
    trend(days: number): Promise<TrendReport>
    channelShare(days: number): Promise<ChannelShareReport>
    recentPayments(limit: number): Promise<Payment[]>
  }
  payments: {
    /** 精简列表视图（协议 4.1a），不复用详情 Payment */
    list(query: PaymentQuery): Promise<PaymentListPage>
    get(id: string): Promise<Payment>
    refundable(id: string): Promise<RefundableInfo>
    exportCsv(query: PaymentQuery): Promise<{ filename: string; rows: number; content: string }>
  }
  refunds: {
    list(query: RefundQuery): Promise<Paginated<Refund>>
    get(id: string): Promise<Refund>
    /** 资金写操作：结果须经 classifyRefundWrite 分类，不得把 resolve 直接当作成功 */
    create(input: CreateRefundInput): Promise<unknown>
    /** 在 paymentId 确定的幂等作用域内精确匹配（R4）；找不到抛 404 NOT_FOUND */
    findByMerchantRefundNo(paymentId: string, merchantRefundNo: string): Promise<Refund>
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

/** 资金写错误响应中的结果确定性（协议 1.3） */
export type WriteOutcome = 'REJECTED' | 'NOT_ACCEPTED' | 'UNKNOWN'

export interface ApiErrorInit {
  /** HTTP 状态；0 表示未收到 HTTP 响应 */
  httpStatus?: number
  /** 原始 outcome 字段（可能缺失或为未列出的值，分类时再判定） */
  outcome?: unknown
  requestId?: string | null
  /** 精确查询 404 时的 authoritative 标识 */
  authoritative?: boolean
}

/** 保留 HTTP 状态、code、outcome、requestId 的接口错误（协议 5.0 第 4 条） */
export class ApiError extends Error {
  httpStatus: number
  outcome: unknown
  requestId: string | null
  authoritative: boolean | undefined

  constructor(
    message: string,
    public code: string = 'UNKNOWN',
    init: ApiErrorInit = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.httpStatus = init.httpStatus ?? 0
    this.outcome = init.outcome
    this.requestId = init.requestId ?? null
    this.authoritative = init.authoritative
  }
}

/** 仅 HTTP 401 且 code === UNAUTHENTICATED 触发刷新重试 */
export const isSessionUnauthenticated = (e: unknown): boolean =>
  e instanceof ApiError && e.httpStatus === 401 && e.code === 'UNAUTHENTICATED'
