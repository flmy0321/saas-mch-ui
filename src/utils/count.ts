/**
 * 精确计数（协议 4.1a）：total 为十进制字符串，全程用 BigInt 计算，不经 Number 转换。
 */
const EXACT_COUNT = /^(0|[1-9][0-9]{0,19})$/
const UINT64_MAX = 18446744073709551615n

/** 协议页码上限；超出部分不可导航，但 total 不截断 */
export const MAX_PAGE = 1_000_000

export function isExactCount(v: unknown): v is string {
  return typeof v === 'string' && EXACT_COUNT.test(v) && BigInt(v) <= UINT64_MAX
}

/** 分页组件既服务旧 number 计数（退款/门店等），也服务精确字符串计数（支付列表） */
export type CountInput = number | string

function toBig(total: CountInput): bigint {
  if (typeof total === 'string') {
    if (!isExactCount(total)) throw new TypeError(`invalid exact count: ${total}`)
    return BigInt(total)
  }
  if (!Number.isSafeInteger(total) || total < 0) throw new TypeError(`invalid count: ${total}`)
  return BigInt(total)
}

export function isZeroCount(total: CountInput): boolean {
  return toBig(total) === 0n
}

/** 千分位格式化，直接作用于十进制字符串 */
export function formatCount(total: CountInput): string {
  return toBig(total).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** 精确总页数 = ceil(total / pageSize)，至少 1 */
export function exactPageCount(total: CountInput, pageSize: number): bigint {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) throw new TypeError(`invalid pageSize: ${pageSize}`)
  const t = toBig(total)
  const size = BigInt(pageSize)
  const n = (t + size - 1n) / size
  return n < 1n ? 1n : n
}

/**
 * 可导航页数：min(精确总页数, MAX_PAGE)，结果必然是安全整数。
 * truncated=true 表示存在超出页码上限的记录，页面需提示用户缩小筛选范围。
 */
export function navigablePages(total: CountInput, pageSize: number): { pages: number; truncated: boolean } {
  const exact = exactPageCount(total, pageSize)
  const cap = BigInt(MAX_PAGE)
  return exact > cap ? { pages: MAX_PAGE, truncated: true } : { pages: Number(exact), truncated: false }
}
