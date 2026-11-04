<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Eye, EyeOff, LockKeyhole, RefreshCw, ShieldCheck, UserRound } from '@lucide/vue'
import Button from '@/components/ui/Button.vue'
import FormField from '@/components/ui/FormField.vue'
import Input from '@/components/ui/Input.vue'
import { ApiError, api } from '@/services/api'
import { MOCK_ACCOUNT } from '@/services/mock/auth'
import { safeRedirect } from '@/router'
import { useSessionStore } from '@/stores/session'
import type { Captcha } from '@/types'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()

const form = reactive({ account: '', password: '', captchaCode: '' })
const errors = reactive<{ account?: string; password?: string; captchaCode?: string }>({})
const formError = ref<string | null>(null)
const showPassword = ref(false)
const submitting = ref(false)
const captcha = ref<Captcha | null>(null)
const captchaLoading = ref(false)

async function loadCaptcha() {
  captchaLoading.value = true
  form.captchaCode = ''
  try {
    captcha.value = await api.auth.captcha()
  } catch {
    formError.value = '验证码加载失败，请点击图片重试'
  } finally {
    captchaLoading.value = false
  }
}

onMounted(loadCaptcha)

function validate() {
  errors.account = form.account.trim() ? undefined : '请输入登录邮箱或手机号'
  errors.password = form.password ? undefined : '请输入密码'
  errors.captchaCode = form.captchaCode.trim().length === 4 ? undefined : '请输入 4 位验证码'
  return !errors.account && !errors.password && !errors.captchaCode
}

async function submit() {
  formError.value = null
  if (!validate() || !captcha.value || submitting.value) return
  submitting.value = true
  try {
    await session.login({
      account: form.account.trim(),
      password: form.password,
      captchaId: captcha.value.captchaId,
      captchaCode: form.captchaCode.trim(),
    })
    await router.replace(safeRedirect(route.query.redirect))
  } catch (e) {
    const err = e instanceof ApiError ? e : null
    if (err?.code === 'CAPTCHA_INVALID') errors.captchaCode = err.message
    else formError.value = err?.message ?? '登录失败，请稍后重试'
    if (err?.code === 'INVALID_CREDENTIALS') form.password = ''
    loadCaptcha()
  } finally {
    submitting.value = false
  }
}

function fillDemo() {
  form.account = MOCK_ACCOUNT.email
  form.password = MOCK_ACCOUNT.password
}
</script>

<template>
  <div class="flex min-h-dvh bg-background">
    <aside class="hidden w-[44%] max-w-xl flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex">
      <div class="flex items-center gap-2.5">
        <img src="/favicon.svg" alt="" class="size-8 rounded-md bg-primary-foreground/10 p-1" />
        <span class="text-base font-semibold tracking-tight">PayHub</span>
      </div>
      <div class="flex flex-col gap-4">
        <h2 class="text-3xl font-semibold leading-tight tracking-tight text-balance">
          一个后台，管好每一笔收款与退款
        </h2>
        <p class="max-w-sm text-sm leading-relaxed text-primary-foreground/75 text-pretty">
          聚合微信支付、支付宝、云闪付等渠道的交易数据，统一查询、对账、退款，并通过开放接口与你的业务系统对接。
        </p>
      </div>
      <p class="flex items-center gap-2 text-xs text-primary-foreground/70">
        <ShieldCheck class="size-4" />
        登录态采用短时效 Access Token + 刷新令牌，异常登录可在安全设置中随时下线
      </p>
    </aside>

    <main class="flex flex-1 items-center justify-center px-5 py-12">
      <div class="flex w-full max-w-sm flex-col gap-8">
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-2 lg:hidden">
            <img src="/favicon.svg" alt="" class="size-7" />
            <span class="text-sm font-semibold tracking-tight">PayHub</span>
          </div>
          <h1 class="text-2xl font-semibold tracking-tight">登录商户后台</h1>
          <p class="text-sm text-muted-foreground">使用商户管理员分配的账号登录</p>
        </div>

        <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
          <p
            v-if="formError"
            role="alert"
            class="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger"
          >
            {{ formError }}
          </p>

          <FormField label="账号" for="login-account" :error="errors.account">
            <Input
              id="login-account"
              v-model="form.account"
              autocomplete="username"
              placeholder="邮箱或手机号"
              :invalid="!!errors.account"
              class="[&_input]:h-10"
            >
              <template #prefix><UserRound /></template>
            </Input>
          </FormField>

          <FormField label="密码" for="login-password" :error="errors.password">
            <Input
              id="login-password"
              v-model="form.password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              placeholder="请输入密码"
              :invalid="!!errors.password"
              class="[&_input]:h-10"
            >
              <template #prefix><LockKeyhole /></template>
              <template #suffix>
                <button
                  type="button"
                  class="flex rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
                  :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                  @click="showPassword = !showPassword"
                >
                  <EyeOff v-if="showPassword" />
                  <Eye v-else />
                </button>
              </template>
            </Input>
          </FormField>

          <FormField label="验证码" for="login-captcha" :error="errors.captchaCode">
            <div class="flex gap-2">
              <Input
                id="login-captcha"
                v-model="form.captchaCode"
                maxlength="4"
                autocomplete="off"
                placeholder="4 位字符，不区分大小写"
                :invalid="!!errors.captchaCode"
                class="flex-1 [&_input]:h-10 [&_input]:uppercase [&_input]:placeholder:normal-case"
              />
              <button
                type="button"
                class="relative flex h-10 w-[108px] shrink-0 items-center justify-center overflow-hidden rounded-md border border-input bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                aria-label="看不清，换一张验证码"
                :disabled="captchaLoading"
                @click="loadCaptcha"
              >
                <img v-if="captcha && !captchaLoading" :src="captcha.image" alt="验证码图片" class="size-full object-cover" />
                <RefreshCw v-else class="size-4 animate-spin text-muted-foreground" />
              </button>
            </div>
          </FormField>

          <Button type="submit" variant="primary" size="lg" class="mt-2 w-full" :loading="submitting">
            {{ submitting ? '登录中…' : '登录' }}
          </Button>
        </form>

        <div class="flex flex-col gap-1 rounded-md border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
          <p>
            演示账号：<span class="font-mono text-foreground">{{ MOCK_ACCOUNT.email }}</span>
          </p>
          <p class="flex items-center justify-between gap-2">
            <span>密码：<span class="font-mono text-foreground">{{ MOCK_ACCOUNT.password }}</span></span>
            <button type="button" class="font-medium text-primary hover:underline" @click="fillDemo">一键填入</button>
          </p>
        </div>
      </div>
    </main>
  </div>
</template>
