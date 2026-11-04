<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { AlertTriangle, CircleHelp, RefreshCw } from '@lucide/vue'
import Dialog from '@/components/ui/Dialog.vue'
import Button from '@/components/ui/Button.vue'
import FormField from '@/components/ui/FormField.vue'
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'
import RefundSummaryCard from './RefundSummaryCard.vue'
import { api } from '@/services/api'
import { ApiError } from '@/services/api/types'
import { classifyFailure, classifySuccess, isValidRefund, refundMatches, type RefundWriteResult } from '@/services/refund/classify'
import {
  BLOCKING_PHASES,
  RecoveryUnavailableError,
  beginSend,
  discardRecovery,
  listRecovery,
  openDraft,
  patchRecovery,
  subscribeRecovery,
  type RecoveryContext,
  type RecoveryScope,
} from '@/services/refund/recovery'
import { useSessionStore } from '@/stores/session'
import { compareAmount, fenToAmount, formatMoney, isAmountInput, isPositiveAmount, normalizeAmount, toFen } from '@/utils/money'
import { formatDateTime } from '@/utils/format'
import type { Payment, Refund, RefundableInfo } from '@/types'

const props = defineProps<{ payment: Payment }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ created: [refund: Refund] }>()

const session = useSessionStore()

const info = ref<RefundableInfo | null>(null)
const ctx = ref<RecoveryContext | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)
const submitting = ref(false)
const querying = ref(false)
const confirming = ref(false)
const lastError = ref<string | null>(null)

const form = reactive({ amount: '', reason: '' })
const touched = reactive({ amount: false, reason: false })

const scope = computed<RecoveryScope | null>(() =>
  session.user && session.merchant ? { tenant: session.merchant.merchantNo, userId: session.user.id } : null,
)

/** 上次提交结果未确认/未受理：锁定原编号与原参数，仅允许查询（协议 v1.4 R1b，不开放重发） */
const pending = computed(() => !!ctx.value && BLOCKING_PHASES.includes(ctx.value.phase))

const describeError = (e: unknown) => (e instanceof Error ? e.message : '未知错误')

async function load() {
  loading.value = true
  loadError.value = null
  lastError.value = null
  try {
    if (!scope.value) throw new Error('会话信息未就绪，请刷新页面后重试')
    // 先读恢复上下文：待确认记录不依赖当前可退额度/资格，额度被占满时仍要能打开查询
    const draft = await openDraft(scope.value, props.payment.id)
    ctx.value = draft
    if (BLOCKING_PHASES.includes(draft.phase)) return
    info.value = await api.payments.refundable(props.payment.id)
    form.amount = draft.amount
    form.reason = draft.reason
  } catch (e) {
    loadError.value =
      e instanceof RecoveryUnavailableError ? `${e.message}，为避免重复退款，当前无法发起退款` : describeError(e)
  } finally {
    loading.value = false
  }
}

/** 跨页签：其他页签推进/清除记录时按作用域重新读取 */
function syncFromStore() {
  const s = scope.value
  const c = ctx.value
  if (!open.value || !s || !c || submitting.value) return
  let latest: RecoveryContext | undefined
  try {
    latest = listRecovery(s).find((x) => x.merchantRefundNo === c.merchantRefundNo)
  } catch (e) {
    lastError.value = describeError(e)
    return
  }
  if (!latest) {
    load()
    return
  }
  if (latest.updatedAt !== c.updatedAt) {
    ctx.value = latest
    if (BLOCKING_PHASES.includes(latest.phase)) confirming.value = false
    if (latest.phase === 'LOCATED') open.value = false
  }
}
let unsubscribe: (() => void) | null = null
watch(
  open,
  (v) => {
    unsubscribe?.()
    unsubscribe = v ? subscribeRecovery(syncFromStore) : null
  },
  { immediate: true },
)
onBeforeUnmount(() => unsubscribe?.())

watch(open, (v) => {
  if (!v) return
  info.value = null
  ctx.value = null
  Object.assign(form, { amount: '', reason: '' })
  Object.assign(touched, { amount: false, reason: false })
  confirming.value = false
  load()
})

const eligibilityBlock = computed(() => {
  const i = info.value
  if (!i) return null
  if (i.refundEligibility !== 'ALLOWED') return i.ineligibleReason ?? '该订单当前不可退款'
  if (i.refundableAmount === null) return '可退金额暂不可确定，请稍后重试'
  if (!isPositiveAmount(i.refundableAmount)) return '该订单已无可退金额'
  return null
})

const errors = computed(() => {
  const e: Record<'amount' | 'reason', string | null> = { amount: null, reason: null }
  if (!form.amount) e.amount = '请输入退款金额'
  else if (!isAmountInput(form.amount)) e.amount = '金额格式不正确，最多保留两位小数'
  else if (!isPositiveAmount(form.amount)) e.amount = '退款金额必须大于 0'
  else if (info.value?.refundableAmount && compareAmount(form.amount, info.value.refundableAmount) === 1)
    e.amount = `超出可退金额 ${formatMoney(info.value.refundableAmount)}`
  if (!form.reason.trim()) e.reason = '请填写退款原因'
  else if (form.reason.length > 80) e.reason = '退款原因不超过 80 个字符'
  return e
})
const valid = computed(() => !errors.value.amount && !errors.value.reason)

const remainingAfter = computed(() => {
  const total = toFen(info.value?.refundableAmount)
  const part = toFen(form.amount)
  return total === null || part === null ? null : fenToAmount(total - part)
})

function fillAll() {
  if (info.value?.refundableAmount) form.amount = info.value.refundableAmount
  touched.amount = true
}

function next() {
  Object.assign(touched, { amount: true, reason: true })
  if (valid.value && !eligibilityBlock.value) confirming.value = true
}

async function applyResult(result: RefundWriteResult, current: RecoveryContext) {
  const s = scope.value!
  const no = current.merchantRefundNo
  switch (result.kind) {
    case 'LOCATED': {
      ctx.value = await patchRecovery(s, no, { phase: 'LOCATED', refundId: result.refund.id, note: null })
      toast.success('退款申请已受理', { description: `退款单号 ${result.refund.id}，处理结果以退款详情为准` })
      open.value = false
      emit('created', result.refund)
      return
    }
    case 'REJECTED': {
      if (result.error.code === 'IDEMPOTENCY_CONFLICT') {
        // 同号不同参：该编号可能已对应其他已受理退款，本地首次请求也不能证明历史未执行。保留原号与原参数，不清除、不换号
        ctx.value = await patchRecovery(s, no, {
          phase: 'SENT_PENDING',
          note: '服务端返回幂等冲突：该退款编号可能已对应其他退款申请。已保留原编号与原参数，请查询核实或联系客服',
        })
        return
      }
      if (current.attempts <= 1 && current.phase === 'SENT_PENDING') {
        // 首次即被确定性拒绝：该编号从未生效，可清理并生成新草稿
        await patchRecovery(s, no, { phase: 'REJECTED_DRAFT', note: result.error.message })
        await discardRecovery(s, no)
        ctx.value = await openDraft(s, props.payment.id)
        lastError.value = result.error.message
        confirming.value = false
      } else {
        // 记录此前已处于未知状态：拒绝不能覆盖之前的未知结果，保留记录继续查询
        ctx.value = await patchRecovery(s, no, { phase: 'SENT_PENDING', note: `服务端拒绝：${result.error.message}` })
      }
      return
    }
    case 'NOT_ACCEPTED':
      ctx.value = await patchRecovery(s, no, { phase: 'NOT_ACCEPTED', note: `未受理：${result.error.message}` })
      return
    case 'AUTH_FAILED':
      ctx.value = await patchRecovery(s, no, { phase: 'SENT_PENDING', note: '登录状态失效，请重新登录后查询本次退款结果' })
      return
    case 'UNKNOWN':
      ctx.value = await patchRecovery(s, no, { phase: 'SENT_PENDING', note: result.reason })
      await queryResult(true)
  }
}

async function send() {
  const s = scope.value
  if (!s || !ctx.value) return
  submitting.value = true
  lastError.value = null
  let current: RecoveryContext
  try {
    current = await beginSend(s, ctx.value.merchantRefundNo, {
      amount: normalizeAmount(form.amount) ?? form.amount,
      reason: form.reason.trim(),
    })
    ctx.value = current
  } catch (e) {
    // 发送前持久化失败：不得发送请求
    lastError.value = `${describeError(e)}，本次未提交退款`
    submitting.value = false
    return
  }
  const input = {
    paymentId: current.paymentId,
    amount: current.amount,
    merchantRefundNo: current.merchantRefundNo,
    reason: current.reason,
  }
  let result: RefundWriteResult
  try {
    result = classifySuccess(await api.refunds.create(input), input)
  } catch (e) {
    result = classifyFailure(e)
  }
  try {
    await applyResult(result, current)
  } catch (e) {
    lastError.value = `结果记录失败：${describeError(e)}。请勿重复提交，可在退款列表按编号 ${current.merchantRefundNo} 查询`
  } finally {
    submitting.value = false
  }
}

async function queryResult(silent = false) {
  const s = scope.value
  const c = ctx.value
  if (!s || !c) return
  querying.value = true
  const now = new Date().toISOString()
  try {
    const found = await api.refunds.findByMerchantRefundNo(c.paymentId, c.merchantRefundNo)
    if (isValidRefund(found) && refundMatches(found, c)) {
      await applyResult({ kind: 'LOCATED', refund: found }, c)
      return
    }
    ctx.value = await patchRecovery(s, c.merchantRefundNo, { lastCheckedAt: now, note: '查询到的记录与本次申请不一致，请联系客服核实' })
  } catch (e) {
    const notFound = e instanceof ApiError && e.code === 'NOT_FOUND'
    const note = notFound
      ? '暂未查到该退款。查不到不代表未受理，请稍后再查；长时间未查到请联系客服并提供商户退款编号'
      : `查询失败：${describeError(e)}`
    try {
      ctx.value = await patchRecovery(s, c.merchantRefundNo, { lastCheckedAt: now, note })
    } catch (pe) {
      lastError.value = describeError(pe)
    }
    if (!silent && !notFound) toast.error('查询失败', { description: describeError(e) })
  } finally {
    querying.value = false
  }
}

const busy = computed(() => submitting.value || querying.value)
const title = computed(() => (pending.value ? '退款结果待确认' : confirming.value ? '确认退款信息' : '发起退款'))
</script>

<template>
  <Dialog
    v-model:open="open"
    :title="title"
    description="退款将原路退回至用户支付账户，提交后不可撤销。"
    :dismissible="!busy"
  >
    <div v-if="loading" class="py-10 text-center text-sm text-muted-foreground">正在查询可退金额…</div>
    <div v-else-if="loadError" class="flex flex-col items-center gap-3 py-8 text-center text-sm">
      <p class="text-danger text-pretty">{{ loadError }}</p>
      <Button size="sm" @click="load">重试</Button>
    </div>

    <div v-else-if="pending && ctx" class="flex flex-col gap-4">
      <div class="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-[13px] leading-relaxed">
        <CircleHelp class="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
        <div class="flex flex-col gap-1">
          <p class="font-medium text-foreground">
            {{ ctx.phase === 'NOT_ACCEPTED' ? '上次提交未被受理，结果待确认' : '上次提交的结果尚未确认' }}
          </p>
          <p v-if="ctx.note" class="text-muted-foreground">{{ ctx.note }}</p>
          <p class="text-muted-foreground">
            为避免重复退款，结果确认前不能重新提交或对该订单发起新的退款。请查询结果，或联系客服并提供下方商户退款编号。
          </p>
        </div>
      </div>
      <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border border-border p-4 text-[13px]">
        <dt class="text-muted-foreground">商户退款编号</dt>
        <dd class="font-mono">{{ ctx.merchantRefundNo }}</dd>
        <dt class="text-muted-foreground">退款金额</dt>
        <dd class="tabular font-medium">{{ formatMoney(normalizeAmount(ctx.amount)) }}</dd>
        <dt class="text-muted-foreground">退款原因</dt>
        <dd>{{ ctx.reason }}</dd>
        <dt class="text-muted-foreground">提交次数</dt>
        <dd class="tabular">{{ ctx.attempts }}</dd>
        <dt class="text-muted-foreground">最近查询</dt>
        <dd class="tabular">{{ ctx.lastCheckedAt ? formatDateTime(ctx.lastCheckedAt) : '未查询' }}</dd>
      </dl>
    </div>

    <template v-else-if="info && ctx">
      <div v-if="!confirming" class="flex flex-col gap-4">
        <RefundSummaryCard :info="info" />
        <p v-if="eligibilityBlock" class="rounded-md bg-muted px-3 py-2 text-[13px] text-muted-foreground">
          {{ eligibilityBlock }}
        </p>
        <template v-else>
          <FormField label="退款金额（元）" for="rf-amount" required :error="touched.amount ? errors.amount : null">
            <Input
              id="rf-amount"
              v-model="form.amount"
              inputmode="decimal"
              placeholder="0.00"
              class="tabular"
              :invalid="touched.amount && !!errors.amount"
              @blur="touched.amount = true"
            >
              <template #prefix>¥</template>
              <template #suffix>
                <button type="button" class="text-xs font-medium text-primary hover:underline" @click="fillAll">全额退款</button>
              </template>
            </Input>
          </FormField>
          <FormField label="商户退款编号" for="rf-no" hint="系统生成并保存，用于幂等控制；重复提交不会产生多笔退款">
            <Input id="rf-no" :model-value="ctx.merchantRefundNo" class="font-mono" readonly />
          </FormField>
          <FormField label="退款原因" for="rf-reason" required :error="touched.reason ? errors.reason : null">
            <Textarea
              id="rf-reason"
              v-model="form.reason"
              rows="3"
              placeholder="如：用户申请退货"
              :invalid="touched.reason && !!errors.reason"
              @blur="touched.reason = true"
            />
          </FormField>
        </template>
      </div>
      <div v-else class="flex flex-col gap-4">
        <div class="rounded-lg border border-border bg-muted/40 p-4">
          <p class="text-xs text-muted-foreground">本次退款金额</p>
          <p class="mt-1 text-2xl font-semibold tabular">{{ formatMoney(normalizeAmount(form.amount)) }}</p>
          <dl class="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
            <dt class="text-muted-foreground">原支付订单</dt>
            <dd class="font-mono">{{ payment.id }}</dd>
            <dt class="text-muted-foreground">商户退款编号</dt>
            <dd class="font-mono">{{ ctx.merchantRefundNo }}</dd>
            <dt class="text-muted-foreground">退款原因</dt>
            <dd>{{ form.reason }}</dd>
            <dt class="text-muted-foreground">退款后剩余可退</dt>
            <dd class="tabular">{{ formatMoney(remainingAfter) }}</dd>
          </dl>
        </div>
        <p class="flex items-start gap-2 text-[13px] text-muted-foreground">
          <AlertTriangle class="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          退款提交后将进入渠道处理，通常 1-3 个工作日到账，期间不可撤销。
        </p>
      </div>
    </template>

    <p v-if="lastError" role="alert" class="mt-4 rounded-md bg-danger/10 px-3 py-2 text-[13px] text-danger">{{ lastError }}</p>

    <template #footer>
      <template v-if="pending">
        <Button :disabled="busy" @click="open = false">稍后处理</Button>
        <Button variant="primary" :loading="querying" :disabled="submitting" @click="queryResult()">
          <RefreshCw class="size-4" aria-hidden="true" />查询结果
        </Button>
      </template>
      <template v-else-if="!confirming">
        <Button @click="open = false">取消</Button>
        <Button variant="primary" :disabled="!info || !ctx || !!eligibilityBlock" @click="next">下一步</Button>
      </template>
      <template v-else>
        <Button :disabled="submitting" @click="confirming = false">返回修改</Button>
        <Button variant="danger" :loading="submitting" @click="send()">确认退款</Button>
      </template>
    </template>
  </Dialog>
</template>
