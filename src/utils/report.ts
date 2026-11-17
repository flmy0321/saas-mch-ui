import type { ReportPresentation } from '@/types'

/**
 * presentation 中比较字段的键名。
 * 后端草案只声明了 averageAmount / successRatePercent，比较字段命名尚未冻结，
 * 这里集中定义，契约确定后只改此处。值为百分比十进制字符串（如 "12.50"），null 表示不可比较。
 */
export const PRESENTATION_COMPARE_KEYS = {
  successAmount: 'successAmountChangePercent',
  successCount: 'successCountChangePercent',
  refundAmount: 'refundAmountChangePercent',
  refundCount: 'refundCountChangePercent',
  successRate: 'successRateChangePercent',
} as const

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
