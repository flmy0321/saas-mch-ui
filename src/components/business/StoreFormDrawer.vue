<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import Drawer from '@/components/ui/Drawer.vue'
import Button from '@/components/ui/Button.vue'
import FormField from '@/components/ui/FormField.vue'
import Input from '@/components/ui/Input.vue'
import Switch from '@/components/ui/Switch.vue'
import { api, ApiError } from '@/services/api'
import { forgetCommand, getPendingCommand, lookupUntilKnown, runCommand, type PendingCommand } from '@/services/commands'
import type { CommandOutcome, ConfigurationVersion, StoreCommandApplied, StoreCommandInput, StoreCommandOperation } from '@/types/command'
import { emptyStoreForm, storeFormFromEdit, validateStoreForm } from '@/utils/storeForm'

/**
 * 新建（stores.create）与编辑（stores.update）门店。命令只接受 merchantStoreNo / name / status；
 * 地址与联系人不在门店命令契约内，这里不收集。传入 storeCode 即为编辑模式。
 */
const props = defineProps<{ storeCode?: string | null }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [storeCode: string | null] }>()

const editing = computed(() => !!props.storeCode)
const operation = computed<StoreCommandOperation>(() => (editing.value ? 'stores.update' : 'stores.create'))
const scope = computed(() => (editing.value ? `stores.update:${props.storeCode}` : 'stores.create'))
const lookupQuery = computed(() =>
  editing.value ? { operation: operation.value, storeCode: props.storeCode as string } : { operation: operation.value },
)

const empty = emptyStoreForm
const form = reactive<StoreCommandInput>(empty())
const version = ref<ConfigurationVersion | null>(null)
const submitted = ref(false)
const saving = ref(false)
const loading = ref(false)
const loadError = ref<string | null>(null)
const pending = ref<PendingCommand | null>(null)

async function loadEditView() {
  if (!props.storeCode) return
  loading.value = true
  loadError.value = null
  try {
    const view = await api.stores.editView(props.storeCode)
    Object.assign(form, storeFormFromEdit(view))
    version.value = view.configurationVersion
  } catch (e) {
    version.value = null
    loadError.value = e instanceof Error ? e.message : '读取门店配置失败'
  } finally {
    loading.value = false
  }
}

watch(open, (v) => {
  if (!v) return
  submitted.value = false
  Object.assign(form, empty())
  version.value = null
  loadError.value = null
  pending.value = getPendingCommand(scope.value)
  if (editing.value) void loadEditView()
})

const active = computed({
  get: () => form.status === 'ACTIVE',
  set: (v: boolean) => (form.status = v ? 'ACTIVE' : 'DISABLED'),
})

const errors = computed(() => validateStoreForm(form))
const err = (k: keyof typeof errors.value) => (submitted.value ? errors.value[k] : null)

const canSubmit = computed(() => !pending.value && !loading.value && (!editing.value || version.value !== null))

function settle(outcome: CommandOutcome<StoreCommandApplied>) {
  if (outcome.state === 'PENDING') {
    pending.value = getPendingCommand(scope.value)
    toast.warning(editing.value ? '修改结果待确认' : '创建结果待确认', {
      description: '请求已发出但未收到确定结果，请稍后重新查询，不要重复提交。',
    })
    return
  }
  pending.value = null
  const done = editing.value ? (outcome.recovered ? '已确认门店修改成功' : '门店已更新') : outcome.recovered ? '已确认门店创建成功' : '门店已创建'
  toast.success(done, { description: outcome.result.store.name })
  emit('saved', outcome.result.store.storeCode)
  open.value = false
}

const isVersionConflict = (e: unknown) => e instanceof ApiError && e.httpStatus === 409 && e.code === 'VERSION_CONFLICT'

async function save() {
  submitted.value = true
  if (!canSubmit.value || Object.values(errors.value).some(Boolean)) return
  saving.value = true
  try {
    const input: StoreCommandInput = { ...form }
    const code = props.storeCode
    const expected = version.value
    settle(
      await runCommand({
        scope: scope.value,
        params: code ? { operation: operation.value, storeCode: code } : { operation: operation.value },
        send: (commandId) =>
          code && expected !== null ? api.stores.update(commandId, code, expected, input) : api.stores.create(commandId, input),
        lookup: (cmd) => api.stores.lookupCommand(cmd.commandId, lookupQuery.value),
      }),
    )
  } catch (e) {
    if (editing.value && isVersionConflict(e)) {
      toast.error('门店配置已被他人修改', { description: '已重新读取最新配置，请核对后再保存。' })
      await loadEditView()
      return
    }
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
      await lookupUntilKnown(pending.value, (cmd) => api.stores.lookupCommand(cmd.commandId, lookupQuery.value), {
        attempts: 1,
        intervalMs: 0,
      }),
    )
  } finally {
    saving.value = false
  }
}

function abandon() {
  forgetCommand(scope.value)
  pending.value = null
  emit('saved', null)
  if (editing.value) void loadEditView()
}
</script>

<template>
  <Drawer
    v-model:open="open"
    :title="editing ? '编辑门店' : '新建门店'"
    :description="editing ? '修改门店名称、商户门店编号与启用状态。' : '门店用于区分交易来源，创建支付订单时可指定门店。'"
  >
    <div v-if="pending" role="status" class="mb-4 flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-[13px]">
      <p>
        上一次{{ editing ? '修改' : '创建' }}请求（命令号 <span class="font-mono">{{ pending.commandId }}</span>）结果尚未确认。请先重新查询；确认未生效前不要再次提交。
      </p>
      <div class="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" :loading="saving" @click="recheck">重新查询结果</Button>
        <Button size="sm" variant="ghost" :disabled="saving" @click="abandon">已在门店{{ editing ? '详情' : '列表' }}核实，放弃此请求</Button>
      </div>
    </div>
    <div v-if="loadError" role="alert" class="mb-4 flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-[13px]">
      <p>读取门店配置失败：{{ loadError }}</p>
      <Button size="sm" class="self-start" :loading="loading" @click="loadEditView">重试</Button>
    </div>
    <form id="store-form" class="flex flex-col gap-4" novalidate :aria-busy="loading" @submit.prevent="save">
      <FormField label="门店名称" for="s-name" required :error="err('name')">
        <Input id="s-name" v-model="form.name" placeholder="如：静安嘉里中心店" :disabled="loading" :invalid="!!err('name')" />
      </FormField>
      <FormField label="商户门店编号" for="s-no" required hint="商户系统内的门店唯一编号" :error="err('merchantStoreNo')">
        <Input
          id="s-no"
          v-model="form.merchantStoreNo"
          class="font-mono"
          placeholder="如 SH-JA-001"
          :disabled="loading"
          :invalid="!!err('merchantStoreNo')"
        />
      </FormField>
      <div class="flex items-center justify-between rounded-lg border border-border p-3">
        <div>
          <label for="s-status" class="text-[13px] font-medium">启用门店</label>
          <p class="text-xs text-muted-foreground">停用后该门店无法创建新的支付订单，历史交易不受影响。</p>
        </div>
        <Switch id="s-status" v-model="active" :disabled="loading" />
      </div>
    </form>
    <template #footer>
      <Button @click="open = false">取消</Button>
      <Button variant="primary" type="submit" form="store-form" :loading="saving" :disabled="!canSubmit">
        {{ editing ? '保存修改' : '创建门店' }}
      </Button>
    </template>
  </Drawer>
</template>
