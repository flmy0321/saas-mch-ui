<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { toast } from 'vue-sonner'
import { Monitor, Smartphone } from '@lucide/vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import Card from '@/components/ui/Card.vue'
import Button from '@/components/ui/Button.vue'
import FormField from '@/components/ui/FormField.vue'
import Input from '@/components/ui/Input.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useAsync } from '@/composables/useAsync'
import { api } from '@/services/api'
import { formatRelative } from '@/utils/format'
import type { LoginSession } from '@/types'

const pw = reactive({ current: '', next: '', confirm: '' })
const submitted = ref(false)
const saving = ref(false)

const rules = computed(() => [
  { ok: pw.next.length >= 8, label: '至少 8 位' },
  { ok: /[A-Za-z]/.test(pw.next) && /\d/.test(pw.next), label: '同时包含字母与数字' },
  { ok: !!pw.next && pw.next !== pw.current, label: '与当前密码不同' },
])
const errors = computed(() => ({
  current: !pw.current ? '请输入当前密码' : null,
  next: rules.value.every((r) => r.ok) ? null : '新密码不符合要求',
  confirm: pw.confirm !== pw.next ? '两次输入的密码不一致' : null,
}))

async function changePassword() {
  submitted.value = true
  if (Object.values(errors.value).some(Boolean)) return
  saving.value = true
  try {
    await api.account.changePassword({ current: pw.current, next: pw.next })
    toast.success('密码已修改', { description: '其他设备上的登录将在下次请求时失效' })
    Object.assign(pw, { current: '', next: '', confirm: '' })
    submitted.value = false
  } catch (e) {
    toast.error('修改失败', { description: e instanceof Error ? e.message : undefined })
  } finally {
    saving.value = false
  }
}

const sessions = useAsync(() => api.account.sessions())
const revoking = ref<LoginSession | null>(null)
const revokeOpen = computed({
  get: () => !!revoking.value,
  set: (v: boolean) => {
    if (!v) revoking.value = null
  },
})
const revokeBusy = ref(false)
async function revoke() {
  if (!revoking.value) return
  revokeBusy.value = true
  try {
    await api.account.revokeSession(revoking.value.id)
    toast.success('已退出该设备')
    revoking.value = null
    sessions.reload()
  } catch (e) {
    toast.error('操作失败', { description: e instanceof Error ? e.message : undefined })
  } finally {
    revokeBusy.value = false
  }
}
const isMobile = (s: LoginSession) => /iPhone|Android|iPad/i.test(s.device)
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader title="账号安全" description="定期修改密码并检查登录设备，保障资金与数据安全。" />

    <div class="grid gap-5 xl:grid-cols-2">
      <Card title="修改密码">
        <form class="flex flex-col gap-4" novalidate @submit.prevent="changePassword">
          <FormField label="当前密码" for="pw-cur" required :error="submitted ? errors.current : null">
            <Input id="pw-cur" v-model="pw.current" type="password" autocomplete="current-password" :invalid="submitted && !!errors.current" />
          </FormField>
          <FormField label="新密码" for="pw-new" required :error="submitted ? errors.next : null">
            <Input id="pw-new" v-model="pw.next" type="password" autocomplete="new-password" aria-describedby="pw-rules" :invalid="submitted && !!errors.next" />
          </FormField>
          <ul id="pw-rules" class="-mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <li v-for="r in rules" :key="r.label" :class="r.ok ? 'text-success' : 'text-muted-foreground'">
              <span aria-hidden="true">{{ r.ok ? '✓' : '·' }}</span> {{ r.label }}
            </li>
          </ul>
          <FormField label="确认新密码" for="pw-confirm" required :error="submitted ? errors.confirm : null">
            <Input id="pw-confirm" v-model="pw.confirm" type="password" autocomplete="new-password" :invalid="submitted && !!errors.confirm" />
          </FormField>
          <div class="flex justify-end">
            <Button type="submit" variant="primary" :loading="saving">修改密码</Button>
          </div>
        </form>
      </Card>

      <Card title="登录设备" description="不认识的设备请立即退出并修改密码">
        <ErrorState v-if="sessions.error.value" :message="sessions.error.value" @retry="sessions.reload()" />
        <div v-else-if="!sessions.data.value" class="flex flex-col gap-3"><Skeleton v-for="i in 3" :key="i" class="h-14" /></div>
        <ul v-else class="flex flex-col divide-y divide-border">
          <li v-for="s in sessions.data.value" :key="s.id" class="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Smartphone v-if="isMobile(s)" class="size-4" aria-hidden="true" />
              <Monitor v-else class="size-4" aria-hidden="true" />
            </span>
            <div class="flex min-w-0 flex-1 flex-col">
              <span class="flex items-center gap-2 text-[13px] font-medium">
                {{ s.device }} · {{ s.browser }}
                <StatusBadge v-if="s.current" tone="primary">当前设备</StatusBadge>
              </span>
              <span class="truncate text-xs text-muted-foreground tabular">{{ s.location }} · {{ s.ip }} · {{ formatRelative(s.lastActiveAt) }}</span>
            </div>
            <Button v-if="!s.current" variant="ghost" size="sm" class="text-danger hover:text-danger" @click="revoking = s">退出</Button>
          </li>
        </ul>
      </Card>
    </div>

    <ConfirmDialog
      v-model:open="revokeOpen"
      title="退出该设备？"
      :description="revoking ? `${revoking.device} · ${revoking.location} 上的登录将立即失效。` : ''"
      confirm-text="确认退出"
      danger
      :loading="revokeBusy"
      @confirm="revoke"
    />
  </div>
</template>
