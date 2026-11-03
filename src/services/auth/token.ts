import type { AuthTokens } from '@/types'

const STORAGE_KEY = 'payhub.portal.auth'

export interface StoredTokens {
  accessToken: string
  refreshToken: string
  /** access token 过期时间戳（ms） */
  accessExpiresAt: number
  /** refresh token 过期时间戳（ms） */
  refreshExpiresAt: number
}

function read(): StoredTokens | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StoredTokens) : null
  } catch {
    return null
  }
}

export const tokenStorage = {
  get: read,
  save(tokens: AuthTokens) {
    const now = Date.now()
    const value: StoredTokens = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessExpiresAt: now + tokens.expiresIn * 1000,
      refreshExpiresAt: now + tokens.refreshExpiresIn * 1000,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  },
  clear() {
    localStorage.removeItem(STORAGE_KEY)
  },
  /** 存在且 refresh token 未过期即视为已登录（access token 过期可静默刷新） */
  isAuthenticated() {
    const t = read()
    return !!t && t.refreshExpiresAt > Date.now()
  },
}
