import type { Ref } from 'vue'
import { readPercent } from '@/utils/report'
import type { ReportPoint, ReportPresentation, ReportingNotReadyCode } from '@/types'
import { REPORTING_NOT_READY_CODES } from '@/types'

const NOT_READY_TEXT: Record<ReportingNotReadyCode, string> = {
  REPORTING_DAY_INCOMPLETE: '所选范围包含尚未结束的营业日，报表只统计已完成的营业日，请调整日期后重试',
  REPORTING_HISTORY_NOT_READY: '历史报表尚未生成完成，暂无法展示，请稍后重试',
  REPORTING_DATA_NOT_READY: '报表数据仍在汇总中，暂无法展示，请稍后重试',
  REPORTING_DATA_STALE: '报表数据尚未同步到最新，为避免展示过期数据已暂停显示，请稍后重试',
}

export function isReportingNotReady(code: string | null | undefined): code is ReportingNotReadyCode {
  return !!code && (REPORTING_NOT_READY_CODES as readonly string[]).includes(code)
}

/** 未就绪状态返回专用说明，其他错误沿用后端消息；页面统一配合重试按钮展示 */
export function reportErrorText(state: { error: Ref<string | null>; errorCode: Ref<string | null> }): string | null {
  const code = state.errorCode.value
  if (isReportingNotReady(code)) return NOT_READY_TEXT[code]
  return state.error.value
}

/** 后端成功率百分比字符串（如 "98.50"）；null 表示不可计算 */
export function successRateText(p: ReportPresentation | undefined): string {
  if (!p) return '不可计算'
  const v = readPercent(p, 'successRatePercent')
  return v === null ? '不可计算' : `${v}%`
}

/** 后端笔均金额；缺失或 null 表示不可计算 */
export function averageAmount(p: ReportPresentation | undefined): string | null {
  const v = p?.averageAmount
  return typeof v === 'string' ? v : null
}

/** 仅用于图表绘制：把精确字符串换成 Number。精度展示仍读原字符串 */
export function chartPoint(label: string, p: { metrics: ReportPoint['metrics']; presentation: ReportPresentation }) {
  const rate = readPercent(p.presentation, 'successRatePercent')
  return {
    label,
    successAmount: p.metrics.successAmount,
    refundAmount: p.metrics.refundAmount,
    successCount: Number(p.metrics.successCount),
    successRatePercent: rate === null ? null : Number(rate),
  }
}

export const dateLabel = (ymd: string) => ymd.slice(5).replace('-', '/')
