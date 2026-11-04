import type { AmountDecimal } from '@/types'

/**
 * 金额（AmountDecimal，元十进制字符串）工具。
 * 所有比较、加减、校验都基于 BigInt 整数分，不使用 Number / parseFloat 参与金额运算，
 * 也不使用字符串字典序比较。图表绘制请使用 amountToChartNumber 派生近似值，仅用于绘制。
 */

const OUTPUT_RE = /^(0|[1-9]\d*)\.\d{2}$/
const INPUT_RE = /^(0|[1-9]\d*)(\.\d{1,2})?$/

/** 服务端输出格式：非负、恰好两位小数 */
export function isAmountOutput(value: unknown): value is AmountDecimal {
  return typeof value === 'string' && OUTPUT_RE.test(value)
}

/** 浏览器输入格式：非负、0~2 位小数，不允许符号、千分位、空格 */
export function isAmountInput(value: unknown): value is string {
  return typeof value === 'string' && INPUT_RE.test(value)
}

/** 合法金额字符串（输入或输出格式）→ 整数分；非法返回 null */
export function toFen(value: unknown): bigint | null {
  if (!isAmountInput(value)) return null
  const [int, dec = ''] = value.split('.')
  return BigInt(int!) * 100n + BigInt(dec.padEnd(2, '0'))
}

/** 整数分 → 输出格式字符串 */
export function fenToAmount(fen: bigint): AmountDecimal {
  const neg = fen < 0n
  const abs = neg ? -fen : fen
  const s = `${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`
  return neg ? `-${s}` : s
}

/** 规范化输入金额为两位小数；非法返回 null，不做四舍五入或截断 */
export function normalizeAmount(value: string): AmountDecimal | null {
  const fen = toFen(value)
  return fen === null ? null : fenToAmount(fen)
}

/** 十进制比较：a < b 返回 -1，相等 0，a > b 返回 1；任一非法返回 null */
export function compareAmount(a: unknown, b: unknown): -1 | 0 | 1 | null {
  const x = toFen(a)
  const y = toFen(b)
  if (x === null || y === null) return null
  return x === y ? 0 : x < y ? -1 : 1
}

/** 按十进制语义判断相等（"50" 与 "50.00" 相等） */
export function amountEquals(a: unknown, b: unknown): boolean {
  return compareAmount(a, b) === 0
}

/** 金额大于 0 */
export function isPositiveAmount(value: unknown): boolean {
  const fen = toFen(value)
  return fen !== null && fen > 0n
}

function groupThousands(int: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** 展示金额：null → “—”；格式非法 → “金额异常”；其余按原字符串精确展示 */
export function formatMoney(value: AmountDecimal | null | undefined, opts: { symbol?: boolean } = {}): string {
  if (value === null || value === undefined) return '—'
  const fen = toFen(value)
  if (fen === null) return '金额异常'
  const s = fenToAmount(fen)
  const [int, dec] = s.split('.')
  const out = `${groupThousands(int!)}.${dec}`
  return opts.symbol === false ? out : `¥${out}`
}

/** 紧凑展示（如“¥12.8万”），用于图表坐标轴等空间受限处 */
export function formatCompactMoney(value: AmountDecimal | number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  const n = typeof value === 'number' ? value : amountToChartNumber(value)
  return `¥${new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(n)}`
}

/** 仅用于图表绘制的近似数值；不得回流到金额展示、比较或退款参数 */
export function amountToChartNumber(value: AmountDecimal | null | undefined): number {
  const fen = toFen(value)
  return fen === null ? 0 : Number(fen) / 100
}
