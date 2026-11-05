import type { AuthTokens } from '@/types'

const STORAGE_KEY = 'payhub.portal.auth.v2'
const LEGACY_KEYS = ['payhub.portal.auth']
const LOCK_NAME = 'payhub.portal.auth.lock'
const SCHEMA = 2

export interface StoredTokens {
  accessToken: string
  refreshToken: string
  /** access token 本地截止时间戳（ms） */
  accessExpiresAt: number
  /** refresh token 本地截止时间戳（ms） */
  refreshExpiresAt: number
}

/**
 * 客户端登录版本：generation 在每次新登录/退出时变化，revision 在同一登录内每次刷新递增。
 * 仅用于浏览器内的竞争控制，不是服务端 sessionId，也不携带任何授权信息。
 */
export interface AuthSnapshot {
  generation: string
  revision: number
  tokens: StoredTokens | null
}

export interface AuthVersion {
  generation: string
  revision: number
}

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const isPositiveNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0

function parseTokens(v: unknown): StoredTokens | null {
  if (!v || typeof v !== 'object') return null
  const t = v as Record<string, unknown>
  if (
    !isNonEmptyString(t.accessToken) ||
    !isNonEmptyString(t.refreshToken) ||
    !isPositiveNumber(t.accessExpiresAt) ||
    !isPositiveNumber(t.refreshExpiresAt)
  ) {
    return null
  }
  return {
    accessToken: t.accessToken,
    refreshToken: t.refreshToken,
    accessExpiresAt: t.accessExpiresAt,
    refreshExpiresAt: t.refreshExpiresAt,
  }
}

/** 运行时结构校验：任何未知/损坏/旧版本记录一律视为未登录，不会把任意字符串当作 accessToken */
export function parseSnapshot(raw: string | null): AuthSnapshot | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Record<string, unknown>
    if (!v || v.schema !== SCHEMA || !isNonEmptyString(v.generation)) return null
    if (typeof v.revision !== 'number' || !Number.isInteger(v.revision) || v.revision < 0) return null
    const tokens = v.tokens === null ? null : parseTokens(v.tokens)
    if (v.tokens !== null && !tokens) return null
    return { generation: v.generation, revision: v.revision, tokens }
  } catch {
    return null
  }
}

function newGeneration() {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function toStored(tokens: AuthTokens, now = Date.now()): StoredTokens {
  if (
    tokens?.tokenType !== 'Bearer' ||
    !isNonEmptyString(tokens.accessToken) ||
    !isNonEmptyString(tokens.refreshToken) ||
    !isPositiveNumber(tokens.expiresIn) ||
    !isPositiveNumber(tokens.refreshExpiresIn)
  ) {
    throw new Error('MALFORMED_TOKENS')
  }
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    accessExpiresAt: now + tokens.expiresIn * 1000,
    refreshExpiresAt: now + tokens.refreshExpiresIn * 1000,
  }
}

function write(snapshot: AuthSnapshot) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ schema: SCHEMA, ...snapshot }))
}

function read(): AuthSnapshot | null {
  try {
    return parseSnapshot(localStorage.getItem(STORAGE_KEY))
  } catch {
    return null
  }
}

for (const key of LEGACY_KEYS) {
  try {
    localStorage.removeItem(key)
  } catch {
    // 存储不可用时忽略；旧记录不会被读取
  }
}

/** 是否具备可靠的同源跨标签页互斥能力（Web Locks） */
export const hasAuthLock = () => typeof navigator !== 'undefined' && !!navigator.locks?.request

export class AuthCoordinationUnavailable extends Error {
  constructor() {
    super('当前浏览器不支持跨标签页登录协调，请使用最新版浏览器')
    this.name = 'AuthCoordinationUnavailable'
  }
}

/** 同源所有标签页对登录态的读改写在此互斥执行 */
export async function withAuthLock<T>(fn: () => Promise<T> | T): Promise<T> {
  if (!hasAuthLock()) throw new AuthCoordinationUnavailable()
  return navigator.locks.request(LOCK_NAME, { mode: 'exclusive' }, async () => fn()) as Promise<T>
}

export const tokenStorage = {
  snapshot: read,

  get(): StoredTokens | null {
    return read()?.tokens ?? null
  },

  version(): AuthVersion | null {
    const s = read()
    return s?.tokens ? { generation: s.generation, revision: s.revision } : null
  },

  /** 新登录：开启新的 generation（须在 withAuthLock 内调用） */
  startGeneration(tokens: AuthTokens): AuthVersion {
    const snapshot: AuthSnapshot = { generation: newGeneration(), revision: 1, tokens: toStored(tokens) }
    write(snapshot)
    return { generation: snapshot.generation, revision: snapshot.revision }
  },

  /** 刷新写回：仅当共享记录仍是 expected 版本时写入，过期结果不能复活已退出或覆盖新登录（须在 withAuthLock 内调用） */
  replaceIfCurrent(expected: AuthVersion, tokens: AuthTokens): AuthVersion | null {
    const s = read()
    if (!s?.tokens || s.generation !== expected.generation || s.revision !== expected.revision) return null
    const next: AuthSnapshot = { generation: s.generation, revision: s.revision + 1, tokens: toStored(tokens) }
    write(next)
    return { generation: next.generation, revision: next.revision }
  },

  /**
   * 结束登录。传入 generation 时只清理该 generation，避免误清其他标签页刚写入的新登录。
   * 写入新的空 generation，使其他标签页可感知变化。
   */
  endGeneration(generation?: string): boolean {
    const s = read()
    if (generation && s && s.generation !== generation) return false
    try {
      write({ generation: newGeneration(), revision: 0, tokens: null })
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    }
    return true
  },

  /** 存在结构有效的记录且 refresh 未过期即视为已登录（access 过期可静默刷新） */
  isAuthenticated() {
    const t = read()?.tokens
    return !!t && t.refreshExpiresAt > Date.now()
  },

  /** 订阅其他标签页对登录态的修改（storage 事件只在其他文档触发，仅携带版本变化） */
  subscribe(listener: (snapshot: AuthSnapshot | null) => void): () => void {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) listener(read())
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  },
}
