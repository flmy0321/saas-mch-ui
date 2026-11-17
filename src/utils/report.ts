import type { ReportPresentation } from '@/types'

/**
 * presentation 中相对变化字段的键名。值为百分比十进制字符串（如 "12.50"），null 表示不可比较。
 */
export const PRESENTATION_COMPARE_KEYS = {
  successAmount: 'successAmountChangePercent',
  successCount: 'successCountChangePercent',
  refundAmount: 'refundAmountChangePercent',
  refundCount: 'refundCountChangePercent',
} as const

/**
 * 成功率对比由 Core 以百分点差给出（当前成功率 − 昨日成功率，如 90% 与 80% 为 "10.0"），
 * 不是相对变化百分比，不能按比例展示。
 */
export const SUCCESS_RATE_DIFFERENCE_KEY = 'successRateDifferencePoints'

export type CompareMetric = keyof typeof PRESENTATION_COMPARE_KEYS

const PERCENT = /^-?\d+(\.\d+)?$/

/** 读取后端百分比字符串；缺失、null 或格式不符一律视为不可展示（undefined/null 交给 UI 显示“不可比较”） */
export function readPercent(p: ReportPresentation, key: string): string | null {
  const v = p[key]
  return typeof v === 'string' && PERCENT.test(v) ? v : null
}

/** 仅用于展示：把后端百分比字符串转为比例，交给 MetricCard 渲染方向与文字 */
export function compareRatio(p: ReportPresentation, metric: CompareMetric): number | null {
  const v = readPercent(p, PRESENTATION_COMPARE_KEYS[metric])
  return v === null ? null : Number(v) / 100
}

/** 成功率百分点差：sign 只用于方向与配色，文字直接使用后端字符串，不重算 */
export function successRateDifference(p: ReportPresentation): { sign: number; text: string } | null {
  const v = readPercent(p, SUCCESS_RATE_DIFFERENCE_KEY)
  if (v === null) return null
  const sign = Math.sign(Number(v))
  return { sign, text: `${sign > 0 ? '+' : ''}${v} 个百分点` }
}
