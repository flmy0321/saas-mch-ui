import type { StoreCommandInput, StoreEditView } from '@/types/command'

export const emptyStoreForm = (): StoreCommandInput => ({ name: '', merchantStoreNo: '', status: 'ACTIVE' })

/** 编辑视图转表单；历史门店 merchantStoreNo 为 null 时显示为空，保存前必须补填 */
export function storeFormFromEdit(view: StoreEditView): StoreCommandInput {
  return { name: view.store.name, merchantStoreNo: view.store.merchantStoreNo ?? '', status: view.store.status }
}

export interface StoreFormErrors {
  name: string | null
  merchantStoreNo: string | null
}

export function validateStoreForm(form: StoreCommandInput): StoreFormErrors {
  const no = form.merchantStoreNo.trim()
  return {
    name: !form.name.trim() ? '请输入门店名称' : form.name.length > 30 ? '不超过 30 个字符' : null,
    merchantStoreNo: !no
      ? '请输入商户门店编号'
      : !/^[A-Za-z0-9_-]{2,32}$/.test(no)
        ? '2-32 位字母、数字、下划线或短横线'
        : null,
  }
}

export const storeFormValid = (form: StoreCommandInput) => !Object.values(validateStoreForm(form)).some(Boolean)
