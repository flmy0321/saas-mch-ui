import type { CreateRefundInput, Refund } from '@/types'
import { ApiError, isSessionUnauthenticated } from '@/services/api/types'
import { amountEquals, isAmountOutput } from '@/utils/money'

/** 协议 1.3 已识别的错误码；未识别 code 即使带 outcome 也保守按 UNKNOWN */
const KNOWN_CODES = new Set([
  'VALIDATION',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'IDEMPOTENCY_CONFLICT',
  'INVALID_STATUS',
  'EXCEED_REFUNDABLE',
  'REFUND_NOT_ELIGIBLE',
  'UPSTREAM_UNKNOWN',
  'UPSTREAM_UNAVAILABLE',
  'RATE_LIMITED',
  'INTERNAL',
])

export type RefundWriteResult =
  | { kind: 'LOCATED'; refund: Refund }
  | { kind: 'UNKNOWN'; reason: string; error?: ApiError }
  | { kind: 'AUTH_FAILED'; error: ApiError }
  | { kind: 'REJECTED'; error: ApiError }
  | { kind: 'NOT_ACCEPTED'; error: ApiError }

const isStr = (v: unknown): v is string => typeof v === 'string'
const isNullableStr = (v: unknown) => v === null || isStr(v)

/** 结构校验：标识/金额/结构损坏视为不合法；未知 status 字符串仍合法 */
export function isValidRefund(value: unknown): value is Refund {
  if (!value || typeof value !== 'object') return false
  const r = value as Record<string, unknown>
  return (
    isStr(r.id) &&
    r.id.length > 0 &&
    isStr(r.merchantRefundNo) &&
    isStr(r.paymentId) &&
    isAmountOutput(r.amount) &&
    isStr(r.status) &&
    r.status.length > 0 &&
    isStr(r.channel) &&
    isStr(r.createdAt) &&
    isStr(r.updatedAt) &&
    isNullableStr(r.finishedAt) &&
    isNullableStr(r.merchantOrderNo) &&
    isNullableStr(r.storeId) &&
    isNullableStr(r.storeName) &&
    Array.isArray(r.progress)
  )
}

/** 资源与本次请求一致：paymentId、merchantRefundNo 相同，金额按十进制语义相等 */
export function refundMatches(refund: Refund, expect: Pick<CreateRefundInput, 'paymentId' | 'merchantRefundNo' | 'amount'>) {
  return (
    refund.paymentId === expect.paymentId &&
    refund.merchantRefundNo === expect.merchantRefundNo &&
    amountEquals(refund.amount, expect.amount)
  )
}

/** 成功（resolve）分支：优先级 2 / 3 */
export function classifySuccess(body: unknown, input: CreateRefundInput): RefundWriteResult {
  if (!isValidRefund(body)) return { kind: 'UNKNOWN', reason: '响应不是合法的退款资源' }
  if (!refundMatches(body, input)) return { kind: 'UNKNOWN', reason: '响应资源与本次请求不一致' }
  return { kind: 'LOCATED', refund: body }
}

/** 失败（reject）分支：优先级 1 / 4 / 5 / 6 */
export function classifyFailure(error: unknown): RefundWriteResult {
  if (!(error instanceof ApiError) || error.httpStatus === 0) {
    return { kind: 'UNKNOWN', reason: '未收到服务端响应（网络异常、超时或连接中断）' }
  }
  if (isSessionUnauthenticated(error)) return { kind: 'AUTH_FAILED', error }
  if (!KNOWN_CODES.has(error.code)) return { kind: 'UNKNOWN', reason: `未识别的错误码 ${error.code}`, error }
  if (error.outcome === 'REJECTED') return { kind: 'REJECTED', error }
  if (error.outcome === 'NOT_ACCEPTED') return { kind: 'NOT_ACCEPTED', error }
  return { kind: 'UNKNOWN', reason: error.outcome === 'UNKNOWN' ? '服务端返回结果未知' : '错误响应缺少结果确定性', error }
}
