import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAsync } from './useAsync'
import { useAppStore } from '@/stores/app'
import { api } from '@/services/api'
import { APP_ENV } from '@/utils/dictionaries'

/** 开发者中心页面共用的应用选择：选中值同步到 URL ?appId=，默认选中当前环境下的第一个应用 */
export function useAppPicker() {
  const route = useRoute()
  const router = useRouter()
  const appStore = useAppStore()
  const apps = useAsync(() => api.apps.list())

  const options = computed(() =>
    (apps.data.value ?? []).map((a) => ({ value: a.appId, label: `${a.name}（${APP_ENV[a.env].label}）` })),
  )

  const appId = computed<string>({
    get: () => (typeof route.query.appId === 'string' ? route.query.appId : ''),
    set: (v) => router.replace({ query: { ...route.query, appId: v || undefined } }),
  })

  const current = computed(() => apps.data.value?.find((a) => a.appId === appId.value) ?? null)

  watch(
    () => apps.data.value,
    (list) => {
      if (!list?.length || list.some((a) => a.appId === appId.value)) return
      appId.value = (list.find((a) => a.env === appStore.env) ?? list[0]).appId
    },
    { immediate: true },
  )

  return { apps, options, appId, current }
}
