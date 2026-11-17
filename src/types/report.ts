import type { AmountDecimal, ExactCount, ReportMetrics, ReportPresentation } from './index'

/** 已完成营业日报表：趋势、渠道占比、经营分析、门店统计共用同一视图版本 */
export const COMPLETED_REPORT_VIEW_VERSION = 'merchant-completed-report/1-draft'

/** 趋势与渠道占比只支持 7 或 30 天 */
export const REPORT_WINDOW_DAYS = [7, 30] as const
export type ReportWindowDays = (typeof REPORT_WINDOW_DAYS)[number]

/** 报表数据未就绪类错误码：不得展示为零交易，需保留重试入口 */
export const REPORTING_NOT_READY_CODES = [
  'REPORTING_DAY_INCOMPLETE',
  'REPORTING_HISTORY_NOT_READY',
  'REPORTING_DATA_NOT_READY',
  'REPORTING_DATA_STALE',
] as const
export type ReportingNotReadyCode = (typeof REPORTING_NOT_READY_CODES)[number]

export interface CompletedReportBase {
  viewVersion: typeof COMPLETED_REPORT_VIEW_VERSION
  asOf: string
  timezone: string
  coverageStart: string | null
  /** 已完成营业日窗口，闭区间 YYYY-MM-DD */
  fromDate: string
  toDate: string
}

export interface ReportPoint {
  date: string
  metrics: ReportMetrics
  presentation: ReportPresentation
}

export interface TrendView extends CompletedReportBase {
  points: ReportPoint[]
}

export interface ChannelAmountItem {
  /** 开放字符串：未知渠道按原值展示 */
  channel: string
  amount: AmountDecimal
  count: ExactCount
}

export interface ChannelShareView extends CompletedReportBase {
  items: ChannelAmountItem[]
}

export interface AnalyticsPeriodView {
  fromDate: string
  toDate: string
  metrics: ReportMetrics
}

export interface AnalyticsBucketView {
  key: string
  fromDate: string
  toDate: string
  metrics: ReportMetrics
  presentation: ReportPresentation
}

export interface StoreAmountItem {
  /** null：交易未关联门店，或门店不在目录中 */
  storeCode: string | null
  amount: AmountDecimal
  count: ExactCount
}

/** OBSERVED_ONLY：byStore 只含有交易的门店，没出现的门店不代表零交易 */
export const DIRECTORY_MODE_OBSERVED_ONLY = 'OBSERVED_ONLY'

export interface AnalyticsView extends CompletedReportBase {
  granularity: 'day' | 'week' | 'month'
  current: AnalyticsPeriodView
  previous: AnalyticsPeriodView
  presentation: ReportPresentation
  buckets: AnalyticsBucketView[]
  byChannel: ChannelAmountItem[]
  byStore: StoreAmountItem[]
  directoryMode: string
}

export interface StoreStatsView extends CompletedReportBase {
  storeId: string
  metrics: ReportMetrics
  presentation: ReportPresentation
  points: ReportPoint[]
}
