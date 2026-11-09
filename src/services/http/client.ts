import { ApiError } from '@/services/api/types'
import { tokenStorage } from '@/services/auth/token'

/**
 * 固定为同源相对路径：开发经 Vite 代理 /api，生产经同源反向代理。
 * 不支持跨域 Base URL——匿名挑战 Cookie 必须由同一浏览器在同源请求中自动携带。
 */
export const API_BASE = '/api/portal/v1'
const TIMEOUT_MS = 15_000

type Query = Record<string, string | number | boolean | null | undefined>
type AuthMode =
  /** 业务接口：每次发送时读取共享存储中的最新 access token */
  | { kind: 'session' }
  /** 匿名身份接口（captcha / login / select-merchant / refresh）：不带 Authorization */
  | { kind: 'anonymous' }
  /** logout：使用调用方给定的 access token */
  | { kind: 'bearer'; token: string }

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  query?: Query
  body?: unknown
  auth?: AuthMode
  /** 资金写：2xx 时原样返回解析结果（解析失败返回 null），由调用方分类，不在此抛错 */
  rawSuccess?: boolean
}

function buildUrl(path: string, query?: Query) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined || v === null || v === '') continue
    params.append(k, String(v))
  }
  const qs = params.toString()
  return `${API_BASE}${path}${qs ? `?${qs}` : ''}`
}

const seg = encodeURIComponent

async function readJson(res: Response): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    const text = await res.text()
    if (!text) return { ok: false }
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false }
  }
}

function toApiError(status: number, body: unknown, headerRequestId: string | null): ApiError {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  const code = typeof b?.code === 'string' && b.code ? b.code : 'UNKNOWN'
  const message = typeof b?.message === 'string' && b.message ? b.message : `请求失败（HTTP ${status}）`
  return new ApiError(message, code, {
    httpStatus: status,
    outcome: b?.outcome,
    requestId: typeof b?.requestId === 'string' ? b.requestId : headerRequestId,
    authoritative: typeof b?.authoritative === 'boolean' ? b.authoritative : undefined,
  })
}

/**
 * 统一 fetch：
 * - credentials: 'same-origin'——浏览器自动携带服务端下发的 HttpOnly 匿名挑战 Cookie；前端不读取、生成或拼接 Cookie
 * - 登录凭证只经 Authorization: Bearer
 * - 无响应（网络/超时/中止）抛 httpStatus = 0，不自动重试、不回退 Mock
 */
export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', query, body, auth = { kind: 'session' }, rawSuccess = false } = opts
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json; charset=utf-8'

  if (auth.kind === 'session') {
    const token = tokenStorage.get()?.accessToken
    if (!token) throw new ApiError('登录已失效，请重新登录', 'UNAUTHENTICATED', { httpStatus: 401 })
    headers.Authorization = `Bearer ${token}`
  } else if (auth.kind === 'bearer') {
    headers.Authorization = `Bearer ${auth.token}`
  }

  let res: Response
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (e) {
    const timeout = e instanceof DOMException && e.name === 'TimeoutError'
    throw new ApiError(timeout ? '请求超时，结果未知' : '网络异常，未收到服务端响应', timeout ? 'TIMEOUT' : 'NETWORK', {
      httpStatus: 0,
    })
  }

  const requestId = res.headers.get('X-Request-Id')

  if (!res.ok) {
    const parsed = await readJson(res)
    throw toApiError(res.status, parsed.ok ? parsed.value : null, requestId)
  }

  if (res.status === 204) return undefined as T

  const parsed = await readJson(res)
  if (rawSuccess) return (parsed.ok ? parsed.value : null) as T
  if (!parsed.ok) {
    throw new ApiError('服务端响应格式异常', 'MALFORMED_RESPONSE', { httpStatus: res.status, requestId })
  }
  return parsed.value as T
}

export { seg }
