<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Building2, Check, Eye, EyeOff, LockKeyhole, RefreshCw, ShieldCheck, UserRound } from '@lucide/vue'
import Button from '@/components/ui/Button.vue'
import FormField from '@/components/ui/FormField.vue'
import Input from '@/components/ui/Input.vue'
import { ApiError, api, demoAccount } from '@/services/api'
import { safeRedirect } from '@/router'
import { AuthStateUncertain, useSessionStore } from '@/stores/session'
import type { Captcha } from '@/types'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()

const form = reactive({ account: '', password: '', captchaCode: '' })
const errors = reactive<{ account?: string; password?: string; captchaCode?: string }>({})
const formError = ref<string | null>(null)
const showPassword = ref(false)
const captcha = ref<Captcha | null>(null)
const captchaExpiresAt = ref(0)
const captchaLoading = ref(false)
const captchaFailed = ref(false)
const chosenTenant = ref<string | null>(null)
const now = ref(Date.now())
const timer = setInterval(() => (now.value = Date.now()), 1000)
onBeforeUnmount(() => {
  clearInterval(timer)
  // 离开登录页时丢弃未完成的选择凭证
  if (session.phase === 'SELECT_MERCHANT') session.cancelSelection()
})

const step = computed(() =>
  session.phase === 'SELECT_MERCHANT' || session.phase === 'COMPLETING' ? 'select' : 'credentials',
)
const verifying = computed(() => session.phase === 'VERIFYING')
const completing = computed(() => session.phase === 'COMPLETING')
const captchaExpired = computed(() => !!captcha.value && now.value >= captchaExpiresAt.value)
const selectionRemaining = computed(() =>
  session.selection ? Math.max(0, Math.floor((session.selection.expiresAt - now.value) / 1000)) : 0,
)
const selectionExpired = computed(() => !!session.selection && selectionRemaining.value <= 0)
const remainingLabel = computed(() => {
  const s = selectionRemaining.value
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
})

async function loadCaptcha() {
  captchaLoading.value = true
  captchaFailed.value = false
  form.captchaCode = ''
  try {
    const c = await api.auth.captcha()
    captcha.value = c
    captchaExpiresAt.value = Date.now() + c.expiresIn * 1000
  } catch {
    captcha.value = null
    captchaFailed.value = true
  } finally {
    captchaLoading.value = false
  }
}

onMounted(() => {
  // 进入页面时总是从凭据步骤开始；不会凭旧密码自动重走登录
  if (session.phase !== 'AUTHENTICATED') session.cancelSelection()
  loadCaptcha()
})

function validate() {
  errors.account = form.account.trim() ? undefined : '请输入登录邮箱或手机号'
  errors.password = form.password ? undefined : '请输入密码'
  errors.captchaCode = form.captchaCode.trim().length === 4 ? undefined : '请输入 4 位验证码'
  return !errors.account && !errors.password && !errors.captchaCode
}

function describe(e: unknown, fallback: string) {
  if (!(e instanceof ApiError)) return e instanceof Error ? e.message : fallback
  switch (e.httpStatus) {
    case 429:
      return e.message || '请求过于频繁，请稍后再试'
    case 503:
      return '身份服务暂不可用，请稍后重试'
    default:
      return e.message || fallback
  }
}

async function submitCredentials() {
  formError.value = null
  if (verifying.value) return
  if (captchaExpired.value) {
    errors.captchaCode = '验证码已过期，已为你刷新'
    loadCaptcha()
    return
  }
  if (!validate() || !captcha.value) return
  try {
    await session.beginLogin({
      account: form.account.trim(),
      // 密码原样传递
      password: form.password,
      captchaId: captcha.value.captchaId,
      captchaCode: form.captchaCode.trim(),
    })
    form.password = ''
    form.captchaCode = ''
    captcha.value = null
    chosenTenant.value = null
  } catch (e) {
    const err = e instanceof ApiError ? e : null
    if (err?.code === 'CAPTCHA_INVALID') errors.captchaCode = err.message
    else formError.value = describe(e, '登录失败，请稍后重试')
    if (err?.code === 'INVALID_CREDENTIALS') form.password = ''
    loadCaptcha()
  }
}

function backToCredentials(message: string | null = null) {
  session.cancelSelection()
  chosenTenant.value = null
  formError.value = message
  loadCaptcha()
}

async function confirmMerchant() {
  formError.value = null
  if (!chosenTenant.value || completing.value) return
  if (selectionExpired.value) {
    backToCredentials('选择已过期，请重新验证账号密码')
    return
  }
  try {
    await session.completeLogin(chosenTenant.value)
    form.account = ''
    await router.replace(safeRedirect(route.query.redirect))
  } catch (e) {
    if (e instanceof AuthStateUncertain) {
      backToCredentials(`${e.message}。为避免重复建立会话，系统不会自动重试`)
    } else if (e instanceof ApiError && e.httpStatus === 403) {
      backToCredentials('该商户的成员资格无效或已被收回，请重新验证后选择其他商户')
    } else if (e instanceof ApiError && e.httpStatus === 401) {
      backToCredentials('选择已失效，请重新验证账号密码')
    } else {
      backToCredentials(describe(e, '登录失败，请重新验证账号密码'))
    }
  }
}

watch(selectionExpired, (expired) => {
  if (expired && session.phase === 'SELECT_MERCHANT') backToCredentials('选择已过期，请重新验证账号密码')
})

function fillDemo() {
  if (!demoAccount) return
  form.account = demoAccount.email
  form.password = demoAccount.password
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
        登录分两步：先验证账号，再明确选择商户；会话绑定所选商户
      </p>
    </aside>

    <main class="flex flex-1 items-center justify-center px-5 py-12">
      <div class="flex w-full max-w-sm flex-col gap-8">
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-2 lg:hidden">
            <img src="/favicon.svg" alt="" class="size-7" />
            <span class="text-sm font-semibold tracking-tight">PayHub</span>
          </div>
          <p class="text-xs font-medium text-muted-foreground">
            第 {{ step === 'credentials' ? 1 : 2 }} 步，共 2 步
          </p>
          <h1 class="text-2xl font-semibold tracking-tight">
            {{ step === 'credentials' ? '登录商户后台' : '选择要进入的商户' }}
          </h1>
          <p class="text-sm text-muted-foreground">
            {{ step === 'credentials' ? '使用商户管理员分配的账号登录' : '本次登录将绑定所选商户，切换商户需重新登录' }}
          </p>
        </div>

        <p
          v-if="formError"
          role="alert"
          class="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] leading-relaxed text-danger"
        >
          {{ formError }}
        </p>

        <form v-if="step === 'credentials'" class="flex flex-col gap-4" novalidate @submit.prevent="submitCredentials">
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
                class="relative flex h-10 w-[108px] shrink-0 items-center justify-center overflow-hidden rounded-md border border-input bg-muted text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                :aria-label="captchaFailed ? '验证码加载失败，点击重试' : '看不清，换一张验证码'"
                :disabled="captchaLoading"
                @click="loadCaptcha"
              >
                <RefreshCw v-if="captchaLoading" class="size-4 animate-spin" />
                <span v-else-if="captchaFailed">加载失败，重试</span>
                <span v-else-if="captchaExpired">已过期，点击刷新</span>
                <img v-else-if="captcha" :src="captcha.image" alt="验证码图片" class="size-full object-cover" />
              </button>
            </div>
          </FormField>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            class="mt-2 w-full"
            :loading="verifying"
            :disabled="verifying || !captcha"
          >
            {{ verifying ? '验证中…' : '下一步' }}
          </Button>
        </form>

        <form
          v-else-if="session.selection"
          class="flex flex-col gap-4"
          novalidate
          @submit.prevent="confirmMerchant"
        >
          <div v-if="session.selection.tenantIds.length === 0" class="flex flex-col gap-3">
            <p class="rounded-md border border-border bg-muted px-3 py-3 text-sm leading-relaxed text-muted-foreground">
              该账号当前没有可进入的商户。请联系商户管理员为你开通成员资格。
            </p>
            <Button type="button" variant="secondary" size="lg" class="w-full" @click="backToCredentials()">
              <ArrowLeft />返回重新登录
            </Button>
          </div>

          <template v-else>
            <fieldset class="flex flex-col gap-2" :disabled="completing">
              <legend class="mb-2 flex w-full items-center justify-between text-sm font-medium">
                <span>可进入的商户</span>
                <span class="text-xs font-normal tabular-nums text-muted-foreground" aria-live="polite">
                  {{ remainingLabel }} 内有效
                </span>
              </legend>
              <label
                v-for="id in session.selection.tenantIds"
                :key="id"
                class="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/40"
                :class="chosenTenant === id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'"
              >
                <input v-model="chosenTenant" type="radio" name="tenant" :value="id" class="sr-only" />
                <span class="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Building2 class="size-4" />
                </span>
                <span class="flex min-w-0 flex-1 flex-col">
                  <span class="text-xs text-muted-foreground">商户号 / 标识</span>
                  <span class="truncate font-mono text-sm">{{ id }}</span>
                </span>
                <Check v-if="chosenTenant === id" class="size-4 text-primary" aria-hidden="true" />
              </label>
            </fieldset>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              class="mt-2 w-full"
              :loading="completing"
              :disabled="!chosenTenant || completing || selectionExpired"
            >
              {{ completing ? '正在进入…' : '进入该商户' }}
            </Button>
            <Button type="button" variant="ghost" size="lg" class="w-full" :disabled="completing" @click="backToCredentials()">
              <ArrowLeft />返回上一步
            </Button>
          </template>
        </form>

        <div
          v-if="demoAccount && step === 'credentials'"
          class="flex flex-col gap-1 rounded-md border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground"
        >
          <p class="font-medium text-foreground">Mock 演示模式（仅开发构建）</p>
          <p>
            账号：<span class="font-mono text-foreground">{{ demoAccount.email }}</span>
          </p>
          <p class="flex items-center justify-between gap-2">
            <span>密码：<span class="font-mono text-foreground">{{ demoAccount.password }}</span></span>
            <button type="button" class="font-medium text-primary hover:underline" @click="fillDemo">一键填入</button>
          </p>
        </div>
      </div>
    </main>
  </div>
</template>
