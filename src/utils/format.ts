export { formatMoney, formatCompactMoney } from './money'

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('zh-CN').format(n)
}

export function formatPercent(ratio: number, digits = 2): string {
  if (!Number.isFinite(ratio)) return '—'
  return `${(ratio * 100).toFixed(digits)}%`
}

const pad = (n: number) => String(n).padStart(2, '0')

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return '—'
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function toDateInput(d: Date): string {
  return formatDate(d)
}

export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.round(diff / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m} 分钟前`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.round(h / 24)
  if (d < 30) return `${d} 天前`
  return formatDate(iso)
}

export function maskMiddle(value: string, keepStart = 4, keepEnd = 4): string {
  if (value.length <= keepStart + keepEnd) return value
  return `${value.slice(0, keepStart)}${'•'.repeat(6)}${value.slice(-keepEnd)}`
}

export function formatDelta(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return '—'
  const sign = ratio > 0 ? '+' : ''
  return `${sign}${(ratio * 100).toFixed(1)}%`
}
