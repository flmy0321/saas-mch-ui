<script setup lang="ts">
import { computed, h, ref } from 'vue'
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
import { api } from '@/services/api'
import { API_KEY_STATUS } from '@/utils/dictionaries'
import { formatDateTime } from '@/utils/format'
import type { ApiKey, CreatedApiKey } from '@/types'

const { options, appId, current } = useAppPicker()
const keys = useAsync(() => (appId.value ? api.keys.list(appId.value) : Promise.resolve([])), { watch: appId })

const creating = ref(false)
const created = ref<CreatedApiKey | null>(null)
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

const usable = computed(() => (keys.data.value ?? []).filter((k) => k.status === 'ACTIVE' || k.status === 'EXPIRING').length)

function showSecret(k: CreatedApiKey, mode: 'create' | 'rotate') {
  savedAck.value = false
  createdMode.value = mode
  created.value = k
}

async function createKey() {
  if (!appId.value) return
  creating.value = true
  try {
    showSecret(await api.keys.create(appId.value), 'create')
    keys.reload()
  } catch (e) {
    toast.error('创建失败', { description: e instanceof Error ? e.message : undefined })
  } finally {
    creating.value = false
  }
}

async function runConfirm() {
  if (!confirm.value) return
  const { kind, key } = confirm.value
  confirming.value = true
  try {
    if (kind === 'rotate') {
      showSecret(await api.keys.rotate(key.id), 'rotate')
    } else {
      await api.keys.revoke(key.id)
      toast.success('密钥已撤销', { description: key.keyId })
    }
    confirm.value = null
    keys.reload()
  } catch (e) {
    toast.error(kind === 'rotate' ? '轮换失败' : '撤销失败', { description: e instanceof Error ? e.message : undefined })
  } finally {
    confirming.value = false
  }
}

const muted = (t: string) => h('span', { class: 'whitespace-nowrap text-muted-foreground tabular' }, t)
const columns: ColumnDef<ApiKey>[] = [
  { id: 'keyId', header: 'Key ID', cell: ({ row }) => h('span', { class: 'font-mono text-[13px]' }, row.original.keyId) },
  { id: 'secret', header: '密钥', cell: ({ row }) => h('span', { class: 'font-mono text-xs text-muted-foreground' }, row.original.maskedSecret) },
  {
    id: 'status',
    header: '状态',
    cell: ({ row }) => h(StatusBadge, { tone: API_KEY_STATUS[row.original.status].tone, dot: true }, () => API_KEY_STATUS[row.original.status].label),
  },
  { id: 'createdAt', header: '创建时间', cell: ({ row }) => muted(formatDateTime(row.original.createdAt)) },
  { id: 'expireAt', header: '失效时间', cell: ({ row }) => muted(row.original.expireAt ? formatDateTime(row.original.expireAt) : '长期有效') },
  { id: 'lastUsedAt', header: '最近使用', cell: ({ row }) => muted(row.original.lastUsedAt ? formatDateTime(row.original.lastUsedAt) : '从未使用') },
  {
    id: 'actions',
    header: () => h('span', { class: 'sr-only' }, '操作'),
    meta: { align: 'right' },
    cell: ({ row }) => {
      const k = row.original
      if (k.status !== 'ACTIVE' && k.status !== 'EXPIRING') return null
      return h('div', { class: 'flex justify-end gap-1' }, [
        h(Button, { variant: 'ghost', size: 'sm', onClick: () => (confirm.value = { kind: 'rotate', key: k }) }, () => [
          h(RefreshCw, { 'aria-hidden': 'true' }),
          '轮换',
        ]),
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
        <Button variant="primary" :loading="creating" :disabled="!appId" @click="createKey"><Plus aria-hidden="true" />创建密钥</Button>
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

    <Card body-class="p-0">
      <div class="flex items-center justify-between px-4 py-3 sm:px-5">
        <p class="text-[13px] text-muted-foreground">
          可用密钥 <span class="font-medium text-foreground tabular">{{ usable }}</span> / 最多 2 个
        </p>
      </div>
      <DataTable
        :columns="columns"
        :data="keys.data.value ?? []"
        :loading="keys.loading.value"
        :error="keys.error.value"
        :row-key="(k: ApiKey) => k.id"
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
            <span class="flex-1 break-all">{{ created.keyId }}</span><CopyButton :value="created.keyId" />
          </div>
        </div>
        <div class="flex flex-col gap-1.5">
          <span class="text-xs font-medium text-muted-foreground">Secret</span>
          <div class="flex items-center gap-2 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 font-mono text-[13px]">
            <span class="flex-1 break-all">{{ created.plainSecret }}</span><CopyButton :value="created.plainSecret" label="复制密钥" />
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
