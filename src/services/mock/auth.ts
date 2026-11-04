import type { AuthTokens, Captcha } from '@/types'
import { ApiError, type MerchantApi } from '@/services/api/types'
import { tokenStorage } from '@/services/auth/token'
import { delay } from './control'
import { currentUser, randomHex } from './db'

export const MOCK_ACCOUNT = { email: currentUser.email, phone: currentUser.phone, password: 'Demo@123456' }

const ACCESS_TTL = 2 * 60 * 60
const REFRESH_TTL = 7 * 24 * 60 * 60
const CAPTCHA_TTL = 5 * 60
const MAX_FAILURES = 5
const LOCK_MS = 15 * 60 * 1000
const REVOKED_KEY = 'payhub.mock.revoked'

const captchas = new Map<string, { code: string; expiresAt: number }>()
const failures = new Map<string, { count: number; lockedUntil: number }>()

function revokedSet(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(REVOKED_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

function revoke(token: string) {
  const set = revokedSet()
  set.add(token)
  sessionStorage.setItem(REVOKED_KEY, JSON.stringify([...set].slice(-200)))
}

/** Mock token 结构：<kind>.<过期时间戳>.<随机串>，真实后端应使用不透明随机串或签名 JWT */
function issue(kind: 'at' | 'rt', ttl: number) {
  return `mock_${kind}.${Date.now() + ttl * 1000}.${randomHex(24)}`
}

function isValid(token: string | undefined, kind: 'at' | 'rt') {
  if (!token) return false
  const [prefix, exp] = token.split('.')
  return prefix === `mock_${kind}` && Number(exp) > Date.now() && !revokedSet().has(token)
}

function issueTokens(): AuthTokens {
  return {
    tokenType: 'Bearer',
    accessToken: issue('at', ACCESS_TTL),
    expiresIn: ACCESS_TTL,
    refreshToken: issue('rt', REFRESH_TTL),
    refreshExpiresIn: REFRESH_TTL,
  }
}

/** 模拟服务端校验 Authorization: Bearer <accessToken> */
export function assertAuthenticated() {
  if (!isValid(tokenStorage.get()?.accessToken, 'at')) {
    throw new ApiError('登录已过期，请重新登录', 'UNAUTHENTICATED', { httpStatus: 401 })
  }
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

export const mockAuth: MerchantApi['auth'] = {
  captcha: () =>
    delay((): Captcha => {
      const code = Array.from({ length: 4 }, () => CAPTCHA_CHARS[Math.floor(Math.random() * CAPTCHA_CHARS.length)]).join('')
      const captchaId = `cap_${randomHex(16)}`
      captchas.set(captchaId, { code, expiresAt: Date.now() + CAPTCHA_TTL * 1000 })
      return { captchaId, image: captchaSvg(code), expiresIn: CAPTCHA_TTL }
    }, 150),

  login: (input) =>
    delay(() => {
      const account = input.account.trim().toLowerCase()
      if (!account || !input.password) throw new ApiError('请输入账号和密码', 'VALIDATION', { httpStatus: 400 })

      const captcha = captchas.get(input.captchaId)
      captchas.delete(input.captchaId)
      if (!captcha || captcha.expiresAt < Date.now()) throw new ApiError('验证码已过期，请刷新后重试', 'CAPTCHA_INVALID', { httpStatus: 400 })
      if (captcha.code !== input.captchaCode.trim().toUpperCase()) throw new ApiError('验证码错误', 'CAPTCHA_INVALID', { httpStatus: 400 })

      const state = failures.get(account) ?? { count: 0, lockedUntil: 0 }
      if (state.lockedUntil > Date.now()) {
        const minutes = Math.ceil((state.lockedUntil - Date.now()) / 60000)
        throw new ApiError(`密码错误次数过多，账号已锁定，请 ${minutes} 分钟后再试`, 'ACCOUNT_LOCKED', { httpStatus: 423 })
      }

      const matched = account === MOCK_ACCOUNT.email.toLowerCase() || account === MOCK_ACCOUNT.phone
      if (!matched || input.password !== MOCK_ACCOUNT.password) {
        state.count += 1
        if (state.count >= MAX_FAILURES) {
          failures.set(account, { count: 0, lockedUntil: Date.now() + LOCK_MS })
          throw new ApiError('密码错误次数过多，账号已锁定，请 15 分钟后再试', 'ACCOUNT_LOCKED', { httpStatus: 423 })
        }
        failures.set(account, state)
        throw new ApiError(`账号或密码错误，还可尝试 ${MAX_FAILURES - state.count} 次`, 'INVALID_CREDENTIALS', { httpStatus: 400 })
      }

      failures.delete(account)
      currentUser.lastLoginAt = new Date().toISOString()
      return { ...issueTokens(), user: currentUser }
    }, 600),

  refresh: (refreshToken) =>
    delay(() => {
      if (!isValid(refreshToken, 'rt')) throw new ApiError('登录已过期，请重新登录', 'UNAUTHENTICATED', { httpStatus: 401 })
      revoke(refreshToken)
      return issueTokens()
    }, 200),

  logout: (refreshToken) =>
    delay(() => {
      if (refreshToken) revoke(refreshToken)
      const at = tokenStorage.get()?.accessToken
      if (at) revoke(at)
    }, 200),
}
