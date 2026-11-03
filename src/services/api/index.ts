import type { MerchantApi } from './types'
import { mockApi } from '@/services/mock/api'
import { withAuth } from './withAuth'

/**
 * 统一 API 入口。接入真实 Node.js 后端时，实现同一 MerchantApi 接口（如 httpApi，
 * 每个业务请求携带 `Authorization: Bearer <accessToken>`）并在此替换 mockApi 即可，页面与组件无需改动。
 */
export const api: MerchantApi = withAuth(mockApi)

export { ApiError } from './types'
export type { MerchantApi } from './types'
export { setUnauthenticatedHandler } from './withAuth'
