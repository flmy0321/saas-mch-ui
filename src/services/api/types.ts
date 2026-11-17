import type {
  CommandReply,
  ConfigurationVersion,
  KeyCommandApplied,
  KeyCommandOperation,
  StoreCommandApplied,
  StoreCommandInput,
  StoreCommandOperation,
  StoreEditView,
  WebhookCommandApplied,
  WebhookEditView,
  WebhookTestResult,
} from '@/types/command'
import type {
  AnalyticsQuery,
  AnalyticsView,
  ChannelShareView,
  ReportWindowDays,
  StoreStatsView,
  TrendView,
  ApiKey,
  ApiKeyQuery,
  DeveloperPage,
  AuthTokens,
  Captcha,
  CreateRefundInput,
  CurrentUser,
  DashboardSummaryView,
  RecentPaymentsView,
  StoreOption,
  StoreOptionsView,
  GlobalSearchView,
  LoginInput,
  LoginResult,
  LoginSession,
  AppQuery,
  AppViewPage,
  AppViewSingle,
  MerchantProfileView,
  PaymentDetailView,
  RefundViewPage,
  RefundViewSingle,
  StoreViewPage,
  StoreViewSingle,
  MerchantSelection,
  SelectMerchantInput,
  Notification,
  PageQuery,
  PaymentListPage,
  PaymentQuery,
  RefundQuery,
  RefundableInfo,
  StoreQuery,
  WebhookConfig,
  WebhookConfigView,
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
    summary(): Promise<DashboardSummaryView>
    trend(days: ReportWindowDays): Promise<TrendView>
    channelShare(days: ReportWindowDays): Promise<ChannelShareView>
    recentPayments(limit: number): Promise<RecentPaymentsView>
  }
  payments: {
    /** 精简列表视图（协议 4.1a），不复用详情 Payment */
    list(query: PaymentQuery): Promise<PaymentListPage>
    /** 详情视图（协议 3.1b / 037）：22 键，不含六个无来源字段 */
    get(id: string): Promise<PaymentDetailView>
    refundable(id: string): Promise<RefundableInfo>
    exportCsv(query: PaymentQuery): Promise<{ filename: string; rows: number; content: string }>
  }
  refunds: {
    list(query: RefundQuery): Promise<RefundViewPage>
    get(id: string): Promise<RefundViewSingle>
    /** 资金写操作：结果须经 classifyRefundWrite 分类，不得把 resolve 直接当作成功 */
    create(input: CreateRefundInput): Promise<unknown>
    /** 协议 3.8.4：两个请求键必须同时匹配；找不到统一 404 NOT_FOUND，不带 authoritative */
    findByMerchantRefundNo(paymentId: string, merchantRefundNo: string): Promise<RefundViewSingle>
  }
  analytics: {
    /** 按已完成营业日查询；未就绪时抛 REPORTING_* 错误码 */
    query(q: AnalyticsQuery): Promise<AnalyticsView>
  }
  stores: {
    list(query: StoreQuery): Promise<StoreViewPage>
    /** 门店选项视图原文（含 complete 标识） */
    options(): Promise<StoreOptionsView>
    /** 解包 options().items，供登录后加载与各页门店筛选使用 */
    all(): Promise<StoreOption[]>
    get(id: string): Promise<StoreViewSingle>
    /** storeCode 为核心门店编号（Store.id，与交易 storeId 同值）；窗口为最近 30 个已完成营业日 */
    stats(storeCode: string): Promise<StoreStatsView>
    /** storeCode = Store.id */
    editView(storeCode: string): Promise<StoreEditView>
    create(commandId: string, input: StoreCommandInput): Promise<CommandReply<StoreCommandApplied>>
    update(
      commandId: string,
      storeCode: string,
      expectedConfigurationVersion: ConfigurationVersion,
      input: StoreCommandInput,
    ): Promise<CommandReply<StoreCommandApplied>>
    lookupCommand(
      commandId: string,
      q: { operation: StoreCommandOperation; storeCode?: string },
    ): Promise<CommandReply<StoreCommandApplied>>
  }
  apps: {
    /** 分页视图（协议 3.8.3），不承诺跨页快照一致 */
    list(query: AppQuery): Promise<AppViewPage>
    get(appId: string): Promise<AppViewSingle>
  }
  keys: {
    list(query: ApiKeyQuery): Promise<DeveloperPage<ApiKey>>
    create(commandId: string, appId: string): Promise<CommandReply<KeyCommandApplied>>
    rotate(commandId: string, appId: string, keyId: string): Promise<CommandReply<KeyCommandApplied>>
    revoke(commandId: string, appId: string, keyId: string): Promise<CommandReply<KeyCommandApplied>>
    lookupCommand(
      commandId: string,
      q: { appId: string; operation: KeyCommandOperation; keyId?: string },
    ): Promise<CommandReply<KeyCommandApplied>>
  }
  webhooks: {
    getConfig(appId: string): Promise<WebhookConfigView>
    editView(appId: string): Promise<WebhookEditView>
    updateConfig(
      commandId: string,
      appId: string,
      expectedConfigurationVersion: ConfigurationVersion,
      input: Pick<WebhookConfig, 'url' | 'enabled'>,
    ): Promise<CommandReply<WebhookCommandApplied>>
    lookupSave(commandId: string, appId: string): Promise<CommandReply<WebhookCommandApplied>>
    sendTest(commandId: string, appId: string): Promise<CommandReply<WebhookTestResult>>
    lookupTest(commandId: string, appId: string): Promise<CommandReply<WebhookTestResult>>
    deliveries(query: WebhookDeliveryQuery): Promise<DeveloperPage<WebhookDelivery>>
    deliveriesFor(resourceId: string, query?: PageQuery): Promise<DeveloperPage<WebhookDelivery>>
  }
  account: {
    merchant(): Promise<MerchantProfileView>
    me(): Promise<CurrentUser>
    updateMe(input: Pick<CurrentUser, 'name'>): Promise<CurrentUser>
    changePassword(input: { current: string; next: string }): Promise<void>
    sessions(): Promise<LoginSession[]>
    revokeSession(id: string): Promise<void>
    notifications(): Promise<Notification[]>
    markAllRead(): Promise<void>
  }
  search(keyword: string): Promise<GlobalSearchView>
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
