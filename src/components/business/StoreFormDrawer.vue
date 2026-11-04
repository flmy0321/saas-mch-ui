<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import Drawer from '@/components/ui/Drawer.vue'
import Button from '@/components/ui/Button.vue'
import FormField from '@/components/ui/FormField.vue'
import Input from '@/components/ui/Input.vue'
import Switch from '@/components/ui/Switch.vue'
import { api } from '@/services/api'
import type { Store, StoreInput } from '@/types'

const props = defineProps<{ store?: Store | null }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [store: Store] }>()

const empty = (): StoreInput => ({ name: '', merchantStoreNo: '', address: '', contactName: '', contactPhone: '', status: 'ACTIVE' })
const form = reactive<StoreInput>(empty())
const submitted = ref(false)
const saving = ref(false)
const isEdit = computed(() => !!props.store)

watch(open, (v) => {
  if (!v) return
  submitted.value = false
  Object.assign(form, props.store ? { ...props.store } : empty())
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
  address: !form.address.trim() ? '请输入门店地址' : null,
  contactName: !form.contactName.trim() ? '请输入联系人' : null,
  contactPhone: !/^1\d{10}$|^0\d{2,3}-?\d{7,8}$/.test(form.contactPhone) ? '请输入有效的手机号或座机号' : null,
}))
const err = (k: keyof typeof errors.value) => (submitted.value ? errors.value[k] : null)

async function save() {
  submitted.value = true
  if (Object.values(errors.value).some(Boolean)) return
  saving.value = true
  try {
    const payload: StoreInput = { ...form, name: form.name.trim(), address: form.address.trim() }
    const saved = props.store ? await api.stores.update(props.store.id, payload) : await api.stores.create(payload)
    toast.success(isEdit.value ? '门店信息已更新' : '门店已创建', { description: saved.name })
    emit('saved', saved)
    open.value = false
  } catch (e) {
    toast.error('保存失败', { description: e instanceof Error ? e.message : undefined })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Drawer v-model:open="open" :title="isEdit ? '编辑门店' : '新建门店'" description="门店用于区分交易来源，创建支付订单时可指定门店。">
    <form id="store-form" class="flex flex-col gap-4" novalidate @submit.prevent="save">
      <FormField label="门店名称" for="s-name" required :error="err('name')">
        <Input id="s-name" v-model="form.name" placeholder="如：静安嘉里中心店" :invalid="!!err('name')" />
      </FormField>
      <FormField label="商户门店编号" for="s-no" required hint="商户系统内的门店唯一编号" :error="err('merchantStoreNo')">
        <Input id="s-no" v-model="form.merchantStoreNo" class="font-mono" placeholder="如 SH-JA-001" :invalid="!!err('merchantStoreNo')" />
      </FormField>
      <FormField label="门店地址" for="s-addr" required :error="err('address')">
        <Input id="s-addr" v-model="form.address" :invalid="!!err('address')" />
      </FormField>
      <div class="grid gap-4 sm:grid-cols-2">
        <FormField label="联系人" for="s-contact" required :error="err('contactName')">
          <Input id="s-contact" v-model="form.contactName" :invalid="!!err('contactName')" />
        </FormField>
        <FormField label="联系电话" for="s-phone" required :error="err('contactPhone')">
          <Input id="s-phone" v-model="form.contactPhone" inputmode="tel" class="tabular" :invalid="!!err('contactPhone')" />
        </FormField>
      </div>
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
      <Button variant="primary" type="submit" form="store-form" :loading="saving">{{ isEdit ? '保存修改' : '创建门店' }}</Button>
    </template>
  </Drawer>
</template>
