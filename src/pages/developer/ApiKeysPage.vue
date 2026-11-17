<script setup lang="ts">
import { computed, h, ref, watch } from 'vue'
import type { ColumnDef } from '@tanstack/vue-table'
import { toast } from 'vue-sonner'
import { AlertTriangle, Plus, RefreshCw, ShieldOff } from '@lucide/vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import Card from '@/components/ui/Card.vue'
import Button from '@/components/ui/Button.vue'
import Select from '@/components/ui/Select.vue'
import DataTable from '@/components/ui/DataTable.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import Dialog from '@/components/ui/Dialog.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import Checkbox from '@/components/ui/Checkbox.vue'
import { useAsync } from '@/composables/useAsync'
import { useAppPicker } from '@/composables/useAppPicker'
import AppPickerStatus from '@/components/business/AppPickerStatus.vue'
import { api } from '@/services/api'
import { API_KEY_STATUS } from '@/utils/dictionaries'
import { formatDateTime } from '@/utils/format'
import type { ApiKey } from '@/types'
import { forgetCommand, getPendingCommand, lookupUntilKnown, runCommand, type PendingCommand } from '@/services/commands'
import type { CommandOutcome, KeyCommandApplied, KeyCommandOperation } from '@/types/command'

const { apps, options, appId, current } = useAppPicker()
const keys = useAsync(
  () => (appId.value ? api.keys.list({ appId: appId.value, page: 1, pageSize: 100 }) : Promise.resolve(null)),
  { watch: appId },
)
const keyItems = computed(() => keys.data.value?.items ?? [])

const creating = ref(false)
const created = ref<{ key: ApiKey; secret: string } | null>(null)
const createdMode = ref<'create' | 'rotate'>('create')
const savedAck = ref(false)

const confirm = ref<{ kind: 'rotate' | 'revoke'; key: ApiKey } | null>(null)
const confirmOpen = computed({
  get: () => !!confirm.value,
  set: (v: boolean) => {
    if (!v) confirm.value = null
  },
})
const confirming = ref(false)

const usable = computed(() => keyItems.value.filter((k) => k.status !== 'REVOKED').length)

const scopeOf = (app: string) => `keys:${app}`
const pending = ref<PendingCommand | null>(null)
const rechecking = ref(false)
watch(appId, (a) => (pending.value = a ? getPendingCommand(scopeOf(a)) : null), { immediate: true })

const lookupKey = (cmd: PendingCommand) =>
  api.keys.lookupCommand(cmd.commandId, {
    appId: cmd.params.appId,
    operation: cmd.params.operation as KeyCommandOperation,
    keyId: cmd.params.keyId || undefined,
  })

const OP_LABEL: Record<KeyCommandOperation, string> = { 'keys.create': '创建', 'keys.rotate': '轮换', 'keys.revoke': '撤销' }

function settle(op: KeyCommandOperation, outcome: CommandOutcome<KeyCommandApplied>) {
  const label = OP_LABEL[op]
  if (outcome.state === 'PENDING') {
    pending.value = appId.value ? getPendingCommand(scopeOf(appId.value)) : null
    toast.warning(`${label}结果待确认`, { description: '请求已发出但未收到确定结果，请稍后重新查询，不要重复操作。' })
    return
  }
  pending.value = null
  keys.reload()
  const { key, secret } = outcome.result
  if (op === 'keys.revoke') {
    toast.success(outcome.recovered ? '已确认密钥撤销成功' : '密钥已撤销', { description: key.keyId })
    return
  }
  if (secret !== null) {
    savedAck.value = false
    createdMode.value = op === 'keys.rotate' ? 'rotate' : 'create'
    created.value = { key, secret }
    return
  }
  // 结果经按原号查询确认：已生效，但明文密钥不会再次返回
  toast.warning(`密钥已${label}，但明文无法再次获取`, {
    description: `新密钥 ${key.keyId} 的明文已丢失，请立即撤销或再次轮换该密钥后重新保存。`,
    duration: 15000,
  })
}

async function send(op: KeyCommandOperation, key?: ApiKey) {
  const app = appId.value
  return runCommand({
    scope: scopeOf(app),
    params: { appId: app, operation: op, keyId: key?.keyId ?? '' },
    send: (commandId) =>
      op === 'keys.create'
        ? api.keys.create(commandId, app)
        : op === 'keys.rotate'
          ? api.keys.rotate(commandId, app, key!.keyId)
          : api.keys.revoke(commandId, app, key!.keyId),
    lookup: lookupKey,
  })
}

async function createKey() {
  if (!appId.value || pending.value) return
  creating.value = true
  try {
    settle('keys.create', await send('keys.create'))
  } catch (e) {
    toast.error('创建失败', { description: e instanceof Error ? e.message : undefined })
  } finally {
    creating.value = false
  }
}

async function runConfirm() {
  if (!confirm.value || pending.value) return
  const { kind, key } = confirm.value
  const op: KeyCommandOperation = kind === 'rotate' ? 'keys.rotate' : 'keys.revoke'
  confirming.value = true
  try {
    settle(op, await send(op, key))
    confirm.value = null
  } catch (e) {
    toast.error(kind === 'rotate' ? '轮换失败' : '撤销失败', { description: e instanceof Error ? e.message : undefined })
  } finally {
    confirming.value = false
  }
}

async function recheck() {
  const p = pending.value
  if (!p) return
  rechecking.value = true
  try {
    settle(p.params.operation as KeyCommandOperation, await lookupUntilKnown(p, lookupKey, { attempts: 1, intervalMs: 0 }))
  } finally {
    rechecking.value = false
  }
}

function abandon() {
  if (!appId.value) return
  forgetCommand(scopeOf(appId.value))
  pending.value = null
  keys.reload()
}

const muted = (t: string) => h('span', { class: 'whitespace-nowrap text-muted-foreground tabular' }, t)
const columns: ColumnDef<ApiKey>[] = [
  { id: 'keyId', header: 'Key ID', cell: ({ row }) => h('span', { class: 'font-mono text-[13px]' }, row.original.keyId) },
  {
    id: 'status',
    header: '状态',
    cell: ({ row }) => h(StatusBadge, { tone: API_KEY_STATUS[row.original.status].tone, dot: true }, () => API_KEY_STATUS[row.original.status].label),
  },
  { id: 'createdAt', header: '创建时间', cell: ({ row }) => muted(formatDateTime(row.original.createdAt)) },
  { id: 'validFrom', header: '生效时间', cell: ({ row }) => muted(formatDateTime(row.original.validFrom)) },
  {
    id: 'validUntil',
    header: '有效期至',
    cell: ({ row }) => muted(row.original.validUntil ? formatDateTime(row.original.validUntil) : '长期有效'),
  },
  {
    id: 'revokedAt',
    header: '撤销时间',
    cell: ({ row }) => muted(row.original.revokedAt ? formatDateTime(row.original.revokedAt) : '—'),
  },
  {
    id: 'actions',
    header: () => h('span', { class: 'sr-only' }, '操作'),
    meta: { align: 'right' },
    cell: ({ row }) => {
      const k = row.original
      if (k.status === 'REVOKED') return null
      return h('div', { class: 'flex justify-end gap-1' }, [
        k.status === 'ACTIVE'
          ? h(Button, { variant: 'ghost', size: 'sm', onClick: () => (confirm.value = { kind: 'rotate', key: k }) }, () => [
              h(RefreshCw, { 'aria-hidden': 'true' }),
              '轮换',
            ])
          : null,
        h(Button, { variant: 'ghost', size: 'sm', class: 'text-danger hover:text-danger', onClick: () => (confirm.value = { kind: 'revoke', key: k }) }, () => [
          h(ShieldOff, { 'aria-hidden': 'true' }),
          '撤销',
        ]),
      ])
    },
  },
]
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader title="API 密钥" description="密钥用于服务端调用开放接口时的签名认证。请妥善保管，切勿在客户端或代码仓库中暴露。">
      <template #actions>
        <Select v-model="appId" :options="options" aria-label="选择应用" class="w-60" />
        <AppPickerStatus :apps="apps" />
        <Button variant="primary" :loading="creating" :disabled="!appId || !!pending" @click="createKey"><Plus aria-hidden="true" />创建密钥</Button>
      </template>
    </PageHeader>

    <div
      v-if="current?.env === 'production'"
      class="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-[13px] leading-relaxed"
      role="note"
    >
      <AlertTriangle class="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
      <p>
        当前为<strong class="font-semibold">生产环境</strong>应用。轮换密钥后旧密钥会在过渡期结束后失效，请在过渡期内完成服务端配置更新。过渡期时长以正式密钥策略为准，当前 Mock 演示为 24 小时。
      </p>
    </div>

    <div v-if="pending" role="status" class="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning-soft p-3 text-[13px] sm:flex-row sm:items-center">
      <p class="flex-1">
        上一次{{ OP_LABEL[pending.params.operation as KeyCommandOperation] }}请求（命令号
        <span class="font-mono">{{ pending.commandId }}</span>）结果尚未确认。确认前已暂停其他密钥操作，以免重复生效。
      </p>
      <div class="flex gap-2">
        <Button size="sm" variant="primary" :loading="rechecking" @click="recheck">重新查询结果</Button>
        <Button size="sm" variant="ghost" :disabled="rechecking" @click="abandon">已核实，放弃此请求</Button>
      </div>
    </div>

    <Card body-class="p-0">
      <div class="flex items-center justify-between px-4 py-3 sm:px-5">
        <p class="text-[13px] text-muted-foreground">
          可用密钥 <span class="font-medium text-foreground tabular">{{ usable }}</span> / 最多 2 个
        </p>
        <p v-if="keys.data.value" class="text-xs text-muted-foreground tabular">数据截至 {{ formatDateTime(keys.data.value.asOf) }}</p>
      </div>
      <DataTable
        :columns="columns"
        :data="keyItems"
        :loading="keys.loading.value"
        :error="keys.error.value"
        :row-key="(k: ApiKey) => k.keyId"
        :skeleton-rows="3"
        empty-title="尚未创建密钥"
        empty-description="创建密钥后即可通过开放接口发起支付与退款。"
        @retry="keys.reload()"
      />
    </Card>

    <Dialog
      :open="!!created"
      :title="createdMode === 'rotate' ? '密钥已轮换' : '密钥创建成功'"
      description="密钥明文仅显示这一次，关闭后将无法再次查看。"
      :dismissible="false"
      @update:open="(v: boolean) => !v && savedAck && (created = null)"
    >
      <div v-if="created" class="flex flex-col gap-4">
        <div class="flex flex-col gap-1.5">
          <span class="text-xs font-medium text-muted-foreground">Key ID</span>
          <div class="flex items-center gap-2 rounded-md bg-muted px-3 py-2 font-mono text-[13px]">
            <span class="flex-1 break-all">{{ created.key.keyId }}</span><CopyButton :value="created.key.keyId" />
          </div>
        </div>
        <div class="flex flex-col gap-1.5">
          <span class="text-xs font-medium text-muted-foreground">Secret</span>
          <div class="flex items-center gap-2 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 font-mono text-[13px]">
            <span class="flex-1 break-all">{{ created.secret }}</span><CopyButton :value="created.secret" label="复制密钥" />
          </div>
        </div>
        <label class="flex items-center gap-2 text-[13px]">
          <Checkbox id="ack" v-model="savedAck" />我已将密钥安全保存
        </label>
      </div>
      <template #footer>
        <Button variant="primary" :disabled="!savedAck" @click="created = null">完成</Button>
      </template>
    </Dialog>

    <ConfirmDialog
      v-model:open="confirmOpen"
      :title="confirm?.kind === 'rotate' ? '轮换密钥？' : '撤销密钥？'"
      :description="
        confirm?.kind === 'rotate'
          ? '将生成新密钥，旧密钥进入过渡期后失效（过渡期以正式密钥策略为准，Mock 演示为 24 小时）。'
          : '撤销后使用该密钥的请求将立即被拒绝，此操作不可恢复。'
      "
      :confirm-text="confirm?.kind === 'rotate' ? '确认轮换' : '确认撤销'"
      :danger="confirm?.kind === 'revoke'"
      :loading="confirming"
      @confirm="runConfirm"
    >
      <p v-if="confirm" class="rounded-md bg-muted px-3 py-2 font-mono text-[13px]">{{ confirm.key.keyId }}</p>
    </ConfirmDialog>
  </div>
</template>
