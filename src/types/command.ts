import type { ApiKey, WebhookConfig } from '@/types'

export const STORE_COMMAND_VIEW_VERSION = 'portal-store-command-view/0.1-draft' as const
export const KEY_COMMAND_VIEW_VERSION = 'portal-key-command-view/0.1-draft' as const
export const WEBHOOK_COMMAND_VIEW_VERSION = 'portal-webhook-command-view/0.1-draft' as const

/** 配置版本：十进制字符串，不转 number，避免超过 2^53 时失真 */
export type ConfigurationVersion = string

/** 单次写入或按原号查询的回执；APPLIED 之外都视为结果未定 */
export type CommandReply<T> = { status: 'APPLIED'; result: T } | { status: 'UNKNOWN' } | { status: 'NOT_OBSERVED' }

export type CommandOutcome<T> =
  | { state: 'APPLIED'; result: T; recovered: boolean }
  | { state: 'PENDING'; commandId: string }

export type StoreWritableStatus = 'ACTIVE' | 'DISABLED'
export type StoreCommandOperation = 'stores.create' | 'stores.update'

export interface StoreCommandInput {
  merchantStoreNo: string
  name: string
  status: StoreWritableStatus
}

export interface StoreCommandStore {
  storeCode: string
  merchantStoreNo: string
  name: string
  status: StoreWritableStatus
  createdAt: string
  updatedAt: string
}

export interface StoreEditView {
  viewVersion: typeof STORE_COMMAND_VIEW_VERSION
  configurationVersion: ConfigurationVersion
  store: StoreCommandStore
}

export interface StoreCommandApplied {
  commandId: string
  configurationVersion: ConfigurationVersion
  store: StoreCommandStore
}

export type KeyCommandOperation = 'keys.create' | 'keys.rotate' | 'keys.revoke'

export interface KeyCommandApplied {
  commandId: string
  configurationVersion: ConfigurationVersion
  key: ApiKey
  /** 仅当响应带顶层 secret 时才有值；按原号查询恢复的结果不含明文 */
  secret: string | null
}

export interface WebhookEditView {
  viewVersion: typeof WEBHOOK_COMMAND_VIEW_VERSION
  configurationVersion: ConfigurationVersion
  config: WebhookConfig
}

export interface WebhookCommandApplied {
  commandId: string
  configurationVersion: ConfigurationVersion
}

export interface WebhookTestResult {
  /** COMPLETED：收到对端 HTTP 响应（是否成功看 httpStatus）；NOT_SENT：未能发出，httpStatus 为 0 */
  status: 'COMPLETED' | 'NOT_SENT'
  httpStatus: number
  durationMs: number
}
