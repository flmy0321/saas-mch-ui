import { ApiError } from '@/services/api/types'
import type { CommandOutcome, CommandReply } from '@/types/command'

/**
 * 写命令的发送与按原号恢复。
 * - 发送前生成 commandId 并写入 sessionStorage，刷新页面后仍能用同一号码查询
 * - 202 UNKNOWN、超时、断线、502/503/504：只用同一 commandId 查询，绝不自动重发
 * - NOT_OBSERVED 或查询本身失败：保留为待确认，由操作者手动重新查询
 * - 其余错误（含 409 VERSION_CONFLICT）原样抛出，并清除待确认记录
 */

const STORAGE_KEY = 'portal.pendingCommands'

export interface PendingCommand {
  scope: string
  commandId: string
  /** 恢复查询所需的参数（如 operation、appId、keyId、storeCode） */
  params: Record<string, string>
  createdAt: string
}

function readAll(): Record<string, PendingCommand> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, PendingCommand>) : {}
  } catch {
    return {}
  }
}

/** 写入并回读校验；失败返回 false */
function writeAll(all: Record<string, PendingCommand>): boolean {
  try {
    const raw = JSON.stringify(all)
    sessionStorage.setItem(STORAGE_KEY, raw)
    return sessionStorage.getItem(STORAGE_KEY) === raw
  } catch {
    return false
  }
}

export function getPendingCommand(scope: string): PendingCommand | null {
  return readAll()[scope] ?? null
}

/** 首次发送前必须成功落盘；失败时抛出 STORAGE_UNAVAILABLE，调用方不得发送 */
export function rememberCommand(cmd: PendingCommand) {
  if (!writeAll({ ...readAll(), [cmd.scope]: cmd })) {
    throw new ApiError(
      '浏览器无法保存本次操作的命令号（可能处于隐私模式或存储已满），为避免结果无法确认，本次未提交。请调整浏览器设置后重试。',
      'STORAGE_UNAVAILABLE',
    )
  }
}

export function forgetCommand(scope: string) {
  const all = readAll()
  delete all[scope]
  writeAll(all)
}

export function newCommandId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** 没有收到任何服务端响应：结果未知，只能按原号查询 */
export function isNoResponse(e: unknown): boolean {
  return e instanceof ApiError && (e.httpStatus === 0 || e.code === 'TIMEOUT' || e.code === 'NETWORK')
}

/** 网关/代理层错误（502/503/504）：请求可能已被 Core 执行，结果无法确认，只能按原号查询 */
export function isGatewayUnconfirmed(e: unknown): boolean {
  return e instanceof ApiError && (e.httpStatus === 502 || e.httpStatus === 503 || e.httpStatus === 504)
}

/** 首次写请求的结果无法确认：未收到响应，或收到网关错误 */
export function isWriteOutcomeUnknown(e: unknown): boolean {
  return isNoResponse(e) || isGatewayUnconfirmed(e)
}

export function isVersionConflict(e: unknown): boolean {
  return e instanceof ApiError && e.httpStatus === 409 && e.code === 'VERSION_CONFLICT'
}

/** Webhook 测试只有收到对端 2xx 才算投递成功；NOT_SENT 与 500 等一律为失败 */
export function webhookTestSucceeded(r: { status: 'COMPLETED' | 'NOT_SENT'; httpStatus: number }): boolean {
  return r.status === 'COMPLETED' && r.httpStatus >= 200 && r.httpStatus < 300
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface LookupOptions {
  /** 首次发送结果未知后，自动按原号查询的次数（仅查询，不重发） */
  attempts?: number
  intervalMs?: number
}

/** 查询暂时不可用：断线/超时、502/503/504、会话失效。原号保留，稍后用同一号码再查 */
export function isLookupUnavailable(e: unknown): boolean {
  return (
    isWriteOutcomeUnknown(e) ||
    (e instanceof ApiError && (e.httpStatus === 401 || e.code === 'UNAUTHENTICATED'))
  )
}

/**
 * 按原号查询，直到 APPLIED 或次数用尽。
 * 只有确认 APPLIED 才清除待确认记录；NOT_OBSERVED、503、会话失效、断线一律保留原号。
 * 其他查询错误同样保留记录后抛出，绝不改用新号重提。
 */
export async function lookupUntilKnown<T>(
  pending: PendingCommand,
  lookup: (cmd: PendingCommand) => Promise<CommandReply<T>>,
  { attempts = 3, intervalMs = 800 }: LookupOptions = {},
): Promise<CommandOutcome<T>> {
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await wait(intervalMs)
    try {
      const reply = await lookup(pending)
      if (reply.status === 'APPLIED') {
        forgetCommand(pending.scope)
        return { state: 'APPLIED', result: reply.result, recovered: true }
      }
    } catch (e) {
      if (!isLookupUnavailable(e)) throw e
      if (e instanceof ApiError && (e.httpStatus === 401 || e.code === 'UNAUTHENTICATED')) break
    }
  }
  return { state: 'PENDING', commandId: pending.commandId }
}

export async function runCommand<T>(opts: {
  scope: string
  params: Record<string, string>
  send: (commandId: string) => Promise<CommandReply<T>>
  lookup: (cmd: PendingCommand) => Promise<CommandReply<T>>
  lookupOptions?: LookupOptions
}): Promise<CommandOutcome<T>> {
  if (getPendingCommand(opts.scope)) {
    throw new ApiError('上一次操作的结果仍待确认，请先重新查询结果', 'COMMAND_PENDING')
  }
  const pending: PendingCommand = {
    scope: opts.scope,
    commandId: newCommandId(),
    params: opts.params,
    createdAt: new Date().toISOString(),
  }
  rememberCommand(pending)
  try {
    const reply = await opts.send(pending.commandId)
    if (reply.status === 'APPLIED') {
      forgetCommand(pending.scope)
      return { state: 'APPLIED', result: reply.result, recovered: false }
    }
  } catch (e) {
    // 明确的业务拒绝（含 409 VERSION_CONFLICT 及其他 409 错误码）：结果已确定，清除原号后交给调用方
    if (!isWriteOutcomeUnknown(e)) {
      forgetCommand(pending.scope)
      throw e
    }
  }
  return lookupUntilKnown(pending, opts.lookup, opts.lookupOptions)
}
