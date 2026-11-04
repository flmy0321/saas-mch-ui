import { ApiError } from '@/services/api/types'

/**
 * 退款写入故障注入（仅 Mock 演示协议 1.3 的各优先级分支）：
 * - none：正常
 * - lost-after-accept：服务端已受理，但响应丢失（浏览器视为网络异常）
 * - upstream-unknown：返回 UPSTREAM_UNKNOWN + outcome=UNKNOWN（已受理）
 * - unavailable：返回 UPSTREAM_UNAVAILABLE + outcome=NOT_ACCEPTED（未受理）
 * - malformed：已受理，但响应体结构损坏
 * - mismatch：已受理，但响应资源与请求不一致
 */
export type RefundFault = 'none' | 'lost-after-accept' | 'upstream-unknown' | 'unavailable' | 'malformed' | 'mismatch'

const state: { failNetwork: boolean; refundFault: RefundFault } = { failNetwork: false, refundFault: 'none' }

export function setMockNetworkFailure(value: boolean) {
  state.failNetwork = value
}

export function setMockRefundFault(fault: RefundFault) {
  state.refundFault = fault
}

export function getMockRefundFault(): RefundFault {
  return state.refundFault
}

if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__mock = { setMockNetworkFailure, setMockRefundFault }
}

export async function delay<T>(fn: () => T, ms = 260 + Math.random() * 320): Promise<T> {
  await new Promise((r) => setTimeout(r, ms))
  if (state.failNetwork) throw new ApiError('网络请求失败，请检查网络连接后重试', 'NETWORK_ERROR')
  // 返回深拷贝，避免页面直接修改 Mock 数据
  return structuredClone(fn())
}
