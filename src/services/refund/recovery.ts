/**
 * 退款恢复上下文（协议 R3）。
 * - 持久化到 localStorage，关闭对话框、刷新、新开同 origin 页签、重新登录后仍可见；
 * - 所有读改写都在 Web Locks 互斥锁内完成，写入后读回校验；
 * - 锁不可用、存储不可用或写入校验失败时抛 RecoveryUnavailableError，调用方不得发送退款请求；
 * - 以 租户 + 用户 隔离，不同用户/租户互不可见。
 */

export type RecoveryPhase = 'DRAFT' | 'SENT_PENDING' | 'NOT_ACCEPTED' | 'LOCATED' | 'REJECTED_DRAFT'

export interface RecoveryScope {
  tenant: string
  userId: string
}

export interface RecoveryContext extends RecoveryScope {
  merchantRefundNo: string
  paymentId: string
  /** 本次请求的金额（输入格式字符串，原样保存） */
  amount: string
  reason: string
  phase: RecoveryPhase
  attempts: number
  createdAt: string
  updatedAt: string
  refundId: string | null
  note: string | null
  lastCheckedAt: string | null
}

export class RecoveryUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RecoveryUnavailableError'
  }
}

/** 演示用故障注入：模拟存储写入失败 */
export const recoveryFaults = { failWrites: false }

const STORAGE_KEY = 'mp:refund-recovery:v1'
const LOCK_NAME = 'mp:refund-recovery'
const CHANNEL_NAME = 'mp:refund-recovery'

/** 仍阻止新退款的阶段（R3 第 8 条） */
export const BLOCKING_PHASES: RecoveryPhase[] = ['SENT_PENDING', 'NOT_ACCEPTED']
/** 对同一订单可继续复用编号的阶段 */
const OPEN_PHASES: RecoveryPhase[] = ['DRAFT', ...BLOCKING_PHASES]

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())
channel?.addEventListener('message', emit)
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => e.key === STORAGE_KEY && emit())
}

export function subscribeRecovery(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function isCoordinationAvailable() {
  try {
    return typeof navigator !== 'undefined' && !!navigator.locks && typeof localStorage !== 'undefined'
  } catch {
    return false
  }
}

function readAll(): RecoveryContext[] {
  let raw: string | null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    throw new RecoveryUnavailableError('浏览器存储不可用')
  }
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as { version: number; items: RecoveryContext[] }
    if (parsed.version !== 1 || !Array.isArray(parsed.items)) throw new Error('bad shape')
    return parsed.items
  } catch {
    // 不覆盖无法解析的数据，避免丢失可能已发送的记录
    throw new RecoveryUnavailableError('本地退款记录无法读取')
  }
}

function writeAll(items: RecoveryContext[]) {
  const raw = JSON.stringify({ version: 1, items })
  try {
    if (recoveryFaults.failWrites) throw new Error('simulated')
    localStorage.setItem(STORAGE_KEY, raw)
    if (localStorage.getItem(STORAGE_KEY) !== raw) throw new Error('verify failed')
  } catch {
    throw new RecoveryUnavailableError('本地退款记录写入失败')
  }
}

async function withLock<T>(fn: (items: RecoveryContext[]) => { items?: RecoveryContext[]; result: T }): Promise<T> {
  if (!isCoordinationAvailable()) throw new RecoveryUnavailableError('浏览器不支持跨页签协调')
  const out = await navigator.locks.request(LOCK_NAME, { mode: 'exclusive' }, () => {
    const current = readAll()
    const { items, result } = fn(current)
    if (items) writeAll(items)
    return { result, changed: !!items }
  })
  if (out.changed) {
    channel?.postMessage('changed')
    emit()
  }
  return out.result
}

const inScope = (c: RecoveryContext, s: RecoveryScope) => c.tenant === s.tenant && c.userId === s.userId

function generateRefundNo() {
  const d = new Date()
  const p = (n: number, l = 2) => String(n).padStart(l, '0')
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  const rnd = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
  return `MR${stamp}${rnd}`
}

/** 读取当前用户/租户下的所有上下文（只读，不加锁） */
export function listRecovery(scope: RecoveryScope): RecoveryContext[] {
  return readAll().filter((c) => inScope(c, scope))
}

/**
 * 打开退款对话框：若该订单已有未完成上下文则原样返回（复用编号）；否则创建新 DRAFT。
 * 编号在锁内生成并持久化，不在每次点击时临时生成。
 */
export function openDraft(scope: RecoveryScope, paymentId: string): Promise<RecoveryContext> {
  return withLock((items) => {
    const existing = items.find((c) => inScope(c, scope) && c.paymentId === paymentId && OPEN_PHASES.includes(c.phase))
    if (existing) return { result: existing }
    const now = new Date().toISOString()
    const ctx: RecoveryContext = {
      ...scope,
      merchantRefundNo: generateRefundNo(),
      paymentId,
      amount: '',
      reason: '',
      phase: 'DRAFT',
      attempts: 0,
      createdAt: now,
      updatedAt: now,
      refundId: null,
      note: null,
      lastCheckedAt: null,
    }
    return { items: [ctx, ...items], result: ctx }
  })
}

/**
 * 发送前：在锁内把 DRAFT 原子地切换为 SENT_PENDING 并读回校验。
 * 若上下文已被其他页签推进（不再是 DRAFT），抛错，调用方不得发送。
 */
export function beginSend(scope: RecoveryScope, merchantRefundNo: string, params: { amount: string; reason: string }) {
  return withLock((items) => {
    const i = items.findIndex((c) => inScope(c, scope) && c.merchantRefundNo === merchantRefundNo)
    const ctx = items[i]
    if (!ctx) throw new RecoveryUnavailableError('本地退款记录已不存在，请重新打开退款窗口')
    if (ctx.phase !== 'DRAFT') throw new RecoveryUnavailableError('该退款已在其他页签提交，请刷新后查看')
    const next: RecoveryContext = {
      ...ctx,
      ...params,
      phase: 'SENT_PENDING',
      attempts: ctx.attempts + 1,
      updatedAt: new Date().toISOString(),
    }
    const copy = [...items]
    copy[i] = next
    return { items: copy, result: next }
  })
}

/**
 * 结果未确认或未受理后的重发：必须沿用原编号、原金额、原原因（R3/R4），
 * 在锁内把阶段推进回 SENT_PENDING 并累加次数。
 */
export function beginResend(scope: RecoveryScope, merchantRefundNo: string) {
  return withLock((items) => {
    const i = items.findIndex((c) => inScope(c, scope) && c.merchantRefundNo === merchantRefundNo)
    const ctx = items[i]
    if (!ctx) throw new RecoveryUnavailableError('本地退款记录已不存在，请重新打开退款窗口')
    if (!BLOCKING_PHASES.includes(ctx.phase)) throw new RecoveryUnavailableError('该退款状态已变化，请刷新后查看')
    const next: RecoveryContext = { ...ctx, phase: 'SENT_PENDING', attempts: ctx.attempts + 1, updatedAt: new Date().toISOString() }
    const copy = [...items]
    copy[i] = next
    return { items: copy, result: next }
  })
}

/** 更新上下文（结果确认、查询结果、失败说明等） */
export function patchRecovery(scope: RecoveryScope, merchantRefundNo: string, patch: Partial<RecoveryContext>) {
  return withLock((items) => {
    const i = items.findIndex((c) => inScope(c, scope) && c.merchantRefundNo === merchantRefundNo)
    if (i < 0) return { result: null }
    const copy = [...items]
    copy[i] = { ...copy[i]!, ...patch, updatedAt: new Date().toISOString() }
    return { items: copy, result: copy[i]! }
  })
}

/** 仅允许清理从未发送的草稿或首次即被确定性拒绝的草稿（R3 第 6 条） */
export function discardRecovery(scope: RecoveryScope, merchantRefundNo: string) {
  return withLock((items) => {
    const ctx = items.find((c) => inScope(c, scope) && c.merchantRefundNo === merchantRefundNo)
    if (!ctx) return { result: false }
    if (ctx.phase !== 'DRAFT' && ctx.phase !== 'REJECTED_DRAFT') {
      throw new RecoveryUnavailableError('可能已发送的退款记录不能清除')
    }
    return { items: items.filter((c) => c !== ctx), result: true }
  })
}
