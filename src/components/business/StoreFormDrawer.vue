<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import Drawer from '@/components/ui/Drawer.vue'
import Button from '@/components/ui/Button.vue'
import FormField from '@/components/ui/FormField.vue'
import Input from '@/components/ui/Input.vue'
import Switch from '@/components/ui/Switch.vue'
import { api } from '@/services/api'
import { forgetCommand, getPendingCommand, lookupUntilKnown, runCommand, type PendingCommand } from '@/services/commands'
import type { CommandOutcome, StoreCommandApplied, StoreCommandInput } from '@/types/command'

/**
 * 新建门店（stores.create 命令）。命令只接受 merchantStoreNo / name / status；
 * 地址与联系人不在门店命令契约内，这里不再收集。
 */
const SCOPE = 'stores.create'

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [storeCode: string | null] }>()

const empty = (): StoreCommandInput => ({ name: '', merchantStoreNo: '', status: 'ACTIVE' })
const form = reactive<StoreCommandInput>(empty())
const submitted = ref(false)
const saving = ref(false)
const pending = ref<PendingCommand | null>(null)

watch(open, (v) => {
  if (!v) return
  submitted.value = false
  Object.assign(form, empty())
  pending.value = getPendingCommand(SCOPE)
})

const active = computed({
  get: () => form.status === 'ACTIVE',
  set: (v: boolean) => (form.status = v ? 'ACTIVE' : 'DISABLED'),
})

const errors = computed(() => ({
  name: !form.name.trim() ? '请输入门店名称' : form.name.length > 30 ? '不超过 30 个字符' : null,
  merchantStoreNo: !form.merchantStoreNo.trim()
    ? '请输入商户门店编号'
    : !/^[A-Za-z0-9_-]{2,32}$/.test(form.merchantStoreNo)
      ? '2-32 位字母、数字、下划线或短横线'
      : null,
}))
const err = (k: keyof typeof errors.value) => (submitted.value ? errors.value[k] : null)

function settle(outcome: CommandOutcome<StoreCommandApplied>) {
  if (outcome.state === 'PENDING') {
    pending.value = getPendingCommand(SCOPE)
    toast.warning('创建结果待确认', { description: '请求已发出但未收到确定结果，请稍后重新查询，不要重复提交。' })
    return
  }
  pending.value = null
  toast.success(outcome.recovered ? '已确认门店创建成功' : '门店已创建', { description: outcome.result.store.name })
  emit('saved', outcome.result.store.storeCode)
  open.value = false
}

async function save() {
  submitted.value = true
  if (pending.value || Object.values(errors.value).some(Boolean)) return
  saving.value = true
  try {
    const input: StoreCommandInput = { ...form }
    settle(
      await runCommand({
        scope: SCOPE,
        params: { operation: 'stores.create' },
        send: (commandId) => api.stores.create(commandId, input),
        lookup: (cmd) => api.stores.lookupCommand(cmd.commandId, { operation: 'stores.create' }),
      }),
    )
  } catch (e) {
    toast.error('保存失败', { description: e instanceof Error ? e.message : undefined })
  } finally {
    saving.value = false
  }
}

async function recheck() {
  if (!pending.value) return
  saving.value = true
  try {
    settle(
      await lookupUntilKnown(pending.value, (cmd) => api.stores.lookupCommand(cmd.commandId, { operation: 'stores.create' }), {
        attempts: 1,
        intervalMs: 0,
      }),
    )
  } finally {
    saving.value = false
  }
}

function abandon() {
  forgetCommand(SCOPE)
  pending.value = null
  emit('saved', null)
}
</script>

<template>
  <Drawer v-model:open="open" title="新建门店" description="门店用于区分交易来源，创建支付订单时可指定门店。">
    <div v-if="pending" role="status" class="mb-4 flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-[13px]">
      <p>
        上一次创建请求（命令号 <span class="font-mono">{{ pending.commandId }}</span>）结果尚未确认。请先重新查询；确认未生效前不要再次提交，以免重复创建。
      </p>
      <div class="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" :loading="saving" @click="recheck">重新查询结果</Button>
        <Button size="sm" variant="ghost" :disabled="saving" @click="abandon">已在门店列表核实，放弃此请求</Button>
      </div>
    </div>
    <form id="store-form" class="flex flex-col gap-4" novalidate @submit.prevent="save">
      <FormField label="门店名称" for="s-name" required :error="err('name')">
        <Input id="s-name" v-model="form.name" placeholder="如：静安嘉里中心店" :invalid="!!err('name')" />
      </FormField>
      <FormField label="商户门店编号" for="s-no" required hint="商户系统内的门店唯一编号" :error="err('merchantStoreNo')">
        <Input id="s-no" v-model="form.merchantStoreNo" class="font-mono" placeholder="如 SH-JA-001" :invalid="!!err('merchantStoreNo')" />
      </FormField>
      <div class="flex items-center justify-between rounded-lg border border-border p-3">
        <div>
          <label for="s-status" class="text-[13px] font-medium">启用门店</label>
          <p class="text-xs text-muted-foreground">停用后该门店无法创建新的支付订单，历史交易不受影响。</p>
        </div>
        <Switch id="s-status" v-model="active" />
      </div>
    </form>
    <template #footer>
      <Button @click="open = false">取消</Button>
      <Button variant="primary" type="submit" form="store-form" :loading="saving" :disabled="!!pending">创建门店</Button>
    </template>
  </Drawer>
</template>
