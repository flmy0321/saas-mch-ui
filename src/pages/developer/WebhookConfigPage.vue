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
import Checkbox from '@/components/ui/Checkbox.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import { useAsync } from '@/composables/useAsync'
import { useAppPicker } from '@/composables/useAppPicker'
import { api } from '@/services/api'
import { WEBHOOK_EVENT } from '@/utils/dictionaries'
import { formatDateTime } from '@/utils/format'
import type { WebhookEventType } from '@/types'

const { options, appId } = useAppPicker()
const config = useAsync(() => (appId.value ? api.webhooks.getConfig(appId.value) : Promise.resolve(null)), { watch: appId })

const cfg = computed(() => config.data.value)
const form = reactive<{ url: string; enabled: boolean; events: WebhookEventType[] }>({ url: '', enabled: false, events: [] })
const submitted = ref(false)
const saving = ref(false)
const testing = ref(false)
const testResult = ref<{ ok: boolean; text: string } | null>(null)

watch(
  () => config.data.value,
  (c) => {
    if (!c) return
    Object.assign(form, { url: c.url, enabled: c.enabled, events: [...c.events] })
    submitted.value = false
    testResult.value = null
  },
  { immediate: true },
)

const groups: { title: string; events: WebhookEventType[] }[] = [
  { title: '支付事件', events: ['payment.succeeded', 'payment.failed', 'payment.closed'] },
  { title: '退款事件', events: ['refund.succeeded', 'refund.failed', 'refund.closed'] },
]

function toggleEvent(e: WebhookEventType, v: boolean) {
  form.events = v ? [...new Set([...form.events, e])] : form.events.filter((x) => x !== e)
}

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
const eventsError = computed(() => (form.enabled && !form.events.length ? '请至少订阅一个事件' : null))

const dirty = computed(() => {
  const c = config.data.value
  if (!c) return false
  return c.url !== form.url || c.enabled !== form.enabled || [...c.events].sort().join() !== [...form.events].sort().join()
})

async function save() {
  submitted.value = true
  if (urlError.value || eventsError.value) return
  saving.value = true
  try {
    await api.webhooks.updateConfig(appId.value, { url: form.url.trim(), enabled: form.enabled, events: form.events })
    toast.success('Webhook 配置已保存')
    config.reload()
  } catch (e) {
    toast.error('保存失败', { description: e instanceof Error ? e.message : undefined })
  } finally {
    saving.value = false
  }
}

async function sendTest() {
  testing.value = true
  testResult.value = null
  try {
    const r = await api.webhooks.sendTest(appId.value)
    const ok = r.httpStatus >= 200 && r.httpStatus < 300
    testResult.value = { ok, text: `HTTP ${r.httpStatus} · 耗时 ${r.durationMs} ms` }
  } catch (e) {
    testResult.value = { ok: false, text: e instanceof Error ? e.message : '推送失败' }
  } finally {
    testing.value = false
  }
}

function reset() {
  const c = config.data.value
  if (c) Object.assign(form, { url: c.url, enabled: c.enabled, events: [...c.events] })
  submitted.value = false
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader title="Webhook 配置" description="交易状态变化时，平台会向回调地址发送 POST 请求。返回 HTTP 2xx 视为成功，否则按退避策略最多重试 8 次。">
      <template #actions>
        <Select v-model="appId" :options="options" aria-label="选择应用" class="w-60" />
        <Button :as="RouterLink" :to="{ path: '/developer/deliveries', query: { appId } }">通知记录<ArrowRight aria-hidden="true" /></Button>
      </template>
    </PageHeader>

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

        <Card title="订阅事件" :description="eventsError && submitted ? undefined : '仅推送已勾选的事件类型'">
          <p v-if="submitted && eventsError" class="mb-3 text-[13px] text-danger" role="alert">{{ eventsError }}</p>
          <div class="grid gap-5 sm:grid-cols-2">
            <fieldset v-for="g in groups" :key="g.title" class="flex flex-col gap-2">
              <legend class="mb-1 text-xs font-medium text-muted-foreground">{{ g.title }}</legend>
              <label
                v-for="e in g.events"
                :key="e"
                class="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
              >
                <Checkbox :id="`ev-${e}`" :model-value="form.events.includes(e)" @update:model-value="(v: boolean) => toggleEvent(e, v)" />
                <span class="flex flex-col">
                  <span class="text-[13px] font-medium">{{ WEBHOOK_EVENT[e] }}</span>
                  <span class="font-mono text-xs text-muted-foreground">{{ e }}</span>
                </span>
              </label>
            </fieldset>
          </div>
        </Card>

        <div class="flex items-center justify-end gap-2">
          <span class="mr-auto text-xs text-muted-foreground">最近保存于 {{ formatDateTime(cfg?.updatedAt ?? "") }}</span>
          <Button type="button" :disabled="!dirty || saving" @click="reset">放弃修改</Button>
          <Button type="submit" variant="primary" :loading="saving" :disabled="!dirty">保存配置</Button>
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
