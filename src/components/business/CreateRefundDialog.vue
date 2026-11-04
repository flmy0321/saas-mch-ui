<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { AlertTriangle } from '@lucide/vue'
import Dialog from '@/components/ui/Dialog.vue'
import Button from '@/components/ui/Button.vue'
import FormField from '@/components/ui/FormField.vue'
import Input from '@/components/ui/Input.vue'
import Textarea from '@/components/ui/Textarea.vue'
import RefundSummaryCard from './RefundSummaryCard.vue'
import { api } from '@/services/api'
import { fenToYuan, formatMoney, yuanToFen } from '@/utils/format'
import type { Payment, Refund, RefundableInfo } from '@/types'

const props = defineProps<{ payment: Payment }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ created: [refund: Refund] }>()

const info = ref<RefundableInfo | null>(null)
const loadingInfo = ref(false)
const infoError = ref<string | null>(null)
const submitting = ref(false)
const confirming = ref(false)

const form = reactive({ amount: '', merchantRefundNo: '', reason: '' })
const touched = reactive({ amount: false, merchantRefundNo: false, reason: false })

function genRefundNo() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `MR${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}`
}

async function loadInfo() {
  loadingInfo.value = true
  infoError.value = null
  try {
    info.value = await api.payments.refundable(props.payment.id)
  } catch (e) {
    infoError.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loadingInfo.value = false
  }
}

watch(open, (v) => {
  if (!v) return
  Object.assign(form, { amount: '', merchantRefundNo: genRefundNo(), reason: '' })
  Object.assign(touched, { amount: false, merchantRefundNo: false, reason: false })
  confirming.value = false
  loadInfo()
})

const amountFen = computed(() => (/^\d+(\.\d{1,2})?$/.test(form.amount) ? yuanToFen(form.amount) : NaN))

const errors = computed(() => {
  const e: Record<string, string | null> = { amount: null, merchantRefundNo: null, reason: null }
  if (!form.amount) e.amount = '请输入退款金额'
  else if (Number.isNaN(amountFen.value)) e.amount = '金额格式不正确，最多保留两位小数'
  else if (amountFen.value <= 0) e.amount = '退款金额必须大于 0'
  else if (info.value && amountFen.value > info.value.refundableAmount)
    e.amount = `超出可退金额 ${formatMoney(info.value.refundableAmount)}`
  if (!form.merchantRefundNo.trim()) e.merchantRefundNo = '请输入商户退款编号'
  else if (!/^[A-Za-z0-9_-]{6,32}$/.test(form.merchantRefundNo)) e.merchantRefundNo = '6-32 位字母、数字、下划线或短横线'
  if (!form.reason.trim()) e.reason = '请填写退款原因'
  else if (form.reason.length > 80) e.reason = '退款原因不超过 80 个字符'
  return e
})
const valid = computed(() => !Object.values(errors.value).some(Boolean))

function fillAll() {
  if (info.value) form.amount = fenToYuan(info.value.refundableAmount).toFixed(2)
  touched.amount = true
}

function next() {
  Object.assign(touched, { amount: true, merchantRefundNo: true, reason: true })
  if (valid.value) confirming.value = true
}

async function submit() {
  submitting.value = true
  try {
    const refund = await api.refunds.create({
      paymentId: props.payment.id,
      amount: amountFen.value,
      merchantRefundNo: form.merchantRefundNo.trim(),
      reason: form.reason.trim(),
    })
    toast.success('退款申请已提交', { description: `退款编号 ${refund.id}，处理结果将通过 Webhook 通知` })
    open.value = false
    emit('created', refund)
  } catch (e) {
    toast.error('退款申请失败', { description: e instanceof Error ? e.message : undefined })
    confirming.value = false
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open" :title="confirming ? '确认退款信息' : '发起退款'" description="退款将原路退回至用户支付账户，提交后不可撤销。" :dismissible="!submitting">
    <div v-if="loadingInfo" class="py-10 text-center text-sm text-muted-foreground">正在查询可退金额…</div>
    <div v-else-if="infoError" class="flex flex-col items-center gap-3 py-8 text-sm">
      <p class="text-danger">{{ infoError }}</p>
      <Button size="sm" @click="loadInfo">重试</Button>
    </div>
    <template v-else-if="info">
      <div v-if="!confirming" class="flex flex-col gap-4">
        <RefundSummaryCard :info="info" />
        <p v-if="info.refundableAmount <= 0" class="rounded-md bg-muted px-3 py-2 text-[13px] text-muted-foreground">
          该订单已无可退金额。
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
          <FormField
            label="商户退款编号"
            for="rf-no"
            required
            hint="用于幂等控制，相同编号重复提交不会产生多笔退款"
            :error="touched.merchantRefundNo ? errors.merchantRefundNo : null"
          >
            <Input
              id="rf-no"
              v-model="form.merchantRefundNo"
              class="font-mono"
              :invalid="touched.merchantRefundNo && !!errors.merchantRefundNo"
              @blur="touched.merchantRefundNo = true"
            />
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
          <p class="mt-1 text-2xl font-semibold tabular">{{ formatMoney(amountFen) }}</p>
          <dl class="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
            <dt class="text-muted-foreground">原支付订单</dt>
            <dd class="font-mono">{{ payment.id }}</dd>
            <dt class="text-muted-foreground">商户退款编号</dt>
            <dd class="font-mono">{{ form.merchantRefundNo }}</dd>
            <dt class="text-muted-foreground">退款原因</dt>
            <dd>{{ form.reason }}</dd>
            <dt class="text-muted-foreground">退款后剩余可退</dt>
            <dd class="tabular">{{ formatMoney(info.refundableAmount - amountFen) }}</dd>
          </dl>
        </div>
        <p class="flex items-start gap-2 text-[13px] text-muted-foreground">
          <AlertTriangle class="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          退款提交后将进入渠道处理，通常 1-3 个工作日到账，期间不可撤销。
        </p>
      </div>
    </template>

    <template #footer>
      <template v-if="!confirming">
        <Button @click="open = false">取消</Button>
        <Button variant="primary" :disabled="!info || info.refundableAmount <= 0" @click="next">下一步</Button>
      </template>
      <template v-else>
        <Button :disabled="submitting" @click="confirming = false">返回修改</Button>
        <Button variant="danger" :loading="submitting" @click="submit">确认退款</Button>
      </template>
    </template>
  </Dialog>
</template>
