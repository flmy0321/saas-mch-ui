import type { MerchantApi } from './types'
import { mockApi } from '@/services/mock/api'
import { MOCK_ACCOUNT } from '@/services/mock/auth'
import { httpApi } from '@/services/http/api'
import { withAuth } from './withAuth'

/**
 * API 模式必须显式选择（VITE_API_MODE=mock | http）。
 * http 模式的任何失败都以 ApiError 抛给页面，不会自动回退到 Mock。
 */
export type ApiMode = 'mock' | 'http'
const rawMode = import.meta.env.VITE_API_MODE as string | undefined

function resolveApi(): MerchantApi {
  if (rawMode === 'mock') return withAuth(mockApi)
  if (rawMode === 'http') return withAuth(httpApi)
  throw new Error(`VITE_API_MODE 未设置或无效（${String(rawMode)}），须显式设为 mock 或 http`)
}

export const api: MerchantApi = resolveApi()
export const apiMode: ApiMode = rawMode as ApiMode

/** 演示账号仅在 Mock 模式的开发构建中提供；正式构建为 null，不自动填充密码 */
export const demoAccount = import.meta.env.DEV && rawMode === 'mock' ? MOCK_ACCOUNT : null

export { ApiError } from './types'
export type { MerchantApi } from './types'
export { setUnauthenticatedHandler, type AuthLossReason } from './withAuth'
