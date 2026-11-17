import { API_KEY_STATUSES, type ApiKey, type WebhookConfig } from '@/types'
import { ApiError } from '@/services/api/types'
import {
  KEY_COMMAND_VIEW_VERSION,
  STORE_COMMAND_VIEW_VERSION,
  WEBHOOK_COMMAND_VIEW_VERSION,
  type CommandReply,
  type KeyCommandApplied,
  type StoreCommandApplied,
  type StoreCommandStore,
  type StoreEditView,
  type WebhookCommandApplied,
  type WebhookEditView,
  type WebhookTestResult,
} from '@/types/command'

type Obj = Record<string, unknown>

function invalid(what: string, detail: string): never {
  throw new ApiError(`${what}响应格式不符合约定：${detail}`, 'INVALID_RESPONSE')
}

const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const isStrOrNull = (v: unknown): v is string | null => v === null || isStr(v)
const isDecimal = (v: unknown): v is string => typeof v === 'string' && /^(0|[1-9]\d*)$/.test(v)

function root(raw: unknown, version: string, what: string): Obj {
  if (!isObj(raw)) invalid(what, '响应不是对象')
  if (raw.viewVersion !== undefined && raw.viewVersion !== version) invalid(what, `viewVersion 应为 ${version}`)
  return raw
}

function version(o: Obj, what: string): string {
  if (!isDecimal(o.configurationVersion)) invalid(what, 'configurationVersion 必须为十进制字符串')
  return o.configurationVersion
}

function sameCommand(o: Obj, commandId: string, what: string) {
  if (o.commandId !== commandId) invalid(what, 'commandId 与提交的命令号不一致')
}

function pendingOr<T>(o: Obj, what: string, applied: () => T): CommandReply<T> {
  if (o.status === 'APPLIED') return { status: 'APPLIED', result: applied() }
  if (o.status === 'UNKNOWN' || o.status === 'NOT_OBSERVED') return { status: o.status }
  return invalid(what, `未知的命令状态 ${String(o.status)}`)
}

const STORE_STATUSES = ['ACTIVE', 'DISABLED'] as const

function checkStore(v: unknown, what: string): StoreCommandStore {
  if (!isObj(v)) invalid(what, 'store 缺失')
  if (!isStr(v.storeCode) || !isStr(v.merchantStoreNo) || !isStr(v.name)) invalid(what, 'store 字段缺失')
  if (!STORE_STATUSES.includes(v.status as never)) invalid(what, 'store.status 不合法')
  if (!isStr(v.createdAt) || !isStr(v.updatedAt)) invalid(what, 'store 时间字段缺失')
  return {
    storeCode: v.storeCode,
    merchantStoreNo: v.merchantStoreNo,
    name: v.name,
    status: v.status as StoreCommandStore['status'],
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  }
}

export function parseStoreEdit(raw: unknown, storeCode: string): StoreEditView {
  const what = '门店编辑数据'
  const o = root(raw, STORE_COMMAND_VIEW_VERSION, what)
  if (o.viewVersion !== STORE_COMMAND_VIEW_VERSION) invalid(what, 'viewVersion 缺失')
  const store = checkStore(o.store, what)
  if (store.storeCode !== storeCode) invalid(what, 'storeCode 与请求不一致')
  return { viewVersion: STORE_COMMAND_VIEW_VERSION, configurationVersion: version(o, what), store }
}

export function parseStoreCommand(raw: unknown, commandId: string): CommandReply<StoreCommandApplied> {
  const what = '门店命令'
  const o = root(raw, STORE_COMMAND_VIEW_VERSION, what)
  return pendingOr(o, what, () => {
    sameCommand(o, commandId, what)
    return { commandId, configurationVersion: version(o, what), store: checkStore(o.store, what) }
  })
}

function checkKey(v: unknown, appId: string, what: string): ApiKey {
  if (!isObj(v)) invalid(what, 'key 缺失')
  if (v.appId !== appId || !isStr(v.keyId)) invalid(what, 'key 标识不一致')
  if (!API_KEY_STATUSES.includes(v.status as never)) invalid(what, 'key.status 不合法')
  if (!isStr(v.createdAt) || !isStr(v.validFrom) || !isStrOrNull(v.validUntil) || !isStrOrNull(v.revokedAt)) {
    invalid(what, 'key 时间字段不合法')
  }
  return {
    appId,
    keyId: v.keyId,
    status: v.status as ApiKey['status'],
    createdAt: v.createdAt,
    validFrom: v.validFrom,
    validUntil: v.validUntil,
    revokedAt: v.revokedAt,
  }
}

export function parseKeyCommand(raw: unknown, commandId: string, appId: string): CommandReply<KeyCommandApplied> {
  const what = 'API Key 命令'
  const o = root(raw, KEY_COMMAND_VIEW_VERSION, what)
  return pendingOr(o, what, () => {
    sameCommand(o, commandId, what)
    if (o.secret !== undefined && !isStr(o.secret)) invalid(what, 'secret 不合法')
    return {
      commandId,
      configurationVersion: version(o, what),
      key: checkKey(o.key, appId, what),
      secret: isStr(o.secret) ? o.secret : null,
    }
  })
}

function checkWebhookConfig(v: unknown, appId: string, what: string): WebhookConfig {
  if (!isObj(v) || v.appId !== appId) invalid(what, 'config 缺失或 appId 不一致')
  if (!isStrOrNull(v.url) || typeof v.enabled !== 'boolean') invalid(what, 'config 字段不合法')
  return { appId, url: v.url, enabled: v.enabled }
}

export function parseWebhookEdit(raw: unknown, appId: string): WebhookEditView {
  const what = 'Webhook 编辑数据'
  const o = root(raw, WEBHOOK_COMMAND_VIEW_VERSION, what)
  if (o.viewVersion !== WEBHOOK_COMMAND_VIEW_VERSION) invalid(what, 'viewVersion 缺失')
  return { viewVersion: WEBHOOK_COMMAND_VIEW_VERSION, configurationVersion: version(o, what), config: checkWebhookConfig(o.config, appId, what) }
}

export function parseWebhookCommand(raw: unknown, commandId: string): CommandReply<WebhookCommandApplied> {
  const what = 'Webhook 保存'
  const o = root(raw, WEBHOOK_COMMAND_VIEW_VERSION, what)
  return pendingOr(o, what, () => {
    sameCommand(o, commandId, what)
    return { commandId, configurationVersion: version(o, what) }
  })
}

export function parseWebhookTest(raw: unknown, commandId: string): CommandReply<WebhookTestResult> {
  const what = 'Webhook 测试'
  const o = root(raw, WEBHOOK_COMMAND_VIEW_VERSION, what)
  if (o.status === 'UNKNOWN' || o.status === 'NOT_OBSERVED') return { status: o.status }
  if (o.status !== 'COMPLETED' && o.status !== 'NOT_SENT') invalid(what, `未知的测试状态 ${String(o.status)}`)
  sameCommand(o, commandId, what)
  const http = o.httpStatus
  const ms = o.durationMs
  if (typeof http !== 'number' || !Number.isInteger(http) || http < 0 || http > 599) invalid(what, 'httpStatus 不合法')
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) invalid(what, 'durationMs 不合法')
  if (o.status === 'NOT_SENT' && http !== 0) invalid(what, 'NOT_SENT 的 httpStatus 必须为 0')
  if (o.status === 'COMPLETED' && (http < 100 || http > 599)) invalid(what, 'COMPLETED 必须带有效 HTTP 状态')
  return { status: 'APPLIED', result: { status: o.status, httpStatus: http, durationMs: ms } }
}
