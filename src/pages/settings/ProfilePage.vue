<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import PageHeader from '@/components/layout/PageHeader.vue'
import Card from '@/components/ui/Card.vue'
import Button from '@/components/ui/Button.vue'
import FormField from '@/components/ui/FormField.vue'
import Input from '@/components/ui/Input.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { useSessionStore } from '@/stores/session'
import { useAppStore, type ThemePreference } from '@/stores/app'
import { api } from '@/services/api'
import { formatDateTime } from '@/utils/format'

const session = useSessionStore()
const app = useAppStore()
const user = computed(() => session.user)

const name = ref('')
watch(user, (u) => u && (name.value = u.name), { immediate: true })
const submitted = ref(false)
const saving = ref(false)
const nameError = computed(() => (!name.value.trim() ? '请输入姓名' : name.value.trim().length > 20 ? '不超过 20 个字符' : null))

async function save() {
  submitted.value = true
  if (nameError.value) return
  saving.value = true
  try {
    session.user = await api.account.updateMe({ name: name.value.trim() })
    toast.success('个人信息已更新')
  } catch (e) {
    toast.error('保存失败', { description: e instanceof Error ? e.message : undefined })
  } finally {
    saving.value = false
  }
}

const themeOptions: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
]
const densityOptions = [
  { value: 'comfortable', label: '标准' },
  { value: 'compact', label: '紧凑' },
]
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader title="个人资料" description="管理你的账号信息与界面偏好。" />

    <div class="grid gap-5 xl:grid-cols-3">
      <Card title="账号信息" class="xl:col-span-2">
        <div v-if="!user" class="flex flex-col gap-4"><Skeleton v-for="i in 3" :key="i" class="h-14" /></div>
        <form v-else class="flex flex-col gap-4" novalidate @submit.prevent="save">
          <div class="grid gap-4 sm:grid-cols-2">
            <FormField label="姓名" for="p-name" required :error="submitted ? nameError : null">
              <Input id="p-name" v-model="name" autocomplete="name" :invalid="submitted && !!nameError" />
            </FormField>
            <FormField label="角色" for="p-role">
              <Input id="p-role" :model-value="user.role" disabled />
            </FormField>
            <FormField label="登录邮箱" for="p-email" hint="如需修改请联系商户管理员">
              <Input id="p-email" :model-value="user.email" disabled />
            </FormField>
            <FormField label="手机号" for="p-phone">
              <Input id="p-phone" :model-value="user.phone" disabled class="tabular" />
            </FormField>
          </div>
          <div class="flex items-center justify-between gap-3 border-t border-border pt-4">
            <p class="text-xs text-muted-foreground tabular">上次登录 {{ formatDateTime(user.lastLoginAt) }} · {{ user.lastLoginIp }}</p>
            <Button type="submit" variant="primary" :loading="saving" :disabled="name.trim() === user.name">保存</Button>
          </div>
        </form>
      </Card>

      <Card title="界面偏好">
        <div class="flex flex-col gap-5">
          <div class="flex flex-col gap-2">
            <span id="pref-theme" class="text-[13px] font-medium">主题</span>
            <SegmentedControl v-model="app.theme" :options="themeOptions" aria-labelledby="pref-theme" />
          </div>
          <div class="flex flex-col gap-2">
            <span id="pref-density" class="text-[13px] font-medium">表格密度</span>
            <SegmentedControl v-model="app.density" :options="densityOptions" aria-labelledby="pref-density" />
          </div>
        </div>
      </Card>
    </div>
  </div>
</template>
