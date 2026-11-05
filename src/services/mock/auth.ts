import type { AuthTokens, Captcha, LoginSession, MerchantSelection } from '@/types'
import { ApiError, type MerchantApi } from '@/services/api/types'
import { tokenStorage } from '@/services/auth/token'
import { delay, getMockTenantScenario } from './control'
import { currentUser, merchant, randomHex, sessions as staticSessions } from './db'

/**
 * Mock 身份服务（仅演示/测试）。所有状态均为浏览器内存或 localStorage 替身，
 * 不代表真实持久化、真实验证码安全性或真实成员资格校验。
 */

/** 仅供开发模式演示面板使用；生产构建不得引用 */
export const MOCK_ACCOUNT = { email: currentUser.email, phone: currentUser.phone, password: 'Demo@123456' }
const credential = { password: MOCK_ACCOUNT.password }

const ACCESS_TTL = 2 * 60 * 60
const REFRESH_TTL = 7 * 24 * 60 * 60
const CAPTCHA_TTL = 5 * 60
const SELECTION_TTL_MS = 5 * 60 * 1000
const MAX_FAILURES = 5
const LOCK_MS = 15 * 60 * 1000
const SECOND_TENANT = 'M10008813'

/** 跨标签页共享的“服务端”状态替身，用于演示 refresh 单赢家与会话撤销 */
const SERVER_KEY = 'payhub.mock.identity.v1'
interface ActiveSession {
  sid: string
  tenantId: string
  createdAt: string
  lastActiveAt: string
}
interface ServerState {
  revokedSids: string[]
  usedRefresh: string[]
  expiredAccess: string[]
  removedStatic: string[]
  active: ActiveSession[]
}

function loadServer(): ServerState {
  try {
    const v = JSON.parse(localStorage.getItem(SERVER_KEY) ?? 'null') as Partial<ServerState> | null
    return {
      revokedSids: v?.revokedSids ?? [],
      usedRefresh: v?.usedRefresh ?? [],
      expiredAccess: v?.expiredAccess ?? [],
      removedStatic: v?.removedStatic ?? [],
      active: v?.active ?? [],
    }
  } catch {
    return { revokedSids: [], usedRefresh: [], expiredAccess: [], removedStatic: [], active: [] }
  }
}

function saveServer(s: ServerState) {
  const cap = <T>(a: T[]) => a.slice(-200)
  localStorage.setItem(
    SERVER_KEY,
    JSON.stringify({
      revokedSids: cap(s.revokedSids),
      usedRefresh: cap(s.usedRefresh),
      expiredAccess: cap(s.expiredAccess),
      removedStatic: s.removedStatic,
      active: cap(s.active),
    }),
  )
}

function updateServer(fn: (s: ServerState) => void) {
  const s = loadServer()
  fn(s)
  saveServer(s)
}

const captchas = new Map<string, { code: string; expiresAt: number }>()
const failures = new Map<string, { count: number; lockedUntil: number }>()
const selections = new Map<string, { expiresAt: number; tenantIds: string[] }>()

/** Mock token 结构：<kind>.<过期时间戳>.<sid>.<随机串>；真实后端应使用不透明随机串或签名 JWT */
function issue(kind: 'at' | 'rt', ttl: number, sid: string) {
  return `mock_${kind}.${Date.now() + ttl * 1000}.${sid}.${randomHex(16)}`
}

function parseToken(token: string | undefined, kind: 'at' | 'rt'): { sid: string } | null {
  if (!token) return null
  const [prefix, exp, sid] = token.split('.')
  if (prefix !== `mock_${kind}` || !(Number(exp) > Date.now()) || !sid) return null
  if (loadServer().revokedSids.includes(sid)) return null
  return { sid }
}

function issueTokens(sid: string): AuthTokens {
  return {
    tokenType: 'Bearer',
    accessToken: issue('at', ACCESS_TTL, sid),
    expiresIn: ACCESS_TTL,
    refreshToken: issue('rt', REFRESH_TTL, sid),
    refreshExpiresIn: REFRESH_TTL,
  }
}

const unauthenticated = () => new ApiError('登录已过期，请重新登录', 'UNAUTHENTICATED', { httpStatus: 401 })

/** 模拟服务端校验 Authorization: Bearer <accessToken>，返回会话 sid */
export function assertAuthenticated(): string {
  const at = tokenStorage.get()?.accessToken
  const parsed = parseToken(at, 'at')
  if (!parsed || loadServer().expiredAccess.includes(at!)) throw unauthenticated()
  return parsed.sid
}

const CAPTCHA_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function captchaSvg(code: string) {
  const rand = (min: number, max: number) => min + Math.random() * (max - min)
  const chars = [...code]
    .map((c, i) => {
      const x = 16 + i * 24
      const y = rand(28, 34)
      return `<text x="${x}" y="${y}" transform="rotate(${rand(-18, 18).toFixed(1)} ${x} ${y})" font-family="monospace" font-size="24" font-weight="700" fill="#3b3f8f">${c}</text>`
    })
    .join('')
  const lines = Array.from(
    { length: 4 },
    () =>
      `<line x1="${rand(0, 40)}" y1="${rand(4, 40)}" x2="${rand(80, 120)}" y2="${rand(4, 40)}" stroke="#9aa0c8" stroke-width="1"/>`,
  ).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="44" viewBox="0 0 120 44"><rect width="120" height="44" fill="#eef0fb"/>${lines}${chars}</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function tenantIdsForScenario(): string[] {
  switch (getMockTenantScenario()) {
    case 'none':
      return []
    case 'multi':
      return [merchant.merchantNo, SECOND_TENANT]
    default:
      return [merchant.merchantNo]
  }
}

export const mockAuth: MerchantApi['auth'] = {
  captcha: () =>
    delay((): Captcha => {
      const code = Array.from({ length: 4 }, () => CAPTCHA_CHARS[Math.floor(Math.random() * CAPTCHA_CHARS.length)]).join('')
      const captchaId = `cap_${randomHex(16)}`
      captchas.set(captchaId, { code, expiresAt: Date.now() + CAPTCHA_TTL * 1000 })
      return { captchaId, image: captchaSvg(code), expiresIn: CAPTCHA_TTL }
    }, 150),

  login: (input) =>
    delay((): MerchantSelection => {
      const account = input.account.trim().toLowerCase()
      if (!account || !input.password) throw new ApiError('请输入账号和密码', 'VALIDATION', { httpStatus: 400 })

      // 一次性：无论后续成败，校验即作废
      const captcha = captchas.get(input.captchaId)
      captchas.delete(input.captchaId)
      if (!captcha || captcha.expiresAt < Date.now()) throw new ApiError('验证码已过期，请刷新后重试', 'CAPTCHA_INVALID', { httpStatus: 400 })
      if (captcha.code !== input.captchaCode.trim().toUpperCase()) throw new ApiError('验证码错误', 'CAPTCHA_INVALID', { httpStatus: 400 })

      const state = failures.get(account) ?? { count: 0, lockedUntil: 0 }
      if (state.lockedUntil > Date.now()) {
        const minutes = Math.ceil((state.lockedUntil - Date.now()) / 60000)
        throw new ApiError(`尝试次数过多，请 ${minutes} 分钟后再试`, 'ACCOUNT_LOCKED', { httpStatus: 423 })
      }

      const matched = account === MOCK_ACCOUNT.email.toLowerCase() || account === MOCK_ACCOUNT.phone
      if (!matched || input.password !== credential.password) {
        state.count += 1
        if (state.count >= MAX_FAILURES) {
          failures.set(account, { count: 0, lockedUntil: Date.now() + LOCK_MS })
          throw new ApiError('尝试次数过多，请 15 分钟后再试', 'ACCOUNT_LOCKED', { httpStatus: 423 })
        }
        failures.set(account, state)
        // 账号不存在与密码错误同码同文案，不暴露存在性
        throw new ApiError('账号或密码错误', 'INVALID_CREDENTIALS', { httpStatus: 401 })
      }

      failures.delete(account)
      const selectionToken = `sel_${randomHex(24)}`
      const expiresAt = Date.now() + SELECTION_TTL_MS
      const tenantIds = tenantIdsForScenario()
      selections.set(selectionToken, { expiresAt, tenantIds })
      return { selectionToken, expiresAt, tenantIds }
    }, 600),

  selectMerchant: ({ selectionToken, tenantId }) =>
    delay(() => {
      const selection = selections.get(selectionToken)
      selections.delete(selectionToken)
      if (!selection || selection.expiresAt < Date.now()) {
        throw new ApiError('选择已失效，请重新验证账号密码', 'INVALID_CREDENTIALS', { httpStatus: 401 })
      }
      const scenario = getMockTenantScenario()
      if (!selection.tenantIds.includes(tenantId) || scenario === 'revoked') {
        throw new ApiError('该商户的成员资格无效或已被收回', 'FORBIDDEN', { httpStatus: 403 })
      }

      const sid = `ms_${randomHex(8)}`
      const now = new Date().toISOString()
      updateServer((s) => s.active.push({ sid, tenantId, createdAt: now, lastActiveAt: now }))
      currentUser.lastLoginAt = now
      if (scenario === 'select-unavailable') {
        // 会话可能已建立但响应未送达：演示前端不得自动重试
        throw new ApiError('身份服务暂不可用', 'IDENTITY_DEPENDENCY_UNAVAILABLE', { httpStatus: 503 })
      }
      return { ...issueTokens(sid), user: currentUser }
    }, 500),

  refresh: (refreshToken) =>
    delay(() => {
      const parsed = parseToken(refreshToken, 'rt')
      if (!parsed) throw unauthenticated()
      const server = loadServer()
      if (server.usedRefresh.includes(refreshToken)) {
        throw new ApiError('刷新凭证已被使用', 'REFRESH_ALREADY_USED', { httpStatus: 409 })
      }
      server.usedRefresh.push(refreshToken)
      saveServer(server)
      return issueTokens(parsed.sid)
    }, 200),

  logout: (accessToken) =>
    delay(() => {
      const [, , sid] = accessToken.split('.')
      if (sid) updateServer((s) => void s.revokedSids.push(sid))
    }, 200),
}

/** 演示：让当前 access 立即失效，用于手动验证刷新与跨标签页协调 */
export function expireMockAccess() {
  const at = tokenStorage.get()?.accessToken
  if (at) updateServer((s) => void s.expiredAccess.push(at))
}

if (typeof window !== 'undefined') {
  const w = window as unknown as Record<string, Record<string, unknown> | undefined>
  w.__mock = { ...(w.__mock ?? {}), expireMockAccess }
}

/** Mock 账户安全接口所需的会话视图（服务端按当前 access 的 sid 判断 current） */
export const mockIdentitySessions = {
  list(currentSid: string): LoginSession[] {
    const server = loadServer()
    const own = server.active
      .filter((a) => !server.revokedSids.includes(a.sid))
      .map(
        (a): LoginSession => ({
          id: a.sid,
          device: a.sid === currentSid ? '本机' : '',
          browser: a.sid === currentSid ? '当前浏览器' : '',
          ip: '',
          location: '',
          lastActiveAt: a.sid === currentSid ? new Date().toISOString() : a.lastActiveAt,
          current: a.sid === currentSid,
        }),
      )
    const others = staticSessions
      .filter((s) => !s.current && !server.removedStatic.includes(s.id))
      .map((s) => ({ ...s, current: false }))
    return [...own, ...others].sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt))
  },

  revoke(currentSid: string, id: string) {
    const server = loadServer()
    if (id === currentSid) return false
    const own = server.active.find((a) => a.sid === id && !server.revokedSids.includes(a.sid))
    const stat = staticSessions.find((s) => s.id === id && !s.current && !server.removedStatic.includes(s.id))
    if (!own && !stat) return false
    if (own) server.revokedSids.push(id)
    if (stat) server.removedStatic.push(id)
    saveServer(server)
    return true
  },

  revokeOthers(currentSid: string) {
    updateServer((s) => {
      s.active.forEach((a) => a.sid !== currentSid && s.revokedSids.push(a.sid))
      staticSessions.forEach((x) => !x.current && !s.removedStatic.includes(x.id) && s.removedStatic.push(x.id))
    })
  },

  checkPassword(current: string) {
    return current === credential.password
  },

  setPassword(next: string) {
    credential.password = next
  },
}
