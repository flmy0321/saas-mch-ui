import { AuthCoordinationUnavailable, tokenStorage, withAuthLock } from '@/services/auth/token'
import { ApiError, isSessionUnauthenticated, type MerchantApi } from './types'

/**
 * expired：refresh 被服务端以 401 UNAUTHENTICATED 拒绝，当前 generation 已失效；
 * uncertain：refresh 网络/超时/5xx/409 无赢家/无法跨页协调，登录状态无法确认，需要用户明确重新登录；
 * superseded：其他标签页已退出或换了新登录，本次结果作废（不清理新登录）。
 */
export type AuthLossReason = 'expired' | 'uncertain' | 'superseded'
type Handler = (reason: AuthLossReason) => void
let onAuthLost: Handler = () => {}

/** 由路由层注册：会话失效或状态不确定时调用 */
export function setUnauthenticatedHandler(handler: Handler) {
  onAuthLost = handler
}

type RefreshOutcome = 'refreshed' | AuthLossReason

/** 同页 single-flight：同一 generation + accessToken 只发起一次协调刷新 */
const inflight = new Map<string, Promise<RefreshOutcome>>()

function isRefreshAlreadyUsed(e: unknown) {
  return e instanceof ApiError && e.httpStatus === 409 && e.code === 'REFRESH_ALREADY_USED'
}

async function coordinatedRefresh(raw: MerchantApi, generation: string, failedAccessToken: string): Promise<RefreshOutcome> {
  try {
    return await withAuthLock(async () => {
      // 拿到锁后重新读取共享存储：其他页面可能已刷新、退出或换了新登录
      const snap = tokenStorage.snapshot()
      if (!snap?.tokens || snap.generation !== generation) return 'superseded'
      if (snap.tokens.accessToken !== failedAccessToken) return 'refreshed'

      const expected = { generation: snap.generation, revision: snap.revision }
      try {
        const tokens = await raw.auth.refresh(snap.tokens.refreshToken)
        return tokenStorage.replaceIfCurrent(expected, tokens) ? 'refreshed' : 'superseded'
      } catch (e) {
        if (isRefreshAlreadyUsed(e)) {
          const after = tokenStorage.snapshot()
          if (after?.tokens && after.generation === generation && after.tokens.accessToken !== failedAccessToken) {
            return 'refreshed'
          }
          return 'uncertain'
        }
        if (isSessionUnauthenticated(e)) {
          tokenStorage.endGeneration(generation)
          return 'expired'
        }
        // 网络/超时/5xx：一次性 refresh 可能已被消费，不自动重试
        return 'uncertain'
      }
    })
  } catch (e) {
    if (e instanceof AuthCoordinationUnavailable) return 'uncertain'
    throw e
  }
}

function refreshFor(raw: MerchantApi, generation: string, accessToken: string) {
  const key = `${generation}:${accessToken}`
  let p = inflight.get(key)
  if (!p) {
    p = coordinatedRefresh(raw, generation, accessToken).finally(() => inflight.delete(key))
    inflight.set(key, p)
  }
  return p
}

/** 处理认证失效：仅清理本 generation，不触碰其他标签页写入的新登录 */
function loseAuth(reason: AuthLossReason, generation: string) {
  if (reason === 'uncertain') tokenStorage.endGeneration(generation)
  onAuthLost(reason)
}

/**
 * 业务接口统一处理：仅 HTTP 401 且 code === UNAUTHENTICATED 时协调刷新并最多重试一次原调用；
 * 服务端保证该响应发生在认证阶段、业务未执行，因此资金写在此前提下也只重试这一次。
 * INVALID_CREDENTIALS、403、404、409、423、429、5xx、网络错误、UPSTREAM_UNKNOWN 一律不进入该分支。
 * 重试时由底层实现重新读取最新 Authorization，不复用最初的 header。
 */
export function withAuth(raw: MerchantApi): MerchantApi {
  function wrap<T extends object>(target: T): T {
    return Object.fromEntries(
      Object.entries(target).map(([key, value]) => [
        key,
        typeof value === 'function'
          ? async (...args: unknown[]) => {
              const before = tokenStorage.snapshot()
              try {
                return await value(...args)
              } catch (e) {
                if (!isSessionUnauthenticated(e)) throw e
                if (!before?.tokens) {
                  onAuthLost('expired')
                  throw e
                }
                const outcome = await refreshFor(raw, before.generation, before.tokens.accessToken)
                if (outcome !== 'refreshed') {
                  loseAuth(outcome, before.generation)
                  throw e
                }
                // 刷新后若登录已被替换（退出/新账号），不得以新身份重放旧请求
                if (tokenStorage.snapshot()?.generation !== before.generation) {
                  onAuthLost('superseded')
                  throw e
                }
                try {
                  return await value(...args)
                } catch (retryError) {
                  if (isSessionUnauthenticated(retryError)) {
                    tokenStorage.endGeneration(before.generation)
                    onAuthLost('expired')
                  }
                  throw retryError
                }
              }
            }
          : wrap(value as object),
      ]),
    ) as T
  }

  const { auth, ...rest } = raw
  return { auth, ...wrap(rest) }
}
