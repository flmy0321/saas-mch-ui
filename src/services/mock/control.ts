import { ApiError } from '@/services/api/types'

const state = { failNetwork: false }

export function setMockNetworkFailure(value: boolean) {
  state.failNetwork = value
}

export async function delay<T>(fn: () => T, ms = 260 + Math.random() * 320): Promise<T> {
  await new Promise((r) => setTimeout(r, ms))
  if (state.failNetwork) throw new ApiError('网络请求失败，请检查网络连接后重试', 'NETWORK_ERROR')
  // 返回深拷贝，避免页面直接修改 Mock 数据
  return structuredClone(fn())
}
