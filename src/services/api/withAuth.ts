import { tokenStorage } from '@/services/auth/token'
import { ApiError, type MerchantApi } from './types'

type Handler = () => void
let onUnauthenticated: Handler = () => {}

/** 由路由层注册：会话彻底失效（refresh 也失败）时调用 */
export function setUnauthenticatedHandler(handler: Handler) {
  onUnauthenticated = handler
}

let refreshing: Promise<boolean> | null = null

function refreshTokens(raw: MerchantApi): Promise<boolean> {
  refreshing ??= (async () => {
    const refreshToken = tokenStorage.get()?.refreshToken
    if (!refreshToken) return false
    try {
      tokenStorage.save(await raw.auth.refresh(refreshToken))
      return true
    } catch {
      return false
    }
  })().finally(() => (refreshing = null))
  return refreshing
}

const isUnauthenticated = (e: unknown) => e instanceof ApiError && e.code === 'UNAUTHENTICATED'

/**
 * 业务接口统一处理：收到 401（UNAUTHENTICATED）时用 refresh token 换新 token 并重试一次；
 * 刷新失败则清除本地 token 并交给 onUnauthenticated 跳转登录页。并发请求共享同一次刷新。
 */
export function withAuth(raw: MerchantApi): MerchantApi {
  function wrap<T extends object>(target: T): T {
    return Object.fromEntries(
      Object.entries(target).map(([key, value]) => [
        key,
        typeof value === 'function'
          ? async (...args: unknown[]) => {
              try {
                return await value(...args)
              } catch (e) {
                if (!isUnauthenticated(e)) throw e
                if (await refreshTokens(raw)) {
                  try {
                    return await value(...args)
                  } catch (retryError) {
                    if (!isUnauthenticated(retryError)) throw retryError
                  }
                }
                tokenStorage.clear()
                onUnauthenticated()
                throw e
              }
            }
          : wrap(value as object),
      ]),
    ) as T
  }

  const { auth, ...rest } = raw
  return { auth, ...wrap(rest) }
}
