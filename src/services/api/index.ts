import type { MerchantApi } from './types'
import { mockApi } from '@/services/mock/api'
import { MOCK_ACCOUNT } from '@/services/mock/auth'
import { withAuth } from './withAuth'

/**
 * API 模式必须显式选择（VITE_API_MODE=mock | http），失败时不自动回退到 Mock。
 * http 实现尚未接入：选择 http 时启动即报错，不会静默使用 Mock 数据。
 */
export type ApiMode = 'mock' | 'http'
const rawMode = import.meta.env.VITE_API_MODE as string | undefined

function resolveApi(): MerchantApi {
  if (rawMode === 'mock') return withAuth(mockApi)
  if (rawMode === 'http') {
    throw new Error('VITE_API_MODE=http：HTTP 实现（/api/portal/v1）尚未接入本 UI，请勿回退 Mock')
  }
  throw new Error(`VITE_API_MODE 未设置或无效（${String(rawMode)}），须显式设为 mock 或 http`)
}

export const apiMode: ApiMode = rawMode === 'http' ? 'http' : 'mock'
export const api: MerchantApi = resolveApi()

/** 演示账号仅在 Mock 模式的开发构建中提供；正式构建为 null，不自动填充密码 */
export const demoAccount = import.meta.env.DEV && rawMode === 'mock' ? MOCK_ACCOUNT : null

export { ApiError } from './types'
export type { MerchantApi } from './types'
export { setUnauthenticatedHandler, type AuthLossReason } from './withAuth'
