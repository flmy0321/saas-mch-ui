<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { toast } from 'vue-sonner'
import { ArrowRight, Send } from '@lucide/vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import Card from '@/components/ui/Card.vue'
import Button from '@/components/ui/Button.vue'
import Select from '@/components/ui/Select.vue'
import FormField from '@/components/ui/FormField.vue'
import Input from '@/components/ui/Input.vue'
import Switch from '@/components/ui/Switch.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import { useAsync } from '@/composables/useAsync'
import { useAppPicker } from '@/composables/useAppPicker'
import AppPickerStatus from '@/components/business/AppPickerStatus.vue'
import { api } from '@/services/api'
import { WEBHOOK_EVENT, webhookEventLabel } from '@/utils/dictionaries'
import { formatDateTime } from '@/utils/format'
import type { WebhookEventType } from '@/types'
import {
  forgetCommand,
  getPendingCommand,
  isVersionConflict,
  lookupUntilKnown,
  runCommand,
  webhookTestSucceeded,
  type PendingCommand,
} from '@/services/commands'
import type { CommandOutcome, WebhookCommandApplied, WebhookTestResult } from '@/types/command'

const eventTypes = Object.keys(WEBHOOK_EVENT) as WebhookEventType[]

const { apps, options, appId } = useAppPicker()
const config = useAsync(() => (appId.value ? api.webhooks.getConfig(appId.value) : Promise.resolve(null)), { watch: appId })

/** 编辑视图携带 configurationVersion（十进制字符串），保存时原样回传用于冲突检测 */
const edit = useAsync(() => (appId.value ? api.webhooks.editView(appId.value) : Promise.resolve(null)), { watch: appId })

const cfg = computed(() => config.data.value?.config ?? null)
const form = reactive<{ url: string; enabled: boolean }>({ url: '', enabled: false })
const submitted = ref(false)
const saving = ref(false)
const testing = ref(false)
const testResult = ref<{ ok: boolean; text: string } | null>(null)

watch(
  cfg,
  (c) => {
    if (!c) return
    Object.assign(form, { url: c.url ?? '', enabled: c.enabled })
    submitted.value = false
    testResult.value = null
  },
  { immediate: true },
)

const urlError = computed(() => {
  if (!form.url.trim()) return form.enabled ? '启用通知时必须填写回调地址' : null
  try {
    const u = new URL(form.url)
    if (u.protocol !== 'https:') return '回调地址必须使用 HTTPS 协议'
    if (['localhost', '127.0.0.1'].includes(u.hostname)) return '回调地址必须可从公网访问'
  } catch {
    return '请输入有效的 URL'
  }
  return null
})
const dirty = computed(() => {
  const c = cfg.value
  if (!c) return false
  return (c.url ?? '') !== form.url || c.enabled !== form.enabled
})

const saveScope = (app: string) => `webhook.save:${app}`
const testScope = (app: string) => `webhook.test:${app}`
const pendingSave = ref<PendingCommand | null>(null)
const pendingTest = ref<PendingCommand | null>(null)
watch(
  appId,
  (a) => {
    pendingSave.value = a ? getPendingCommand(saveScope(a)) : null
    pendingTest.value = a ? getPendingCommand(testScope(a)) : null
  },
  { immediate: true },
)

function reloadAll() {
  config.reload()
  edit.reload()
}

function settleSave(outcome: CommandOutcome<WebhookCommandApplied>) {
  if (outcome.state === 'PENDING') {
    pendingSave.value = getPendingCommand(saveScope(appId.value))
    toast.warning('保存结果待确认', { description: '请求已发出但未收到确定结果，请稍后重新查询，不要重复提交。' })
    return
  }
  pendingSave.value = null
  toast.success(outcome.recovered ? '已确认配置保存成功' : 'Webhook 配置已保存')
  reloadAll()
}

function settleTest(outcome: CommandOutcome<WebhookTestResult>) {
  if (outcome.state === 'PENDING') {
    pendingTest.value = getPendingCommand(testScope(appId.value))
    testResult.value = { ok: false, text: '测试结果待确认，请稍后重新查询' }
    return
  }
  pendingTest.value = null
  const r = outcome.result
  if (r.status === 'NOT_SENT') {
    testResult.value = { ok: false, text: `未能发出请求 · 耗时 ${r.durationMs} ms` }
    return
  }
  const ok = webhookTestSucceeded(r)
  testResult.value = { ok, text: `对端返回 HTTP ${r.httpStatus} · 耗时 ${r.durationMs} ms` }
}

const lookupSave = (cmd: PendingCommand) => api.webhooks.lookupSave(cmd.commandId, cmd.params.appId)
const lookupTest = (cmd: PendingCommand) => api.webhooks.lookupTest(cmd.commandId, cmd.params.appId)

async function save() {
  submitted.value = true
  if (urlError.value || pendingSave.value) return
  const version = edit.data.value?.configurationVersion
  if (!version) {
    toast.error('编辑数据未加载完成，请稍后再试')
    return
  }
  const app = appId.value
  const input = { url: form.url.trim() || null, enabled: form.enabled }
  saving.value = true
  try {
    settleSave(
      await runCommand({
        scope: saveScope(app),
        params: { appId: app },
        send: (commandId) => api.webhooks.updateConfig(commandId, app, version, input),
        lookup: lookupSave,
      }),
    )
  } catch (e) {
    if (isVersionConflict(e)) {
      toast.error('配置已被其他人修改', { description: '已重新读取最新配置，请核对后再保存。' })
      reloadAll()
      return
    }
    toast.error('保存失败', { description: e instanceof Error ? e.message : undefined })
  } finally {
    saving.value = false
  }
}

async function recheckSave() {
  if (!pendingSave.value) return
  saving.value = true
  try {
    settleSave(await lookupUntilKnown(pendingSave.value, lookupSave, { attempts: 1, intervalMs: 0 }))
  } finally {
    saving.value = false
  }
}

async function recheckTest() {
  if (!pendingTest.value) return
  testing.value = true
  try {
    settleTest(await lookupUntilKnown(pendingTest.value, lookupTest, { attempts: 1, intervalMs: 0 }))
  } finally {
    testing.value = false
  }
}

function abandonPending() {
  forgetCommand(saveScope(appId.value))
  forgetCommand(testScope(appId.value))
  pendingSave.value = null
  pendingTest.value = null
  reloadAll()
}

async function sendTest() {
  if (pendingTest.value) return
  const app = appId.value
  testing.value = true
  testResult.value = null
  try {
    settleTest(
      await runCommand({
        scope: testScope(app),
        params: { appId: app },
        send: (commandId) => api.webhooks.sendTest(commandId, app),
        lookup: lookupTest,
      }),
    )
  } catch (e) {
    testResult.value = { ok: false, text: e instanceof Error ? e.message : '推送失败' }
  } finally {
    testing.value = false
  }
}

function reset() {
  const c = cfg.value
  if (c) Object.assign(form, { url: c.url ?? '', enabled: c.enabled })
  submitted.value = false
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader title="Webhook 配置" description="交易状态变化时，平台会向回调地址发送 POST 请求。返回 HTTP 2xx 视为成功，否则按退避策略最多重试 8 次。">
      <template #actions>
        <Select v-model="appId" :options="options" aria-label="选择应用" class="w-60" />
        <AppPickerStatus :apps="apps" />
        <Button :as="RouterLink" :to="{ path: '/developer/deliveries', query: { appId } }">通知记录<ArrowRight aria-hidden="true" /></Button>
      </template>
    </PageHeader>

    <div
      v-if="pendingSave || pendingTest"
      role="status"
      class="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning-soft p-3 text-[13px] sm:flex-row sm:items-center"
    >
      <p class="flex-1">
        上一次{{ pendingSave ? '保存' : '测试' }}请求（命令号
        <span class="font-mono">{{ (pendingSave ?? pendingTest)!.commandId }}</span>）结果尚未确认，请先重新查询，不要重复提交。
      </p>
      <div class="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="primary"
          :loading="saving || testing"
          @click="pendingSave ? recheckSave() : recheckTest()"
        >
          重新查询结果
        </Button>
        <Button type="button" size="sm" variant="ghost" :disabled="saving || testing" @click="abandonPending">已核实，放弃此请求</Button>
      </div>
    </div>

    <ErrorState v-if="config.error.value" :message="config.error.value" class="py-20" @retry="config.reload()" />
    <div v-else-if="!config.data.value" class="flex flex-col gap-4"><Skeleton class="h-40" /><Skeleton class="h-56" /></div>

    <form v-else class="grid gap-5 xl:grid-cols-3" novalidate @submit.prevent="save">
      <div class="flex flex-col gap-5 xl:col-span-2">
        <Card title="回调地址">
          <div class="flex flex-col gap-4">
            <div class="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <label for="wh-enabled" class="text-[13px] font-medium">启用事件通知</label>
                <p class="text-xs text-muted-foreground">关闭后将不再推送新事件，已入队的重试也会停止。</p>
              </div>
              <Switch id="wh-enabled" v-model="form.enabled" />
            </div>
            <FormField label="回调 URL" for="wh-url" :required="form.enabled" :error="submitted ? urlError : null" hint="必须为 HTTPS，且在 5 秒内响应">
              <Input id="wh-url" v-model="form.url" class="font-mono" placeholder="https://api.example.com/webhooks/pay" :invalid="submitted && !!urlError" />
            </FormField>
            <div class="flex flex-wrap items-center gap-3">
              <Button type="button" :loading="testing" :disabled="!cfg?.url || dirty" @click="sendTest">
                <Send aria-hidden="true" />发送测试通知
              </Button>
              <span v-if="dirty" class="text-xs text-muted-foreground">请先保存配置再测试</span>
              <span
                v-else-if="testResult"
                class="text-[13px]"
                :class="testResult.ok ? 'text-success' : 'text-danger'"
                role="status"
              >
                {{ testResult.ok ? '推送成功' : '推送失败' }} · {{ testResult.text }}
              </span>
            </div>
          </div>
        </Card>

        <Card title="订阅事件" description="事件订阅暂不在门户配置范围内">
          <p class="text-[13px] leading-relaxed text-muted-foreground">
            当前配置视图只包含回调地址与启用状态，不返回订阅事件，门户也不提交订阅修改。如需调整推送的事件类型，请联系平台。
          </p>
          <ul class="mt-3 flex flex-wrap gap-2">
            <li v-for="e in eventTypes" :key="e" class="rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
              {{ e }} · {{ webhookEventLabel(e) }}
            </li>
          </ul>
        </Card>

        <div class="flex items-center justify-end gap-2">
          <span v-if="config.data.value" class="mr-auto text-xs text-muted-foreground tabular">数据截至 {{ formatDateTime(config.data.value.asOf) }}</span>
          <span v-else class="mr-auto" />
          <Button type="button" :disabled="!dirty || saving" @click="reset">放弃修改</Button>
          <Button type="submit" variant="primary" :loading="saving" :disabled="!dirty || !!pendingSave || !edit.data.value">保存配置</Button>
        </div>
      </div>

      <Card title="签名验证" description="请在服务端校验每个请求的签名">
        <div class="flex flex-col gap-3 text-[13px] leading-relaxed">
          <p class="text-muted-foreground">每个通知请求包含以下请求头：</p>
          <ul class="flex flex-col gap-1.5 font-mono text-xs">
            <li class="rounded bg-muted px-2 py-1">X-Pay-Event-Id</li>
            <li class="rounded bg-muted px-2 py-1">X-Pay-Timestamp</li>
            <li class="rounded bg-muted px-2 py-1">X-Pay-Signature</li>
          </ul>
          <p class="text-muted-foreground">
            使用 API Secret 对 <code class="font-mono text-xs text-foreground">timestamp + "." + body</code> 计算 HMAC-SHA256，与签名比对。同一 Event ID 可能被重复推送，请做好幂等处理。
          </p>
          <RouterLink to="/developer/docs" class="text-primary hover:underline">查看完整接入文档</RouterLink>
        </div>
      </Card>
    </form>
  </div>
</template>
